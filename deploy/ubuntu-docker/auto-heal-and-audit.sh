#!/usr/bin/env bash
# ==============================================================================
# SCRIPT TỰ ĐỘNG CHẠY, RÀ SOÁT LỖI, TỰ CHỮA LÀNH (AUTO-HEAL) & ĐỒNG BỘ LỊCH SỬ 2021–2026
# Hỗ trợ:
#   bash deploy/ubuntu-docker/auto-heal-and-audit.sh               # Chạy chu trình tự kiểm tra & chữa lành ngay
#   bash deploy/ubuntu-docker/auto-heal-and-audit.sh --with-backfill # Kèm quét bù lịch sử 2021-2026
#   bash deploy/ubuntu-docker/auto-heal-and-audit.sh --install-cron  # Cài đặt Cron tự động chạy mỗi giờ trên Ubuntu
# ==============================================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

if [ -f "docker-compose.yml" ]; then
  COMPOSE_FILE="docker-compose.yml"
else
  COMPOSE_FILE="deploy/ubuntu-docker/docker-compose.ghcr.yml"
fi

MODE="${1:-standard}"

if [ "$MODE" = "--install-cron" ]; then
  CRON_CMD="0 * * * * cd $PROJECT_ROOT && /bin/bash $PROJECT_ROOT/deploy/ubuntu-docker/auto-heal-and-audit.sh >> $PROJECT_ROOT/logs/cron_auto_heal.log 2>&1"
  (crontab -l 2>/dev/null | grep -v "auto-heal-and-audit.sh" || true; echo "$CRON_CMD") | crontab -
  echo ">>> [OK] Đã cài đặt Cron tự động rà soát lỗi & chữa lành mỗi giờ (0 * * * *) trên Ubuntu!"
  echo ">>> Dòng lệnh Cron: $CRON_CMD"
  exit 0
fi

echo "================================================================================"
echo " [PropValue.AI] BẮT ĐẦU CHU TRÌNH TỰ ĐỘNG RÀ SOÁT LỖI & CHỮA LÀNH ($(date -Iseconds))"
echo "================================================================================"

# 1. Kiểm tra sức khỏe các Container Docker (PostgreSQL 16, Redis 7, FastAPI, Next.js WebApp 3358, Scraper Daemon)
if command -v docker >/dev/null 2>&1; then
  echo ">>> [Bước 1/5] Kiểm tra trạng thái Docker Containers (PostgreSQL, Redis, API, WebApp 3358, Scraper)..."
  docker compose -f "$COMPOSE_FILE" up -d postgres redis api webapp scraper-etl || true
fi

# 2. Chạy Rà soát các Cổng BĐS & Cập nhật Kế hoạch 2021-2026
echo ">>> [Bước 2/5] Rà soát kỹ thuật các trang web đăng tin BĐS (Batdongsan, Chotot, Alonhadat, Mogi)..."
if command -v docker >/dev/null 2>&1 && docker compose -f "$COMPOSE_FILE" ps --status running | grep -q "scraper"; then
  docker compose -f "$COMPOSE_FILE" exec -T scraper-etl python -m src.scrapers.scheduler --mode audit-portals
else
  python -m src.scrapers.scheduler --mode audit-portals
fi

# 3. Tự động Rà soát Lỗi, Hiệu chỉnh CSS Selector / Anti-Bot & Quét Bù Hàng đợi DLQ
echo ">>> [Bước 3/5] Tự động phân tích logs/scraper_errors.jsonl, tự chữa lành cấu hình & quét bù DLQ..."
if command -v docker >/dev/null 2>&1 && docker compose -f "$COMPOSE_FILE" ps --status running | grep -q "scraper"; then
  docker compose -f "$COMPOSE_FILE" exec -T scraper-etl python -m src.scrapers.scheduler --mode auto-heal
else
  python -m src.scrapers.scheduler --mode auto-heal
fi

# 4. Nếu có cờ --with-backfill thì kích hoạt quét hồi cứu lịch sử từ năm 2021 đến nay
if [ "$MODE" = "--with-backfill" ]; then
  echo ">>> [Bước 4/5] Thực thi chiến dịch quét dữ liệu lịch sử 2021–2026 (--mode backfill --from-year 2021)..."
  if command -v docker >/dev/null 2>&1 && docker compose -f "$COMPOSE_FILE" ps --status running | grep -q "scraper"; then
    docker compose -f "$COMPOSE_FILE" exec -T scraper-etl python -m src.scrapers.scheduler --mode backfill --from-year 2021 --max-pages 20
  else
    python -m src.scrapers.scheduler --mode backfill --from-year 2021 --max-pages 20
  fi
else
  echo ">>> [Bước 4/5] Bỏ qua Backfill sâu (dùng cờ --with-backfill để quét hồi cứu 2021-2026)."
fi

# 5. Kiểm toán Khung phân tích & Cập nhật Báo cáo Tracking Hệ thống
echo ">>> [Bước 5/5] Cập nhật Báo cáo Kiểm toán Khung & Tracking Hệ thống..."
if command -v docker >/dev/null 2>&1 && docker compose -f "$COMPOSE_FILE" ps --status running | grep -q "scraper"; then
  docker compose -f "$COMPOSE_FILE" exec -T scraper-etl python -m src.analytics.framework_auditor --output-dir docs/audits
  docker compose -f "$COMPOSE_FILE" exec -T scraper-etl python -m src.analytics.system_tracker
else
  python -m src.analytics.framework_auditor --output-dir docs/audits
  python -m src.analytics.system_tracker
fi

echo "================================================================================"
echo " [HOÀN TẤT] Chu trình Tự động Rà soát Lỗi & Bảo trì Hệ thống PropValue.AI thành công!"
echo "================================================================================"
