# Báo cáo Chẩn đoán Lỗi Quét Dữ liệu (Scraper Error Logs), Hàng đợi DLQ & Hướng dẫn Khắc phục

- **Thời điểm xuất báo cáo:** `2026-11-02T10:17:35.135188`
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
| `itviec` | `SEARCH_LISTING` | **`SELECTOR_DRIFT_ZERO_LINKS`** | `200` | `https://itviec.com/it-jobs/chung-cu-gan-metro-tod/ha-noi?page=1` | `RESOLVED` | `logs\html_snapshots\itviec_selector_drift_zero_links_948723b637.html` | Cổng tuyển dụng trả về HTTP 200 nhưng 0 link (nghi ngờ đổi cấu trúc CSS/DOM). Mở file HTML chụp hiện trường trong `logs/html_snapshots/`, đối chiếu thẻ bài đăng mới và cập nhật `selectors.job_cards` / `selectors.link` trong `configs/scraper_settings.yaml`. |
| `itviec` | `SEARCH_LISTING` | **`SELECTOR_DRIFT_ZERO_LINKS`** | `200` | `https://itviec.com/it-jobs/can-ho-duplex-penthouse/ha-noi?page=1` | `RESOLVED` | `logs\html_snapshots\itviec_selector_drift_zero_links_53df048444.html` | Cổng tuyển dụng trả về HTTP 200 nhưng 0 link (nghi ngờ đổi cấu trúc CSS/DOM). Mở file HTML chụp hiện trường trong `logs/html_snapshots/`, đối chiếu thẻ bài đăng mới và cập nhật `selectors.job_cards` / `selectors.link` trong `configs/scraper_settings.yaml`. |
| `topcv` | `SEARCH_LISTING` | **`CLOUDFLARE_WAF_BLOCK`** | `403` | `https://www.topcv.vn/tim-viec-lam-chung-cu-gan-metro-tod?l=1&page=1` | `RESOLVED` | `logs\html_snapshots\topcv_cloudflare_waf_block_fe5b01371e.html` | 1) Đảm bảo `engine: playwright_stealth` đang bật trong `configs/scraper_settings.yaml`; 2) Tăng `min_delay_sec` lên 3.5s và `max_delay_sec` lên 7.0s; 3) Chạy lệnh quét bù `python -m src.scrapers.scheduler --mode retry-errors`. |
| `topcv` | `SEARCH_LISTING` | **`CLOUDFLARE_WAF_BLOCK`** | `403` | `https://www.topcv.vn/tim-viec-lam-can-ho-duplex-penthouse?l=1&page=1` | `RESOLVED` | `logs\html_snapshots\topcv_cloudflare_waf_block_88c0511711.html` | 1) Đảm bảo `engine: playwright_stealth` đang bật trong `configs/scraper_settings.yaml`; 2) Tăng `min_delay_sec` lên 3.5s và `max_delay_sec` lên 7.0s; 3) Chạy lệnh quét bù `python -m src.scrapers.scheduler --mode retry-errors`. |
| `itviec` | `SEARCH_LISTING` | **`SELECTOR_DRIFT_ZERO_LINKS`** | `200` | `https://itviec.com/it-jobs/nha-o-xa-hoi/ha-noi?page=1` | `RESOLVED` | `logs\html_snapshots\itviec_selector_drift_zero_links_1455b5801e.html` | Cổng tuyển dụng trả về HTTP 200 nhưng 0 link (nghi ngờ đổi cấu trúc CSS/DOM). Mở file HTML chụp hiện trường trong `logs/html_snapshots/`, đối chiếu thẻ bài đăng mới và cập nhật `selectors.job_cards` / `selectors.link` trong `configs/scraper_settings.yaml`. |
| `topcv` | `SEARCH_LISTING` | **`CLOUDFLARE_WAF_BLOCK`** | `403` | `https://www.topcv.vn/tim-viec-lam-nha-o-xa-hoi?l=1&page=1` | `RESOLVED` | `logs\html_snapshots\topcv_cloudflare_waf_block_361b5e6889.html` | 1) Đảm bảo `engine: playwright_stealth` đang bật trong `configs/scraper_settings.yaml`; 2) Tăng `min_delay_sec` lên 3.5s và `max_delay_sec` lên 7.0s; 3) Chạy lệnh quét bù `python -m src.scrapers.scheduler --mode retry-errors`. |
| `itviec` | `SEARCH_LISTING` | **`SELECTOR_DRIFT_ZERO_LINKS`** | `200` | `https://itviec.com/it-jobs/can-ho-studio-officetel/ha-noi?page=1` | `RESOLVED` | `logs\html_snapshots\itviec_selector_drift_zero_links_c12206744d.html` | Cổng tuyển dụng trả về HTTP 200 nhưng 0 link (nghi ngờ đổi cấu trúc CSS/DOM). Mở file HTML chụp hiện trường trong `logs/html_snapshots/`, đối chiếu thẻ bài đăng mới và cập nhật `selectors.job_cards` / `selectors.link` trong `configs/scraper_settings.yaml`. |
| `topcv` | `SEARCH_LISTING` | **`CLOUDFLARE_WAF_BLOCK`** | `403` | `https://www.topcv.vn/tim-viec-lam-can-ho-studio-officetel?l=1&page=1` | `RESOLVED` | `logs\html_snapshots\topcv_cloudflare_waf_block_d15b558902.html` | 1) Đảm bảo `engine: playwright_stealth` đang bật trong `configs/scraper_settings.yaml`; 2) Tăng `min_delay_sec` lên 3.5s và `max_delay_sec` lên 7.0s; 3) Chạy lệnh quét bù `python -m src.scrapers.scheduler --mode retry-errors`. |
| `itviec` | `SEARCH_LISTING` | **`SELECTOR_DRIFT_ZERO_LINKS`** | `200` | `https://itviec.com/it-jobs/can-ho-cao-cap-vinhomes-masterise/ha-noi?page=1` | `RESOLVED` | `logs\html_snapshots\itviec_selector_drift_zero_links_7fa5422293.html` | Cổng tuyển dụng trả về HTTP 200 nhưng 0 link (nghi ngờ đổi cấu trúc CSS/DOM). Mở file HTML chụp hiện trường trong `logs/html_snapshots/`, đối chiếu thẻ bài đăng mới và cập nhật `selectors.job_cards` / `selectors.link` trong `configs/scraper_settings.yaml`. |
| `topcv` | `SEARCH_LISTING` | **`CLOUDFLARE_WAF_BLOCK`** | `403` | `https://www.topcv.vn/tim-viec-lam-can-ho-cao-cap-vinhomes-masterise?l=1&page=1` | `RESOLVED` | `logs\html_snapshots\topcv_cloudflare_waf_block_45319c0e2a.html` | 1) Đảm bảo `engine: playwright_stealth` đang bật trong `configs/scraper_settings.yaml`; 2) Tăng `min_delay_sec` lên 3.5s và `max_delay_sec` lên 7.0s; 3) Chạy lệnh quét bù `python -m src.scrapers.scheduler --mode retry-errors`. |
| `itviec` | `SEARCH_LISTING` | **`SELECTOR_DRIFT_ZERO_LINKS`** | `200` | `https://itviec.com/it-jobs/chung-cu-thuong-mai-2pn-3pn/ha-noi?page=1` | `RESOLVED` | `logs\html_snapshots\itviec_selector_drift_zero_links_586dc6d660.html` | Cổng tuyển dụng trả về HTTP 200 nhưng 0 link (nghi ngờ đổi cấu trúc CSS/DOM). Mở file HTML chụp hiện trường trong `logs/html_snapshots/`, đối chiếu thẻ bài đăng mới và cập nhật `selectors.job_cards` / `selectors.link` trong `configs/scraper_settings.yaml`. |
| `topcv` | `SEARCH_LISTING` | **`CLOUDFLARE_WAF_BLOCK`** | `403` | `https://www.topcv.vn/tim-viec-lam-chung-cu-thuong-mai-2pn-3pn?l=1&page=1` | `RESOLVED` | `logs\html_snapshots\topcv_cloudflare_waf_block_e331d69b70.html` | 1) Đảm bảo `engine: playwright_stealth` đang bật trong `configs/scraper_settings.yaml`; 2) Tăng `min_delay_sec` lên 3.5s và `max_delay_sec` lên 7.0s; 3) Chạy lệnh quét bù `python -m src.scrapers.scheduler --mode retry-errors`. |
| `itviec` | `SEARCH_LISTING` | **`SELECTOR_DRIFT_ZERO_LINKS`** | `200` | `https://itviec.com/it-jobs/ban-can-ho-chung-cu/ha-noi?page=1` | `RESOLVED` | `logs\html_snapshots\itviec_selector_drift_zero_links_f219b81147.html` | Cổng tuyển dụng trả về HTTP 200 nhưng 0 link (nghi ngờ đổi cấu trúc CSS/DOM). Mở file HTML chụp hiện trường trong `logs/html_snapshots/`, đối chiếu thẻ bài đăng mới và cập nhật `selectors.job_cards` / `selectors.link` trong `configs/scraper_settings.yaml`. |
| `topcv` | `SEARCH_LISTING` | **`CLOUDFLARE_WAF_BLOCK`** | `403` | `https://www.topcv.vn/tim-viec-lam-ban-can-ho-chung-cu?l=1&page=1` | `RESOLVED` | `logs\html_snapshots\topcv_cloudflare_waf_block_73e76d858d.html` | 1) Đảm bảo `engine: playwright_stealth` đang bật trong `configs/scraper_settings.yaml`; 2) Tăng `min_delay_sec` lên 3.5s và `max_delay_sec` lên 7.0s; 3) Chạy lệnh quét bù `python -m src.scrapers.scheduler --mode retry-errors`. |

---

## 3. Các Lệnh Khắc phục & Quét Bù Tự động (Self-Healing Commands)

```bash
# 1. Chạy quét bù toàn bộ các URL đang nằm trong Hàng đợi Lỗi (PENDING_RETRY):
python -m src.scrapers.scheduler --mode retry-errors

# 2. Trên Ubuntu Docker (gọi trực tiếp vào container GHCR):
docker exec -it skillvalue_scraper_etl python -m src.scrapers.scheduler --mode retry-errors
```
