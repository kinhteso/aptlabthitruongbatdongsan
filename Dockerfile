# Dockerfile "All-in-One Functions" tối ưu cho Ubuntu Server & GitHub Container Registry (GHCR)
# Chỉ cần `docker compose pull` 1 lần là chạy được toàn bộ 6 phân hệ:
# 1. Async Playwright Stealth Scraper + Scheduler (`src.scrapers.scheduler`)
# 2. Unified Multi-Portal ETL + Cross-Site Dedup & Link Provenance (`src.db.postgres_repo`)
# 3. Econometric Mincer OLS + Heckman 2-Step + LightGBM Quantile + SHAP + UPS (`src.models.train_pipeline`)
# 4. Empirical Framework & Multi-Portal Auditor (`src.analytics.framework_auditor`)
# 5. FastAPI Backend + Google OAuth 4-Tier RBAC (`src.api.main`)
# 6. Authorized AI Model Context Protocol Server (`src.mcp.labor_market_mcp_server`)
FROM python:3.11-slim-bookworm

LABEL org.opencontainers.image.source="https://github.com/kinhteso/aptlabthitruongbatdongsan"
LABEL org.opencontainers.image.description="PropValue.AI All-in-One Backend: Playwright Scraper, Dual 34/63 Geo & Ward AVM, Hedonic/Quantile ML, FastAPI, RBAC & MCP Server"
LABEL org.opencontainers.image.licenses="MIT"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    TZ=Asia/Ho_Chi_Minh

WORKDIR /app

# Cài đặt các gói hệ thống cần thiết cho PostgreSQL driver, LightGBM/XGBoost và Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgomp1 \
    curl \
    ca-certificates \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    playwright install --with-deps chromium

# Đóng gói 100% mã nguồn, cấu hình chuẩn, SQL Schema và bộ kiểm thử vào trong GHCR Image
COPY configs/ ./configs/
COPY configs/ ./default_configs/
COPY infra/ ./infra/
COPY src/ ./src/
COPY docs/ ./docs/
COPY tests/ ./tests/

# Tạo sẵn các thư mục mount point cho dữ liệu trên ổ cứng Host (Bind Mounts)
RUN mkdir -p /app/data/bronze /app/data/silver /app/data/gold /app/logs

CMD ["python", "-m", "src.scrapers.scheduler", "--mode", "daemon"]
