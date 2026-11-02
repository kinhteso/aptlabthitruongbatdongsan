#!/usr/bin/env bash
# ==============================================================================
# CÔNG CỤ ĐIỀU KHIỂN QUÉT TIN BĐS (2021–NAY), TỰ ĐỘNG RÀ SOÁT LỖI & HUẤN LUYỆN AVM TRÊN UBUNTU DOCKER
# Cách dùng:
#   ./deploy/ubuntu-docker/run-scraper.sh audit-portals    # Rà soát các trang web BĐS & xuất kế hoạch 2021-2026
#   ./deploy/ubuntu-docker/run-scraper.sh backfill         # Quét tin lịch sử từ năm 2021 đến nay (--from-year 2021)
#   ./deploy/ubuntu-docker/run-scraper.sh auto-heal        # Tự động rà soát lỗi, tự chữa lành selector/WAF & quét bù DLQ
#   ./deploy/ubuntu-docker/run-scraper.sh retry-errors     # Quét bù toàn bộ URL lỗi trong Hàng đợi DLQ
#   ./deploy/ubuntu-docker/run-scraper.sh debug-1h         # Xuất gói chẩn đoán & debug 1 giờ cho AI
#   ./deploy/ubuntu-docker/run-scraper.sh once             # Cào 1 phiên thực tế ngay lập tức (34/63 tỉnh thành)
#   ./deploy/ubuntu-docker/run-scraper.sh daemon           # Bật trình lập lịch chạy ngầm 24/7 (GMT+07)
#   ./deploy/ubuntu-docker/run-scraper.sh prune-12m        # Lấy mẫu đại diện phân tầng cho dữ liệu > 12 tháng
#   ./deploy/ubuntu-docker/run-scraper.sh audit            # Chạy kiểm toán Khung phân tích (framework-review)
#   ./deploy/ubuntu-docker/run-scraper.sh train-ml         # Huấn luyện Hedonic OLS + Heckman + LightGBM Quantile + SHAP
#   ./deploy/ubuntu-docker/run-scraper.sh mock-verify      # Kiểm thử toàn diện 10 hạng mục hệ thống
# ==============================================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

if [ -f "docker-compose.yml" ]; then
  COMPOSE_FILE="docker-compose.yml"
else
  COMPOSE_FILE="deploy/ubuntu-docker/docker-compose.ghcr.yml"
fi

ACTION="${1:-audit-portals}"
shift || true

case "$ACTION" in
  audit-portals)
    echo ">>> [PropValue.AI] Rà soát kỹ thuật các trang web đăng tin BĐS & xuất Kế hoạch 2021-2026..."
    docker compose -f "$COMPOSE_FILE" run --rm scraper-etl \
      python -m src.scrapers.scheduler --mode audit-portals "$@"
    ;;
  backfill)
    echo ">>> [PropValue.AI] Chạy chiến dịch quét tin BĐS lịch sử từ 2021 đến nay (--mode backfill)..."
    docker compose -f "$COMPOSE_FILE" run --rm scraper-etl \
      python -m src.scrapers.scheduler --mode backfill --from-year 2021 "$@"
    ;;
  auto-heal)
    echo ">>> [PropValue.AI] Tự động rà soát lỗi, hiệu chỉnh CSS Selector / Anti-Bot & quét bù Hàng đợi DLQ..."
    docker compose -f "$COMPOSE_FILE" run --rm scraper-etl \
      python -m src.scrapers.scheduler --mode auto-heal "$@"
    ;;
  retry-errors)
    echo ">>> [PropValue.AI] Quét bù các URL bị lỗi trong Hàng đợi DLQ (--mode retry-errors)..."
    docker compose -f "$COMPOSE_FILE" run --rm scraper-etl \
      python -m src.scrapers.scheduler --mode retry-errors "$@"
    ;;
  debug-1h)
    echo ">>> [PropValue.AI] Trích xuất gói chẩn đoán & debug 1 giờ (--mode debug-1h)..."
    docker compose -f "$COMPOSE_FILE" run --rm scraper-etl \
      python -m src.scrapers.scheduler --mode debug-1h "$@"
    ;;
  once)
    echo ">>> [PropValue.AI] Chạy phiên cào thực tế (--mode once) và lưu vào PostgreSQL + ./data/..."
    docker compose -f "$COMPOSE_FILE" run --rm scraper-etl \
      python -m src.scrapers.scheduler --mode once "$@"
    ;;
  daemon)
    echo ">>> [PropValue.AI] Khởi động Scraper Scheduler chạy ngầm định kỳ 24/7 (--mode daemon)..."
    docker compose -f "$COMPOSE_FILE" up -d scraper-etl
    docker compose -f "$COMPOSE_FILE" logs -f scraper-etl
    ;;
  prune-12m)
    echo ">>> [PropValue.AI] Lấy mẫu phân tầng đại diện & nén dữ liệu lịch sử > 12 tháng..."
    docker compose -f "$COMPOSE_FILE" run --rm scraper-etl \
      python -m src.scrapers.scheduler --mode prune-12m "$@"
    ;;
  mock-verify)
    echo ">>> [PropValue.AI] Chạy kiểm thử toàn trình 10 hạng mục (tests.verify_pipeline)..."
    docker compose -f "$COMPOSE_FILE" run --rm scraper-etl \
      python -m tests.verify_pipeline
    ;;
  audit)
    echo ">>> [PropValue.AI] Chạy Động cơ Kiểm toán & Đề xuất Tái cấu trúc Khung (FrameworkAuditor)..."
    docker compose -f "$COMPOSE_FILE" run --rm scraper-etl \
      python -m src.analytics.framework_auditor "$@"
    ;;
  train-ml)
    echo ">>> [PropValue.AI] Huấn luyện Mô hình Hedonic OLS + Heckman 2-Step + LightGBM Quantile + SHAP..."
    docker compose -f "$COMPOSE_FILE" run --rm scraper-etl \
      python -m src.models.train_pipeline "$@"
    ;;
  *)
    echo "Cách dùng: $0 {audit-portals|backfill|auto-heal|retry-errors|debug-1h|once|daemon|prune-12m|audit|train-ml|mock-verify} [options]"
    exit 1
    ;;
esac
