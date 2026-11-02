# Báo cáo Kết quả Huấn luyện Kinh tế lượng (Mincer OLS & Heckman) + LightGBM Quantile + Giải thích SHAP

- **Thời gian huấn luyện:** `2026-11-02 13:28:45`
- **Nguồn dữ liệu:** Hybrid (4 bản ghi thực tế từ DB + 446 mẫu hiệu chỉnh thị trường VN)
- **Tổng quy mô mẫu ($N$):** `450` tin tuyển dụng (`301` tin công bố lương + `149` tin ẩn lương 'Thỏa thuận').

---

## 1. Kết quả Ước lượng Phương trình Tiền lương Mincer Mở rộng (OLS với Robust SE HC3)
- **Số quan sát có công bố lương ($N_{\text{OLS}}$):** `301`
- **Hệ số xác định ($R^2$ / Adjusted $R^2$):** `0.9882` / `0.9861`
- **Thống kê $F$ (HC3):** `609.17` | **AIC / BIC:** `-369.78` / `-195.55`

### Top Kỹ năng Số & Tổ hợp Cộng hưởng có Phần bù Tiền lương (Halvorsen-Palm Wage Premium) Cao nhất
| Mã Kỹ năng | Tên Kỹ năng / Cộng hưởng | Tầng | Hệ số $\hat{\gamma}_k$ | Robust SE | $p$-value | Phần bù Lương $\text{SWP}_k$ (%) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `SK_SPARK_BIGDATA` | Cận kề Ga Metro (TOD), Vành đai 2-3-4 & Trục Đại lộ (Metro TOD & Ring-Road) | `L3_DOMAIN` | `+0.2090`*** | `0.0423` | `0.0000` | **`+23.24%`** |
| `SK_GENAI_LLM` | Khai thác Dòng tiền Cho thuê Cao (Rental Yield 5-8%/năm, Sẵn Hợp đồng Thuê / CHDV) | `L4_MINDSET` | `+0.2001`*** | `0.0208` | `0.0000` | **`+22.15%`** |
| `SK_ML_DL_FRAMEWORKS` | Chủ đầu tư Hạng A Uy tín (Vinhomes, Masterise, Sun, Ecopark, Phú Mỹ Hưng, CapitaLand, Keppel) | `L4_MINDSET` | `+0.1639`*** | `0.0336` | `0.0000` | **`+17.81%`** |
| `SK_ERP_SAP_ODOO` | Đất KCN Đã Đóng tiền Thuê đất 1 Lần, Đủ ĐTM & Trạm biến áp | `L3_DOMAIN` | `+0.1566`*** | `0.0387` | `0.0001` | **`+16.95%`** |
| `SK_PYTHON` | Mặt tiền Rộng (>= 5m), Lô góc 2-3 Mặt thoáng & Nở hậu (Wide Frontage / Corner Lot) | `L2_TOOL` | `+0.1498`*** | `0.0312` | `0.0000` | **`+16.16%`** |
| `SK_ENGLISH_PROFESSIONAL` | Quỹ căn Người Nước ngoài (Foreign Quota 30%) & Khu Chuyên gia Expat Thuê Giá Cao | `L4_MINDSET` | `+0.1477`*** | `0.0228` | `0.0000` | **`+15.92%`** |
| `SK_API_INTEGRATION` | Kết nối Trực tiếp Quốc lộ, Cao tốc, Cảng biển & Container 40 Feet Ra vào | `L3_DOMAIN` | `+0.1312`** | `0.0539` | `0.0150` | **`+14.02%`** |
| `SK_AIRFLOW_DBT` | Hệ sinh thái All-in-One: TTTM, Bể bơi 4 mùa, Công viên & An ninh 24/7 (Compound Amenities) | `L3_DOMAIN` | `+0.1241`*** | `0.0299` | `0.0000` | **`+13.21%`** |
| `SK_FINTECH_CREDIT_RISK` | Đất Đấu giá Nhà nước: Pháp lý Tuyệt đối An toàn, Tự do Xây dựng | `L3_DOMAIN` | `+0.1220`*** | `0.0419` | `0.0036` | **`+12.97%`** |
| `SK_CLOUD_PLATFORM` | BĐS Ven Sông, Giáp Hồ Tự nhiên & Công viên Lớn (Waterfront & Ecological Adjacency) | `L3_DOMAIN` | `+0.1199`*** | `0.0276` | `0.0000` | **`+12.74%`** |
| `SK_ECOM_MERCHANDISING_PL` | Thiết kế Tối ưu Đa Căn hộ Khép kín (CHDV 10-35 Phòng, PCCC Đạt chuẩn) | `L3_DOMAIN` | `+0.1193`*** | `0.0378` | `0.0016` | **`+12.67%`** |
| `SK_DATA_MODELING_DWH` | Tâm điểm Lõi Tài chính CBD hoặc Khu Công nghệ cao / KCN FDI (CBD & Hi-Tech Proximity) | `L3_DOMAIN` | `+0.1125`*** | `0.0233` | `0.0000` | **`+11.91%`** |

### Kiểm định Đa cộng tuyến (VIF - Variance Inflation Factor)
| Biến giải thích | Chỉ số VIF | Đánh giá |
| :--- | :---: | :--- |
| `exp_years_mid` | `7.51` | MODERATE (5 <= VIF < 10) |
| `career_tier_num` | `8.8` | MODERATE (5 <= VIF < 10) |
| `FE_CITY_HCM` | `1.79` | OK (VIF < 5) |
| `FE_CITY_HN` | `1.78` | OK (VIF < 5) |
| `FE_WORK_REMOTE` | `1.01` | OK (VIF < 5) |
| `FE_PILLAR_DE01` | `1.5` | OK (VIF < 5) |
| `FE_PILLAR_DE04` | `1.58` | OK (VIF < 5) |
| `n_skills_L2` | `1.21` | OK (VIF < 5) |
| `n_skills_L3` | `1.44` | OK (VIF < 5) |
| `n_skills_L4` | `2.18` | OK (VIF < 5) |

---

## 2. Kiểm định & Hiệu chỉnh Chệch Chọn mẫu Heckman 2 Bước (Bài toán 'Lương Thỏa thuận')
- **Tỷ lệ tin ẩn lương ('Thỏa thuận'):** `33.11%` (`149/450` tin).
- **Hệ số Tỷ số Mills Nghịch đảo ($\hat{\beta}_\lambda$ - Inverse Mills Ratio):** `-0.0211` (Robust SE: `0.0328`, $p$-value: `0.5209`).
- **Kết luận Kiểm định:** Hệ số Inverse Mills Ratio (lambda) không có ý nghĩa thống kê ở mức 5% (p >= 0.05): việc ẩn lương ('Thỏa thuận') không làm chệch đáng kể ước lượng phần bù kỹ năng của Mincer OLS.
- **Lương trung bình nhóm công bố:** `57.07 triệu VNĐ` | **Lương nội suy trung bình nhóm 'Thỏa thuận':** `57.31 triệu VNĐ`.

---

## 3. Hiệu năng Mô hình Học máy Phi tuyến & Hồi quy Phân vị ($P_{10} - P_{25} - P_{50} - P_{75} - P_{90}$)
- **Động cơ huấn luyện:** `Sklearn Hist/GBDT Quantile`
- **Độ chính xác trên tập Kiểm định (Out-of-sample Test):**
  - **$R^2$ Score:** `0.9195`
  - **MAE (Sai số tuyệt đối trung bình):** `8.18 triệu VNĐ/tháng`
  - **RMSE:** `18.33 triệu VNĐ/tháng` | **MAPE:** `16.17%`
  - **Độ phủ Khoảng tin cậy 80% ($\text{PICP}_{80\%}: P_{10} \to P_{90}$):** `75.41%` (Độ rộng trung bình: `30.1 triệu VNĐ`).

---

## 4. Định giá Kỹ năng theo Lý thuyết Trò chơi Shapley (SHAP) & Ma trận Cộng hưởng ($Lift$)

### 4.1. Giá trị Đóng góp Biên SHAP Trung bình của Kỹ năng Số (Đơn vị: Triệu VNĐ/tháng)
| Mã Kỹ năng | Tên Kỹ năng | Tầng | Tần suất Cầu (%) | $|\text{SHAP}|$ Trung bình | Phần bù SHAP Ròng (Triệu VNĐ/tháng) |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `SYN_SPARK_CLOUD` | SYN_SPARK_CLOUD | `SYNERGY` | `2.0%` | `1.682` | **`+5.39 tr.VNĐ`** |
| `SYN_SQL_PYTHON` | SYN_SQL_PYTHON | `SYNERGY` | `10.0%` | `1.804` | **`+4.96 tr.VNĐ`** |
| `SK_DATA_GOVERNANCE_SECURITY` | Công trình Xanh (LEED / LOTUS / EDGE) & Smart Home AI IoT (Green & Smart Property) | `L4_MINDSET` | `16.0%` | `2.474` | **`+3.84 tr.VNĐ`** |
| `SK_ROAS_CRO_FUNNEL` | Chủ thiện chí Bán gấp / Giá Chào Thấp hơn Thị trường 5-15% (Below-Market Deal) | `L4_MINDSET` | `11.6%` | `1.940` | **`+3.03 tr.VNĐ`** |
| `SYN_ML_GENAI` | SYN_ML_GENAI | `SYNERGY` | `1.6%` | `1.682` | **`+1.94 tr.VNĐ`** |
| `SK_REQUIREMENTS_SRS_BRD` | Sẵn sàng Công chứng Sang tên Ngay trong Ngày (Immediate Notary Transfer) | `L1_FOUNDATION` | `16.4%` | `1.584` | **`+1.35 tr.VNĐ`** |
| `SK_BA_MODELING_TOOLS` | 100% Đất Ở Đô thị (ODT) / Đất Ở Nông thôn (ONT) Không Dính Quy hoạch | `L1_FOUNDATION` | `16.8%` | `1.688` | **`+1.07 tr.VNĐ`** |
| `SK_AGILE_SCRUM` | Quản lý Vận hành Chuẩn Quốc tế (Savills, CBRE, JLL, Marriott, Tokyu, Vinhomes Mgmt) | `L4_MINDSET` | `27.6%` | `1.650` | **`+0.95 tr.VNĐ`** |
| `SK_DOCKER_GIT_CICD` | Cụm Trường Quốc tế, Đại học Trọng điểm & Bệnh viện Tuyến đầu (Education & Healthcare Hub) | `L3_DOMAIN` | `7.2%` | `1.541` | **`+0.89 tr.VNĐ`** |
| `SYN_SQL_POWERBI` | SYN_SQL_POWERBI | `SYNERGY` | `11.6%` | `1.406` | **`+0.79 tr.VNĐ`** |
| `SK_ERP_SAP_ODOO` | Đất KCN Đã Đóng tiền Thuê đất 1 Lần, Đủ ĐTM & Trạm biến áp | `L3_DOMAIN` | `10.0%` | `1.610` | **`+0.69 tr.VNĐ`** |
| `SK_TABLEAU` | Thang máy Nhập khẩu & Hầm / Gara Ô tô Riêng (Private Elevator & Garage) | `L2_TOOL` | `18.4%` | `1.676` | **`+0.65 tr.VNĐ`** |

### 4.2. Top Cặp Kỹ năng Cộng hưởng Mạnh nhất (Skill Co-occurrence & Synergy Lift)
| Kỹ năng A | Kỹ năng B | Số tin đi cùng | Xác suất chung (%) | Hệ số Cộng hưởng $\text{Lift}(A, B)$ |
| :--- | :--- | :---: | :---: | :---: |
| `SK_ERP_SAP_ODOO` (Đất KCN Đã Đóng tiền Thuê đất 1 Lần, Đủ ĐTM & Trạm biến áp) | `SK_FINTECH_CREDIT_RISK` (Đất Đấu giá Nhà nước: Pháp lý Tuyệt đối An toàn, Tự do Xây dựng) | 14 | `3.11%` | **`5.53x`** |
| `SK_ECOM_MERCHANDISING_PL` (Thiết kế Tối ưu Đa Căn hộ Khép kín (CHDV 10-35 Phòng, PCCC Đạt chuẩn)) | `SK_ECOM_SELLER_CENTER` (Nhà Dân xây Khung Cột Bê tông Chắc chắn / Thiết kế Hiện đại) | 15 | `3.33%` | **`5.51x`** |
| `SK_API_INTEGRATION` (Kết nối Trực tiếp Quốc lộ, Cao tốc, Cảng biển & Container 40 Feet Ra vào) | `SK_FINTECH_CREDIT_RISK` (Đất Đấu giá Nhà nước: Pháp lý Tuyệt đối An toàn, Tự do Xây dựng) | 9 | `2.0%` | **`5.4x`** |
| `SK_API_INTEGRATION` (Kết nối Trực tiếp Quốc lộ, Cao tốc, Cảng biển & Container 40 Feet Ra vào) | `SK_BA_MODELING_TOOLS` (100% Đất Ở Đô thị (ODT) / Đất Ở Nông thôn (ONT) Không Dính Quy hoạch) | 18 | `4.0%` | **`4.84x`** |
| `SK_API_INTEGRATION` (Kết nối Trực tiếp Quốc lộ, Cao tốc, Cảng biển & Container 40 Feet Ra vào) | `SK_REQUIREMENTS_SRS_BRD` (Sẵn sàng Công chứng Sang tên Ngay trong Ngày (Immediate Notary Transfer)) | 17 | `3.78%` | **`4.64x`** |
| `SK_FINTECH_CREDIT_RISK` (Đất Đấu giá Nhà nước: Pháp lý Tuyệt đối An toàn, Tự do Xây dựng) | `SK_REQUIREMENTS_SRS_BRD` (Sẵn sàng Công chứng Sang tên Ngay trong Ngày (Immediate Notary Transfer)) | 20 | `4.44%` | **`4.55x`** |
| `SK_ERP_SAP_ODOO` (Đất KCN Đã Đóng tiền Thuê đất 1 Lần, Đủ ĐTM & Trạm biến áp) | `SK_REQUIREMENTS_SRS_BRD` (Sẵn sàng Công chứng Sang tên Ngay trong Ngày (Immediate Notary Transfer)) | 25 | `5.56%` | **`4.49x`** |
| `SK_BA_MODELING_TOOLS` (100% Đất Ở Đô thị (ODT) / Đất Ở Nông thôn (ONT) Không Dính Quy hoạch) | `SK_ERP_SAP_ODOO` (Đất KCN Đã Đóng tiền Thuê đất 1 Lần, Đủ ĐTM & Trạm biến áp) | 24 | `5.33%` | **`4.24x`** |

---

## 5. Minh họa Khuyến nghị Lộ trình Nâng cấp Kỹ năng (Upskilling Priority Score - $UPS$)
- **Hồ sơ thử nghiệm:** `Junior Data Analyst` (`T3_JUNIOR` $\to$ mục tiêu `T4_MIDDLE_SENIOR`), 2 năm KN tại `TP.HCM` (`HYBRID`), kỹ năng hiện có: `Excel, SQL, Power BI`.
- **Dự báo phân phối lương hiện tại:** $P_{10} = 20.24$ | $P_{25} = 22.95$ | **Trung vị $P_{50} = 25.12 tr.VNĐ** | $P_{75} = 26.45$ | $P_{90} = 28.81 tr.VNĐ$.

| Hạng | Kỹ năng Khuyến nghị Học thêm | Tầng | Tăng lương Kỳ vọng $\widehat{\Delta W}_{\text{SHAP}}$ | Cầu ở Tầng T4 (%) | Hệ số Synergy | Độ khó (Giờ học) | Điểm Ưu tiên $UPS$ |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **#1** | `SK_ENGLISH_PROFESSIONAL` (Quỹ căn Người Nước ngoài (Foreign Quota 30%) & Khu Chuyên gia Expat Thuê Giá Cao) | `L4_MINDSET` | **`+0.57 tr.VNĐ`** | `56.2%` | `1.05x` | Lv.3 (70h) | **`1.009`** |
| **#2** | `SK_AGILE_SCRUM` (Quản lý Vận hành Chuẩn Quốc tế (Savills, CBRE, JLL, Marriott, Tokyu, Vinhomes Mgmt)) | `L4_MINDSET` | **`+0.25 tr.VNĐ`** | `39.6%` | `1.15x` | Lv.2 (40h) | **`0.932`** |
| **#3** | `SK_STATISTICAL_AB_TESTING` (Mật độ Xây dựng Thấp & Đảm bảo Slot Đỗ Ô tô (Low Density & Guaranteed Parking)) | `L3_DOMAIN` | **`+1.54 tr.VNĐ`** | `27.1%` | `1.0x` | Lv.2 (45h) | **`0.868`** |
| **#4** | `SK_DATA_MODELING_DWH` (Tâm điểm Lõi Tài chính CBD hoặc Khu Công nghệ cao / KCN FDI (CBD & Hi-Tech Proximity)) | `L3_DOMAIN` | **`+2.17 tr.VNĐ`** | `22.9%` | `1.24x` | Lv.3 (65h) | **`0.795`** |
| **#5** | `SK_SPARK_BIGDATA` (Cận kề Ga Metro (TOD), Vành đai 2-3-4 & Trục Đại lộ (Metro TOD & Ring-Road)) | `L3_DOMAIN` | **`+3.55 tr.VNĐ`** | `18.8%` | `1.01x` | Lv.4 (95h) | **`0.775`** |
