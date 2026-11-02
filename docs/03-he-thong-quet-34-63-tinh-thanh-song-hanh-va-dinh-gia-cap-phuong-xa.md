# 03. Thiết kế Hệ thống Quét Dữ liệu Song hành 34/63 Tỉnh Thành, Định giá Chi tiết đến Cấp Phường/Xã và Phân loại 6 Khu vực Chức năng (KCN • Làng nghề • Du lịch • CBD • TOD)

> **Tài liệu thuộc Dự án:** Ứng dụng Kinh tế lượng Không gian, Lý thuyết Hedonic và Học máy Giải thích được (XAI/AVM) trong Định giá Bất động sản Đa phân khúc đến Cấp Phường/Xã từ Dữ liệu Tin đăng Trực tuyến tại Việt Nam (*PropValue.AI*)  
> **Phiên bản:** 2.0  
> **Cập nhật lần cuối:** 02/11/2026  

---

## 1. Giải quyết Bài toán Địa lý Song hành: 34 Tỉnh/Thành Mới (2025–2026) $\leftrightarrow$ 63 Tỉnh/Thành Cũ trên các Trang Tin Bất động sản

### 1.1. Bối cảnh Thực tiễn trên các Cổng Mua bán BĐS Việt Nam
Theo **Nghị quyết số 202/2025/QH15 của Quốc hội**, Việt Nam đã hoàn thành việc sắp xếp 63 tỉnh, thành phố xuống còn **34 đơn vị hành chính cấp tỉnh** (gồm **6 Thành phố trực thuộc Trung ương**: *Hà Nội, TP. Hồ Chí Minh, Hải Phòng, Đà Nẵng, Huế, Cần Thơ* và **28 Tỉnh**) đồng thời vận hành mô hình chính quyền địa phương 2 cấp (**Tỉnh/Thành phố $\to$ Phường/Xã**).

Tuy nhiên, trên toàn bộ các cổng tin đăng mua bán bất động sản tại Việt Nam (`Batdongsan.com.vn`, `Nha.Chotot.com`, `Alonhadat.com.vn`, `Mogi.vn`), dữ liệu luôn **tồn tại song song cả 2 hệ thống địa danh**:
1. **Trong URL phân mục, thẻ Breadcrumb hoặc bộ lọc cũ của trang web:** Vẫn sử dụng cấu trúc 63 tỉnh/thành + Quận/Huyện cũ (ví dụ: *"Bình Dương / TP. Dĩ An / Phường Dĩ An"*, *"Bà Rịa - Vũng Tàu / TP. Vũng Tàu"*, *"Quảng Nam / TP. Hội An"*, *"Bắc Giang / TX. Việt Yên"*, *"Vĩnh Phúc / TP. Vĩnh Yên"*).
2. **Trong tiêu đề, mô tả văn bản mới của người đăng hoặc Giấy chứng nhận mới:** Lại ghi theo đơn vị hành chính 34 tỉnh/thành mới hoặc ghi ghép cả hai (ví dụ: *"Bán nhà Phường Dĩ An, TP.HCM (Khu vực Bình Dương cũ)"*, *"Bán đất Phường Nếnh, Tỉnh Bắc Ninh (KCN Quang Châu Bắc Giang cũ)"*).

> [!IMPORTANT]
> **Tại sao bắt buộc phải lưu và mô hình hóa song song cả 2 hệ thống 34 Tỉnh và 63 Tỉnh?**  
> Nếu chỉ quy đổi phẳng về 34 tỉnh/thành mới mà xóa bỏ thông tin 63 tỉnh/quận cũ, mô hình Machine Learning sẽ coi một căn nhà tại **Bình Dương cũ (45 triệu/$m^2$)** hoặc **Bà Rịa – Vũng Tàu cũ (60 triệu/$m^2$)** giống hệt mặt bằng không gian của **Lõi TP. Hồ Chí Minh cũ (180–450 triệu/$m^2$)** vì cả ba nay đều mang mã Tỉnh mới là `TP. Hồ Chí Minh`! Ngược lại, nếu chỉ lưu 63 tỉnh cũ mà không ánh xạ sang 34 tỉnh mới, hệ thống sẽ không thể tổng hợp báo cáo thống kê theo chuẩn hành chính nhà nước hiện hành.

### 1.2. Kiến trúc Ánh xạ Không gian Kép 4 Lớp (`Dual-System Spatial Crosswalk`)
Bộ chuẩn hóa [`GeoNormalizer`](../src/etl/normalizers.py) kết hợp với từ điển [`configs/geo_vietnam_cities.yaml`](../configs/geo_vietnam_cities.yaml) tự động phân giải mọi chuỗi địa chỉ tin rao thành **5 trường không gian đồng thời**:
1. **`province_34_code` & `province_34_name`:** Mã chuẩn trong 34 Tỉnh/Thành mới (VD: `HCM`, `HN`, `DN`, `HP`, `BN`, `HY`, `DNAI`, `PTH`, `NB`, `KH`, `LD`, `AG`...).
2. **`legacy_province_63`:** Tỉnh/Thành phố gốc trong hệ 63 tỉnh trước sáp nhập (VD: `Bình Dương`, `Bà Rịa - Vũng Tàu`, `Quảng Nam`, `Bắc Giang`, `Hải Dương`, `Vĩnh Phúc`, `Thái Bình`...).
3. **`legacy_district`:** Quận / Huyện / Thành phố trực thuộc tỉnh cũ (VD: `Quận Cầu Giấy`, `TP. Thủ Đức`, `TP. Dĩ An`, `TP. Từ Sơn`, `Huyện Văn Giang`, `TP. Hội An`).
4. **`ward_code` & `ward_name`:** **Cấp Phường / Xã / Thị trấn** trực tiếp (VD: `Phường Dịch Vọng Hậu`, `Phường Thảo Điền`, `Phường Đồng Kỵ`, `Xã Bát Tràng`, `Phường Phước Mỹ`).
5. **`economic_zone_type`:** Phân loại đặc tính kinh tế vi mô (`ZONE_CBD_URBAN_CORE`, `ZONE_INDUSTRIAL_FDI_PARK`, `ZONE_CRAFT_VILLAGE_HERITAGE`, `ZONE_TOURISM_RESORT_COASTAL`, `ZONE_HITECH_UNIVERSITY_TOD`, `ZONE_SUBURBAN_RESIDENTIAL_AGRI`).

### 1.3. Bảng Đối chiếu Đầy đủ 34 Tỉnh/Thành Mới $\leftrightarrow$ 63 Tỉnh/Thành Cũ & Phân nhóm Đô thị trong Hệ thống

| STT | Mã Tỉnh 34 Mới | Tên Đơn vị Hành chính Cấp Tỉnh Mới (34 ĐVHC) | Hợp nhất / Giữ nguyên từ 63 Tỉnh/Thành Cũ | Phân nhóm Đô thị & Kinh tế trong Mô hình |
| :---: | :---: | :--- | :--- | :--- |
| **01** | **`HN`** | **Thành phố Hà Nội** *(TW)* | Giữ nguyên Hà Nội | `TIER_SPECIAL` *(Siêu đô thị Đặc biệt)* |
| **02** | **`HCM`** | **Thành phố Hồ Chí Minh** *(TW)* | TP. Hồ Chí Minh + Bình Dương + Bà Rịa – Vũng Tàu | `TIER_SPECIAL` *(Siêu đô thị Đặc biệt & KCN/Cảng)* |
| **03** | **`HP`** | **Thành phố Hải Phòng** *(TW)* | Hải Phòng + Hải Dương | `TIER_1_HUB` *(Đô thị TW Cảng biển & KCN FDI)* |
| **04** | **`DN`** | **Thành phố Đà Nẵng** *(TW)* | Đà Nẵng + Quảng Nam | `TIER_1_HUB` *(Đô thị TW Du lịch Biển & Công nghệ)* |
| **05** | **`HUE`** | **Thành phố Huế** *(TW)* | Giữ nguyên Thừa Thiên Huế | `TIER_1_HUB` *(Đô thị TW Di sản & Văn hóa)* |
| **06** | **`CT`** | **Thành phố Cần Thơ** *(TW)* | Cần Thơ + Sóc Trăng + Hậu Giang | `TIER_1_HUB` *(Đô thị TW Trung tâm ĐBSCL)* |
| **07** | **`BN`** | **Tỉnh Bắc Ninh** | Bắc Ninh + Bắc Giang | `TIER_INDUSTRIAL` *(Thủ phủ KCN FDI & Làng nghề)* |
| **08** | **`HY`** | **Tỉnh Hưng Yên** | Hưng Yên + Thái Bình | `TIER_INDUSTRIAL` *(Đại đô thị Vệ tinh & KCN)* |
| **09** | **`DNAI`** | **Tỉnh Đồng Nai** | Đồng Nai + Bình Phước | `TIER_INDUSTRIAL` *(Đầu mối Sân bay Long Thành & KCN)* |
| **10** | **`TNI`** | **Tỉnh Tây Ninh** | Tây Ninh + Long An | `TIER_INDUSTRIAL` *(Hành lang Công nghiệp Tây Nam)* |
| **11** | **`PTH`** | **Tỉnh Phú Thọ** | Phú Thọ + Vĩnh Phúc + Hòa Bình | `TIER_INDUSTRIAL` *(Công nghiệp FDI & Nghỉ dưỡng Ven đô)* |
| **12** | **`TNG`** | **Tỉnh Thái Nguyên** | Thái Nguyên + Bắc Kạn | `TIER_INDUSTRIAL` *(Tổ hợp Công nghệ Samsung & Đại học)* |
| **13** | **`QNI`** | **Tỉnh Quảng Ninh** | Giữ nguyên Quảng Ninh | `TIER_1_HUB` *(Du lịch Di sản Vịnh Hạ Long & Kinh tế Cửa khẩu)* |
| **14** | **`NB`** | **Tỉnh Ninh Bình** | Ninh Bình + Hà Nam + Nam Định | `TIER_INDUSTRIAL` *(Du lịch Di sản Tràng An, KCN & Làng nghề)* |
| **15** | **`KH`** | **Tỉnh Khánh Hòa** | Khánh Hòa + Ninh Thuận | `TIER_1_HUB` *(Trung tâm Du lịch Biển Nha Trang – Cam Ranh)* |
| **16** | **`LD`** | **Tỉnh Lâm Đồng** | Lâm Đồng + Bình Thuận + Đắk Nông | `TIER_1_HUB` *(Nghỉ dưỡng Cao nguyên Đà Lạt & Biển Mũi Né)* |
| **17** | **`AG`** | **Tỉnh An Giang** | Kiên Giang (Phú Quốc) + An Giang | `TIER_1_HUB` *(Đảo Ngọc Phú Quốc & Kinh tế Biên mậu)* |
| **18** | **`GL`** | **Tỉnh Gia Lai** | Bình Định (Quy Nhơn) + Gia Lai | `TIER_OTHER` *(Hành lang Biển Quy Nhơn – Tây Nguyên)* |
| **19** | **`TH`** | **Tỉnh Thanh Hóa** | Giữ nguyên Thanh Hóa | `TIER_OTHER` *(Cực Tăng trưởng Bắc Trung Bộ, KKT Nghi Sơn & Sầm Sơn)* |
| **20** | **`NA`** | **Tỉnh Nghệ An** | Giữ nguyên Nghệ An | `TIER_OTHER` *(Trung tâm Bắc Trung Bộ, TP. Vinh & VSIP)* |
| **21** | **`HT`** | **Tỉnh Hà Tĩnh** | Giữ nguyên Hà Tĩnh | `TIER_OTHER` *(KKT Vũng Áng & Duyên hải)* |
| **22** | **`QT`** | **Tỉnh Quảng Trị** | Quảng Bình + Quảng Trị | `TIER_OTHER` *(Du lịch Phong Nha – Nhật Lệ & Hành lang Đông Tây)* |
| **23** | **`QNG`** | **Tỉnh Quảng Ngãi** | Quảng Ngãi + Kon Tum | `TIER_OTHER` *(KKT Dung Quất & Du lịch Măng Đen)* |
| **24** | **`DLK`** | **Tỉnh Đắk Lắk** | Phú Yên (Tuy Hòa) + Đắk Lắk | `TIER_OTHER` *(Trung tâm Tây Nguyên & Biển Tuy Hòa)* |
| **25** | **`DT`** | **Tỉnh Đồng Tháp** | Tiền Giang + Đồng Tháp | `TIER_OTHER` *(Đô thị Vệ tinh Sông Tiền & Nông nghiệp CNC)* |
| **26** | **`VL`** | **Tỉnh Vĩnh Long** | Vĩnh Long + Bến Tre + Trà Vinh | `TIER_OTHER` *(Tiểu vùng Trung tâm ĐBSCL & Kinh tế Biển)* |
| **27** | **`CM`** | **Tỉnh Cà Mau** | Bạc Liêu + Cà Mau | `TIER_OTHER` *(Kinh tế Biển & Năng lượng Tái tạo Cực Nam)* |
| **28** | **`LCA`** | **Tỉnh Lào Cai** | Lào Cai + Yên Bái | `TIER_OTHER` *(Du lịch Sa Pa – Mù Cang Chải & Cửa khẩu Quốc tế)* |
| **29** | **`TQ`** | **Tỉnh Tuyên Quang** | Tuyên Quang + Hà Giang | `TIER_OTHER` *(Du lịch Cao nguyên Đá Hà Giang & Sinh thái)* |
| **30** | **`LS`** | **Tỉnh Lạng Sơn** | Giữ nguyên Lạng Sơn | `TIER_OTHER` *(Kinh tế Cửa khẩu Quốc tế Hữu Nghị)* |
| **31** | **`CB`** | **Tỉnh Cao Bằng** | Giữ nguyên Cao Bằng | `TIER_OTHER` *(Du lịch Thác Bản Giốc & Biên giới)* |
| **32** | **`SL`** | **Tỉnh Sơn La** | Giữ nguyên Sơn La | `TIER_OTHER` *(Du lịch Cao nguyên Mộc Châu & Nông sản)* |
| **33** | **`DB`** | **Tỉnh Điện Biên** | Giữ nguyên Điện Biên | `TIER_OTHER` *(Du lịch Lịch sử Điện Biên Phủ & Tây Bắc)* |
| **34** | **`LCH`** | **Tỉnh Lai Châu** | Giữ nguyên Lai Châu | `TIER_OTHER` *(Sinh thái & Thủy điện Tây Bắc)* |

---

## 2. Cơ chế Định giá Chi tiết đến Từng Phường/Xã (`Ward-Level Hierarchical Empirical Bayes Valuation`)

### 2.1. Câu hỏi Khoa học: *Có thể triển khai định giá BĐS đến từng Phường/Xã không?*
**Trả lời:** **Hoàn toàn triển khai được và cực kỳ cần thiết**, đặc biệt khi Việt Nam đã bỏ cấp Quận/Huyện để chuyển sang mô hình **Tỉnh/Thành phố $\to$ Phường/Xã**.

Tuy nhiên, nếu triển khai ngây thơ bằng cách tạo hàng nghìn biến giả cấp Phường (`One-Hot Encoding` cho >3.300 Phường/Xã) rồi đưa thẳng vào OLS, mô hình sẽ gặp **Bẫy Cỡ mẫu Nhỏ (*Small-Area Estimation Problem*)**:
- Các phường trung tâm (như *Phường Dịch Vọng Hậu, Phường Trung Hòa, Phường Thảo Điền, Phường Bến Nghé, Phường Phước Mỹ*...) có hàng trăm tin rao/tháng $\to$ ước lượng rất chính xác.
- Các xã/phường ngoại vi hoặc tỉnh xa chỉ có $1 - 5$ tin rao trong tháng $\to$ nếu tính trung bình độc lập sẽ bị nhiễu nặng bởi 1 tin rao bất thường.

### 2.2. Giải pháp Toán học trong `PropValue.AI`: Mô hình Co rút Thực nghiệm Bayes 4 Cấp (*4-Level Hierarchical Empirical Bayes Spatial Shrinkage*)
Kế thừa phương pháp của **Zillow Zestimate** và lý thuyết mô hình phân cấp của **Gelman & Hill (2007)**, hệ thống tính toán **Mặt bằng Đơn giá Cơ sở Cấp Phường/Xã ($\widehat{B}_{\text{Ward } w}$)** theo công thức tổ hợp lồi có trọng số phụ thuộc cỡ mẫu thực tế $n_w$ tại Phường $w$:

$$\widehat{B}_{\text{Ward } w} = \omega_w \cdot \bar{P}_{w}^{\text{DB}} + (1 - \omega_w) \cdot \widehat{P}_{\text{Parent}(w)}^{\text{Prior}}$$

Trong đó:
1. **Trọng số Tin cậy Thực nghiệm Cấp Phường ($\omega_w$):**
   $$\omega_w = \frac{n_w}{n_w + \kappa} \quad (\text{với tham số làm trơn } \kappa = 15 \text{ bản ghi})$$
   - Khi Phường $w$ đã thu thập được $n_w = 60$ tin rao có giá trong PostgreSQL: $\omega_w = \frac{60}{60+15} = 0.80$ ($80\%$ trọng số lấy trực tiếp từ trung vị thực tế của Phường đó).
   - Khi Phường $w$ có $n_w = 150$ tin rao: $\omega_w = 0.91$ (hội tụ hoàn toàn về dữ liệu thực của Phường).
   - Khi Phường $w$ mới có $n_w = 2$ tin rao: $\omega_w = 0.118$ (mượn $88.2\%$ sức mạnh thống kê từ cấp Cụm Quận/Khu chức năng cha để không bị chệch!).
2. **Mỏ neo Phân cấp Cha ($\widehat{P}_{\text{Parent}(w)}^{\text{Prior}}$):**
   $$\widehat{P}_{\text{Parent}(w)}^{\text{Prior}} = P_{0, \text{Province63}(w)} \times M_{\text{DistrictCluster}(w)} \times M_{\text{EconomicZone}(w)}$$
   Kết hợp mặt bằng Tỉnh 63 gốc, Cụm Quận/Huyện cũ và **Hệ số Đặc tính Khu vực Kinh tế (`Economic Zone Multiplier`)** của Phường/Xã đó.
3. **Định giá Chi tiết Từng Bất động sản $i$ bên trong Phường $w$:**
   Sau khi xác định được mặt bằng Phường $\widehat{B}_{\text{Ward } w}$, mô hình **LightGBM Quantile Regression ($P_{10}..P_{90}$) + TreeSHAP** cộng/trừ tiếp các phần bù vi mô ngay trong Phường đó: *Vị trí mặt phố hay trong ngõ (`AT_STREET_FRONT_PRIME` vs `AT_CAR_ACCESS_ROAD`), Mặt tiền & Lô góc (`AT_WIDE_FRONTAGE_CORNER`), Pháp lý Sổ đỏ (`AT_RED_PINK_BOOK`), Tiện ích Compound (`AT_ALL_IN_ONE_COMPOUND`), Chủ đầu tư Hạng A (`AT_TIER1_MASTER_DEVELOPER`)*.

---

## 3. Phân loại 6 Tiêu chí Khu vực Kinh tế Đặc thù (Khu Công nghiệp • Khu Làng nghề • Khu Du lịch • Khu CNC/TOD • Lõi CBD • Ven đô)

Để phục vụ phân tích chuyên sâu và giải thích tại sao một số Phường/Xã ở tỉnh lại có giá đất cao đột biến, hệ thống tự động gắn nhãn mỗi bản ghi và mỗi Phường/Xã vào **6 Khu vực Kinh tế Chức năng (`functional_economic_zones`)**:

| Mã Khu vực Chức năng | Tên Phân loại Kinh tế Vi mô | Địa bàn Điển hình tại Việt Nam | Đặc trưng Kinh tế Bất động sản & Hệ số Điều chỉnh |
| :--- | :--- | :--- | :--- |
| **`ZONE_CBD_URBAN_CORE`** | **Khu Lõi Trung tâm Đô thị (CBD)** | Hoàn Kiếm, Ba Đình, Cầu Giấy, Đống Đa (HN); Quận 1, Quận 3, Thủ Thiêm, Phú Mỹ Hưng (HCM); Hải Châu (ĐN); Hồng Bàng (HP). | Khan hiếm quỹ đất tuyệt đối; cầu văn phòng, thương mại và căn hộ hạng sang rất cao (`Multiplier = 1.35x`). |
| **`ZONE_INDUSTRIAL_FDI_PARK`** | **Khu Công nghiệp (KCN) & Đô thị FDI** | Yên Phong, Quế Võ, Việt Yên (Bắc Ninh); Dĩ An, Thuận An, Bến Cát - VSIP (Bình Dương/HCM); Thủy Nguyên, Tràng Duệ (Hải Phòng); Long Thành, Amata (Đồng Nai); Phổ Yên (Thái Nguyên); Bình Xuyên (Phú Thọ). | Tập trung hàng chục nghìn chuyên gia nước ngoài và kỹ sư/công nhân; thanh khoản đất nền dịch vụ, nhà phố thương mại và CHDV cho thuê cực tốt (`Multiplier = 1.12x`). |
| **`ZONE_CRAFT_VILLAGE_HERITAGE`** | **Khu Làng nghề Truyền thống Giàu có** | Đồng Kỵ, Phù Khê, Đa Hội (Từ Sơn - Bắc Ninh); Ninh Hiệp, Bát Tràng (Gia Lâm - HN); Vạn Phúc (Hà Đông - HN); Hữu Bằng (Thạch Thất - HN); La Phù (Hoài Đức - HN); Hải Minh (Ninh Bình/Nam Định). | **Đặc thù độc đáo của Việt Nam:** Dòng tiền mặt tích lũy từ sản xuất – buôn bán truyền thống rất lớn, nhu cầu mở rộng xưởng/cửa hàng tại chỗ khiến đơn giá đất thổ cư làng nghề cao vượt trội (`Multiplier = 1.18x`). |
| **`ZONE_TOURISM_RESORT_COASTAL`** | **Khu Du lịch Biển, Đảo & Di sản** | Sơn Trà - Mỹ Khê, Hội An (Đà Nẵng); Nha Trang - Cam Ranh (Khánh Hòa); Phú Quốc (An Giang); Hạ Long - Bãi Cháy (Quảng Ninh); Đà Lạt, Mũi Né (Lâm Đồng); Vũng Tàu - Hồ Tràm (HCM); Sầm Sơn (Thanh Hóa); Tràng An (Ninh Bình); Sa Pa (Lào Cai). | Giá trị gắn liền với khả năng khai thác lưu trú (Khách sạn, Boutique Hotel, Villa biển, Condotel) và tầm nhìn hướng biển/hồ (`Multiplier = 1.22x`). |
| **`ZONE_HITECH_UNIVERSITY_TOD`** | **Khu Công nghệ cao, Đại học & Đầu mối Metro TOD / Sân bay** | Khu CNC Hòa Lạc, Tây Mỗ - Đại Mỗ, dọc Metro Cát Linh - Hà Đông & Nhổn (HN); Khu CNC Quận 9 - Thủ Đức, dọc Metro Bến Thành - Suối Tiên (HCM); Quanh Sân bay Long Thành (Đồng Nai) & Sân bay Gia Bình (Bắc Ninh). | Động lực tăng giá vốn dài hạn (*Capital Appreciation*) mạnh nhất nhờ hạ tầng giao thông công cộng và đội ngũ lao động tri thức cao (`Multiplier = 1.20x`). |
| **`ZONE_SUBURBAN_RESIDENTIAL_AGRI`** | **Khu Dân cư Mở rộng, Ven đô & Nông thôn Mới** | Các xã/phường ven đô và khu dân cư tỉnh lỵ thông thường. | Mặt bằng giá mềm, diện tích rộng, phục vụ nhu cầu ở thực địa phương hoặc tích sản dài hạn (`Multiplier = 0.90x`). |
