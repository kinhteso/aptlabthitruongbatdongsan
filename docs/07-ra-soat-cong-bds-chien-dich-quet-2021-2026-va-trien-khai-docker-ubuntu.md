# Chuyên mục 07: Rà Soát Các Trang Web Đăng Tin Bất Động Sản, Cơ Chế Quét Lịch Sử (2021–Nay), Tự Động Rà Soát Lỗi & Kế Hoạch Triển Khai Trên Docker Ubuntu

> **Cập nhật lần cuối:** `02/11/2026 (GMT+07)`  
> **Phạm vi:** Rà soát kỹ thuật 6 cổng tin đăng BĐS Việt Nam, kiến trúc quét hồi cứu theo thời gian `2021–2026`, hệ thống scripts tự động chạy & tự chữa lành lỗi (`auto-heal`), triển khai Next.js WebApp + PostgreSQL 16 trên Docker Ubuntu và lộ trình thực thi 4 giai đoạn.

---

## 1. Báo Cáo Rà Soát Kỹ Thuật Các Trang Web Đăng Tin Bất Động Sản Tại Việt Nam

Trước khi phát động chiến dịch thu thập dữ liệu diện rộng trên toàn bộ **34 tỉnh/thành mới $\leftrightarrow$ 63 tỉnh/thành cũ**, hệ thống **PropValue.AI** thực hiện kiểm toán kỹ thuật (`python -m src.scrapers.scheduler --mode audit-portals`) đối với 6 cổng thông tin bất động sản lớn nhất Việt Nam (4 cổng Tier-1 chủ lực chiếm **95.0%** thị phần tin đăng và 2 cổng Tier-2 bổ sung dữ liệu lịch sử & quy hoạch):

| TT | Trang Web Đăng Tin BĐS | Phân hạng & Thị phần | Sản lượng mới / ngày | Kiến trúc Render & Dữ liệu Có cấu trúc | Cơ chế Chống Bot (WAF) & Engine Khuyến nghị | Độ phủ Lịch sử 2021–2026 & Đặc trưng Hedonic |
| :-: | :--- | :---: | :---: | :--- | :--- | :--- |
| **1** | **Batdongsan.com.vn**<br>*(PropertyGuru Vietnam)* | **Tier-1 Core**<br>`44.5%` | ~`4.500` tin/ngày | SSR HTML + JSON-LD chuẩn `Schema.org/RealEstateListing` & `Offer` | **Cao** (Cloudflare Enterprise Turnstile + TLS JA3 Fingerprint)<br>$\to$ `playwright_stealth` (Jitter `2.5s–4.5s`) | **Rất cao (2021–2026):** Mật độ snapshot Wayback CDX dày đặc, Sitemap XML lưu trữ sâu, có Widget lịch sử giá 5 năm cấp Phường/Dự án. |
| **2** | **Nha.Chotot.com**<br>*(Chợ Tốt Nhà - Carousell)* | **Tier-1 Core**<br>`24.0%` | ~`3.200` tin/ngày | Next.js SSR (`<script id="__NEXT_DATA__">`) + REST API `gateway.chotot.com/v1/public/ad-listing` | **Trung bình** (Rate-limit theo IP, ít chặn CAPTCHA khi `concurrency <= 3`)<br>$\to$ `playwright_stealth` + `__NEXT_DATA__` | **Cao (2021–2026):** Cung cấp trực tiếp tọa độ GPS (`latitude`, `longitude`), đơn giá `price_million_per_m2`, `ward_name` và `property_legal_document`. |
| **3** | **Alonhadat.com.vn**<br>*(Alo Nhà Đất)* | **Tier-1 Core**<br>`16.0%` | ~`2.100` tin/ngày | Server-Side Rendered HTML thuần (Classic DOM) | **Thấp – Trung bình** (Kiểm tra User-Agent & tốc độ tải)<br>$\to$ `httpx_or_playwright` | **Cao (2021–2026):** Cấu trúc URL phân trang tĩnh `/trang-{page}.html` giữ nguyên từ 2021; bóc tách cực chuẩn `Đường trước nhà (m)`, `Mặt tiền (m)`, `Hướng`, `Sổ đỏ` tại 63 tỉnh. |
| **4** | **Mogi.vn**<br>*(Mogi Real Estate)* | **Tier-1 Core**<br>`10.5%` | ~`1.400` tin/ngày | SSR HTML + JSON-LD `Product` / `SingleFamilyResidence` | **Trung bình**<br>$\to$ `playwright_or_api` | **Khá – Cao (2021–2026):** Bóc tách sẵn kích thước `Ngang x Dài (m)`, pháp lý và có chuyên trang `Mogi Price Review` lưu lịch sử giá cấp Phường/Đường từ 2021. |
| **5** | **Muaban.net**<br>*(BĐS Mua Bán)* | **Tier-2 Expansion**<br>`2.5%` | ~`450` tin/ngày | Next.js SSR (`__NEXT_DATA__`) | **Thấp**<br>$\to$ `httpx_or_playwright` | **Rất cao (2021–2026):** Kho dữ liệu rao vặt nhà đất thổ cư chính chủ lâu đời nhất tại Hà Nội & TP.HCM từ giai đoạn 2021–2023. |
| **6** | **Nhadat.Cafeland.vn**<br>*(CafeLand BĐS)* | **Tier-2 Expansion**<br>`1.5%` | ~`300` tin/ngày | SSR HTML | **Thấp**<br>$\to$ `httpx_or_playwright` | **Cao (2021–2026):** Rất mạnh về phân khúc Đất nền dự án 1/500, Đất ven Khu công nghiệp (VSIP, Becamex) và thông tin quy hoạch hạ tầng. |

---

## 2. Cơ Chế Thiết Lập Quét Tin Theo Thời Gian Từ Năm 2021 Đến Nay (2021–2026)

Để thu thập đủ chuỗi thời gian **6 năm liên tục (`01/01/2021 – 02/11/2026`)** phục vụ kiểm định chu kỳ bất động sản và khử lạm phát CPI (`REAL_CPI_2026`), hệ thống triển khai **Kiến trúc Thu thập Đa Kênh Theo Mốc Thời Gian (3-Tier Temporal Scraping Architecture)** trong [`CrawlScheduler.execute_historical_backfill`](file:///f:/Code/LabThitruongbatdongsan/src/scrapers/scheduler.py#L465-L565):

### 2.1. Ba kênh thu thập theo giai đoạn lịch sử
1. **Giai đoạn 2021 – 2023 (Hồi cứu Lịch sử Sâu — Historical Archival Layer):**
   - **Wayback Machine CDX Server API (`enable_wayback_cdx_2021_2024: true`):** Truy vấn tự động kho lưu trữ Internet Archive (`http://web.archive.org/cdx/search/cdx?url=batdongsan.com.vn/*&from=20210101&to=20241231&output=json`) để lấy lại các bản chụp HTML nguyên bản của tin đăng BĐS giai đoạn 2021–2023 đã hết hạn trên trang chủ.
   - **Sitemap XML Lịch sử (`enable_sitemap_archive: true`):** Quét các tệp `sitemap-listings-2021..2024.xml` và danh mục dự án lịch sử.
2. **Giai đoạn 2024 – 2025 (Phân trang Sâu & Chuyển tiếp Hành chính 63 $\to$ 34 Tỉnh):**
   - **Deep Pagination (`--max-pages 25..50`):** Duyệt sâu qua các trang danh mục theo từng Tỉnh/Thành và Phân khúc (`DE-01..DE-04` / `RE-01..RE-04`).
   - Bảo toàn đồng thời địa chỉ 63 tỉnh cũ (trước sáp nhập) và tự động ánh xạ sang 34 tỉnh/thành mới qua `GeoNormalizer`.
3. **Giai đoạn 2026 – Nay (Quét Thời gian thực & Theo dõi Thanh khoản Tồn kho — Live Daemon):**
   - Chạy tiến trình ngầm 24/7 (`--mode daemon`, chu kỳ **4 giờ/lần** theo giờ chuẩn `Asia/Ho_Chi_Minh` GMT+07).
   - Khi bắt gặp lại một URL tin đăng đang còn rao bán, hệ thống gọi `touch_existing_job_by_url()` để cập nhật số ngày tồn kho trên thị trường (`vacancy_duration_days` / *Time-on-Market*), phục vụ phân tích thanh khoản theo mô hình Wheaton (1990).

### 2.2. Chỉ tiêu phân bổ 100.000 bản ghi Master theo từng năm (2021–2026)
- **Năm 2021:** `7.800` bản ghi Master (`150` bản ghi/tuần lịch sử — `7,8%`)
- **Năm 2022:** `10.920` bản ghi Master (`210` bản ghi/tuần lịch sử — `10,9%`)
- **Năm 2023:** `14.560` bản ghi Master (`280` bản ghi/tuần lịch sử — `14,6%`)
- **Năm 2024:** `18.720` bản ghi Master (`360` bản ghi/tuần lịch sử — `18,7%`)
- **Năm 2025:** `23.400` bản ghi Master (`450` bản ghi/tuần lịch sử — `23,4%`)
- **Năm 2026:** `24.600` bản ghi Master (`555` bản ghi/tuần lịch sử — `24,6%`)

---

## 3. Hệ Thống Scripts Tự Động Chạy, Tự Động Rà Soát Lỗi & Tự Chữa Lành (`Auto-Heal`)

Hệ thống được trang bị cơ chế giám sát lỗi tự động ([`ScraperErrorLogger`](file:///f:/Code/LabThitruongbatdongsan/src/scrapers/error_logger.py)) kết hợp bộ kịch bản điều khiển tự động trên Ubuntu Docker ([`deploy/ubuntu-docker/auto-heal-and-audit.sh`](file:///f:/Code/LabThitruongbatdongsan/deploy/ubuntu-docker/auto-heal-and-audit.sh) và [`deploy/ubuntu-docker/run-scraper.sh`](file:///f:/Code/LabThitruongbatdongsan/deploy/ubuntu-docker/run-scraper.sh)):

### 3.1. Cơ chế Phát hiện, Chụp hiện trường & Tự chữa lành 5 Nhóm lỗi
1. `CLOUDFLARE_WAF_BLOCK` (HTTP 403 / Turnstile Challenge):
   - Tự động lưu nhật ký vào `logs/scraper_errors.jsonl`, chụp ảnh HTML hiện trường vào `logs/html_snapshots/`, đẩy URL vào Hàng đợi Chết (`scraper_dlq_retry.json` & bảng PostgreSQL `scraper_error_logs`).
   - Khi chạy `--mode auto-heal`, hệ thống tự động chuyển `engine` của cổng bị chặn sang `playwright_stealth` và tăng độ trễ ngẫu nhiên (`min_delay_sec: 3.5s`, `max_delay_sec: 6.5s`).
2. `SELECTOR_DRIFT_ZERO_LINKS` (HTTP 200 nhưng trích xuất được 0 link do trang web đổi giao diện DOM):
   - Tự động phân tích các class CSS xuất hiện nhiều nhất trong HTML Snapshot (`extract_dom_diagnostic_hint`) và tự động mở rộng bộ chọn CSS dự phòng (`DOM Drift Fallback`) trong `configs/scraper_settings.yaml`.
3. `DETAIL_PARSE_INCOMPLETE` & `SOFT_404` (Tin đăng bị xóa nhưng trả về HTTP 200):
   - Bộ lọc `is_soft_404_or_deleted_job()` tự động loại bỏ các trang báo *"Tin đăng không tồn tại / đã hết hạn"* để không làm bẩn tầng Silver/Gold.
4. `HTTP_STATUS_ERROR` (HTTP 429 / 500 / 502 / 503) & `NETWORK_TIMEOUT`:
   - Tự động đưa vào Hàng đợi DLQ (`PENDING_RETRY`) và quét bù tự động qua `--mode retry-errors` / `--mode auto-heal` cho đến khi trạng thái chuyển thành `RESOLVED`.

### 3.2. Danh mục Các Lệnh Điều khiển Tự động Trên Ubuntu Docker
- **Khởi tạo toàn bộ hạ tầng Docker Ubuntu (PostgreSQL 16, Redis 7, FastAPI, Next.js WebApp Port 3358, Scraper Daemon):**
  ```bash
  bash deploy/ubuntu-docker/setup-ubuntu.sh
  ```
- **Cài đặt Cron tự động chạy rà soát lỗi, tự chữa lành & kiểm toán mỗi giờ (`0 * * * *`) trên Ubuntu:**
  ```bash
  bash deploy/ubuntu-docker/auto-heal-and-audit.sh --install-cron
  ```
- **Chạy ngay chu trình Tự động Rà soát Lỗi, Chữa lành & Quét hồi cứu 2021–2026:**
  ```bash
  bash deploy/ubuntu-docker/auto-heal-and-audit.sh --with-backfill
  ```
- **Các lệnh điều khiển chuyên biệt qua `run-scraper.sh`:**
  ```bash
  bash deploy/ubuntu-docker/run-scraper.sh audit-portals   # Rà soát 6 cổng BĐS & xuất kế hoạch 2021-2026
  bash deploy/ubuntu-docker/run-scraper.sh backfill        # Quét tin lịch sử từ năm 2021 đến nay
  bash deploy/ubuntu-docker/run-scraper.sh auto-heal       # Tự động rà soát lỗi & quét bù DLQ
  bash deploy/ubuntu-docker/run-scraper.sh daemon          # Chạy ngầm 24/7 theo chu kỳ 4 giờ (GMT+07)
  bash deploy/ubuntu-docker/run-scraper.sh train-ml        # Huấn luyện lại Hedonic OLS + LightGBM Quantile + SHAP
  ```

---

## 4. Kế Hoạch Tiến Hành Chi Tiết 4 Giai Đoạn (Chiến Dịch 100.000 Bản Ghi BĐS 2021–2026)

| Giai đoạn | Thời lượng | Mục tiêu Bản ghi | Nội dung Thực hiện Trọng tâm | Lệnh Thực thi Chuẩn |
| :--- | :---: | :---: | :--- | :--- |
| **Giai đoạn 1:** Khởi tạo Hạ tầng & Kiểm toán Cổng BĐS | **Ngày 1 – Ngày 3** | `5.000` Master | • Dựng 5 container Docker trên Ubuntu (`postgres`, `redis`, `api`, `webapp:3359`, `scraper-etl`) từ GHCR (`ghcr.io/kinhteso/aptlabbatdongsan:latest` & `ghcr.io/kinhteso/aptlabbatdongsan-webapp:latest`).<br>• Kiểm toán kết nối 4 cổng chủ lực (`Batdongsan`, `Chotot`, `Alonhadat`, `Mogi`) và khởi tạo bảng `gold_ward_valuation_index`. | `bash deploy/ubuntu-docker/setup-ubuntu.sh --use-ghcr`<br>`bash deploy/ubuntu-docker/run-scraper.sh audit-portals` |
| **Giai đoạn 2:** Quét Hồi cứu Lịch sử Sâu 2021–2024 | **Ngày 4 – Ngày 12** | `52.000` Master | • Khai thác Wayback CDX API (`2021..2024`), Sitemap XML lịch sử và phân trang sâu (`trang 1..25`).<br>• Chuẩn hóa chuỗi thời gian Quý (`2021-Q1..2024-Q4`) và hệ số khử lạm phát CPI (`REAL_CPI_2026`). | `bash deploy/ubuntu-docker/run-scraper.sh backfill --from-year 2021 --max-pages 25` |
| **Giai đoạn 3:** Quét Phủ Rộng 34/63 Tỉnh Thành & 6 Phân khu (2025–2026) | **Ngày 13 – Ngày 24** | `43.000` Master | • Quét phủ toàn bộ **34 tỉnh/thành mới $\leftrightarrow$ 63 tỉnh/thành cũ**.<br>• Phân loại tự động 6 Phân khu Kinh tế (`KCN FDI`, `Làng nghề`, `Du lịch`, `CBD`, `CNC/TOD`, `Ven đô`) đến từng Phường/Xã. | `bash deploy/ubuntu-docker/run-scraper.sh once --max-pages 20` |
| **Giai đoạn 4:** Tự động Chữa lành Lỗi, Huấn luyện AVM & Vận hành 24/7 | **Ngày 25 – Ngày 30 & Liên tục** | Đạt mốc `100.000` Master | • Kích hoạt Cron `auto-heal-and-audit.sh` tự động quét bù 100% URL lỗi trong DLQ.<br>• Huấn luyện mô hình Hedonic OLS + Heckman 2-Step + LightGBM Quantile + Empirical Bayes Cấp Phường/Xã và phục vụ trên WebApp cổng `3359`. | `bash deploy/ubuntu-docker/auto-heal-and-audit.sh --install-cron`<br>`bash deploy/ubuntu-docker/run-scraper.sh train-ml` |
