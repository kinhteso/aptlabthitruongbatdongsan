# 06. Cơ chế Tự động Đánh giá, Kiểm toán Thực nghiệm và Tái cấu trúc Khung Phân tích Thị trường Bất động sản (`Adaptive Framework Auditor`)

> **Tài liệu thuộc Dự án:** Ứng dụng Kinh tế lượng Không gian, Lý thuyết Hedonic và Học máy Giải thích được (XAI/AVM) trong Định giá Bất động sản Đa phân khúc đến Cấp Phường/Xã từ Dữ liệu Tin đăng Trực tuyến tại Việt Nam (*PropValue.AI*)  
> **Phiên bản:** 1.0  
> **Cập nhật lần cuối:** 02/11/2026  

---

## 1. Mục tiêu của Động cơ Kiểm toán Khung (`src/analytics/framework_auditor.py`)

Thị trường bất động sản Việt Nam biến động liên tục theo chu kỳ tín dụng, bảng giá đất mới của Nhà nước (theo Luật Đất đai 2024 áp dụng bảng giá đất sát thị trường hàng năm) và sự xuất hiện của các khu đô thị/hạ tầng mới. Động cơ `FrameworkAuditor` được thiết kế để tự động kiểm toán dữ liệu sau mỗi chu kỳ cào dựa trên **5 nhóm chỉ báo định lượng**:

1. **Mục 0 — Kiểm toán Đa Cổng BĐS & Đối chứng Link Gốc (`Multi-Portal Mapping & Provenance Audit`):**
   - Kiểm tra lưu lượng tin rao, tỷ lệ công khai giá (`salary_disclosure_rate_pct`) và số lượng link đối chứng (`verified_links_count`) trên từng cổng trong `configs/scraper_settings.yaml` (`Batdongsan.com.vn`, `Nha.Chotot.com`, `Alonhadat.com.vn`, `Mogi.vn`).
2. **Mục 1 — Độ phủ Phân loại 16 Loại hình BĐS (`Property Type Coverage`):**
   - Phát hiện tỷ lệ bản tin chưa phân loại (`UNCLASSIFIED`). Nếu vượt quá ngưỡng **5%**, tự động trích xuất danh sách cụm tiêu đề tin rao mới để bổ sung vào `title_aliases` trong `configs/roles_taxonomy.yaml`.
3. **Mục 2 — Phát hiện Thuộc tính & Tiện ích BĐS Mới nổi (`Emerging Unmapped Amenities`):**
   - Thống kê các thẻ `unmapped_tags` xuất hiện lặp lại trên các cổng BĐS nhưng chưa có trong `configs/skills_ontology.yaml` (ví dụ: *trạm sạc xe điện VinFast, chứng chỉ EDGE, căn hộ Dual-Key, sổ hồng trao tay...*).
4. **Mục 3 — Kiểm toán Độ lệch Ranh giới Đơn giá trên Tháp 6 Tầng (`Pyramid Boundary Drift Check`):**
   - So sánh trung vị đơn giá thực tế trong CSDL (`empirical_p50_vnd` — Triệu VNĐ/$m^2$) với mốc thiết kế (`design_p50_vnd`). Nếu $|\text{Drift}| \ge 15\%$, hệ thống tự động phát cảnh báo khuyến nghị cập nhật lại dải đơn giá chuẩn của Tháp.
   - Kiểm định tính đơn điệu chặt: $P_{50}(T_1) < P_{50}(T_2) < P_{50}(T_3) < P_{50}(T_4) < P_{50}(T_5) < P_{50}(T_6)$.
5. **Mục 4 — Phân loại Thực nghiệm Vai trò Thuộc tính Hedonic (`Gatekeeper • Differentiator • Bridge Attributes`):**
   - **Gatekeeper Attribute ($\text{ADF} \ge 50\%$):** Điều kiện thanh khoản tiêu chuẩn của tầng đó (ví dụ: Sổ đỏ/Sổ hồng riêng).
   - **Differentiator Attribute ($10\% \le \text{ADF} < 50\%$ & Phần bù giá trị cao):** Thuộc tính tạo đột phá đơn giá (ví dụ: Lô góc 2 mặt thoáng, Ngõ ô tô tránh, Cận kề Metro TOD, Chủ đầu tư Hạng A).
   - **Bridge Attribute ($\Delta \text{ADF}_{L \to L+1} \ge 15\%$):** Thuộc tính bước đệm nâng hạng bất động sản lên tầng giá trị cao hơn.
