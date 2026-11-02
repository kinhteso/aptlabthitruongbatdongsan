# Báo cáo Kiểm toán & Đánh giá Tái cấu trúc Khung Phân tích (2026-11-02)

- **Thời gian kiểm toán:** `2026-11-02 14:43:14`
- **Tổng số mẫu tin tuyển dụng chuẩn hóa ($N$):** `4`
- **Tổng số đường link gốc đối chứng (`source_urls`):** `5` (Số tin gộp đa nguồn: `1`)
- **Số tin có công bố mức lương rõ ràng:** `4`
- **Trạng thái khuyến nghị:** **CẦN CẬP NHẬT / TÁI CẤU TRÚC KHUNG**

---

## 0. Kiểm toán Hệ thống Cổng Tuyển dụng & Cơ chế Mapping Đa nguồn (Portal Mapping Registry)
| Mã Cổng (`site_code`) | Tên miền gốc | Động cơ Thu thập (`Engine`) | Ưu tiên `JSON-LD` | Số tin đóng góp | Tỷ lệ có Lương (%) | Số Link xác thực |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `topcv` | `https://batdongsan.com.vn` | `playwright_stealth` | `Có` | 1 | `100.0%` | 1 |
| `itviec` | `https://nha.chotot.com` | `httpx_or_playwright` | `Có` | 2 | `100.0%` | 2 |
| `careerviet` | `https://alonhadat.com.vn` | `httpx_or_playwright` | `Có` | 1 | `100.0%` | 1 |
| `vietnamworks` | `https://mogi.vn` | `httpx_or_playwright` | `Có` | 1 | `100.0%` | 1 |

---

## 1. Kiểm toán Độ phủ Phân loại Nghề nghiệp (Occupation Taxonomy Coverage)
- **Tỷ lệ chức danh chưa khớp (`UNCLASSIFIED`):** `50.00%` (Ngưỡng cảnh báo: `5.00%`).
- **Các chức danh chưa khớp phổ biến nhất (Cần bổ sung vào `roles_taxonomy.yaml`):**
  - `E-Commerce & Performance Marketing Specialist (Shopee / TikTok Shop)` (1 tin)
  - `Chuyên viên Cao cấp Phân tích Nghiệp vụ Ngân hàng Số (Senior IT Business Analyst)` (1 tin)

## 2. Phát hiện Kỹ năng Số Mới nổi (Emerging Unmapped Skills)
| Tag kỹ năng mới phát hiện | Số lần xuất hiện | Tỷ lệ (%) | Khuyến nghị cập nhật `skills_ontology.yaml` |
| :--- | :---: | :---: | :--- |
| `ClickHouse` | 2 | 50.0% | Bổ sung mã `SK_CLICKHOUSE` vào Tầng L2/L3 |
| `Python` | 2 | 50.0% | Bổ sung mã `SK_PYTHON` vào Tầng L2/L3 |
| `SQL` | 2 | 50.0% | Bổ sung mã `SK_SQL` vào Tầng L2/L3 |
| `LangGraph` | 2 | 50.0% | Bổ sung mã `SK_LANGGRAPH` vào Tầng L2/L3 |

## 3. Hiệu chỉnh Ranh giới Lương trên Tháp 6 Tầng (Pyramid Boundary Calibration)
| Trụ cột ngành | Tầng Tháp | Cỡ mẫu ($n$) | Trung vị Thiết kế (Tr.VNĐ) | Trung vị Thực tế (Tr.VNĐ) | Độ lệch (%) | Khuyến nghị |
| :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `DE-01` | `T3_JUNIOR` | 1 | 70.0 | **20.32** | `-71.0%` | Hạ mốc lương tham chiếu trên Tháp |
| `DE-01` | `T4_MIDDLE_SENIOR` | 1 | 112.0 | **55.88** | `-50.1%` | Hạ mốc lương tham chiếu trên Tháp |

## 4. Định vị Vai trò Kỹ năng theo Bằng chứng Thực nghiệm (Gatekeeper vs. Differentiator)

| Mã Kỹ năng | Tên Kỹ năng | Tầng | Tần suất cầu (%) | Phần bù lương thô (Tr.VNĐ) | Vai trò Thực nghiệm trên Tháp |
| :--- | :--- | :---: | :---: | :---: | :--- |
