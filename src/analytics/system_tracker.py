"""
Bộ Công cụ Giám sát & Tracking Toàn diện Hệ thống (`src/analytics/system_tracker.py`):
Được đóng gói sẵn bên trong GHCR Image (`ghcr.io/kinhteso/aptlabthitruonglaodongso:latest`).
Khi chạy lệnh:
    `python -m src.analytics.system_tracker`
hoặc trên Ubuntu Docker:
    `docker exec -it skillvalue_api python -m src.analytics.system_tracker`
Hệ thống sẽ kiểm tra và in báo cáo Tracking thời gian thực gồm 7 hạng mục:
1. [GMT+07 & International UTC/NTP Sync] Kiểm định múi giờ chuẩn `GMT+07:00` (`Asia/Ho_Chi_Minh`) và độ lệch đồng hồ so với Giờ Quốc tế (UTC/NTP).
2. [Hard-Drive Bind Mounts & Disk Usage] Dung lượng và số tệp tin thực tế trên ổ cứng máy chủ (`data/bronze`, `data/silver`, `data/gold`, `data/postgres`, `logs`).
3. [Database & Medallion Telemetry] Trạng thái kết nối PostgreSQL, tổng số bản ghi từng bảng, tỷ lệ khử trùng lặp đa nguồn và số link gốc đối chứng (`job_source_links`).
4. [Scraper Error Logs, DLQ & Self-Healing] Thống kê lỗi quét dữ liệu (`CLOUDFLARE_WAF_BLOCK`, `SELECTOR_DRIFT_ZERO_LINKS`, `HTTP_5XX_OR_TIMEOUT`), hàng đợi quét bù (`PENDING_RETRY` vs `RESOLVED`) và ảnh chụp HTML hiện trường.
5. [Econometrics & Quantile ML Health] Độ chính xác mô hình hiện hành tại tầng Gold ($R^2$ Mincer OLS, Heckman IMR $p$-value, Quantile ML $R^2$, MAE, PICP 80%).
6. [Google OAuth 4-Tier RBAC Users] Thống kê người dùng theo 4 tầng quyền (`ADMIN`, `OPERATOR`, `RESEARCHER`, `VIEWER`).
7. [Authorized AI MCP Audit Logs] Thống kê các truy vấn tương tác từ AI qua giao thức MCP (`ALLOWED` vs `DENIED_RBAC`).
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict

from src.db.postgres_repo import PostgresJobRepository
from src.scrapers.error_logger import ScraperErrorLogger
from src.utils.time_sync import now_gmt07_iso, verify_international_time_sync


def _dir_stats(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {"exists": False, "file_count": 0, "size_kb": 0.0}
    files = [f for f in path.rglob("*") if f.is_file()]
    total_bytes = sum(f.stat().st_size for f in files)
    return {
        "exists": True,
        "abs_path": str(path.resolve()),
        "file_count": len(files),
        "size_kb": round(total_bytes / 1024.0, 2),
        "size_mb": round(total_bytes / (1024.0 * 1024.0), 3),
    }


def collect_system_tracking_report(data_dir: Path = Path("data")) -> Dict[str, Any]:
    repo = PostgresJobRepository(local_data_dir=data_dir)
    error_logger = ScraperErrorLogger(repo=repo)
    pg_connected = repo.is_postgres_available()

    # 1. Kiểm định Múi giờ GMT+07 & Đồng bộ Giờ Quốc tế (UTC/NTP)
    time_sync = verify_international_time_sync(probe_network_ntp=True)

    # 2. Kiểm tra dung lượng lưu trữ trên ổ cứng (Bind Mounts)
    storage_report = {
        "bronze_raw_lake": _dir_stats(data_dir / "bronze"),
        "silver_standardized": _dir_stats(data_dir / "silver"),
        "gold_ml_artifacts": _dir_stats(data_dir / "gold"),
        "postgres_bind_mount": _dir_stats(data_dir / "postgres"),
        "redis_bind_mount": _dir_stats(data_dir / "redis"),
        "logs_and_snapshots": _dir_stats(Path("logs")),
    }

    # 3. Thống kê Kho dữ liệu Tuyển dụng & Link Đối chứng Đa nguồn
    jobs = repo.fetch_enriched_jobs(limit=50000)
    multi_source_jobs = [
        j for j in jobs if len(j.get("source_sites", [j.get("source_site")])) >= 2
    ]
    total_source_links = sum(
        len(j.get("source_urls", [j.get("source_url")])) for j in jobs
    )
    jobs_with_salary = [j for j in jobs if j.get("salary_mid_vnd") is not None]

    # 4. Thống kê Lỗi Quét Dữ liệu, Trạng thái Tiến trình Quét & Hàng đợi Quét bù (Dead-Letter Queue)
    dlq_all = error_logger.list_dlq_items()
    dlq_pending = [x for x in dlq_all if x.get("retry_status") == "PENDING_RETRY"]
    dlq_resolved = [x for x in dlq_all if x.get("retry_status") == "RESOLVED"]

    heartbeat_file = Path("logs/scraper_heartbeat.json")
    heartbeat_data: Dict[str, Any] = {"state": "NO_HEARTBEAT_YET"}
    if heartbeat_file.exists():
        try:
            heartbeat_data = json.loads(heartbeat_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    crawl_runs_file = data_dir / "silver" / "crawl_runs.json"
    crawl_runs_list = []
    if crawl_runs_file.exists():
        try:
            crawl_runs_list = json.loads(crawl_runs_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    latest_crawl_run = crawl_runs_list[-1] if crawl_runs_list else None

    # 5. Thống kê Mô hình Kinh tế lượng & Quantile ML (Gold Layer)
    gold_artifact_file = data_dir / "gold" / "model_artifacts.json"
    ml_health: Dict[str, Any] = {"artifacts_ready": gold_artifact_file.exists()}
    if gold_artifact_file.exists():
        try:
            art = json.loads(gold_artifact_file.read_text(encoding="utf-8"))
            ml_health.update(
                {
                    "mincer_ols_r2": art.get("mincer_ols", {}).get("r_squared"),
                    "heckman_imr_pvalue": art.get("heckman_two_step", {}).get(
                        "imr_lambda_pvalue"
                    ),
                    "quantile_engine": art.get("quantile_ml_metrics", {}).get("engine"),
                    "quantile_r2": art.get("quantile_ml_metrics", {}).get("r2_score"),
                    "quantile_mae_vnd": art.get("quantile_ml_metrics", {}).get("mae_vnd"),
                    "picp_80_pct": art.get("quantile_ml_metrics", {}).get(
                        "picp_80_coverage_pct"
                    ),
                }
            )
        except Exception:
            pass

    # 6. Thống kê Phân quyền Người dùng (Google OAuth 4-Tier RBAC)
    users = repo.list_app_users()
    role_counts: Dict[str, int] = {"ADMIN": 0, "OPERATOR": 0, "RESEARCHER": 0, "VIEWER": 0}
    for u in users:
        r = str(u.get("role", "VIEWER")).upper()
        role_counts[r] = role_counts.get(r, 0) + 1

    # 7. Thống kê Truy vấn AI qua Giao thức MCP (`mcp_audit_logs`)
    mcp_logs = repo.list_mcp_audit_logs(limit=100)
    mcp_allowed = sum(1 for lg in mcp_logs if lg.get("status") == "ALLOWED")
    mcp_denied = sum(1 for lg in mcp_logs if lg.get("status") != "ALLOWED")

    return {
        "tracked_at_gmt07": now_gmt07_iso(),
        "time_sync": time_sync,
        "webapp_default_port": int(os.getenv("PORT", "3359")),
        "postgres_connected": pg_connected,
        "storage_on_hard_drive": storage_report,
        "data_pipeline_metrics": {
            "total_deduplicated_master_jobs": len(jobs),
            "total_original_verification_links": total_source_links,
            "cross_site_merged_jobs": len(multi_source_jobs),
            "jobs_with_explicit_salary": len(jobs_with_salary),
            "salary_disclosure_rate_pct": (
                round(len(jobs_with_salary) * 100.0 / len(jobs), 2) if jobs else 0.0
            ),
        },
        "scraper_process_status": {
            "heartbeat": heartbeat_data,
            "total_crawl_runs_recorded": len(crawl_runs_list),
            "latest_crawl_run": latest_crawl_run,
        },
        "scraper_error_and_dlq_summary": {
            "total_recorded_incidents": len(dlq_all),
            "pending_retry_count": len(dlq_pending),
            "resolved_count": len(dlq_resolved),
            "remediation_report_path": "docs/audits/scraper-error-remediation-report.md",
        },
        "econometrics_and_ml_health": ml_health,
        "rbac_users_summary": {
            "total_users": len(users),
            "configured_admin_emails": sorted(repo.get_configured_admin_emails()),
            "counts_by_role": role_counts,
        },
        "mcp_ai_audit_summary": {
            "total_logged_queries": len(mcp_logs),
            "allowed_queries": mcp_allowed,
            "denied_rbac_queries": mcp_denied,
            "latest_queries": mcp_logs[:5],
        },
    }


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    report = collect_system_tracking_report()
    ts = report["time_sync"]
    print("================================================================================")
    print(" 📊 BÁO CÁO TRACKING & GIÁM SÁT HỆ THỐNG SKILLVALUE.AI (GMT+07 & HARD-DRIVE)")
    print("================================================================================")
    print(
        f"• Giờ Hệ thống (GMT+07) : {ts['server_gmt07_iso']} | Giờ Quốc tế (UTC): {ts['international_utc_iso']}"
    )
    print(
        f"• Đồng bộ Giờ Quốc tế   : {ts['sync_status']} (Độ lệch: {ts['clock_skew_seconds']}s | Nguồn: {ts['ntp_source']})"
    )
    print(f"• Cổng Web mặc định     : http://localhost:{report['webapp_default_port']} (Google OAuth + PWA)")
    print(f"• Kết nối PostgreSQL   : {'ONLINE (Docker Postgres)' if report['postgres_connected'] else 'LOCAL MEDALLION FALLBACK (./data)'}")
    print("--------------------------------------------------------------------------------")
    print("1. LƯU TRỮ TRỰC TIẾP TRÊN Ổ CỨNG MÁY CHỦ (HOST BIND MOUNTS):")
    for k, v in report["storage_on_hard_drive"].items():
        print(
            f"   - {k:<22}: {v['file_count']:>3} files | {v['size_kb']:>8.2f} KB | Path: {v.get('abs_path', 'N/A')}"
        )
    print("--------------------------------------------------------------------------------")
    dm = report["data_pipeline_metrics"]
    err = report["scraper_error_and_dlq_summary"]
    sp = report["scraper_process_status"]
    hb = sp["heartbeat"]
    lr = sp["latest_crawl_run"] or {}
    print("2. TRẠNG THÁI TIẾN TRÌNH QUÉT, ĐỐI CHỨNG ĐA NGUỒN & NHẬT KÝ KHẮC PHỤC LỖI (DLQ):")
    print(
        f"   - Trạng thái Tiến trình (Heartbeat): {hb.get('state')} | Mode: {hb.get('trigger_mode', 'N/A')} | PID: {hb.get('pid', 'N/A')} | Cập nhật: {hb.get('updated_at_gmt07', 'N/A')}"
    )
    if hb.get("next_run_at_gmt07"):
        print(f"   - Lịch quét định kỳ tiếp theo     : {hb.get('next_run_at_gmt07')}")
    print(
        f"   - Phiên quét gần nhất (crawl_runs) : Tổng = {sp['total_crawl_runs_recorded']} phiên | Lúc = {lr.get('finished_at', 'N/A')} | Mode = {lr.get('trigger_mode', 'N/A')} | Status = {lr.get('status', 'N/A')}"
    )
    print(
        f"   - Master Jobs (Đã khử trùng)      : {dm['total_deduplicated_master_jobs']} bản ghi | Tổng Link gốc lưu vết: {dm['total_original_verification_links']} links"
    )
    print(
        f"   - Tin gộp đa cổng (Cross-site): {dm['cross_site_merged_jobs']} bản ghi | Công khai lương: {dm['jobs_with_explicit_salary']} ({dm['salary_disclosure_rate_pct']}%)"
    )
    print(
        f"   - Nhật ký Lỗi & Quét bù (DLQ): Tổng sự cố = {err['total_recorded_incidents']} | Đang chờ retry = {err['pending_retry_count']} | Đã khắc phục (RESOLVED) = {err['resolved_count']}"
    )
    print("--------------------------------------------------------------------------------")
    ml = report["econometrics_and_ml_health"]
    print("3. SỨC KHỎE MÔ HÌNH KINH TẾ LƯỢNG MINCER, HECKMAN & QUANTILE ML:")
    print(
        f"   - Mincer OLS R2 = {ml.get('mincer_ols_r2')} | Heckman IMR p-value = {ml.get('heckman_imr_pvalue')}"
    )
    print(
        f"   - Quantile ML ({ml.get('quantile_engine')}): R2 = {ml.get('quantile_r2')} | MAE = {ml.get('quantile_mae_vnd')} tr.VNĐ | PICP_80% = {ml.get('picp_80_pct')}%"
    )
    print("--------------------------------------------------------------------------------")
    rbac = report["rbac_users_summary"]
    mcp = report["mcp_ai_audit_summary"]
    print("4. PHÂN QUYỀN GOOGLE OAUTH (4-TIER RBAC) & NHẬT KÝ TRUY VẤN AI MCP:")
    print(
        f"   - Tổng số Users: {rbac['total_users']} | Phân bổ Role: {rbac['counts_by_role']} | Admin Whitelist: {rbac['configured_admin_emails']}"
    )
    print(
        f"   - Nhật ký AI MCP: Tổng = {mcp['total_logged_queries']} lệnh (ALLOWED = {mcp['allowed_queries']}, DENIED_RBAC = {mcp['denied_rbac_queries']})"
    )
    print("================================================================================")


if __name__ == "__main__":
    main()
