#!/usr/bin/env bash
# ==============================================================================
# KỊCH BẢN TRACKING & GIÁM SÁT TOÀN DIỆN HỆ THỐNG TRÊN UBUNTU DOCKER (GMT+07)
# Cách chạy:
#   chmod +x deploy/ubuntu-docker/track-system.sh
#   ./deploy/ubuntu-docker/track-system.sh
# ==============================================================================
set -e

DATA_DIR="${HOST_DATA_ROOT:-./data}"

echo "================================================================================"
echo " 0. KIỂM TRA ĐỒNG BỘ MÚI GIỜ GMT+07 (Asia/Ho_Chi_Minh) SO VỚI GIỜ QUỐC TẾ (UTC/NTP)"
echo "================================================================================"
echo "• Giờ Hệ thống (GMT+07) : $(TZ=Asia/Ho_Chi_Minh date '+%Y-%m-%dT%H:%M:%S%z')"
echo "• Giờ Quốc tế (UTC+00)  : $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
if command -v timedatectl >/dev/null 2>&1; then
    timedatectl status | grep -E "Local time|Universal time|Time zone|System clock synchronized|NTP service" || true
fi

echo ""
echo "================================================================================"
echo " 1. TRẠNG THÁI CÁC CONTAINER DOCKER & TÀI NGUYÊN CPU / RAM"
echo "================================================================================"
docker ps --filter "name=propvalue_" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}"
echo ""
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" $(docker ps --filter "name=propvalue_" -q) 2>/dev/null || true

echo ""
echo "================================================================================"
echo " 2. KIỂM TRA DUNG LƯỢNG LƯU TRỮ TRỰC TIẾP TRÊN Ổ CỨNG MÁY CHỦ (BIND MOUNTS)"
echo "================================================================================"
mkdir -p "$DATA_DIR/postgres" "$DATA_DIR/redis" "$DATA_DIR/bronze" "$DATA_DIR/silver" "$DATA_DIR/gold" ./logs/html_snapshots 2>/dev/null || \
    sudo mkdir -p "$DATA_DIR/postgres" "$DATA_DIR/redis" "$DATA_DIR/bronze" "$DATA_DIR/silver" "$DATA_DIR/gold" ./logs/html_snapshots || true
du -sh "$DATA_DIR/postgres" "$DATA_DIR/redis" "$DATA_DIR/bronze" "$DATA_DIR/silver" "$DATA_DIR/gold" ./logs 2>/dev/null || \
    sudo du -sh "$DATA_DIR/postgres" "$DATA_DIR/redis" "$DATA_DIR/bronze" "$DATA_DIR/silver" "$DATA_DIR/gold" ./logs 2>/dev/null || true
df -h "$DATA_DIR" || df -h .

echo ""
echo "================================================================================"
echo " 3. TRACKING SỐ LƯỢNG BẢN GHI TRONG POSTGRESQL (MEDALLION, ERROR DLQ & RBAC/MCP)"
echo "================================================================================"
PG_DB="${POSTGRES_DB:-real_estate_market}"
if ! docker exec propvalue_postgres psql -U "${POSTGRES_USER:-skillvalue}" -d "$PG_DB" -c "SELECT 1;" >/dev/null 2>&1; then
    PG_DB="skillvalue_market"
fi
docker exec propvalue_postgres psql -U "${POSTGRES_USER:-skillvalue}" -d "$PG_DB" -c "
SELECT
    NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh' AS pg_time_gmt07,
    (SELECT COUNT(*) FROM raw_job_postings) AS bronze_raw_jobs,
    (SELECT COUNT(*) FROM jobs_master) AS silver_master_jobs,
    (SELECT COUNT(*) FROM job_source_links) AS verified_source_links,
    (SELECT COUNT(*) FROM scraper_error_logs WHERE retry_status = 'PENDING_RETRY') AS pending_error_dlq,
    (SELECT COUNT(*) FROM app_users) AS registered_users,
    (SELECT COUNT(*) FROM mcp_audit_logs) AS mcp_ai_queries;
" 2>/dev/null || echo "PostgreSQL container chưa chạy hoặc đang khởi tạo."

echo ""
echo "================================================================================"
echo " 4. BÁO CÁO TELEMETRY TOÀN HỆ THỐNG TỪ MODULE PYTHON (src.analytics.system_tracker)"
echo "================================================================================"
docker exec propvalue_api python -m src.analytics.system_tracker 2>/dev/null || python3 -m src.analytics.system_tracker
