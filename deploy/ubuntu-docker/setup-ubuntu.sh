#!/usr/bin/env bash
# ==============================================================================
# KỊCH BẢN KHỞI TẠO HẠ TẦNG TRÊN UBUNTU SERVER (PAT + GMT+07 NTP + BIND MOUNTS + GHCR)
# Dự án: https://github.com/kinhteso/aptlabbatdongsan
# Cổng WebApp mặc định: 3359 (http://localhost:3359)
# Hỗ trợ xác thực bằng GitHub Personal Access Token (GITHUB_PAT) cho cả Git & GHCR
# ==============================================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "=== [1/6] Đồng bộ Múi giờ Chuẩn GMT+07 (Asia/Ho_Chi_Minh) & Giờ Quốc tế NTP ==="
if command -v timedatectl >/dev/null 2>&1; then
    sudo timedatectl set-timezone Asia/Ho_Chi_Minh || true
    sudo timedatectl set-ntp true || true
    timedatectl status
fi
echo "Giờ máy chủ hiện tại (GMT+07): $(TZ=Asia/Ho_Chi_Minh date '+%Y-%m-%d %H:%M:%S %z')"
echo "Giờ Quốc tế đối chiếu (UTC)  : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

echo "=== [2/6] Khởi tạo cây thư mục lưu trữ dữ liệu trực tiếp trên Ổ cứng Host (Bind Mounts) ==="
mkdir -p data/postgres data/redis data/bronze data/silver data/gold logs/html_snapshots docs/audits

if [ ! -f .env ] && [ -f .env.example ]; then
    cp .env.example .env
    echo "Đã tạo file .env từ .env.example."
fi

# Nạp biến môi trường từ .env (nếu có GITHUB_PAT, GOOGLE_CLIENT_SECRET...)
if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env || true
    set +a
fi

echo "=== [3/6] Xác thực Git & GitHub Container Registry (GHCR) bằng Personal Access Token (PAT) ==="
GH_USER="${GITHUB_USER:-kinhteso}"
GH_TOKEN="${GITHUB_PAT:-${CR_PAT:-}}"
if [ -n "$GH_TOKEN" ] && [ "$GH_TOKEN" != "ghp_YOUR_GITHUB_PAT_HERE" ]; then
    echo "1. Cấu hình Git Remote sử dụng GITHUB_PAT cho tài khoản '$GH_USER'..."
    if [ -d ".git" ]; then
        git remote set-url origin "https://${GH_USER}:${GH_TOKEN}@github.com/kinhteso/aptlabbatdongsan.git" || true
        git pull origin main --ff-only || true
    fi
    echo "2. Đang đăng nhập vào ghcr.io với tài khoản '$GH_USER' bằng GITHUB_PAT..."
    echo "$GH_TOKEN" | docker login ghcr.io -u "$GH_USER" --password-stdin || echo "[WARN] Không đăng nhập được ghcr.io (cần Classic PAT ghp_... có quyền read:packages). Sẽ tự động build cục bộ nếu không pull được."
else
    echo "[INFO] Chưa thiết lập GITHUB_PAT (hoặc đang dùng Public Repo). Nếu repo/package ở chế độ Private, hãy chạy: export GITHUB_PAT=ghp_..."
fi

echo "=== [4/6] Kéo (Pull) Docker Images duy nhất 1 lần từ GitHub Container Registry (GHCR) ==="
if docker compose -f deploy/ubuntu-docker/docker-compose.ghcr.yml pull; then
    echo "=== [5/6] Khởi động 5 Container từ gói GHCR (WebApp trên cổng 3359) ==="
    docker compose -f deploy/ubuntu-docker/docker-compose.ghcr.yml up -d postgres redis api webapp scraper-etl
else
    echo "[INFO] Gói GHCR đang được GitHub Actions build hoặc chưa public -> Tự động build trực tiếp từ Dockerfile ngay trên Ubuntu..."
    docker compose up -d --build postgres redis api webapp scraper-etl
fi

echo "=== [6/6] Kiểm tra Trạng thái Hệ thống, Rà soát Cổng BĐS & Đồng bộ Giờ Quốc tế ==="
docker compose ps || true
docker exec propvalue_api python -m src.scrapers.scheduler --mode audit-portals || true
docker exec propvalue_api python -m src.analytics.system_tracker || true
echo ">>> Để kích hoạt Cron tự động rà soát lỗi & quét bù mỗi giờ trên Ubuntu, chạy:"
echo "    bash deploy/ubuntu-docker/auto-heal-and-audit.sh --install-cron"
echo "Hoàn tất! Toàn bộ dữ liệu PropValue.AI được lưu trực tiếp trên ổ cứng tại: $PROJECT_ROOT/data/"
