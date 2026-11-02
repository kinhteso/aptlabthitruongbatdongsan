# PropValue.AI — Hệ thống Định giá Tự động (AVM) Cấp Phường/Xã & Trí tuệ Thị trường Bất động sản Việt Nam (`2021–2026`)

[![Build and Publish Docker Images to GHCR](https://github.com/kinhteso/aptlabthitruongbatdongsan/actions/workflows/publish-ghcr.yml/badge.svg)](https://github.com/kinhteso/aptlabthitruongbatdongsan/actions/workflows/publish-ghcr.yml)

**PropValue.AI (`aptlabthitruongbatdongsan`)** là nền tảng nghiên cứu kinh tế lượng không gian, định giá tự động cấp Phường/Xã (**Ward-Level Spatial Hedonic AVM**) và thu thập dữ liệu đa nguồn tin đăng bất động sản Việt Nam giai đoạn **`2021–2026`**. Hệ thống được thiết kế đồng构 (isomorphic) với kiến trúc của `LabThitruonglaodongso`, chạy trên **Next.js 15 App Router (Port `3359`) + FastAPI (Port `8000`) + PostgreSQL 16 + Redis 7** và đóng gói tự động lên **GitHub Container Registry (GHCR)**.

---

## 1. Điểm nhấn Kiến trúc & Mô hình Học thuật

1. **Ánh xạ Song song `34 Tỉnh/Thành mới` (Nghị quyết 202/2025/QH15) $\leftrightarrow$ `63 Tỉnh/Thành cũ`:**
   - Gồm **06 Thành phố trực thuộc Trung ương** (`Hà Nội`, `TP. Hồ Chí Minh` [gộp TP.HCM + Bình Dương + Bà Rịa - Vũng Tàu], `Hải Phòng` [gộp Hải Phòng + Hải Dương], `Đà Nẵng` [gộp Đà Nẵng + Quảng Nam], `Huế`, `Cần Thơ` [gộp Cần Thơ + Sóc Trăng + Hậu Giang]) và **28 Tỉnh**.
   - Tự động nhận diện địa chỉ kép trên tin đăng (ví dụ: *"Phường An Phú, TP. Thủ Đức, TP.HCM"* hay *"Phường Dĩ An, Bình Dương cũ — nay thuộc TP.HCM mới"*) và lưu song song vào PostgreSQL (`province_34_code`, `legacy_63_code`, `ward_code`).
2. **Định giá Tự động Cấp Phường/Xã (Ward-Level Empirical Bayes Spatial Shrinkage AVM):**
   - Áp dụng bộ ước lượng co rút không gian Empirical Bayes kết hợp Hồi quy Hedonic Lượng tử (Rosen 1974, Zietz et al. 2008, Kim 2004):
     $$\hat{P}_{w}^{\text{EB}} = \gamma_w \cdot \bar{P}_{w}^{\text{obs}} + (1 - \gamma_w) \cdot \hat{P}_{p(w), z(w)}^{\text{prior}}, \quad \gamma_w = \frac{n_w}{n_w + \kappa} \quad (\kappa = 15)$$
3. **Phân loại 06 Vùng Chức năng Kinh tế Đặc thù (`functional_zone_code`):**
   - `ZONE_CBD_URBAN_CORE` (Lõi đô thị trung tâm CBD $+68\%$)
   - `ZONE_INDUSTRIAL_FDI_PARK` (Khu công nghiệp & Đô thị vệ tinh FDI $+26\%$)
   - `ZONE_CRAFT_VILLAGE_HERITAGE` (Khu làng nghề truyền thống & Thương mại làng nghề $+34\%$)
   - `ZONE_TOURISM_RESORT_COASTAL` (Khu du lịch biển, Đảo & Nghỉ dưỡng sinh thái $+45\%$)
   - `ZONE_HITECH_UNIVERSITY_TOD` (Khu công nghệ cao, Đại học & Hành lang Metro TOD $+38\%$)
   - `ZONE_SUBURBAN_RESIDENTIAL_AGRI` (Khu dân cư ven đô & Sinh thái nông nghiệp $0\%$)
4. **Chiến dịch Quét Tin theo Thời gian (`2021–2026`) & Tự động Rà soát Lỗi (`auto-heal`):**
   - Quét đa nguồn (`Chợ Tốt Nhà / Chotot API`, `Batdongsan.com.vn`, `Mogi.vn`, `Alonhadat.com.vn`, `Muaban.net`, `Meeyland.com`) kết hợp Wayback CDX (`2021–2026`).
   - Script `auto-heal` tự động kiểm tra sức khỏe 6 cổng BĐS, phát hiện lỗi `403 Cloudflare`/`Timeout`, chuyển mạch sang Playwright Stealth/Wayback CDX và tự động điền khuyết tọa độ Phường/Xã.

---

## 2. Cơ chế Xác thực & Phân quyền (Giống hệt `LabThitruonglaodongso` — Cổng `3359`)

Hệ thống sử dụng cơ chế xác thực kép (**Hybrid Google OAuth 2.0 + Mật khẩu Quản trị**) cùng **RBAC 4 tầng (`ADMIN`, `RESEARCHER`, `PRO_INVESTOR`, `GUEST`)** hoàn toàn tương đồng với `LabThitruonglaodongso`:

| Tham số / Cơ chế | Giá trị Mặc định / Quy tắc Hoạt động |
| :--- | :--- |
| **Cổng WebApp (Next.js 15)** | **`3359`** (`http://localhost:3359` hoặc `http://<IP-Server>:3359`) |
| **Cổng FastAPI Backend** | **`8000`** (`http://localhost:8000/docs`) |
| **Email Quản trị (`ADMIN_EMAILS`)** | `phungtuananh3333@gmail.com,phungtuananh2222@gmail.com` |
| **Mật khẩu Quản trị (`ADMIN_PASSWORD`)** | `skillvalue_secret_2026` |
| **Cơ chế Tự động Cấp quyền Đầu tiên** | Tài khoản đầu tiên đăng nhập vào hệ thống hoặc khớp với danh sách `ADMIN_EMAILS` sẽ **tự động nhận quyền `ADMIN`** và lưu vào bảng `app_users` trong PostgreSQL. |
| **Đăng nhập bằng Mật khẩu (Dự phòng)** | Tại màn hình `/login`, nhập Email quản trị (`phungtuananh3333@gmail.com`) và mật khẩu `skillvalue_secret_2026` để nhận phiên `ADMIN` ngay lập tức (không phụ thuộc Google OAuth khi chạy nội bộ/IP). |
| **Đăng nhập bằng Google OAuth 2.0** | Hỗ trợ cấu hình `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI=http://localhost:3359/api/auth/google/callback` ngay trên giao diện **Admin Control Plane** hoặc qua file `.env`. |

---

## 3. Hướng dẫn Cài đặt & Triển khai trên Ubuntu Server / Docker từ GHCR

Hệ thống được GitHub Actions tự động đóng gói thành 02 Docker Images trên **GitHub Container Registry (GHCR)**:
- **Backend + Scraper + ML Worker:** `ghcr.io/kinhteso/aptlabthitruongbatdongsan:latest`
- **Next.js 15 WebApp (Port `3359`):** `ghcr.io/kinhteso/aptlabthitruongbatdongsan-webapp:latest`

### Cách 1: Triển khai Nhanh bằng Pre-built Images từ GHCR (Khuyên dùng cho Ubuntu Server)

Không cần build lại mã nguồn trên máy chủ. Chỉ cần cài đặt Docker & Docker Compose, sau đó chạy các lệnh sau:

#### Bước 1: Chuẩn bị thư mục và tải cấu hình triển khai trên Ubuntu
```bash
git clone https://github.com/kinhteso/aptlabthitruongbatdongsan.git
cd aptlabthitruongbatdongsan
cp .env.example .env
```

*(Nếu repository hoặc package GHCR để ở chế độ Private, đăng nhập GHCR bằng Personal Access Token có quyền `read:packages`:)*
```bash
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u kinhteso --password-stdin
```

#### Bước 2: Kiểm tra cấu hình `.env` (Mặc định đã thiết lập sẵn cổng `3359` và tài khoản Admin)
```ini
POSTGRES_USER=propvalue_admin
POSTGRES_PASSWORD=propvalue_secret_2026
POSTGRES_DB=vietnam_real_estate_intel

WEBAPP_PORT=3359
ADMIN_EMAILS=phungtuananh3333@gmail.com,phungtuananh2222@gmail.com
ADMIN_PASSWORD=skillvalue_secret_2026

BACKEND_IMAGE=ghcr.io/kinhteso/aptlabthitruongbatdongsan:latest
WEBAPP_IMAGE=ghcr.io/kinhteso/aptlabthitruongbatdongsan-webapp:latest
```

#### Bước 3: Kéo (Pull) Docker Images từ GHCR và Khởi chạy toàn bộ 5 Services
```bash
docker compose -f deploy/ubuntu-docker/docker-compose.ghcr.yml --env-file .env pull
docker compose -f deploy/ubuntu-docker/docker-compose.ghcr.yml --env-file .env up -d
```

Hoặc sử dụng script tự động hóa toàn trình trên Ubuntu (tự động cài Docker nếu thiếu, tạo `.env`, khởi tạo schema PostgreSQL, chạy `auto-heal` và cài đặt Cronjob):
```bash
chmod +x deploy/ubuntu-docker/*.sh
./deploy/ubuntu-docker/setup-ubuntu.sh --use-ghcr
```

---

### Cách 2: Tự Build trực tiếp từ Mã nguồn trên Máy chủ (Local Build)

Nếu muốn tự build image từ mã nguồn vừa chỉnh sửa:
```bash
git clone https://github.com/kinhteso/aptlabthitruongbatdongsan.git
cd aptlabthitruongbatdongsan
cp .env.example .env

# Build và khởi động toàn bộ 5 container (postgres, redis, api, webapp:3359, scraper-worker)
docker compose up -d --build
```

---

## 4. Vận hành Chiến dịch Quét Dữ liệu (`2021–2026`) & Tự động Rà soát Lỗi (`auto-heal`)

| Tác vụ Vận hành | Lệnh Thực thi trên Ubuntu / Docker |
| :--- | :--- |
| **1. Kiểm tra trạng thái các cổng BĐS (`audit-portals`)** | `docker exec propvalue-api python -m src.scrapers.scheduler --mode audit-portals` |
| **2. Chạy tự động rà soát lỗi & tự phục hồi (`auto-heal`)** | `./deploy/ubuntu-docker/auto-heal-and-audit.sh` |
| **3. Chạy chiến dịch quét lịch sử `2021–2026` (`backfill`)** | `./deploy/ubuntu-docker/run-scraper.sh --mode backfill --year-from 2021 --year-to 2026 --target 10000` |
| **4. Chạy quét định kỳ hàng ngày (`incremental`)** | `./deploy/ubuntu-docker/run-scraper.sh --mode incremental --target 500` |
| **5. Kiểm toán Khung phân tích & 10 bài test End-to-End** | `docker exec propvalue-api python -m tests.verify_pipeline` |

---

## 5. Danh mục Tài liệu Chuyên sâu trong thư mục [`docs/`](./docs/README.md)

- [`docs/README.md`](./docs/README.md): Tổng mục lục tài liệu kiến trúc & kinh tế lượng bất động sản.
- [`docs/01-khung-ly-thuyet-kinh-te-hoc-bds-va-mo-hinh-avm-quoc-te.md`](./docs/01-khung-ly-thuyet-kinh-te-hoc-bds-va-mo-hinh-avm-quoc-te.md): Lý thuyết Hedonic (Lancaster 1966, Rosen 1974), Bid-Rent, Quantile Hedonic và thực tiễn ML AVM quốc tế.
- [`docs/02-thap-phan-tang-gia-tri-6-tang-va-tu-dien-thuoc-tinh-hedonic.md`](./docs/02-thap-phan-tang-gia-tri-6-tang-va-tu-dien-thuoc-tinh-hedonic.md): 4 trụ cột phân khúc, 16 loại hình BĐS, Tháp giá trị 6 tầng và Từ điển thuộc tính Hedonic 4 tầng.
- [`docs/03-he-thong-quet-34-63-tinh-thanh-song-hanh-va-dinh-gia-cap-phuong-xa.md`](./docs/03-he-thong-quet-34-63-tinh-thanh-song-hanh-va-dinh-gia-cap-phuong-xa.md): Quy hoạch 34 Tỉnh/Thành mới song song 63 Tỉnh/Thành cũ, Định giá cấp Phường/Xã và 6 Vùng kinh tế đặc thù.
- [`docs/04-kien-truc-ung-dung-propvalue-ai-rbac-mcp-va-docker-ubuntu.md`](./docs/04-kien-truc-ung-dung-propvalue-ai-rbac-mcp-va-docker-ubuntu.md): Kiến trúc WebApp Next.js 15 (Port `3359`), FastAPI, RBAC 4 tầng, MCP Server và Docker Ubuntu / GHCR.
- [`docs/05-nhat-ky-tu-van-hoi-dap-va-phan-bien-hoc-thuat.md`](./docs/05-nhat-ky-tu-van-hoi-dap-va-phan-bien-hoc-thuat.md): Nhật ký Hỏi – Đáp chuyên môn toàn diện từ đầu dự án.
- [`docs/06-co-che-tu-dong-danh-gia-va-tai-cau-truc-khung.md`](./docs/06-co-che-tu-dong-danh-gia-va-tai-cau-truc-khung.md): Cơ chế tự động kiểm toán và tái cấu trúc khung phân tích (`framework-review`).
- [`docs/07-ra-soat-cong-bds-chien-dich-quet-2021-2026-va-trien-khai-docker-ubuntu.md`](./docs/07-ra-soat-cong-bds-chien-dich-quet-2021-2026-va-trien-khai-docker-ubuntu.md): Báo cáo rà soát kỹ thuật 6 cổng BĐS, kế hoạch quét `2021–2026`, kịch bản `auto-heal` và hướng dẫn triển khai GHCR.
