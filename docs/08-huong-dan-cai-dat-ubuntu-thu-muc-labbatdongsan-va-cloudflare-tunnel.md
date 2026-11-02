# 08. Hướng dẫn Cài đặt Thực tế trên Máy chủ Ubuntu (Thư mục `labbatdongsan`) & Ánh xạ Cloudflare Tunnel về Tên miền `https://aidinhgiabds.kinhtesox.net`

> **Tình huống triển khai thực tế:**
> - **Thư mục cài đặt trên máy chủ Ubuntu:** `~/labbatdongsan` (hoặc `/opt/labbatdongsan`)
> - **Kho mã nguồn GitHub:** `https://github.com/kinhteso/aptlabbatdongsan`
> - **Gói Docker Images trên GHCR:**
>   1. `ghcr.io/kinhteso/aptlabbatdongsan:latest` *(FastAPI + Scraper 2021–2026 + Auto-Heal + ML Hedonic AVM + MCP)*
>   2. `ghcr.io/kinhteso/aptlabbatdongsan-webapp:latest` *(Next.js 15 RWD + PWA + Google OAuth 2.0 + RBAC)*
> - **Cổng nội bộ WebApp trên Ubuntu:** **`3359`** (`http://localhost:3359`)
> - **Tên miền Public qua Cloudflare Tunnel:** **`https://aidinhgiabds.kinhtesox.net`**
> - **Cơ sở dữ liệu PostgreSQL 16:** **`real_estate_market`**

---

## 0. Kiến trúc 5 Container & Luồng Định tuyến Cloudflare Tunnel (`aidinhgiabds.kinhtesox.net`)

```mermaid
flowchart LR
    U["Người dùng / Nhà nghiên cứu<br/>(Web & Mobile PWA)"] -->|"HTTPS (443)"| CF["Cloudflare Edge & Zero Trust Tunnel<br/>https://aidinhgiabds.kinhtesox.net"]
    CF -->|"cloudflared tunnel<br/>(X-Forwarded-Proto: https)"| W["Container 5: propvalue_webapp_pwa<br/>Next.js 15 (localhost:3359)"]
    W -->|"Internal Docker Net"| A["Container 3: propvalue_api<br/>FastAPI + AVM + MCP (8000)"]
    A --> P["Container 1: propvalue_postgres<br/>PostgreSQL 16 (DB: real_estate_market)<br/>Bind Mount: ~/labbatdongsan/data/postgres"]
    A --> R["Container 2: propvalue_redis<br/>Redis 7 Cache (6379)<br/>Bind Mount: ~/labbatdongsan/data/redis"]
    S["Container 4: propvalue_scraper_etl<br/>Playwright Stealth + Auto-Heal (2021-2026)"] --> P
    S --> R
```

| STT | Tên Container (`container_name`) | Nguồn Gói Image (`image`) | Cổng Mạng (`Port`) | Thư mục Ổ cứng Máy chủ gắn vào (`Bind Mount`) | Nhiệm vụ Chính |
| :---: | :--- | :--- | :---: | :--- | :--- |
| **1** | **`propvalue_postgres`** | `postgres:16-alpine` | `5432:5432` | `~/labbatdongsan/data/postgres`<br/>$\to$ `/var/lib/postgresql/data` | Cơ sở dữ liệu **PostgreSQL 16** (`POSTGRES_DB=real_estate_market`) lưu 13 bảng Medallion (Bronze/Silver/Gold), ánh xạ song song `34/63` tỉnh thành, chỉ số Phường/Xã (`gold_ward_valuation_index`), `app_users` (Google OAuth RBAC) & `scraper_error_logs` (DLQ). |
| **2** | **`propvalue_redis`** | `redis:7-alpine` | `6379:6379` | `~/labbatdongsan/data/redis`<br/>$\to$ `/data` | Bộ nhớ đệm **Redis 7 AOF** chống quét trùng URL trong 24h và tăng tốc API. |
| **3** | **`propvalue_api`** | `ghcr.io/kinhteso/aptlabbatdongsan:latest` | `8000:8000` | `~/labbatdongsan/data` $\to$ `/app/data`<br/>`~/labbatdongsan/logs` $\to$ `/app/logs` | FastAPI Backend (`/api/v1/*`), Định giá BĐS Cấp Phường/Xã (Empirical Bayes + Hedonic OLS + LightGBM Quantile + SHAP), đồng bộ Google OAuth 2.0 & Máy chủ AI MCP. |
| **4** | **`propvalue_scraper_etl`** | `ghcr.io/kinhteso/aptlabbatdongsan:latest` | *(Chạy ngầm)* | `~/labbatdongsan/data` $\to$ `/app/data`<br/>`~/labbatdongsan/logs` $\to$ `/app/logs` | Trình cào đa nguồn BĐS (`Batdongsan`, `Chotot`, `Alonhadat`, `Mogi`), quét hồi cứu `2021–2026` (`backfill`) và tự động rà soát/chữa lành lỗi (`auto-heal`). |
| **5** | **`propvalue_webapp_pwa`** | `ghcr.io/kinhteso/aptlabbatdongsan-webapp:latest` | **`3359:3359`** | *(Kết nối qua `propvalue_api`)* | Giao diện **Next.js 15 (RWD + PWA)** tại cổng **`3359`**, nhận lưu lượng trực tiếp từ Cloudflare Tunnel **`https://aidinhgiabds.kinhtesox.net`**. |

---

## Phần 1: Các Bước Cài đặt trong Thư mục `~/labbatdongsan` trên Máy chủ Ubuntu

### Bước 1: Tạo thư mục `labbatdongsan` và kéo mã nguồn từ GitHub

Đăng nhập SSH vào máy chủ Ubuntu và chạy cụm lệnh sau:

```bash
# 1. Tạo thư mục labbatdongsan và di chuyển vào bên trong:
mkdir -p ~/labbatdongsan
cd ~/labbatdongsan

# 2. (Tùy chọn) Nếu dùng GitHub Personal Access Token (PAT Classic ghp_... có quyền repo & read:packages):
export GITHUB_USER="kinhteso"
export GITHUB_PAT="ghp_DÁN_MÃ_TOKEN_CỦA_BẠN_VÀO_ĐÂY"
echo "$GITHUB_PAT" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin

# 3. Kéo toàn bộ mã nguồn vào ngay trong thư mục ~/labbatdongsan (chú ý dấu chấm . ở cuối):
git clone https://github.com/kinhteso/aptlabbatdongsan.git .
```

*(Nếu máy chủ Ubuntu chưa cài Docker, chạy 2 dòng: `curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER && newgrp docker`).*

---

### Bước 2: Tạo cây thư mục lưu trữ trên ổ cứng (`~/labbatdongsan/data/`) & Cấu hình `.env`

```bash
cd ~/labbatdongsan

# 1. Tạo các thư mục Bind Mount lưu dữ liệu bền vững ngoài Container:
mkdir -p data/postgres data/redis data/bronze data/silver data/gold logs/html_snapshots docs/audits

# 2. Sao chép file cấu hình .env chuẩn:
cp .env.example .env
```

Mở tệp `.env` bằng `nano .env` và kiểm tra/cập nhật các thông số chuẩn cho tên miền **`https://aidinhgiabds.kinhtesox.net`**, cổng **`3359`** và database **`real_estate_market`**:

```bash
nano .env
```

Nội dung chuẩn của tệp `~/labbatdongsan/.env`:
```ini
# --- Cổng Web mặc định (Next.js RWD + PWA mở tại port 3359) & Tên miền Cloudflare Tunnel ---
WEBAPP_PORT=3359
PORT=3359
API_PORT=8000
NEXTAUTH_URL=https://aidinhgiabds.kinhtesox.net
NEXT_PUBLIC_APP_URL=https://aidinhgiabds.kinhtesox.net
NEXT_PUBLIC_API_URL=http://localhost:8000
AUTH_SECRET=skillvalue_google_oauth_hmac_secret_2026

# --- Google OAuth 2.0 Credentials (Đồng bộ từ LabThitruonglaodongso) ---
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET

# --- Admin Emails & Mật khẩu Bảo mật Nội bộ Lab ---
ADMIN_EMAIL=phungtuananh3333@gmail.com
ADMIN_EMAILS=phungtuananh3333@gmail.com,phungtuananh2222@gmail.com
ADMIN_PASSWORD=skillvalue_secret_2026

# --- Cơ sở dữ liệu Docker PostgreSQL (real_estate_market) & Redis ---
POSTGRES_USER=skillvalue
POSTGRES_PASSWORD=skillvalue_secret_2026
POSTGRES_DB=real_estate_market
POSTGRES_PORT=5432
REDIS_PORT=6379

# --- Thư mục Bind Mount ngoài Host (~/labbatdongsan/data) ---
HOST_POSTGRES_DATA_DIR=./data/postgres
HOST_REDIS_DATA_DIR=./data/redis
SCRAPER_MODE=daemon

DATABASE_URL=postgresql://skillvalue:skillvalue_secret_2026@localhost:5432/real_estate_market
REDIS_URL=redis://localhost:6379/0
```
*(Nhấn `Ctrl + O` $\to$ `Enter` để lưu và `Ctrl + X` để thoát `nano`).*

> [!NOTE]
> **Lưu ý nếu trên cùng máy chủ Ubuntu bạn đang chạy cả `lablaodongso`:**  
> Nếu container `skillvalue_postgres` (cổng `5432`) và `skillvalue_redis` (cổng `6379`) của `lablaodongso` đang chiếm cổng `5432`, `6379`, `8000` trên Host Ubuntu, bạn chỉ cần đổi 3 dòng cổng Host trong `~/labbatdongsan/.env` thành:
> ```ini
> POSTGRES_PORT=5433
> REDIS_PORT=6380
> API_PORT=8001
> ```
> Các container bên trong mạng nội bộ `propvalue_net` vẫn giao tiếp với nhau qua cổng nội bộ chuẩn (`postgres:5432`, `redis:6379`, `api:8000`) mà không hề xung đột với `lablaodongso`! Còn cổng WebApp của `labbatdongsan` là **`3359`** đã tách biệt hoàn toàn với cổng `3358` của `lablaodongso`.

---

### Bước 3: Đồng bộ giờ `GMT+07` & Khởi chạy 5 Container từ GHCR

```bash
cd ~/labbatdongsan

# Cấp quyền thực thi cho toàn bộ scripts vận hành:
chmod +x deploy/ubuntu-docker/*.sh

# Chạy kịch bản tự động đồng bộ giờ GMT+07, kéo GHCR image và bật 5 container:
./deploy/ubuntu-docker/setup-ubuntu.sh
```

Kiểm tra nhanh 5 container đang chạy tại cổng `3359`:
```bash
docker ps --filter "name=propvalue_" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
curl -I http://localhost:3359
```

---

## Phần 2: Cấu hình Cloudflare Tunnel Ánh xạ `localhost:3359` về Tên miền `https://aidinhgiabds.kinhtesox.net`

Bạn có thể cấu hình ánh xạ cổng `3359` ra tên miền **`https://aidinhgiabds.kinhtesox.net`** theo **Cách 1 (Trên Web Cloudflare Zero Trust Dashboard — khuyên dùng nếu máy Ubuntu đã cài sẵn `cloudflared` cho `digijoblab.kinhtesox.net`)** hoặc **Cách 2 (Qua tệp cấu hình `/etc/cloudflared/config.yml` trên Ubuntu)**.

### Cách 1: Thêm Public Hostname trên giao diện Cloudflare Zero Trust Dashboard (Chỉ mất 30 giây)

Nếu máy chủ Ubuntu của bạn đã có sẵn Tunnel đang chạy tên miền `digijoblab.kinhtesox.net` (cổng `3358`), bạn **không cần cài lại `cloudflared`**, chỉ cần thêm 1 dòng ánh xạ mới vào cùng Tunnel đó:

1. Truy cập [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/) $\rightarrow$ vào menu **Networks** $\rightarrow$ **Tunnels**.
2. Nhấn vào Tunnel đang hoạt động trên máy chủ Ubuntu của bạn $\rightarrow$ chọn **Configure** $\rightarrow$ chuyển sang tab **Public Hostname** $\rightarrow$ nhấn **Add a public hostname**.
3. Điền thông số như sau:
   - **Subdomain:** `aidinhgiabds`
   - **Domain:** `kinhtesox.net` *(chọn từ danh sách miền có sẵn)*
   - **Path:** *(để trống)*
   - **Service Type:** `HTTP`
   - **URL:** `localhost:3359` *(hoặc `127.0.0.1:3359`)*
4. Nhấn **Save hostname**. Ngay lập tức Cloudflare sẽ tự động tạo bản ghi DNS `CNAME` cho `aidinhgiabds.kinhtesox.net`, cấp chứng chỉ SSL HTTPS tự động và trỏ thẳng vào container `propvalue_webapp_pwa` (Port `3359`)!

---

### Cách 2: Cấu hình bằng CLI `cloudflared` trực tiếp trên Máy chủ Ubuntu

Nếu bạn quản lý Cloudflare Tunnel bằng tệp `/etc/cloudflared/config.yml` trên máy Ubuntu:

#### 1. Nếu máy Ubuntu chưa cài `cloudflared`:
```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb && rm -f cloudflared.deb
cloudflared tunnel login
```

#### 2. Khai báo `aidinhgiabds.kinhtesox.net` $\to$ `http://localhost:3359` trong `/etc/cloudflared/config.yml`:
Mở file cấu hình Tunnel (`sudo nano /etc/cloudflared/config.yml`) và thêm rule `aidinhgiabds.kinhtesox.net` vào mục `ingress:` (có thể đặt song song cùng `digijoblab.kinhtesox.net`):

```yaml
tunnel: <TUNNEL_UUID_CỦA_BẠN>
credentials-file: /root/.cloudflared/<TUNNEL_UUID_CỦA_BẠN>.json

ingress:
  # 1. WebApp Lab Bất động sản (PropValue.AI - Port 3359)
  - hostname: aidinhgiabds.kinhtesox.net
    service: http://localhost:3359
    originRequest:
      noTLSVerify: true

  # 2. (Nếu có) WebApp Lab Lao động số (SkillValue.AI - Port 3358)
  - hostname: digijoblab.kinhtesox.net
    service: http://localhost:3358
    originRequest:
      noTLSVerify: true

  # Rule bắt buộc ở cuối cùng của Cloudflare Tunnel
  - service: http_status:404
```

#### 3. Tạo bản ghi DNS CNAME trên Cloudflare & Khởi động lại dịch vụ `cloudflared`:
```bash
# Tự động trỏ CNAME aidinhgiabds.kinhtesox.net vào Tunnel:
cloudflared tunnel route dns <TÊN_HOẶC_UUID_TUNNEL> aidinhgiabds.kinhtesox.net

# Cài đặt và khởi động lại dịch vụ cloudflared chạy ngầm 24/7 cùng Ubuntu:
sudo cloudflared service install || true
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
```

---

## Phần 3: Đăng ký Tên miền `https://aidinhgiabds.kinhtesox.net` trong Google Cloud Console (Cho Google OAuth 2.0)

Hàm [`resolveRequestOrigin()`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/lib/googleAuth.ts#L100-L124) và [`getGoogleOAuthConfig()`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/lib/googleAuth.ts#L126-L169) trong `PropValue.AI` đã được lập trình để **tự động đọc header `x-forwarded-host: aidinhgiabds.kinhtesox.net` và `x-forwarded-proto: https`** do Cloudflare Tunnel gửi vào. Nhờ vậy, khi người dùng truy cập từ `https://aidinhgiabds.kinhtesox.net`, hệ thống tự động tạo Callback URL là:
`https://aidinhgiabds.kinhtesox.net/api/auth/callback/google`

Để Google cho phép đăng nhập trên tên miền mới này mà không báo lỗi `Error 400: redirect_uri_mismatch`, bạn chỉ cần thêm URI vào Google Cloud Console:

1. Truy cập [Google Cloud Console — Credentials](https://console.cloud.google.com/apis/credentials).
2. Nhấn vào OAuth 2.0 Client ID đang dùng (`YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com`).
3. Tại mục **Authorized JavaScript origins**, nhấn **+ ADD URI** và thêm:
   - `https://aidinhgiabds.kinhtesox.net`
   - `http://localhost:3359`
4. Tại mục **Authorized redirect URIs**, nhấn **+ ADD URI** và thêm:
   - `https://aidinhgiabds.kinhtesox.net/api/auth/callback/google`
   - `http://localhost:3359/api/auth/callback/google`
5. Nhấn **Save**.

> [!TIP]
> **Mẹo Đăng nhập Ngay lập tức không cần đợi Google Cloud Console cập nhật:**  
> Trong thời gian 1–2 phút chờ Google Cloud Console đồng bộ Redirect URI mới, bạn có thể mở `https://aidinhgiabds.kinhtesox.net`, nhấn **Đăng nhập Lab** và nhập:
> - **Email:** `phungtuananh3333@gmail.com` (hoặc `phungtuananh2222@gmail.com`)
> - **Mật khẩu bảo mật Lab:** `skillvalue_secret_2026`  
> Hệ thống sẽ cấp phiên đăng nhập **`ADMIN`** ngay lập tức và mở khóa toàn bộ Trang trong (`https://aidinhgiabds.kinhtesox.net/workspace`)!

---

## Phần 4: Bộ Lệnh Vận hành, Quét Dữ liệu (`2021–2026`), Auto-Heal & Tracking tại `~/labbatdongsan`

Khi đang đứng tại `~/labbatdongsan` trên máy chủ Ubuntu, bạn sử dụng các lệnh sau:

```bash
cd ~/labbatdongsan

# 1. Kiểm tra toàn diện hệ thống (Giờ GMT+07/NTP + 5 Container + Ổ cứng + PostgreSQL real_estate_market):
./deploy/ubuntu-docker/track-system.sh

# 2. Kiểm toán trực tiếp tình trạng kết nối 6 Cổng Bất động sản Việt Nam:
./deploy/ubuntu-docker/run-scraper.sh audit-portals

# 3. Chạy chiến dịch quét hồi cứu lịch sử từ năm 2021 đến nay (2021-2026):
./deploy/ubuntu-docker/run-scraper.sh backfill --from-year 2021 --max-pages 20

# 4. Chạy tự động rà soát lỗi, tự chữa lành (Auto-Heal) và cài đặt Cronjob chạy ngầm mỗi giờ:
./deploy/ubuntu-docker/auto-heal-and-audit.sh --install-cron

# 5. Xem log thời gian thực của tiến trình quét BĐS chạy ngầm:
docker logs -f --tail 80 propvalue_scraper_etl
```
