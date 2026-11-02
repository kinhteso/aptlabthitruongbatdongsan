"""
Kịch bản Kiểm thử Toàn diện Hệ thống (End-to-End Verification Suite - 9 Hạng mục):
1. Kiểm thử Đồng bộ Múi giờ Chuẩn GMT+07 (`Asia/Ho_Chi_Minh`) & Đối chiếu Giờ Quốc tế (UTC/NTP).
2. Kiểm thử Async Playwright Runner + Scheduler (`CrawlScheduler.execute_cycle`) trên cả 4 cổng:
   TopCV, ITviec, CareerViet, VietnamWorks (Schema.org JSON-LD + DOM + Next.js __NEXT_DATA__).
3. Kiểm thử Khử trùng lặp Đa nguồn (`dedup_signature`) ĐỒNG THỜI Lưu vết Toàn bộ Link Gốc
   (`source_sites`, `source_urls`, `source_links_meta`, `get_job_verification_links`).
4. Kiểm thử Cập nhật Vòng đời Tin đăng (`touch_existing_job_by_url` -> `vacancy_duration_days`).
5. Kiểm thử Tiêm Lỗi Quét Dữ liệu (Fault-Injection: Cloudflare 403, Selector Drift 0 links, HTTP 503),
   Lưu Nhật ký Lỗi (`logs/scraper_errors.jsonl`), Ảnh chụp HTML (`logs/html_snapshots/`), Hàng đợi DLQ,
   Báo cáo Khắc phục (`docs/audits/scraper-error-remediation-report.md`) và Tự động Quét Bù (`--mode retry-errors`).
6. Kiểm thử Động cơ Kiểm toán Khung & Bảng Ánh xạ Cổng Tuyển dụng (`FrameworkAuditor`).
7. Kiểm thử Module Huấn luyện Kinh tế lượng Mincer OLS (HC3) + Heckman 2-Step Selection Probit
   + Hồi quy Phân vị (Quantile Regression P10..P90) + Giải thích SHAP + Khuyến nghị Kỹ năng (UPS).
8. Kiểm thử Cơ chế Xác thực Google OAuth & Phân quyền 4 Tầng (`VIEWER`, `RESEARCHER`, `OPERATOR`, `ADMIN`)
   với quy tắc Email đầu tiên tự động nhận `ADMIN` và ưu tiên `ADMIN_EMAILS`.
9. Kiểm thử Máy chủ Giao thức MCP (`SkillValueMCPServer`) cho phép AI truy vấn tương tác
   với kiểm soát quyền RBAC nghiêm ngặt (`VIEWER` bị chặn query kho dữ liệu; `RESEARCHER` & `ADMIN` được phép).
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Tuple

from src.db.postgres_repo import PostgresJobRepository
from src.mcp.labor_market_mcp_server import SkillValueMCPServer
from src.models.train_pipeline import run_full_modeling_pipeline
from src.scrapers.scheduler import CrawlScheduler, mock_portal_transport
from src.utils.time_sync import VN_TZ, verify_international_time_sync


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    # 0. Làm sạch file dữ liệu test cục bộ trước khi chạy kiểm thử
    for p in [
        Path("data/silver/jobs_master.json"),
        Path("data/silver/url_cooldown_cache.json"),
        Path("data/silver/app_users.json"),
        Path("data/silver/mcp_audit_logs.json"),
        Path("data/silver/scraper_dlq_retry.json"),
        Path("data/bronze/raw_job_postings.jsonl"),
        Path("logs/scraper_errors.jsonl"),
    ]:
        if p.exists():
            p.unlink()

    # 1. Kiểm chứng Đồng bộ Múi giờ Chuẩn GMT+07 (Asia/Ho_Chi_Minh) & Giờ Quốc tế (UTC/NTP)
    time_sync = verify_international_time_sync(probe_network_ntp=True)
    assert time_sync["is_gmt07_locked"] is True and time_sync["utc_offset_hours"] == 7.0, (
        f"Múi giờ bắt buộc phải khóa ở GMT+07 (+7.0h), thực tế: {time_sync}"
    )
    assert time_sync["server_gmt07_iso"].endswith("+07:00"), "Chuỗi thời gian hệ thống phải mang hậu tố +07:00!"

    # 1b. Kiểm chứng Chuẩn hóa Lương USD Ngầm định ("0 - 1800", "0 - 1200") & Phân loại Chức danh Trợ lý / Kiến trúc sư
    from src.etl.normalizers import RoleAndTierClassifier, SalaryNormalizer

    sal_norm = SalaryNormalizer()
    s1800 = sal_norm.parse("0 - 1800")
    assert s1800.currency_original == "USD" and s1800.salary_type == "UPPER_BOUND", f"Lỗi parse '0 - 1800': {s1800}"
    assert s1800.salary_mid_vnd is not None and 35.0 <= s1800.salary_mid_vnd <= 42.0, f"Lương mid của '0 - 1800' phải ~38.86tr, thực tế: {s1800}"
    s1200 = sal_norm.parse("0 - 1200")
    assert s1200.currency_original == "USD" and 23.0 <= (s1200.salary_mid_vnd or 0) <= 28.0, f"Lương mid của '0 - 1200' phải ~25.91tr, thực tế: {s1200}"

    role_clf = RoleAndTierClassifier(Path("configs/roles_taxonomy.yaml"))
    sa_role = role_clf.classify("Solution Architect", None, "1.5 năm")
    assert sa_role.canonical_role == "ROLE_SOFTWARE_CLOUD" and sa_role.sector_pillar == "DE-01", f"Solution Architect phải thuộc ROLE_SOFTWARE_CLOUD: {sa_role}"
    asst_role = role_clf.classify("Trợ Lý Giám Đốc | Assistant Manager - UX & Business Development", None, "1.5 năm")
    assert asst_role.career_tier == "T3_JUNIOR", f"Trợ Lý Giám Đốc (1.5 năm KN) không được phân vào T6_DIRECTOR: {asst_role}"
    assert asst_role.canonical_role != "UNCLASSIFIED", f"UX & Business Development phải được phân loại chuẩn: {asst_role}"

    repo = PostgresJobRepository(prefer_local_fallback=True)
    scheduler = CrawlScheduler(repo=repo)

    # Kiểm chứng bộ tính lịch chạy Daemon luôn tính theo chuẩn 01:00 AM GMT+07
    ref_midnight_gmt07 = datetime(2026, 10, 30, 0, 30, 0, tzinfo=VN_TZ)
    wait_sec = scheduler.compute_seconds_until_next_run(now=ref_midnight_gmt07)
    assert abs(wait_sec - 1800.0) < 1.0, f"Từ 00:30 GMT+07 đến 01:00 GMT+07 phải đúng 1800 giây, thực tế: {wait_sec}"

    # 2. Chạy Async Playwright Runner + Scheduler (Mock Verification trên cả 4 cổng)
    cycle_res = asyncio.run(
        scheduler.execute_cycle(
            trigger_mode="MOCK_VERIFY",
            sites=["topcv", "itviec", "careerviet", "vietnamworks"],
            pillars=["DE-01"],
            cities=["HN"],
            max_pages=1,
            max_jobs_per_site=10,
            use_mock=True,
            run_audit=True,
        )
    )

    crawl_stats = cycle_res["crawl_stats"]
    assert crawl_stats["status"] == "COMPLETED", f"Lỗi trạng thái cào: {crawl_stats}"
    assert crawl_stats["links_discovered"] >= 5, "Phải phát hiện ít nhất 5 link từ 4 cổng!"

    # 3. Kiểm chứng Khử trùng lặp Đa nguồn + Lưu vết Toàn bộ Link Gốc (Verification & Provenance)
    master_jobs = repo.fetch_enriched_jobs()
    assert len(master_jobs) == 4, f"Sau khử trùng lặp đa nguồn phải còn đúng 4 Master Jobs, thực tế: {len(master_jobs)}"

    fpt_jobs = [j for j in master_jobs if "fpt-smart-cloud" in j["dedup_signature"]]
    assert len(fpt_jobs) == 1, "Tin tuyển dụng Junior Data Analyst của FPT Smart Cloud phải được gộp làm 1!"
    fpt_master = fpt_jobs[0]
    assert set(fpt_master["source_sites"]) == {"topcv", "itviec"}, "Phải lưu nhận diện cả 2 cổng topcv và itviec!"
    assert len(fpt_master["source_urls"]) == 2, "Phải giữ lại cả 2 đường link gốc của TopCV và ITviec!"

    verified_links = repo.get_job_verification_links(fpt_master["dedup_signature"])
    assert len(verified_links) == 2, "Bảng đối chứng phải trả về đầy đủ 2 bản ghi link gốc kèm SHA-256!"

    # 4. Kiểm chứng Cập nhật Vòng đời Tin đăng (Vacancy Duration Update)
    future_obs = datetime.now() + timedelta(days=45)
    touched = repo.touch_existing_job_by_url(
        source_site="topcv",
        source_url="https://www.topcv.vn/viec-lam/junior-data-analyst/101.html",
        observed_at=future_obs,
    )
    assert touched is True, "Cập nhật vòng đời URL đã biết phải thành công!"
    updated_fpt = [j for j in repo.fetch_enriched_jobs() if j["dedup_signature"] == fpt_master["dedup_signature"]][0]
    assert updated_fpt["vacancy_duration_days"] >= 45, "vacancy_duration_days phải tăng lên >= 45 ngày!"

    # 5. Kiểm chứng Cơ chế Báo cáo Log Lỗi, Chụp HTML Hiện trường, Hàng đợi DLQ & Quét Bù Tự động (`--mode retry-errors`)
    async def faulty_portal_transport(url: str, engine: str) -> Tuple[int, str]:
        if "topcv.vn/tim-viec-lam" in url or "batdongsan.com.vn/nha-dat-ban" in url:
            # Giả lập lỗi bị chặn Cloudflare HTTP 403
            return 403, "<html><body>Attention Required! | Cloudflare cf-browser-verification</body></html>"
        if ("itviec.com/it-jobs/" in url and "?page=" in url) or "nha.chotot.com/mua-ban-bat-dong-san" in url:
            # Giả lập lỗi đổi cấu trúc DOM/CSS (HTTP 200 nhưng 0 link trích xuất được -> SELECTOR_DRIFT_ZERO_LINKS)
            return 200, "<html><body><div class='changed-new-dom-2026'>No matching old selectors</div></body></html>"
        return await mock_portal_transport(url, engine)

    fault_cycle = asyncio.run(
        scheduler.execute_cycle(
            trigger_mode="FAULT_INJECTION_TEST",
            sites=["topcv", "itviec"],
            pillars=["DE-01"],
            cities=["HN"],
            max_pages=1,
            max_jobs_per_site=5,
            use_mock=False,
            run_audit=False,
            custom_mock_transport=faulty_portal_transport,
        )
    )
    assert fault_cycle["crawl_stats"]["error_count"] >= 2, "Phải bắt được ít nhất 2 nhóm lỗi (Cloudflare 403 & Selector Drift)!"
    assert Path("logs/scraper_errors.jsonl").exists(), "Phải ghi nhật ký lỗi xuống ổ cứng tại logs/scraper_errors.jsonl!"
    assert Path("docs/audits/scraper-error-remediation-report.md").exists(), "Phải tự động sinh Báo cáo Khắc phục Lỗi!"

    # Chạy cơ chế tự phục hồi (`execute_retry_errors` / `--mode retry-errors`) khi mạng/selector đã được khôi phục
    retry_res = asyncio.run(
        scheduler.execute_retry_errors(
            use_mock=True,
            custom_mock_transport=mock_portal_transport,
        )
    )
    assert retry_res["resolved_count"] >= 2 and retry_res["still_failing"] == 0, (
        f"Sau khi chạy --mode retry-errors, toàn bộ URL lỗi trong DLQ phải được RESOLVED: {retry_res}"
    )

    # 6. Kiểm chứng Huấn luyện Mô hình Kinh tế lượng Mincer OLS + Heckman 2-Step + Quantile ML + SHAP + UPS
    model_artifacts = run_full_modeling_pipeline(min_training_samples=350)
    mincer_r2 = model_artifacts["mincer_ols"]["r_squared"]
    q_metrics = model_artifacts["quantile_ml_metrics"]
    da_rec = model_artifacts["sample_upskilling_recommendations"]["junior_data_analyst_hcm"]
    sf = da_rec["salary_forecast_vnd"]

    assert mincer_r2 > 0.65, f"Mincer OLS R2 phải đạt độ giải thích cao (> 0.65), thực tế: {mincer_r2}"
    assert q_metrics["r2_score"] > 0.70, f"Quantile ML R2 phải > 0.70, thực tế: {q_metrics['r2_score']}"
    assert (
        sf["p10_vnd"] <= sf["p25_vnd"] <= sf["p50_median_vnd"] <= sf["p75_vnd"] <= sf["p90_vnd"]
    ), "Các phân vị lương P10 <= P25 <= P50 <= P75 <= P90 phải đảm bảo tính đơn điệu không cắt nhau!"
    assert len(da_rec["upskilling_recommendations"]) == 5, "Phải trả về đủ Top 5 kỹ năng khuyến nghị học thêm theo UPS!"

    # 7. Kiểm chứng Google OAuth 2.0 + Phân quyền 4 Tầng (VIEWER, RESEARCHER, OPERATOR, ADMIN)
    first_user = repo.upsert_google_user(email="phungtuananh3333@gmail.com", full_name="Primary Admin")
    assert first_user["role"] == "ADMIN"

    viewer_user = repo.upsert_google_user(email="student_viewer@gmail.com", full_name="Student Viewer")
    assert viewer_user["role"] == "VIEWER" and viewer_user["is_first_user"] is False

    external_user = repo.upsert_google_user(email="lecturer@neu.edu.vn", full_name="External Visitor")
    assert external_user["role"] == "VIEWER"

    admin_whitelisted = repo.upsert_google_user(email="phungtuananh2222@gmail.com", full_name="Co-Admin")
    assert admin_whitelisted["role"] == "ADMIN"

    # 8. Kiểm chứng Máy chủ MCP (Model Context Protocol) Tích hợp Kiểm soát Quyền RBAC
    mcp_server = SkillValueMCPServer(repo=repo)

    viewer_val_res = mcp_server.execute_tool(
        tool_name="mcp_estimate_profile_and_upskilling",
        arguments={"sector_pillar": "DE-01", "current_tier": "T3_JUNIOR", "city_code": "HCM"},
        user_identity=viewer_user["mcp_api_token"],
    )
    assert viewer_val_res["isError"] is False

    viewer_denied_res = mcp_server.execute_tool(
        tool_name="mcp_query_verified_jobs",
        arguments={"sector_pillar": "DE-01"},
        user_identity=viewer_user["mcp_api_token"],
    )
    assert viewer_denied_res["isError"] is True and viewer_denied_res["authorization"]["status"] == "DENIED_RBAC"

    promote_res = mcp_server.execute_tool(
        tool_name="mcp_manage_user_permissions",
        arguments={
            "action": "update_role",
            "target_email": "student_viewer@gmail.com",
            "new_role": "RESEARCHER",
        },
        user_identity="phungtuananh3333@gmail.com",
    )
    assert promote_res["isError"] is False and promote_res["data"]["updated_user"]["role"] == "RESEARCHER"

    upgraded_jobs_res = mcp_server.execute_tool(
        tool_name="mcp_query_verified_jobs",
        arguments={"sector_pillar": "DE-01", "only_multi_source": True},
        user_identity=viewer_user["mcp_api_token"],
    )
    assert upgraded_jobs_res["isError"] is False and upgraded_jobs_res["data"]["total_matched"] >= 1

    audit_logs = repo.list_mcp_audit_logs()
    assert len(audit_logs) >= 4

    # 8. Kiểm thử Thống kê Bản ghi Quét được theo Thời gian, Địa điểm & Nội dung
    scraped_analytics = repo.fetch_scraped_records_analytics()
    assert scraped_analytics["summary"]["total_master_records"] >= 4
    assert len(scraped_analytics["by_time"]) >= 1
    assert len(scraped_analytics["by_location"]) >= 1
    assert len(scraped_analytics["records"]) >= 4

    # 9. Kiểm thử Kế hoạch Chiến dịch 100.000 Bản ghi (01/01/2021 – 31/10/2026) & Đánh giá Khả thi 5 Tiêu chí
    campaign_plan = scheduler.evaluate_campaign_100k_plan()
    assert campaign_plan["campaign_summary"]["target_master_records"] == 100000
    assert campaign_plan["campaign_summary"]["avg_records_per_historical_week"] == 329
    assert campaign_plan["execution_schedule_1month"]["required_master_per_execution_day"] == 3333
    assert campaign_plan["feasibility_assessment"]["feasibility_score"] == 100
    assert campaign_plan["feasibility_assessment"]["overall_status"] == "FEASIBLE_ON_TRACK"
    assert len(campaign_plan["yearly_breakdown_2021_2026"]) == 6

    # 10. Kiểm thử Hệ Quy Chiếu Kép 34/63 Tỉnh Thành, 6 Phân Khu Kinh Tế (KCN, Làng Nghề, Du Lịch, CBD) & Định Giá Cấp Phường/Xã
    from src.etl.normalizers import GeoNormalizer

    re_price_1 = sal_norm.parse("6.8 tỷ - 80m2")
    assert re_price_1.salary_mid_vnd == 85.0 and not re_price_1.is_negotiable, f"Lỗi parse '6.8 tỷ - 80m2': {re_price_1}"
    re_price_2 = sal_norm.parse("125 triệu/m2")
    assert re_price_2.salary_mid_vnd == 125.0, f"Lỗi parse '125 triệu/m2': {re_price_2}"
    re_price_3 = sal_norm.parse("5.6 - 6.4 tỷ", area_m2=80.0)
    assert re_price_3.salary_mid_vnd == 75.0 and re_price_3.salary_type == "RANGE", f"Lỗi parse '5.6 - 6.4 tỷ' (80m2): {re_price_3}"

    geo_norm = GeoNormalizer(Path("configs/geo_vietnam_cities.yaml"))
    p34_reg = geo_norm.cfg.get("provinces_34_registry", {})
    total_legacy_63 = sum(len(v.get("merged_from_63", v.get("legacy_provinces_63", []))) for v in p34_reg.values())
    assert len(p34_reg) == 34 and total_legacy_63 == 63, (
        f"Phải ánh xạ đủ 34 Tỉnh/Thành mới <-> 63 Tỉnh/Thành cũ, thực tế: {len(p34_reg)} / {total_legacy_63}"
    )

    # Kiểm chứng 1: Khu công nghiệp FDI (Bình Dương cũ -> thuộc TP.HCM mở rộng 34 tỉnh)
    geo_kcn = geo_norm.parse("Phường Dĩ An, Bình Dương", "Bán nhà trọ dòng tiền cạnh KCN VSIP 1 Bình Dương")
    assert geo_kcn.province_34_code == "HCM" and geo_kcn.legacy_province_63 == "Bình Dương", f"Lỗi phân giải KCN Bình Dương: {geo_kcn}"
    assert geo_kcn.economic_zone_type == "ZONE_INDUSTRIAL_FDI_PARK", f"Phải nhận diện ZONE_INDUSTRIAL_FDI_PARK: {geo_kcn}"

    # Kiểm chứng 2: Khu làng nghề truyền thống (Phường Đồng Kỵ, Từ Sơn, Bắc Ninh)
    geo_craft = geo_norm.parse("Phường Đồng Kỵ, TP. Từ Sơn, Bắc Ninh", "Bán nhà mặt phố làng nghề gỗ mỹ nghệ Đồng Kỵ")
    assert geo_craft.province_34_code == "BN" and geo_craft.ward_code == "BN_P_DONG_KY", f"Lỗi phân giải Làng nghề Đồng Kỵ: {geo_craft}"
    assert geo_craft.economic_zone_type == "ZONE_CRAFT_VILLAGE_HERITAGE", f"Phải nhận diện ZONE_CRAFT_VILLAGE_HERITAGE: {geo_craft}"

    # Kiểm chứng 3: Khu du lịch biển (Phường Thắng Tam, Vũng Tàu -> thuộc TP.HCM mở rộng 34 tỉnh)
    geo_tourism = geo_norm.parse("Phường Thắng Tam, TP. Vũng Tàu, Bà Rịa - Vũng Tàu", "Biệt thự nghỉ dưỡng ven biển Bãi Sau")
    assert geo_tourism.province_34_code == "HCM" and geo_tourism.legacy_province_63 == "Bà Rịa - Vũng Tàu", f"Lỗi phân giải Vũng Tàu: {geo_tourism}"
    assert geo_tourism.economic_zone_type == "ZONE_TOURISM_RESORT_COASTAL", f"Phải nhận diện ZONE_TOURISM_RESORT_COASTAL: {geo_tourism}"

    # Kiểm chứng 4: Định giá Cấp Phường/Xã theo Empirical Bayes Spatial Shrinkage
    ward_val = geo_norm.estimate_ward_level_price(
        raw_location="Phường Đồng Kỵ, TP. Từ Sơn, Bắc Ninh",
        full_text="Nhà mặt phố làng nghề gỗ Đồng Kỵ, sổ đỏ chính chủ, ngõ ô tô tránh",
        career_tier="T4_MIDDLE_SENIOR",
        area_m2=90.0,
        frontage_m=6.0,
        alley_width_m=8.0,
        has_red_book=True,
        observed_ward_samples=15,
    )
    wv_res = ward_val["valuation_result"]
    assert ward_val["empirical_bayes_shrinkage"]["shrinkage_weight_omega"] == 0.5, f"Với n_w=15, kappa=15 thì omega phải bằng 0.5: {ward_val}"
    assert (
        wv_res["unit_price_p10_million_m2"]
        < wv_res["unit_price_p50_million_m2"]
        < wv_res["unit_price_p90_million_m2"]
    ), f"Dải phân vị đơn giá Phường/Xã phải đơn điệu tăng: {wv_res}"

    # Kiểm chứng 5: Rà soát 6 Cổng BĐS Việt Nam, Quét Lịch sử 2021-2026 & Tự động Rà soát Lỗi (Auto-Heal)
    portal_audit = scheduler.audit_real_estate_portals()
    assert portal_audit["summary"]["total_portals_audited"] == 6, f"Phải rà soát đủ 6 cổng BĐS: {portal_audit['summary']}"
    assert len(portal_audit["execution_roadmap_4_phases"]) == 4, "Phải có lộ trình 4 giai đoạn thực thi!"
    assert Path("docs/audits/portal-readiness-and-2021-2026-plan.md").exists(), "Phải sinh báo cáo rà soát cổng BĐS!"
    auto_heal_res = asyncio.run(scheduler.execute_auto_heal_and_audit(use_mock=True))
    assert auto_heal_res["status"] == "SELF_HEALED_OK", f"Auto-Heal phải hoàn tất thành công: {auto_heal_res}"

    print("=== KẾT QUẢ KIỂM THỬ TOÀN DIỆN 10 HẠNG MỤC (GMT+07 + SCRAPER + DLQ RETRY + HEDONIC/ML + RBAC + MCP + 34/63 TỈNH THÀNH & ĐỊNH GIÁ PHƯỜNG/XÃ) ===")
    print(
        f"1. [GMT+07 & International Time Sync] Server GMT+07 = {time_sync['server_gmt07_iso']} | UTC = {time_sync['international_utc_iso']} | Skew = {time_sync['clock_skew_seconds']}s ({time_sync['sync_status']})"
    )
    print(f"2. [Async Scraper & Scheduler] Đã quét 4 cổng: {crawl_stats['links_discovered']} links -> {len(master_jobs)} Master Records.")
    print(
        f"3. [Cross-Site Dedup & Link Provenance] Bản ghi đa nguồn gộp từ {fpt_master['source_sites']} | Lưu giữ {len(verified_links)} links gốc: {fpt_master['source_urls']}"
    )
    print(
        f"4. [Error Logging, HTML Snapshot & DLQ Self-Healing] Bắt {fault_cycle['crawl_stats']['error_count']} sự cố (Cloudflare 403 & Selector Drift) -> Quét bù (--mode retry-errors) khắc phục thành công {retry_res['resolved_count']}/{retry_res['total_retried']} URL!"
    )
    print(
        f"5. [Econometrics Hedonic/Mincer & Heckman] OLS R2 = {mincer_r2:.4f} | Heckman IMR p-value = {model_artifacts['heckman_two_step']['imr_lambda_pvalue']}"
    )
    print(
        f"6. [Quantile ML & SHAP & Value Drivers] Engine = {q_metrics['engine']} | R2 = {q_metrics['r2_score']:.4f} | MAE = {q_metrics['mae_vnd']} tr.VNĐ/m² | PICP_80% = {q_metrics['picp_80_coverage_pct']}%"
    )
    print(
        f"7. [Google OAuth 4-Tier RBAC & Authorized AI MCP] First-Login={first_user['role']} | VIEWER bị chặn query dataset -> Sau khi ADMIN nâng lên RESEARCHER: Query MCP thành công | Audit Logs = {len(audit_logs)} bản ghi."
    )
    print(
        f"8. [Scraped Records Analytics] Tổng Raw={scraped_analytics['summary']['total_raw_records']} | Master={scraped_analytics['summary']['total_master_records']} | Mốc thời gian={len(scraped_analytics['by_time'])} | Địa điểm={len(scraped_analytics['by_location'])}."
    )
    print(
        f"9. [100k Campaign Plan & Feasibility 2021-2026] Mục tiêu={campaign_plan['campaign_summary']['target_master_records']:,} (329 bản ghi/tuần lịch sử; 3.333 bản ghi/ngày chiến dịch) | Khả thi={campaign_plan['feasibility_assessment']['feasibility_score']}% ({campaign_plan['feasibility_assessment']['overall_status']})."
    )
    print(
        f"10. [34/63 Dual Provinces, 6 Economic Zones & Ward-Level AVM] Ánh xạ {len(p34_reg)} Tỉnh mới <-> {total_legacy_63} Tỉnh cũ | Định giá Phường Đồng Kỵ (Làng nghề, 90m²): P50 = {wv_res['unit_price_p50_million_m2']} tr/m² ({wv_res['total_price_p50_billion_vnd']} tỷ VNĐ, omega={ward_val['empirical_bayes_shrinkage']['shrinkage_weight_omega']})."
    )



if __name__ == "__main__":
    main()
