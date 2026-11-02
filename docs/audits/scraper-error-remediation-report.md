# Báo cáo Chẩn đoán Lỗi Quét Dữ liệu (Scraper Error Logs), Hàng đợi DLQ & Hướng dẫn Khắc phục

- **Thời điểm xuất báo cáo:** `2026-11-02T15:54:23.457216`
- **File nhật ký sự kiện trên ổ cứng:** `logs/scraper_errors.jsonl`
- **Hàng đợi Quét bù (Dead-Letter Queue):** `data/silver/scraper_dlq_retry.json`
- **Tổng số sự cố ghi nhận:** **14** | Đang chờ quét bù (`PENDING_RETRY`): **0** | Đã khắc phục (`RESOLVED`): **14**

---

## 1. Thống kê Lỗi theo Cổng Tuyển dụng & Nhóm Nguyên nhân

| Phân nhóm | Số lượng sự cố | Tỷ trọng |
| :--- | :---: | :---: |
| Cổng `itviec` | 7 | 50.0% |
| Cổng `topcv` | 7 | 50.0% |
| Nhóm lỗi `CLOUDFLARE_WAF_BLOCK` | 7 | 50.0% |
| Nhóm lỗi `SELECTOR_DRIFT_ZERO_LINKS` | 7 | 50.0% |

---

## 2. Chi tiết Các URL Lỗi & Hướng dẫn Khắc phục Cụ thể

| Cổng | Giai đoạn | Mã Lỗi (`error_category`) | HTTP | URL Mục tiêu | Trạng thái DLQ | Ảnh chụp HTML | Hướng dẫn Khắc phục |
| :---: | :---: | :--- | :---: | :--- | :---: | :--- | :--- |
| `topcv` | `SEARCH_LISTING` | **`CLOUDFLARE_WAF_BLOCK`** | `403` | `https://batdongsan.com.vn/nha-dat-ban-ha-noi/p1?k=Chung+c%C6%B0+g%E1%BA%A7n+Metro+TOD` | `RESOLVED` | `logs\html_snapshots\topcv_cloudflare_waf_block_3bc875b60b.html` | 1) Đảm bảo `engine: playwright_stealth` đang bật trong `configs/scraper_settings.yaml`; 2) Tăng `min_delay_sec` lên 3.5s và `max_delay_sec` lên 7.0s; 3) Chạy lệnh quét bù `python -m src.scrapers.scheduler --mode retry-errors`. |
| `itviec` | `SEARCH_LISTING` | **`SELECTOR_DRIFT_ZERO_LINKS`** | `200` | `https://nha.chotot.com/mua-ban-bat-dong-san-ha-noi?q=Chung+c%C6%B0+g%E1%BA%A7n+Metro+TOD&region_v2=12000&page=1` | `RESOLVED` | `logs\html_snapshots\itviec_selector_drift_zero_links_f1347e2403.html` | Cổng tuyển dụng trả về HTTP 200 nhưng 0 link (nghi ngờ đổi cấu trúc CSS/DOM). Mở file HTML chụp hiện trường trong `logs/html_snapshots/`, đối chiếu thẻ bài đăng mới và cập nhật `selectors.job_cards` / `selectors.link` trong `configs/scraper_settings.yaml`. |
| `topcv` | `SEARCH_LISTING` | **`CLOUDFLARE_WAF_BLOCK`** | `403` | `https://batdongsan.com.vn/nha-dat-ban-ha-noi/p1?k=C%C4%83n+h%E1%BB%99+Duplex+Penthouse` | `RESOLVED` | `logs\html_snapshots\topcv_cloudflare_waf_block_9d388624fe.html` | 1) Đảm bảo `engine: playwright_stealth` đang bật trong `configs/scraper_settings.yaml`; 2) Tăng `min_delay_sec` lên 3.5s và `max_delay_sec` lên 7.0s; 3) Chạy lệnh quét bù `python -m src.scrapers.scheduler --mode retry-errors`. |
| `itviec` | `SEARCH_LISTING` | **`SELECTOR_DRIFT_ZERO_LINKS`** | `200` | `https://nha.chotot.com/mua-ban-bat-dong-san-ha-noi?q=C%C4%83n+h%E1%BB%99+Duplex+Penthouse&region_v2=12000&page=1` | `RESOLVED` | `logs\html_snapshots\itviec_selector_drift_zero_links_d605ba30ef.html` | Cổng tuyển dụng trả về HTTP 200 nhưng 0 link (nghi ngờ đổi cấu trúc CSS/DOM). Mở file HTML chụp hiện trường trong `logs/html_snapshots/`, đối chiếu thẻ bài đăng mới và cập nhật `selectors.job_cards` / `selectors.link` trong `configs/scraper_settings.yaml`. |
| `topcv` | `SEARCH_LISTING` | **`CLOUDFLARE_WAF_BLOCK`** | `403` | `https://batdongsan.com.vn/nha-dat-ban-ha-noi/p1?k=Nh%C3%A0+%E1%BB%9F+x%C3%A3+h%E1%BB%99i` | `RESOLVED` | `logs\html_snapshots\topcv_cloudflare_waf_block_3d8bcbe07c.html` | 1) Đảm bảo `engine: playwright_stealth` đang bật trong `configs/scraper_settings.yaml`; 2) Tăng `min_delay_sec` lên 3.5s và `max_delay_sec` lên 7.0s; 3) Chạy lệnh quét bù `python -m src.scrapers.scheduler --mode retry-errors`. |
| `itviec` | `SEARCH_LISTING` | **`SELECTOR_DRIFT_ZERO_LINKS`** | `200` | `https://nha.chotot.com/mua-ban-bat-dong-san-ha-noi?q=Nh%C3%A0+%E1%BB%9F+x%C3%A3+h%E1%BB%99i&region_v2=12000&page=1` | `RESOLVED` | `logs\html_snapshots\itviec_selector_drift_zero_links_6dab27c001.html` | Cổng tuyển dụng trả về HTTP 200 nhưng 0 link (nghi ngờ đổi cấu trúc CSS/DOM). Mở file HTML chụp hiện trường trong `logs/html_snapshots/`, đối chiếu thẻ bài đăng mới và cập nhật `selectors.job_cards` / `selectors.link` trong `configs/scraper_settings.yaml`. |
| `topcv` | `SEARCH_LISTING` | **`CLOUDFLARE_WAF_BLOCK`** | `403` | `https://batdongsan.com.vn/nha-dat-ban-ha-noi/p1?k=C%C4%83n+h%E1%BB%99+Studio+Officetel` | `RESOLVED` | `logs\html_snapshots\topcv_cloudflare_waf_block_cc5442efa4.html` | 1) Đảm bảo `engine: playwright_stealth` đang bật trong `configs/scraper_settings.yaml`; 2) Tăng `min_delay_sec` lên 3.5s và `max_delay_sec` lên 7.0s; 3) Chạy lệnh quét bù `python -m src.scrapers.scheduler --mode retry-errors`. |
| `itviec` | `SEARCH_LISTING` | **`SELECTOR_DRIFT_ZERO_LINKS`** | `200` | `https://nha.chotot.com/mua-ban-bat-dong-san-ha-noi?q=C%C4%83n+h%E1%BB%99+Studio+Officetel&region_v2=12000&page=1` | `RESOLVED` | `logs\html_snapshots\itviec_selector_drift_zero_links_9808867854.html` | Cổng tuyển dụng trả về HTTP 200 nhưng 0 link (nghi ngờ đổi cấu trúc CSS/DOM). Mở file HTML chụp hiện trường trong `logs/html_snapshots/`, đối chiếu thẻ bài đăng mới và cập nhật `selectors.job_cards` / `selectors.link` trong `configs/scraper_settings.yaml`. |
| `topcv` | `SEARCH_LISTING` | **`CLOUDFLARE_WAF_BLOCK`** | `403` | `https://batdongsan.com.vn/nha-dat-ban-ha-noi/p1?k=C%C4%83n+h%E1%BB%99+cao+c%E1%BA%A5p+Vinhomes+Masterise` | `RESOLVED` | `logs\html_snapshots\topcv_cloudflare_waf_block_cbf300461b.html` | 1) Đảm bảo `engine: playwright_stealth` đang bật trong `configs/scraper_settings.yaml`; 2) Tăng `min_delay_sec` lên 3.5s và `max_delay_sec` lên 7.0s; 3) Chạy lệnh quét bù `python -m src.scrapers.scheduler --mode retry-errors`. |
| `itviec` | `SEARCH_LISTING` | **`SELECTOR_DRIFT_ZERO_LINKS`** | `200` | `https://nha.chotot.com/mua-ban-bat-dong-san-ha-noi?q=C%C4%83n+h%E1%BB%99+cao+c%E1%BA%A5p+Vinhomes+Masterise&region_v2=12000&page=1` | `RESOLVED` | `logs\html_snapshots\itviec_selector_drift_zero_links_e542c20fff.html` | Cổng tuyển dụng trả về HTTP 200 nhưng 0 link (nghi ngờ đổi cấu trúc CSS/DOM). Mở file HTML chụp hiện trường trong `logs/html_snapshots/`, đối chiếu thẻ bài đăng mới và cập nhật `selectors.job_cards` / `selectors.link` trong `configs/scraper_settings.yaml`. |
| `topcv` | `SEARCH_LISTING` | **`CLOUDFLARE_WAF_BLOCK`** | `403` | `https://batdongsan.com.vn/nha-dat-ban-ha-noi/p1?k=Chung+c%C6%B0+th%C6%B0%C6%A1ng+m%E1%BA%A1i+2PN+3PN` | `RESOLVED` | `logs\html_snapshots\topcv_cloudflare_waf_block_f5c8c6990c.html` | 1) Đảm bảo `engine: playwright_stealth` đang bật trong `configs/scraper_settings.yaml`; 2) Tăng `min_delay_sec` lên 3.5s và `max_delay_sec` lên 7.0s; 3) Chạy lệnh quét bù `python -m src.scrapers.scheduler --mode retry-errors`. |
| `itviec` | `SEARCH_LISTING` | **`SELECTOR_DRIFT_ZERO_LINKS`** | `200` | `https://nha.chotot.com/mua-ban-bat-dong-san-ha-noi?q=Chung+c%C6%B0+th%C6%B0%C6%A1ng+m%E1%BA%A1i+2PN+3PN&region_v2=12000&page=1` | `RESOLVED` | `logs\html_snapshots\itviec_selector_drift_zero_links_b63df18a8f.html` | Cổng tuyển dụng trả về HTTP 200 nhưng 0 link (nghi ngờ đổi cấu trúc CSS/DOM). Mở file HTML chụp hiện trường trong `logs/html_snapshots/`, đối chiếu thẻ bài đăng mới và cập nhật `selectors.job_cards` / `selectors.link` trong `configs/scraper_settings.yaml`. |
| `topcv` | `SEARCH_LISTING` | **`CLOUDFLARE_WAF_BLOCK`** | `403` | `https://batdongsan.com.vn/nha-dat-ban-ha-noi/p1?k=B%C3%A1n+c%C4%83n+h%E1%BB%99+chung+c%C6%B0` | `RESOLVED` | `logs\html_snapshots\topcv_cloudflare_waf_block_147029b462.html` | 1) Đảm bảo `engine: playwright_stealth` đang bật trong `configs/scraper_settings.yaml`; 2) Tăng `min_delay_sec` lên 3.5s và `max_delay_sec` lên 7.0s; 3) Chạy lệnh quét bù `python -m src.scrapers.scheduler --mode retry-errors`. |
| `itviec` | `SEARCH_LISTING` | **`SELECTOR_DRIFT_ZERO_LINKS`** | `200` | `https://nha.chotot.com/mua-ban-bat-dong-san-ha-noi?q=B%C3%A1n+c%C4%83n+h%E1%BB%99+chung+c%C6%B0&region_v2=12000&page=1` | `RESOLVED` | `logs\html_snapshots\itviec_selector_drift_zero_links_5a92f93fab.html` | Cổng tuyển dụng trả về HTTP 200 nhưng 0 link (nghi ngờ đổi cấu trúc CSS/DOM). Mở file HTML chụp hiện trường trong `logs/html_snapshots/`, đối chiếu thẻ bài đăng mới và cập nhật `selectors.job_cards` / `selectors.link` trong `configs/scraper_settings.yaml`. |

---

## 3. Các Lệnh Khắc phục & Quét Bù Tự động (Self-Healing Commands)

```bash
# 1. Chạy quét bù toàn bộ các URL đang nằm trong Hàng đợi Lỗi (PENDING_RETRY):
python -m src.scrapers.scheduler --mode retry-errors

# 2. Trên Ubuntu Docker (gọi trực tiếp vào container GHCR):
docker exec -it skillvalue_scraper_etl python -m src.scrapers.scheduler --mode retry-errors
```
