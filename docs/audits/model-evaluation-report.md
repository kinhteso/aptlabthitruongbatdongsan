# Báo cáo Kết quả Huấn luyện Kinh tế lượng (Mincer OLS & Heckman) + LightGBM Quantile + Giải thích SHAP

- **Thời gian huấn luyện:** `2026-11-02 15:54:14`
- **Nguồn dữ liệu:** Hybrid (4 bản ghi thực tế từ DB + 446 mẫu hiệu chỉnh thị trường VN)
- **Tổng quy mô mẫu ($N$):** `450` tin tuyển dụng (`301` tin công bố lương + `149` tin ẩn lương 'Thỏa thuận').

---

## 1. Kết quả Ước lượng Phương trình Tiền lương Mincer Mở rộng (OLS với Robust SE HC3)
- **Số quan sát có công bố lương ($N_{\text{OLS}}$):** `301`
- **Hệ số xác định ($R^2$ / Adjusted $R^2$):** `0.9884` / `0.9863`
- **Thống kê $F$ (HC3):** `576.51` | **AIC / BIC:** `-374.75` / `-200.52`

### Top Kỹ năng Số & Tổ hợp Cộng hưởng có Phần bù Tiền lương (Halvorsen-Palm Wage Premium) Cao nhất
| Mã Kỹ năng | Tên Kỹ năng / Cộng hưởng | Tầng | Hệ số $\hat{\gamma}_k$ | Robust SE | $p$-value | Phần bù Lương $\text{SWP}_k$ (%) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `SK_GENAI_LLM` | Khai thác Dòng tiền Cho thuê Cao (Rental Yield 5-8%/năm, Sẵn Hợp đồng Thuê / CHDV) | `L4_MINDSET` | `+0.1898`*** | `0.0206` | `0.0000` | **`+20.90%`** |
| `SK_SPARK_BIGDATA` | Cận kề Ga Metro (TOD), Vành đai 2-3-4 & Trục Đại lộ (Metro TOD & Ring-Road) | `L3_DOMAIN` | `+0.1804`*** | `0.0416` | `0.0000` | **`+19.77%`** |
| `SK_ERP_SAP_ODOO` | Đất KCN Đã Đóng tiền Thuê đất 1 Lần, Đủ ĐTM & Trạm biến áp | `L3_DOMAIN` | `+0.1494`*** | `0.0381` | `0.0001` | **`+16.11%`** |
| `SK_ML_DL_FRAMEWORKS` | Chủ đầu tư Hạng A Uy tín (Vinhomes, Masterise, Sun, Ecopark, Phú Mỹ Hưng, CapitaLand, Keppel) | `L4_MINDSET` | `+0.1381`*** | `0.0321` | `0.0000` | **`+14.81%`** |
| `SK_ENGLISH_PROFESSIONAL` | Quỹ căn Người Nước ngoài (Foreign Quota 30%) & Khu Chuyên gia Expat Thuê Giá Cao | `L4_MINDSET` | `+0.1289`*** | `0.0229` | `0.0000` | **`+13.76%`** |
| `SK_PYTHON` | Mặt tiền Rộng (>= 5m), Lô góc 2-3 Mặt thoáng & Nở hậu (Wide Frontage / Corner Lot) | `L2_TOOL` | `+0.1242`*** | `0.0297` | `0.0000` | **`+13.22%`** |
| `SK_AIRFLOW_DBT` | Hệ sinh thái All-in-One: TTTM, Bể bơi 4 mùa, Công viên & An ninh 24/7 (Compound Amenities) | `L3_DOMAIN` | `+0.1113`*** | `0.0304` | `0.0002` | **`+11.78%`** |
| `SK_ECOM_MERCHANDISING_PL` | Thiết kế Tối ưu Đa Căn hộ Khép kín (CHDV 10-35 Phòng, PCCC Đạt chuẩn) | `L3_DOMAIN` | `+0.1108`*** | `0.0388` | `0.0043` | **`+11.72%`** |
| `SK_API_INTEGRATION` | Kết nối Trực tiếp Quốc lộ, Cao tốc, Cảng biển & Container 40 Feet Ra vào | `L3_DOMAIN` | `+0.1099`** | `0.0536` | `0.0401` | **`+11.62%`** |
| `SK_FINTECH_CREDIT_RISK` | Đất Đấu giá Nhà nước: Pháp lý Tuyệt đối An toàn, Tự do Xây dựng | `L3_DOMAIN` | `+0.1096`*** | `0.0405` | `0.0068` | **`+11.59%`** |
| `SK_DATA_MODELING_DWH` | Tâm điểm Lõi Tài chính CBD hoặc Khu Công nghệ cao / KCN FDI (CBD & Hi-Tech Proximity) | `L3_DOMAIN` | `+0.1095`*** | `0.0235` | `0.0000` | **`+11.58%`** |
| `SK_CLOUD_PLATFORM` | BĐS Ven Sông, Giáp Hồ Tự nhiên & Công viên Lớn (Waterfront & Ecological Adjacency) | `L3_DOMAIN` | `+0.1014`*** | `0.0269` | `0.0002` | **`+10.67%`** |

### Kiểm định Đa cộng tuyến (VIF - Variance Inflation Factor)
| Biến giải thích | Chỉ số VIF | Đánh giá |
| :--- | :---: | :--- |
| `exp_years_mid` | `7.55` | MODERATE (5 <= VIF < 10) |
| `career_tier_num` | `9.17` | MODERATE (5 <= VIF < 10) |
| `FE_CITY_HCM` | `1.79` | OK (VIF < 5) |
| `FE_CITY_HN` | `1.78` | OK (VIF < 5) |
| `FE_WORK_REMOTE` | `1.01` | OK (VIF < 5) |
| `FE_PILLAR_DE01` | `1.5` | OK (VIF < 5) |
| `FE_PILLAR_DE04` | `1.56` | OK (VIF < 5) |
| `n_skills_L2` | `1.22` | OK (VIF < 5) |
| `n_skills_L3` | `1.48` | OK (VIF < 5) |
| `n_skills_L4` | `2.19` | OK (VIF < 5) |

---

## 2. Kiểm định & Hiệu chỉnh Chệch Chọn mẫu Heckman 2 Bước (Bài toán 'Lương Thỏa thuận')
- **Tỷ lệ tin ẩn lương ('Thỏa thuận'):** `33.11%` (`149/450` tin).
- **Hệ số Tỷ số Mills Nghịch đảo ($\hat{\beta}_\lambda$ - Inverse Mills Ratio):** `0.009` (Robust SE: `0.031`, $p$-value: `0.7708`).
- **Kết luận Kiểm định:** Hệ số Inverse Mills Ratio (lambda) không có ý nghĩa thống kê ở mức 5% (p >= 0.05): việc ẩn lương ('Thỏa thuận') không làm chệch đáng kể ước lượng phần bù kỹ năng của Mincer OLS.
- **Lương trung bình nhóm công bố:** `57.07 triệu VNĐ` | **Lương nội suy trung bình nhóm 'Thỏa thuận':** `57.22 triệu VNĐ`.

---

## 3. Hiệu năng Mô hình Học máy Phi tuyến & Hồi quy Phân vị ($P_{10} - P_{25} - P_{50} - P_{75} - P_{90}$)
- **Động cơ huấn luyện:** `Sklearn Hist/GBDT Quantile`
- **Độ chính xác trên tập Kiểm định (Out-of-sample Test):**
  - **$R^2$ Score:** `0.9196`
  - **MAE (Sai số tuyệt đối trung bình):** `7.95 triệu VNĐ/tháng`
  - **RMSE:** `18.32 triệu VNĐ/tháng` | **MAPE:** `16.11%`
  - **Độ phủ Khoảng tin cậy 80% ($\text{PICP}_{80\%}: P_{10} \to P_{90}$):** `78.69%` (Độ rộng trung bình: `30.56 triệu VNĐ`).

---

## 4. Định giá Kỹ năng theo Lý thuyết Trò chơi Shapley (SHAP) & Ma trận Cộng hưởng ($Lift$)

### 4.1. Giá trị Đóng góp Biên SHAP Trung bình của Kỹ năng Số (Đơn vị: Triệu VNĐ/tháng)
| Mã Kỹ năng | Tên Kỹ năng | Tầng | Tần suất Cầu (%) | $|\text{SHAP}|$ Trung bình | Phần bù SHAP Ròng (Triệu VNĐ/tháng) |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `SYN_SPARK_CLOUD` | SYN_SPARK_CLOUD | `SYNERGY` | `2.0%` | `1.011` | **`+2.22 tr.VNĐ`** |
| `SK_FINTECH_CREDIT_RISK` | Đất Đấu giá Nhà nước: Pháp lý Tuyệt đối An toàn, Tự do Xây dựng | `L3_DOMAIN` | `7.6%` | `0.979` | **`+1.67 tr.VNĐ`** |
| `SYN_BA_API_SQL` | SYN_BA_API_SQL | `SYNERGY` | `3.2%` | `1.003` | **`+1.48 tr.VNĐ`** |
| `SK_ENGLISH_PROFESSIONAL` | Quỹ căn Người Nước ngoài (Foreign Quota 30%) & Khu Chuyên gia Expat Thuê Giá Cao | `L4_MINDSET` | `26.4%` | `0.989` | **`+1.34 tr.VNĐ`** |
| `SK_AGILE_SCRUM` | Quản lý Vận hành Chuẩn Quốc tế (Savills, CBRE, JLL, Marriott, Tokyu, Vinhomes Mgmt) | `L4_MINDSET` | `27.6%` | `1.002` | **`+1.18 tr.VNĐ`** |
| `SK_API_INTEGRATION` | Kết nối Trực tiếp Quốc lộ, Cao tốc, Cảng biển & Container 40 Feet Ra vào | `L3_DOMAIN` | `5.6%` | `1.010` | **`+1.15 tr.VNĐ`** |
| `SK_POWERBI` | Full Nội thất Cao cấp Nhập khẩu / Thiết kế KTS (Luxury Fully Furnished) | `L2_TOOL` | `31.2%` | `1.009` | **`+0.99 tr.VNĐ`** |
| `SYN_SQL_POWERBI` | SYN_SQL_POWERBI | `SYNERGY` | `11.6%` | `0.834` | **`+0.80 tr.VNĐ`** |
| `SK_ROAS_CRO_FUNNEL` | Chủ thiện chí Bán gấp / Giá Chào Thấp hơn Thị trường 5-15% (Below-Market Deal) | `L4_MINDSET` | `11.6%` | `1.086` | **`+0.76 tr.VNĐ`** |
| `SK_PYTHON` | Mặt tiền Rộng (>= 5m), Lô góc 2-3 Mặt thoáng & Nở hậu (Wide Frontage / Corner Lot) | `L2_TOOL` | `22.0%` | `0.926` | **`+0.71 tr.VNĐ`** |
| `SK_AIRFLOW_DBT` | Hệ sinh thái All-in-One: TTTM, Bể bơi 4 mùa, Công viên & An ninh 24/7 (Compound Amenities) | `L3_DOMAIN` | `9.6%` | `1.002` | **`+0.70 tr.VNĐ`** |
| `SK_DOCKER_GIT_CICD` | Cụm Trường Quốc tế, Đại học Trọng điểm & Bệnh viện Tuyến đầu (Education & Healthcare Hub) | `L3_DOMAIN` | `7.2%` | `0.988` | **`+0.67 tr.VNĐ`** |

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
- **Dự báo phân phối lương hiện tại:** $P_{10} = 19.77$ | $P_{25} = 23.4$ | **Trung vị $P_{50} = 25.82 tr.VNĐ** | $P_{75} = 29.02$ | $P_{90} = 30.66 tr.VNĐ$.

| Hạng | Kỹ năng Khuyến nghị Học thêm | Tầng | Tăng lương Kỳ vọng $\widehat{\Delta W}_{\text{SHAP}}$ | Cầu ở Tầng T4 (%) | Hệ số Synergy | Độ khó (Giờ học) | Điểm Ưu tiên $UPS$ |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **#1** | `SK_ENGLISH_PROFESSIONAL` (Quỹ căn Người Nước ngoài (Foreign Quota 30%) & Khu Chuyên gia Expat Thuê Giá Cao) | `L4_MINDSET` | **`+1.07 tr.VNĐ`** | `58.7%` | `1.04x` | Lv.3 (70h) | **`1.144`** |
| **#2** | `SK_AGILE_SCRUM` (Quản lý Vận hành Chuẩn Quốc tế (Savills, CBRE, JLL, Marriott, Tokyu, Vinhomes Mgmt)) | `L4_MINDSET` | **`+0.0 tr.VNĐ`** | `41.3%` | `1.14x` | Lv.2 (40h) | **`0.899`** |
| **#3** | `SK_SPARK_BIGDATA` (Cận kề Ga Metro (TOD), Vành đai 2-3-4 & Trục Đại lộ (Metro TOD & Ring-Road)) | `L3_DOMAIN` | **`+3.81 tr.VNĐ`** | `19.6%` | `1.0x` | Lv.4 (95h) | **`0.822`** |
| **#4** | `SK_DATA_MODELING_DWH` (Tâm điểm Lõi Tài chính CBD hoặc Khu Công nghệ cao / KCN FDI (CBD & Hi-Tech Proximity)) | `L3_DOMAIN` | **`+2.16 tr.VNĐ`** | `23.9%` | `1.23x` | Lv.3 (65h) | **`0.808`** |
| **#5** | `SK_STATISTICAL_AB_TESTING` (Mật độ Xây dựng Thấp & Đảm bảo Slot Đỗ Ô tô (Low Density & Guaranteed Parking)) | `L3_DOMAIN` | **`+1.21 tr.VNĐ`** | `28.3%` | `1.0x` | Lv.2 (45h) | **`0.796`** |
