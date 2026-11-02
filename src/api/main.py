"""
FastAPI Backend, Google OAuth RBAC & MCP Server cho Hệ thống SkillValue.AI (Lab Thị trường Lao động Số):
Cung cấp các RESTful API & Giao thức MCP (Model Context Protocol) cho Ứng dụng Web Next.js (Port 3358) và Trợ lý AI:
1. `GET  /api/v1/health`: Kiểm tra trạng thái hệ thống, PostgreSQL, Port 3358 và Model Artifacts.
2. `POST /api/v1/auth/google-sync` & `GET /api/v1/auth/rbac-matrix`: Đồng bộ Google OAuth 2.0, cấp quyền 4 tầng
   (`VIEWER`, `RESEARCHER`, `OPERATOR`, `ADMIN`) và cấp khóa `mcp_api_token`.
3. `GET  /api/v1/mcp/tools`, `POST /api/v1/mcp/call`, `POST /api/v1/mcp/jsonrpc`: Giao thức MCP cho phép
   người dùng được cấp quyền (`RESEARCHER`, `OPERATOR`, `ADMIN`) truy vấn tương tác kho dữ liệu và mô hình từ AI.
4. `GET  /api/v1/market/overview` & `POST /api/v1/valuation/estimate`: Dự báo phân phối lương P10..P90, SHAP & UPS.
5. `GET  /api/v1/jobs/verified`: Truy xuất tin tuyển dụng khử trùng lặp kèm toàn bộ link gốc (`source_urls`).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.analytics.annual_report_engine import AnnualMarketReportEngine
from src.db.postgres_repo import PostgresJobRepository
from src.etl.normalizers import (
    GeoNormalizer,
    RoleAndTierClassifier,
    SalaryNormalizer,
    SkillExtractor,
)
from src.mcp.labor_market_mcp_server import SkillValueMCPServer
from src.models.train_pipeline import run_full_modeling_pipeline
from src.scrapers.error_logger import ScraperErrorLogger
from src.scrapers.scheduler import CrawlScheduler
from src.utils.time_sync import verify_international_time_sync

app = FastAPI(
    title="PropValue.AI - Vietnam Real Estate Market Lab & Ward-Level AVM API (34/63 Provinces)",
    description="API Định giá Tự động BĐS Cấp Phường/Xã (Hedonic OLS + Heckman 2-Step + LightGBM Quantile + Empirical Bayes Spatial Shrinkage), Hệ quy chiếu Song hành 34/63 Tỉnh Thành, 6 Phân khu Kinh tế (KCN, Làng nghề, Du lịch, CBD, CNC/TOD, Ven đô), Giải thích SHAP & Giao thức MCP Phân quyền RBAC",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ProfileValuationRequest(BaseModel):
    sector_pillar: str = Field(default="DE-01", description="Mã trụ cột ngành: DE-01, DE-02, DE-03, DE-04")
    canonical_role: str = Field(default="DATA_ANALYST", description="Vị trí chuẩn hóa")
    current_tier: str = Field(default="T3_JUNIOR", description="Tầng tháp hiện tại: T1_INTERN..T6_DIRECTOR")
    city_code: str = Field(default="HCM", description="Mã đô thị: HCM, HN, DN, BD, BN, REMOTE")
    work_mode: str = Field(default="HYBRID", description="ONSITE, HYBRID, REMOTE")
    exp_years: float = Field(default=2.0, ge=0.0, le=25.0)
    current_skills: List[str] = Field(
        default_factory=lambda: ["SK_EXCEL", "SK_SQL", "SK_POWERBI"],
        description="Danh sách mã kỹ năng hiện có",
    )
    valuation_year: int = Field(default=2026, ge=2021, le=2026, description="Năm tham chiếu định giá (2021..2026)")
    price_mode: str = Field(default="NOMINAL", description="NOMINAL (Danh nghĩa) hoặc REAL_CPI_2026 (Thực tế khử lạm phát CPI)")
    top_k: int = Field(default=5, ge=1, le=10)


class JobPostingDealRequest(BaseModel):
    company_name: str = Field(default="", description="Tên doanh nghiệp tuyển dụng")
    job_title: str = Field(description="Chức danh vị trí trên tin tuyển dụng")
    location_text: str = Field(default="TP. Hồ Chí Minh (Hybrid)", description="Địa điểm & hình thức làm việc")
    salary_text: str = Field(default="Thỏa thuận", description="Mức lương ghi trên JD (VD: '25 - 35 triệu', '$1,500 - $2,200', 'Thỏa thuận')")
    jd_full_text: str = Field(description="Toàn bộ nội dung Mô tả công việc (JD), Yêu cầu ứng viên & Phúc lợi")
    valuation_year: int = Field(default=2026, ge=2021, le=2026, description="Năm tham chiếu định giá (2021..2026)")
    price_mode: str = Field(default="NOMINAL", description="NOMINAL hoặc REAL_CPI_2026")


class GoogleAuthSyncRequest(BaseModel):
    email: str
    full_name: str = ""
    avatar_url: str = ""
    google_sub: str = ""


class UpdateUserRoleRequest(BaseModel):
    admin_email: str = Field(description="Email của Admin thực hiện cấp quyền")
    target_email: str = Field(description="Email của tài khoản cần đổi quyền")
    new_role: str = Field(description="VIEWER | RESEARCHER | OPERATOR | ADMIN")


class RotateMcpTokenRequest(BaseModel):
    email: str = Field(description="Email tài khoản cần tạo mới khóa MCP Token")


class McpToolCallRequest(BaseModel):
    user_identity: str = Field(
        description="Email đã xác thực Google OAuth hoặc khóa MCP Token (`skv_mcp_...`) của người dùng"
    )
    tool_name: str = Field(
        description="Tên công cụ MCP (VD: mcp_query_verified_jobs, mcp_query_econometrics_and_synergy)"
    )
    arguments: Dict[str, Any] = Field(default_factory=dict, description="Tham số truy vấn tương tác cho công cụ MCP")


class HistoricalBackfillRequest(BaseModel):
    from_year: int = Field(default=2021, ge=2020, le=2026, description="Năm bắt đầu quét hồi cứu dữ liệu quá khứ (2021..2026)")
    deep_pages: int = Field(default=15, ge=1, le=50, description="Số trang phân trang sâu (Deep Pagination) mỗi từ khóa")
    max_jobs_per_site: int = Field(default=300, ge=10, le=2000, description="Số JD tối đa mỗi cổng trong phiên Backfill")
    sites: Optional[List[str]] = Field(default=None, description="Danh sách cổng: topcv, itviec, careerviet, vietnamworks")
    pillars: Optional[List[str]] = Field(default=None, description="Danh sách trụ cột: DE-01..DE-04")
    cities: Optional[List[str]] = Field(default=None, description="Danh sách đô thị: HN, HCM, DN, BD")
    use_mock: bool = Field(default=False, description="Sử dụng mock transport an toàn hoặc chạy thực tế")
    seed_records: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Danh sách bản ghi lịch sử/mở rộng (2021–2026) cần lưu bền vững vào PostgreSQL và jobs_master.json",
    )


class CampaignPlanUpdateRequest(BaseModel):
    target_master_records: Optional[int] = Field(default=None, ge=1000, le=1000000)
    campaign_execution_days: Optional[int] = Field(default=None, ge=1, le=365)
    schedule_mode: Optional[str] = Field(default=None, description="interval | daily")
    interval_hours: Optional[float] = Field(default=None, ge=0.5, le=72.0)
    daily_run_hour: Optional[int] = Field(default=None, ge=0, le=23)
    max_pages_per_query: Optional[int] = Field(default=None, ge=1, le=100)
    unlimited_daily_crawl: Optional[bool] = Field(default=None)
    max_jobs_per_site_run: Optional[int] = Field(default=None, ge=0, le=50000)
    concurrency_per_site: Optional[int] = Field(default=None, ge=1, le=10)
    enable_wayback_cdx_2021_2024: Optional[bool] = Field(default=None)
    enable_sitemap_archive: Optional[bool] = Field(default=None)
    enabled_sites: Optional[List[str]] = Field(default=None)
    new_keyword: Optional[str] = Field(default=None)
    new_keyword_pillar: Optional[str] = Field(default="DE-01")
    full_retention_months: Optional[int] = Field(default=None, ge=1, le=60)
    sample_retention_ratio: Optional[float] = Field(default=None, ge=0.05, le=1.0)
    min_records_per_stratum: Optional[int] = Field(default=None, ge=5, le=500)
    execute_12m_sampling_prune: bool = Field(default=False)
    auto_tune_optimal_30days: bool = Field(default=False)


def _load_or_build_artifacts() -> Dict[str, Any]:
    artifact_path = Path("data/gold/model_artifacts.json")
    if artifact_path.exists():
        try:
            return json.loads(artifact_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return run_full_modeling_pipeline(min_training_samples=350)


@app.get("/api/v1/health")
def health_check() -> Dict[str, Any]:
    repo = PostgresJobRepository()
    mcp_server = SkillValueMCPServer(repo=repo)
    return {
        "status": "ok",
        "service": "propvalue-ai-backend",
        "webapp_default_port": 3359,
        "postgres_connected": repo.is_postgres_available(),
        "artifacts_ready": Path("data/gold/model_artifacts.json").exists(),
        "admin_emails": sorted(repo.get_configured_admin_emails()),
        "mcp_protocol_version": mcp_server.MCP_PROTOCOL_VERSION,
        "mcp_tools_count": len(mcp_server.list_tools()),
    }


@app.post("/api/v1/auth/google-sync")
def sync_google_oauth_user(req: GoogleAuthSyncRequest) -> Dict[str, Any]:
    """
    Đồng bộ thông tin người dùng đăng nhập qua Google OAuth 2.0 vào bảng `app_users`:
    - Tự động gán quyền `ADMIN` cho người dùng đầu tiên đăng nhập vào hệ thống.
    - Hoặc gán quyền `ADMIN` nếu email nằm trong `ADMIN_EMAILS` (ưu tiên) / `ADMIN_EMAIL`.
    - Gán quyền `RESEARCHER` (Khai thác dữ liệu & Query MCP tương tác) nếu email thuộc `RESEARCHER_EMAILS` / `.edu.vn`.
    - Mặc định gán quyền `VIEWER` (Xem & Định giá cá nhân).
    """
    repo = PostgresJobRepository()
    return repo.upsert_google_user(
        email=req.email,
        full_name=req.full_name,
        avatar_url=req.avatar_url,
        google_sub=req.google_sub,
    )


@app.get("/api/v1/auth/rbac-matrix")
def get_rbac_permissions_matrix() -> Dict[str, Any]:
    """Trả về ma trận phân quyền 4 tầng (VIEWER, RESEARCHER, OPERATOR, ADMIN) kèm quyền truy vấn MCP."""
    repo = PostgresJobRepository()
    mcp_server = SkillValueMCPServer(repo=repo)
    return {
        "default_port": 3359,
        "admin_emails": sorted(repo.get_configured_admin_emails()),
        "first_login_auto_admin": True,
        "roles_hierarchy": ["VIEWER", "RESEARCHER", "OPERATOR", "ADMIN"],
        "role_permissions": repo.ROLE_PERMISSIONS,
        "mcp_tools_permissions": [
            {
                "name": t["name"],
                "minimum_role": t["minimum_role"],
                "required_permission": t["required_permission"],
                "description": t["description"],
            }
            for t in mcp_server.list_tools()
        ],
    }


@app.get("/api/v1/auth/users")
def list_registered_users() -> Dict[str, Any]:
    """Liệt kê danh sách tài khoản đã đăng nhập hệ thống kèm Role, Permissions & MCP Token."""
    repo = PostgresJobRepository()
    users = repo.list_app_users()
    return {"total_users": len(users), "users": users}


@app.put("/api/v1/auth/users/role")
def change_user_role(req: UpdateUserRoleRequest) -> Dict[str, Any]:
    """Cho phép ADMIN nâng hoặc hạ quyền khai thác dữ liệu & truy vấn MCP của người dùng."""
    repo = PostgresJobRepository()
    # Đảm bảo tài khoản tồn tại trước khi nâng quyền
    repo.upsert_google_user(email=req.target_email)
    updated = repo.update_user_role(target_email=req.target_email, new_role=req.new_role)
    return {"status": "updated" if updated else "not_found", "user": updated}


@app.post("/api/v1/auth/mcp-token/rotate")
def rotate_user_mcp_token(req: RotateMcpTokenRequest) -> Dict[str, Any]:
    """Tạo mới hoặc xoay vòng khóa `mcp_api_token` (`skv_mcp_...`) cho người dùng."""
    repo = PostgresJobRepository()
    repo.upsert_google_user(email=req.email)
    token = repo.rotate_mcp_token(email=req.email)
    return {"email": req.email, "mcp_api_token": token}


# =========================================================================
# CÁC ENDPOINT MODEL CONTEXT PROTOCOL (MCP) TÍCH HỢP KIỂM TRA QUYỀN RBAC
# =========================================================================
@app.get("/api/v1/mcp/tools")
def list_mcp_tools_and_resources() -> Dict[str, Any]:
    """Liệt kê danh sách các công cụ MCP (`tools`) và tài nguyên (`resources`) hỗ trợ truy vấn từ AI."""
    mcp_server = SkillValueMCPServer()
    return {
        "protocol_version": mcp_server.MCP_PROTOCOL_VERSION,
        "server_name": "skillvalue-labor-market-mcp",
        "tools": mcp_server.list_tools(),
        "resources": mcp_server.list_resources(),
    }


@app.post("/api/v1/mcp/call")
def call_mcp_tool_interactive(
    req: McpToolCallRequest,
    x_mcp_identity: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """
    Thực thi công cụ truy vấn AI tương tác qua MCP sau khi kiểm tra nghiêm ngặt quyền RBAC
    (`VIEWER` vs `RESEARCHER` vs `OPERATOR` vs `ADMIN`).
    """
    mcp_server = SkillValueMCPServer()
    identity = (req.user_identity or x_mcp_identity or "").strip()
    return mcp_server.execute_tool(
        tool_name=req.tool_name,
        arguments=req.arguments,
        user_identity=identity,
    )


@app.post("/api/v1/mcp/jsonrpc")
def handle_mcp_jsonrpc_over_http(
    payload: Dict[str, Any],
    x_mcp_identity: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """
    Endpoint chuẩn JSON-RPC 2.0 cho phép các MCP Client kết nối qua HTTP (`initialize`, `tools/list`, `tools/call`).
    Hỗ trợ xác thực qua Header `X-MCP-Identity: <email_hoặc_token>` hoặc `Authorization: Bearer <skv_mcp_token>`.
    """
    bearer_ident = ""
    if authorization and authorization.lower().startswith("bearer "):
        bearer_ident = authorization[7:].strip()
    identity = (x_mcp_identity or bearer_ident or "").strip()

    mcp_server = SkillValueMCPServer()
    resp = mcp_server.handle_jsonrpc_message(payload, default_identity=identity)
    return resp or {"jsonrpc": "2.0", "status": "notification_ack"}


@app.get("/api/v1/mcp/audit-logs")
def get_mcp_audit_logs(limit: int = 30) -> Dict[str, Any]:
    """Trả về nhật ký kiểm toán các truy vấn AI tương tác qua MCP (`mcp_audit_logs`)."""
    repo = PostgresJobRepository()
    logs = repo.list_mcp_audit_logs(limit=limit)
    return {"total_logs": len(logs), "logs": logs}


@app.get("/api/v1/scraper/errors-and-timesync")
def get_scraper_error_logs_and_timesync() -> Dict[str, Any]:
    """
    Trả về trạng thái đồng bộ giờ GMT+07 so với Giờ Quốc tế (UTC/NTP),
    kèm danh sách nhật ký lỗi tiến trình quét (`scraper_error_logs` / `scraper_dlq_retry.json`),
    ảnh chụp HTML hiện trường (`logs/html_snapshots/`) và hướng dẫn khắc phục.
    """
    repo = PostgresJobRepository()
    error_logger = ScraperErrorLogger(repo=repo)
    items = error_logger.list_dlq_items()
    pending = [x for x in items if x.get("retry_status") == "PENDING_RETRY"]
    resolved = [x for x in items if x.get("retry_status") == "RESOLVED"]
    time_sync = verify_international_time_sync(probe_network_ntp=True)

    return {
        "time_sync": time_sync,
        "summary": {
            "total_incidents": len(items),
            "pending_retry_count": len(pending),
            "resolved_count": len(resolved),
            "remediation_report_path": "docs/audits/scraper-error-remediation-report.md",
            "jsonl_log_path": "logs/scraper_errors.jsonl",
        },
        "error_logs": items[:30],
    }


@app.post("/api/v1/scraper/retry-errors")
async def trigger_retry_failed_dlq_urls() -> Dict[str, Any]:
    """Kích hoạt quét bù tự động (`--mode retry-errors`) các URL đang nằm trong Hàng đợi Lỗi (DLQ)."""
    scheduler = CrawlScheduler()
    return await scheduler.execute_retry_failed_dlq() if hasattr(scheduler, "execute_retry_failed_dlq") else await scheduler.execute_retry_errors(use_mock=False)


@app.get("/api/v1/scraper/campaign-plan")
def get_scraper_100k_campaign_plan() -> Dict[str, Any]:
    """
    Trả về toàn bộ Kế hoạch Chiến dịch 100.000 Bản ghi (01/01/2021 – 31/10/2026) trong 30 ngày,
    bảng chỉ tiêu theo tuần lịch sử (304,3 tuần -> 329 bản ghi/tuần) & tuần chạy máy (25.000 bản ghi/tuần),
    kèm Đánh giá Tính Khả thi 5 Tiêu chí ("Liệu có cào được không?") và bảng phân bổ 2021..2026.
    """
    scheduler = CrawlScheduler()
    return scheduler.evaluate_campaign_100k_plan()


@app.put("/api/v1/scraper/campaign-plan")
def update_scraper_100k_campaign_plan(req: CampaignPlanUpdateRequest) -> Dict[str, Any]:
    """
    Cập nhật và căn chỉnh trực tiếp Kế hoạch Chiến dịch 100.000 Bản ghi từ Website vào `configs/scraper_settings.yaml`.
    Container `skillvalue_scraper_etl` sẽ tự động đọc lại cấu hình mới ở chu kỳ kế tiếp.
    """
    scheduler = CrawlScheduler()
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    updated_plan = scheduler.update_campaign_100k_plan(updates)
    return {
        "status": "updated",
        "plan": updated_plan,
    }


@app.get("/api/v1/scraper/debug-bundle")
def get_scraper_hourly_debug_bundle(auto_tune: bool = False) -> Dict[str, Any]:
    """
    Trích xuất Gói Thông tin Chẩn đoán & Debug 1 Giờ (`hourly_debug_bundle.json`)
    cho từng cổng BĐS kèm khối văn bản `copy_paste_for_ai` để gửi cho AI hiệu chỉnh.
    """
    scheduler = CrawlScheduler()
    return scheduler.generate_hourly_debug_bundle(auto_tune_ineffective=auto_tune)


@app.get("/api/v1/scraper/portal-audit")
def get_real_estate_portals_audit_and_plan() -> Dict[str, Any]:
    """
    Rà soát kỹ thuật các trang web đăng tin BĐS Việt Nam (Batdongsan.com.vn, Nha.Chotot.com,
    Alonhadat.com.vn, Mogi.vn, Muaban.net, Cafeland.vn), đánh giá độ phủ dữ liệu lịch sử 2021-2026
    và trả về Kế hoạch Tiến hành 4 Giai đoạn.
    """
    scheduler = CrawlScheduler()
    return scheduler.audit_real_estate_portals()


@app.post("/api/v1/scraper/auto-heal")
async def trigger_automated_error_remediation_and_audit(use_mock: bool = False) -> Dict[str, Any]:
    """
    Kích hoạt Quy trình Tự động Rà soát Lỗi, Hiệu chỉnh Cấu hình & Quét Bù DLQ (`--mode auto-heal`).
    """
    scheduler = CrawlScheduler()
    return await scheduler.execute_auto_heal_and_audit(use_mock=use_mock)


@app.post("/api/v1/scraper/backfill")
async def trigger_historical_backfill_crawl(req: HistoricalBackfillRequest) -> Dict[str, Any]:
    """
    Kích hoạt Chiến dịch Quét Dữ liệu Quá khứ (`--mode backfill` giai đoạn `2021..2026`):
    - Quét phân trang sâu (`deep_pages`) + Wayback CDX Archive (`from_year..nay`)
    - Lưu bền vững (Persist Upsert) các bản ghi thu thập được vào PostgreSQL `jobs_master` và `data/silver/jobs_master.json`.
    """
    scheduler = CrawlScheduler()
    backfill_res = await scheduler.execute_historical_backfill(
        sites=req.sites,
        pillars=req.pillars,
        cities=req.cities,
        deep_pages=req.deep_pages,
        max_jobs_per_site=req.max_jobs_per_site,
        wayback_from_year=req.from_year,
        use_mock=req.use_mock,
    )
    repo = PostgresJobRepository()
    persisted_seed_count = 0
    if req.seed_records:
        persisted_seed_count = repo.persist_external_scraped_records(req.seed_records)
    analytics = repo.fetch_scraped_records_analytics(limit=10000)
    return {
        "status": "completed",
        "persisted_seed_count": persisted_seed_count,
        "backfill_result": backfill_res,
        "scraped_analytics": analytics,
        "campaign_plan": scheduler.evaluate_campaign_100k_plan(),
    }


@app.get("/api/v1/market/overview")
def get_market_overview() -> Dict[str, Any]:
    """Trả về toàn bộ chỉ số Kinh tế lượng Mincer, Heckman, Quantile ML, SHAP và Synergy Lift."""
    return _load_or_build_artifacts()


@app.post("/api/v1/valuation/estimate")
def estimate_profile_and_upskilling(req: ProfileValuationRequest) -> Dict[str, Any]:
    """Định giá thu nhập kỳ vọng P10-P90 theo kỳ năm (2021..2026), giải thích SHAP và tính điểm ưu tiên học tập UPS."""
    mcp_server = SkillValueMCPServer()
    base_res = mcp_server._tool_estimate_profile(req.model_dump())
    year_adj = AnnualMarketReportEngine.get_year_valuation_adjustment(
        year=req.valuation_year,
        price_mode=req.price_mode,
        selected_skills=req.current_skills,
    )
    mult = float(year_adj["effective_multiplier"])
    if "salary_quantiles_vnd" in base_res and isinstance(base_res["salary_quantiles_vnd"], dict):
        base_res["salary_quantiles_vnd"] = {
            k: round(float(v) * mult, 2) for k, v in base_res["salary_quantiles_vnd"].items()
        }
    base_res["year_valuation_adjustment"] = year_adj
    return base_res


@app.post("/api/v1/valuation/deal-advisor")
def analyze_job_posting_and_recommend_salary_deal(req: JobPostingDealRequest) -> Dict[str, Any]:
    """
    Bóc tách toàn diện Tin Tuyển dụng (JD Parser + Normalizers), ước tính phân vị lương thị trường
    (P10..P90), phát hiện ép cấp bậc (Title Under-leveling) / ôm việc đa vị trí (Multi-Role Overload)
    và sinh Chiến lược 3 Mốc Đàm phán Lương (Floor P25 / Target P50-P65 / Anchor P65-P75) kèm kịch bản thương lượng.
    """
    sal_norm = SalaryNormalizer()
    geo_norm = GeoNormalizer(Path("configs/geo_vietnam_cities.yaml"))
    role_clf = RoleAndTierClassifier(Path("configs/roles_taxonomy.yaml"))
    skill_ext = SkillExtractor(Path("configs/skills_ontology.yaml"))

    sal_res = sal_norm.parse(req.salary_text)
    geo_res = geo_norm.parse(req.location_text, req.jd_full_text)
    import re as _re
    exp_match = _re.search(
        r"(\d+(?:\.\d+)?(?:\s*[-–~đếnto]+\s*\d+(?:\.\d+)?)?)\s*\+?\s*(?:năm|nam|years?)\s*(?:kinh nghiệm|kinh nghiem|experience)?",
        req.jd_full_text,
        _re.IGNORECASE,
    )
    exp_hint = exp_match.group(0) if exp_match else ""
    role_res = role_clf.classify(req.job_title, exp_hint, req.job_title)
    sk_res = skill_ext.extract(f"{req.job_title}\n{req.jd_full_text}")

    pillar = role_res.sector_pillar if role_res.sector_pillar != "UNCLASSIFIED" else "DE-01"
    canonical_role = role_res.canonical_role if role_res.canonical_role != "UNCLASSIFIED" else "DATA_ANALYST"
    matched_skills = sk_res.matched_skill_ids or ["SK_EXCEL", "SK_SQL", "SK_POWERBI"]

    # Kiểm tra ép cấp bậc (Title Under-leveling): Tiêu đề Junior/Fresher nhưng đòi hỏi >= 3.5 năm KN hoặc >= 6 kỹ năng chuyên sâu
    tier_order = ["T1_INTERN", "T2_FRESHER", "T3_JUNIOR", "T4_MIDDLE_SENIOR", "T5_LEAD_MANAGER", "T6_DIRECTOR"]
    detected_tier = role_res.career_tier
    implied_tier = detected_tier
    t_idx = tier_order.index(detected_tier) if detected_tier in tier_order else 2
    if t_idx <= 2 and (role_res.exp_years_mid >= 3.5 or len(matched_skills) >= 6):
        implied_tier = "T4_MIDDLE_SENIOR"
    elif t_idx <= 3 and role_res.exp_years_mid >= 6.0 and len(matched_skills) >= 7:
        implied_tier = "T5_LEAD_MANAGER"

    is_underleveled = tier_order.index(implied_tier) > t_idx

    mcp_server = SkillValueMCPServer()
    val_res = mcp_server._tool_estimate_profile(
        {
            "sector_pillar": pillar,
            "canonical_role": canonical_role,
            "current_tier": implied_tier,
            "city_code": geo_res.city_code if geo_res.city_code != "OTHER" else "HCM",
            "work_mode": geo_res.work_mode,
            "exp_years": role_res.exp_years_mid,
            "current_skills": matched_skills,
            "top_k": 5,
        }
    )
    year_adj = AnnualMarketReportEngine.get_year_valuation_adjustment(
        year=req.valuation_year,
        price_mode=req.price_mode,
        selected_skills=matched_skills,
    )
    mult = float(year_adj["effective_multiplier"])
    q_raw = val_res.get("salary_forecast_vnd", val_res.get("salary_quantiles_vnd", {}))
    p10 = round(float(q_raw.get("p10_vnd", q_raw.get("p10", 12.0))) * mult, 1)
    p25 = round(float(q_raw.get("p25_vnd", q_raw.get("p25", 15.0))) * mult, 1)
    p50 = round(float(q_raw.get("p50_median_vnd", q_raw.get("p50", 20.0))) * mult, 1)
    p75 = round(float(q_raw.get("p75_vnd", q_raw.get("p75", 25.0))) * mult, 1)
    p90 = round(float(q_raw.get("p90_vnd", q_raw.get("p90", 30.0))) * mult, 1)

    walk_away_floor = p25
    target_min = p50
    target_max = round(p50 + (p75 - p50) * 0.6, 1)
    anchor_min = round(p50 + (p75 - p50) * 0.55, 1)
    anchor_max = p75

    if sal_res.is_negotiable or sal_res.salary_mid_vnd is None:
        offer_status = "NEGOTIABLE_HIDDEN"
        offer_verdict = (
            f"Tin ghi 'Lương Thỏa thuận' — Dựa trên giải mã {len(matched_skills)} kỹ năng số và tầng {implied_tier}, "
            f"ngân sách thực tế của doanh nghiệp ước tính xoay quanh trung vị {p50} tr.VNĐ/tháng (Tứ phân vị: {p25} – {p75} tr.VNĐ)."
        )
    elif sal_res.salary_max_vnd is not None and sal_res.salary_max_vnd < p25:
        offer_status = "UNDERPAID_ALERT"
        offer_verdict = (
            f"CẢNH BÁO TRẢ DƯỚI GIÁ THỊ TRƯỜNG: Trần lương JD ({sal_res.salary_max_vnd} tr.VNĐ) thấp hơn cả phân vị P25 ({p25} tr.VNĐ). "
            f"Cần đàm phán kéo lên tối thiểu {p25} – {p50} tr.VNĐ."
        )
    elif sal_res.salary_min_vnd is not None and sal_res.salary_min_vnd >= p50:
        offer_status = "GENEROUS_PREMIUM"
        offer_verdict = (
            f"ĐÃI NGỘ HẤP DẪN (TRÊN TRUNG VỊ): Dải lương JD ({sal_res.salary_min_vnd} – {sal_res.salary_max_vnd} tr.VNĐ) "
            f"nằm ở nửa trên phân phối thị trường (P50 = {p50} tr.VNĐ). Có thể tự tin neo ở {anchor_min} – {anchor_max} tr.VNĐ."
        )
    else:
        offer_status = "FAIR_MARKET"
        offer_verdict = (
            f"BÁM SÁT THỊ TRƯỜNG: Dải lương công bố ({sal_res.salary_min_vnd} – {sal_res.salary_max_vnd} tr.VNĐ) "
            f"giao thoa tốt với trung vị thị trường (P50 = {p50} tr.VNĐ). Hãy đàm phán vào nửa trên dải lương ({target_min} – {target_max} tr.VNĐ)."
        )

    return {
        "parsed_job": {
            "company_name": req.company_name or "Doanh nghiệp Tuyển dụng",
            "job_title": req.job_title,
            "sector_pillar": pillar,
            "canonical_role": canonical_role,
            "detected_tier": detected_tier,
            "implied_workload_tier": implied_tier,
            "is_title_underleveled": is_underleveled,
            "exp_years_mid": role_res.exp_years_mid,
            "city_code": geo_res.city_code,
            "work_mode": geo_res.work_mode,
            "matched_skill_ids": matched_skills,
            "skills_by_layer": sk_res.skills_by_layer,
        },
        "employer_offer": {
            "raw_salary_text": req.salary_text,
            "is_negotiable": sal_res.is_negotiable,
            "currency_original": sal_res.currency_original,
            "salary_min_vnd": sal_res.salary_min_vnd,
            "salary_max_vnd": sal_res.salary_max_vnd,
            "salary_mid_vnd": sal_res.salary_mid_vnd,
            "offer_status": offer_status,
            "offer_verdict": offer_verdict,
        },
        "market_quantiles_vnd": {
            "p10": p10,
            "p25": p25,
            "p50": p50,
            "p75": p75,
            "p90": p90,
        },
        "negotiation_milestones_vnd": {
            "walk_away_floor_p25": walk_away_floor,
            "target_fair_deal_range": [target_min, target_max],
            "anchor_opening_ask_range": [anchor_min, anchor_max],
        },
        "shap_and_ups_details": val_res,
    }


@app.get("/api/v1/reports/annual-comparison")
def get_annual_comparative_report(base_year: int = 2021, target_year: int = 2026) -> Dict[str, Any]:
    """
    Trả về toàn bộ dữ liệu cho 8 Báo cáo Chuyên sâu Theo Từng Năm (2021–2026)
    và So sánh Liên Năm (`base_year` vs. `target_year`).
    """
    engine = AnnualMarketReportEngine()
    return engine.generate_annual_comparative_report(base_year=base_year, target_year=target_year)


@app.get("/api/v1/jobs/verified")
def list_verified_dedup_jobs(limit: int = 50) -> Dict[str, Any]:
    """
    Trả về danh sách các bản ghi tuyển dụng đã khử trùng lặp đa nguồn kèm theo
    TẤT CẢ các đường link gốc (`source_urls`, `source_links_meta`) để kiểm chứng & xác thực.
    """
    repo = PostgresJobRepository()
    jobs = repo.fetch_enriched_jobs(limit=limit)
    return {
        "total_returned": len(jobs),
        "jobs": [
            {
                "job_id": j.get("job_id"),
                "dedup_signature": j.get("dedup_signature"),
                "company_name_raw": j.get("company_name_raw"),
                "job_title_raw": j.get("job_title_raw"),
                "sector_pillar": j.get("sector_pillar"),
                "canonical_role": j.get("canonical_role"),
                "career_tier": j.get("career_tier"),
                "primary_city_code": j.get("primary_city_code"),
                "work_mode": j.get("work_mode"),
                "salary_mid_vnd": j.get("salary_mid_vnd"),
                "is_negotiable": j.get("is_negotiable"),
                "vacancy_duration_days": j.get("vacancy_duration_days"),
                "matched_skill_ids": j.get("matched_skill_ids", []),
                "source_sites": j.get("source_sites", [j.get("source_site")]),
                "source_urls": j.get("source_urls", [j.get("source_url")]),
                "source_links_meta": j.get("source_links_meta", []),
            }
            for j in jobs
        ],
    }


@app.get("/api/v1/jobs/scraped-analytics")
def get_scraped_records_analytics(
    limit: int = 10000,
    reprocess_bronze: bool = False,
) -> Dict[str, Any]:
    """
    Trả về thống kê tổng số bản ghi quét được trên hệ thống:
    - Số bản ghi theo thời gian (`by_time`)
    - Số bản ghi theo địa điểm (`by_location`)
    - Số bản ghi theo cổng tin đăng (`by_portal`)
    - Danh sách chi tiết nội dung từng bản ghi (`records`)
    """
    repo = PostgresJobRepository()
    return repo.fetch_scraped_records_analytics(
        limit=limit,
        reprocess_bronze=reprocess_bronze,
    )


class WardValuationRequest(BaseModel):
    raw_location: str = Field(
        default="Phường Dĩ An, Bình Dương (TP. Hồ Chí Minh mở rộng)",
        description="Địa chỉ tin đăng BĐS (Hỗ trợ song song 34 tỉnh mới, 63 tỉnh cũ, Quận/Huyện cũ và Phường/Xã)",
    )
    full_text: str = Field(
        default="Bán nhà riêng phân lô ngõ ô tô tránh cạnh KCN VSIP, sổ hồng riêng hoàn công",
        description="Nội dung mô tả chi tiết tin đăng BĐS để bóc tách phân khu kinh tế (KCN, Làng nghề, Du lịch, CBD, TOD)",
    )
    career_tier: str = Field(
        default="T3_JUNIOR",
        description="Tầng giá trị BĐS: T1_INTERN (Affordable) .. T6_DIRECTOR (Trophy Ultra)",
    )
    area_m2: float = Field(default=80.0, ge=10.0, le=5000.0, description="Diện tích đất/sàn (m²)")
    frontage_m: float = Field(default=5.0, ge=2.0, le=100.0, description="Mặt tiền (m)")
    alley_width_m: float = Field(default=6.0, ge=1.0, le=60.0, description="Độ rộng ngõ/đường trước nhà (m)")
    has_red_book: bool = Field(default=True, description="Có Sổ đỏ / Sổ hồng riêng hay chưa")
    observed_ward_samples: int = Field(default=18, ge=0, le=5000, description="Cỡ mẫu tin đăng thực tế tại Phường/Xã (n_w)")
    observed_ward_mean_price: Optional[float] = Field(
        default=None, description="Đơn giá trung bình quan sát tại Phường/Xã (Triệu VNĐ/m², tùy chọn)"
    )


@app.get("/api/v1/geo/provinces-34-63")
def get_dual_provinces_34_63_and_economic_zones() -> Dict[str, Any]:
    """
    Trả về Bảng Ánh xạ Song hành 34 Tỉnh/Thành mới (Nghị quyết 202/2025/QH15) <-> 63 Tỉnh/Thành lịch sử,
    6 Phân khu Kinh tế Đặc thù (CBD, KCN FDI, Làng nghề, Du lịch, CNC/TOD, Ven đô) và Cấu hình Định giá Cấp Phường/Xã.
    """
    geo_norm = GeoNormalizer(Path("configs/geo_vietnam_cities.yaml"))
    cfg = geo_norm.cfg
    provinces_34 = cfg.get("provinces_34_registry", {})
    total_legacy_63 = sum(len(v.get("merged_from_63", v.get("legacy_provinces_63", []))) for v in provinces_34.values())
    return {
        "version": cfg.get("version", "2.0"),
        "administrative_reform_basis": cfg.get("administrative_reform_basis", ""),
        "summary": {
            "total_provinces_34": len(provinces_34),
            "total_legacy_provinces_63_mapped": total_legacy_63,
            "total_economic_zones": len(cfg.get("economic_zones", {})),
        },
        "ward_valuation_engine": cfg.get("ward_valuation_engine", {}),
        "economic_zones": cfg.get("economic_zones", {}),
        "provinces_34_registry": provinces_34,
    }


@app.post("/api/v1/valuation/ward-estimate")
def estimate_ward_level_property_valuation(req: WardValuationRequest) -> Dict[str, Any]:
    """
    Định giá Bất động sản Cấp Phường/Xã (Ward-Level AVM) theo Hierarchical Empirical Bayes Spatial Shrinkage,
    kết hợp Phân giải Địa lý Kép (34 Tỉnh mới <-> 63 Tỉnh cũ) và 6 Phân khu Kinh tế Đặc thù.
    """
    geo_norm = GeoNormalizer(Path("configs/geo_vietnam_cities.yaml"))
    return geo_norm.estimate_ward_level_price(
        raw_location=req.raw_location,
        full_text=req.full_text,
        career_tier=req.career_tier,
        area_m2=req.area_m2,
        frontage_m=req.frontage_m,
        alley_width_m=req.alley_width_m,
        has_red_book=req.has_red_book,
        observed_ward_samples=req.observed_ward_samples,
        observed_ward_mean_price=req.observed_ward_mean_price,
    )

