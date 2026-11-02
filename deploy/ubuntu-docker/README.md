# Hướng dẫn Triển khai PropValue.AI trên Ubuntu Server (Thư mục `~/labbatdongsan`), Docker GHCR (Port `3359`) & Cloudflare Tunnel (`https://aidinhgiabds.kinhtesox.net`)

Tài liệu này hướng dẫn chi tiết cách cài đặt, xác thực Google OAuth 2.0, ánh xạ Cloudflare Tunnel về tên miền **`https://aidinhgiabds.kinhtesox.net`** và vận hành hệ thống **PropValue.AI (`aptlabbatdongsan`)** trong thư mục **`~/labbatdongsan`** trên máy chủ **Ubuntu 22.04 / 24.04 LTS**.

*(Bản đầy đủ kèm sơ đồ kiến trúc xem tại: [`docs/08-huong-dan-cai-dat-ubuntu-thu-muc-labbatdongsan-va-cloudflare-tunnel.md`](../../docs/08-huong-dan-cai-dat-ubuntu-thu-muc-labbatdongsan-va-cloudflare-tunnel.md))*

---

## 1. Thông số Cổng, Database (`real_estate_market`) & Image GHCR Chuẩn

| Thành phần (Service) | Container Name | Image GHCR / Nguồn | Cổng (Host:Container) | Tên miền Public (Cloudflare Tunnel) |
| :--- | :--- | :--- | :--- | :--- |
| **Next.js 15 WebApp** | `propvalue_webapp_pwa` | `ghcr.io/kinhteso/aptlabbatdongsan-webapp:latest` | **`3359:3359`** | **`https://aidinhgiabds.kinhtesox.net`** |
| **FastAPI Backend & ML AVM** | `propvalue_api` | `ghcr.io/kinhteso/aptlabbatdongsan:latest` | **`8000:8000`** | *(Nội bộ qua Docker Network)* |
| **Scraper & Auto-Heal Worker** | `propvalue_scraper_etl` | `ghcr.io/kinhteso/aptlabbatdongsan:latest` | *(Chạy ngầm)* | *(Tự động quét 2021–2026 & Auto-Heal)* |
| **PostgreSQL 16 (`real_estate_market`)** | `propvalue_postgres` | `postgres:16-alpine` | **`5432:5432`** | *(Bind Mount: `~/labbatdongsan/data/postgres`)* |
| **Redis 7 Cache** | `propvalue_redis` | `redis:7-alpine` | **`6379:6379`** | *(Bind Mount: `~/labbatdongsan/data/redis`)* |

---

## 2. Cài đặt Nhanh vào Thư mục `~/labbatdongsan` trên Ubuntu Server

```bash
# 1. Tạo thư mục labbatdongsan và kéo mã nguồn từ GitHub:
mkdir -p ~/labbatdongsan
cd ~/labbatdongsan
git clone https://github.com/kinhteso/aptlabbatdongsan.git .

# 2. Tạo cây thư mục Bind Mount lưu dữ liệu trên ổ cứng & khởi tạo file .env:
mkdir -p data/postgres data/redis data/bronze data/silver data/gold logs/html_snapshots docs/audits
cp .env.example .env

# 3. Chỉnh sửa .env (nếu cần cập nhật GOOGLE_CLIENT_SECRET hoặc đổi cổng POSTGRES_PORT=5433 khi chạy chung máy với lablaodongso):
nano .env

# 4. Cấp quyền thực thi và chạy kịch bản tự động cài đặt (đồng bộ giờ GMT+07, kéo GHCR image, bật 5 container):
chmod +x deploy/ubuntu-docker/*.sh
./deploy/ubuntu-docker/setup-ubuntu.sh
```

---

## 3. Ánh xạ Cloudflare Tunnel (`localhost:3359` $\to$ `https://aidinhgiabds.kinhtesox.net`)

### Cách 1: Cấu hình trên giao diện Cloudflare Zero Trust Dashboard (Khuyên dùng)
1. Đăng nhập [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/) $\rightarrow$ **Networks** $\rightarrow$ **Tunnels**.
2. Chọn Tunnel đang chạy trên máy chủ Ubuntu của bạn $\rightarrow$ **Configure** $\rightarrow$ tab **Public Hostname** $\rightarrow$ **Add a public hostname**:
   - **Subdomain:** `aidinhgiabds`
   - **Domain:** `kinhtesox.net`
   - **Service Type:** `HTTP`
   - **URL:** `localhost:3359`
3. Nhấn **Save hostname**.

### Cách 2: Cấu hình qua `/etc/cloudflared/config.yml` trên Ubuntu
Thêm block sau vào mục `ingress:` trong `/etc/cloudflared/config.yml`:
```yaml
ingress:
  - hostname: aidinhgiabds.kinhtesox.net
    service: http://localhost:3359
    originRequest:
      noTLSVerify: true
```
Sau đó chạy:
```bash
cloudflared tunnel route dns <TEN_TUNNEL> aidinhgiabds.kinhtesox.net
sudo systemctl restart cloudflared
```

---

## 4. Cấu hình Google OAuth 2.0 cho Tên miền `https://aidinhgiabds.kinhtesox.net`

1. **Thông tin xác thực mặc định:**
   - **Google Client ID:** `647264796658-h96idjs8hohr4hf8pjid8i531lqr2gra.apps.googleusercontent.com`
   - **Email Admin (`ADMIN_EMAILS`):** `phungtuananh3333@gmail.com,phungtuananh2222@gmail.com`
   - **Mật khẩu Bảo mật Lab (`ADMIN_PASSWORD`):** `skillvalue_secret_2026`
2. **Khai báo trên Google Cloud Console (`APIs & Services` $\to$ `Credentials`):**
   - **Authorized JavaScript origins:**
     - `https://aidinhgiabds.kinhtesox.net`
     - `http://localhost:3359`
   - **Authorized redirect URIs:**
     - `https://aidinhgiabds.kinhtesox.net/api/auth/callback/google`
     - `http://localhost:3359/api/auth/callback/google`

---

## 5. Vận hành Quét Dữ liệu (`2021–2026`), Auto-Heal & Tracking tại `~/labbatdongsan`

```bash
cd ~/labbatdongsan

# 1. Tracking toàn hệ thống (Giờ GMT+07, 5 Container, Ổ cứng, PostgreSQL real_estate_market):
./deploy/ubuntu-docker/track-system.sh

# 2. Kiểm toán kết nối 6 cổng BĐS Việt Nam:
./deploy/ubuntu-docker/run-scraper.sh audit-portals

# 3. Kích hoạt quét lịch sử từ năm 2021 đến nay (2021-2026):
./deploy/ubuntu-docker/run-scraper.sh backfill --from-year 2021 --max-pages 20

# 4. Tự động rà soát lỗi, tự phục hồi (Auto-Heal) và cài đặt Cronjob chạy mỗi giờ:
./deploy/ubuntu-docker/auto-heal-and-audit.sh --install-cron
```
