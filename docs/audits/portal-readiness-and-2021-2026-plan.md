# Báo cáo Rà soát Cổng Tin đăng Bất động sản Việt Nam & Kế hoạch Quét Dữ liệu 2021–2026

- **Thời điểm kiểm toán (GMT+07):** `2026-11-02T10:17:34+07:00`
- **Tổng số cổng BĐS đã rà soát:** `6` cổng (4 cổng Tier-1 chủ lực chiếm **95.0%** thị phần tin đăng + 2 cổng Tier-2 mở rộng)
- **Khung thời gian thu thập:** `01/01/2021 – 02/11/2026` (6 năm liên tục, hỗ trợ khử lạm phát CPI và phân tích chu kỳ BĐS)
- **Độ phủ Không gian:** **34 Tỉnh/Thành mới** (Nghị quyết 202/2025/QH15) song hành **63 Tỉnh/Thành lịch sử**, bóc tách sâu tới **Phường/Xã** và **6 Phân khu Kinh tế Đặc thù** (`KCN`, `Làng nghề`, `Du lịch`, `CBD`, `CNC/TOD`, `Ven đô`).

## 1. Bảng Rà soát Kỹ thuật Các Trang Web Đăng tin Bất động sản

| Cổng BĐS | Phân hạng | Thị phần | Sản lượng mới/ngày | Kiến trúc Kỹ thuật & Chống Bot | Độ phủ Lịch sử 2021–2026 | Trạng thái |
| :--- | :---: | :---: | :---: | :--- | :--- | :---: |
| **Batdongsan.com.vn (PropertyGuru Vietnam)** (`https://batdongsan.com.vn`) | `TIER_1_CORE` | 44.5% | ~4,500 tin | SSR HTML + Cloudflare Turnstile + Schema.org RealEstateListing/Offer JSON-LD (playwright_stealth (Headless Chromium + Stealth Context + 2.5s-4.5s jitter)) | VERY_HIGH (2021-2026) | `BLOCKED_CLOUDFLARE_WAF` (15.0%) |
| **Nha.Chotot.com (Chợ Tốt Nhà - Carousell Group)** (`https://nha.chotot.com`) | `TIER_1_CORE` | 24.0% | ~3,200 tin | Next.js SSR (__NEXT_DATA__ JSON state) + REST API gateway.chotot.com/v1/public/ad-listing (playwright_stealth kết hợp bóc tách trực tiếp __NEXT_DATA__) | HIGH (2021-2026) | `INEFFECTIVE_SELECTOR_DRIFT` (20.0%) |
| **Alonhadat.com.vn (Alo Nhà Đất - Chuyên Thổ cư & Đất nền 63 Tỉnh)** (`https://alonhadat.com.vn`) | `TIER_1_CORE` | 16.0% | ~2,100 tin | Server-Side Rendered HTML thuần (Classic ASP.NET/HTML DOM) (httpx_or_playwright (Tốc độ quét rất nhanh, tiết kiệm RAM)) | HIGH (Lưu trữ HTML tĩnh cực kỳ ổn định từ 2021) | `HEALTHY` (85.0%) |
| **Mogi.vn (Mogi Real Estate - Nhà phố, Căn hộ & Dòng tiền)** (`https://mogi.vn`) | `TIER_1_CORE` | 10.5% | ~1,400 tin | SSR HTML + Schema.org Product/SingleFamilyResidence JSON-LD (playwright_or_api) | MEDIUM_HIGH (2021-2026) | `HEALTHY` (85.0%) |
| **Muaban.net (Bất động sản Mua Bán - Dữ liệu Lịch sử Lâu đời)** (`https://muaban.net/bat-dong-san`) | `TIER_2_EXPANSION` | 2.5% | ~450 tin | Next.js SSR (__NEXT_DATA__) (httpx_or_playwright) | VERY_HIGH (Kho dữ liệu nhà đất chính chủ từ trước 2021) | `STANDBY_READY` (90.0%) |
| **Nhadat.Cafeland.vn (Chuyên Đất nền Dự án, KCN & Quy hoạch)** (`https://nhadat.cafeland.vn`) | `TIER_2_EXPANSION` | 1.5% | ~300 tin | SSR HTML (httpx_or_playwright) | HIGH | `STANDBY_READY` (89.0%) |

## 2. Lộ trình Triển khai 4 Giai đoạn (Chiến dịch 100.000 Bản ghi 2021–2026)

### Giai đoạn 1 (Ngày 1 - Ngày 3): Khởi tạo Hạ tầng Docker Ubuntu, PostgreSQL 16 & Kiểm toán Kết nối 4 Cổng BĐS Chủ lực (Chỉ tiêu: 5,000 bản ghi)
- **Lệnh thực thi:** `bash deploy/ubuntu-docker/deploy-ubuntu.sh && bash deploy/ubuntu-docker/run-scraper-task.sh audit-portals`
  - Khởi chạy 4 container Docker (`postgres`, `redis`, `scraper_etl`, `webapp` trên cổng 3358) với múi giờ chuẩn Asia/Ho_Chi_Minh (GMT+07).
  - Chạy kiểm toán thực nghiệm 4 cổng Tier-1 (`Batdongsan.com.vn`, `Nha.Chotot.com`, `Alonhadat.com.vn`, `Mogi.vn`), xác nhận bóc tách chuẩn JSON-LD, `__NEXT_DATA__` và DOM CSS Selectors.
  - Kích hoạt bảng `gold_ward_valuation_index` và kiểm chứng bộ phân giải địa chỉ kép 34 Tỉnh/Thành mới <-> 63 Tỉnh/Thành cũ.

### Giai đoạn 2 (Ngày 4 - Ngày 12): Chiến dịch Quét Hồi cứu Lịch sử 2021 - 2024 (Wayback CDX + Sitemap Archive + Deep Pagination) (Chỉ tiêu: 52,000 bản ghi)
- **Lệnh thực thi:** `bash deploy/ubuntu-docker/run-scraper-task.sh backfill --from-year 2021 --max-pages 25`
  - Truy vấn Wayback Machine CDX API (`20210101..20241231`) kết hợp Sitemap XML lịch sử và phân trang sâu (`trang-1..25`) trên Alonhadat, Batdongsan, Chotot, Mogi.
  - Bóc tách ngày đăng gốc (`published_date`), chuẩn hóa chuỗi thời gian theo Quý (`2021-Q1` .. `2024-Q4`) và khử lạm phát CPI về mặt bằng giá thực 2026 (`REAL_CPI_2026`).
  - Khử trùng lặp đa nguồn (`dedup_signature`) đồng thời lưu vết toàn bộ URL gốc trong `job_source_links`.

### Giai đoạn 3 (Ngày 13 - Ngày 24): Quét Phủ Rộng Toàn Quốc 34/63 Tỉnh Thành & 6 Phân khu Kinh tế Giai đoạn 2025 - 2026 (Chỉ tiêu: 43,000 bản ghi)
- **Lệnh thực thi:** `bash deploy/ubuntu-docker/run-scraper-task.sh once --max-pages 20`
  - Quét toàn bộ 34 Tỉnh/Thành mới (6 TP trực thuộc TW + 28 Tỉnh) ánh xạ song hành 63 Tỉnh/Thành lịch sử theo `all_34_provinces_crosswalk`.
  - Gắn nhãn 6 Phân khu Kinh tế Đặc thù cho từng Phường/Xã: Lõi CBD (`1.35x`), Khu công nghiệp FDI (`1.12x`), Khu làng nghề truyền thống (`1.18x`), Khu du lịch biển (`1.22x`), Khu CNC/Metro TOD (`1.20x`) và Khu ven đô (`0.90x`).
  - Cập nhật vòng đời thanh khoản tin đăng (`vacancy_duration_days` / Time-on-Market) khi gặp lại URL đã biết.

### Giai đoạn 4 (Ngày 25 - Ngày 30 & Vận hành Tự động 24/7): Tự động Rà soát Lỗi, Quét Bù DLQ (`auto-heal`), Huấn luyện AVM Cấp Phường/Xã & Daemon 4h/Chu kỳ (Chỉ tiêu: 100,000 bản ghi)
- **Lệnh thực thi:** `bash deploy/ubuntu-docker/auto-heal-and-audit.sh`
  - Script `auto-heal-and-audit.sh` tự động kiểm tra nhật ký lỗi `logs/scraper_errors.jsonl`, chụp HTML hiện trường khi lệch selector hoặc gặp Cloudflare 403, tự động điều chỉnh cấu hình và chạy `--mode retry-errors` để quét bù 100% URL trong Hàng đợi DLQ.
  - Tự động huấn luyện lại mô hình Kinh tế lượng Hedonic OLS (HC3) + Heckman 2-Step + LightGBM Quantile (P10..P90) + Empirical Bayes Cấp Phường/Xã và xuất `data/gold/model_artifacts.json`.
  - Duy trì tiến trình Daemon 24/7 (4 giờ/chu kỳ) và cơ chế lấy mẫu phân tầng đại diện cho dữ liệu > 12 tháng (`--mode prune-12m`).

