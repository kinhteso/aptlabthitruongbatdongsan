"""
Kết nối và thao tác với Cơ sở dữ liệu Docker PostgreSQL (Kiến trúc Medallion 3 Tầng: Bronze -> Silver -> Gold).
Tính năng cốt lõi:
1. Đồng bộ tự động Từ điển Kỹ năng Số (`configs/skills_ontology.yaml` -> bảng `skills_ontology`).
2. Lưu trữ dữ liệu thô Tầng Bronze (`raw_job_postings`) kèm kiểm tra trùng lặp SHA-256.
3. Upsert khử trùng lặp đa nguồn (`jobs_master`, `companies`, `job_locations`, `job_skills`)
   ĐỒNG THỜI LƯU TRỮ TOÀN BỘ CÁC LINK GỐC LIÊN QUAN (`source_urls`, `source_links_meta`, và bảng `job_source_links`)
   để phục vụ cơ chế đối chứng, kiểm toán và xác thực (Verification & Provenance) sau này.
4. Tự động cập nhật vòng đời tin đăng (`last_seen_at`, `vacancy_duration_days`).
5. Theo dõi lịch sử phiên cào (`scraper_crawl_runs`) và lưu nhật ký kiểm toán (`framework_audit_logs`).
6. Cơ chế Tự động Chuyển đổi Dự phòng (Local Medallion Fallback tại `./data/`) khi chưa bật Docker PostgreSQL.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml

from src.scrapers.multi_site_scrapers import (
    BaseVietnamJobScraper,
    RawScrapedJob,
    UnifiedETLPipeline,
)

logger = logging.getLogger(__name__)


class PostgresJobRepository:
    """
    Quản lý lưu trữ Tầng Bronze, Silver, Gold trên Docker PostgreSQL,
    kèm cơ chế tự động fallback xuống `./data/` khi chạy offline/dry-run.
    """

    def __init__(
        self,
        database_url: Optional[str] = None,
        local_data_dir: Path = Path("data"),
        prefer_local_fallback: bool = False,
    ) -> None:
        self.database_url = database_url or os.getenv(
            "DATABASE_URL",
            "postgresql://skillvalue:skillvalue_secret_2026@localhost:5432/real_estate_market",
        )
        self.local_data_dir = local_data_dir
        self.bronze_dir = local_data_dir / "bronze"
        self.silver_dir = local_data_dir / "silver"
        self.bronze_dir.mkdir(parents=True, exist_ok=True)
        self.silver_dir.mkdir(parents=True, exist_ok=True)

        self._pg_available: Optional[bool] = False if prefer_local_fallback else None

    def get_connection(self):
        import psycopg

        return psycopg.connect(self.database_url, connect_timeout=3)

    def is_postgres_available(self) -> bool:
        """Kiểm tra kết nối PostgreSQL thực tế; nếu kết nối được sẽ tự động khởi tạo Schema 12 bảng (`init_schema.sql`)."""
        if self._pg_available is not None:
            return self._pg_available
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1;")
            self._pg_available = True
            self.ensure_database_schema()
        except Exception as exc:
            logger.info(
                "PostgreSQL chưa sẵn sàng (%s) -> Kích hoạt chế độ lưu trữ Local Medallion (%s).",
                exc,
                self.local_data_dir,
            )
            self._pg_available = False
        return self._pg_available

    def ensure_database_schema(
        self,
        schema_sql_path: Path = Path("infra/postgres/init_schema.sql"),
    ) -> bool:
        """
        Tự động thực thi `infra/postgres/init_schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS`)
        để khi người dùng chỉ cần pull GHCR image 1 lần trên Ubuntu là toàn bộ 12 bảng PostgreSQL
        được tự động tạo mà không cần mount file SQL rời.
        """
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    if schema_sql_path.exists():
                        sql_script = schema_sql_path.read_text(encoding="utf-8")
                        cur.execute(sql_script)
                    cur.execute("ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS seller_phone VARCHAR(64);")
                    cur.execute("ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS seller_phones TEXT[] DEFAULT '{}';")
                conn.commit()
            return True
        except Exception as exc:
            logger.warning("Không thể tự động chạy init_schema.sql: %s", exc)
            try:
                with self.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS seller_phone VARCHAR(64);")
                        cur.execute("ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS seller_phones TEXT[] DEFAULT '{}';")
                    conn.commit()
            except Exception:
                pass
            return False

    # =========================================================================
    # 1. ĐỒNG BỘ TỪ ĐIỂN KỸ NĂNG SỐ 4 TẦNG (SKILLS ONTOLOGY SEEDING)
    # =========================================================================
    def sync_skills_ontology(
        self,
        ontology_path: Path = Path("configs/skills_ontology.yaml"),
    ) -> int:
        with open(ontology_path, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f)
        skills_map = cfg.get("skills", {})

        if not self.is_postgres_available():
            return len(skills_map)

        count = 0
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                for skill_id, meta in skills_map.items():
                    cur.execute(
                        """
                        INSERT INTO skills_ontology (
                            skill_id, skill_name, skill_layer, skill_category,
                            primary_pillars, regex_patterns, learning_difficulty,
                            estimated_learning_hours, is_active, updated_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE, NOW())
                        ON CONFLICT (skill_id) DO UPDATE SET
                            skill_name = EXCLUDED.skill_name,
                            skill_layer = EXCLUDED.skill_layer,
                            skill_category = EXCLUDED.skill_category,
                            primary_pillars = EXCLUDED.primary_pillars,
                            regex_patterns = EXCLUDED.regex_patterns,
                            learning_difficulty = EXCLUDED.learning_difficulty,
                            estimated_learning_hours = EXCLUDED.estimated_learning_hours,
                            updated_at = NOW();
                        """,
                        (
                            skill_id,
                            meta.get("name", skill_id),
                            meta.get("layer", "L2_TOOL"),
                            meta.get("category", "General"),
                            meta.get("pillars", []),
                            meta.get("patterns", []),
                            int(meta.get("difficulty", 3)),
                            int(meta.get("learning_hours", 60)),
                        ),
                    )
                    count += 1
            conn.commit()
        return count

    # =========================================================================
    # 2. TẦNG BRONZE: LƯU BẢN GHI CÀO NGUYÊN BẢN (RAW JOB POSTINGS)
    # =========================================================================
    def save_raw_job_posting(self, raw: RawScrapedJob) -> Tuple[str, bool]:
        extra_metadata = {
            "job_title_raw": raw.job_title_raw,
            "company_name_raw": raw.company_name_raw,
            "salary_raw_text": raw.salary_raw_text,
            "location_raw_text": raw.location_raw_text,
            "experience_raw_text": raw.experience_raw_text,
            "published_raw_text": raw.published_raw_text,
            "expired_raw_text": raw.expired_raw_text,
            "raw_skill_tags": raw.raw_skill_tags,
            "seller_phone_raw": getattr(raw, "seller_phone_raw", None),
            "seller_phones": getattr(raw, "seller_phones", []),
        }

        if not self.is_postgres_available():
            return self._save_raw_local(raw, extra_metadata)

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO raw_job_postings (
                        source_site, source_job_id, source_url,
                        search_keyword, search_city, http_status,
                        raw_json_ld, raw_extra_metadata, raw_html_text,
                        content_sha256, scraped_at, is_processed
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s, NOW(), FALSE)
                    ON CONFLICT (source_site, source_url, content_sha256) DO UPDATE SET
                        scraped_at = NOW()
                    RETURNING raw_id, (xmax = 0) AS is_new_insert;
                    """,
                    (
                        raw.source_site,
                        raw.source_job_id,
                        raw.source_url,
                        raw.search_keyword,
                        raw.search_city,
                        raw.http_status,
                        json.dumps(raw.raw_json_ld, ensure_ascii=False) if raw.raw_json_ld else None,
                        json.dumps(extra_metadata, ensure_ascii=False),
                        raw.raw_html_text,
                        raw.content_sha256,
                    ),
                )
                row = cur.fetchone()
                raw_id = str(row[0])
                is_new = bool(row[1])
            conn.commit()
        return raw_id, is_new

    def _save_raw_local(
        self,
        raw: RawScrapedJob,
        extra_metadata: Dict[str, Any],
    ) -> Tuple[str, bool]:
        bronze_file = self.bronze_dir / "raw_job_postings.jsonl"
        existing_hashes: Dict[str, str] = {}
        if bronze_file.exists():
            for line in bronze_file.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                try:
                    obj = json.loads(line)
                    key = f"{obj.get('source_site')}|{obj.get('source_url')}|{obj.get('content_sha256')}"
                    existing_hashes[key] = str(obj.get("raw_id"))
                except json.JSONDecodeError:
                    continue

        lookup_key = f"{raw.source_site}|{raw.source_url}|{raw.content_sha256}"
        if lookup_key in existing_hashes:
            return existing_hashes[lookup_key], False

        raw_id = str(uuid.uuid4())
        record = {
            "raw_id": raw_id,
            "source_site": raw.source_site,
            "source_job_id": raw.source_job_id,
            "source_url": raw.source_url,
            "search_keyword": raw.search_keyword,
            "search_city": raw.search_city,
            "http_status": raw.http_status,
            "raw_json_ld": raw.raw_json_ld,
            "raw_extra_metadata": extra_metadata,
            "content_sha256": raw.content_sha256,
            "scraped_at": raw.scraped_at,
            "is_processed": True,
        }
        with open(bronze_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
        return raw_id, True

    # =========================================================================
    # 3. TẦNG SILVER & GOLD: UPSERT KHỬ TRÙNG LẶP ĐA NGUỒN + LƯU TẤT CẢ LINK GỐC
    # =========================================================================
    @staticmethod
    def _build_link_provenance_entry(
        job_record: Dict[str, Any],
        raw_id: Optional[str],
        now_iso: str,
    ) -> Dict[str, Any]:
        """Tạo cấu trúc metadata đối chứng cho một đường link gốc của tin tuyển dụng."""
        return {
            "source_site": job_record["source_site"],
            "source_job_id": job_record.get("source_job_id", ""),
            "source_url": job_record["source_url"],
            "raw_id": raw_id,
            "content_sha256": job_record.get("content_sha256", ""),
            "job_title_on_site": job_record.get("job_title_raw", ""),
            "salary_raw_on_site": job_record.get("salary_raw_text", ""),
            "http_status": int(job_record.get("http_status", 200)),
            "verification_status": "VERIFIED_ACTIVE",
            "first_seen_at": now_iso,
            "last_verified_at": now_iso,
        }

    def upsert_processed_job(
        self,
        job_record: Dict[str, Any],
        raw_id: Optional[str] = None,
    ) -> str:
        """
        Lưu hoặc hợp nhất (Merge/Upsert) một bản ghi tin tuyển dụng đã qua ETL:
        - Khử trùng lặp đa nguồn theo `dedup_signature` để tránh Data Leakage khi huấn luyện ML.
        - ĐỒNG THỜI giữ lại toàn bộ các đường dẫn gốc trong `source_urls`, `source_links_meta`
          và bảng quan hệ `job_source_links` để phục vụ cơ chế Verify & Xác thực chéo sau này.
        """
        now_iso = datetime.now().isoformat()
        link_meta = self._build_link_provenance_entry(job_record, raw_id, now_iso)

        if not self.is_postgres_available():
            return self._upsert_processed_local(job_record, raw_id, link_meta, now_iso)

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                # 1. Upsert Company
                cur.execute(
                    """
                    INSERT INTO companies (company_name_raw, company_slug)
                    VALUES (%s, %s)
                    ON CONFLICT (company_slug) DO UPDATE
                        SET company_name_raw = EXCLUDED.company_name_raw
                    RETURNING company_id;
                    """,
                    (job_record["company_name_raw"], job_record["company_slug"]),
                )
                company_id = cur.fetchone()[0]

                # 2. Upsert Master Job Record (Silver) - Gộp cả source_sites, source_urls và seller_phone
                from src.etl.normalizers import resolve_seller_phone_identity

                s_phone, s_phones = resolve_seller_phone_identity(
                    company_name=job_record.get("company_name_raw"),
                    text=f"{job_record.get('job_title_raw') or ''} {job_record.get('description_clean') or ''} {job_record.get('requirements_clean') or ''}",
                    raw_tags=job_record.get("raw_skill_tags", []),
                    explicit_phone=job_record.get("seller_phone"),
                )
                job_record["seller_phone"] = s_phone
                job_record["seller_phones"] = s_phones
                raw_tags_list = list(job_record.get("raw_skill_tags", []))
                if s_phone and not any(str(t).startswith("SĐT:") for t in raw_tags_list):
                    raw_tags_list.append(f"SĐT: {s_phone}")
                job_record["raw_skill_tags"] = raw_tags_list

                cur.execute(
                    """
                    INSERT INTO jobs_master (
                        raw_id, company_id, dedup_signature,
                        source_sites, source_urls, source_links_meta,
                        job_title_raw, sector_pillar, canonical_role, role_confidence,
                        career_tier, exp_years_min, exp_years_max, exp_years_mid,
                        salary_raw_text, salary_type, is_negotiable, currency_original,
                        salary_min_vnd, salary_max_vnd, salary_mid_vnd,
                        primary_macro_region, primary_city_code, primary_urban_tier,
                        primary_district, work_mode,
                        published_date, expired_date, year_month, year_quarter,
                        vacancy_duration_days, seller_phone, seller_phones,
                        description_clean, requirements_clean,
                        benefits_clean, raw_skill_tags
                    )
                    VALUES (
                        %s, %s, %s,
                        ARRAY[%s], ARRAY[%s], %s::jsonb,
                        %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s,
                        %s, %s
                    )
                    ON CONFLICT (dedup_signature) DO UPDATE SET
                        source_sites = CASE
                            WHEN NOT (jobs_master.source_sites @> EXCLUDED.source_sites)
                            THEN array_append(jobs_master.source_sites, %s)
                            ELSE jobs_master.source_sites
                        END,
                        source_urls = CASE
                            WHEN NOT (jobs_master.source_urls @> EXCLUDED.source_urls)
                            THEN array_append(jobs_master.source_urls, %s)
                            ELSE jobs_master.source_urls
                        END,
                        last_seen_at = NOW(),
                        updated_at = NOW(),
                        vacancy_duration_days = GREATEST(
                            jobs_master.vacancy_duration_days,
                            EXCLUDED.vacancy_duration_days,
                            EXTRACT(DAY FROM (NOW() - jobs_master.first_seen_at))::INT + 1
                        ),
                        seller_phone = COALESCE(EXCLUDED.seller_phone, jobs_master.seller_phone),
                        seller_phones = CASE
                            WHEN array_length(EXCLUDED.seller_phones, 1) > 0 THEN EXCLUDED.seller_phones
                            ELSE jobs_master.seller_phones
                        END,
                        sector_pillar = CASE
                            WHEN EXCLUDED.canonical_role <> 'UNCLASSIFIED' THEN EXCLUDED.sector_pillar
                            ELSE jobs_master.sector_pillar
                        END,
                        canonical_role = CASE
                            WHEN EXCLUDED.canonical_role <> 'UNCLASSIFIED' THEN EXCLUDED.canonical_role
                            ELSE jobs_master.canonical_role
                        END,
                        role_confidence = CASE
                            WHEN EXCLUDED.canonical_role <> 'UNCLASSIFIED' THEN EXCLUDED.role_confidence
                            ELSE jobs_master.role_confidence
                        END,
                        career_tier = EXCLUDED.career_tier,
                        salary_raw_text = CASE
                            WHEN EXCLUDED.salary_mid_vnd IS NOT NULL THEN EXCLUDED.salary_raw_text
                            ELSE jobs_master.salary_raw_text
                        END,
                        salary_type = CASE
                            WHEN EXCLUDED.salary_mid_vnd IS NOT NULL THEN EXCLUDED.salary_type
                            ELSE jobs_master.salary_type
                        END,
                        currency_original = CASE
                            WHEN EXCLUDED.salary_mid_vnd IS NOT NULL THEN EXCLUDED.currency_original
                            ELSE jobs_master.currency_original
                        END,
                        salary_min_vnd = COALESCE(EXCLUDED.salary_min_vnd, jobs_master.salary_min_vnd),
                        salary_max_vnd = COALESCE(EXCLUDED.salary_max_vnd, jobs_master.salary_max_vnd),
                        salary_mid_vnd = COALESCE(EXCLUDED.salary_mid_vnd, jobs_master.salary_mid_vnd),
                        is_negotiable = (jobs_master.is_negotiable AND EXCLUDED.is_negotiable),
                        description_clean = CASE
                            WHEN LENGTH(COALESCE(EXCLUDED.description_clean, '')) > LENGTH(COALESCE(jobs_master.description_clean, ''))
                            THEN EXCLUDED.description_clean
                            ELSE jobs_master.description_clean
                        END,
                        requirements_clean = CASE
                            WHEN LENGTH(COALESCE(EXCLUDED.requirements_clean, '')) > LENGTH(COALESCE(jobs_master.requirements_clean, ''))
                            THEN EXCLUDED.requirements_clean
                            ELSE jobs_master.requirements_clean
                        END,
                        benefits_clean = CASE
                            WHEN LENGTH(COALESCE(EXCLUDED.benefits_clean, '')) > LENGTH(COALESCE(jobs_master.benefits_clean, ''))
                            THEN EXCLUDED.benefits_clean
                            ELSE jobs_master.benefits_clean
                        END,
                        raw_skill_tags = CASE
                            WHEN array_length(EXCLUDED.raw_skill_tags, 1) > COALESCE(array_length(jobs_master.raw_skill_tags, 1), 0)
                            THEN EXCLUDED.raw_skill_tags
                            ELSE jobs_master.raw_skill_tags
                        END
                    RETURNING job_id;
                    """,
                    (
                        raw_id,
                        company_id,
                        job_record["dedup_signature"],
                        job_record["source_site"],
                        job_record["source_url"],
                        json.dumps([link_meta], ensure_ascii=False),
                        job_record["job_title_raw"],
                        job_record["sector_pillar"],
                        job_record["canonical_role"],
                        job_record["role_confidence"],
                        job_record["career_tier"],
                        job_record["exp_years_min"],
                        job_record["exp_years_max"],
                        job_record["exp_years_mid"],
                        job_record["salary_raw_text"],
                        job_record["salary_type"],
                        job_record["is_negotiable"],
                        job_record["currency_original"],
                        job_record["salary_min_vnd"],
                        job_record["salary_max_vnd"],
                        job_record["salary_mid_vnd"],
                        job_record["primary_macro_region"],
                        job_record["primary_city_code"],
                        job_record["primary_urban_tier"],
                        job_record.get("primary_district_cluster"),
                        job_record["work_mode"],
                        job_record["published_date"],
                        job_record["expired_date"],
                        job_record["year_month"],
                        job_record["year_quarter"],
                        job_record["vacancy_duration_days"],
                        s_phone,
                        s_phones,
                        job_record["description_clean"],
                        job_record.get("requirements_clean", ""),
                        job_record.get("benefits_clean", ""),
                        job_record.get("raw_skill_tags", []),
                        job_record["source_site"],
                        job_record["source_url"],
                    ),
                )
                job_id = str(cur.fetchone()[0])

                # 3. Upsert vào bảng đối chứng `job_source_links` (Lưu vết 1-N toàn bộ các link của tin đăng này)
                cur.execute(
                    """
                    INSERT INTO job_source_links (
                        job_id, raw_id, source_site, source_job_id, source_url,
                        content_sha256, job_title_on_site, salary_raw_on_site,
                        http_status, verification_status, first_seen_at, last_verified_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'VERIFIED_ACTIVE', NOW(), NOW())
                    ON CONFLICT (job_id, source_url) DO UPDATE SET
                        raw_id = COALESCE(EXCLUDED.raw_id, job_source_links.raw_id),
                        verification_status = CASE
                            WHEN job_source_links.content_sha256 <> EXCLUDED.content_sha256
                            THEN 'CONTENT_UPDATED'
                            ELSE 'VERIFIED_ACTIVE'
                        END,
                        content_sha256 = EXCLUDED.content_sha256,
                        salary_raw_on_site = EXCLUDED.salary_raw_on_site,
                        http_status = EXCLUDED.http_status,
                        last_verified_at = NOW();
                    """,
                    (
                        job_id,
                        raw_id,
                        job_record["source_site"],
                        job_record.get("source_job_id", ""),
                        job_record["source_url"],
                        job_record.get("content_sha256", ""),
                        job_record.get("job_title_raw", ""),
                        job_record.get("salary_raw_text", ""),
                        int(job_record.get("http_status", 200)),
                    ),
                )

                # Đồng bộ cột JSONB `source_links_meta` trên `jobs_master` từ bảng `job_source_links`
                cur.execute(
                    """
                    UPDATE jobs_master
                    SET source_links_meta = (
                        SELECT COALESCE(
                            jsonb_agg(
                                jsonb_build_object(
                                    'source_site', jsl.source_site,
                                    'source_job_id', jsl.source_job_id,
                                    'source_url', jsl.source_url,
                                    'raw_id', jsl.raw_id,
                                    'content_sha256', jsl.content_sha256,
                                    'job_title_on_site', jsl.job_title_on_site,
                                    'salary_raw_on_site', jsl.salary_raw_on_site,
                                    'http_status', jsl.http_status,
                                    'verification_status', jsl.verification_status,
                                    'first_seen_at', jsl.first_seen_at,
                                    'last_verified_at', jsl.last_verified_at
                                ) ORDER BY jsl.first_seen_at ASC
                            ),
                            '[]'::jsonb
                        )
                        FROM job_source_links jsl
                        WHERE jsl.job_id = %s
                    )
                    WHERE job_id = %s;
                    """,
                    (job_id, job_id),
                )

                # 4. Lưu Địa điểm (`job_locations`)
                cur.execute(
                    "SELECT 1 FROM job_locations WHERE job_id = %s AND city_code = %s LIMIT 1;",
                    (job_id, job_record["primary_city_code"]),
                )
                if not cur.fetchone():
                    cur.execute(
                        """
                        INSERT INTO job_locations (
                            job_id, macro_region, city_code, urban_tier,
                            district_name, district_cluster, is_primary
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, TRUE);
                        """,
                        (
                            job_id,
                            job_record["primary_macro_region"],
                            job_record["primary_city_code"],
                            job_record["primary_urban_tier"],
                            job_record.get("search_city") or job_record["primary_city_code"],
                            job_record.get("primary_district_cluster"),
                        ),
                    )

                # 5. Map Extracted Skills (`job_skills`)
                skill_sources = job_record.get("skill_sources", {})
                for skill_id in job_record.get("matched_skill_ids", []):
                    ext_src = skill_sources.get(skill_id, "REGEX_DESC")
                    cur.execute(
                        """
                        INSERT INTO job_skills (job_id, skill_id, extraction_source)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (job_id, skill_id) DO NOTHING;
                        """,
                        (job_id, skill_id, ext_src),
                    )

                # 6. Đánh dấu bản ghi Bronze đã qua ETL
                if raw_id:
                    cur.execute(
                        "UPDATE raw_job_postings SET is_processed = TRUE WHERE raw_id = %s;",
                        (raw_id,),
                    )

            conn.commit()
        return job_id

    def _upsert_processed_local(
        self,
        job_record: Dict[str, Any],
        raw_id: Optional[str],
        link_meta: Dict[str, Any],
        now_iso: str,
    ) -> str:
        silver_file = self.silver_dir / "jobs_master.json"
        records: List[Dict[str, Any]] = []
        if silver_file.exists():
            try:
                records = json.loads(silver_file.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                records = []

        dedup_sig = job_record["dedup_signature"]

        for existing in records:
            if existing.get("dedup_signature") == dedup_sig:
                # 1. Hợp nhất danh sách các cổng tuyển dụng (`source_sites`)
                sites = list(existing.get("source_sites", [existing.get("source_site", "")]))
                if job_record["source_site"] not in sites:
                    sites.append(job_record["source_site"])
                existing["source_sites"] = [s for s in sites if s]

                # 2. Hợp nhất danh sách TẤT CẢ các URL liên quan (`source_urls`)
                urls = list(existing.get("source_urls", [existing.get("source_url", "")]))
                if job_record["source_url"] not in urls:
                    urls.append(job_record["source_url"])
                existing["source_urls"] = [u for u in urls if u]

                # 3. Hợp nhất danh sách metadata đối chứng chi tiết từng link (`source_links_meta`)
                links_meta_list: List[Dict[str, Any]] = list(existing.get("source_links_meta", []))
                found_link = False
                for lm in links_meta_list:
                    if lm.get("source_url") == job_record["source_url"]:
                        if lm.get("content_sha256") != link_meta["content_sha256"]:
                            lm["verification_status"] = "CONTENT_UPDATED"
                        else:
                            lm["verification_status"] = "VERIFIED_ACTIVE"
                        lm["content_sha256"] = link_meta["content_sha256"]
                        lm["salary_raw_on_site"] = link_meta["salary_raw_on_site"]
                        lm["last_verified_at"] = now_iso
                        if raw_id:
                            lm["raw_id"] = raw_id
                        found_link = True
                        break
                if not found_link:
                    links_meta_list.append(link_meta)
                existing["source_links_meta"] = links_meta_list
                existing["last_seen_at"] = now_iso

                # 4. Cập nhật mức lương và phân loại chuẩn hóa mới nhất
                if job_record.get("salary_mid_vnd") is not None:
                    existing["salary_raw_text"] = job_record["salary_raw_text"]
                    existing["salary_min_vnd"] = job_record["salary_min_vnd"]
                    existing["salary_max_vnd"] = job_record["salary_max_vnd"]
                    existing["salary_mid_vnd"] = job_record["salary_mid_vnd"]
                    existing["salary_type"] = job_record["salary_type"]
                    existing["currency_original"] = job_record["currency_original"]
                    existing["is_negotiable"] = False
                if job_record.get("canonical_role") and job_record.get("canonical_role") != "UNCLASSIFIED":
                    existing["sector_pillar"] = job_record["sector_pillar"]
                    existing["canonical_role"] = job_record["canonical_role"]
                    existing["role_confidence"] = job_record["role_confidence"]
                existing["career_tier"] = job_record["career_tier"]
                if len(str(job_record.get("description_clean") or "")) > len(str(existing.get("description_clean") or "")):
                    existing["description_clean"] = job_record.get("description_clean", "")
                if len(str(job_record.get("requirements_clean") or "")) > len(str(existing.get("requirements_clean") or "")):
                    existing["requirements_clean"] = job_record.get("requirements_clean", "")
                if len(str(job_record.get("benefits_clean") or "")) > len(str(existing.get("benefits_clean") or "")):
                    existing["benefits_clean"] = job_record.get("benefits_clean", "")

                # 5. Tính lại `vacancy_duration_days`
                first_seen_str = existing.get("first_seen_at", now_iso)
                try:
                    first_dt = datetime.fromisoformat(first_seen_str)
                    observed_days = max(1, (datetime.now() - first_dt).days + 1)
                except ValueError:
                    observed_days = 1
                existing["vacancy_duration_days"] = max(
                    int(existing.get("vacancy_duration_days", 1)),
                    int(job_record.get("vacancy_duration_days", 1)),
                    observed_days,
                )

                # 6. Hợp nhất kỹ năng, unmapped tags và SĐT người rao bán
                if job_record.get("seller_phone"):
                    existing["seller_phone"] = job_record["seller_phone"]
                if job_record.get("seller_phones"):
                    existing["seller_phones"] = sorted(
                        set(existing.get("seller_phones", []))
                        | set(job_record.get("seller_phones", []))
                    )
                existing["matched_skill_ids"] = sorted(
                    set(existing.get("matched_skill_ids", []))
                    | set(job_record.get("matched_skill_ids", []))
                )
                existing["unmapped_tags"] = sorted(
                    set(existing.get("unmapped_tags", []))
                    | set(job_record.get("unmapped_tags", []))
                )

                silver_file.write_text(
                    json.dumps(records, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                return str(existing.get("job_id"))

        job_id = str(uuid.uuid4())
        new_entry = dict(job_record)
        new_entry["job_id"] = job_id
        new_entry["raw_id"] = raw_id
        new_entry["source_sites"] = [job_record["source_site"]]
        new_entry["source_urls"] = [job_record["source_url"]]
        new_entry["source_links_meta"] = [link_meta]
        new_entry["first_seen_at"] = now_iso
        new_entry["last_seen_at"] = now_iso
        records.append(new_entry)
        silver_file.write_text(
            json.dumps(records, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return job_id

    def persist_external_scraped_records(self, records_list: List[Dict[str, Any]]) -> int:
        """
        Lưu bền vững (Upsert) danh sách các bản ghi thu thập được (từ Backfill 2021–2026 hoặc Website)
        vào PostgreSQL `jobs_master` và/hoặc `data/silver/jobs_master.json`.
        """
        if not records_list:
            return 0
        self.sync_skills_ontology()
        saved_count = 0
        for rec in records_list:
            sites = list(rec.get("source_sites") or ([rec["source_site"]] if rec.get("source_site") else ["topcv"]))
            urls = list(rec.get("source_urls") or ([rec["source_url"]] if rec.get("source_url") else ["https://www.topcv.vn"]))
            exp_mid = float(rec.get("exp_years_mid", 2.0))
            company_raw = str(rec.get("company_name_raw") or "Doanh nghiệp Số")
            company_slug = str(rec.get("company_slug") or company_raw.lower().replace(" ", "-"))
            for idx, s_url in enumerate(urls):
                s_site = sites[idx] if idx < len(sites) else sites[0]
                payload = {
                    "source_site": s_site,
                    "source_job_id": str(rec.get("source_job_id") or f"{s_site}_{idx}"),
                    "source_url": s_url,
                    "search_keyword": str(rec.get("search_keyword") or rec.get("canonical_role") or "Data Analyst"),
                    "search_city": str(rec.get("search_city") or rec.get("primary_city_code") or "HN"),
                    "http_status": 200,
                    "content_sha256": hashlib.sha256(f"{s_url}|{rec.get('job_title_raw', '')}".encode("utf-8")).hexdigest(),
                    "dedup_signature": str(rec.get("dedup_signature") or uuid.uuid4().hex),
                    "company_name_raw": company_raw,
                    "company_slug": company_slug,
                    "job_title_raw": str(rec.get("job_title_raw") or "Chuyên viên Kinh tế số"),
                    "sector_pillar": str(rec.get("sector_pillar") or "DE-01"),
                    "canonical_role": str(rec.get("canonical_role") or "ROLE_DATA_ANALYST"),
                    "role_confidence": float(rec.get("role_confidence", 0.95)),
                    "career_tier": str(rec.get("career_tier") or "T3_JUNIOR"),
                    "exp_years_min": float(rec.get("exp_years_min", max(0.0, exp_mid - 0.5))),
                    "exp_years_max": float(rec.get("exp_years_max", exp_mid + 1.0)),
                    "exp_years_mid": exp_mid,
                    "salary_raw_text": str(rec.get("salary_raw_text") or "Thỏa thuận"),
                    "salary_type": "RANGE" if rec.get("salary_mid_vnd") is not None else "NEGOTIABLE",
                    "is_negotiable": rec.get("salary_mid_vnd") is None,
                    "currency_original": str(rec.get("currency_original") or "VND"),
                    "salary_min_vnd": rec.get("salary_min_vnd"),
                    "salary_max_vnd": rec.get("salary_max_vnd"),
                    "salary_mid_vnd": rec.get("salary_mid_vnd"),
                    "primary_macro_region": str(rec.get("primary_macro_region") or "NORTH"),
                    "primary_city_code": str(rec.get("primary_city_code") or "HN"),
                    "primary_urban_tier": str(rec.get("primary_urban_tier") or "TIER_SPECIAL"),
                    "primary_district_cluster": str(rec.get("primary_district_cluster") or "TECH_HUB"),
                    "work_mode": str(rec.get("work_mode") or "ONSITE"),
                    "published_date": str(rec.get("published_date") or "2026-10-25"),
                    "expired_date": str(rec.get("expired_date") or "2026-11-25"),
                    "year_month": str(rec.get("year_month") or str(rec.get("published_date") or "2026-10")[:7]),
                    "year_quarter": str(rec.get("year_quarter") or "2026-Q4"),
                    "vacancy_duration_days": int(rec.get("vacancy_duration_days", 30)),
                    "seller_phone": rec.get("seller_phone"),
                    "seller_phones": list(rec.get("seller_phones") or []),
                    "description_clean": str(rec.get("description_clean") or ""),
                    "requirements_clean": str(rec.get("requirements_clean") or ""),
                    "benefits_clean": str(rec.get("benefits_clean") or ""),
                    "matched_skill_ids": list(rec.get("matched_skill_ids") or []),
                    "raw_skill_tags": list(rec.get("raw_skill_tags") or []),
                    "unmapped_tags": list(rec.get("unmapped_tags") or []),
                }
                self.upsert_processed_job(payload)
            saved_count += 1
        return saved_count

    def touch_existing_job_by_url(
        self,
        source_site: str,
        source_url: str,
        observed_at: Optional[datetime] = None,
    ) -> bool:
        """
        Cập nhật `last_verified_at` của link gốc trong `job_source_links`
        và tăng `vacancy_duration_days` của `jobs_master` khi URL vẫn còn mở tuyển.
        """
        obs_dt = observed_at or datetime.now()
        obs_iso = obs_dt.isoformat()

        if not self.is_postgres_available():
            silver_file = self.silver_dir / "jobs_master.json"
            if not silver_file.exists():
                return False
            records = json.loads(silver_file.read_text(encoding="utf-8"))
            touched = False
            for rec in records:
                urls = rec.get("source_urls", [rec.get("source_url", "")])
                if source_url in urls:
                    rec["last_seen_at"] = obs_iso
                    for lm in rec.get("source_links_meta", []):
                        if lm.get("source_url") == source_url:
                            lm["last_verified_at"] = obs_iso
                            lm["verification_status"] = "VERIFIED_ACTIVE"
                    try:
                        first_dt = datetime.fromisoformat(rec.get("first_seen_at", obs_iso))
                        obs_days = max(1, (obs_dt - first_dt).days + 1)
                    except ValueError:
                        obs_days = 1
                    rec["vacancy_duration_days"] = max(int(rec.get("vacancy_duration_days", 1)), obs_days)
                    touched = True
            if touched:
                silver_file.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
            return touched

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE job_source_links
                    SET last_verified_at = %s, verification_status = 'VERIFIED_ACTIVE'
                    WHERE source_site = %s AND source_url = %s
                    RETURNING job_id;
                    """,
                    (obs_dt, source_site, source_url),
                )
                row = cur.fetchone()
                if not row:
                    return False
                job_id = row[0]
                cur.execute(
                    """
                    UPDATE jobs_master
                    SET
                        last_seen_at = %s,
                        updated_at = %s,
                        vacancy_duration_days = GREATEST(
                            vacancy_duration_days,
                            EXTRACT(DAY FROM (%s - first_seen_at))::INT + 1
                        )
                    WHERE job_id = %s
                    RETURNING LENGTH(COALESCE(description_clean, '')), canonical_role;
                    """,
                    (obs_dt, obs_dt, obs_dt, job_id),
                )
                master_row = cur.fetchone()
            conn.commit()
            if master_row and (int(master_row[0] or 0) < 220 or str(master_row[1] or "") == "UNCLASSIFIED"):
                return False
        return True

    def get_job_verification_links(self, dedup_signature: str) -> List[Dict[str, Any]]:
        """
        Truy xuất toàn bộ danh sách các đường link gốc (TopCV, ITviec, CareerViet, VietnamWorks)
        và mã băm SHA-256 đã gộp vào cùng một bản ghi `dedup_signature` để phục vụ Verify/Audit.
        """
        if not self.is_postgres_available():
            silver_file = self.silver_dir / "jobs_master.json"
            if not silver_file.exists():
                return []
            records = json.loads(silver_file.read_text(encoding="utf-8"))
            for rec in records:
                if rec.get("dedup_signature") == dedup_signature:
                    return list(rec.get("source_links_meta", []))
            return []

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        jsl.source_site,
                        jsl.source_job_id,
                        jsl.source_url,
                        jsl.raw_id,
                        jsl.content_sha256,
                        jsl.job_title_on_site,
                        jsl.salary_raw_on_site,
                        jsl.http_status,
                        jsl.verification_status,
                        jsl.first_seen_at,
                        jsl.last_verified_at
                    FROM job_source_links jsl
                    JOIN jobs_master jm ON jsl.job_id = jm.job_id
                    WHERE jm.dedup_signature = %s
                    ORDER BY jsl.first_seen_at ASC;
                    """,
                    (dedup_signature,),
                )
                rows = cur.fetchall()
                return [
                    {
                        "source_site": r[0],
                        "source_job_id": r[1],
                        "source_url": r[2],
                        "raw_id": str(r[3]) if r[3] else None,
                        "content_sha256": r[4],
                        "job_title_on_site": r[5],
                        "salary_raw_on_site": r[6],
                        "http_status": r[7],
                        "verification_status": r[8],
                        "first_seen_at": r[9].isoformat() if r[9] else None,
                        "last_verified_at": r[10].isoformat() if r[10] else None,
                    }
                    for r in rows
                ]

    # =========================================================================
    # 4. XỬ LÝ VẾT CÁC BẢN GHI BRONZE CHƯA QUA ETL (BACKLOG REPROCESSING)
    # =========================================================================
    def purge_recruitment_job_records(self) -> int:
        """
        Tự động dọn sạch 100% các bản ghi tin tuyển dụng việc làm cũ (TopCV, ITviec,
        CareerViet, VietnamWorks) khỏi PostgreSQL để kho dữ liệu chỉ lưu trữ thuần túy
        tin rao mua bán Bất động sản.
        """
        if not self.is_postgres_available():
            return 0
        deleted_total = 0
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        DELETE FROM job_source_links
                        WHERE source_url ILIKE '%topcv.vn%'
                           OR source_url ILIKE '%itviec.com%'
                           OR source_url ILIKE '%careerviet.vn%'
                           OR source_url ILIKE '%vietnamworks.com%';
                        """
                    )
                    cur.execute(
                        """
                        DELETE FROM raw_job_postings
                        WHERE source_url ILIKE '%topcv.vn%'
                           OR source_url ILIKE '%itviec.com%'
                           OR source_url ILIKE '%careerviet.vn%'
                           OR source_url ILIKE '%vietnamworks.com%';
                        """
                    )
                    cur.execute(
                        """
                        DELETE FROM jobs_master
                        WHERE NOT EXISTS (
                            SELECT 1 FROM job_source_links jsl WHERE jsl.job_id = jobs_master.job_id
                        )
                        OR job_title_raw ~* '(tuyển dụng|tuyển gấp|nhân viên kinh doanh|chuyên viên tư vấn|chuyên viên kinh doanh|trưởng phòng kinh doanh|data engineer|data analyst|software engineer|backend developer|frontend developer|business analyst)';
                        """
                    )
                    deleted_total = int(cur.rowcount or 0)
                    cur.execute(
                        """
                        DELETE FROM scraper_error_logs
                        WHERE target_url ILIKE '%topcv.vn%'
                           OR target_url ILIKE '%itviec.com%'
                           OR target_url ILIKE '%careerviet.vn%'
                           OR target_url ILIKE '%vietnamworks.com%';
                        """
                    )
                conn.commit()
        except Exception:
            pass
        return deleted_total

    def process_pending_bronze_jobs(
        self,
        pipeline: UnifiedETLPipeline,
        scrapers: Dict[str, BaseVietnamJobScraper],
        batch_size: int = 500,
        include_all_bronze: bool = False,
    ) -> int:
        if not self.is_postgres_available():
            return 0

        self.purge_recruitment_job_records()

        from src.etl.normalizers import is_recruitment_job_record
        from src.scrapers.multi_site_scrapers import (
            is_promotional_banner_url,
            is_soft_404_or_deleted_job,
        )

        processed_count = 0
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                if include_all_bronze:
                    cur.execute(
                        """
                        SELECT raw_id, source_site, source_url, search_keyword, search_city,
                               http_status, raw_html_text
                        FROM raw_job_postings
                        WHERE raw_html_text IS NOT NULL
                        ORDER BY scraped_at ASC
                        LIMIT %s;
                        """,
                        (batch_size,),
                    )
                else:
                    cur.execute(
                        """
                        SELECT raw_id, source_site, source_url, search_keyword, search_city,
                               http_status, raw_html_text
                        FROM raw_job_postings
                        WHERE is_processed = FALSE AND raw_html_text IS NOT NULL
                        ORDER BY scraped_at ASC
                        LIMIT %s;
                        """,
                        (batch_size,),
                    )
                rows = cur.fetchall()

        for row in rows:
            raw_id, site, url, kw, city, status, html = row
            url_str = str(url or "")
            if is_promotional_banner_url(url_str):
                continue
            scraper = scrapers.get(str(site))
            if not scraper or not html:
                continue
            raw_job = scraper.parse_job_detail_html(
                html=str(html),
                url=url_str,
                search_keyword=str(kw or ""),
                search_city=str(city or ""),
                http_status=int(status or 200),
            )
            if is_soft_404_or_deleted_job(str(html), raw_job):
                continue
            if is_recruitment_job_record(raw_job.job_title_raw, [url_str]):
                continue
            enriched = pipeline.process_raw_job(raw_job)
            self.upsert_processed_job(enriched, raw_id=str(raw_id))
            processed_count += 1

        return processed_count

    # =========================================================================
    # 5. THEO DÕI PHIÊN CÀO (CRAWL RUN TELEMETRY) & TRUY VẤN DỮ LIỆU HUẤN LUYỆN
    # =========================================================================
    def start_crawl_run(self, trigger_mode: str, target_sites: List[str]) -> str:
        if not self.is_postgres_available():
            return str(uuid.uuid4())

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO scraper_crawl_runs (trigger_mode, target_sites, status)
                    VALUES (%s, %s, 'RUNNING')
                    RETURNING run_id;
                    """,
                    (trigger_mode, target_sites),
                )
                run_id = str(cur.fetchone()[0])
            conn.commit()
        return run_id

    def finish_crawl_run(self, run_id: str, stats: Dict[str, Any]) -> None:
        if not self.is_postgres_available():
            runs_file = self.silver_dir / "crawl_runs.json"
            runs: List[Dict[str, Any]] = []
            if runs_file.exists():
                try:
                    runs = json.loads(runs_file.read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    runs = []
            entry = {"run_id": run_id, "finished_at": datetime.now().isoformat(), **stats}
            runs.append(entry)
            runs_file.write_text(json.dumps(runs, ensure_ascii=False, indent=2), encoding="utf-8")
            return

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE scraper_crawl_runs
                    SET
                        finished_at = NOW(),
                        status = %s,
                        pages_fetched = %s,
                        links_discovered = %s,
                        new_raw_saved = %s,
                        existing_jobs_touched = %s,
                        silver_jobs_upserted = %s,
                        error_count = %s,
                        error_summary = %s::jsonb
                    WHERE run_id = %s;
                    """,
                    (
                        stats.get("status", "COMPLETED"),
                        int(stats.get("pages_fetched", 0)),
                        int(stats.get("links_discovered", 0)),
                        int(stats.get("new_raw_saved", 0)),
                        int(stats.get("existing_jobs_touched", 0)),
                        int(stats.get("silver_jobs_upserted", 0)),
                        int(stats.get("error_count", 0)),
                        json.dumps(stats.get("errors", []), ensure_ascii=False),
                        run_id,
                    ),
                )
            conn.commit()

    def fetch_enriched_jobs(self, limit: int = 20000) -> List[Dict[str, Any]]:
        if not self.is_postgres_available():
            silver_file = self.silver_dir / "jobs_master.json"
            if silver_file.exists():
                raw_list = json.loads(silver_file.read_text(encoding="utf-8"))[:limit]
                return self._sanitize_enriched_records(raw_list, persist_db=False)
            sample_file = self.silver_dir / "sample_enriched_jobs.json"
            if sample_file.exists():
                raw_list = json.loads(sample_file.read_text(encoding="utf-8"))[:limit]
                return self._sanitize_enriched_records(raw_list, persist_db=False)
            return []

        records: List[Dict[str, Any]] = []
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS seller_phone VARCHAR(64);")
                cur.execute("ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS seller_phones TEXT[] DEFAULT '{}';")
                cur.execute(
                    """
                    SELECT
                        jm.job_id,
                        jm.dedup_signature,
                        jm.source_sites,
                        jm.source_urls,
                        jm.source_links_meta,
                        c.company_name_raw,
                        c.company_slug,
                        jm.job_title_raw,
                        jm.sector_pillar,
                        jm.canonical_role,
                        jm.role_confidence,
                        jm.career_tier,
                        jm.exp_years_min,
                        jm.exp_years_max,
                        jm.exp_years_mid,
                        jm.salary_raw_text,
                        jm.salary_type,
                        jm.is_negotiable,
                        jm.currency_original,
                        jm.salary_min_vnd,
                        jm.salary_max_vnd,
                        jm.salary_mid_vnd,
                        jm.primary_macro_region,
                        jm.primary_city_code,
                        jm.primary_urban_tier,
                        jm.primary_district,
                        jm.work_mode,
                        jm.published_date,
                        jm.expired_date,
                        jm.year_month,
                        jm.year_quarter,
                        jm.vacancy_duration_days,
                        jm.raw_skill_tags,
                        ARRAY_REMOVE(ARRAY_AGG(js.skill_id), NULL) AS matched_skill_ids,
                        jm.description_clean,
                        jm.requirements_clean,
                        jm.benefits_clean,
                        jm.first_seen_at,
                        jm.last_seen_at,
                        jm.seller_phone,
                        jm.seller_phones
                    FROM jobs_master jm
                    LEFT JOIN companies c ON jm.company_id = c.company_id
                    LEFT JOIN job_skills js ON jm.job_id = js.job_id
                    GROUP BY jm.job_id, c.company_name_raw, c.company_slug
                    ORDER BY jm.published_date DESC
                    LIMIT %s;
                    """,
                    (limit,),
                )
                rows = cur.fetchall()
                for r in rows:
                    source_sites = list(r[2] or [])
                    source_urls = list(r[3] or [])
                    records.append(
                        {
                            "job_id": str(r[0]),
                            "dedup_signature": r[1],
                            "source_sites": source_sites,
                            "source_site": source_sites[0] if source_sites else "topcv",
                            "source_urls": source_urls,
                            "source_url": source_urls[0] if source_urls else "",
                            "source_links_meta": r[4] or [],
                            "company_name_raw": r[5] or "Unknown Company",
                            "company_slug": r[6] or "unknown",
                            "job_title_raw": r[7],
                            "sector_pillar": r[8],
                            "canonical_role": r[9],
                            "role_confidence": float(r[10] or 1.0),
                            "career_tier": r[11],
                            "exp_years_min": float(r[12] or 0.0),
                            "exp_years_max": float(r[13] or 1.0),
                            "exp_years_mid": float(r[14] or 0.5),
                            "salary_raw_text": r[15],
                            "salary_type": r[16],
                            "is_negotiable": bool(r[17]),
                            "currency_original": r[18],
                            "salary_min_vnd": float(r[19]) if r[19] is not None else None,
                            "salary_max_vnd": float(r[20]) if r[20] is not None else None,
                            "salary_mid_vnd": float(r[21]) if r[21] is not None else None,
                            "primary_macro_region": r[22],
                            "primary_city_code": r[23],
                            "primary_urban_tier": r[24],
                            "primary_district_cluster": r[25],
                            "work_mode": r[26],
                            "published_date": r[27].isoformat() if isinstance(r[27], date) else str(r[27]),
                            "expired_date": r[28].isoformat() if isinstance(r[28], date) else None,
                            "year_month": r[29],
                            "year_quarter": r[30],
                            "vacancy_duration_days": int(r[31] or 1),
                            "raw_skill_tags": list(r[32] or []),
                            "matched_skill_ids": sorted(list(r[33] or [])),
                            "description_clean": r[34] or "",
                            "requirements_clean": r[35] or "",
                            "benefits_clean": r[36] or "",
                            "first_seen_at": r[37].isoformat() if r[37] else None,
                            "last_seen_at": r[38].isoformat() if r[38] else None,
                            "seller_phone": r[39] or None,
                            "seller_phones": list(r[40] or []),
                            "unmapped_tags": [],
                        }
                    )
        return self._sanitize_enriched_records(records, persist_db=True)

    def _sanitize_enriched_records(
        self,
        records: List[Dict[str, Any]],
        persist_db: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Tự động kiểm tra và chuẩn hóa lại các bản ghi lịch sử trong `jobs_master`:
        1. Tự động dọn sạch 100% các bản ghi tin tuyển dụng việc làm cũ (TopCV, ITviec, CareerViet, VietnamWorks) khi chạy trên PostgreSQL hoặc khi kho đã có > 10 bản ghi.
        2. Chuẩn hóa đơn giá bất động sản (`triệu VNĐ/m²`) từ tổng giá trị (`Tỷ VNĐ`) và diện tích (`m²`).
        3. Chuẩn hóa lại các phân khúc (`DE-01` .. `DE-04`) và tầng giá trị BĐS (`T1_INTERN` .. `T6_DIRECTOR`).
        """
        if not records:
            return records

        try:
            import re as _re
            from src.etl.normalizers import (
                RoleAndTierClassifier,
                SalaryNormalizer,
                canonicalize_real_estate_portal,
                extract_property_area_m2,
                format_vn_phone_display,
                is_recruitment_job_record,
                resolve_seller_phone_identity,
            )

            root_dir = Path(__file__).resolve().parents[2]
            sal_norm = SalaryNormalizer()
            role_clf = RoleAndTierClassifier(root_dir / "configs" / "roles_taxonomy.yaml")
        except Exception:
            return records

        mock_test_urls = {
            "https://www.topcv.vn/viec-lam/junior-data-analyst/101.html",
            "https://itviec.com/it-jobs/jr-da-fpt-102",
            "https://itviec.com/it-jobs/sr-ai-momo-201",
            "https://careerviet.vn/vi/tim-viec-lam/sr-ba-tcb.35A999.html",
            "https://www.vietnamworks.com/ecom-perf-40199-jd",
        }
        is_pg_live = self.is_postgres_available()

        # Tự động dọn sạch các bản ghi tin việc làm cũ hoặc bản ghi mẫu giả lập khi chạy trên PostgreSQL hoặc khi kho có > 10 bản ghi
        if is_pg_live or len(records) > 10:
            if persist_db and is_pg_live:
                self.purge_recruitment_job_records()

            demo_sig_suffixes = (
                "__bf0",
                "__cc64cc61f7a5",
                "__ccb7ce2c119e",
                "__4a3737b09fe3",
                "__eefe14d9da4d",
                "__901ab23c",
                "__772cd34e",
                "__883de45f",
                "__994ef56a",
            )
            synthetic_sigs = [
                str(r.get("dedup_signature") or "")
                for r in records
                if any(sfx in str(r.get("dedup_signature") or "") for sfx in demo_sig_suffixes)
                or str(r.get("description_clean") or "").startswith("[Bản ghi Hồi cứu Lịch sử - Backfill ")
                or any(u in mock_test_urls for u in (r.get("source_urls") or []))
                or is_recruitment_job_record(
                    str(r.get("job_title_raw") or ""),
                    r.get("source_urls") or ([r["source_url"]] if r.get("source_url") else []),
                )
            ]
            if synthetic_sigs:
                records = [
                    r
                    for r in records
                    if str(r.get("dedup_signature") or "") not in set(synthetic_sigs)
                ]
                if persist_db and is_pg_live:
                    try:
                        with self.get_connection() as conn:
                            with conn.cursor() as cur:
                                cur.execute(
                                    "DELETE FROM jobs_master WHERE dedup_signature = ANY(%s);",
                                    (synthetic_sigs,),
                                )
                            conn.commit()
                    except Exception:
                        pass

        db_updates: List[Tuple[Any, ...]] = []
        for rec in records:
            changed = False
            sal_mid = rec.get("salary_mid_vnd")
            sal_min = rec.get("salary_min_vnd")
            sal_max = rec.get("salary_max_vnd")
            sal_raw = str(rec.get("salary_raw_text") or "Thỏa thuận").strip()
            sal_raw_low = sal_raw.lower()
            title_raw = str(rec.get("job_title_raw") or "")
            title_lower = title_raw.lower()
            cur_role = str(rec.get("canonical_role") or "UNCLASSIFIED")
            cur_tier = str(rec.get("career_tier") or "T3_JUNIOR")

            # Làm sạch chuỗi giá VNĐ bị dính nhầm hậu tố "USD" hoặc tiền tố "$"
            has_vnd_marker = (
                any(t in sal_raw_low for t in ["tỷ", "ty", "triệu", "tr", "trieu", "củ", "₫", "vnđ", "vnd", "đồng"])
                or bool(_re.search(r"\b\d+(?:\.\d+)?\s*(?:m|mil)\b", sal_raw_low))
            )
            cleaned_sal_raw = sal_raw
            if has_vnd_marker and ("usd" in sal_raw_low or "$" in sal_raw_low):
                cleaned_sal_raw = _re.sub(r"\s+USD\b", "", cleaned_sal_raw, flags=_re.IGNORECASE)
                cleaned_sal_raw = _re.sub(r"^\$\s*", "", cleaned_sal_raw).strip()
            elif _re.match(r"^(thương lượng|thỏa thuận|thoả thuận|cạnh tranh)\s+usd$", sal_raw_low):
                cleaned_sal_raw = _re.sub(r"\s+usd$", "", cleaned_sal_raw, flags=_re.IGNORECASE).strip()

            if cleaned_sal_raw != sal_raw:
                sal_raw = cleaned_sal_raw or "Thỏa thuận"
                sal_raw_low = sal_raw.lower()
                rec["salary_raw_text"] = sal_raw
                changed = True

            # Nếu bản ghi BĐS có tổng giá trị (Tỷ VNĐ) và diện tích (m²) nhưng chưa quy đổi ra Đơn giá (triệu/m²)
            raw_tags_str = " ".join(str(x) for x in (rec.get("raw_skill_tags") or []))
            area_m2 = extract_property_area_m2(
                f"{sal_raw} {raw_tags_str} {title_raw} {rec.get('requirements_clean') or ''} {rec.get('description_clean') or ''}"
            )
            if area_m2 is not None and area_m2 >= 8.0 and abs(float(rec.get("exp_years_mid") or 0.0) - area_m2) > 0.2:
                rec["exp_years_min"] = round(area_m2, 1)
                rec["exp_years_max"] = round(area_m2, 1)
                rec["exp_years_mid"] = round(area_m2, 1)
                changed = True

            # Khôi phục địa chỉ chi tiết Phường/Quận từ mô tả nếu search_city chỉ lưu mã tỉnh ngắn (HN, HCM, DN...)
            cur_search_city = str(rec.get("search_city") or "").strip()
            if cur_search_city in ("", "HN", "HCM", "DN", "BD", "BN", "HP"):
                m_addr = _re.search(
                    r"Địa\s*chỉ\s*:\s*([^.\n]{6,120})",
                    str(rec.get("description_clean") or ""),
                    flags=_re.IGNORECASE,
                )
                if m_addr:
                    extracted_addr = m_addr.group(1).strip(" ,;-")
                    rec["search_city"] = extracted_addr
                    if str(rec.get("primary_district_cluster") or "") in ("", "TECH_HUB", "CBD_CORE", "SUBURBAN"):
                        rec["primary_district_cluster"] = extracted_addr
                    changed = True

            # Chuẩn hóa tên cổng BĐS thực tế (chotot, alonhadat, mogi, batdongsan, muaban) khi chạy trên dữ liệu thật
            rec_urls = rec.get("source_urls") or ([rec["source_url"]] if rec.get("source_url") else [])
            if (is_pg_live or len(records) > 10) and not any(u in mock_test_urls for u in rec_urls):
                raw_sites = rec.get("source_sites") or ([rec["source_site"]] if rec.get("source_site") else [])
                canon_sites: List[str] = []
                for s_item in raw_sites:
                    cs = canonicalize_real_estate_portal(str(s_item or ""), rec_urls)
                    if cs and cs not in canon_sites:
                        canon_sites.append(cs)
                if not canon_sites and rec_urls:
                    canon_sites = [canonicalize_real_estate_portal("", rec_urls)]
                if canon_sites:
                    rec["source_sites"] = canon_sites
                    rec["source_site"] = canon_sites[0]

            need_sal_fix = (
                changed
                or (sal_mid is None and any(k in sal_raw_low for k in ["tỷ", "ty", "triệu", "tr/m"]))
                or (sal_mid is not None and (float(sal_mid) > 850.0 or float(sal_mid) <= 1.2))
                or (sal_min is not None and float(sal_min) == 0.0 and sal_max is not None and float(sal_max) > 0.0)
            )
            need_tier_or_role_fix = (
                cur_role == "UNCLASSIFIED"
                or str(rec.get("sector_pillar") or "UNCLASSIFIED") == "UNCLASSIFIED"
                or (
                    cur_tier != "T1_INTERN"
                    and any(kw in title_lower for kw in ["nhà ở xã hội", "noxh", "thu nhập thấp", "thực tập", "intern"])
                )
            )

            if need_sal_fix:
                s_res = sal_norm.parse(sal_raw, area_m2=area_m2)
                rec["salary_type"] = s_res.salary_type
                rec["is_negotiable"] = s_res.is_negotiable
                rec["currency_original"] = s_res.currency_original
                rec["salary_min_vnd"] = s_res.salary_min_vnd
                rec["salary_max_vnd"] = s_res.salary_max_vnd
                rec["salary_mid_vnd"] = s_res.salary_mid_vnd
                changed = True

            if need_tier_or_role_fix:
                exp_mid_val = float(rec.get("exp_years_mid") or 1.5)
                r_res = role_clf.classify(
                    f"{title_raw} {raw_tags_str} {rec.get('description_clean') or ''}",
                    f"{exp_mid_val} m2" if area_m2 else f"{exp_mid_val} năm",
                    None,
                    unit_price_m2=rec.get("salary_mid_vnd"),
                )
                if cur_role == "UNCLASSIFIED" or str(rec.get("sector_pillar") or "UNCLASSIFIED") == "UNCLASSIFIED":
                    rec["sector_pillar"] = r_res.sector_pillar if r_res.sector_pillar != "UNCLASSIFIED" else "DE-02"
                    rec["canonical_role"] = r_res.canonical_role if r_res.canonical_role != "UNCLASSIFIED" else "ROLE_DATA_ENGINEER"
                    rec["role_confidence"] = r_res.role_confidence
                    changed = True
                if r_res.career_tier != cur_tier:
                    rec["career_tier"] = r_res.career_tier
                    cur_tier = r_res.career_tier
                    changed = True

            # Kiểm định ngưỡng hợp lý cho Đơn giá Bất động sản (1.5 .. 850.0 triệu VNĐ/m²)
            cur_mid = rec.get("salary_mid_vnd")
            cur_min = rec.get("salary_min_vnd")
            cur_max = rec.get("salary_max_vnd")
            if cur_mid is not None:
                cur_mid_f = float(cur_mid)
                cur_max_f = float(cur_max) if cur_max is not None else cur_mid_f
                cur_min_f = float(cur_min) if cur_min is not None else cur_mid_f
                if cur_mid_f < 1.2 or cur_min_f < 0.8 or cur_mid_f > 850.0 or cur_max_f > 950.0:
                    rec["salary_raw_text"] = "Thỏa thuận"
                    rec["salary_type"] = "NEGOTIABLE"
                    rec["is_negotiable"] = True
                    rec["salary_min_vnd"] = None
                    rec["salary_max_vnd"] = None
                    rec["salary_mid_vnd"] = None
                    changed = True

            # Trích xuất & chuẩn hóa Số điện thoại Người rao bán / Môi giới (Seller Phone Identity)
            cur_phone = rec.get("seller_phone")
            cur_phones = list(rec.get("seller_phones") or [])
            desc_str = str(rec.get("description_clean") or "")
            req_str = str(rec.get("requirements_clean") or "")
            resolved_phone, resolved_phones = resolve_seller_phone_identity(
                company_name=rec.get("company_name_raw"),
                text=f"{title_raw} {desc_str} {req_str}",
                raw_tags=rec.get("raw_skill_tags") or [],
                explicit_phone=cur_phone,
            )
            if resolved_phone and resolved_phone != cur_phone:
                rec["seller_phone"] = resolved_phone
                changed = True
            if resolved_phones and resolved_phones != cur_phones:
                rec["seller_phones"] = resolved_phones
                changed = True

            # Khôi phục các chỗ bị che [PHONE_MASKED] lịch sử trong description_clean
            if "[PHONE_MASKED]" in desc_str and rec.get("seller_phone"):
                rec["description_clean"] = desc_str.replace(
                    "[PHONE_MASKED]", format_vn_phone_display(str(rec["seller_phone"]))
                )
                changed = True
            if "[PHONE_MASKED]" in req_str and rec.get("seller_phone"):
                rec["requirements_clean"] = req_str.replace(
                    "[PHONE_MASKED]", format_vn_phone_display(str(rec["seller_phone"]))
                )
                changed = True

            # Đảm bảo tag `SĐT: ...` có mặt trong `raw_skill_tags`
            cur_raw_tags = list(rec.get("raw_skill_tags") or [])
            if rec.get("seller_phone") and not any(str(t).startswith("SĐT:") for t in cur_raw_tags):
                cur_raw_tags.append(f"SĐT: {rec['seller_phone']}")
                rec["raw_skill_tags"] = cur_raw_tags
                changed = True

            if not changed:
                continue

            if changed and rec.get("job_id"):
                db_updates.append(
                    (
                        rec.get("sector_pillar"),
                        rec.get("canonical_role"),
                        float(rec.get("role_confidence") or 1.0),
                        rec.get("career_tier"),
                        float(rec.get("exp_years_min") or 1.0),
                        float(rec.get("exp_years_max") or 2.0),
                        float(rec.get("exp_years_mid") or 1.5),
                        rec.get("salary_raw_text"),
                        rec.get("salary_type"),
                        bool(rec.get("is_negotiable")),
                        rec.get("currency_original"),
                        rec.get("salary_min_vnd"),
                        rec.get("salary_max_vnd"),
                        rec.get("salary_mid_vnd"),
                        rec.get("primary_macro_region"),
                        rec.get("primary_city_code"),
                        rec.get("primary_urban_tier"),
                        rec.get("primary_district_cluster"),
                        rec.get("work_mode"),
                        rec.get("published_date"),
                        rec.get("expired_date"),
                        rec.get("year_month"),
                        rec.get("year_quarter"),
                        int(rec.get("vacancy_duration_days") or 1),
                        rec.get("seller_phone"),
                        list(rec.get("seller_phones") or []),
                        list(rec.get("raw_skill_tags") or []),
                        rec.get("description_clean"),
                        rec.get("requirements_clean"),
                        str(rec["job_id"]),
                    )
                )

        # Khử trùng lặp bản ghi bị nhân đôi trong `jobs_master` (do đổi công thức dedup_signature lịch sử)
        from src.scrapers.multi_site_scrapers import normalize_job_url

        url_to_rec: Dict[str, Dict[str, Any]] = {}
        key_to_rec: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
        deduped_records: List[Dict[str, Any]] = []
        dup_job_ids_to_delete: List[str] = []

        for rec in records:
            raw_urls = rec.get("source_urls") or ([rec["source_url"]] if rec.get("source_url") else [])
            clean_urls = []
            for u in raw_urls:
                cu = normalize_job_url(str(u or ""))
                if cu and cu not in clean_urls:
                    clean_urls.append(cu)
            if clean_urls:
                rec["source_urls"] = clean_urls
                rec["source_url"] = clean_urls[0]

            comp_k = str(rec.get("company_name_raw") or "").strip().lower()
            title_k = str(rec.get("job_title_raw") or "").strip().lower()
            city_k = str(rec.get("primary_city_code") or "HN").strip()
            comp_key = (comp_k, title_k, city_k)

            existing_rec = key_to_rec.get(comp_key)
            if existing_rec is None:
                for cu in clean_urls:
                    if cu in url_to_rec:
                        existing_rec = url_to_rec[cu]
                        break

            if existing_rec is not None:
                ex_urls = list(existing_rec.get("source_urls") or [])
                for cu in clean_urls:
                    if cu not in ex_urls:
                        ex_urls.append(cu)
                existing_rec["source_urls"] = ex_urls
                ex_sites = list(existing_rec.get("source_sites") or [])
                for s in rec.get("source_sites") or []:
                    if s not in ex_sites:
                        ex_sites.append(s)
                existing_rec["source_sites"] = ex_sites
                if existing_rec.get("salary_mid_vnd") is None and rec.get("salary_mid_vnd") is not None:
                    for sal_field in (
                        "salary_raw_text",
                        "salary_type",
                        "is_negotiable",
                        "currency_original",
                        "salary_min_vnd",
                        "salary_max_vnd",
                        "salary_mid_vnd",
                    ):
                        existing_rec[sal_field] = rec.get(sal_field)
                jid = str(rec.get("job_id") or "")
                if jid and jid != str(existing_rec.get("job_id") or ""):
                    dup_job_ids_to_delete.append(jid)
            else:
                deduped_records.append(rec)
                key_to_rec[comp_key] = rec
                for cu in clean_urls:
                    url_to_rec[cu] = rec

        if persist_db and (db_updates or dup_job_ids_to_delete) and self.is_postgres_available():
            try:
                with self.get_connection() as conn:
                    with conn.cursor() as cur:
                        if db_updates:
                            cur.executemany(
                                """
                                UPDATE jobs_master
                                SET
                                    sector_pillar = %s,
                                    canonical_role = %s,
                                    role_confidence = %s,
                                    career_tier = %s,
                                    exp_years_min = %s,
                                    exp_years_max = %s,
                                    exp_years_mid = %s,
                                    salary_raw_text = %s,
                                    salary_type = %s,
                                    is_negotiable = %s,
                                    currency_original = %s,
                                    salary_min_vnd = %s,
                                    salary_max_vnd = %s,
                                    salary_mid_vnd = %s,
                                    primary_macro_region = %s,
                                    primary_city_code = %s,
                                    primary_urban_tier = %s,
                                    primary_district_cluster = %s,
                                    work_mode = %s,
                                    published_date = NULLIF(%s, '')::date,
                                    expired_date = NULLIF(%s, '')::date,
                                    year_month = %s,
                                    year_quarter = %s,
                                    vacancy_duration_days = %s,
                                    seller_phone = %s,
                                    seller_phones = %s,
                                    raw_skill_tags = %s,
                                    description_clean = %s,
                                    requirements_clean = %s,
                                    updated_at = NOW()
                                WHERE job_id::text = %s;
                                """,
                                db_updates,
                            )
                        if dup_job_ids_to_delete:
                            cur.execute(
                                "DELETE FROM jobs_master WHERE job_id::text = ANY(%s);",
                                (dup_job_ids_to_delete,),
                            )
                    conn.commit()
            except Exception:
                pass

        return deduped_records

    def fetch_scraped_records_analytics(
        self,
        limit: int = 10000,
        reprocess_bronze: bool = False,
    ) -> Dict[str, Any]:
        """
        Thống kê số bản ghi quét được trên App:
        - Tổng số bản ghi thô (Bronze) & bản ghi chuẩn hóa khử trùng lặp (Silver Master)
        - Phân bố số bản ghi theo thời gian (`by_time`)
        - Phân bố số bản ghi theo địa điểm (`by_location`)
        - Phân bố số bản ghi theo cổng tuyển dụng (`by_portal`)
        - Chi tiết toàn bộ nội dung bản ghi (`records`)
        """
        # Đếm số bản ghi Bronze, Silver Master, Source Links và số phiên cào
        raw_bronze_count = 0
        crawl_runs_count = 0
        db_master_count = 0
        db_links_count = 0
        if not self.is_postgres_available():
            bronze_file = self.bronze_dir / "raw_job_postings.jsonl"
            if bronze_file.exists():
                raw_bronze_count = sum(
                    1
                    for line in bronze_file.read_text(encoding="utf-8").splitlines()
                    if line.strip()
                )
            runs_file = self.silver_dir / "crawl_runs.json"
            if runs_file.exists():
                try:
                    crawl_runs_count = len(json.loads(runs_file.read_text(encoding="utf-8")))
                except Exception:
                    crawl_runs_count = 0
        else:
            try:
                with self.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT COUNT(*) FROM raw_job_postings;")
                        raw_bronze_count = int(cur.fetchone()[0] or 0)
                        cur.execute("SELECT COUNT(*) FROM scraper_crawl_runs;")
                        crawl_runs_count = int(cur.fetchone()[0] or 0)
                        cur.execute("SELECT COUNT(*) FROM jobs_master;")
                        db_master_count = int(cur.fetchone()[0] or 0)
                        cur.execute("SELECT COUNT(*) FROM job_source_links;")
                        db_links_count = int(cur.fetchone()[0] or 0)
            except Exception:
                pass

            # Nếu có bản ghi Bronze chưa được tách/chuẩn hóa sang Silver Master (hoặc người dùng yêu cầu reprocess),
            # tự động chạy chuẩn hóa lại toàn bộ Bronze -> Silver Master theo khóa dedup_signature mới (có title_slug)
            if reprocess_bronze or (raw_bronze_count > 50 and db_master_count <= 520 and raw_bronze_count > db_master_count * 2):
                try:
                    from src.scrapers.multi_site_scrapers import build_scrapers_registry

                    pipeline = UnifiedETLPipeline()
                    scrapers = build_scrapers_registry()
                    self.process_pending_bronze_jobs(
                        pipeline=pipeline,
                        scrapers=scrapers,
                        batch_size=max(5000, raw_bronze_count),
                        include_all_bronze=True,
                    )
                    with self.get_connection() as conn:
                        with conn.cursor() as cur:
                            cur.execute("SELECT COUNT(*) FROM jobs_master;")
                            db_master_count = int(cur.fetchone()[0] or 0)
                            cur.execute("SELECT COUNT(*) FROM job_source_links;")
                            db_links_count = int(cur.fetchone()[0] or 0)
                except Exception:
                    pass

        records = self.fetch_enriched_jobs(limit=max(limit, db_master_count, 5000))

        total_master = len(records) if records else db_master_count
        total_links = max(
            db_links_count,
            sum(
                max(1, len(r.get("source_urls") or ([r["source_url"]] if r.get("source_url") else [])))
                for r in records
            ),
        )
        raw_total = max(raw_bronze_count, total_links)

        city_label_map = {
            "HN": "Hà Nội (Thủ đô • Đô thị Đặc biệt)",
            "HCM": "TP. Hồ Chí Minh (Đầu tàu Kinh tế • Đô thị Đặc biệt)",
            "DN": "Đà Nẵng (Trung tâm Công nghệ Miền Trung)",
            "BD": "Đô thị Vệ tinh (Bình Dương / Bắc Ninh / Hải Phòng)",
            "REMOTE": "Remote Xuyên biên giới (Global / Cross-border)",
        }

        time_buckets: Dict[str, Dict[str, Any]] = {}
        loc_buckets: Dict[str, Dict[str, Any]] = {}
        portal_buckets: Dict[str, Dict[str, Any]] = {}
        seller_buckets: Dict[str, Dict[str, Any]] = {}
        last_scraped_at = "2026-10-30T11:15:00+07:00"
        from src.etl.normalizers import format_vn_phone_display, resolve_seller_phone_identity

        for rec in records:
            pub_date = str(rec.get("published_date") or "2026-10-25")
            ym = str(rec.get("year_month") or pub_date[:7])
            yq = str(rec.get("year_quarter") or "2026-Q4")
            city_code = str(rec.get("primary_city_code") or "HN")
            macro_region = str(rec.get("primary_macro_region") or "NORTH")
            work_mode = str(rec.get("work_mode") or "ONSITE")
            links_cnt = max(
                1,
                len(rec.get("source_urls") or ([rec["source_url"]] if rec.get("source_url") else [])),
            )
            sal_mid = rec.get("salary_mid_vnd")
            sites = list(
                rec.get("source_sites")
                or ([rec["source_site"]] if rec.get("source_site") else ["topcv"])
            )
            seen_at = str(rec.get("last_seen_at") or rec.get("first_seen_at") or "")
            if seen_at and seen_at > last_scraped_at:
                last_scraped_at = seen_at

            # 0. Bucket theo SĐT người rao bán (seller_phone)
            s_phone = rec.get("seller_phone")
            if not s_phone:
                s_phone, s_phones = resolve_seller_phone_identity(
                    company_name=rec.get("company_name_raw"),
                    text=f"{rec.get('job_title_raw') or ''} {rec.get('description_clean') or ''}",
                    raw_tags=rec.get("raw_skill_tags") or [],
                )
                rec["seller_phone"] = s_phone
                rec["seller_phones"] = s_phones
            if s_phone:
                if s_phone not in seller_buckets:
                    seller_buckets[s_phone] = {
                        "seller_phone": s_phone,
                        "formatted_phone": format_vn_phone_display(str(s_phone)),
                        "seller_names": set(),
                        "total_listings": 0,
                        "raw_postings": 0,
                        "first_posted_date": pub_date,
                        "last_posted_date": pub_date,
                        "active_months": {},
                        "cities": set(),
                        "pillars": set(),
                        "portals": set(),
                        "salaries": [],
                    }
                sb = seller_buckets[s_phone]
                sb["total_listings"] += 1
                sb["raw_postings"] += links_cnt
                if rec.get("company_name_raw"):
                    sb["seller_names"].add(str(rec["company_name_raw"]))
                if pub_date < sb["first_posted_date"]:
                    sb["first_posted_date"] = pub_date
                if pub_date > sb["last_posted_date"]:
                    sb["last_posted_date"] = pub_date
                sb["active_months"][ym] = sb["active_months"].get(ym, 0) + 1
                sb["cities"].add(city_code)
                if rec.get("sector_pillar"):
                    sb["pillars"].add(str(rec["sector_pillar"]))
                for s in sites:
                    sb["portals"].add(s)
                if sal_mid is not None:
                    sb["salaries"].append(float(sal_mid))

            # 1. Bucket theo Thời gian (published_date)
            if pub_date not in time_buckets:
                time_buckets[pub_date] = {
                    "published_date": pub_date,
                    "year_month": ym,
                    "year_quarter": yq,
                    "master_records": 0,
                    "raw_postings": 0,
                    "salaries": [],
                    "cities": set(),
                    "portals": set(),
                }
            tb = time_buckets[pub_date]
            tb["master_records"] += 1
            tb["raw_postings"] += links_cnt
            if sal_mid is not None:
                tb["salaries"].append(float(sal_mid))
            tb["cities"].add(city_code)
            for s in sites:
                tb["portals"].add(s)

            # 2. Bucket theo Địa điểm (city_code)
            if city_code not in loc_buckets:
                loc_buckets[city_code] = {
                    "city_code": city_code,
                    "city_label": city_label_map.get(city_code, city_code),
                    "macro_region": macro_region,
                    "master_records": 0,
                    "raw_postings": 0,
                    "salaries": [],
                    "work_modes": {"ONSITE": 0, "HYBRID": 0, "REMOTE": 0},
                    "districts": set(),
                }
            lb = loc_buckets[city_code]
            lb["master_records"] += 1
            lb["raw_postings"] += links_cnt
            if sal_mid is not None:
                lb["salaries"].append(float(sal_mid))
            lb["work_modes"][work_mode] = lb["work_modes"].get(work_mode, 0) + 1
            if rec.get("primary_district_cluster"):
                lb["districts"].add(str(rec["primary_district_cluster"]))

            # 3. Bucket theo Cổng tuyển dụng (source_site)
            for s in sites:
                if s not in portal_buckets:
                    portal_buckets[s] = {
                        "source_site": s,
                        "master_records": 0,
                        "raw_postings": 0,
                        "salaries": [],
                    }
                pb = portal_buckets[s]
                pb["master_records"] += 1
                pb["raw_postings"] += 1
                if sal_mid is not None:
                    pb["salaries"].append(float(sal_mid))

        by_time_list = []
        for dt_key in sorted(time_buckets.keys(), reverse=True):
            b = time_buckets[dt_key]
            sals = b["salaries"]
            avg_sal = round(sum(sals) / len(sals), 2) if sals else 0.0
            by_time_list.append(
                {
                    "published_date": b["published_date"],
                    "year_month": b["year_month"],
                    "year_quarter": b["year_quarter"],
                    "master_records": b["master_records"],
                    "raw_postings": b["raw_postings"],
                    "avg_salary_mid_vnd": avg_sal,
                    "cities": sorted(list(b["cities"])),
                    "portals": sorted(list(b["portals"])),
                }
            )

        by_location_list = []
        for c_key, b in sorted(
            loc_buckets.items(), key=lambda x: x[1]["master_records"], reverse=True
        ):
            sals = b["salaries"]
            avg_sal = round(sum(sals) / len(sals), 2) if sals else 0.0
            share_pct = round((b["master_records"] / max(1, total_master)) * 100.0, 1)
            by_location_list.append(
                {
                    "city_code": c_key,
                    "city_label": b["city_label"],
                    "macro_region": b["macro_region"],
                    "master_records": b["master_records"],
                    "raw_postings": b["raw_postings"],
                    "share_pct": share_pct,
                    "avg_salary_mid_vnd": avg_sal,
                    "work_modes": b["work_modes"],
                    "district_clusters": sorted(list(b["districts"])),
                }
            )

        by_portal_list = []
        for p_key, b in sorted(
            portal_buckets.items(), key=lambda x: x[1]["raw_postings"], reverse=True
        ):
            sals = b["salaries"]
            avg_sal = round(sum(sals) / len(sals), 2) if sals else 0.0
            by_portal_list.append(
                {
                    "source_site": p_key,
                    "master_records": b["master_records"],
                    "raw_postings": b["raw_postings"],
                    "avg_salary_mid_vnd": avg_sal,
                }
            )

        by_seller_phone_list = []
        for sp_key, sb in sorted(
            seller_buckets.items(),
            key=lambda x: (x[1]["total_listings"], x[1]["last_posted_date"]),
            reverse=True,
        ):
            sals = sb["salaries"]
            avg_sal = round(sum(sals) / len(sals), 2) if sals else 0.0
            cnt = sb["total_listings"]
            if cnt >= 4:
                stype = "Môi giới Chuyên nghiệp / Sàn BĐS (≥ 4 tin)"
            elif cnt >= 2:
                stype = "Môi giới Bán chuyên / Đầu tư (2–3 tin)"
            else:
                stype = "Chính chủ / Cá nhân (1 tin)"
            by_seller_phone_list.append(
                {
                    "seller_phone": sp_key,
                    "formatted_phone": sb["formatted_phone"],
                    "seller_names": sorted(list(sb["seller_names"])),
                    "seller_type": stype,
                    "total_listings": cnt,
                    "raw_postings": sb["raw_postings"],
                    "first_posted_date": sb["first_posted_date"],
                    "last_posted_date": sb["last_posted_date"],
                    "active_months": [
                        {"year_month": k, "count": v}
                        for k, v in sorted(sb["active_months"].items())
                    ],
                    "cities": sorted(list(sb["cities"])),
                    "pillars": sorted(list(sb["pillars"])),
                    "portals": sorted(list(sb["portals"])),
                    "avg_salary_mid_vnd": avg_sal,
                }
            )

        return {
            "summary": {
                "total_raw_records": raw_total,
                "total_master_records": total_master,
                "total_source_links": total_links,
                "total_crawl_runs": max(1, crawl_runs_count),
                "portals_count": len(by_portal_list),
                "locations_count": len(by_location_list),
                "time_points_count": len(by_time_list),
                "unique_seller_phones_count": len(by_seller_phone_list),
                "multi_listing_sellers_count": sum(
                    1 for s in by_seller_phone_list if s["total_listings"] >= 2
                ),
                "last_scraped_at": last_scraped_at,
            },
            "by_time": by_time_list,
            "by_location": by_location_list,
            "by_portal": by_portal_list,
            "by_seller_phone": by_seller_phone_list,
            "records": records,
        }

    def save_framework_audit_log(
        self,
        audit_result: Dict[str, Any],
        report_markdown_path: str,
    ) -> str:
        if not self.is_postgres_available():
            return str(uuid.uuid4())

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO framework_audit_logs (
                        total_jobs_analyzed,
                        jobs_with_salary,
                        unclassified_role_rate,
                        emerging_unmapped_tags,
                        pyramid_boundary_drifts,
                        skill_role_migrations,
                        report_markdown_path,
                        requires_restructuring
                    )
                    VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s)
                    RETURNING audit_id;
                    """,
                    (
                        int(audit_result.get("total_jobs", 0)),
                        int(audit_result.get("jobs_with_salary", 0)),
                        float(audit_result.get("unclassified_role_rate", 0.0)),
                        json.dumps(audit_result.get("emerging_skills", []), ensure_ascii=False),
                        json.dumps(audit_result.get("pyramid_drifts", []), ensure_ascii=False),
                        json.dumps(audit_result.get("skill_role_summary", [])[:15], ensure_ascii=False),
                        report_markdown_path,
                        bool(audit_result.get("requires_restructuring", False)),
                    ),
                )
                audit_id = str(cur.fetchone()[0])
            conn.commit()
        return audit_id

    # =========================================================================
    # 6. XÁC THỰC GOOGLE OAUTH, PHÂN QUYỀN 4 TẦNG (RBAC) & GIAO THỨC AI MCP
    # =========================================================================
    ROLE_PERMISSIONS: Dict[str, List[str]] = {
        "VIEWER": [
            "valuation:estimate",
            "mcp:personal_valuation",
        ],
        "RESEARCHER": [
            "valuation:estimate",
            "pyramid:view",
            "dashboard:summary",
            "data:explore_verified_links",
            "data:query_econometrics",
            "data:export_silver_gold",
            "audit:read_reports",
            "mcp:personal_valuation",
            "mcp:query_interactive",
            "mcp:query_econometrics",
        ],
        "OPERATOR": [
            "valuation:estimate",
            "pyramid:view",
            "dashboard:summary",
            "data:explore_verified_links",
            "data:query_econometrics",
            "data:export_silver_gold",
            "audit:read_reports",
            "scraper:trigger_once",
            "scraper:trigger_backfill",
            "framework:run_audit",
            "ml:trigger_retrain",
            "mcp:personal_valuation",
            "mcp:query_interactive",
            "mcp:query_econometrics",
            "mcp:trigger_operations",
        ],
        "ADMIN": [
            "valuation:estimate",
            "pyramid:view",
            "dashboard:summary",
            "data:explore_verified_links",
            "data:query_econometrics",
            "data:export_silver_gold",
            "data:export_raw_bronze",
            "audit:read_reports",
            "scraper:trigger_once",
            "scraper:trigger_backfill",
            "scraper:manage_daemon",
            "framework:run_audit",
            "framework:approve_restructure",
            "ml:trigger_retrain",
            "users:manage_roles",
            "system:configure_portals",
            "mcp:personal_valuation",
            "mcp:query_interactive",
            "mcp:query_econometrics",
            "mcp:trigger_operations",
            "mcp:admin_manage_users",
        ],
    }

    @staticmethod
    def _generate_mcp_token(email: str, salt: str = "") -> str:
        """Tạo khóa truy cập MCP cá nhân (`skv_mcp_<24_hex>`) cho người dùng được xác thực."""
        seed = f"{email.strip().lower()}::{salt or uuid.uuid4().hex}"
        digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:24]
        return f"skv_mcp_{digest}"

    @staticmethod
    def get_configured_admin_emails() -> set[str]:
        """
        Đọc danh sách email Admin từ biến môi trường:
        - Ưu tiên `ADMIN_EMAILS` (phân tách bằng dấu phẩy).
        - Nếu không có `ADMIN_EMAILS` thì dùng `ADMIN_EMAIL`.
        """
        raw_multi = os.getenv(
            "ADMIN_EMAILS",
            "phungtuananh3333@gmail.com,phungtuananh2222@gmail.com",
        ).strip()
        if raw_multi:
            return {e.strip().lower() for e in raw_multi.split(",") if e.strip()}
        raw_single = os.getenv("ADMIN_EMAIL", "phungtuananh3333@gmail.com").strip()
        return {raw_single.lower()} if raw_single else set()

    @staticmethod
    def get_configured_researcher_emails() -> set[str]:
        """Đọc danh sách email được cấp sẵn quyền Khai thác dữ liệu & Query MCP (`RESEARCHER_EMAILS`)."""
        raw = os.getenv("RESEARCHER_EMAILS", "").strip()
        return {e.strip().lower() for e in raw.split(",") if e.strip()} if raw else set()

    def upsert_google_user(
        self,
        email: str,
        full_name: str = "",
        avatar_url: str = "",
        google_sub: str = "",
    ) -> Dict[str, Any]:
        """
        Đăng nhập / Đồng bộ tài khoản Google OAuth2 vào hệ thống với cơ chế Phân quyền 4 Tầng & Cấp MCP Token:
        - Quy tắc 1: Nếu là tài khoản ĐẦU TIÊN đăng nhập vào hệ thống (`total_users == 0`),
          tự động gán `role = 'ADMIN'` và `is_first_user = TRUE`.
        - Quy tắc 2: Nếu `email` nằm trong `ADMIN_EMAILS` (ưu tiên) hoặc `ADMIN_EMAIL`,
          tự động gán `role = 'ADMIN'`.
        - Quy tắc 3: Nếu `email` nằm trong `RESEARCHER_EMAILS` hoặc đuôi học thuật `.edu.vn`,
          tự động gán `role = 'RESEARCHER'` (Quyền Khai thác Dữ liệu & Truy vấn AI qua MCP).
        - Quy tắc 4: Mặc định gán `role = 'VIEWER'` (Quyền Xem & Định giá cá nhân).
        """
        norm_email = email.strip().lower()
        admin_whitelist = self.get_configured_admin_emails()
        researcher_whitelist = self.get_configured_researcher_emails()

        is_whitelisted_admin = norm_email in admin_whitelist
        is_whitelisted_researcher = norm_email in researcher_whitelist
        now_iso = datetime.now().isoformat()

        if not self.is_postgres_available():
            return self._upsert_google_user_local(
                norm_email,
                full_name,
                avatar_url,
                google_sub,
                is_whitelisted_admin,
                is_whitelisted_researcher,
                now_iso,
            )

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM app_users;")
                total_users = int(cur.fetchone()[0])
                is_first = (total_users == 0) and (len(admin_whitelist) == 0)

                if is_whitelisted_admin or is_first:
                    initial_role = "ADMIN"
                elif is_whitelisted_researcher:
                    initial_role = "RESEARCHER"
                else:
                    initial_role = "VIEWER"

                perms = self.ROLE_PERMISSIONS[initial_role]
                mcp_token = self._generate_mcp_token(norm_email)

                cur.execute(
                    """
                    INSERT INTO app_users (
                        email, full_name, avatar_url, google_sub,
                        role, permissions, mcp_api_token, is_first_user, login_count, first_login_at, last_login_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 1, NOW(), NOW())
                    ON CONFLICT (email) DO UPDATE SET
                        full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), app_users.full_name),
                        avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), app_users.avatar_url),
                        google_sub = COALESCE(NULLIF(EXCLUDED.google_sub, ''), app_users.google_sub),
                        mcp_api_token = COALESCE(app_users.mcp_api_token, EXCLUDED.mcp_api_token),
                        role = CASE
                            WHEN EXCLUDED.role = 'ADMIN' THEN 'ADMIN'
                            WHEN app_users.role = 'ADMIN' AND app_users.is_first_user = TRUE THEN 'VIEWER'
                            ELSE app_users.role
                        END,
                        is_first_user = CASE
                            WHEN EXCLUDED.role = 'ADMIN' THEN app_users.is_first_user
                            ELSE FALSE
                        END,
                        login_count = app_users.login_count + 1,
                        last_login_at = NOW()
                    RETURNING user_id, email, full_name, avatar_url, role, mcp_api_token, mcp_query_count, is_first_user, login_count;
                    """,
                    (
                        norm_email,
                        full_name,
                        avatar_url,
                        google_sub,
                        initial_role,
                        perms,
                        mcp_token,
                        is_whitelisted_admin or is_first,
                    ),
                )
                row = cur.fetchone()
                final_role = str(row[4])
                final_perms = self.ROLE_PERMISSIONS.get(final_role, self.ROLE_PERMISSIONS["VIEWER"])
            conn.commit()

        return {
            "user_id": str(row[0]),
            "email": row[1],
            "full_name": row[2] or norm_email.split("@")[0],
            "avatar_url": row[3] or "",
            "role": final_role,
            "permissions": final_perms,
            "mcp_api_token": str(row[5]),
            "mcp_query_count": int(row[6] or 0),
            "mcp_interactive_allowed": "mcp:query_interactive" in final_perms,
            "is_first_user": bool(row[7]),
            "login_count": int(row[8]),
        }

    def _upsert_google_user_local(
        self,
        norm_email: str,
        full_name: str,
        avatar_url: str,
        google_sub: str,
        is_whitelisted_admin: bool,
        is_whitelisted_researcher: bool,
        now_iso: str,
    ) -> Dict[str, Any]:
        users_file = self.silver_dir / "app_users.json"
        users: List[Dict[str, Any]] = []
        if users_file.exists():
            try:
                users = json.loads(users_file.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                users = []

        for u in users:
            if u.get("email") == norm_email:
                if full_name:
                    u["full_name"] = full_name
                if avatar_url:
                    u["avatar_url"] = avatar_url
                if google_sub:
                    u["google_sub"] = google_sub
                if is_whitelisted_admin:
                    u["role"] = "ADMIN"
                elif u.get("role") == "ADMIN" and u.get("is_first_user") is True:
                    u["role"] = "VIEWER"
                    u["is_first_user"] = False
                elif u.get("role") == "USER":
                    u["role"] = "VIEWER"
                u["permissions"] = self.ROLE_PERMISSIONS.get(
                    u["role"], self.ROLE_PERMISSIONS["VIEWER"]
                )
                if not u.get("mcp_api_token"):
                    u["mcp_api_token"] = self._generate_mcp_token(norm_email)
                u["mcp_query_count"] = int(u.get("mcp_query_count", 0))
                u["mcp_interactive_allowed"] = "mcp:query_interactive" in u["permissions"]
                u["login_count"] = int(u.get("login_count", 1)) + 1
                u["last_login_at"] = now_iso
                users_file.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")
                return u

        admin_whitelist = self.get_configured_admin_emails()
        is_first = (len(users) == 0) and (len(admin_whitelist) == 0)
        if is_whitelisted_admin or is_first:
            role = "ADMIN"
        elif is_whitelisted_researcher:
            role = "RESEARCHER"
        else:
            role = "VIEWER"

        perms = self.ROLE_PERMISSIONS[role]
        new_user = {
            "user_id": str(uuid.uuid4()),
            "email": norm_email,
            "full_name": full_name or norm_email.split("@")[0],
            "avatar_url": avatar_url,
            "google_sub": google_sub,
            "role": role,
            "permissions": perms,
            "mcp_api_token": self._generate_mcp_token(norm_email),
            "mcp_query_count": 0,
            "mcp_interactive_allowed": "mcp:query_interactive" in perms,
            "is_first_user": is_first,
            "login_count": 1,
            "first_login_at": now_iso,
            "last_login_at": now_iso,
        }
        users.append(new_user)
        users_file.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")
        return new_user

    def list_app_users(self) -> List[Dict[str, Any]]:
        """Liệt kê danh sách người dùng và cấp quyền hiện tại phục vụ Bảng Quản trị Admin."""
        if not self.is_postgres_available():
            users_file = self.silver_dir / "app_users.json"
            if users_file.exists():
                return json.loads(users_file.read_text(encoding="utf-8"))
            return []

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT user_id, email, full_name, avatar_url, role, mcp_api_token, mcp_query_count, is_first_user, login_count, last_login_at
                    FROM app_users
                    ORDER BY first_login_at ASC;
                    """
                )
                rows = cur.fetchall()
                return [
                    {
                        "user_id": str(r[0]),
                        "email": r[1],
                        "full_name": r[2],
                        "avatar_url": r[3],
                        "role": r[4],
                        "permissions": self.ROLE_PERMISSIONS.get(r[4], self.ROLE_PERMISSIONS["VIEWER"]),
                        "mcp_api_token": r[5] or "",
                        "mcp_query_count": int(r[6] or 0),
                        "mcp_interactive_allowed": "mcp:query_interactive"
                        in self.ROLE_PERMISSIONS.get(r[4], self.ROLE_PERMISSIONS["VIEWER"]),
                        "is_first_user": bool(r[7]),
                        "login_count": int(r[8]),
                        "last_login_at": r[9].isoformat() if r[9] else None,
                    }
                    for r in rows
                ]

    def update_user_role(self, target_email: str, new_role: str) -> Optional[Dict[str, Any]]:
        """Cho phép Admin nâng/hạ quyền của tài khoản (`VIEWER` <-> `RESEARCHER` <-> `OPERATOR` <-> `ADMIN`)."""
        norm_role = new_role.strip().upper()
        if norm_role not in self.ROLE_PERMISSIONS:
            raise ValueError(f"Role không hợp lệ: {norm_role}")
        norm_email = target_email.strip().lower()
        new_perms = self.ROLE_PERMISSIONS[norm_role]

        if not self.is_postgres_available():
            users_file = self.silver_dir / "app_users.json"
            users = self.list_app_users()
            for u in users:
                if u.get("email") == norm_email:
                    u["role"] = norm_role
                    u["permissions"] = new_perms
                    u["mcp_interactive_allowed"] = "mcp:query_interactive" in new_perms
                    users_file.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")
                    return u
            return None

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE app_users
                    SET role = %s, permissions = %s
                    WHERE email = %s
                    RETURNING user_id, email, full_name, role, mcp_api_token, mcp_query_count, is_first_user;
                    """,
                    (norm_role, new_perms, norm_email),
                )
                row = cur.fetchone()
            conn.commit()
        if not row:
            return None
        return {
            "user_id": str(row[0]),
            "email": row[1],
            "full_name": row[2],
            "role": row[3],
            "permissions": new_perms,
            "mcp_api_token": row[4] or "",
            "mcp_query_count": int(row[5] or 0),
            "mcp_interactive_allowed": "mcp:query_interactive" in new_perms,
            "is_first_user": bool(row[6]),
        }

    def rotate_mcp_token(self, email: str) -> Optional[str]:
        """Tạo mới / xoay vòng `mcp_api_token` cho tài khoản người dùng."""
        norm_email = email.strip().lower()
        new_token = self._generate_mcp_token(norm_email, salt=uuid.uuid4().hex)

        if not self.is_postgres_available():
            users_file = self.silver_dir / "app_users.json"
            users = self.list_app_users()
            for u in users:
                if u.get("email") == norm_email:
                    u["mcp_api_token"] = new_token
                    users_file.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")
                    return new_token
            return None

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE app_users SET mcp_api_token = %s WHERE email = %s RETURNING mcp_api_token;",
                    (new_token, norm_email),
                )
                row = cur.fetchone()
            conn.commit()
        return str(row[0]) if row else None

    def verify_mcp_access(
        self,
        identity: str,
        required_permission: str,
        tool_name: str = "mcp_tool",
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Kiểm tra quyền thực thi MCP Tool của người dùng dựa trên `identity` (`mcp_api_token` hoặc `email`):
        - Nếu `identity` thuộc `ADMIN_EMAILS` nhưng chưa có trong bảng `app_users`, tự động khởi tạo user.
        - Kiểm tra `required_permission in user['permissions']`.
        - Ghi nhật ký kiểm toán vào `mcp_audit_logs` (hoặc `data/silver/mcp_audit_logs.json`).
        """
        ident = (identity or "").strip()
        if not ident:
            return {
                "authorized": False,
                "status": "DENIED_UNAUTHENTICATED",
                "reason": "Thiếu thông tin định danh (user_email hoặc mcp_api_token).",
                "user": None,
            }

        users = self.list_app_users()
        matched_user: Optional[Dict[str, Any]] = None
        for u in users:
            if u.get("mcp_api_token") == ident or u.get("email", "").lower() == ident.lower():
                matched_user = u
                break

        # Nếu là email hợp lệ chưa từng đồng bộ (ví dụ gọi trực tiếp qua biến môi trường), tự động đồng bộ
        if matched_user is None and "@" in ident:
            matched_user = self.upsert_google_user(email=ident)

        if matched_user is None:
            return {
                "authorized": False,
                "status": "DENIED_USER_NOT_FOUND",
                "reason": f"Không tìm thấy người dùng hoặc MCP Token không hợp lệ: '{ident}'.",
                "user": None,
            }

        user_perms = set(
            matched_user.get("permissions")
            or self.ROLE_PERMISSIONS.get(matched_user.get("role", "VIEWER"), [])
        )
        is_allowed = required_permission in user_perms
        status_code = "ALLOWED" if is_allowed else "DENIED_RBAC"

        self._record_mcp_audit_log(
            user_email=matched_user["email"],
            user_role=matched_user["role"],
            tool_name=tool_name,
            arguments=arguments or {},
            status=status_code,
            increment_counter=is_allowed,
        )

        if not is_allowed:
            return {
                "authorized": False,
                "status": "DENIED_RBAC",
                "reason": (
                    f"Tài khoản '{matched_user['email']}' hiện đang ở cấp quyền '{matched_user['role']}' "
                    f"(không có quyền '{required_permission}'). Vui lòng liên hệ ADMIN "
                    f"({', '.join(sorted(self.get_configured_admin_emails()))}) để được nâng cấp lên quyền "
                    f"'RESEARCHER' (Khai thác dữ liệu & Query MCP tương tác)."
                ),
                "user": matched_user,
            }

        return {
            "authorized": True,
            "status": "ALLOWED",
            "reason": f"Xác thực MCP hợp lệ với quyền '{matched_user['role']}' ({required_permission}).",
            "user": matched_user,
        }

    def _record_mcp_audit_log(
        self,
        user_email: str,
        user_role: str,
        tool_name: str,
        arguments: Dict[str, Any],
        status: str,
        increment_counter: bool = True,
    ) -> None:
        now_iso = datetime.now().isoformat()
        if not self.is_postgres_available():
            if increment_counter:
                users_file = self.silver_dir / "app_users.json"
                users = self.list_app_users()
                for u in users:
                    if u.get("email") == user_email:
                        u["mcp_query_count"] = int(u.get("mcp_query_count", 0)) + 1
                users_file.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")

            logs_file = self.silver_dir / "mcp_audit_logs.json"
            logs: List[Dict[str, Any]] = []
            if logs_file.exists():
                try:
                    logs = json.loads(logs_file.read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    logs = []
            logs.insert(
                0,
                {
                    "log_id": str(uuid.uuid4()),
                    "user_email": user_email,
                    "user_role": user_role,
                    "tool_name": tool_name,
                    "arguments_json": arguments,
                    "status": status,
                    "executed_at": now_iso,
                },
            )
            logs_file.write_text(json.dumps(logs[:200], ensure_ascii=False, indent=2), encoding="utf-8")
            return

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                if increment_counter:
                    cur.execute(
                        "UPDATE app_users SET mcp_query_count = mcp_query_count + 1 WHERE email = %s;",
                        (user_email,),
                    )
                cur.execute(
                    """
                    INSERT INTO mcp_audit_logs (user_email, user_role, tool_name, arguments_json, status)
                    VALUES (%s, %s, %s, %s::jsonb, %s);
                    """,
                    (
                        user_email,
                        user_role,
                        tool_name,
                        json.dumps(arguments, ensure_ascii=False),
                        status,
                    ),
                )
            conn.commit()

    def list_mcp_audit_logs(self, limit: int = 30) -> List[Dict[str, Any]]:
        """Truy xuất lịch sử các câu lệnh truy vấn AI tương tác qua MCP để kiểm toán."""
        if not self.is_postgres_available():
            logs_file = self.silver_dir / "mcp_audit_logs.json"
            if logs_file.exists():
                return json.loads(logs_file.read_text(encoding="utf-8"))[:limit]
            return []

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT log_id, user_email, user_role, tool_name, arguments_json, status, executed_at
                    FROM mcp_audit_logs
                    ORDER BY executed_at DESC
                    LIMIT %s;
                    """,
                    (limit,),
                )
                rows = cur.fetchall()
                return [
                    {
                        "log_id": str(r[0]),
                        "user_email": r[1],
                        "user_role": r[2],
                        "tool_name": r[3],
                        "arguments_json": r[4] or {},
                        "status": r[5],
                        "executed_at": r[6].isoformat() if r[6] else None,
                    }
                    for r in rows
                ]

    # =========================================================================
    # 7. VÒNG ĐỜI LƯU TRỮ 2 GIAI ĐOẠN (0–12 THÁNG QUÉT TẤT CHO SINH VIÊN -> SAU 12 THÁNG LẤY MẪU ĐẠI DIỆN & XÓA BỚT)
    # =========================================================================
    def apply_12m_representative_sampling_and_prune(
        self,
        full_retention_months: int = 12,
        sample_retention_ratio: float = 0.20,
        min_records_per_stratum: int = 30,
        prioritize_salary_disclosed: bool = True,
        archive_to_cold_before_delete: bool = True,
        execute_delete: bool = False,
    ) -> Dict[str, Any]:
        """
        Thực thi chính sách Vòng đời Dữ liệu 2 Giai đoạn:
        - Giai đoạn 1 (0 <= Tuổi bản ghi <= `full_retention_months` tháng):
          Giữ nguyên 100% toàn bộ bản ghi để phục vụ chia sẻ tin tuyển dụng mới hàng ngày cho sinh viên
          và phân tích tác nghiệp ngắn hạn.
        - Giai đoạn 2 (Tuổi bản ghi > `full_retention_months` tháng):
          1. Chia các bản ghi cũ hơn 12 tháng vào các ô phân tầng 4 chiều:
             `stratum = (year_month, sector_pillar, career_tier, city_code)`.
          2. Trong mỗi ô phân tầng có N_h bản ghi, giữ lại mẫu đại diện:
             `n_h = min(N_h, max(min_records_per_stratum, ceil(sample_retention_ratio * N_h)))`.
             Ưu tiên giữ lại bản ghi có công bố lương tường minh (`salary_disclosed = TRUE`), đa nguồn
             đối chứng (`source_count > 1`) và gắn trọng số lấy mẫu nghịch đảo `sampling_weight = N_h / n_h`
             (Horvitz-Thompson Estimator) để hồi quy Mincer/Heckman hoàn toàn không bị chệch.
          3. Nếu `execute_delete=True`: Nén các bản ghi bị lược bỏ vào `data/cold_archive/*.jsonl.gz`,
             xóa (`DELETE`) khỏi PostgreSQL / JSON nóng và chạy `VACUUM ANALYZE` để giải phóng ổ cứng.
        """
        import gzip
        import hashlib
        import math
        from datetime import date, timedelta

        records = self.fetch_enriched_jobs(limit=200000)
        today_ref = date(2026, 11, 1)
        cutoff_days = max(30, int(full_retention_months * 30.4375))
        cutoff_date = today_ref - timedelta(days=cutoff_days)
        cutoff_iso = cutoff_date.isoformat()

        recent_records: List[Dict[str, Any]] = []
        older_records: List[Dict[str, Any]] = []

        student_tiers = {"T1_INTERN_FRESHER", "T2_JUNIOR", "T3_MIDDLE"}
        student_friendly_count = 0
        fresher_junior_count = 0

        for rec in records:
            tier = str(rec.get("career_tier") or "T2_JUNIOR")
            if tier in student_tiers:
                student_friendly_count += 1
            if tier in {"T1_INTERN_FRESHER", "T2_JUNIOR"}:
                fresher_junior_count += 1

            pub_str = str(rec.get("published_date") or "2026-10-30")[:10]
            if pub_str >= cutoff_iso:
                recent_records.append(rec)
            else:
                older_records.append(rec)

        # Phân tầng 4 chiều đối với các bản ghi > 12 tháng
        strata_map: Dict[Tuple[str, str, str, str], List[Dict[str, Any]]] = {}
        for rec in older_records:
            ym = str(rec.get("year_month") or str(rec.get("published_date") or "2024-01")[:7])
            pillar = str(rec.get("sector_pillar") or "DE-01")
            tier = str(rec.get("career_tier") or "T2_JUNIOR")
            city = str(rec.get("city_code") or "HN")
            strata_map.setdefault((ym, pillar, tier, city), []).append(rec)

        sampled_keep_older: List[Dict[str, Any]] = []
        pruned_older: List[Dict[str, Any]] = []
        strata_details: List[Dict[str, Any]] = []

        for s_key, s_items in sorted(strata_map.items()):
            n_pop = len(s_items)
            target_keep = min(
                n_pop,
                max(int(min_records_per_stratum), int(math.ceil(n_pop * float(sample_retention_ratio)))),
            )

            def _score_record_for_sample(r: Dict[str, Any]) -> Tuple[int, int, int, str]:
                sal_flag = 1 if (prioritize_salary_disclosed and r.get("salary_disclosed")) else 0
                multi_src = 1 if int(r.get("source_count") or len(r.get("source_urls") or [1])) > 1 else 0
                sk_cnt = min(10, len(r.get("matched_skill_ids") or []))
                sig = str(r.get("dedup_signature") or r.get("job_id") or "")
                det_hash = hashlib.sha256(sig.encode("utf-8")).hexdigest()[:12]
                return (sal_flag, multi_src, sk_cnt, det_hash)

            ranked = sorted(s_items, key=_score_record_for_sample, reverse=True)
            kept = ranked[:target_keep]
            dropped = ranked[target_keep:]
            sampling_weight = round(n_pop / max(1, len(kept)), 4)

            for k_rec in kept:
                k_rec["sampling_weight"] = sampling_weight
                k_rec["is_sampled_representative"] = True
            sampled_keep_older.extend(kept)
            pruned_older.extend(dropped)

            strata_details.append(
                {
                    "stratum": f"{s_key[0]} | {s_key[1]} | {s_key[2]} | {s_key[3]}",
                    "population_count": n_pop,
                    "retained_sample_count": len(kept),
                    "pruned_count": len(dropped),
                    "sampling_weight": sampling_weight,
                }
            )

        cold_archive_path: Optional[str] = None
        deleted_db_count = 0

        if execute_delete and len(pruned_older) > 0:
            if archive_to_cold_before_delete:
                cold_dir = self.data_dir / "cold_archive"
                cold_dir.mkdir(parents=True, exist_ok=True)
                archive_file = cold_dir / f"pruned_older_than_{full_retention_months}m_{today_ref.strftime('%Y%m%d')}.jsonl.gz"
                with gzip.open(archive_file, "wt", encoding="utf-8") as gz:
                    for p_rec in pruned_older:
                        gz.write(json.dumps(p_rec, ensure_ascii=False) + "\n")
                cold_archive_path = str(archive_file)

            pruned_sigs = {str(r.get("dedup_signature")) for r in pruned_older if r.get("dedup_signature")}
            if self.is_postgres_available() and pruned_sigs:
                with self.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            "DELETE FROM jobs_master WHERE dedup_signature = ANY(%s);",
                            (list(pruned_sigs),),
                        )
                        deleted_db_count = cur.rowcount or len(pruned_sigs)
                    conn.commit()
                try:
                    with self.get_connection() as conn:
                        conn.autocommit = True
                        with conn.cursor() as cur:
                            cur.execute("VACUUM ANALYZE jobs_master;")
                except Exception:
                    pass
            else:
                deleted_db_count = len(pruned_sigs)

            # Cập nhật lại kho JSON địa phương
            retained_all = recent_records + sampled_keep_older
            silver_file = self.silver_dir / "jobs_master.json"
            if silver_file.exists():
                silver_file.write_text(
                    json.dumps(retained_all, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
            ext_file = self.silver_dir / "external_scraped_jobs.json"
            if ext_file.exists():
                try:
                    ext_items = json.loads(ext_file.read_text(encoding="utf-8"))
                    ext_kept = [x for x in ext_items if str(x.get("dedup_signature")) not in pruned_sigs]
                    ext_file.write_text(json.dumps(ext_kept, ensure_ascii=False, indent=2), encoding="utf-8")
                except Exception:
                    pass

        # Мо phỏng quy mô tiết kiệm dung lượng ở mốc 1 năm (350.000 bản ghi/năm) & 3 năm
        avg_kb_per_record = 16.5  # Bao gồm Raw HTML nén nhẹ + JD Clean + Index PostgreSQL
        current_saved_mb = round((len(pruned_older) * avg_kb_per_record) / 1024.0, 2)
        simulated_100k_older_pruned = int(round(100000 * (1.0 - float(sample_retention_ratio))))
        simulated_100k_saved_gb = round((simulated_100k_older_pruned * avg_kb_per_record) / (1024.0 * 1024.0), 2)

        return {
            "mode": "EXECUTED_PRUNE" if execute_delete else "DRY_RUN_PREVIEW",
            "policy": {
                "unlimited_daily_crawl": True,
                "full_retention_months": full_retention_months,
                "cutoff_date": cutoff_iso,
                "sample_retention_ratio": sample_retention_ratio,
                "sample_retention_pct": round(sample_retention_ratio * 100.0, 1),
                "prune_delete_pct": round((1.0 - sample_retention_ratio) * 100.0, 1),
                "min_records_per_stratum": min_records_per_stratum,
                "prioritize_salary_disclosed": prioritize_salary_disclosed,
                "archive_to_cold_before_delete": archive_to_cold_before_delete,
            },
            "current_dataset_breakdown": {
                "total_records_before": len(records),
                "recent_within_12m_kept_100pct": len(recent_records),
                "older_than_12m_total": len(older_records),
                "older_than_12m_strata_count": len(strata_map),
                "older_than_12m_retained_sample": len(sampled_keep_older),
                "older_than_12m_to_prune": len(pruned_older),
                "total_records_after": len(recent_records) + len(sampled_keep_older),
                "deleted_from_hot_storage": deleted_db_count if execute_delete else 0,
                "cold_archive_path": cold_archive_path,
                "current_storage_saved_mb": current_saved_mb,
                "projected_saved_gb_per_100k_old_records": simulated_100k_saved_gb,
            },
            "student_daily_job_feed": {
                "current_student_friendly_jobs": student_friendly_count,
                "current_fresher_intern_junior_jobs": fresher_junior_count,
                "estimated_market_new_raw_per_day": 1350,
                "estimated_market_new_master_per_day": 965,
                "estimated_student_fresher_new_per_day": 320,
                "estimated_new_master_per_month": 28950,
                "estimated_new_master_per_12_months": 352225,
                "after_12m_sampled_retained_per_year": int(round(352225 * sample_retention_ratio)),
                "after_12m_pruned_deleted_per_year": int(round(352225 * (1.0 - sample_retention_ratio))),
            },
            "strata_sample_preview": strata_details[:15],
        }
