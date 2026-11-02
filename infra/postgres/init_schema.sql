-- ============================================================================
-- KHỞI TẠO LƯỢC ĐỒ CƠ SỞ DỮ LIỆU POSTGRESQL: THỊ TRƯỜNG LAO ĐỘNG SỐ (SKILLVALUE.AI)
-- Kiến trúc Medallion 3 Tầng: Bronze (Raw) -> Silver (Normalized) -> Gold (ML Features)
-- Kèm Bảng Kiểm toán & Tái cấu trúc Khung Phân tích (Framework Audit Logs)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 0. BẢNG ĐĂNG KÝ CỔNG TUYỂN DỤNG & CƠ CHẾ MAPPING (PORTALS REGISTRY)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scraper_portals_registry (
    site_code VARCHAR(64) PRIMARY KEY,            -- topcv, itviec, careerviet, vietnamworks, glints, linkedin...
    base_url TEXT NOT NULL,
    engine_type VARCHAR(64) NOT NULL,             -- playwright_stealth, httpx_or_playwright, playwright_or_api
    prefer_json_ld BOOLEAN NOT NULL DEFAULT TRUE,
    selectors_config JSONB NOT NULL DEFAULT '{}', -- Cấu hình CSS Selectors / JSON path đặc thù của trang
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 1. TẦNG BRONZE: LƯU TRỮ DỮ LIỆU CÀO NGUYÊN BẢN (RAW DATA LAKE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw_job_postings (
    raw_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_site VARCHAR(64) NOT NULL,             -- Mở rộng không giới hạn cứng để dễ dàng thêm cổng tuyển dụng mới
    source_job_id VARCHAR(128),
    source_url TEXT NOT NULL,
    search_keyword VARCHAR(128),
    search_city VARCHAR(64),
    http_status INTEGER DEFAULT 200,
    raw_json_ld JSONB,                 -- Khối Schema.org/JobPosting trích xuất trực tiếp
    raw_extra_metadata JSONB,          -- Các tag kỹ năng, phúc lợi đặc thù của từng trang
    raw_html_text TEXT,                -- Nội dung văn bản/HTML gốc phục vụ kiểm chứng khoa học
    content_sha256 VARCHAR(64) NOT NULL,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_processed BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (source_site, source_url, content_sha256)
);

CREATE INDEX IF NOT EXISTS idx_raw_site_scraped ON raw_job_postings (source_site, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_unprocessed ON raw_job_postings (is_processed) WHERE is_processed = FALSE;

-- ----------------------------------------------------------------------------
-- 2. TẦNG SILVER: DỮ LIỆU CHUẨN HÓA ĐA CHIỀU (NORMALIZED RELATIONAL STORE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
    company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name_raw TEXT NOT NULL,
    company_slug VARCHAR(255) NOT NULL UNIQUE,
    company_size VARCHAR(64),
    industry_raw VARCHAR(255),
    company_type VARCHAR(64),          -- Product, Outsourcing, Bank/FinTech, E-Commerce, Agency, MNC...
    headquarters_city VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs_master (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_id UUID REFERENCES raw_job_postings(raw_id) ON DELETE SET NULL,
    company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL,
    dedup_signature VARCHAR(255) NOT NULL UNIQUE, -- Khóa khử trùng lặp đa nguồn (TopCV + ITviec + CareerViet + VietnamWorks)
    source_sites TEXT[] NOT NULL DEFAULT '{}',    -- Danh sách các cổng xuất hiện cùng tin tuyển dụng này
    source_urls TEXT[] NOT NULL DEFAULT '{}',     -- Danh sách TẤT CẢ các đường link gốc liên quan đến tin tuyển dụng này
    source_links_meta JSONB NOT NULL DEFAULT '[]',-- Metadata đối chứng chi tiết từng link (site, url, raw_id, sha256, salary_raw, scraped_at)

    -- Chiều Nghề nghiệp & Cấp bậc Tháp (Taxonomy & Pyramid)
    job_title_raw TEXT NOT NULL,
    sector_pillar VARCHAR(16) NOT NULL,           -- DE-01, DE-02, DE-03, DE-04, UNCLASSIFIED
    canonical_role VARCHAR(64) NOT NULL,          -- 16 vị trí nghề chuẩn hóa hoặc UNCLASSIFIED
    role_confidence NUMERIC(4,3) DEFAULT 1.000,
    career_tier VARCHAR(32) NOT NULL,             -- T1_INTERN, T2_FRESHER, T3_JUNIOR, T4_MIDDLE_SENIOR, T5_LEAD_MANAGER, T6_DIRECTOR
    exp_years_min NUMERIC(4,1),
    exp_years_max NUMERIC(4,1),
    exp_years_mid NUMERIC(4,1),

    -- Chiều Kinh tế & Tiền lương (Compensation)
    salary_raw_text VARCHAR(255),
    salary_type VARCHAR(32) NOT NULL,             -- RANGE, UPPER_BOUND, LOWER_BOUND, EXACT, NEGOTIABLE
    is_negotiable BOOLEAN NOT NULL DEFAULT FALSE,
    currency_original VARCHAR(8) DEFAULT 'VND',
    salary_min_vnd NUMERIC(10,2),                 -- Đơn vị: Triệu VNĐ/tháng
    salary_max_vnd NUMERIC(10,2),                 -- Đơn vị: Triệu VNĐ/tháng
    salary_mid_vnd NUMERIC(10,2),                 -- Đơn vị: Triệu VNĐ/tháng (Biến phụ thuộc chính cho Mincer OLS & ML)
    salary_imputed_vnd NUMERIC(10,2),             -- Lương dự báo cho các tin "Thỏa thuận"

    -- Chiều Không gian & Hình thức làm việc (Spatial Dimension)
    primary_macro_region VARCHAR(32) NOT NULL,    -- NORTH, CENTRAL, SOUTH, NATIONWIDE, GLOBAL_REMOTE
    primary_city_code VARCHAR(32) NOT NULL,       -- HN, HCM, DN, HP, CT, BD, BN, DNAI, OTHER
    primary_urban_tier VARCHAR(32) NOT NULL,      -- TIER_SPECIAL, TIER_1_HUB, TIER_INDUSTRIAL, TIER_OTHER
    primary_district VARCHAR(128),
    work_mode VARCHAR(16) NOT NULL DEFAULT 'ONSITE', -- ONSITE, HYBRID, REMOTE

    -- Chiều Thời gian (Temporal Dimension)
    published_date DATE NOT NULL,
    expired_date DATE,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    vacancy_duration_days INTEGER DEFAULT 1,      -- Số ngày tin mở tuyển (Chỉ báo độ khan hiếm nhân lực)
    year_month VARCHAR(7) NOT NULL,               -- YYYY-MM
    year_quarter VARCHAR(7) NOT NULL,             -- YYYY-Q1..Q4

    -- Nội dung đã làm sạch & Thông tin Người rao bán / Môi giới (Seller Phone Identity)
    seller_phone VARCHAR(64),                     -- Số điện thoại chính của người rao bán / môi giới (chuẩn hóa 10 số VN)
    seller_phones TEXT[] DEFAULT '{}',            -- Danh sách toàn bộ các SĐT trích xuất được từ bản tin
    description_clean TEXT,
    requirements_clean TEXT,
    benefits_clean TEXT,
    raw_skill_tags TEXT[] DEFAULT '{}',           -- Các tag kỹ năng thu thập sẵn từ web để đối chiếu từ điển
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS seller_phone VARCHAR(64);
ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS seller_phones TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_jobs_sector_role ON jobs_master (sector_pillar, canonical_role, career_tier);
CREATE INDEX IF NOT EXISTS idx_jobs_spatial ON jobs_master (primary_city_code, primary_urban_tier, work_mode);
CREATE INDEX IF NOT EXISTS idx_jobs_temporal ON jobs_master (year_month, year_quarter, published_date DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_salary ON jobs_master (is_negotiable, salary_mid_vnd) WHERE is_negotiable = FALSE;
CREATE INDEX IF NOT EXISTS idx_jobs_seller_phone ON jobs_master (seller_phone) WHERE seller_phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS job_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs_master(job_id) ON DELETE CASCADE,
    macro_region VARCHAR(32) NOT NULL,
    city_code VARCHAR(32) NOT NULL,
    urban_tier VARCHAR(32) NOT NULL,
    district_name VARCHAR(128),
    district_cluster VARCHAR(128),
    is_primary BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_job_locations_city ON job_locations (city_code, district_cluster);

-- Bảng Đối chứng & Xác thực Đa nguồn (1 Bản tin chuẩn jobs_master <-> N Link gốc từ các cổng)
CREATE TABLE IF NOT EXISTS job_source_links (
    link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs_master(job_id) ON DELETE CASCADE,
    raw_id UUID REFERENCES raw_job_postings(raw_id) ON DELETE SET NULL,
    source_site VARCHAR(32) NOT NULL,
    source_job_id VARCHAR(128),
    source_url TEXT NOT NULL,
    content_sha256 VARCHAR(64) NOT NULL,
    job_title_on_site TEXT,
    salary_raw_on_site VARCHAR(255),
    http_status INTEGER DEFAULT 200,
    verification_status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED_ACTIVE', -- VERIFIED_ACTIVE, EXPIRED_OR_CLOSED, CONTENT_CHANGED
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (job_id, source_url)
);

CREATE INDEX IF NOT EXISTS idx_job_source_links_job ON job_source_links (job_id);
CREATE INDEX IF NOT EXISTS idx_job_source_links_url ON job_source_links (source_url);

-- ----------------------------------------------------------------------------
-- 3. TỪ ĐIỂN BẢN THỂ KỸ NĂNG SỐ 4 TẦNG & BẢNG ÁNH XẠ KỸ NĂNG - CÔNG VIỆC
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skills_ontology (
    skill_id VARCHAR(64) PRIMARY KEY,             -- VD: SK_SQL, SK_PYTHON, SK_POWERBI
    skill_name VARCHAR(128) NOT NULL,
    skill_layer VARCHAR(32) NOT NULL,             -- L1_FOUNDATION, L2_TOOL, L3_DOMAIN, L4_MINDSET
    skill_category VARCHAR(64) NOT NULL,
    primary_pillars TEXT[] NOT NULL DEFAULT '{}', -- ['DE-01', 'DE-04']
    regex_patterns TEXT[] NOT NULL DEFAULT '{}',
    learning_difficulty SMALLINT NOT NULL DEFAULT 3 CHECK (learning_difficulty BETWEEN 1 AND 5),
    estimated_learning_hours INTEGER NOT NULL DEFAULT 60,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_skills (
    job_id UUID NOT NULL REFERENCES jobs_master(job_id) ON DELETE CASCADE,
    skill_id VARCHAR(64) NOT NULL REFERENCES skills_ontology(skill_id) ON DELETE CASCADE,
    extraction_source VARCHAR(32) NOT NULL DEFAULT 'REGEX', -- SITE_TAG, REGEX_REQ, REGEX_DESC, EMBEDDING
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (job_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_job_skills_skill ON job_skills (skill_id);

-- ----------------------------------------------------------------------------
-- 4. BẢNG LƯU KẾT QUẢ KIỂM TOÁN & TÁI CẤU TRÚC KHUNG PHÂN TÍCH (FRAMEWORK AUDIT)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS framework_audit_logs (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_jobs_analyzed INTEGER NOT NULL,
    jobs_with_salary INTEGER NOT NULL,
    unclassified_role_rate NUMERIC(5,4) NOT NULL,
    emerging_unmapped_tags JSONB NOT NULL DEFAULT '[]',
    pyramid_boundary_drifts JSONB NOT NULL DEFAULT '[]',
    skill_role_migrations JSONB NOT NULL DEFAULT '[]',
    report_markdown_path TEXT,
    requires_restructuring BOOLEAN NOT NULL DEFAULT FALSE
);

-- ----------------------------------------------------------------------------
-- 5. BẢNG THEO DÕI LỊCH SỬ PHIÊN CÀO & SCHEDULER (CRAWL RUN TELEMETRY)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scraper_crawl_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_mode VARCHAR(32) NOT NULL DEFAULT 'SCHEDULER', -- SCHEDULER, CLI_ONCE, MOCK_VERIFY
    target_sites TEXT[] NOT NULL DEFAULT '{}',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'RUNNING',         -- RUNNING, COMPLETED, PARTIAL_FAILURE, FAILED
    pages_fetched INTEGER NOT NULL DEFAULT 0,
    links_discovered INTEGER NOT NULL DEFAULT 0,
    new_raw_saved INTEGER NOT NULL DEFAULT 0,
    existing_jobs_touched INTEGER NOT NULL DEFAULT 0,
    silver_jobs_upserted INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    error_summary JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_crawl_runs_started ON scraper_crawl_runs (started_at DESC);

-- ----------------------------------------------------------------------------
-- 6. BẢNG QUẢN LÝ NGƯỜI DÙNG, PHÂN QUYỀN GOOGLE OAUTH & MCP TOKEN (APP USERS & RBAC)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255),
    avatar_url TEXT,
    google_sub VARCHAR(128),
    role VARCHAR(32) NOT NULL DEFAULT 'VIEWER' CHECK (role IN ('ADMIN', 'OPERATOR', 'RESEARCHER', 'VIEWER')),
    permissions TEXT[] NOT NULL DEFAULT '{}',
    mcp_api_token VARCHAR(128) UNIQUE,
    mcp_query_count INTEGER NOT NULL DEFAULT 0,
    is_first_user BOOLEAN NOT NULL DEFAULT FALSE,
    login_count INTEGER NOT NULL DEFAULT 1,
    first_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users (email);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users (role);
CREATE INDEX IF NOT EXISTS idx_app_users_mcp_token ON app_users (mcp_api_token);

-- ----------------------------------------------------------------------------
-- 7. BẢNG NHẬT KÝ TRUY VẤN AI TƯƠNG TÁC QUA GIAO THỨC MCP (MCP AUDIT LOGS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mcp_audit_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email VARCHAR(255) NOT NULL,
    user_role VARCHAR(32) NOT NULL,
    tool_name VARCHAR(128) NOT NULL,
    arguments_json JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(32) NOT NULL DEFAULT 'ALLOWED', -- ALLOWED, DENIED_RBAC, ERROR
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_audit_logs_email ON mcp_audit_logs (user_email, executed_at DESC);

-- ----------------------------------------------------------------------------
-- 8. BẢNG NHẬT KÝ LỖI QUÉT DỮ LIỆU, HÀNG ĐỢI RETRY (DLQ) & HƯỚNG DẪN KHẮC PHỤC
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scraper_error_logs (
    error_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id VARCHAR(64),
    source_site VARCHAR(32) NOT NULL,
    stage VARCHAR(32) NOT NULL DEFAULT 'SEARCH_LISTING',      -- SEARCH_LISTING, JOB_DETAIL, ETL_UPSERT
    error_category VARCHAR(64) NOT NULL,                      -- CLOUDFLARE_WAF_BLOCK, HTTP_STATUS_ERROR, SELECTOR_DRIFT_ZERO_LINKS, DETAIL_PARSE_INCOMPLETE, NETWORK_TIMEOUT, RUNTIME_EXCEPTION
    target_url TEXT NOT NULL,
    http_status INTEGER DEFAULT 0,
    error_message TEXT NOT NULL,
    remediation_action TEXT NOT NULL,
    html_snapshot_path TEXT,
    retry_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_RETRY', -- PENDING_RETRY, RESOLVED, IGNORED
    retry_count INTEGER NOT NULL DEFAULT 0,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scraper_errors_site_status ON scraper_error_logs (source_site, retry_status, occurred_at DESC);

-- ----------------------------------------------------------------------------
-- 9. BẢNG ĐỊNH GIÁ BẤT ĐỘNG SẢN CẤP PHƯỜNG/XÃ & HỆ QUY CHIẾU SONG HÀNH 34/63 TỈNH THÀNH
--    (Hierarchical Empirical Bayes Spatial Shrinkage & 6 Phân khu Kinh tế Đặc thù)
-- ----------------------------------------------------------------------------
ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS province_34_code VARCHAR(16) DEFAULT 'HCM';
ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS legacy_province_63 VARCHAR(64) DEFAULT 'TP. Ho Chi Minh';
ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS ward_code VARCHAR(64);
ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS ward_name VARCHAR(160);
ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS economic_zone_type VARCHAR(64) DEFAULT 'ZONE_CBD_URBAN_CORE';
ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS area_m2 NUMERIC(10, 2);
ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS frontage_m NUMERIC(8, 2);
ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS alley_width_m NUMERIC(8, 2);
ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS legal_status_code VARCHAR(32) DEFAULT 'RED_BOOK';

CREATE TABLE IF NOT EXISTS gold_ward_valuation_index (
    ward_code VARCHAR(64) NOT NULL,
    ward_name VARCHAR(160) NOT NULL,
    province_34_code VARCHAR(16) NOT NULL,
    province_34_name VARCHAR(128) NOT NULL,
    legacy_province_63 VARCHAR(64) NOT NULL,
    legacy_district_name VARCHAR(128),
    economic_zone_type VARCHAR(64) NOT NULL, -- ZONE_CBD_URBAN_CORE, ZONE_INDUSTRIAL_FDI_PARK, ZONE_CRAFT_VILLAGE_HERITAGE, ZONE_TOURISM_RESORT_COASTAL, ZONE_HITECH_UNIVERSITY_TOD, ZONE_SUBURBAN_RESIDENTIAL_AGRI
    sector_pillar VARCHAR(16) NOT NULL,
    year_quarter VARCHAR(10) NOT NULL,
    observed_sample_count INTEGER NOT NULL DEFAULT 0,
    shrinkage_omega NUMERIC(6, 4) NOT NULL DEFAULT 0.0,
    parent_prior_m2_vnd NUMERIC(10, 2) NOT NULL,
    eb_ward_p10_m2_vnd NUMERIC(10, 2) NOT NULL,
    eb_ward_p25_m2_vnd NUMERIC(10, 2) NOT NULL,
    eb_ward_p50_m2_vnd NUMERIC(10, 2) NOT NULL,
    eb_ward_p75_m2_vnd NUMERIC(10, 2) NOT NULL,
    eb_ward_p90_m2_vnd NUMERIC(10, 2) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ward_code, sector_pillar, year_quarter)
);

CREATE INDEX IF NOT EXISTS idx_ward_val_p34_zone ON gold_ward_valuation_index (province_34_code, legacy_province_63, economic_zone_type);

