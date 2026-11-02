---
name: framework-review
description: >-
  Rà soát, kiểm toán thực nghiệm (empirical audit) và đề xuất tái cấu trúc Khung phân tích
  Thị trường Bất động sản Việt Nam, Từ điển Thuộc tính Giá trị BĐS 4 tầng (skills_ontology.yaml)
  và Tháp Phân tầng Giá trị BĐS 6 tầng (roles_taxonomy.yaml) khi đã thu thập được lượng dữ liệu
  tin rao bán bất động sản đủ lớn. Kích hoạt khi người dùng yêu cầu "review lại khung",
  "tái cấu trúc khung phân tích", "cập nhật tháp giá BĐS theo dữ liệu thực tế", hoặc
  "kiểm tra từ điển thuộc tính/tiện ích mới".
---

# Skill: Rà soát & Tái cấu trúc Khung Phân tích Thị trường Bất động sản (`framework-review`)

Sử dụng skill này khi dự án đã thu thập được một lượng dữ liệu tin rao bán bất động sản mới (từ PostgreSQL hoặc các tệp Parquet/CSV/JSON trong `data/`) và cần kiểm định xem **Khung phân tích 4 trụ cột phân khúc BĐS**, **Từ điển Thuộc tính Giá trị Hedonic 4 tầng**, hay **Tháp Phân tầng Đơn giá BĐS 6 tầng** có cần hiệu chỉnh/tái cấu trúc theo thực tế thị trường hay không.

---

## Quy trình Thực hiện 4 Bước (Standard Operating Procedure)

### Bước 1: Chạy Động cơ Kiểm toán Khung (`framework_auditor.py`)
Thực thi công cụ kiểm toán dữ liệu tự động để tính toán các chỉ số thống kê thực nghiệm:

```bash
python -m src.analytics.framework_auditor --output-dir docs/audits
```

### Bước 2: Phân tích 4 Nhóm Chỉ báo từ Báo cáo Kiểm toán (`docs/audits/framework-review-*.md`)
1. **Độ phủ Phân loại Loại hình BĐS (`Property Type Coverage`):**
   - Tỷ lệ tin đăng `UNCLASSIFIED` có vượt ngưỡng **5%** không?
   - Các cụm tiêu đề tin rao chưa phân loại nên được gộp vào `title_aliases` của 16 loại hình BĐS hiện có hay tách thành loại hình chuẩn mới?
2. **Thuộc tính & Tiện ích BĐS Mới nổi (`Emerging Amenities & Unmapped Tags`):**
   - Kiểm tra danh sách các `raw_skill_tags` (từ Batdongsan.com.vn/Chợ Tốt/Alonhadat/Mogi) xuất hiện với tần suất cao nhưng chưa có trong `configs/skills_ontology.yaml`.
   - Phân loại các thuộc tính mới vào đúng 4 tầng (`L1_FOUNDATION` - Pháp lý & Hạ tầng cơ bản, `L2_TOOL` - Đặc tính Vật lý & Kiến trúc, `L3_DOMAIN` - Kết nối Hạ tầng & Tiện ích, `L4_MINDSET` - Tiềm năng Đầu tư & Bảo chứng Chủ đầu tư).
3. **Độ lệch Ranh giới Đơn giá trên Tháp 6 Tầng (`Pyramid Boundary Drift`):**
   - Kiểm tra các ô `(Phân khúc, Tầng Giá trị)` có độ lệch trung vị đơn giá (triệu VNĐ/$m^2$) thực tế so với thiết kế $\text{Drift} > 15\%$.
   - Kiểm tra kết quả kiểm định tính đơn điệu ($P_{50}(T_1) < P_{50}(T_2) < \dots < P_{50}(T_6)$).
4. **Dịch chuyển Vai trò Thuộc tính Định giá (`Attribute Role Migration`):**
   - Thuộc tính nào đã vượt ngưỡng tần suất $ADF \ge 50\%$ để trở thành **Gatekeeper Attribute (Điều kiện thanh khoản bắt buộc)**?
   - Thuộc tính nào trong khoảng $10\% \le ADF < 50\%$ đang có phần bù đơn giá biên (Hedonic Price Premium / SHAP) cao nhất để đưa vào nhóm **Differentiator Attribute**?
   - Thuộc tính nào có độ chênh tần suất $\Delta ADF_{L \to L+1} \ge 15\%$ để cập nhật làm **Bridge Attribute (Bước đệm nâng hạng phân khúc)**?

### Bước 3: Trình bày Đề xuất Tái cấu trúc cho Người dùng
Tóm tắt ngắn gọn, rõ ràng các phát hiện định lượng (kèm số liệu mẫu $N$, tỷ lệ %, mức đơn giá trung vị thực tế vs. thiết kế) và hỏi ý kiến người dùng trước khi ghi đè các thay đổi lớn vào khung lý thuyết.

### Bước 4: Áp dụng Cập nhật & Đồng bộ Tài liệu `docs/`
Sau khi được xác nhận:
1. Cập nhật `configs/skills_ontology.yaml` và `configs/roles_taxonomy.yaml`.
2. Đồng bộ các bảng số liệu mới vào `docs/01-khung-phan-tich-thi-truong-bat-dong-san.md`, `docs/02-thap-phan-tang-gia-tri-va-thuoc-tinh-bds.md` và `docs/05-nhat-ky-tu-van-va-hoi-dap.md`.
