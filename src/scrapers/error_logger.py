"""
Hệ thống Ghi nhận Lỗi Quét Dữ liệu, Chụp Ảnh Hiện trường HTML (Forensic Snapshot),
Hàng đợi Quét Bù Tự động (Dead-Letter Queue - DLQ) & Báo cáo Khắc phục Sự cố (`src/scrapers/error_logger.py`):

Giải quyết triệt để bài toán vận hành thực tế 24/7 trên Ubuntu Docker:
1. Tự động phân loại 6 nhóm lỗi quét dữ liệu:
   - `CLOUDFLARE_WAF_BLOCK`: Bị chặn HTTP 403 / 429 hoặc dính trang xác thực Cloudflare Turnstile.
   - `HTTP_5XX_OR_TIMEOUT`: Máy chủ cổng tuyển dụng quá tải (HTTP 500/502/503/504) hoặc đứt kết nối tạm thời.
   - `SELECTOR_DRIFT_ZERO_LINKS`: Trang danh sách trả về HTTP 200 OK nhưng trích xuất được 0 link việc làm (do web đổi cấu trúc DOM/CSS).
   - `DETAIL_PARSE_INCOMPLETE`: Trang chi tiết trả về HTTP 200 OK nhưng không lấy được tiêu đề hoặc nội dung JD.
   - `HTTP_404_EXPIRED_JOB`: Tin đăng đã bị gỡ hoặc hết hạn (HTTP 404/410).
   - `RUNTIME_EXCEPTION`: Lỗi ngoại lệ bất ngờ trong quá trình bóc tách hoặc lưu trữ.
2. Lưu vết đồng thời vào 3 nơi trên ổ cứng Host:
   - File nhật ký dòng sự kiện: `logs/scraper_errors.jsonl`
   - File chụp HTML hiện trường lỗi: `logs/html_snapshots/<site>_<category>_<hash>.html`
   - Bảng PostgreSQL `scraper_error_logs` & Hàng đợi DLQ `data/silver/scraper_dlq_retry.json`
3. Tự động xuất báo cáo chẩn đoán & hướng dẫn khắc phục tại:
   - `docs/audits/scraper-error-remediation-report.md`
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.db.postgres_repo import PostgresJobRepository


class ScraperErrorLogger:
    """
    Quản lý ghi log lỗi chi tiết, lưu chụp HTML hiện trường, quản lý hàng đợi quét lại (DLQ)
    và sinh báo cáo hướng dẫn khắc phục tự động.
    """

    REMEDIATION_GUIDE: Dict[str, str] = {
        "CLOUDFLARE_WAF_BLOCK": (
            "1) Đảm bảo `engine: playwright_stealth` đang bật trong `configs/scraper_settings.yaml`; "
            "2) Tăng `min_delay_sec` lên 3.5s và `max_delay_sec` lên 7.0s; "
            "3) Chạy lệnh quét bù `python -m src.scrapers.scheduler --mode retry-errors`."
        ),
        "HTTP_5XX_OR_TIMEOUT": (
            "Lỗi kết nối hoặc máy chủ đích quá tải tạm thời. URL đã được đưa vào Hàng đợi DLQ (`PENDING_RETRY`). "
            "Chạy `python -m src.scrapers.scheduler --mode retry-errors` để tự động quét bù."
        ),
        "SELECTOR_DRIFT_ZERO_LINKS": (
            "Cổng tuyển dụng trả về HTTP 200 nhưng 0 link (nghi ngờ đổi cấu trúc CSS/DOM). "
            "Mở file HTML chụp hiện trường trong `logs/html_snapshots/`, đối chiếu thẻ bài đăng mới và "
            "cập nhật `selectors.job_cards` / `selectors.link` trong `configs/scraper_settings.yaml`."
        ),
        "DETAIL_PARSE_INCOMPLETE": (
            "Trang chi tiết việc làm thiếu tiêu đề hoặc mô tả. Bản ghi HTML gốc đã lưu ở Tầng Bronze; "
            "sau khi cập nhật selector chi tiết trong `configs/scraper_settings.yaml`, chạy `process_pending_bronze_jobs` để bóc tách lại mà không cần tải lại từ web."
        ),
        "HTTP_404_EXPIRED_JOB": (
            "Tin tuyển dụng đã đóng hoặc bị xóa trên cổng gốc (HTTP 404/410). Hệ thống tự động đánh dấu `IGNORED`."
        ),
        "RUNTIME_EXCEPTION": (
            "Kiểm tra chi tiết thông báo lỗi trong `logs/scraper_errors.jsonl` và chạy `--mode retry-errors` sau khi xử lý."
        ),
    }

    def __init__(
        self,
        repo: Optional[PostgresJobRepository] = None,
        logs_dir: Path = Path("logs"),
        report_dir: Path = Path("docs/audits"),
    ) -> None:
        self.repo = repo or PostgresJobRepository()
        self.logs_dir = logs_dir
        self.snapshots_dir = logs_dir / "html_snapshots"
        self.report_dir = report_dir
        self.dlq_file = self.repo.silver_dir / "scraper_dlq_retry.json"
        self.jsonl_file = self.logs_dir / "scraper_errors.jsonl"

        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.snapshots_dir.mkdir(parents=True, exist_ok=True)
        self.report_dir.mkdir(parents=True, exist_ok=True)

    @classmethod
    def classify_http_or_parse_error(
        cls,
        http_status: int,
        html_text: str = "",
        stage: str = "SEARCH_LISTING",
        links_count: Optional[int] = None,
        exc_message: str = "",
    ) -> str:
        lower_html = (html_text or "").lower()
        lower_exc = (exc_message or "").lower()

        if (
            http_status in (403, 429)
            or "cf-browser-verification" in lower_html
            or "challenge-platform" in lower_html
            or "just a moment..." in lower_html
            or "attention required! | cloudflare" in lower_html
        ):
            return "CLOUDFLARE_WAF_BLOCK"
        if http_status in (404, 410):
            return "HTTP_404_EXPIRED_JOB"
        if (
            http_status >= 500
            or http_status == 0
            or "timeout" in lower_exc
            or "connect" in lower_exc
        ):
            return "HTTP_5XX_OR_TIMEOUT"
        if stage == "SEARCH_LISTING" and http_status == 200 and links_count == 0:
            return "SELECTOR_DRIFT_ZERO_LINKS"
        if stage == "JOB_DETAIL" and http_status == 200:
            return "DETAIL_PARSE_INCOMPLETE"
        return "RUNTIME_EXCEPTION"

    def log_error(
        self,
        source_site: str,
        target_url: str,
        stage: str,
        error_category: str,
        error_message: str,
        http_status: int = 0,
        html_snippet: str = "",
        run_id: str = "",
        extra_meta: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Ghi nhận một sự cố quét dữ liệu vào:
        1. File chụp HTML hiện trường (`logs/html_snapshots/...`) nếu có HTML.
        2. Nhật ký JSONL trên ổ cứng (`logs/scraper_errors.jsonl`).
        3. Hàng đợi DLQ (`data/silver/scraper_dlq_retry.json`) và bảng PostgreSQL `scraper_error_logs`.
        """
        now_iso = datetime.now().isoformat()
        error_id = str(uuid.uuid4())
        remediation = self.REMEDIATION_GUIDE.get(
            error_category, self.REMEDIATION_GUIDE["RUNTIME_EXCEPTION"]
        )
        retry_status = (
            "IGNORED" if error_category == "HTTP_404_EXPIRED_JOB" else "PENDING_RETRY"
        )

        snapshot_path_str: Optional[str] = None
        if html_snippet:
            url_hash = hashlib.sha256(target_url.encode("utf-8")).hexdigest()[:10]
            snap_file = (
                self.snapshots_dir
                / f"{source_site}_{error_category.lower()}_{url_hash}.html"
            )
            snap_file.write_text(html_snippet[:50000], encoding="utf-8")
            snapshot_path_str = str(snap_file)

        entry: Dict[str, Any] = {
            "error_id": error_id,
            "run_id": run_id,
            "source_site": source_site,
            "stage": stage,
            "error_category": error_category,
            "target_url": target_url,
            "http_status": int(http_status),
            "error_message": error_message,
            "remediation_action": remediation,
            "html_snapshot_path": snapshot_path_str,
            "retry_status": retry_status,
            "retry_count": 0,
            "extra_meta": extra_meta or {},
            "occurred_at": now_iso,
            "resolved_at": None,
        }

        # 1. Ghi nối tiếp (Append) vào `logs/scraper_errors.jsonl` trên ổ cứng
        with open(self.jsonl_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

        # 2. Cập nhật Hàng đợi Dead-Letter Queue (`data/silver/scraper_dlq_retry.json`)
        dlq_items = self.list_dlq_items()
        existing_idx = next(
            (
                i
                for i, item in enumerate(dlq_items)
                if item.get("target_url") == target_url
                and item.get("stage") == stage
            ),
            None,
        )
        if existing_idx is not None:
            prev = dlq_items[existing_idx]
            entry["retry_count"] = int(prev.get("retry_count", 0)) + 1
            dlq_items[existing_idx] = entry
        else:
            dlq_items.insert(0, entry)
        self.dlq_file.write_text(
            json.dumps(dlq_items[:500], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        # 3. Lưu vào bảng PostgreSQL `scraper_error_logs` nếu PostgreSQL đang kết nối
        if self.repo.is_postgres_available():
            try:
                with self.repo.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            INSERT INTO scraper_error_logs (
                                run_id, source_site, stage, error_category, target_url,
                                http_status, error_message, remediation_action,
                                html_snapshot_path, retry_status, retry_count
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                            """,
                            (
                                run_id,
                                source_site,
                                stage,
                                error_category,
                                target_url,
                                int(http_status),
                                error_message,
                                remediation,
                                snapshot_path_str,
                                retry_status,
                                int(entry["retry_count"]),
                            ),
                        )
                    conn.commit()
            except Exception:
                pass

        return entry

    def mark_url_resolved(self, target_url: str) -> bool:
        """Đánh dấu một URL trong hàng đợi lỗi đã được quét bù thành công (`RESOLVED`)."""
        now_iso = datetime.now().isoformat()
        dlq_items = self.list_dlq_items()
        updated = False
        for item in dlq_items:
            if item.get("target_url") == target_url and item.get("retry_status") != "RESOLVED":
                item["retry_status"] = "RESOLVED"
                item["resolved_at"] = now_iso
                updated = True

        if updated:
            self.dlq_file.write_text(
                json.dumps(dlq_items, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

        if self.repo.is_postgres_available():
            try:
                with self.repo.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            UPDATE scraper_error_logs
                            SET retry_status = 'RESOLVED', resolved_at = NOW()
                            WHERE target_url = %s AND retry_status = 'PENDING_RETRY';
                            """,
                            (target_url,),
                        )
                    conn.commit()
            except Exception:
                pass
        return updated

    def list_dlq_items(self, status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        if not self.dlq_file.exists():
            return []
        try:
            items: List[Dict[str, Any]] = json.loads(
                self.dlq_file.read_text(encoding="utf-8")
            )
        except json.JSONDecodeError:
            return []
        if status_filter:
            return [x for x in items if x.get("retry_status") == status_filter]
        return items

    def generate_remediation_report(self) -> Path:
        """
        Tổng hợp toàn bộ lịch sử lỗi quét dữ liệu, phân loại theo cổng & nguyên nhân,
        và xuất báo cáo hướng dẫn khắc phục tại `docs/audits/scraper-error-remediation-report.md`.
        """
        items = self.list_dlq_items()
        pending = [x for x in items if x.get("retry_status") == "PENDING_RETRY"]
        resolved = [x for x in items if x.get("retry_status") == "RESOLVED"]

        by_site: Dict[str, int] = {}
        by_cat: Dict[str, int] = {}
        for x in items:
            s = str(x.get("source_site", "unknown"))
            c = str(x.get("error_category", "UNKNOWN"))
            by_site[s] = by_site.get(s, 0) + 1
            by_cat[c] = by_cat.get(c, 0) + 1

        report_path = self.report_dir / "scraper-error-remediation-report.md"
        lines = [
            "# Báo cáo Chẩn đoán Lỗi Quét Dữ liệu (Scraper Error Logs), Hàng đợi DLQ & Hướng dẫn Khắc phục",
            "",
            f"- **Thời điểm xuất báo cáo:** `{datetime.now().isoformat()}`",
            f"- **File nhật ký sự kiện trên ổ cứng:** `logs/scraper_errors.jsonl`",
            f"- **Hàng đợi Quét bù (Dead-Letter Queue):** `data/silver/scraper_dlq_retry.json`",
            f"- **Tổng số sự cố ghi nhận:** **{len(items)}** | Đang chờ quét bù (`PENDING_RETRY`): **{len(pending)}** | Đã khắc phục (`RESOLVED`): **{len(resolved)}**",
            "",
            "---",
            "",
            "## 1. Thống kê Lỗi theo Cổng Tuyển dụng & Nhóm Nguyên nhân",
            "",
            "| Phân nhóm | Số lượng sự cố | Tỷ trọng |",
            "| :--- | :---: | :---: |",
        ]
        for site, cnt in sorted(by_site.items()):
            pct = round(cnt * 100.0 / len(items), 1) if items else 0.0
            lines.append(f"| Cổng `{site}` | {cnt} | {pct}% |")
        for cat, cnt in sorted(by_cat.items()):
            pct = round(cnt * 100.0 / len(items), 1) if items else 0.0
            lines.append(f"| Nhóm lỗi `{cat}` | {cnt} | {pct}% |")

        lines.extend(
            [
                "",
                "---",
                "",
                "## 2. Chi tiết Các URL Lỗi & Hướng dẫn Khắc phục Cụ thể",
                "",
                "| Cổng | Giai đoạn | Mã Lỗi (`error_category`) | HTTP | URL Mục tiêu | Trạng thái DLQ | Ảnh chụp HTML | Hướng dẫn Khắc phục |",
                "| :---: | :---: | :--- | :---: | :--- | :---: | :--- | :--- |",
            ]
        )

        for item in items[:30]:
            snap = item.get("html_snapshot_path") or "—"
            lines.append(
                f"| `{item.get('source_site')}` | `{item.get('stage')}` | **`{item.get('error_category')}`** "
                f"| `{item.get('http_status')}` | `{item.get('target_url')}` | `{item.get('retry_status')}` "
                f"| `{snap}` | {item.get('remediation_action')} |"
            )

        lines.extend(
            [
                "",
                "---",
                "",
                "## 3. Các Lệnh Khắc phục & Quét Bù Tự động (Self-Healing Commands)",
                "",
                "```bash",
                "# 1. Chạy quét bù toàn bộ các URL đang nằm trong Hàng đợi Lỗi (PENDING_RETRY):",
                "python -m src.scrapers.scheduler --mode retry-errors",
                "",
                "# 2. Trên Ubuntu Docker (gọi trực tiếp vào container GHCR):",
                "docker exec -it skillvalue_scraper_etl python -m src.scrapers.scheduler --mode retry-errors",
                "```",
            ]
        )

        report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return report_path
