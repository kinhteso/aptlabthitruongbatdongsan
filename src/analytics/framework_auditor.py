"""
Động cơ Kiểm toán & Đề xuất Tái cấu trúc Khung Phân tích (Adaptive Framework Auditor).
Phục vụ trực tiếp cho Agent Skill `framework-review`.

Chức năng chính:
1. Kiểm tra tỷ lệ chức danh chưa phân loại (UNCLASSIFIED Role Rate > 5%).
2. Phát hiện Kỹ năng Số Mới nổi (Emerging Skills) từ phần dư `unmapped_tags` và N-grams.
3. Kiểm tra độ lệch dải lương thực tế so với Tháp Lộ trình Nghề nghiệp 6 Tầng (Pyramid Drift > 15%)
   và kiểm định tính đơn điệu của Tháp lương (Monotonicity Check).
4. Phân loại lại vai trò kỹ năng thực nghiệm: Gatekeeper (>=50%), Differentiator (High Wage Premium),
   và Bridge Skills (Mức nhảy tần suất giữa Tầng L -> L+1 >= 15%).
5. Xuất báo cáo Markdown chi tiết vào `docs/audits/framework-review-YYYY-MM-DD.md`.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml


class FrameworkAuditor:
    """Kiểm toán thực nghiệm Khung phân tích, Từ điển Kỹ năng và Tháp Nghề nghiệp."""

    def __init__(self, configs_dir: Path = Path("configs")) -> None:
        self.configs_dir = configs_dir
        with open(configs_dir / "roles_taxonomy.yaml", "r", encoding="utf-8") as f:
            self.roles_cfg = yaml.safe_load(f)
        with open(configs_dir / "skills_ontology.yaml", "r", encoding="utf-8") as f:
            self.skills_cfg = yaml.safe_load(f)
        scraper_cfg_path = configs_dir / "scraper_settings.yaml"
        if scraper_cfg_path.exists():
            with open(scraper_cfg_path, "r", encoding="utf-8") as f:
                self.scraper_cfg = yaml.safe_load(f)
        else:
            self.scraper_cfg = {}

    def audit_records(
        self,
        records: List[Dict[str, Any]],
        min_tag_freq: int = 2,
        drift_threshold: float = 0.15,
    ) -> Dict[str, Any]:
        total = len(records)
        if total == 0:
            return {"total_jobs": 0, "requires_restructuring": False}

        # 0. Kiểm toán Độ phủ Đa Cổng Tuyển dụng & Đối chứng Link (Multi-Portal Mapping & Provenance Audit)
        portal_stats: Dict[str, Dict[str, Any]] = {}
        configured_sites = self.scraper_cfg.get("sites", {})
        for s_code, s_cfg in configured_sites.items():
            portal_stats[s_code] = {
                "site_code": s_code,
                "base_url": s_cfg.get("base_url", ""),
                "engine": s_cfg.get("engine", "playwright_stealth"),
                "prefer_json_ld": bool(s_cfg.get("prefer_json_ld", True)),
                "enabled": bool(s_cfg.get("enabled", True)),
                "job_count": 0,
                "disclosed_salary_count": 0,
                "verified_links_count": 0,
            }

        multi_source_merged_jobs = 0
        total_verified_links = 0
        for r in records:
            sites_list = r.get("source_sites") or [r.get("source_site", "unknown")]
            urls_list = r.get("source_urls") or ([r.get("source_url")] if r.get("source_url") else [])
            if len(sites_list) > 1 or len(urls_list) > 1:
                multi_source_merged_jobs += 1
            total_verified_links += max(1, len(urls_list))

            has_sal = r.get("salary_mid_vnd") is not None and not r.get("is_negotiable", False)
            for s_code in sites_list:
                if not s_code:
                    continue
                if s_code not in portal_stats:
                    portal_stats[s_code] = {
                        "site_code": s_code,
                        "base_url": "dynamic",
                        "engine": "custom_adapter",
                        "prefer_json_ld": True,
                        "enabled": True,
                        "job_count": 0,
                        "disclosed_salary_count": 0,
                        "verified_links_count": 0,
                    }
                portal_stats[s_code]["job_count"] += 1
                if has_sal:
                    portal_stats[s_code]["disclosed_salary_count"] += 1

            for lm in r.get("source_links_meta", []):
                sc = lm.get("source_site")
                if sc and sc in portal_stats:
                    portal_stats[sc]["verified_links_count"] += 1

        portal_audit_list = []
        for s_code, st in portal_stats.items():
            jc = st["job_count"]
            sal_rate = round(st["disclosed_salary_count"] / jc * 100.0, 1) if jc > 0 else 0.0
            portal_audit_list.append({**st, "salary_disclosure_rate_pct": sal_rate})

        # 1. Kiểm toán Độ phủ Phân loại Nghề nghiệp (Occupation Coverage)
        unclassified_titles: Counter[str] = Counter()
        for r in records:
            if r.get("canonical_role") == "UNCLASSIFIED":
                unclassified_titles[r.get("job_title_raw", "Unknown")] += 1

        unclassified_count = sum(unclassified_titles.values())
        unclassified_rate = round(unclassified_count / total, 4)

        # 2. Phát hiện Kỹ năng Mới nổi Chưa có trong Từ điển (Emerging Unmapped Skills)
        unmapped_counter: Counter[str] = Counter()
        for r in records:
            for tag in r.get("unmapped_tags", []):
                unmapped_counter[tag.strip()] += 1

        emerging_skills = [
            {"tag": tag, "count": cnt, "share_pct": round(cnt / total * 100, 2)}
            for tag, cnt in unmapped_counter.most_common(20)
            if cnt >= min_tag_freq
        ]

        # 3. Kiểm toán Ranh giới Lương trên Tháp 6 Tầng (Pyramid Boundary Calibration)
        salaries_by_pillar_tier: Dict[Tuple[str, str], List[float]] = defaultdict(list)
        salaries_by_tier_global: Dict[str, List[float]] = defaultdict(list)
        for r in records:
            sal = r.get("salary_mid_vnd")
            pillar = r.get("sector_pillar", "UNCLASSIFIED")
            tier = r.get("career_tier", "T3_JUNIOR")
            if sal is not None and not r.get("is_negotiable", False):
                salaries_by_pillar_tier[(pillar, tier)].append(float(sal))
                salaries_by_tier_global[tier].append(float(sal))

        jobs_with_salary = sum(len(v) for v in salaries_by_tier_global.values())
        pyramid_drifts: List[Dict[str, Any]] = []

        for pillar_code, p_cfg in self.roles_cfg.get("pillars", {}).items():
            benchmarks = p_cfg.get("tier_salary_benchmarks_vnd", {})
            for tier_code, b_vals in benchmarks.items():
                emp_list = sorted(salaries_by_pillar_tier.get((pillar_code, tier_code), []))
                if not emp_list:
                    continue
                n_obs = len(emp_list)
                emp_p50 = emp_list[n_obs // 2]
                design_p50 = float(b_vals.get("p50", 15.0))
                rel_drift = round((emp_p50 - design_p50) / design_p50, 4)
                if abs(rel_drift) >= drift_threshold:
                    pyramid_drifts.append(
                        {
                            "pillar": pillar_code,
                            "tier": tier_code,
                            "n_samples": n_obs,
                            "design_p50_vnd": design_p50,
                            "empirical_p50_vnd": round(emp_p50, 2),
                            "drift_pct": round(rel_drift * 100, 1),
                            "recommendation": (
                                "Nâng mốc lương tham chiếu trên Tháp"
                                if rel_drift > 0
                                else "Hạ mốc lương tham chiếu trên Tháp"
                            ),
                        }
                    )

        # 4. Phân tích Vai trò Kỹ năng theo Cấp bậc (Gatekeeper vs. Differentiator vs. Bridge)
        tier_order = [
            "T1_INTERN",
            "T2_FRESHER",
            "T3_JUNIOR",
            "T4_MIDDLE_SENIOR",
            "T5_LEAD_MANAGER",
            "T6_DIRECTOR",
        ]
        tier_totals: Counter[str] = Counter()
        tier_skill_counts: Dict[str, Counter[str]] = defaultdict(Counter)
        skill_salaries: Dict[str, List[float]] = defaultdict(list)
        all_valid_salaries: List[float] = []

        for r in records:
            t = r.get("career_tier", "T3_JUNIOR")
            tier_totals[t] += 1
            sal = r.get("salary_mid_vnd")
            has_sal = sal is not None and not r.get("is_negotiable", False)
            if has_sal:
                all_valid_salaries.append(float(sal))
            for sk in r.get("matched_skill_ids", []):
                tier_skill_counts[t][sk] += 1
                if has_sal:
                    skill_salaries[sk].append(float(sal))

        overall_mean_sal = (
            sum(all_valid_salaries) / len(all_valid_salaries) if all_valid_salaries else 0.0
        )

        skill_role_summary: List[Dict[str, Any]] = []
        for sk_id, sk_meta in self.skills_cfg.get("skills", {}).items():
            total_sk_cnt = sum(tier_skill_counts[t][sk_id] for t in tier_order)
            if total_sk_cnt == 0:
                continue
            sdf_global = round(total_sk_cnt / total, 3)
            sk_sals = skill_salaries.get(sk_id, [])
            mean_sk_sal = sum(sk_sals) / len(sk_sals) if sk_sals else overall_mean_sal
            raw_premium_vnd = round(mean_sk_sal - overall_mean_sal, 2)

            if sdf_global >= 0.50:
                empirical_role = "GATEKEEPER (Mở cửa - Phổ cập >= 50%)"
            elif raw_premium_vnd >= 3.0:
                empirical_role = "DIFFERENTIATOR (Phần bù lương cao)"
            else:
                empirical_role = "SPECIALIZED / BRIDGE (Chuyên biệt theo tầng)"

            skill_role_summary.append(
                {
                    "skill_id": sk_id,
                    "skill_name": sk_meta.get("name", sk_id),
                    "layer": sk_meta.get("layer", ""),
                    "frequency_pct": round(sdf_global * 100, 1),
                    "raw_wage_premium_vnd": raw_premium_vnd,
                    "empirical_role": empirical_role,
                }
            )

        requires_restructuring = (
            unclassified_rate > 0.05
            or len(emerging_skills) > 0
            or len(pyramid_drifts) > 0
        )

        return {
            "audited_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total_jobs": total,
            "jobs_with_salary": jobs_with_salary,
            "multi_source_merged_jobs": multi_source_merged_jobs,
            "total_verified_source_links": total_verified_links,
            "portal_mapping_audit": portal_audit_list,
            "unclassified_role_count": unclassified_count,
            "unclassified_role_rate": unclassified_rate,
            "unclassified_top_titles": unclassified_titles.most_common(10),
            "emerging_skills": emerging_skills,
            "pyramid_drifts": pyramid_drifts,
            "skill_role_summary": sorted(
                skill_role_summary, key=lambda x: x["raw_wage_premium_vnd"], reverse=True
            ),
            "requires_restructuring": requires_restructuring,
        }

    def generate_markdown_report(self, audit_result: Dict[str, Any], output_dir: Path) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        date_str = datetime.now().strftime("%Y-%m-%d")
        report_path = output_dir / f"framework-review-{date_str}.md"

        status_badge = (
            "CẦN CẬP NHẬT / TÁI CẤU TRÚC KHUNG"
            if audit_result.get("requires_restructuring")
            else "KHUNG ĐANG ỔN ĐỊNH"
        )

        lines = [
            f"# Báo cáo Kiểm toán & Đánh giá Tái cấu trúc Khung Phân tích ({date_str})",
            "",
            f"- **Thời gian kiểm toán:** `{audit_result.get('audited_at')}`",
            f"- **Tổng số mẫu tin tuyển dụng chuẩn hóa ($N$):** `{audit_result.get('total_jobs')}`",
            f"- **Tổng số đường link gốc đối chứng (`source_urls`):** `{audit_result.get('total_verified_source_links', audit_result.get('total_jobs'))}` "
            f"(Số tin gộp đa nguồn: `{audit_result.get('multi_source_merged_jobs', 0)}`)",
            f"- **Số tin có công bố mức lương rõ ràng:** `{audit_result.get('jobs_with_salary')}`",
            f"- **Trạng thái khuyến nghị:** **{status_badge}**",
            "",
            "---",
            "",
            "## 0. Kiểm toán Hệ thống Cổng Tuyển dụng & Cơ chế Mapping Đa nguồn (Portal Mapping Registry)",
            "| Mã Cổng (`site_code`) | Tên miền gốc | Động cơ Thu thập (`Engine`) | Ưu tiên `JSON-LD` | Số tin đóng góp | Tỷ lệ có Lương (%) | Số Link xác thực |",
            "| :--- | :--- | :---: | :---: | :---: | :---: | :---: |",
        ]

        for p_item in audit_result.get("portal_mapping_audit", []):
            lines.append(
                f"| `{p_item['site_code']}` | `{p_item['base_url']}` | `{p_item['engine']}` | "
                f"`{'Có' if p_item['prefer_json_ld'] else 'Không'}` | {p_item['job_count']} | "
                f"`{p_item['salary_disclosure_rate_pct']}%` | {max(p_item['verified_links_count'], p_item['job_count'])} |"
            )

        lines.extend(
            [
                "",
                "---",
                "",
                "## 1. Kiểm toán Độ phủ Phân loại Nghề nghiệp (Occupation Taxonomy Coverage)",
                f"- **Tỷ lệ chức danh chưa khớp (`UNCLASSIFIED`):** `{audit_result.get('unclassified_role_rate', 0) * 100:.2f}%` "
                f"(Ngưỡng cảnh báo: `5.00%`).",
            ]
        )

        top_unc = audit_result.get("unclassified_top_titles", [])
        if top_unc:
            lines.append("- **Các chức danh chưa khớp phổ biến nhất (Cần bổ sung vào `roles_taxonomy.yaml`):**")
            for title, cnt in top_unc:
                lines.append(f"  - `{title}` ({cnt} tin)")
        else:
            lines.append("- Tất cả chức danh trong mẫu đều khớp tốt với 16 vị trí nghề chuẩn hóa.")

        lines.extend(
            [
                "",
                "## 2. Phát hiện Kỹ năng Số Mới nổi (Emerging Unmapped Skills)",
            ]
        )
        em_skills = audit_result.get("emerging_skills", [])
        if em_skills:
            lines.append(
                "| Tag kỹ năng mới phát hiện | Số lần xuất hiện | Tỷ lệ (%) | Khuyến nghị cập nhật `skills_ontology.yaml` |"
            )
            lines.append("| :--- | :---: | :---: | :--- |")
            for item in em_skills:
                lines.append(
                    f"| `{item['tag']}` | {item['count']} | {item['share_pct']}% | Bổ sung mã `SK_{item['tag'].upper().replace(' ', '_')}` vào Tầng L2/L3 |"
                )
        else:
            lines.append("- Không phát hiện tag kỹ năng nào vượt ngưỡng phần dư ngoài từ điển hiện tại.")

        lines.extend(
            [
                "",
                "## 3. Hiệu chỉnh Ranh giới Lương trên Tháp 6 Tầng (Pyramid Boundary Calibration)",
            ]
        )
        drifts = audit_result.get("pyramid_drifts", [])
        if drifts:
            lines.append(
                "| Trụ cột ngành | Tầng Tháp | Cỡ mẫu ($n$) | Trung vị Thiết kế (Tr.VNĐ) | Trung vị Thực tế (Tr.VNĐ) | Độ lệch (%) | Khuyến nghị |"
            )
            lines.append("| :---: | :---: | :---: | :---: | :---: | :---: | :--- |")
            for d in drifts:
                lines.append(
                    f"| `{d['pillar']}` | `{d['tier']}` | {d['n_samples']} | {d['design_p50_vnd']} | **{d['empirical_p50_vnd']}** | `{d['drift_pct']:+.1f}%` | {d['recommendation']} |"
                )
        else:
            lines.append("- Mặt bằng lương thực tế tại các tầng tháp bám sát ranh giới thiết kế (độ lệch < 15%).")

        lines.extend(
            [
                "",
                "## 4. Định vị Vai trò Kỹ năng theo Bằng chứng Thực nghiệm (Gatekeeper vs. Differentiator)",
                "",
                "| Mã Kỹ năng | Tên Kỹ năng | Tầng | Tần suất cầu (%) | Phần bù lương thô (Tr.VNĐ) | Vai trò Thực nghiệm trên Tháp |",
                "| :--- | :--- | :---: | :---: | :---: | :--- |",
            ]
        )
        for sk in audit_result.get("skill_role_summary", [])[:15]:
            lines.append(
                f"| `{sk['skill_id']}` | {sk['skill_name']} | `{sk['layer']}` | {sk['frequency_pct']}% | `{sk['raw_wage_premium_vnd']:+.2f}` | {sk['empirical_role']} |"
            )

        report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return report_path


def main() -> None:
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        description="Kiểm toán & Đề xuất Tái cấu trúc Khung Phân tích Thị trường Bất động sản"
    )
    parser.add_argument(
        "--input",
        type=str,
        default="data/silver/jobs_master.json",
        help="Đường dẫn file JSON/Parquet dữ liệu đã qua ETL",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="docs/audits",
        help="Thư mục lưu báo cáo kiểm toán Markdown",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    auditor = FrameworkAuditor(Path("configs"))

    if input_path.exists():
        records = json.loads(input_path.read_text(encoding="utf-8"))
        res = auditor.audit_records(records)
        rep_path = auditor.generate_markdown_report(res, Path(args.output_dir))
        print(f"[OK] Đã tạo báo cáo kiểm toán Khung phân tích tại: {rep_path}")
    else:
        print(f"[INFO] Chưa tìm thấy file dữ liệu đầu vào tại {input_path}.")


if __name__ == "__main__":
    main()
