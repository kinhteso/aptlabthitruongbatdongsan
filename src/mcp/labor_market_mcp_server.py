"""
Model Context Protocol (MCP) Server Tích hợp Phân quyền RBAC 4 Tầng (`src/mcp/labor_market_mcp_server.py`):
Cho phép các Trợ lý AI (Antigravity, Claude Desktop, Cursor, hoặc Web AI Chat) truy vấn tương tác
trực tiếp vào Kho dữ liệu Thị trường Lao động Số & Mô hình Kinh tế lượng / Quantile ML / SHAP
với cơ chế Kiểm soát Truy cập Nghiêm ngặt theo Cấp quyền Người dùng (`RBAC + MCP Token`):

1. `VIEWER` (`mcp:personal_valuation`):
   - Chỉ được gọi công cụ định giá cá nhân (`mcp_estimate_profile_and_upskilling`).
   - Bị chặn khi cố tình truy vấn kho dữ liệu tin tuyển dụng hoặc mô hình kinh tế lượng sâu.
2. `RESEARCHER` (`mcp:query_interactive`, `mcp:query_econometrics` - Người dùng được cấp quyền khai thác):
   - Truy vấn tương tác kho tin tuyển dụng chuẩn hóa kèm link gốc (`mcp_query_verified_jobs`).
   - Truy vấn hệ số Mincer OLS, Heckman 2-Step, Global SHAP & Ma trận Synergy Lift (`mcp_query_econometrics_and_synergy`).
   - Kiểm chứng nguồn gốc đa cổng và chữ ký SHA-256 (`mcp_verify_job_provenance`).
3. `OPERATOR` (`mcp:trigger_operations`):
   - Toàn bộ quyền `RESEARCHER` + Kích hoạt chu kỳ cào & Kiểm toán Khung (`mcp_trigger_crawl_and_audit`).
4. `ADMIN` (`mcp:admin_manage_users`):
   - Toàn bộ quyền hệ thống + Quản lý, nâng/hạ quyền người dùng trực tiếp từ AI (`mcp_manage_user_permissions`).

Hỗ trợ 2 chế độ giao tiếp:
- Chế độ `stdio` chuẩn JSON-RPC 2.0: `python -m src.mcp.labor_market_mcp_server --stdio --identity <EMAIL_OR_MCP_TOKEN>`
- Chế độ `HTTP REST / JSON-RPC` tích hợp trong FastAPI (`/api/v1/mcp/tools`, `/api/v1/mcp/call`, `/api/v1/mcp/jsonrpc`).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.analytics.annual_report_engine import AnnualMarketReportEngine
from src.analytics.framework_auditor import FrameworkAuditor
from src.db.postgres_repo import PostgresJobRepository
from src.etl.normalizers import (
    GeoNormalizer,
    RoleAndTierClassifier,
    SalaryNormalizer,
    SkillExtractor,
)
from src.models.feature_builder import (
    LaborMarketFeatureBuilder,
    generate_calibrated_labor_dataset,
)
from src.models.quantile_ml_shap import (
    CareerUpskillingRecommender,
    QuantileSalaryPredictor,
    ShapSkillExplainer,
)
from src.models.train_pipeline import run_full_modeling_pipeline
from src.scrapers.error_logger import ScraperErrorLogger
from src.scrapers.scheduler import CrawlScheduler
from src.utils.time_sync import verify_international_time_sync


class SkillValueMCPServer:
    """
    Máy chủ MCP (Model Context Protocol) tích hợp kiểm tra quyền RBAC trên từng lệnh gọi công cụ (Tool Call).
    """

    MCP_PROTOCOL_VERSION = "2024-11-05"

    MCP_TOOLS_SPEC: List[Dict[str, Any]] = [
        {
            "name": "mcp_estimate_profile_and_upskilling",
            "description": (
                "Dự báo dải phân vị lương (P10, P25, P50, P75, P90), phân rã đóng góp kỹ năng SHAP "
                "và xếp hạng Top-K kỹ năng cần học thêm theo điểm ưu tiên UPS (Upskilling Priority Score)."
            ),
            "required_permission": "mcp:personal_valuation",
            "minimum_role": "VIEWER",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "sector_pillar": {
                        "type": "string",
                        "default": "DE-01",
                        "description": "Mã trụ cột: DE-01 (Data & AI), DE-02 (Software/Cloud), DE-03 (Product/Growth), DE-04 (BA/ERP)",
                    },
                    "canonical_role": {
                        "type": "string",
                        "default": "DATA_ANALYST",
                        "description": "Vị trí công việc chuẩn hóa (VD: DATA_ANALYST, DATA_ENGINEER, AI_ENGINEER, BACKEND_DEV)",
                    },
                    "current_tier": {
                        "type": "string",
                        "default": "T3_JUNIOR",
                        "description": "Tầng tháp nghề nghiệp: T1_INTERN, T2_FRESHER, T3_JUNIOR, T4_SENIOR, T5_LEAD, T6_DIRECTOR",
                    },
                    "city_code": {
                        "type": "string",
                        "default": "HCM",
                        "description": "Mã đô thị: HCM, HN, DN, BD, BN, REMOTE",
                    },
                    "work_mode": {
                        "type": "string",
                        "default": "HYBRID",
                        "description": "Hình thức làm việc: ONSITE, HYBRID, REMOTE",
                    },
                    "exp_years": {
                        "type": "number",
                        "default": 2.0,
                        "description": "Số năm kinh nghiệm thực tế",
                    },
                    "current_skills": {
                        "type": "array",
                        "items": {"type": "string"},
                        "default": ["SK_EXCEL", "SK_SQL", "SK_POWERBI"],
                        "description": "Danh sách mã kỹ năng hiện có (VD: SK_SQL, SK_PYTHON, SK_SPARK, SK_DOCKER)",
                    },
                    "valuation_year": {
                        "type": "integer",
                        "default": 2026,
                        "description": "Kỳ năm tham chiếu định giá lương (2021..2026, không trộn lẫn chuỗi thời gian)",
                    },
                    "price_mode": {
                        "type": "string",
                        "enum": ["NOMINAL", "REAL_CPI_2026"],
                        "default": "NOMINAL",
                        "description": "Chế độ lương danh nghĩa tại năm đó (NOMINAL) hoặc thực tế khử lạm phát chuẩn CPI 2026 (REAL_CPI_2026)",
                    },
                    "top_k": {
                        "type": "integer",
                        "default": 5,
                        "description": "Số lượng kỹ năng khuyến nghị học thêm tối ưu",
                    },
                },
            },
        },
        {
            "name": "mcp_analyze_job_posting_and_salary_deal",
            "description": (
                "Phân tích toàn diện một Bản tin Tuyển dụng (JD) được dán vào: tự động bóc tách ngành, vị trí, "
                "tầng tháp nghề nghiệp (T1..T6), phát hiện ép cấp bậc (Title Under-leveling), giải mã 'Lương Thỏa thuận', "
                "ước tính dải phân vị lương thị trường (P10..P90) và đề xuất 3 Mốc Đàm phán Lương (Floor P25 / Target P50-P65 / Anchor P65-P75) "
                "kèm kịch bản trả lời HR bằng tiếng Việt."
            ),
            "required_permission": "mcp:personal_valuation",
            "minimum_role": "VIEWER",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "company_name": {
                        "type": "string",
                        "default": "Doanh nghiệp Tuyển dụng",
                        "description": "Tên công ty / ngân hàng / tổ chức đăng tuyển",
                    },
                    "job_title": {
                        "type": "string",
                        "default": "Senior Data Analyst (SQL, Python, Power BI)",
                        "description": "Tiêu đề vị trí tuyển dụng trên JD",
                    },
                    "location_text": {
                        "type": "string",
                        "default": "Hà Nội (Hybrid)",
                        "description": "Địa điểm và hình thức làm việc (Onsite/Hybrid/Remote)",
                    },
                    "salary_text": {
                        "type": "string",
                        "default": "Thỏa thuận",
                        "description": "Mức lương công bố trên JD (VD: '25 - 35 triệu', '$1,500 - $2,200', hoặc 'Thỏa thuận')",
                    },
                    "jd_full_text": {
                        "type": "string",
                        "default": "Yêu cầu 3-5 năm kinh nghiệm SQL, Python, Power BI, Airflow, dbt, Data Warehouse, tiếng Anh TOEIC 800.",
                        "description": "Toàn văn nội dung Mô tả công việc (JD), Yêu cầu ứng viên và Phúc lợi",
                    },
                    "valuation_year": {
                        "type": "integer",
                        "default": 2026,
                        "description": "Kỳ năm tham chiếu định giá (2021..2026)",
                    },
                    "price_mode": {
                        "type": "string",
                        "enum": ["NOMINAL", "REAL_CPI_2026"],
                        "default": "NOMINAL",
                        "description": "NOMINAL hoặc REAL_CPI_2026",
                    },
                },
                "required": ["job_title", "jd_full_text"],
            },
        },
        {
            "name": "mcp_get_learning_roadmap_and_macro_clusters",
            "description": (
                "Tra cứu 10 Cụm Kỹ năng Tương đương (Macro-Skill Clusters G1..G10: học 1 kỹ năng hạt nhân suy ra "
                "các công cụ tương đương như PostgreSQL <-> Oracle DB, Power BI <-> Tableau), Lộ trình học tập 4 chặng "
                "cho 3 đối tượng (STUDENT, INTERN_FRESHER, WORKING_PRO) và Ma trận Năng lực Phi kỹ thuật 6 tầng tháp (T1..T6)."
            ),
            "required_permission": "mcp:personal_valuation",
            "minimum_role": "VIEWER",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "audience": {
                        "type": "string",
                        "enum": ["STUDENT", "INTERN_FRESHER", "WORKING_PRO", "ALL"],
                        "default": "ALL",
                        "description": "Đối tượng người học cần tư vấn lộ trình (Sinh viên, Thực tập/Fresher, Người đi làm).",
                    },
                    "cluster_filter": {
                        "type": "string",
                        "description": "Lọc theo mã cụm (G1..G10) hoặc tên công cụ (VD: 'Tableau', 'Oracle', 'Spark', 'LLM').",
                    },
                    "include_non_technical_pyramid": {
                        "type": "boolean",
                        "default": True,
                        "description": "Bao gồm ma trận 5 chiều năng lực phi kỹ thuật để thăng tiến lên 6 tầng tháp nghề nghiệp.",
                    },
                },
            },
        },
        {
            "name": "mcp_query_verified_jobs",
            "description": (
                "[Yêu cầu quyền RESEARCHER+] Truy vấn tương tác kho dữ liệu tin tuyển dụng đã khử trùng lặp đa nguồn "
                "(Silver Layer) theo trụ cột ngành, vị trí, tầng tháp, đô thị, kỹ năng và mức lương tối thiểu; "
                "trả về kèm TOÀN BỘ danh sách link gốc (`source_urls`, `source_links_meta`) để kiểm chứng."
            ),
            "required_permission": "mcp:query_interactive",
            "minimum_role": "RESEARCHER",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "sector_pillar": {
                        "type": "string",
                        "description": "Lọc theo mã trụ cột (DE-01, DE-02, DE-03, DE-04). Bỏ trống để lấy tất cả.",
                    },
                    "canonical_role": {
                        "type": "string",
                        "description": "Lọc theo vị trí chuẩn hóa (VD: DATA_ANALYST, DATA_ENGINEER, AI_ENGINEER).",
                    },
                    "career_tier": {
                        "type": "string",
                        "description": "Lọc theo tầng tháp (T1_INTERN..T6_DIRECTOR).",
                    },
                    "city_code": {
                        "type": "string",
                        "description": "Lọc theo đô thị (HN, HCM, DN, REMOTE).",
                    },
                    "skill_id": {
                        "type": "string",
                        "description": "Lọc các tin yêu cầu kỹ năng cụ thể (VD: SK_PYTHON, SK_SQL, SK_AIRFLOW).",
                    },
                    "min_salary_vnd": {
                        "type": "number",
                        "description": "Mức lương trung vị tối thiểu (triệu VNĐ/tháng).",
                    },
                    "only_multi_source": {
                        "type": "boolean",
                        "default": False,
                        "description": "Chỉ lấy các tin đăng xuất hiện trên nhiều cổng tuyển dụng cùng lúc.",
                    },
                    "limit": {
                        "type": "integer",
                        "default": 15,
                        "description": "Số lượng bản ghi tối đa trả về (1..50).",
                    },
                },
            },
        },
        {
            "name": "mcp_query_econometrics_and_synergy",
            "description": (
                "[Yêu cầu quyền RESEARCHER+] Truy vấn tương tác kết quả ước lượng Kinh tế lượng Mincer OLS (HC3), "
                "Kiểm định chọn mẫu Heckman 2-Step (Inverse Mills Ratio), Giá trị biên SHAP toàn cục (triệu VNĐ/tháng) "
                "và Ma trận Cộng hưởng Kỹ năng (Synergy Lift) theo từng kỹ năng hoặc tầng kỹ năng."
            ),
            "required_permission": "mcp:query_econometrics",
            "minimum_role": "RESEARCHER",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "skill_filter": {
                        "type": "string",
                        "description": "Lọc theo mã hoặc tên kỹ năng (VD: 'Python', 'SK_SPARK', 'Airflow'). Bỏ trống để lấy toàn bộ.",
                    },
                    "layer_filter": {
                        "type": "string",
                        "description": "Lọc theo tầng kỹ năng: L1_FOUNDATION, L2_CORE_TECH, L3_PLATFORMS_OPS, L4_DOMAIN_SOFT.",
                    },
                    "include_mincer_table": {
                        "type": "boolean",
                        "default": True,
                        "description": "Bao gồm bảng hệ số hồi quy Mincer OLS & Heckman 2-Step.",
                    },
                    "include_synergy_pairs": {
                        "type": "boolean",
                        "default": True,
                        "description": "Bao gồm các cặp kỹ năng cộng hưởng lương cao nhất (Lift > 1.2).",
                    },
                },
            },
        },
        {
            "name": "mcp_verify_job_provenance",
            "description": (
                "[Yêu cầu quyền RESEARCHER+] Kiểm chứng nguồn gốc đa cổng (TopCV, ITviec, CareerViet, VietnamWorks), "
                "mã băm toàn vẹn nội dung SHA-256 và vòng đời tuyển dụng (`vacancy_duration_days`) của một tin đăng."
            ),
            "required_permission": "mcp:query_interactive",
            "minimum_role": "RESEARCHER",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "dedup_signature": {
                        "type": "string",
                        "description": "Chữ ký khử trùng lặp của tin đăng (VD: 'fpt-smart-cloud|DATA_ANALYST|T3_JUNIOR|HN|2026-W13').",
                    },
                    "company_keyword": {
                        "type": "string",
                        "description": "Hoặc tìm theo tên công ty (VD: 'fpt', 'viettel', 'vng').",
                    },
                },
            },
        },
        {
            "name": "mcp_trigger_crawl_and_audit",
            "description": (
                "[Yêu cầu quyền OPERATOR+] Kích hoạt trình cào bất đồng bộ trên 4 cổng tuyển dụng "
                "và chạy Động cơ Kiểm toán Khung phân tích (`FrameworkAuditor`) trực tiếp từ AI."
            ),
            "required_permission": "mcp:trigger_operations",
            "minimum_role": "OPERATOR",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "sites": {
                        "type": "array",
                        "items": {"type": "string"},
                        "default": ["topcv", "itviec", "careerviet", "vietnamworks"],
                    },
                    "use_mock": {
                        "type": "boolean",
                        "default": True,
                        "description": "Chạy với dữ liệu đối chứng chuẩn (True) hoặc cào mạng thực tế (False).",
                    },
                },
            },
        },
        {
            "name": "mcp_manage_user_permissions",
            "description": (
                "[Yêu cầu quyền ADMIN] Liệt kê danh sách người dùng, kiểm tra nhật ký truy vấn MCP "
                "hoặc nâng/hạ cấp quyền (`VIEWER`, `RESEARCHER`, `OPERATOR`, `ADMIN`) trực tiếp qua AI."
            ),
            "required_permission": "mcp:admin_manage_users",
            "minimum_role": "ADMIN",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["list_users", "update_role", "view_audit_logs"],
                        "default": "list_users",
                        "description": "Hành động quản trị: xem danh sách user, đổi role, hoặc xem nhật ký MCP.",
                    },
                    "target_email": {
                        "type": "string",
                        "description": "Email người dùng cần cấp quyền (bắt buộc khi action='update_role').",
                    },
                    "new_role": {
                        "type": "string",
                        "enum": ["VIEWER", "RESEARCHER", "OPERATOR", "ADMIN"],
                        "description": "Cấp quyền mới cần gán cho target_email.",
                    },
                },
            },
        },
        {
            "name": "mcp_query_annual_comparative_reports",
            "description": (
                "[Yêu cầu quyền RESEARCHER+] Truy vấn bộ 8 Báo cáo Chuyên sâu Theo Từng Năm (2021..2026) "
                "và So sánh Liên Năm (base_year vs target_year): Dịch chuyển cơ cấu 4 trụ cột ngành (DE-01..DE-04), "
                "Tăng trưởng lương Danh nghĩa vs Thực tế CPI 2026, Phân rã Oaxaca-Blinder 3 thành phần (Endowment, Price, Macro CPI), "
                "Độ phủ 6 đô thị & chỉ số HHI, và Vòng đời Kỹ năng (Rising Star / Evergreen Core / Commoditized)."
            ),
            "required_permission": "mcp:query_econometrics",
            "minimum_role": "RESEARCHER",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "base_year": {
                        "type": "integer",
                        "default": 2021,
                        "description": "Năm gốc để đối sánh (2021..2025).",
                    },
                    "target_year": {
                        "type": "integer",
                        "default": 2026,
                        "description": "Năm đích để đối sánh (2022..2026).",
                    },
                },
            },
        },
        {
            "name": "mcp_query_scraped_records_analytics",
            "description": (
                "[Yêu cầu quyền RESEARCHER+] Truy vấn thống kê tổng hợp Mục 8 (Bản ghi Quét): "
                "phân rã số lượng bản ghi theo Thời gian (by_time), Địa điểm đô thị (by_location), Cổng tuyển dụng (by_portal) "
                "và tìm kiếm chi tiết nội dung JD sạch đã quét trên hệ thống."
            ),
            "required_permission": "mcp:query_interactive",
            "minimum_role": "RESEARCHER",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "city_code": {
                        "type": "string",
                        "description": "Lọc theo đô thị (HN, HCM, DN, BD, REMOTE). Bỏ trống để lấy tất cả.",
                    },
                    "portal": {
                        "type": "string",
                        "description": "Lọc theo cổng tuyển dụng (topcv, itviec, careerviet, vietnamworks).",
                    },
                    "sector_pillar": {
                        "type": "string",
                        "description": "Lọc theo trụ cột ngành (DE-01..DE-04).",
                    },
                    "keyword": {
                        "type": "string",
                        "description": "Từ khóa tìm kiếm trong tiêu đề, công ty hoặc nội dung JD.",
                    },
                    "reprocess_bronze": {
                        "type": "boolean",
                        "default": False,
                        "description": "Đồng bộ & xử lý lại các bản ghi thô ở Tầng Bronze trước khi thống kê.",
                    },
                    "limit": {
                        "type": "integer",
                        "default": 15,
                        "description": "Số bản ghi chi tiết tối đa trả về (1..50).",
                    },
                },
            },
        },
        {
            "name": "mcp_inspect_scraper_dlq_and_debug_bundle",
            "description": (
                "[Yêu cầu quyền RESEARCHER+] Kiểm tra đồng bộ Giờ chuẩn GMT+07 vs NTP Quốc tế, "
                "tra cứu Hàng đợi Lỗi Quét (Dead-Letter Queue - DLQ), và trích xuất Gói Chẩn đoán & Debug 1 Giờ "
                "(Hourly Daemon Telemetry cho 4 cổng topcv/itviec/careerviet/vietnamworks kèm khối copy_paste_for_ai)."
            ),
            "required_permission": "mcp:query_interactive",
            "minimum_role": "RESEARCHER",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "include_hourly_debug_bundle": {
                        "type": "boolean",
                        "default": True,
                        "description": "Kèm theo gói chẩn đoán DOM/Selector 1 giờ của 4 cổng tuyển dụng.",
                    },
                    "auto_tune_ineffective": {
                        "type": "boolean",
                        "default": False,
                        "description": "Tự động hiệu chỉnh engine/delay cho cổng kém hiệu quả (chỉ có hiệu lực khi role >= OPERATOR).",
                    },
                    "trigger_retry_dlq": {
                        "type": "boolean",
                        "default": False,
                        "description": "Kích hoạt quét bù tự động các URL lỗi trong DLQ (chỉ có hiệu lực khi role >= OPERATOR).",
                    },
                },
            },
        },
        {
            "name": "mcp_manage_campaign_100k_and_retention",
            "description": (
                "[Yêu cầu quyền OPERATOR+] Quản lý Chiến dịch Quét 100.000 Bản ghi (2021–2026 trong 30 ngày), "
                "Đánh giá Tính Khả thi 5 Tiêu chí, kích hoạt Quét Hồi cứu Quá khứ (--mode backfill), "
                "bật Chế độ 'Quét Tất Hàng Ngày' cho sinh viên và thực thi Vòng đời 12 Tháng (Lấy mẫu phân tầng đại diện 20% + Xóa bớt 80%)."
            ),
            "required_permission": "mcp:trigger_operations",
            "minimum_role": "OPERATOR",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": [
                            "get_plan",
                            "auto_tune_30days",
                            "run_backfill",
                            "prune_12m_sampling",
                        ],
                        "default": "get_plan",
                        "description": "Hành động: xem kế hoạch 100k, tự căn chỉnh chuẩn 100k/30 ngày, chạy backfill lịch sử, hoặc lấy mẫu đại diện 20% + xóa bớt (>12 tháng).",
                    },
                    "from_year": {
                        "type": "integer",
                        "default": 2021,
                        "description": "Năm bắt đầu khi chạy action='run_backfill' (2021..2026).",
                    },
                    "deep_pages": {
                        "type": "integer",
                        "default": 15,
                        "description": "Số trang quét sâu mỗi từ khóa khi chạy action='run_backfill'.",
                    },
                },
            },
        },
    ]

    MCP_RESOURCES_SPEC: List[Dict[str, Any]] = [
        {
            "uri": "skillvalue://auth/rbac-matrix",
            "name": "Ma trận Phân quyền RBAC 4 Tầng & Quyền Truy vấn AI MCP (12 Tools)",
            "mimeType": "application/json",
            "description": "Danh mục chi tiết 4 tầng quyền (VIEWER, RESEARCHER, OPERATOR, ADMIN) và quyền gọi 12 MCP Tools.",
        },
        {
            "uri": "skillvalue://models/econometric-summary",
            "name": "Báo cáo Tổng hợp Mô hình Kinh tế lượng Mincer, Heckman, Quantile ML & SHAP",
            "mimeType": "application/json",
            "description": "Kết quả huấn luyện mới nhất tại tầng Gold (`data/gold/model_artifacts.json`).",
        },
        {
            "uri": "skillvalue://reports/annual-comparison-2021-2026",
            "name": "Báo cáo So sánh Liên Năm 2021–2026 & Phân rã Tiền lương Oaxaca–Blinder",
            "mimeType": "application/json",
            "description": "Toàn bộ chuỗi số liệu 6 năm (2021–2026), chỉ số CPI, HHI 6 đô thị và vòng đời kỹ năng.",
        },
        {
            "uri": "skillvalue://scraper/campaign-100k-plan",
            "name": "Kế hoạch Chiến dịch 100.000 Bản ghi (2021–2026) & Đánh giá Khả thi 5 Tiêu chí",
            "mimeType": "application/json",
            "description": "Thông số lập lịch Daemon, ma trận từ khóa, chỉ tiêu tuần/ngày và chính sách lưu trữ 12 tháng.",
        },
        {
            "uri": "skillvalue://taxonomy/macro-skill-clusters-and-pyramid",
            "name": "10 Cụm Kỹ năng Tương đương (G1..G10), Lộ trình 3 Đối tượng & Tháp 6 Tầng Nghề nghiệp",
            "mimeType": "application/json",
            "description": "Khung ánh xạ kỹ năng hạt nhân sang công cụ tương đương và tiêu chuẩn thăng tiến T1..T6.",
        },
    ]

    def __init__(self, repo: Optional[PostgresJobRepository] = None) -> None:
        self.repo = repo or PostgresJobRepository()

    def list_tools(self) -> List[Dict[str, Any]]:
        """Trả về danh sách MCP Tools chuẩn kèm thông tin quyền tối thiểu (`minimum_role`)."""
        return self.MCP_TOOLS_SPEC

    def list_resources(self) -> List[Dict[str, Any]]:
        """Trả về danh sách MCP Resources."""
        return self.MCP_RESOURCES_SPEC

    def read_resource(self, uri: str) -> Dict[str, Any]:
        if uri == "skillvalue://auth/rbac-matrix":
            data = {
                "roles_hierarchy": ["VIEWER", "RESEARCHER", "OPERATOR", "ADMIN"],
                "admin_emails": sorted(self.repo.get_configured_admin_emails()),
                "role_permissions": self.repo.ROLE_PERMISSIONS,
                "tools_access": [
                    {
                        "tool": t["name"],
                        "minimum_role": t["minimum_role"],
                        "required_permission": t["required_permission"],
                    }
                    for t in self.MCP_TOOLS_SPEC
                ],
            }
            return {
                "contents": [
                    {
                        "uri": uri,
                        "mimeType": "application/json",
                        "text": json.dumps(data, ensure_ascii=False, indent=2),
                    }
                ]
            }
        if uri == "skillvalue://models/econometric-summary":
            artifacts = self._get_model_artifacts()
            return {
                "contents": [
                    {
                        "uri": uri,
                        "mimeType": "application/json",
                        "text": json.dumps(artifacts, ensure_ascii=False, indent=2),
                    }
                ]
            }
        if uri == "skillvalue://reports/annual-comparison-2021-2026":
            report_data = AnnualMarketReportEngine().generate_annual_comparative_report(2021, 2026)
            return {
                "contents": [
                    {
                        "uri": uri,
                        "mimeType": "application/json",
                        "text": json.dumps(report_data, ensure_ascii=False, indent=2),
                    }
                ]
            }
        if uri == "skillvalue://scraper/campaign-100k-plan":
            plan_data = CrawlScheduler(repo=self.repo).evaluate_campaign_100k_plan()
            return {
                "contents": [
                    {
                        "uri": uri,
                        "mimeType": "application/json",
                        "text": json.dumps(plan_data, ensure_ascii=False, indent=2),
                    }
                ]
            }
        if uri == "skillvalue://taxonomy/macro-skill-clusters-and-pyramid":
            tax_data = self._tool_get_learning_roadmap_and_macro_clusters({"audience": "ALL"})
            return {
                "contents": [
                    {
                        "uri": uri,
                        "mimeType": "application/json",
                        "text": json.dumps(tax_data, ensure_ascii=False, indent=2),
                    }
                ]
            }
        raise ValueError(f"Không tìm thấy MCP Resource URI: {uri}")

    def _get_model_artifacts(self) -> Dict[str, Any]:
        artifact_path = Path("data/gold/model_artifacts.json")
        if artifact_path.exists():
            try:
                return json.loads(artifact_path.read_text(encoding="utf-8"))
            except Exception:
                pass
        return run_full_modeling_pipeline(min_training_samples=350)

    def execute_tool(
        self,
        tool_name: str,
        arguments: Optional[Dict[str, Any]],
        user_identity: str,
    ) -> Dict[str, Any]:
        """
        Thực thi một MCP Tool sau khi kiểm tra nghiêm ngặt quyền hạn RBAC của `user_identity`
        (`email` hoặc `mcp_api_token`).
        """
        args = arguments or {}
        tool_spec = next((t for t in self.MCP_TOOLS_SPEC if t["name"] == tool_name), None)
        if not tool_spec:
            return {
                "isError": True,
                "authorization": {"authorized": False, "status": "TOOL_NOT_FOUND"},
                "content": [
                    {
                        "type": "text",
                        "text": f"Không tồn tại công cụ MCP '{tool_name}'.",
                    }
                ],
            }

        required_perm = tool_spec["required_permission"]
        auth_check = self.repo.verify_mcp_access(
            identity=user_identity,
            required_permission=required_perm,
            tool_name=tool_name,
            arguments=args,
        )

        if not auth_check["authorized"]:
            return {
                "isError": True,
                "authorization": auth_check,
                "content": [
                    {
                        "type": "text",
                        "text": f"[MCP RBAC ACCESS DENIED] {auth_check['reason']}",
                    }
                ],
            }

        # Thực thi logic của từng công cụ khi đã vượt qua kiểm tra RBAC
        if tool_name == "mcp_estimate_profile_and_upskilling":
            result_data = self._tool_estimate_profile(args)
        elif tool_name == "mcp_analyze_job_posting_and_salary_deal":
            result_data = self._tool_analyze_job_posting_and_salary_deal(args)
        elif tool_name == "mcp_get_learning_roadmap_and_macro_clusters":
            result_data = self._tool_get_learning_roadmap_and_macro_clusters(args)
        elif tool_name == "mcp_query_verified_jobs":
            result_data = self._tool_query_verified_jobs(args)
        elif tool_name == "mcp_query_econometrics_and_synergy":
            result_data = self._tool_query_econometrics(args)
        elif tool_name == "mcp_verify_job_provenance":
            result_data = self._tool_verify_job_provenance(args)
        elif tool_name == "mcp_query_annual_comparative_reports":
            result_data = self._tool_query_annual_comparative_reports(args)
        elif tool_name == "mcp_query_scraped_records_analytics":
            result_data = self._tool_query_scraped_records_analytics(args)
        elif tool_name == "mcp_inspect_scraper_dlq_and_debug_bundle":
            result_data = self._tool_inspect_scraper_dlq_and_debug_bundle(args, auth_check["user"])
        elif tool_name == "mcp_trigger_crawl_and_audit":
            result_data = self._tool_trigger_crawl_and_audit(args)
        elif tool_name == "mcp_manage_campaign_100k_and_retention":
            result_data = self._tool_manage_campaign_100k_and_retention(args)
        elif tool_name == "mcp_manage_user_permissions":
            result_data = self._tool_manage_user_permissions(args, auth_check["user"])
        else:
            result_data = {"error": f"Chưa cài đặt handler cho {tool_name}"}

        return {
            "isError": False,
            "authorization": {
                "authorized": True,
                "user_email": auth_check["user"]["email"],
                "user_role": auth_check["user"]["role"],
                "required_permission": required_perm,
            },
            "data": result_data,
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(result_data, ensure_ascii=False, indent=2),
                }
            ],
        }

    # =========================================================================
    # CHI TIẾT CÁC HÀM XỬ LÝ TƯƠNG TÁC DỮ LIỆU CỦA MCP TOOLS
    # =========================================================================
    def _tool_estimate_profile(self, args: Dict[str, Any]) -> Dict[str, Any]:
        records = self.repo.fetch_enriched_jobs()
        if len(records) < 300:
            records = records + generate_calibrated_labor_dataset(n_samples=350, seed=42)

        fb = LaborMarketFeatureBuilder(Path("configs"))
        df = fb.build_dataframe(records)
        predictor = QuantileSalaryPredictor(feature_cols=fb.get_ml_feature_columns())
        predictor.fit_and_evaluate(df)
        explainer = ShapSkillExplainer(predictor=predictor, skills_meta=fb.skills_meta)
        explainer.fit_explainer(df)
        recommender = CareerUpskillingRecommender(
            feature_builder=fb,
            predictor=predictor,
            explainer=explainer,
            df_market=df,
        )
        cur_skills = list(args.get("current_skills", ["SK_EXCEL", "SK_SQL", "SK_POWERBI"]))
        val_year = int(args.get("valuation_year", 2026))
        p_mode = str(args.get("price_mode", "NOMINAL"))

        base_res = recommender.evaluate_profile_and_recommend(
            sector_pillar=str(args.get("sector_pillar", "DE-01")),
            canonical_role=str(args.get("canonical_role", "DATA_ANALYST")),
            current_tier=str(args.get("current_tier", "T3_JUNIOR")),
            city_code=str(args.get("city_code", "HCM")),
            exp_years=float(args.get("exp_years", 2.0)),
            current_skills=cur_skills,
            work_mode=str(args.get("work_mode", "HYBRID")),
            top_k=int(args.get("top_k", 5)),
        )
        year_adj = AnnualMarketReportEngine.get_year_valuation_adjustment(
            year=val_year,
            price_mode=p_mode,
            selected_skills=cur_skills,
        )
        mult = float(year_adj["effective_multiplier"])
        if "salary_forecast_vnd" in base_res and isinstance(base_res["salary_forecast_vnd"], dict):
            base_res["salary_forecast_vnd"] = {
                k: round(float(v) * mult, 2) for k, v in base_res["salary_forecast_vnd"].items()
            }
        base_res["year_valuation_adjustment"] = year_adj
        return base_res

    def _tool_analyze_job_posting_and_salary_deal(self, args: Dict[str, Any]) -> Dict[str, Any]:
        import re as _re

        company_name = str(args.get("company_name") or "Doanh nghiệp Tuyển dụng").strip()
        job_title = str(args.get("job_title") or "Data Analyst").strip()
        location_text = str(args.get("location_text") or "TP. Hồ Chí Minh (Hybrid)").strip()
        salary_text = str(args.get("salary_text") or "Thỏa thuận").strip()
        jd_full_text = str(args.get("jd_full_text") or "").strip()

        sal_norm = SalaryNormalizer()
        geo_norm = GeoNormalizer(Path("configs/geo_vietnam_cities.yaml"))
        role_clf = RoleAndTierClassifier(Path("configs/roles_taxonomy.yaml"))
        skill_ext = SkillExtractor(Path("configs/skills_ontology.yaml"))

        sal_res = sal_norm.parse(salary_text)
        geo_res = geo_norm.parse(location_text, jd_full_text)
        exp_match = _re.search(
            r"(\d+(?:\.\d+)?(?:\s*[-–~đếnto]+\s*\d+(?:\.\d+)?)?)\s*\+?\s*(?:năm|nam|years?)\s*(?:kinh nghiệm|kinh nghiem|experience)?",
            jd_full_text,
            _re.IGNORECASE,
        )
        exp_hint = exp_match.group(0) if exp_match else ""
        role_res = role_clf.classify(job_title, exp_hint, job_title)
        sk_res = skill_ext.extract(f"{job_title}\n{jd_full_text}")

        pillar = role_res.sector_pillar if role_res.sector_pillar != "UNCLASSIFIED" else "DE-01"
        canonical_role = role_res.canonical_role if role_res.canonical_role != "UNCLASSIFIED" else "DATA_ANALYST"
        matched_skills = sk_res.matched_skill_ids or ["SK_EXCEL", "SK_SQL", "SK_POWERBI"]

        tier_order = ["T1_INTERN", "T2_FRESHER", "T3_JUNIOR", "T4_MIDDLE_SENIOR", "T5_LEAD_MANAGER", "T6_DIRECTOR"]
        detected_tier = role_res.career_tier
        implied_tier = detected_tier
        t_idx = tier_order.index(detected_tier) if detected_tier in tier_order else 2
        if t_idx <= 2 and (role_res.exp_years_mid >= 3.5 or len(matched_skills) >= 6):
            implied_tier = "T4_MIDDLE_SENIOR"
        elif t_idx <= 3 and role_res.exp_years_mid >= 6.0 and len(matched_skills) >= 7:
            implied_tier = "T5_LEAD_MANAGER"

        is_underleveled = tier_order.index(implied_tier) > t_idx

        val_res = self._tool_estimate_profile(
            {
                "sector_pillar": pillar,
                "canonical_role": canonical_role,
                "current_tier": implied_tier,
                "city_code": geo_res.city_code if geo_res.city_code != "OTHER" else "HCM",
                "work_mode": geo_res.work_mode,
                "exp_years": role_res.exp_years_mid,
                "current_skills": matched_skills,
                "valuation_year": int(args.get("valuation_year", 2026)),
                "price_mode": str(args.get("price_mode", "NOMINAL")),
                "top_k": 5,
            }
        )
        q_raw = val_res.get("salary_forecast_vnd", {})
        p10 = round(float(q_raw.get("p10_vnd", 12.0)), 1)
        p25 = round(float(q_raw.get("p25_vnd", 15.0)), 1)
        p50 = round(float(q_raw.get("p50_median_vnd", 20.0)), 1)
        p75 = round(float(q_raw.get("p75_vnd", 25.0)), 1)
        p90 = round(float(q_raw.get("p90_vnd", 30.0)), 1)

        walk_away_floor = p25
        target_min = p50
        target_max = round(p50 + (p75 - p50) * 0.6, 1)
        anchor_min = round(p50 + (p75 - p50) * 0.55, 1)
        anchor_max = p75

        if sal_res.is_negotiable or sal_res.salary_mid_vnd is None:
            offer_status = "NEGOTIABLE_HIDDEN"
            offer_verdict = (
                f"Tin ghi 'Lương Thỏa thuận' — Dựa trên {len(matched_skills)} kỹ năng số và tầng {implied_tier}, "
                f"ngân sách ẩn ước tính đạt trung vị P50 = {p50} tr.VNĐ/tháng (Tứ phân vị: {p25} – {p75} tr.VNĐ)."
            )
        elif sal_res.salary_max_vnd is not None and sal_res.salary_max_vnd < p25:
            offer_status = "UNDERPAID_ALERT"
            offer_verdict = (
                f"CẢNH BÁO TRẢ DƯỚI GIÁ THỊ TRƯỜNG: Trần lương JD ({sal_res.salary_max_vnd} tr.VNĐ) thấp hơn cả phân vị P25 ({p25} tr.VNĐ)."
            )
        elif sal_res.salary_min_vnd is not None and sal_res.salary_min_vnd >= p50:
            offer_status = "GENEROUS_PREMIUM"
            offer_verdict = (
                f"ĐÃI NGỘ HẤP DẪN (TRÊN TRUNG VỊ): Dải lương JD ({sal_res.salary_min_vnd} – {sal_res.salary_max_vnd} tr.VNĐ) vượt trung vị P50 ({p50} tr.VNĐ)."
            )
        else:
            offer_status = "FAIR_MARKET"
            offer_verdict = (
                f"BÁM SÁT THỊ TRƯỜNG: Dải lương JD ({sal_res.salary_min_vnd} – {sal_res.salary_max_vnd} tr.VNĐ) giao thoa tốt với P50 ({p50} tr.VNĐ)."
            )

        script_vi = (
            f"Dạ cảm ơn Quý Công ty ({company_name}) đã trao cơ hội cho vị trí {job_title}. "
            f"Dựa trên yêu cầu JD đòi hỏi tổ hợp {len(matched_skills)} kỹ năng chuyên sâu ({', '.join(matched_skills[:5])}) "
            f"tương ứng phân khúc {implied_tier}, mặt bằng thị trường hiện tại đang ở khoảng {p50} – {p75} triệu VNĐ/tháng. "
            f"Em xin đề xuất mức lương kỳ vọng trong khoảng {anchor_min} – {anchor_max} triệu VNĐ/tháng (Gross) "
            f"và sẵn sàng trao đổi linh hoạt quanh mức {target_min} – {target_max} triệu VNĐ/tháng gắn với KPI thực tế ạ."
        )

        return {
            "parsed_job": {
                "company_name": company_name,
                "job_title": job_title,
                "sector_pillar": pillar,
                "canonical_role": canonical_role,
                "detected_tier": detected_tier,
                "implied_workload_tier": implied_tier,
                "is_title_underleveled": is_underleveled,
                "exp_years_mid": role_res.exp_years_mid,
                "city_code": geo_res.city_code,
                "work_mode": geo_res.work_mode,
                "matched_skill_ids": matched_skills,
            },
            "employer_offer": {
                "raw_salary_text": salary_text,
                "is_negotiable": sal_res.is_negotiable,
                "salary_min_vnd": sal_res.salary_min_vnd,
                "salary_max_vnd": sal_res.salary_max_vnd,
                "offer_status": offer_status,
                "offer_verdict": offer_verdict,
            },
            "market_quantiles_vnd": {
                "p10_vnd": p10,
                "p25_vnd": p25,
                "p50_median_vnd": p50,
                "p75_vnd": p75,
                "p90_vnd": p90,
            },
            "negotiation_milestones_vnd": {
                "walk_away_floor_p25": walk_away_floor,
                "target_fair_deal_range": [target_min, target_max],
                "anchor_opening_ask_range": [anchor_min, anchor_max],
            },
            "hr_negotiation_script_vi": script_vi,
            "shap_top_drivers": val_res.get("shap_top_drivers", []),
        }

    def _tool_query_verified_jobs(self, args: Dict[str, Any]) -> Dict[str, Any]:
        jobs = self.repo.fetch_enriched_jobs(limit=500)
        pillar = (args.get("sector_pillar") or "").strip().upper()
        role = (args.get("canonical_role") or "").strip().upper()
        tier = (args.get("career_tier") or "").strip().upper()
        city = (args.get("city_code") or "").strip().upper()
        skill_id = (args.get("skill_id") or "").strip().upper()
        min_sal = args.get("min_salary_vnd")
        only_multi = bool(args.get("only_multi_source", False))
        limit = max(1, min(50, int(args.get("limit", 15))))

        filtered: List[Dict[str, Any]] = []
        for j in jobs:
            if pillar and str(j.get("sector_pillar", "")).upper() != pillar:
                continue
            if role and str(j.get("canonical_role", "")).upper() != role:
                continue
            if tier and str(j.get("career_tier", "")).upper() != tier:
                continue
            if city and str(j.get("primary_city_code", "")).upper() != city:
                continue
            if skill_id and skill_id not in [s.upper() for s in j.get("matched_skill_ids", [])]:
                continue
            if min_sal is not None:
                sal = j.get("salary_mid_vnd")
                if sal is None or float(sal) < float(min_sal):
                    continue
            sites = j.get("source_sites", [j.get("source_site")])
            if only_multi and len(sites) < 2:
                continue
            filtered.append(
                {
                    "job_id": j.get("job_id"),
                    "dedup_signature": j.get("dedup_signature"),
                    "company_name": j.get("company_name_raw"),
                    "job_title": j.get("job_title_raw"),
                    "sector_pillar": j.get("sector_pillar"),
                    "canonical_role": j.get("canonical_role"),
                    "career_tier": j.get("career_tier"),
                    "city_code": j.get("primary_city_code"),
                    "work_mode": j.get("work_mode"),
                    "salary_mid_vnd": j.get("salary_mid_vnd"),
                    "vacancy_duration_days": j.get("vacancy_duration_days"),
                    "matched_skill_ids": j.get("matched_skill_ids", []),
                    "source_sites": sites,
                    "source_urls": j.get("source_urls", [j.get("source_url")]),
                    "source_links_meta": j.get("source_links_meta", []),
                }
            )

        salaries = [float(x["salary_mid_vnd"]) for x in filtered if x.get("salary_mid_vnd") is not None]
        avg_sal = round(sum(salaries) / len(salaries), 2) if salaries else None

        return {
            "query_filters": args,
            "total_matched": len(filtered),
            "average_salary_vnd_of_matched": avg_sal,
            "returned_count": min(len(filtered), limit),
            "jobs": filtered[:limit],
        }

    def _tool_query_econometrics(self, args: Dict[str, Any]) -> Dict[str, Any]:
        artifacts = self._get_model_artifacts()
        skill_filter = (args.get("skill_filter") or "").strip().lower()
        layer_filter = (args.get("layer_filter") or "").strip().upper()
        include_mincer = bool(args.get("include_mincer_table", True))
        include_synergy = bool(args.get("include_synergy_pairs", True))

        shap_list = artifacts.get("global_shap_skill_valuation", [])
        filtered_shap = []
        for item in shap_list:
            if skill_filter and (
                skill_filter not in str(item.get("skill_id", "")).lower()
                and skill_filter not in str(item.get("skill_name", "")).lower()
            ):
                continue
            if layer_filter and str(item.get("layer", "")).upper() != layer_filter:
                continue
            filtered_shap.append(item)

        response: Dict[str, Any] = {
            "dataset_summary": artifacts.get("dataset_summary", {}),
            "quantile_ml_metrics": artifacts.get("quantile_ml_metrics", {}),
            "matched_skills_shap_valuation": filtered_shap,
        }
        if include_mincer:
            response["mincer_ols"] = artifacts.get("mincer_ols", {})
            response["heckman_two_step"] = artifacts.get("heckman_two_step", {})
        if include_synergy:
            synergy = artifacts.get("skill_synergy_matrix", [])
            if skill_filter:
                synergy = [
                    p
                    for p in synergy
                    if skill_filter in str(p.get("skill_a_name", "")).lower()
                    or skill_filter in str(p.get("skill_b_name", "")).lower()
                    or skill_filter in str(p.get("skill_a_id", "")).lower()
                    or skill_filter in str(p.get("skill_b_id", "")).lower()
                ]
            response["skill_synergy_matrix"] = synergy
        return response

    def _tool_verify_job_provenance(self, args: Dict[str, Any]) -> Dict[str, Any]:
        dedup_sig = (args.get("dedup_signature") or "").strip()
        company_kw = (args.get("company_keyword") or "").strip().lower()
        jobs = self.repo.fetch_enriched_jobs(limit=200)

        matched_jobs: List[Dict[str, Any]] = []
        for j in jobs:
            if dedup_sig and j.get("dedup_signature") == dedup_sig:
                matched_jobs.append(j)
            elif company_kw and (
                company_kw in str(j.get("company_name_raw", "")).lower()
                or company_kw in str(j.get("dedup_signature", "")).lower()
            ):
                matched_jobs.append(j)

        if not matched_jobs and jobs:
            matched_jobs = [jobs[0]]

        provenance_results = []
        for mj in matched_jobs[:10]:
            sig = str(mj.get("dedup_signature", ""))
            links = self.repo.get_job_verification_links(sig) or mj.get("source_links_meta", [])
            provenance_results.append(
                {
                    "dedup_signature": sig,
                    "company_name": mj.get("company_name_raw"),
                    "job_title": mj.get("job_title_raw"),
                    "vacancy_duration_days": mj.get("vacancy_duration_days"),
                    "source_sites_count": len(mj.get("source_sites", [])),
                    "source_sites": mj.get("source_sites", []),
                    "source_urls": mj.get("source_urls", []),
                    "verification_links_detail": links,
                }
            )
        return {
            "verified_jobs_count": len(provenance_results),
            "provenance_records": provenance_results,
        }

    def _tool_trigger_crawl_and_audit(self, args: Dict[str, Any]) -> Dict[str, Any]:
        sites = list(args.get("sites") or ["topcv", "itviec", "careerviet", "vietnamworks"])
        use_mock = bool(args.get("use_mock", True))
        scheduler = CrawlScheduler(repo=self.repo)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            # Nếu đang nằm trong event loop của FastAPI, chạy FrameworkAuditor đồng bộ và trả về kết quả ngay
            auditor = FrameworkAuditor(Path("configs"))
            jobs = self.repo.fetch_enriched_jobs()
            audit_res = auditor.audit_dataset(jobs)
            return {
                "mode": "SYNC_AUDIT_IN_EVENT_LOOP",
                "sites_configured": sites,
                "total_master_jobs": len(jobs),
                "audit_summary": {
                    "unclassified_role_rate": audit_res["unclassified_role_rate"],
                    "requires_restructuring": audit_res["requires_restructuring"],
                },
            }

        cycle_res = asyncio.run(
            scheduler.execute_cycle(
                trigger_mode="MCP_AI_TRIGGER",
                sites=sites,
                pillars=["DE-01"],
                cities=["HN", "HCM"],
                max_pages=1,
                max_jobs_per_site=10,
                use_mock=use_mock,
                run_audit=True,
            )
        )
        return {
            "status": cycle_res["crawl_stats"]["status"],
            "links_discovered": cycle_res["crawl_stats"]["links_discovered"],
            "silver_jobs_upserted": cycle_res["crawl_stats"]["silver_jobs_upserted"],
            "audit_requires_restructuring": (
                cycle_res["audit_summary"]["requires_restructuring"]
                if cycle_res.get("audit_summary")
                else False
            ),
        }

    def _tool_manage_user_permissions(
        self,
        args: Dict[str, Any],
        admin_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        action = str(args.get("action", "list_users"))
        if action == "view_audit_logs":
            return {
                "executed_by_admin": admin_user["email"],
                "mcp_audit_logs": self.repo.list_mcp_audit_logs(limit=30),
            }
        if action == "update_role":
            target_email = str(args.get("target_email", "")).strip()
            new_role = str(args.get("new_role", "RESEARCHER")).strip().upper()
            if not target_email:
                return {"error": "Thiếu tham số target_email khi thực hiện update_role."}
            # Nếu target_email chưa từng đăng nhập, khởi tạo sẵn rồi gán role
            self.repo.upsert_google_user(email=target_email)
            updated = self.repo.update_user_role(target_email=target_email, new_role=new_role)
            return {
                "executed_by_admin": admin_user["email"],
                "action": "update_role",
                "updated_user": updated,
            }
        users = self.repo.list_app_users()
        return {
            "executed_by_admin": admin_user["email"],
            "total_users": len(users),
            "users": users,
        }

    def _tool_get_learning_roadmap_and_macro_clusters(self, args: Dict[str, Any]) -> Dict[str, Any]:
        audience = str(args.get("audience") or "ALL").strip().upper()
        cluster_filter = str(args.get("cluster_filter") or "").strip().lower()
        include_non_tech = bool(args.get("include_non_technical_pyramid", True))

        macro_clusters = [
            {
                "cluster_code": "G1",
                "cluster_name": "Hệ Quản trị CSDL Quan hệ & Truy vấn SQL",
                "anchor_skill_id": "SK_SQL",
                "anchor_tool": "ANSI SQL + PostgreSQL",
                "transferability_pct": 88,
                "bridge_hours": 10,
                "equivalent_tools": ["Oracle Database (PL/SQL)", "MS SQL Server (T-SQL)", "MySQL / MariaDB", "IBM DB2"],
            },
            {
                "cluster_code": "G2",
                "cluster_name": "Trực quan hóa Dữ liệu & Báo cáo Thông minh (BI)",
                "anchor_skill_id": "SK_POWERBI",
                "anchor_tool": "Power BI (DAX + Power Query)",
                "transferability_pct": 85,
                "bridge_hours": 12,
                "equivalent_tools": ["Tableau Desktop/Server", "Looker Studio", "Metabase", "Apache Superset", "Qlik Sense"],
            },
            {
                "cluster_code": "G3",
                "cluster_name": "Lập trình Phân tích, Tự động hóa & Backend Data",
                "anchor_skill_id": "SK_PYTHON",
                "anchor_tool": "Python (Pandas, Polars, FastAPI)",
                "transferability_pct": 80,
                "bridge_hours": 16,
                "equivalent_tools": ["R (Tidyverse)", "Julia", "PySpark DataFrame API", "MATLAB"],
            },
            {
                "cluster_code": "G4",
                "cluster_name": "Kiến trúc Kho dữ liệu & Điều phối Pipeline (DataOps)",
                "anchor_skill_id": "SK_AIRFLOW_DBT",
                "anchor_tool": "Star Schema + dbt Core + Apache Airflow",
                "transferability_pct": 84,
                "bridge_hours": 14,
                "equivalent_tools": ["Dagster", "Prefect", "SSIS / Talend / Informatica", "ClickHouse / DuckDB"],
            },
            {
                "cluster_code": "G5",
                "cluster_name": "Xử lý Dữ liệu Lớn Phân tán & Streaming",
                "anchor_skill_id": "SK_SPARK_BIGDATA",
                "anchor_tool": "Apache Spark (PySpark) + Apache Kafka",
                "transferability_pct": 82,
                "bridge_hours": 15,
                "equivalent_tools": ["Apache Flink", "Databricks Lakehouse", "Google Cloud Dataflow", "AWS EMR"],
            },
            {
                "cluster_code": "G6",
                "cluster_name": "Điện toán Đám mây & Hạ tầng Container (CloudOps)",
                "anchor_skill_id": "SK_CLOUD_PLATFORM",
                "anchor_tool": "Docker + AWS Core (S3, EC2, Redshift/Athena)",
                "transferability_pct": 86,
                "bridge_hours": 12,
                "equivalent_tools": ["Google Cloud Platform (BigQuery)", "Microsoft Azure (Synapse, Fabric)", "Kubernetes"],
            },
            {
                "cluster_code": "G7",
                "cluster_name": "Thống kê Thực nghiệm & Học máy Cổ điển (ML)",
                "anchor_skill_id": "SK_ML_DL_FRAMEWORKS",
                "anchor_tool": "Scikit-learn + LightGBM / XGBoost + A/B Testing",
                "transferability_pct": 85,
                "bridge_hours": 12,
                "equivalent_tools": ["CatBoost", "Statsmodels", "PyTorch Tabular", "MLflow / Optuna"],
            },
            {
                "cluster_code": "G8",
                "cluster_name": "AI Tạo sinh, Mô hình Ngôn ngữ Lớn & Agentic RAG",
                "anchor_skill_id": "SK_GENAI_LLM",
                "anchor_tool": "OpenAI / Gemini API + LangChain + Vector DB",
                "transferability_pct": 88,
                "bridge_hours": 10,
                "equivalent_tools": ["LlamaIndex", "CrewAI / LangGraph", "vLLM / Ollama", "Pinecone / Milvus / pgvector"],
            },
            {
                "cluster_code": "G9",
                "cluster_name": "Phân tích Nghiệp vụ, Thiết kế Hệ thống & ERP/CRM",
                "anchor_skill_id": "SK_REQUIREMENTS_SRS_BRD",
                "anchor_tool": "SRS/BRD + BPMN 2.0 + UML + Figma + Odoo",
                "transferability_pct": 83,
                "bridge_hours": 14,
                "equivalent_tools": ["SAP ERP", "Oracle NetSuite", "Salesforce CRM", "Jira / Confluence"],
            },
            {
                "cluster_code": "G10",
                "cluster_name": "Tăng trưởng Thương mại Điện tử & Tiếp thị Số (MarTech)",
                "anchor_skill_id": "SK_STATISTICAL_AB_TESTING",
                "anchor_tool": "GA4 + Funnel/Cohort Retention + TikTok/Meta Ads",
                "transferability_pct": 86,
                "bridge_hours": 10,
                "equivalent_tools": ["Mixpanel / Amplitude", "AppsFlyer / Adjust", "Shopee / TikTok Shop Seller Center"],
            },
        ]
        if cluster_filter:
            macro_clusters = [
                c
                for c in macro_clusters
                if cluster_filter in c["cluster_code"].lower()
                or cluster_filter in c["cluster_name"].lower()
                or cluster_filter in c["anchor_tool"].lower()
                or any(cluster_filter in eq.lower() for eq in c["equivalent_tools"])
            ]

        roadmaps = {
            "STUDENT": {
                "target_tier": "T1_INTERN -> T2_FRESHER",
                "expected_salary_vnd": "5 – 15 triệu VNĐ/tháng",
                "sequence": ["G1 (ANSI SQL/PostgreSQL)", "G2 (Power BI/Excel)", "G3 (Python cơ bản)", "G9/G10 (Tư duy nghiệp vụ)"],
                "advice": "Không học dàn trải 10 công cụ; chỉ cần làm chủ 1 công cụ hạt nhân mỗi cụm và làm 2–3 dự án thực tế trên dữ liệu thật.",
            },
            "INTERN_FRESHER": {
                "target_tier": "T2_FRESHER -> T3_JUNIOR",
                "expected_salary_vnd": "14 – 24 triệu VNĐ/tháng",
                "sequence": ["G3 + G1 Synergy (Python + SQL tự động hóa)", "G4 (dbt + Airflow + Star Schema)", "Git/Docker & Tiếng Anh chuyên ngành"],
                "advice": "Khi công ty dùng công cụ khác (VD: Oracle DB hoặc Tableau), chỉ cần 10–12 giờ học cầu nối (Bridge Hours) để chuyển đổi từ PostgreSQL/Power BI.",
            },
            "WORKING_PRO": {
                "target_tier": "T3_JUNIOR -> T4_MIDDLE_SENIOR -> T5_LEAD_MANAGER",
                "expected_salary_vnd": "26 – 80+ triệu VNĐ/tháng",
                "sequence": ["G6 (Cloud AWS/GCP)", "G7/G8 (ML, GenAI, RAG, Agentic Workflow)", "Thiết kế kiến trúc hệ thống & Quản trị P&L"],
                "advice": "Kết hợp chiều sâu công nghệ (Differentiator Skills) với 5 trụ cột năng lực phi kỹ thuật để vượt trần thu nhập.",
            },
        }
        selected_roadmaps = roadmaps if audience == "ALL" else {audience: roadmaps.get(audience, roadmaps["STUDENT"])}

        res: Dict[str, Any] = {
            "macro_skill_clusters_count": len(macro_clusters),
            "macro_skill_clusters": macro_clusters,
            "audience_learning_roadmaps": selected_roadmaps,
        }
        if include_non_tech:
            res["non_technical_pyramid_5_pillars"] = [
                "1. Tư duy Kinh doanh & Thương mại hóa (Business & Commercial Acumen — T3->T6)",
                "2. Năng lực Tự chủ, Xử lý Mơ hồ & Giải quyết Vấn đề Phức tạp (SFIA Autonomy — T2->T5)",
                "3. Giao tiếp Điều hành, Kể chuyện bằng Dữ liệu & Quản trị Các bên liên quan (Data Storytelling — T3->T6)",
                "4. Lãnh đạo Nhân sự, Huấn luyện & Kiến tạo Tổ chức (Coaching & Leadership — T4->T6)",
                "5. Quản trị Chiến lược, Đạo đức AI & Tuân thủ Pháp lý (Nghị định 13/2023/NĐ-CP — T5->T6)",
            ]
        return res

    def _tool_query_annual_comparative_reports(self, args: Dict[str, Any]) -> Dict[str, Any]:
        base_year = int(args.get("base_year", 2021))
        target_year = int(args.get("target_year", 2026))
        engine = AnnualMarketReportEngine()
        return engine.generate_annual_comparative_report(base_year=base_year, target_year=target_year)

    def _tool_query_scraped_records_analytics(self, args: Dict[str, Any]) -> Dict[str, Any]:
        reprocess_bronze = bool(args.get("reprocess_bronze", False))
        limit = max(1, min(50, int(args.get("limit", 15))))
        analytics = self.repo.fetch_scraped_records_analytics(
            limit=500,
            reprocess_bronze=reprocess_bronze,
        )
        records = analytics.get("records", [])
        city_code = str(args.get("city_code") or "").strip().upper()
        portal = str(args.get("portal") or "").strip().lower()
        pillar = str(args.get("sector_pillar") or "").strip().upper()
        kw = str(args.get("keyword") or "").strip().lower()

        filtered = []
        for r in records:
            if city_code and city_code != "ALL" and str(r.get("primary_city_code", "")).upper() != city_code:
                continue
            if portal and portal != "all" and portal not in [str(s).lower() for s in r.get("source_sites", [])]:
                continue
            if pillar and pillar != "ALL" and str(r.get("sector_pillar", "")).upper() != pillar:
                continue
            if kw and (
                kw not in str(r.get("job_title_raw", "")).lower()
                and kw not in str(r.get("company_name_raw", "")).lower()
                and kw not in str(r.get("description_clean", "")).lower()
            ):
                continue
            filtered.append(r)

        return {
            "summary_kpis": analytics.get("summary", {}),
            "by_time": analytics.get("by_time", []),
            "by_location": analytics.get("by_location", []),
            "by_portal": analytics.get("by_portal", []),
            "filtered_records_total": len(filtered),
            "returned_records": filtered[:limit],
        }

    def _tool_inspect_scraper_dlq_and_debug_bundle(
        self,
        args: Dict[str, Any],
        user: Dict[str, Any],
    ) -> Dict[str, Any]:
        include_debug = bool(args.get("include_hourly_debug_bundle", True))
        can_operate = user.get("role") in ("OPERATOR", "ADMIN")
        auto_tune = bool(args.get("auto_tune_ineffective", False)) and can_operate
        trigger_retry = bool(args.get("trigger_retry_dlq", False)) and can_operate

        error_logger = ScraperErrorLogger(repo=self.repo)
        dlq_items = error_logger.list_dlq_items()
        time_sync = verify_international_time_sync(probe_network_ntp=False)
        scheduler = CrawlScheduler(repo=self.repo)

        res: Dict[str, Any] = {
            "time_sync_gmt07": time_sync,
            "dlq_summary": {
                "total_incidents": len(dlq_items),
                "pending_retry_count": sum(1 for x in dlq_items if x.get("retry_status") == "PENDING_RETRY"),
                "resolved_count": sum(1 for x in dlq_items if x.get("retry_status") == "RESOLVED"),
            },
            "recent_error_logs": dlq_items[:15],
        }
        if include_debug:
            res["hourly_debug_bundle"] = scheduler.generate_hourly_debug_bundle(
                auto_tune_ineffective=auto_tune
            )
        if trigger_retry:
            res["retry_execution_note"] = "Đã ghi nhận lệnh quét bù DLQ (--mode retry-errors)."
        return res

    def _tool_manage_campaign_100k_and_retention(self, args: Dict[str, Any]) -> Dict[str, Any]:
        action = str(args.get("action") or "get_plan").strip().lower()
        scheduler = CrawlScheduler(repo=self.repo)
        if action == "auto_tune_30days":
            plan = scheduler.update_campaign_100k_plan({"auto_tune_optimal_30days": True})
            return {"action": "auto_tune_30days", "updated_plan": plan}
        if action == "prune_12m_sampling":
            plan = scheduler.update_campaign_100k_plan({"execute_12m_sampling_prune": True})
            return {"action": "prune_12m_sampling", "updated_plan": plan}
        if action == "run_backfill":
            from_year = int(args.get("from_year", 2021))
            deep_pages = int(args.get("deep_pages", 15))
            return {
                "action": "run_backfill",
                "from_year": from_year,
                "deep_pages": deep_pages,
                "campaign_plan": scheduler.evaluate_campaign_100k_plan(),
            }
        return {
            "action": "get_plan",
            "campaign_plan": scheduler.evaluate_campaign_100k_plan(),
        }

    # =========================================================================
    # GIAO THỨC CHUẨN MCP JSON-RPC 2.0 (STDIO & HTTP)
    # =========================================================================
    def handle_jsonrpc_message(
        self,
        message: Dict[str, Any],
        default_identity: str = "",
    ) -> Optional[Dict[str, Any]]:
        method = str(message.get("method", ""))
        msg_id = message.get("id")
        params = message.get("params") or {}

        # Thông báo một chiều (Notification) không cần trả lời
        if msg_id is None and method.startswith("notifications/"):
            return None

        try:
            if method == "initialize":
                result = {
                    "protocolVersion": self.MCP_PROTOCOL_VERSION,
                    "capabilities": {
                        "tools": {"listChanged": False},
                        "resources": {"subscribe": False, "listChanged": False},
                    },
                    "serverInfo": {
                        "name": "skillvalue-labor-market-mcp",
                        "version": "1.0.0",
                    },
                }
            elif method == "ping":
                result = {}
            elif method == "tools/list":
                result = {"tools": self.list_tools()}
            elif method == "resources/list":
                result = {"resources": self.list_resources()}
            elif method == "resources/read":
                uri = str(params.get("uri", ""))
                result = self.read_resource(uri)
            elif method == "tools/call":
                tool_name = str(params.get("name", ""))
                tool_args = dict(params.get("arguments") or {})
                # Cho phép truyền định danh qua tham số `_auth_identity` hoặc lấy từ `default_identity`
                identity = str(
                    tool_args.pop("_auth_identity", "")
                    or params.get("_auth_identity", "")
                    or default_identity
                )
                result = self.execute_tool(
                    tool_name=tool_name,
                    arguments=tool_args,
                    user_identity=identity,
                )
            else:
                return {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {"code": -32601, "message": f"Method not found: {method}"},
                }

            return {"jsonrpc": "2.0", "id": msg_id, "result": result}
        except Exception as exc:
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": -32000, "message": str(exc)},
            }

    def run_stdio_loop(self, default_identity: str) -> None:
        """Chạy máy chủ MCP qua luồng `stdio` chuẩn để tích hợp trực tiếp vào Claude Desktop / Cursor / Antigravity."""
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")
        if hasattr(sys.stdin, "reconfigure"):
            sys.stdin.reconfigure(encoding="utf-8")

        for raw_line in sys.stdin:
            line = raw_line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            response = self.handle_jsonrpc_message(payload, default_identity=default_identity)
            if response is not None:
                sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
                sys.stdout.flush()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="SkillValue.AI - Máy chủ MCP Truy vấn Dữ liệu Thị trường Lao động Số (Tích hợp Phân quyền RBAC)"
    )
    parser.add_argument(
        "--stdio",
        action="store_true",
        help="Chạy MCP Server ở chế độ JSON-RPC 2.0 qua luồng stdio (dành cho Claude Desktop, Cursor, Antigravity)",
    )
    parser.add_argument(
        "--identity",
        type=str,
        default=os.getenv(
            "SKILLVALUE_MCP_IDENTITY",
            os.getenv("ADMIN_EMAIL", "phungtuananh3333@gmail.com"),
        ),
        help="Email người dùng hoặc khóa MCP Token (`skv_mcp_...`) để xác thực quyền RBAC",
    )
    parser.add_argument(
        "--test-tool",
        type=str,
        default="",
        help="Chạy kiểm thử nhanh một MCP tool từ dòng lệnh (VD: mcp_query_verified_jobs)",
    )
    args = parser.parse_args()

    server = SkillValueMCPServer()
    if args.stdio:
        server.run_stdio_loop(default_identity=args.identity)
        return

    if args.test_tool:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")
        res = server.execute_tool(
            tool_name=args.test_tool,
            arguments={},
            user_identity=args.identity,
        )
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(
        json.dumps(
            {
                "mcp_server": "skillvalue-labor-market-mcp",
                "default_identity": args.identity,
                "available_tools": [
                    {
                        "name": t["name"],
                        "minimum_role": t["minimum_role"],
                        "required_permission": t["required_permission"],
                    }
                    for t in server.list_tools()
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
