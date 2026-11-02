# 04. Thiết kế Kiến trúc Ứng dụng Web PropValue.AI (Next.js 15 RWD + PWA Port 3359), Phân quyền 4 Tầng RBAC, Trạm AI MCP & Hạ tầng Docker Ubuntu / GHCR

> **Tài liệu thuộc Dự án:** Ứng dụng Kinh tế lượng Không gian, Lý thuyết Hedonic và Học máy Giải thích được (XAI/AVM) trong Định giá Bất động sản Đa phân khúc đến Cấp Phường/Xã từ Dữ liệu Tin đăng Trực tuyến tại Việt Nam (*PropValue.AI*)  
> **Phiên bản:** 2.1  
> **Cập nhật lần cuối:** 02/11/2026  

---

## 1. Tổng quan Kiến trúc Hệ thống *PropValue.AI* (Kế thừa & Đồng bộ từ `@LabThitruonglaodongso`)

Hệ thống **PropValue.AI** được thiết kế đồng bộ 100% về mặt kiến trúc công nghệ và cơ chế xác thực với `@LabThitruonglaodongso`, bao gồm 5 Container hoạt động thống nhất trên Docker Ubuntu hoặc Local và đóng gói tự động trên **GitHub Container Registry (GHCR)**:
1. **`postgres` (`postgres:16-alpine`):** Lưu trữ 12 bảng theo kiến trúc **Medallion 3 Tầng (Bronze – Silver – Gold)**, gắn trực tiếp ra ổ cứng máy chủ (`./data/postgres`).
2. **`redis` (`redis:7-alpine`):** Quản lý bộ nhớ đệm URL Cooldown 24h và cache kết quả định giá.
3. **`api` (`ghcr.io/kinhteso/aptlabthitruongbatdongsan:latest` — FastAPI + Python 3.11 + MCP Server — Cổng `8000`):** Phục vụ RESTful API định giá Hedonic/Quantile ML ($P_{10}..P_{90}$), giải thích TreeSHAP, định giá đến từng Phường/Xã, báo cáo liên năm `2021–2026`, đồng bộ Google OAuth 2.0 RBAC và máy chủ giao thức AI **Model Context Protocol (MCP)**.
4. **`webapp` (`ghcr.io/kinhteso/aptlabthitruongbatdongsan-webapp:latest` — Next.js 15 App Router + RWD + PWA — Cổng mặc định `3359`):** Giao diện Web đáp ứng mọi màn hình (Điện thoại, Máy tính bảng, Desktop) và cài đặt được như ứng dụng bản địa (PWA).
5. **`scraper-etl` (`ghcr.io/kinhteso/aptlabthitruongbatdongsan:latest` — Async Playwright Stealth + HTTPX Hybrid Worker):** Chạy ngầm theo chu kỳ 4 giờ (`daemon`), quét dữ liệu từ 4 cổng BĐS lớn (`Batdongsan.com.vn`, `Nha.Chotot.com`, `Alonhadat.com.vn`, `Mogi.vn`), tự động chụp HTML hiện trường khi gặp lỗi vào `logs/html_snapshots/`, đẩy vào hàng đợi quét bù `DLQ` và tự động huấn luyện lại mô hình khi có dữ liệu mới.

---

## 2. Thiết kế 8 Phân hệ Chức năng trên WebApp (Phân tách Trang ngoài `/` và Trang trong `/workspace`)

### 2.1. Trang Ngoài Công khai (`/` — `webapp/src/app/page.tsx`)
- **Mục 1: Công cụ Định giá Bất động sản Tự động (AVM $P_{10}-P_{90}$), Định giá Cấp Phường/Xã & Giải thích SHAP:**
  - Mở công khai cho người mua nhà, nhà đầu tư, sinh viên và chuyên viên thẩm định giá trải nghiệm trực tiếp.
  - Cho phép chọn: **Phân khúc BĐS (`RE-01..RE-04`)**, **Tầng giá trị (`T1..T6`)**, **Tỉnh/Thành phố (song song 34 Tỉnh mới & 63 Tỉnh cũ)**, **Phường/Xã & Khu vực kinh tế (`CBD`, `Khu Công nghiệp`, `Khu Làng nghề`, `Khu Du lịch`, `Khu CNC/TOD`)**, **Diện tích ($m^2$)**, **Năm định giá (`2021..2026`, Danh nghĩa vs. Thực tế khử lạm phát CPI)** và **Danh mục Thuộc tính Hedonic 4 Tầng** (Sổ đỏ, Ngõ ô tô, Mặt tiền rộng/Lô góc, Gần Metro, Chủ đầu tư Hạng A...).
  - Xuất ngay lập tức: **Đơn giá dự báo ($P_{10}, P_{25}, P_{50}, P_{75}, P_{90}$ Triệu VNĐ/$m^2$)**, **Tổng giá trị BĐS tương ứng (Tỷ VNĐ)**, **Biểu đồ Thác nước SHAP**, và **Top 5 Tiêu chí Gia tăng Giá trị / Đầu tư Tối ưu ROI (`UPS / VPS`)**.
- **Mục 2 đến Mục 8 tại Trang Ngoài:** Chỉ hiển thị lời giới thiệu học thuật, phương pháp luận và danh mục nội dung. Để xem dữ liệu chi tiết cần đăng nhập vào Trang trong (`/workspace`).

### 2.2. Trang Trong Nội bộ Phòng Thí nghiệm (`/workspace` — `webapp/src/app/workspace/page.tsx`)
Sau khi đăng nhập bảo mật (qua Google OAuth 2.0 hoặc tài khoản nội bộ Lab), người dùng truy cập đầy đủ 8 phân hệ:
1. **Phân hệ 1 (`valuation`):** Trạm Định giá AVM Đa phân khúc, Phân tích Tin rao BĐS Thực chiến (dán nội dung tin rao để AI bóc tách giá hợp lý & gợi ý 3 mốc đàm phán trả giá với chủ nhà/môi giới: *Giá mục tiêu mua hời $P_{25}$ / Giá hợp lý thị trường $P_{50}$ / Giá trần không nên vượt quá $P_{75}$*) và **Hệ thống 8 Báo cáo Chuyên sâu Liên Năm (`2021–2026`)**.
2. **Phân hệ 2 (`pyramid`):** Tháp Phân tầng Giá trị BĐS 6 Tầng (`T1_AFFORDABLE` $\to$ `T6_TROPHY_ULTRA`) & Ma trận Thuộc tính *Gatekeeper • Differentiator • Bridge*.
3. **Phân hệ 3 (`econometrics`):** Kết quả Ước lượng Kinh tế lượng Hedonic OLS (sai số chuẩn vững White HC3), Phần bù Giá trị Halvorsen–Palm $(e^{\hat{\gamma}_k}-1)\times 100\%$, Kiểm định Đa cộng tuyến VIF ($<5$) và Kiểm định Chọn mẫu Heckman 2 Bước cho các tin rao "Giá thỏa thuận".
4. **Phân hệ 4 (`provenance`):** Kho Dữ liệu Medallion 3 Tầng, Khử trùng lặp Tin rao Môi giới Đa sàn (`dedup_signature`) và Bảng Đối chứng Link Gốc (`source_urls` + mã băm SHA-256).
5. **Phân hệ 5 (`rbac`):** Quản trị Người dùng Google OAuth 2.0 & Ma trận Phân quyền 4 Tầng (`VIEWER`, `RESEARCHER`, `OPERATOR`, `ADMIN`).
6. **Phân hệ 6 (`mcp`):** Trạm Truy vấn AI Tương tác qua Giao thức **Model Context Protocol (MCP)** kèm Nhật ký Kiểm toán (`mcp_audit_logs`).
7. **Phân hệ 7 (`errors`):** Giám sát Đồng bộ Giờ Chuẩn `GMT+07` Quốc tế (NTP), Nhật ký Lỗi Quét Dữ liệu (`CLOUDFLARE_WAF_BLOCK`, `SELECTOR_DRIFT_ZERO_LINKS`), Ảnh chụp HTML Hiện trường & Hàng đợi Quét bù Tự động (`DLQ`).
8. **Phân hệ 8 (`scraped`):** Trung tâm Điều khiển Chiến dịch 100.000 Bản ghi (`2021–2026`), Thống kê Bản ghi theo Thời gian • Địa điểm (34 Tỉnh mới $\leftrightarrow$ 63 Tỉnh cũ $\leftrightarrow$ Phường/Xã & Khu chức năng) • Nội dung toàn văn tin rao kèm link gốc HTTP 200 OK.
