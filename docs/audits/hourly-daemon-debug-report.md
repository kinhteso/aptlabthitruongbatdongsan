# Báo cáo Chẩn đoán & Debug 1 Giờ Tiến trình Quét Ngầm (Daemon Telemetry)

```text
=== BÁO CÁO DEBUG 1 GIỜ TIẾN TRÌNH DAEMON QUÉT DỮ LIỆU (GỬI AI HIỆU CHỈNH) ===
- Thời điểm trích xuất (GMT+07): 2026-11-02T17:06:10+07:00
- Trạng thái Daemon: IDLE_COMPLETED | PID: 22212 | Chu kỳ #1
- Cấu hình hiện tại: schedule_mode=interval, interval_hours=4, max_pages=20, max_jobs_per_site=0
- Các cổng kém hiệu quả phát hiện được: ['topcv', 'itviec']

--- CHI TIẾT HIỆU SUẤT TỪNG CỔNG TRONG 1 GIỜ QUA ---
* [TOPCV] Status=BLOCKED_CLOUDFLARE_WAF | Hiệu suất=15.0% | Engine=playwright_stealth | SearchOK=0/7 | Links=0 | JDsParsed=0 | Touched=0 | DLQ_Pending=0 | Errors={'CLOUDFLARE_WAF_BLOCK': 7}
  - URL lỗi mẫu: ['https://batdongsan.com.vn/nha-dat-ban-ha-noi/p1?k=B%C3%A1n+c%C4%83n+h%E1%BB%99+chung+c%C6%B0', 'https://batdongsan.com.vn/nha-dat-ban-ha-noi/p1?k=Chung+c%C6%B0+th%C6%B0%C6%A1ng+m%E1%BA%A1i+2PN+3PN']
  - Chẩn đoán DOM thực tế: Title='', Classes=[], Hrefs=[]
  - Khuyến nghị: Cổng topcv đang bị chặn Cloudflare/WAF (403/503). Khuyến nghị: Chuyển engine sang 'playwright_stealth', tăng min_delay_sec lên 4.5s và giảm concurrency_per_site xuống 1-2.
* [ITVIEC] Status=INEFFECTIVE_SELECTOR_DRIFT | Hiệu suất=20.0% | Engine=httpx_or_playwright | SearchOK=7/7 | Links=0 | JDsParsed=0 | Touched=0 | DLQ_Pending=0 | Errors={'SELECTOR_DRIFT_ZERO_LINKS': 7}
  - URL lỗi mẫu: ['https://nha.chotot.com/mua-ban-bat-dong-san-ha-noi?q=B%C3%A1n+c%C4%83n+h%E1%BB%99+chung+c%C6%B0&region_v2=12000&page=1', 'https://nha.chotot.com/mua-ban-bat-dong-san-ha-noi?q=Chung+c%C6%B0+th%C6%B0%C6%A1ng+m%E1%BA%A1i+2PN+3PN&region_v2=12000&page=1']
  - Chẩn đoán DOM thực tế: Title='', Classes=[], Hrefs=[]
  - Khuyến nghị: Cổng itviec trả về HTTP 200 nhưng trích xuất được 0 link (Lệch CSS Selector). Gửi mục dom_diagnostic_hints của itviec cho AI để cập nhật selectors.job_cards trong configs/scraper_settings.yaml.
* [CAREERVIET] Status=HEALTHY | Hiệu suất=85.0% | Engine=httpx_or_playwright | SearchOK=0/0 | Links=0 | JDsParsed=0 | Touched=0 | DLQ_Pending=0 | Errors={}
  - Khuyến nghị: Hoạt động ổn định.
* [VIETNAMWORKS] Status=HEALTHY | Hiệu suất=85.0% | Engine=httpx_or_playwright | SearchOK=0/0 | Links=0 | JDsParsed=0 | Touched=0 | DLQ_Pending=0 | Errors={}
  - Khuyến nghị: Hoạt động ổn định.
```
