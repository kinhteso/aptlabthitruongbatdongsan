# Hướng dẫn Triển khai PropValue.AI trên Ubuntu Server với Docker & GHCR (Port `3359`)

Tài liệu này hướng dẫn chi tiết cách cài đặt, xác thực và vận hành hệ thống **PropValue.AI (`aptlabthitruongbatdongsan`)** trên máy chủ **Ubuntu 22.04 / 24.04 LTS** bằng Docker Compose và GitHub Container Registry (**GHCR**).

---

## 1. Thông số Cổng & Image GHCR Chuẩn

| Thành phần (Service) | Container Name | Image GHCR / Nguồn | Cổng (Host:Container) |
| :--- | :--- | :--- | :--- |
| **Next.js 15 WebApp** | `propvalue-webapp` | `ghcr.io/kinhteso/aptlabthitruongbatdongsan-webapp:latest` | **`3359:3359`** |
| **FastAPI Backend & ML AVM** | `propvalue-api` | `ghcr.io/kinhteso/aptlabthitruongbatdongsan:latest` | **`8000:8000`** |
| **Scraper & Auto-Heal Worker** | `propvalue-scraper-worker` | `ghcr.io/kinhteso/aptlabthitruongbatdongsan:latest` | *(Chạy ngầm)* |
| **PostgreSQL 16 Database** | `propvalue-postgres` | `postgres:16-alpine` | **`5432:5432`** |
| **Redis 7 Cache** | `propvalue-redis` | `redis:7-alpine` | **`6379:6379`** |

---

## 2. Cơ chế Xác thực & Quản trị Hệ thống (Giống hệt `LabThitruonglaodongso`)

1. **Tài khoản Admin Mặc định:**
   - **Danh sách Email Admin (`ADMIN_EMAILS`):** `phungtuananh3333@gmail.com,phungtuananh2222@gmail.com`
   - **Mật khẩu Admin (`ADMIN_PASSWORD`):** `skillvalue_secret_2026`
2. **Cách đăng nhập trên Cổng `3359` (`http://<IP-Ubuntu>:3359/login`):**
   - **Phương thức 1 (Mật khẩu Admin trực tiếp):** Nhập Email `phungtuananh3333@gmail.com` và mật khẩu `skillvalue_secret_2026` tại trang `/login`. Hệ thống cấp quyền `ADMIN` ngay lập tức mà không cần cấu hình Google OAuth.
   - **Phương thức 2 (Google OAuth 2.0):** Cấu hình `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET` trong `.env` hoặc trực tiếp trong bảng **Admin Control Plane** trên giao diện Web. Redirect URI chuẩn:
     - Chạy Local: `http://localhost:3359/api/auth/google/callback`
     - Chạy tên miền thực: `https://<ten-mien-cua-ban>/api/auth/google/callback`
   - **Quy tắc First-User Auto-Admin:** Nếu bảng `app_users` chưa có quản trị viên nào, người dùng đầu tiên đăng nhập thành công sẽ tự động được gán vai trò `ADMIN`.

---

## 3. Các bước Cài đặt Nhanh trên Ubuntu Server

### Bước 1: Clone Repository và Cấp quyền Thực thi Scripts
```bash
git clone https://github.com/kinhteso/aptlabthitruongbatdongsan.git
cd aptlabthitruongbatdongsan
chmod +x deploy/ubuntu-docker/*.sh
```

### Bước 2: Khởi chạy bằng Script Tự động (`setup-ubuntu.sh`)
- **Chế độ 1 — Tải trực tiếp Image đã build sẵn từ GHCR (Nhanh nhất, không tốn RAM/CPU build):**
  ```bash
  ./deploy/ubuntu-docker/setup-ubuntu.sh --use-ghcr
  ```
- **Chế độ 2 — Tự build Docker Image tại chỗ từ mã nguồn:**
  ```bash
  ./deploy/ubuntu-docker/setup-ubuntu.sh
  ```

Script `setup-ubuntu.sh` sẽ tự động:
1. Kiểm tra và cài đặt Docker Engine + Docker Compose v2 nếu máy chủ Ubuntu chưa có.
2. Khởi tạo file `.env` từ `.env.example` với `WEBAPP_PORT=3359` và `ADMIN_PASSWORD=skillvalue_secret_2026`.
3. Khởi chạy PostgreSQL 16 và nạp đầy đủ schema `infra/postgres/init_schema.sql` (bao gồm bảng `jobs_master` hỗ trợ 34/63 tỉnh thành và `gold_ward_valuation_index` cấp Phường/Xã).
4. Khởi động `propvalue-api` (cổng `8000`), `propvalue-webapp` (cổng `3359`) và `propvalue-scraper-worker`.
5. Thực thi kiểm tra sức khỏe 6 cổng BĐS và tự sửa lỗi lần đầu (`auto-heal-and-audit.sh`).

---

## 4. Thiết lập Cronjob Tự động Quét (`2021–2026`) & Tự Phục hồi Lỗi (`auto-heal`) trên Ubuntu

Mở trình quản lý lịch trình `crontab -e` trên máy chủ Ubuntu và thêm 02 dòng sau:

```cron
# 1. Tự động rà soát lỗi 6 cổng BĐS, tự phục hồi kết nối và làm mới chỉ số Phường/Xã mỗi 6 giờ
0 */6 * * * cd /opt/aptlabthitruongbatdongsan && ./deploy/ubuntu-docker/auto-heal-and-audit.sh >> ./logs/cron_auto_heal.log 2>&1

# 2. Tự động quét tin đăng mới hàng ngày lúc 01:30 sáng
30 1 * * * cd /opt/aptlabthitruongbatdongsan && ./deploy/ubuntu-docker/run-scraper.sh --mode incremental --target 1000 >> ./logs/cron_scraper.log 2>&1
```
