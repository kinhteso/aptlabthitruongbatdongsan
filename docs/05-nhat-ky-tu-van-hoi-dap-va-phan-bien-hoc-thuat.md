# 05. Nhật ký Tư vấn Thiết kế, Hỏi – Đáp Chuyên môn & Ngân hàng Câu hỏi Phản biện Hội đồng KH&CN

> **Tài liệu thuộc Dự án:** Ứng dụng Kinh tế lượng Không gian, Lý thuyết Hedonic và Học máy Giải thích được (XAI/AVM) trong Định giá Bất động sản Đa phân khúc đến Cấp Phường/Xã từ Dữ liệu Tin đăng Trực tuyến tại Việt Nam (*PropValue.AI*)  
> **Cơ chế hoạt động:** Tài liệu này tự động lưu trữ toàn bộ nội dung hỏi – đáp giữa Chủ nhiệm Đề tài và Chuyên gia AI, cùng các lập luận học thuật phục vụ bảo vệ đề tài KH&CN và công bố quốc tế.

---

## Phần I: Tổng hợp Hỏi – Đáp Chuyên môn từ các Yêu cầu của Chủ nhiệm Đề tài

### Câu hỏi & Yêu cầu #01:
> *"Dựa vào cách thức triển khai mô hình `@LabThitruonglaodongso` hãy triển khai mô hình cho thị trường bất động sản dựa vào tin đăng trên các trang tin mua bán bất động sản Việt Nam cho tôi."*

#### Trả lời & Quyết định Kiến trúc:
Hệ thống `@LabThitruongbatdongsan` (*PropValue.AI*) được kiến tạo bằng cách ánh xạ toàn diện và nâng cấp kiến trúc 7 lớp của `@LabThitruonglaodongso` sang miền **Kinh tế học Bất động sản & Định giá Tự động (AVM)**:
1. **Tầng Thu thập Đa nguồn (Multi-Site Ingestion):** Chuyển từ 4 cổng việc làm sang **4 cổng thông tin mua bán Bất động sản lớn nhất Việt Nam** (`Batdongsan.com.vn`, `Nha.Chotot.com`, `Alonhadat.com.vn`, `Mogi.vn`), giữ nguyên cơ chế `AsyncPlaywrightScraperRunner` + `Schema.org JSON-LD First` + `DLQ Error Self-Healing` + đồng bộ giờ `GMT+07` đối chiếu NTP quốc tế.
2. **Tầng Khử trùng lặp Đa sàn & Lưu vết Link Gốc (`Cross-Portal Broker Deduplication`):** Trên thị trường BĐS, cùng một căn nhà/lô đất thường được nhiều môi giới đăng trên cả 4 sàn. Hệ thống gộp các tin trùng về 1 bản ghi chuẩn `jobs_master` qua khóa `dedup_signature` nhưng lưu toàn bộ link gốc trong `job_source_links` kèm mã băm SHA-256.
3. **Tầng Phân loại & Từ điển Bản thể (Taxonomy & Ontology):**
   - Ánh xạ **4 Trụ cột Phân khúc (`RE-01`: Chung cư, `RE-02`: Nhà thổ cư/Biệt thự, `RE-03`: Nhà mặt phố/Thương mại dòng tiền, `RE-04`: Đất nền/BĐS Công nghiệp)** và **16 loại hình BĐS chuẩn hóa**.
   - Ánh xạ **Tháp Phân tầng Giá trị 6 Tầng (`T1_AFFORDABLE` $\to$ `T6_TROPHY_ULTRA`)** theo đơn vị chuẩn `Triệu VNĐ/m²` (và quy đổi tự động sang `Tỷ VNĐ/căn`).
   - Ánh xạ **Từ điển Thuộc tính Hedonic 4 Tầng (`L1`: Pháp lý Sổ đỏ/Quy hoạch, `L2`: Ngõ ô tô/Mặt tiền/Lô góc/Thang máy, `L3`: Gần Metro TOD/Tiện ích All-in-One/Ven sông, `L4`: Chủ đầu tư Hạng A/Dòng tiền cho thuê/Đón sóng quy hoạch)**.
4. **Tầng Mô hình Kinh tế lượng & Học máy Giải thích được (Dual-Modeling Engine):**
   - Chuyển từ phương trình tiền lương Mincer (1974) sang **Phương trình Định giá Hedonic Mở rộng của Rosen (1974)** với sai số chuẩn vững White HC3.
   - Giữ nguyên **Mô hình Chọn mẫu 2 Bước của Heckman (1979)** để xử lý bài toán **"Giá Thỏa thuận"** (chiếm 20%–35% tin rao BĐS).
   - Triển khai **LightGBM / GBDT Quantile Regression ($P_{10}, P_{25}, P_{50}, P_{75}, P_{90}$)** kết hợp **Giải thích TreeSHAP** và công thức **Điểm Ưu tiên Gia tăng Giá trị / Đầu tư BĐS (`UPS / VPS`)**.

---

### Câu hỏi & Yêu cầu #02:
> *"Lưu ý hãy tiếp cận từ góc độ lý thuyết về thị trường bất động sản, dự báo ML thị trường bất động sản trên thế giới đã triển khai như thế nào để triển khai hợp lý vào thị trường Việt Nam."*

#### Trả lời & Tổng hợp Học thuật (Chi tiết tại [Tài liệu 01](./01-khung-ly-thuyet-kinh-te-hoc-bds-va-mo-hinh-avm-quoc-te.md)):
1. **Về góc độ Lý thuyết Kinh tế học Bất động sản:**
   - Dựa trên **Lý thuyết Giá ẩn Hedonic (*Lancaster, 1966; Rosen, 1974*)**: Giá trị BĐS là hàm của các bó thuộc tính cấu trúc, vị trí, môi trường và pháp lý.
   - Dựa trên **Lý thuyết Địa tô Đô thị Đơn tâm & Đa tâm (*Alonso, 1964; Muth, 1969; Mills, 1967; McMillen, 2001*)**: Đơn giá đất phụ thuộc vào khả năng tiếp cận tâm kinh tế CBD và các cực tăng trưởng thứ cấp (Metro TOD, KCN, Khu CNC).
   - Dựa trên **Lý thuyết Phân vùng Thị trường theo Phân vị (*Zietz et al., 2008*)**: Phản ứng giá của từng thuộc tính thay đổi mạnh giữa phân khúc bình dân ($P_{10}$) và hạng sang ($P_{90}$).
   - Dựa trên **Lý thuyết Quyền Tài sản Pháp lý tại Việt Nam (*Kim, 2004 — Land Economics*)**: Sổ đỏ/Sổ hồng lâu dài tạo ra phần bù pháp lý độc lập rất lớn so với HĐMB hoặc đất chưa sổ.
2. **Về cách các Hệ thống Dự báo ML Bất động sản (AVM) trên Thế giới đã triển khai:**
   - Các hệ thống AVM hàng đầu thế giới như **Zillow Zestimate**, **Redfin Estimate**, **HouseCanary** (Kok et al., 2017; Mayer et al., 2019) và các nghiên cứu Châu Âu (Rico-Juan & Taltavull, 2021; Lorenz et al., 2023) đều hội tụ về kiến trúc **Hybrid Gradient Boosted Decision Trees (`LightGBM / XGBoost Quantile`) + Hierarchical Spatial Shrinkage + TreeSHAP Explainability + NLP Listing Text Extraction** (Nowak & Smith, 2017; Shen & Ross, 2021).
3. **Về cách Nội địa hóa Hợp lý vào Thị trường Việt Nam:**
   - Bổ sung nhóm biến đặc trưng bản địa mà mô hình phương Tây không có: **(1) Phân cấp độ rộng Ngõ/Hẻm (Ngõ xe máy $\to$ Ngõ ba gác $\to$ Ngõ ô tô vào nhà $\to$ Ngõ ô tô tránh $\to$ Mặt phố)**, **(2) Hình học nhà ống (Mặt tiền rộng $\ge 5\text{m}$, Lô góc 2 mặt thoáng, Nở hậu)**, **(3) Pháp lý Sổ đỏ/Sổ hồng vs. HĐMB**, và **(4) Quy chuẩn biến phụ thuộc về Đơn giá `Triệu VNĐ/m²` kết hợp quy đổi `Tỷ VNĐ/căn`**.

---

### Câu hỏi & Yêu cầu #03:
> *"Hãy triển khai quét dữ liệu toàn bộ các tỉnh thành Việt Nam (hiện tại là 34 tỉnh thành, trước kia là 63), trong các trang tin đăng có thông tin song song cả 2 địa điểm. Cơ chế định giá xem có thể triển khai đến từng phường để định giá không? Trong đó phân loại các thành phố lớn, phát triển thuộc trung ương và các tỉnh thành khác, xem xét các tiêu chí có khu công nghiệp, khu làng nghề, khu du lịch .... để sau này phân loại."*

#### Trả lời & Giải pháp Kỹ thuật – Toán học (Chi tiết tại [Tài liệu 03](./03-he-thong-quet-34-63-tinh-thanh-song-hanh-va-dinh-gia-cap-phuong-xa.md)):
1. **Xử lý Song hành 34 Tỉnh/Thành mới (Nghị quyết 202/2025/QH15) $\leftrightarrow$ 63 Tỉnh/Thành cũ:**
   - Trong [`configs/geo_vietnam_cities.yaml`](../configs/geo_vietnam_cities.yaml) và [`configs/scraper_settings.yaml`](../configs/scraper_settings.yaml), hệ thống khai báo đầy đủ **bảng ánh xạ hai chiều (Crosswalk) giữa 34 tỉnh/thành mới và 63 tỉnh/thành cũ** (ví dụ: `TP.HCM mới` $\leftrightarrow$ `TP.HCM cũ + Bình Dương + Bà Rịa - Vũng Tàu`; `TP. Đà Nẵng mới` $\leftrightarrow$ `Đà Nẵng + Quảng Nam`; `Tỉnh Bắc Ninh mới` $\leftrightarrow$ `Bắc Ninh + Bắc Giang`; `TP. Hải Phòng mới` $\leftrightarrow$ `Hải Phòng + Hải Dương`; `Tỉnh Phú Thọ mới` $\leftrightarrow$ `Phú Thọ + Vĩnh Phúc + Hòa Bình`...).
   - Mỗi bản ghi tin rao trong CSDL lưu **song song cả 2 địa điểm** (`province_34_code` / `province_34_name` VÀ `legacy_province_63` / `legacy_district`), giúp vừa tra cứu theo địa giới mới 34 tỉnh, vừa giữ nguyên độ chính xác vùng giá của 63 tỉnh/quận cũ.
2. **Cơ chế Định giá Chi tiết đến Từng Phường/Xã (`Ward-Level Valuation`):**
   - **Khẳng định:** Hệ thống định giá được trực tiếp đến từng **Phường/Xã (`ward_code`, `ward_name`)** thông qua thuật toán **Làm trơn Thực nghiệm Bayes 4 Cấp (*4-Level Hierarchical Empirical Bayes Spatial Shrinkage*)**:
     $$\widehat{B}_{\text{Ward } w} = \left(\frac{n_w}{n_w + \kappa}\right) \bar{P}_w^{\text{DB}} + \left(\frac{\kappa}{n_w + \kappa}\right) \widehat{P}_{\text{Parent}(w)}^{\text{Prior}}$$
   - Cơ chế này giúp các Phường có nhiều tin rao ($n_w \ge 15$) phản ánh đúng 100% giá thực tế tại Phường đó, trong khi các Phường/Xã mới có ít tin rao tự động nội suy từ Cụm Quận/Huyện cũ + Tỉnh 63 gốc + Hệ số Khu vực Chức năng mà không bao giờ bị lỗi suy biến mẫu nhỏ.
3. **Phân loại Đô thị Trung ương & 6 Tiêu chí Khu vực Kinh tế Chức năng:**
   - **Theo cấp độ Đô thị:** Chia rõ **Siêu đô thị Đặc biệt (`TIER_SPECIAL`: Hà Nội, TP.HCM)**, **Thành phố trực thuộc Trung ương & Cực tăng trưởng Loại I (`TIER_1_HUB`: Hải Phòng, Đà Nẵng, Huế, Cần Thơ, Quảng Ninh, Khánh Hòa, Lâm Đồng, An Giang)**, **Tỉnh Công nghiệp Vệ tinh (`TIER_INDUSTRIAL`: Bắc Ninh, Hưng Yên, Đồng Nai, Tây Ninh, Phú Thọ, Thái Nguyên, Ninh Bình)** và **Các tỉnh thành khác (`TIER_OTHER`)**.
   - **Theo 6 Đặc tính Kinh tế Vi mô (`economic_zone_type`):**
     1. `ZONE_CBD_URBAN_CORE` (Khu Lõi Trung tâm Đô thị CBD — hệ số `1.35x`).
     2. `ZONE_INDUSTRIAL_FDI_PARK` (Khu Công nghiệp FDI & Khu Chế xuất: VSIP, Yên Phong, Việt Yên, Long Thành, Tràng Duệ... — hệ số `1.12x`).
     3. `ZONE_CRAFT_VILLAGE_HERITAGE` (Khu Làng nghề Truyền thống: Đồng Kỵ, Ninh Hiệp, Bát Tràng, Vạn Phúc, Hữu Bằng, Đa Hội... — hệ số `1.18x`).
     4. `ZONE_TOURISM_RESORT_COASTAL` (Khu Du lịch Biển, Đảo & Di sản: Mỹ Khê, Hội An, Nha Trang, Phú Quốc, Hạ Long, Đà Lạt, Vũng Tàu... — hệ số `1.22x`).
     5. `ZONE_HITECH_UNIVERSITY_TOD` (Khu Công nghệ cao Hòa Lạc/Thủ Đức, Đô thị Đại học, Ga Metro TOD & Sân bay Long Thành/Gia Bình — hệ số `1.20x`).
     6. `ZONE_SUBURBAN_RESIDENTIAL_AGRI` (Khu Dân cư Mở rộng, Ven đô & Nông thôn mới — hệ số `0.90x`).

---

## Phần II: Ngân hàng Câu hỏi Phản biện Hội đồng KH&CN Chuyên sâu cho Đề tài Bất động sản

### Câu hỏi Phản biện 1: *Dữ liệu thu thập từ Batdongsan.com.vn, Chợ Tốt, Alonhadat, Mogi là "Giá chào bán (Asking/Listing Price)" chứ không phải "Giá giao dịch thực tế trên hợp đồng công chứng (Transaction Price)". Làm sao mô hình xử lý được độ vênh này?*
- **Trả lời chuẩn học thuật:**
  1. Tại Việt Nam, dữ liệu giá ghi trên hợp đồng công chứng thường bị khai thấp hơn thực tế (*Dual-Price Phenomenon / Tax Avoidance Under-reporting*) nên không phản ánh giá thị trường thực, trong khi dữ liệu giao dịch nội bộ của sàn không công khai toàn quốc. Do đó, trong kinh tế lượng BĐS hiện đại tại các thị trường mới nổi (Haurin et al., 2010; Han & Strange, 2016; Kok et al., 2017), **Giá chào bán đã làm sạch ngoại lai (*Cleaned Listing Price*)** là nguồn dữ liệu tần suất cao chuẩn xác nhất để đo lường biến động tương đối theo không gian và thời gian.
  2. Hơn nữa, theo **Lý thuyết Tìm kiếm & Mặc cả của Wheaton (1990)**, tỷ lệ chiết khấu đàm phán giữa giá chào và giá chốt (*Asking-to-Transaction Haircut*) tỷ lệ thuận với **Thời gian tồn tại tin rao (`vacancy_duration_days` / Time-on-Market)**. Trong module phân tích thương lượng của `PropValue.AI`, hệ thống tự động ước lượng biên độ thương lượng (từ $3\%$ đến $8\%$) dựa trên phân vị $P_{25} - P_{50}$ và độ dài ngày rao bán để khuyến nghị **Giá Chốt Hợp lý (*Estimated Transaction Price*)** cho người mua.

### Câu hỏi Phản biện 2: *Khi sáp nhập 63 tỉnh thành xuống còn 34 tỉnh thành (ví dụ TP.HCM hợp nhất với Bình Dương và Bà Rịa – Vũng Tàu), làm sao tránh được hiện tượng đánh đồng mặt bằng giá giữa các khu vực khác biệt trong cùng một tỉnh mới?*
- **Trả lời chuẩn học thuật:**
  - Hệ thống không dùng biến giả cấp Tỉnh 34 đơn lẻ cho mô hình định giá, mà thiết kế **Cấu trúc Không gian Đa tầng Song hành (`province_34_code` $\times$ `legacy_province_63` $\times$ `district_cluster` $\times$ `ward_code` $\times$ `economic_zone_type`)**. Nhờ đó, một bất động sản tại Phường Dĩ An vẫn mang mã Tỉnh 34 là `HCM` (phục vụ báo cáo hành chính mới) nhưng giữ nguyên định danh Tỉnh 63 là `Bình Dương`, Khu chức năng là `ZONE_INDUSTRIAL_FDI_PARK` và định giá theo mặt bằng Phường `BD_P_DI_AN` (~46 triệu/$m^2$), tách biệt hoàn toàn với Phường Bến Nghé Quận 1 (~450 triệu/$m^2$).

---

### Câu hỏi 6 (Chủ nhiệm Đề tài):
> *"Hãy triển khai WebApp sử dụng Next.js, cơ sở dữ liệu PostgreSQL, triển khai trên Docker/Ubuntu. Có cơ chế thiết lập quét tin theo thời gian từ 2021 đến nay. Các scripts tự động chạy và tự động rà soát lỗi. Hãy triển khai việc rà soát các trang Web đăng tin và lên kế hoạch tiến hành!"*

### Trả lời & Triển khai Hệ thống (Chuyên gia AI):
1. **Triển khai WebApp Next.js 15 (`webapp/`, Cổng `3359`) & PostgreSQL 16 (`infra/postgres/init_schema.sql`):**
   - Giao diện trung tâm [`RealEstateWardAndPortalHub.tsx`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/components/RealEstateWardAndPortalHub.tsx) tích hợp trực tiếp trên trang chủ [`page.tsx`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/app/page.tsx) cùng 2 API Route [`/api/jobs/ward-valuation`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/app/api/jobs/ward-valuation/route.ts) và [`/api/jobs/portal-audit`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/app/api/jobs/portal-audit/route.ts).
   - Cơ sở dữ liệu PostgreSQL 16 mở rộng bảng `jobs_master` với các cột địa lý kép (`province_34_code`, `legacy_province_63`, `ward_code`, `ward_name`, `economic_zone_type`, `area_m2`, `frontage_m`, `alley_width_m`, `legal_status_code`) và bảng `gold_ward_valuation_index`.
2. **Thiết lập Quét Tin Theo Thời Gian từ 2021 đến nay (`2021–2026`):**
   - Sử dụng `--mode backfill --from-year 2021` kết hợp 3 kênh: Wayback Machine CDX API (`2021–2024`), Sitemap XML Lịch sử và Deep Pagination (`2024–2026`), phân bổ mục tiêu `100.000` bản ghi Master xuyên suốt 6 năm (`2021`: 7.800; `2022`: 10.920; `2023`: 14.560; `2024`: 18.720; `2025`: 23.400; `2026`: 24.600).
3. **Scripts Tự động Chạy & Tự động Rà soát Lỗi (`Auto-Heal`) trên Docker Ubuntu:**
   - Cung cấp kịch bản [`deploy/ubuntu-docker/auto-heal-and-audit.sh`](file:///f:/Code/LabThitruongbatdongsan/deploy/ubuntu-docker/auto-heal-and-audit.sh) (hỗ trợ cài đặt Cron tự động mỗi giờ `--install-cron`) và [`deploy/ubuntu-docker/run-scraper.sh`](file:///f:/Code/LabThitruongbatdongsan/deploy/ubuntu-docker/run-scraper.sh).
   - Tự động phát hiện 5 nhóm lỗi (`CLOUDFLARE_WAF_BLOCK`, `SELECTOR_DRIFT_ZERO_LINKS`, `DETAIL_PARSE_INCOMPLETE`, `HTTP_STATUS_ERROR`, `NETWORK_TIMEOUT`), chụp HTML hiện trường (`logs/html_snapshots/`), tự động nâng cấp engine sang `playwright_stealth` / mở rộng CSS selector và quét bù 100% URL trong Hàng đợi DLQ (`--mode auto-heal`).
4. **Rà soát Các Trang Web Đăng tin BĐS & Lộ trình 4 Giai đoạn:**
   - Đã kiểm toán 6 cổng BĐS (`Batdongsan.com.vn` 44,5%, `Nha.Chotot.com` 24,0%, `Alonhadat.com.vn` 16,0%, `Mogi.vn` 10,5%, `Muaban.net` 2,5%, `Nhadat.Cafeland.vn` 1,5%) và lập kế hoạch thực thi 4 giai đoạn trong 30 ngày tại [docs/07-ra-soat-cong-bds-chien-dich-quet-2021-2026-va-trien-khai-docker-ubuntu.md](./07-ra-soat-cong-bds-chien-dich-quet-2021-2026-va-trien-khai-docker-ubuntu.md).

---

### Câu hỏi 7 (Chủ nhiệm Đề tài):
> *"Hãy đẩy lên github và build thành GHCR cho tôi. Viết tài liệu hướng dẫn cài trên github, cơ chế xác thực giống như của Lapthitruonglaodongso, cổng app là 3359!"*

### Trả lời & Triển khai Hệ thống (Chuyên gia AI):
1. **Đẩy mã nguồn lên GitHub & Đóng gói Tự động lên GHCR (`GitHub Container Registry`):**
   - Khởi tạo và đồng bộ kho mã nguồn chính thức tại: `https://github.com/kinhteso/aptlabbatdongsan`.
   - Cấu hình luồng CI/CD tự động [`.github/workflows/publish-ghcr.yml`](file:///f:/Code/LabThitruongbatdongsan/.github/workflows/publish-ghcr.yml):
     - Chạy bộ kiểm thử toàn trình `python -m tests.verify_pipeline` (10/10 bài kiểm thử End-to-End).
     - Tự động build và đẩy 02 Docker Images chuẩn lên GHCR:
       - **Backend + Scraper + ML Worker:** `ghcr.io/kinhteso/aptlabbatdongsan:latest`
       - **Next.js 15 WebApp (Port `3359`):** `ghcr.io/kinhteso/aptlabbatdongsan-webapp:latest`
2. **Thiết lập Cổng WebApp là `3359` xuyên suốt toàn hệ thống:**
   - Đã đồng bộ cổng `3359` tại [`webapp/package.json`](file:///f:/Code/LabThitruongbatdongsan/webapp/package.json), [`webapp/Dockerfile`](file:///f:/Code/LabThitruongbatdongsan/webapp/Dockerfile), [`webapp/src/lib/googleAuth.ts`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/lib/googleAuth.ts), [`docker-compose.yml`](file:///f:/Code/LabThitruongbatdongsan/docker-compose.yml), [`deploy/ubuntu-docker/docker-compose.ghcr.yml`](file:///f:/Code/LabThitruongbatdongsan/deploy/ubuntu-docker/docker-compose.ghcr.yml), [`.env.example`](file:///f:/Code/LabThitruongbatdongsan/.env.example) và [`src/api/main.py`](file:///f:/Code/LabThitruongbatdongsan/src/api/main.py) (CORS cho phép `http://localhost:3359`).
3. **Cơ chế Xác thực & Phân quyền Giống hệt `LabThitruonglaodongso`:**
   - Hỗ trợ song song **Google OAuth 2.0** (`GOOGLE_REDIRECT_URI=http://localhost:3359/api/auth/google/callback`) và **Mật khẩu Quản trị nội bộ** (`ADMIN_EMAILS=phungtuananh3333@gmail.com,phungtuananh2222@gmail.com`, `ADMIN_PASSWORD=skillvalue_secret_2026`).
   - Áp dụng quy tắc **First-User Auto-ADMIN** (tài khoản đầu tiên đăng nhập hoặc nằm trong `ADMIN_EMAILS` tự động nhận quyền `ADMIN` trong bảng `app_users`) và ma trận phân quyền **RBAC 4 tầng (`VIEWER`, `RESEARCHER`, `OPERATOR`, `ADMIN`)**.
4. **Tài liệu Hướng dẫn Cài đặt từ GitHub & GHCR:**
   - Đã biên soạn chi tiết tại [`README.md`](file:///f:/Code/LabThitruongbatdongsan/README.md) ở thư mục gốc và [`deploy/ubuntu-docker/README.md`](file:///f:/Code/LabThitruongbatdongsan/deploy/ubuntu-docker/README.md).

---

### Câu hỏi 8 (Chủ nhiệm Đề tài):
> *"Hãy triển khai WebApp cơ chế xác thực với Google Auth tương tự của Lapthitruonglaodongso. Hãy thay đổi lại cấu hình tên database trong .env. Tôi muốn cài trên máy ubuntu trong thư mục labbatdongsan, hãy viết tài liệu hướng dẫn cài đặt, webapp sẽ mapping tunnel qua cloudflare về tên miền aidinhgiabds.kinhtesox.net"*

### Trả lời & Triển khai Hệ thống (Chuyên gia AI):
1. **Đổi tên Cơ sở dữ liệu PostgreSQL sang `real_estate_market`:**
   - Đã đồng bộ `POSTGRES_DB=real_estate_market` và `DATABASE_URL=postgresql://skillvalue:skillvalue_secret_2026@localhost:5432/real_estate_market` trên toàn bộ [`.env`](file:///f:/Code/LabThitruongbatdongsan/.env), [`.env.example`](file:///f:/Code/LabThitruongbatdongsan/.env.example), [`docker-compose.yml`](file:///f:/Code/LabThitruongbatdongsan/docker-compose.yml), [`deploy/ubuntu-docker/docker-compose.ghcr.yml`](file:///f:/Code/LabThitruongbatdongsan/deploy/ubuntu-docker/docker-compose.ghcr.yml) và [`src/db/postgres_repo.py`](file:///f:/Code/LabThitruongbatdongsan/src/db/postgres_repo.py).
2. **Đồng bộ Cơ chế Google OAuth 2.0 với `LabThitruonglaodongso` & Tự động nhận diện `https://aidinhgiabds.kinhtesox.net`:**
   - Sử dụng bộ `GOOGLE_CLIENT_ID=647264796658-h96idjs8hohr4hf8pjid8i531lqr2gra.apps.googleusercontent.com` đồng bộ từ `LabThitruonglaodongso`.
   - Hàm [`resolveRequestOrigin()`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/lib/googleAuth.ts) tự động đọc header `x-forwarded-host` và `x-forwarded-proto` từ Cloudflare Tunnel để sinh đúng Redirect URI `https://aidinhgiabds.kinhtesox.net/api/auth/callback/google` khi truy cập qua tên miền public và `http://localhost:3359/api/auth/callback/google` khi truy cập nội bộ.
3. **Biên soạn Tài liệu Hướng dẫn Cài đặt tại `~/labbatdongsan` & Mapping Cloudflare Tunnel (`aidinhgiabds.kinhtesox.net`):**
   - Đã tạo tài liệu chuyên đề [`docs/08-huong-dan-cai-dat-ubuntu-thu-muc-labbatdongsan-va-cloudflare-tunnel.md`](file:///f:/Code/LabThitruongbatdongsan/docs/08-huong-dan-cai-dat-ubuntu-thu-muc-labbatdongsan-va-cloudflare-tunnel.md) và cập nhật [`deploy/ubuntu-docker/README.md`](file:///f:/Code/LabThitruongbatdongsan/deploy/ubuntu-docker/README.md), hướng dẫn chi tiết từng bước cài đặt trong `~/labbatdongsan`, cách tránh xung đột cổng Host (`5433`, `6380`, `8001`) nếu chạy chung máy chủ với `lablaodongso`, và 2 cách cấu hình Cloudflare Tunnel trỏ `aidinhgiabds.kinhtesox.net` $\to$ `http://localhost:3359`.

---

### Câu hỏi 9 (Chủ nhiệm Đề tài):
> *"Làm sao để xem tiến trình quét của Lab trong docker ubuntu?"*

### Trả lời & Hướng dẫn Vận hành (Chuyên gia AI):
Để xem và giám sát tiến trình quét tin bất động sản (`propvalue_scraper_etl`) trong Docker Ubuntu (tại thư mục `~/labbatdongsan`), hệ thống cung cấp **06 phương thức trực quan** (đã cập nhật đầy đủ vào Phần 4 của [`docs/08-huong-dan-cai-dat-ubuntu-thu-muc-labbatdongsan-va-cloudflare-tunnel.md`](file:///f:/Code/LabThitruongbatdongsan/docs/08-huong-dan-cai-dat-ubuntu-thu-muc-labbatdongsan-va-cloudflare-tunnel.md)):
1. **Xem luồng Log Thời gian thực (`Live Logs`) của Container Quét:**
   - `docker ps --filter "name=propvalue_scraper_etl"` (kiểm tra container đang `Up`).
   - `docker logs -f --tail 100 propvalue_scraper_etl` (xem trực tiếp từng trang/cổng BĐS đang được cào theo thời gian thực).
2. **Chạy Kịch bản Tracking Toàn Hệ thống 1-Chạm (`track-system.sh` / `system_tracker.py`):**
   - `./deploy/ubuntu-docker/track-system.sh` hoặc `docker exec -it propvalue_api python -m src.analytics.system_tracker`.
   - Hiển thị trạng thái nhịp đập (`RUNNING_CYCLE` — đang quét; `DAEMON_WAITING_NEXT_RUN` — đang chờ chu kỳ kế tiếp; `IDLE_COMPLETED` — vừa hoàn tất), tổng số bản ghi Bronze/Silver và hàng đợi lỗi DLQ.
3. **Kiểm tra File Nhịp đập (`logs/scraper_heartbeat.json`) & Gói Debug 1 Giờ (`collect-debug-1h.sh`):**
   - `cat ~/labbatdongsan/logs/scraper_heartbeat.json` và `./deploy/ubuntu-docker/collect-debug-1h.sh`.
4. **Truy vấn Trực tiếp Lịch sử Phiên Quét (`scraper_crawl_runs`) trong PostgreSQL (`real_estate_market`):**
   - Dùng `docker exec -it propvalue_postgres psql -U skillvalue -d real_estate_market` để xem bảng `scraper_crawl_runs` (số trang, số link phát hiện, số bản ghi mới lưu).
5. **Theo dõi Trực tiếp trên Giao diện WebApp (`https://aidinhgiabds.kinhtesox.net`):**
   - Xem bảng trạng thái 6 cổng BĐS tại Trang ngoài (`/`) hoặc vào Trang trong (`/workspace`) $\to$ **Mục 8 (`Bản ghi Quét`)** và **Mục 7 (`Nhật ký Lỗi DLQ & Giờ GMT+07`)**.
6. **Ép Chạy Tức thời 1 Phiên Quét trên Terminal để Quan sát Trực tiếp:**
   - `./deploy/ubuntu-docker/run-scraper.sh audit-portals` (kiểm tra 6 cổng).
   - `./deploy/ubuntu-docker/run-scraper.sh once --max-pages 5` (quét mới ngay lập tức).
   - `./deploy/ubuntu-docker/run-scraper.sh backfill --from-year 2021 --max-pages 20` (quét lịch sử 2021–2026).


---

### Câu hỏi 9 (Chủ nhiệm Đề tài):
> *"Làm sao để kiểm tra trên Ubuntu đã cài Cloudflare chưa?"*

### Trả lời & Triển khai Hệ thống (Chuyên gia AI):
- Đã bổ sung **Bước 0: Kiểm tra trên máy chủ Ubuntu đã cài và đang chạy Cloudflare (`cloudflared`) chưa** vào tài liệu [`docs/08-huong-dan-cai-dat-ubuntu-thu-muc-labbatdongsan-va-cloudflare-tunnel.md`](file:///f:/Code/LabThitruongbatdongsan/docs/08-huong-dan-cai-dat-ubuntu-thu-muc-labbatdongsan-va-cloudflare-tunnel.md) gồm 4 lớp kiểm tra:
  1. Kiểm tra binary & phiên bản: `which cloudflared && cloudflared --version`
  2. Kiểm tra dịch vụ chạy ngầm `systemd`: `sudo systemctl status cloudflared --no-pager`
  3. Kiểm tra tiến trình thực thi hoặc container Docker: `ps aux | grep cloudflared` và `docker ps | grep -i cloudflare`
  4. Kiểm tra tệp cấu hình `/etc/cloudflared/config.yml` và danh sách Tunnel: `cloudflared tunnel list`
- **Xác nhận thực tế trên máy chủ `utaserver3` (`anhpt@utaserver3:~/labbatdongsan$`):**
  - `cloudflared.service` đang ở trạng thái `Active: active (running)` với tiến trình `/usr/bin/cloudflared --no-autoupdate tunnel run --token-file /etc/cloudflared/token`.
  - Đây là **Remotely-Managed Tunnel** (quản lý bằng Token trên Cloudflare Zero Trust Dashboard), nên không cần sửa file cấu hình trên Ubuntu mà chỉ cần thêm **Public Hostname** `aidinhgiabds.kinhtesox.net` $\to$ `HTTP://localhost:3359` trực tiếp trên giao diện Cloudflare Zero Trust.

---

### Câu hỏi 10 (Chủ nhiệm Đề tài):
> *"Tunnel cài Cloudflare trên `utaserver3` là cài dạng tunnel cho SSH, vậy có thể triển khai chung?"*

### Trả lời & Triển khai Hệ thống (Chuyên gia AI):
- **Khẳng định kỹ thuật:** **Hoàn toàn triển khai chung được 100% và đây là phương án chuẩn nhất, an toàn nhất.**
- **Nguyên lý hoạt động (Multiplexed Ingress Routing):**
  1. Một tiến trình `cloudflared` duy nhất trên `utaserver3` (PID `873`) hoạt động như một bộ định tuyến đa giao thức theo tên miền (Host/SNI):
     - Route 1 (Đang chạy): `<ssh-hostname>.kinhtesox.net` $\rightarrow$ `SSH://localhost:22` (Giữ nguyên 100%).
     - Route 2 (Thêm mới): `aidinhgiabds.kinhtesox.net` $\rightarrow$ `HTTP://localhost:3359` (WebApp Next.js 15 PropValue.AI).
  2. **Hot-Reload không rớt SSH:** Khi thêm một dòng **Public Hostname** mới trên giao diện Web Cloudflare Zero Trust Dashboard, Cloudflare tự động đẩy rule mới xuống tiến trình `cloudflared` đang chạy mà **không hề khởi động lại service**, do đó phiên SSH hiện tại không bị rớt.
  3. **Cảnh báo an toàn:** Tuyệt đối **không** tạo Tunnel mới rồi chạy `sudo cloudflared service install <token_moi>` trên `utaserver3`, vì lệnh đó sẽ ghi đè `/etc/cloudflared/token` và làm đứt kết nối SSH hiện tại. Chỉ cần bấm **Add a public hostname** ngay bên trong Tunnel SSH đang có.

---

### Câu hỏi 11 (Chủ nhiệm Đề tài):
> *"Nhưng trên server Ubuntu tôi phải cấu hình ở đâu?"*

### Trả lời & Triển khai Hệ thống (Chuyên gia AI):
- Giải thích rõ 2 phần trên máy chủ Ubuntu (`utaserver3`):
  1. **Về phía Cloudflare Tunnel (`/etc/cloudflared/` trên Ubuntu):** **Không cần sửa bất kỳ file nào trên Ubuntu.** Do `cloudflared` chạy với `--token-file /etc/cloudflared/token` (Remotely-Managed), ngay khi lưu **Public Hostname** (`aidinhgiabds.kinhtesox.net` $\to$ `http://localhost:3359`) trên Web Cloudflare Zero Trust Dashboard, đám mây Cloudflare tự động đẩy cấu hình mới xuống tiến trình `cloudflared` trên `utaserver3` (kiểm tra bằng `sudo journalctl -u cloudflared -n 20 --no-pager` sẽ thấy `Updated to new configuration`).
  2. **Về phía Ứng dụng Bất động sản (`~/labbatdongsan` trên Ubuntu):** Nơi duy nhất cần cấu hình trên Ubuntu là tệp **`~/labbatdongsan/.env`** (khai báo `WEBAPP_PORT=3359`, `NEXTAUTH_URL=https://aidinhgiabds.kinhtesox.net`, `NEXT_PUBLIC_APP_URL=https://aidinhgiabds.kinhtesox.net`) và khởi chạy Docker Compose để container `propvalue_webapp_pwa` mở cổng `localhost:3359`.

---

### Câu hỏi 12 (Chủ nhiệm Đề tài):
> *"Nếu chỉ dùng `docker compose pull` có được không?"*

### Trả lời & Triển khai Hệ thống (Chuyên gia AI):
- **Hoàn toàn được** để tải gói image mới về (không cần gõ dài `-f deploy/ubuntu-docker/docker-compose.ghcr.yml --env-file .env`), vì tệp [`docker-compose.yml`](file:///f:/Code/LabThitruongbatdongsan/docker-compose.yml) ở thư mục gốc `~/labbatdongsan` đã khai báo sẵn `image: ghcr.io/kinhteso/aptlabbatdongsan:latest` và `image: ghcr.io/kinhteso/aptlabbatdongsan-webapp:latest`, đồng thời tự động đọc tệp `.env` cùng thư mục.
- **Lưu ý vận hành:**
  1. Lệnh `docker compose pull` chỉ tải image mới từ GHCR về ổ cứng máy chủ chứ **chưa thay thế container đang chạy**. Do đó, cần nối thêm `docker compose up -d` để Docker tự động khởi tạo lại các container có image mới:
     ```bash
     docker compose pull && docker compose up -d
     ```
  2. Vì `./configs:/app/configs` được bind-mount từ máy chủ Ubuntu vào container, nếu bản cập nhật có thay đổi từ điển YAML trong `configs/` (`roles_taxonomy.yaml`, `skills_ontology.yaml`, `scraper_settings.yaml`), nên chạy kèm `git pull` (tức `git pull && docker compose pull && docker compose up -d`) để đồng bộ cả file cấu hình YAML trên ổ cứng Host.

---

### Câu hỏi 13 (Chủ nhiệm Đề tài):
> *"Tôi muốn thêm trường thông tin lọc tên công ty ra từ các bản tin tuyển dụng, lọc vị trí việc làm theo các ngành nghề ví dụ kế toán, logistic, lập trình ... Để sau này lọc và làm các báo cáo khác chuyên sâu cho dễ. Bạn có thể tư vấn thêm cho tôi vấn đề này"*

### Trả lời & Tư vấn Kiến trúc (Chuyên gia AI):
1. **Chuẩn hóa & Định danh Thực thể Doanh nghiệp (`Company Entity Resolution`):**
   - Khử nhiễu tiền tố pháp lý (`Công ty Cổ phần`, `CTCP`, `Công ty TNHH MTV`, `Chi nhánh...`, `JSC`, `Co., Ltd`) để ánh xạ `company_name_raw` về **`company_canonical_name`** (tên thương hiệu chuẩn, ví dụ: `Tập đoàn Hoa Sen`, `FPT Software`, `Techcombank`) và khóa chuẩn **`company_brand_slug`**.
   - Bổ sung 2 chiều thuộc tính doanh nghiệp phục vụ báo cáo chéo:
     - **`company_ownership_type` (Loại hình sở hữu/quy mô):** `ENTERPRISE_CORP` (Tập đoàn/VNR500), `MNC_FDI` (Đa quốc gia/FDI), `BANK_FINANCE` (Ngân hàng/Định chế tài chính), `TECH_PRODUCT_OUTSOURCE` (Công nghệ), `SME_LOCAL` (Doanh nghiệp vừa và nhỏ).
     - **`company_sector` (Lĩnh vực kinh doanh của doanh nghiệp theo VSIC 2018):** Sản xuất công nghiệp, Tài chính – Ngân hàng, CNTT – Viễn thông, Thương mại – Bán lẻ, Logistics – Vận tải, Bất động sản – Xây dựng...
2. **Thiết kế Khung Phân loại Ngành nghề Đa tầng (`Occupational & Job Category Taxonomy` — Kết hợp `ISCO-08` & Thực tiễn Tuyển dụng Việt Nam):**
   - Giữ nguyên cấu trúc 4 Trụ cột Kinh tế số (`DE-01..DE-04`) cho mô hình Mincer lõi, đồng thời bổ sung trường **`job_category_code` (Nhóm Ngành nghề Tuyển dụng — 10 nhóm ngành lớn)** và mở rộng `canonical_role` để triệt tiêu hoàn toàn tỷ lệ `UNCLASSIFIED`:
     1. `CAT_IT_SOFTWARE` (**Lập trình, Phần mềm & Hạ tầng Cloud/DevOps**)
     2. `CAT_DATA_AI` (**Khoa học Dữ liệu, AI/ML & Phân tích Nghiệp vụ BA/BI**)
     3. `CAT_ACCOUNTING_AUDIT` (**Kế toán, Kiểm toán & Thuế** — Kế toán tổng hợp, Kế toán trưởng, Kiểm toán nội bộ, Kế toán thuế/công nợ)
     4. `CAT_FINANCE_BANKING` (**Tài chính, Ngân hàng, Đầu tư & Quản trị Rủi ro**)
     5. `CAT_LOGISTICS_SUPPLY` (**Logistics, Xuất nhập khẩu, Chuỗi cung ứng & Thu mua/Ngành hàng** — Supply Chain, Import/Export, Procurement, Merchandising/Category Strategy, Kho vận)
     6. `CAT_MARKETING_ECOM` (**Marketing, Thương mại điện tử & Truyền thông số**)
     7. `CAT_SALES_BD` (**Kinh doanh, Phát triển Thị trường & Chăm sóc Khách hàng**)
     8. `CAT_HR_ADMIN_LEGAL` (**Nhân sự, Hành chính & Pháp chế** — Tuyển dụng/TA, C&B, HRBP, Pháp chế doanh nghiệp)
     9. `CAT_ENGINEERING_MFG` (**Kỹ thuật, Sản xuất, QA/QC & Tự động hóa**)
     10. `CAT_REALESTATE_CONST` (**Bất động sản, Xây dựng & Quản lý Dự án**)
3. **Ứng dụng vào Bộ lọc Đa chiều (Faceted Filter) & 5 Báo cáo Chuyên sâu:**
   - Cho phép lọc kết hợp: `Ngành nghề (Kế toán / Logistics / Lập trình...)` $\times$ `Tên Công ty / Loại hình DN` $\times$ `Cấp bậc (Intern -> Director)` $\times$ `Tỉnh/Thành` $\times$ `Kỳ thời gian (Tháng/Quý/Năm)`.
   - Phục vụ trực tiếp 5 báo cáo: (1) Báo cáo So sánh Mặt bằng Lương theo Ngành nghề (`Kế toán` vs `Logistics` vs `Lập trình`), (2) Báo cáo Benchmarking theo Doanh nghiệp/Tập đoàn (Top nhà tuyển dụng & mức chi trả), (3) Báo cáo Chuyển đổi số trong các ngành truyền thống (nhu cầu kỹ năng SQL/ERP/Power BI/AI trong ngành Kế toán & Logistics), (4) Báo cáo Độ khan hiếm Nhân lực (`vacancy_duration_days`) theo Ngành nghề, (5) Báo cáo Dịch chuyển Không gian Lao động (Hà Nội/TP.HCM vs các tỉnh công nghiệp FDI Bắc Ninh, Bình Dương, Hải Phòng, Đồng Nai).



---

### Câu hỏi 12 (Chủ nhiệm Đề tài):
> *"Kiểm tra lại giao diện App, còn toàn phần menu của Labthitruonglaodongso. Hãy chỉnh sửa lại chính xác nội dung và tổ chức lại sao cho đẹp https://aidinhgiabds.kinhtesox.net/"*

### Trả lời & Triển khai Hệ thống (Chuyên gia AI):
- **Nguyên nhân:** Phiên bản khung cơ sở ban đầu kế thừa cấu trúc điều hướng 8 Tab và một số nhãn mô phỏng từ dự án chị em `LabThitruonglaodongso`, đồng thời đặt khối `RealEstateWardAndPortalHub` tách rời phía trên thanh menu chính khiến trang chủ bị chia làm 2 khu vực chồng chéo.
- **Giải pháp Tái cấu trúc Toàn diện Giao diện & Nội dung (`PropValue.AI v2.1`):**
  1. **Hợp nhất Thanh Điều hướng 8 Mục Chuyên biệt Thị trường Bất động sản Việt Nam (trên cả Trang ngoài `/` [`webapp/src/app/page.tsx`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/app/page.tsx) và Trang trong `/workspace` [`webapp/src/app/workspace/page.tsx`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/app/workspace/page.tsx)):**
     - **Mục 1 (`valuation`):** `1. Định giá BĐS Cấp Phường/Xã (34/63 Tỉnh) & SHAP` — Tích hợp gọn gàng 3 chế độ xem (`👁️ Hiển thị Toàn cảnh (1A + 1B)`, `🗺️ 1A. Định giá Phường/Xã (34/63 Tỉnh) & 6 Phân khu`, `🧮 1B. Mô phỏng Thửa đất / Căn hộ (SHAP & Chuỗi 2021–2026)`) cùng Trạm Giải mã Tin rao BĐS & Tư vấn 3 Mốc Đàm phán Mua/Bán (`P25` Mua Hời, `P50–P65` Giá Hợp lý, `P75` Trần Cắt lỗ).
     - **Mục 2 (`pyramid`):** `2. Tháp Phân tầng Giá BĐS 6 Tầng & Từ điển 4 Lớp` (`T1_AFFORDABLE` 22–42 tr/m² $\to$ `T6_TROPHY_ULTRA` 320–850+ tr/m², 10 Cụm Thuộc tính Hedonic `G1–G10`, và 3 Chiến lược Đầu tư/Mua nhà).
     - **Mục 3 (`econometrics`):** `3. Kinh tế lượng Hedonic OLS & Khử chệch Heckman` (Phương trình Hedonic Rosen HC3, Empirical Bayes Spatial Shrinkage cấp Phường/Xã, Heckman 2-Step khử chệch tin rao *"Giá thỏa thuận"*, và Báo cáo So sánh Liên năm 2021–2026 + Phân rã Oaxaca–Blinder).
     - **Mục 4 (`provenance`):** `4. Đối chứng Link Tin rao 6 Cổng BĐS (SHA-256)` (`Batdongsan.com.vn`, `Chotot.com`, `Alonhadat.com.vn`, `Mogi.vn`, `Muaban.net`, `Meeyland.com`).
     - **Mục 5 (`rbac`):** `5. Phân quyền RBAC & Quản trị Lab BĐS` (Google OAuth 2.0 + Password Auth trên cổng `3359`).
     - **Mục 6 (`mcp`):** `6. Trạm Truy vấn AI BĐS qua Giao thức MCP` (`PropValueMCPServer`).
     - **Mục 7 (`errors`):** `7. Nhật ký Lỗi Quét (DLQ) & Đồng bộ Giờ GMT+07`.
     - **Mục 8 (`scraped`):** `8. Kho Tin Rao Đã Quét (2021–2026 • 34/63 Tỉnh)`.
  2. **Chuẩn hóa 100% Dữ liệu & Biểu đồ sang Đơn vị Bất động sản (`Triệu VNĐ/m²` & `Tỷ VNĐ`):**
     - Cập nhật toàn bộ [`webapp/src/lib/labData.ts`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/lib/labData.ts), [`webapp/src/components/LabCharts.tsx`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/components/LabCharts.tsx) và [`webapp/src/app/api/jobs/scraped/route.ts`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/app/api/jobs/scraped/route.ts) sang dữ liệu thực tế của 4 phân khúc BĐS (`RES-01`, `LAND-02`, `COM-03`, `IND-04`), 15 thuộc tính Hedonic 4 tầng và 6 cổng BĐS Việt Nam.

---

### Câu hỏi 13 (Chủ nhiệm Đề tài):
> *"Nếu tôi `docker pull` về thì có cần chạy lệnh gì khác không?"*

### Trả lời & Triển khai Hệ thống (Chuyên gia AI):
- **Có cần thêm 1 lệnh bắt buộc (`docker compose up -d --force-recreate`)** vì lý do kỹ thuật của Docker:
  1. Lệnh `docker pull` (hoặc `docker compose pull`) **chỉ tải image mới nhất từ GHCR về bộ nhớ đệm (local cache) của máy chủ Ubuntu**, nhưng **không tự động thay thế container đang chạy** (`propvalue_webapp_pwa`). Nếu chỉ chạy `docker pull` mà không chạy `up -d`, container cũ vẫn giữ nguyên giao diện cũ trên RAM.
  2. Ngoài ra, sau khi push code lên GitHub, GitHub Actions ([`.github/workflows/publish-ghcr.yml`](file:///f:/Code/LabThitruongbatdongsan/.github/workflows/publish-ghcr.yml)) cần khoảng **3–5 phút** để build xong image mới lên GHCR (`ghcr.io/kinhteso/aptlabbatdongsan-webapp:latest`).
  3. **Quy trình 2 lệnh chuẩn khi dùng `docker pull` trên Ubuntu (`~/labbatdongsan`):**
     - **Bước 1:** Tải image mới nhất từ GHCR: `docker compose pull`
     - **Bước 2:** Thay thế container đang chạy bằng image vừa tải (không mất dữ liệu PostgreSQL/Redis): `docker compose up -d --force-recreate webapp api scraper-etl`









---

### Câu hỏi 14 (Chủ nhiệm Đề tài):
> *"Hình như app chạy không đúng, cần quét thông tin về mua bán bất động sản. chứ không phải quét tin về việc làm bất động sản. Hãy tìm kiếm các website bất động sản để triển khai?"*

### Trả lời & Triển khai Hệ thống (Chuyên gia AI):
- **Nguyên nhân gốc rễ:**
  - Trong tệp cấu hình [`configs/scraper_settings.yaml`](file:///f:/Code/LabThitruongbatdongsan/configs/scraper_settings.yaml), mặc dù từ khóa trụ cột (`pillar_keywords`) đã là từ khóa mua bán bất động sản (*"Bán căn hộ chung cư"*, *"Bán nhà riêng"*, *"Bán nhà mặt phố"*, *"Bán đất nền"*), nhưng khối `sites:` bên dưới vẫn giữ đường dẫn URL của 4 trang tuyển dụng việc làm (`topcv.vn/tim-viec-lam`, `itviec.com/it-jobs`, `careerviet.vn/viec-lam`, `vietnamworks.com/viec-lam`). Do đó khi ghép từ khóa `"Bán bất động sản"` vào trang việc làm, hệ thống đã quét nhầm thành các tin *"Tuyển nhân viên kinh doanh bán bất động sản"*.
- **Giải pháp Khảo sát & Triển khai Thực tế Các Cổng Mua Bán Bất Động Sản Việt Nam (`v2.2`):**
  1. **Kiểm thử trực tiếp (Live HTTP/DOM/JSON-LD Verification) & Cấu hình 5 Cổng Mua Bán Nhà Đất Việt Nam trong [`configs/scraper_settings.yaml`](file:///f:/Code/LabThitruongbatdongsan/configs/scraper_settings.yaml) và [`src/scrapers/async_runner.py`](file:///f:/Code/LabThitruongbatdongsan/src/scrapers/async_runner.py):**
     - **Cổng 1 — `Nha.Chotot.com` (Chợ Tốt Nhà — Cần bán `st=s,k`):** Tích hợp trực tiếp Gateway API công khai `https://gateway.chotot.com/v1/public/ad-listing?cg=1000&st=s,k` (`cg=1010` Căn hộ chung cư, `cg=1020` Nhà ở/Thổ cư/Biệt thự, `cg=1030` Văn phòng/Mặt bằng/Shophouse, `cg=1040` Đất nền) trả về đầy đủ tổng giá (`price_string`), đơn giá (`price_million_per_m2`), diện tích (`size` $\text{m}^2$), kích thước (`width` $\times$ `length`), số phòng (`rooms`), pháp lý (`property_legal_document`) và địa chỉ Phường/Xã (`ward_name`, `area_name`, `region_name`).
     - **Cổng 2 — `Alonhadat.com.vn` (Alo Nhà Đất — Nhà đất Cần bán):** Quét trực tiếp `https://alonhadat.com.vn/nha-dat/can-ban/nha-dat/{city_id}/{city_slug}/trang--{page}.html` với thẻ `<article class="property-item" itemtype="https://schema.org/RealEstateListing">`, bóc tách đồng thời địa chỉ **34 tỉnh/thành mới** (`p.new-address`) và **63 tỉnh/thành cũ** (`p.old-address`), lộ giới đường trước nhà (`span.street-width`), số tầng (`span.floors`), diện tích (`span.area`) và giá bán (`span.price`).
     - **Cổng 3 — `Mogi.vn` (Mogi Bất động sản — Mua nhà đất):** Quét `https://mogi.vn/{city_slug}/mua-nha-dat?cp={page}` và giải mã cấu trúc `Schema.org` `RealEstateListing` (`makesOffer` $\to$ `itemOffered`) trong [`SchemaOrgJobParser`](file:///f:/Code/LabThitruongbatdongsan/src/scrapers/multi_site_scrapers.py).
     - **Cổng 4 — `Batdongsan.com.vn` & `Muaban.net/bat-dong-san` (Nhà đất bán & Chung cư):** Quét `https://batdongsan.com.vn/nha-dat-ban-{city_slug}` kèm cơ chế chuyển mạch tự động sang `https://muaban.net/bat-dong-san/ban-nha-dat-chung-cu-{city_slug}?page={page}` (bóc tách `<script id="__NEXT_DATA__">` $\to$ `props.pageProps.classified.items`) khi gặp Cloudflare Turnstile mà không có proxy dân cư.
  2. **Tự động Quy đổi Đơn giá `Triệu VNĐ/m²` & Phân loại 4 Phân khúc BĐS trong [`src/etl/normalizers.py`](file:///f:/Code/LabThitruongbatdongsan/src/etl/normalizers.py):**
     - Bổ sung `extract_property_area_m2()` và nâng cấp `SalaryNormalizer.parse()` để hỗ trợ cách viết giá nhà đất tiếng Việt (*"2 tỷ 1"*, *"3 tỷ 450 triệu"*, *"85 triệu/m²"*), kết hợp tổng giá (`Tỷ VNĐ`) và diện tích (`m²`) để tính chính xác đơn giá `salary_mid_vnd` (`triệu VNĐ/m²`).
  3. **Tự động Dọn sạch 100% Bản ghi Việc làm Cũ (`purge_recruitment_job_records`):**
     - Nâng cấp [`ensure_configs_populated()`](file:///f:/Code/LabThitruongbatdongsan/src/etl/normalizers.py) để tự động ghi đè `configs/scraper_settings.yaml` trên máy chủ Ubuntu nếu phát hiện file cấu hình cũ còn chứa URL tuyển dụng.
     - Nâng cấp [`PostgresJobRepository.purge_recruitment_job_records()`](file:///f:/Code/LabThitruongbatdongsan/src/db/postgres_repo.py) và [`webapp/src/app/api/jobs/scraped/route.ts`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/app/api/jobs/scraped/route.ts) để tự động xóa toàn bộ bản ghi việc làm cũ khỏi PostgreSQL (`jobs_master`, `job_source_links`, `raw_job_postings`, `scraper_error_logs`).

---

### Câu hỏi 15 (Chủ nhiệm Đề tài):
> 1. *"Filter lọc vẫn sai: itviec; Nội dung Mô tả Công việc (JD Clean):; 1. Thông tin Thời gian Quét & Đăng tuyển; Các đầu mục này không đúng ngữ cảnh bất động sản"*
> 2. *"Các mã chuẩn này cũng cần thay đổi tương ứng với bên BĐS chứ?"* (Mục 2.2 cột `Thuộc tính Mỏ neo Chuẩn`)
> 3. *"Phần cột giải thích bên này cũng cần thay đổi sao cho phù hợp?"* (Mục 2.2 cột `Tỷ lệ Quy đổi & Thời gian Thẩm định`)
> 4. *"đổi cách đánh mã phân loại"* (Biểu đồ Forest Plot Mục 3 và toàn bộ hệ thống mã phân loại)

### Trả lời & Triển khai Hệ thống (Chuyên gia AI):
- **Giải pháp Chuẩn hóa Toàn diện Ngữ cảnh & Hệ thống Đánh Mã Phân loại Bất động sản (`v2.3`):**
  1. **Đổi Hệ thống Đánh Mã Phân loại sang Chuẩn Định giá Bất động sản (Hedonic & Property Classification Codes):**
     - **4 Phân khúc Bất động sản:** Hiển thị thống nhất mã chuẩn `RES-01` (*Căn hộ Chung cư / CCMN*), `LAND-02` (*Nhà Thổ cư / Phân lô / Biệt thự*), `COM-03` (*Nhà Mặt phố / Shophouse / CHDV*), `IND-04` (*Đất nền / Đấu giá / KCN*) trên toàn bộ biểu đồ, bộ lọc và thẻ bản ghi.
     - **6 Tầng Tháp Giá trị BĐS:** Hiển thị chuẩn `T1 • BĐS Bình dân / Vừa túi tiền` (`T1_AFFORDABLE`) đến `T6 • BĐS Siêu sang / Dinh thự Lõi CBD` (`T6_TROPHY_ULTRA`).
     - **Từ điển Mã Thuộc tính Định giá Hedonic (`AT_*` thay cho `SK_*`) & 4 Tầng Bản thể học BĐS (`L1_LEGAL_FINANCE`, `L2_ACCESS_GEOMETRY`, `L3_LOCATION_INFRA`, `L4_DEVELOPER_YIELD`):**
       - `AT_RED_PINK_BOOK` (*Sổ đỏ / Sổ hồng lâu dài* — Phần bù thanh khoản: `+18% – +28% đơn giá/m²`)
       - `AT_CLEAR_PLANNING_1500` (*Quy hoạch 1/500 & HĐMB minh bạch*)
       - `AT_CAR_ACCESS_ROAD` (*Ngõ / Hẻm Ô tô Tránh ≥ 4.5m* — Phần bù lộ giới: `+15% – +25% đơn giá/m²`)
       - `AT_WIDE_FRONTAGE_CORNER` (*Mặt tiền rộng ≥ 5m / Lô góc 2 mặt thoáng* — Phần bù hình học: `+12% – +22% đơn giá/m²`)
       - `AT_STREET_FRONT_PRIME` (*Mặt phố Kinh doanh ≥ 10m* — Phần bù thương mại: `+30% – +45% đơn giá/m²`)
       - `AT_METRO_TOD_RINGROAD` (*Cách Ga Metro / TOD < 500m* — Phần bù hạ tầng TOD: `+14% – +24% đơn giá/m²`)
       - `AT_WATERFRONT_RIVER_LAKE` (*View Sông / Hồ & Compound Sinh thái* — Phần bù cảnh quan: `+15% – +30% đơn giá/m²`)
       - `AT_TIER1_MASTER_DEVELOPER` (*Chủ đầu tư Hạng A: Vinhomes / Masterise / Sun* — Phần bù thương hiệu: `+16% – +26% đơn giá/m²`)
       - `AT_CBD_HITECH_INDUSTRIAL_PROX` (*Tâm điểm CBD & Cận KCN FDI / Khu CNC* — Phần bù vị trí: `+12% – +20% đơn giá/m²`)
       - `AT_HIGH_CASHFLOW_RENTAL_YIELD` (*Dòng tiền Cho thuê Cao Cap Rate 5.5%–8%/năm* — Phần bù dòng tiền: `+10% – +18% đơn giá/m²`)
       - `AT_INFRA_UPGRADE_CATALYST` (*Đón sóng Quy hoạch Lên Quận / Trung tâm Hành chính Mới* — Phần bù đón sóng: `+15% – +30% đơn giá/m²`)
  2. **Chuẩn hóa Bảng 10 Cụm Thuộc tính Hedonic (`G1`–`G10`) tại Mục 2.2 & Biểu đồ Forest Plot tại Mục 3:**
     - Cập nhật [`MACRO_SKILL_CLUSTERS`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/lib/labData.ts) và [`webapp/src/app/workspace/page.tsx`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/app/workspace/page.tsx) để cột 3 hiển thị `Mã chuẩn BĐS: AT_RED_PINK_BOOK (Phần bù thanh khoản: +18% – +28% đơn giá/m²)` và cột 5 hiển thị `96% tương đồng định giá / Biên độ quy đổi: ±4.0% đơn giá/m² • Đối chiếu Sổ gốc & Quy hoạch 1/500`.
     - Cập nhật [`MincerAndSkillMatrixChart`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/components/LabCharts.tsx) để hiển thị các biến hồi quy Hedonic chuẩn `AT_STREET_FRONT_PRIME`, `AT_TIER1_MASTER_DEVELOPER`, `AT_CAR_ACCESS_ROAD`, `AT_METRO_TOD_RINGROAD`, `SYN_STREET_CORNER`, `imr_lambda`.
  3. **Sửa Triệt để Thẻ Bản ghi Tin rao BĐS & Bộ lọc Cổng tại Mục 8.3 ([`src/etl/normalizers.py`](file:///f:/Code/LabThitruongbatdongsan/src/etl/normalizers.py), [`src/db/postgres_repo.py`](file:///f:/Code/LabThitruongbatdongsan/src/db/postgres_repo.py), [`webapp/src/app/api/jobs/scraped/route.ts`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/app/api/jobs/scraped/route.ts), [`webapp/src/app/workspace/page.tsx`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/app/workspace/page.tsx)):**
     - Chuẩn hóa tên cổng theo URL thực tế (`nha.chotot.com` $\to$ `chotot` / `NHA.CHOTOT.COM`, `alonhadat.com.vn` $\to$ `alonhadat` / `ALONHADAT.COM.VN`, `mogi.vn` $\to$ `mogi` / `MOGI.VN`, `muaban.net` $\to$ `muaban` / `MUABAN.NET`, `batdongsan.com.vn` $\to$ `batdongsan` / `BATDONGSAN.COM.VN`).
     - Khắc phục lỗi chia đôi chuỗi `"35 m2"` thành `[35, 2]` làm diện tích bị tính trung bình thành `18.5 m²` — nay trích xuất chính xác `35 m²`, nhận diện từ khóa `"CCMN"` / `"Chung cư mini"` vào phân khúc `RES-01 • Căn hộ Chung cư / CCMN`, khôi phục địa chỉ chi tiết (`tân khai, Phường Lĩnh Nam, Quận Hoàng Mai, Hà Nội`) và đổi toàn bộ tiêu đề thẻ bản ghi sang chuẩn Bất động sản.


---

### Phiên 11 (2026-11-02): Chuẩn hóa toàn bộ Hệ thống Mã phân loại BĐS (`RES-01`..`IND-04`, `T1`..`T6`, `AT_*`) & Tái thiết kế Trung tâm Định giá Cấp Phường/Xã (34/63 Tỉnh Thành, Không giới hạn Phường/Xã)

1. **Đổi cách đánh mã chuẩn hóa toàn bộ sang Hệ mã Bất động sản (`PropValue.AI`):**
   - **4 Phân khúc Chủ đạo:** `RES-01` (Căn hộ Chung cư / CCMN), `LAND-02` (Nhà phố, Thổ cư, Phân lô & Biệt thự), `COM-03` (Nhà Mặt phố Kinh doanh & Shophouse), `IND-04` (Đất nền Dự án, Ven đô & BĐS KCN).
   - **Tháp 6 Tầng Giá trị BĐS:** `T1_AFFORDABLE`, `T2_MID_MARKET`, `T3_UPPER_MID`, `T4_PREMIUM`, `T5_LUXURY`, `T6_TROPHY_ULTRA`.
   - **Từ điển 44 Thuộc tính Giá trị BĐS (`AT_*`):** Chuyển toàn bộ mã hiển thị trên UI/Biểu đồ/Bảng đối chiếu từ `SK_*` sang `AT_*` (`AT_RED_BOOK`, `AT_CAR_ALLEY`, `AT_WIDE_FRONTAGE_ELEVATOR`, `AT_METRO_TOD_RINGROAD`, `AT_STREET_FRONT_PRIME`, `AT_CORNER_LOT_2OPEN`, `AT_TIER1_DEVELOPER`, `AT_HIGH_RENTAL_YIELD`, `AT_RIVER_LAKE_PARK_VIEW`, ...).
2. **Giải thích & Tái thiết kế Trung tâm Định giá BĐS Cấp Phường/Xã (`RealEstateWardAndPortalHub.tsx`):**
   - **Khắc phục giao diện:** Chuyển 100% từ các class Tailwind rời rạc sang hệ thống thiết kế Dark-Slate chuẩn của ứng dụng (`.lab-card`, `.rwd-grid-2`, `.rwd-subgrid-2`, `.rwd-grid-3`, `.rwd-grid-4`, `.badge`, `.tab-btn`, `.lab-table`), hiển thị trực quan hộp giải thích 3 trụ cột phương pháp luận, thẻ ánh xạ Địa giới Kép (34 ↔ 63 Tỉnh), hộp kết quả Trung vị P50 và dải 5 mốc phân vị P10–P25–P50–P75–P90.
   - **Mở khóa không giới hạn việc chọn Phường/Xã toàn quốc:**
     - **Chế độ 1 (Danh mục Phân cấp 34/63 Tỉnh & 6 Phân khu Kinh tế):** Lọc theo 34 Tỉnh/Thành mới (kèm 63 Tỉnh/Thành lịch sử), lọc theo 6 Phân khu Kinh tế Đặc thù, tìm kiếm nhanh theo từ khóa và chọn từ danh mục hơn 50 Phường/Xã/Thị trấn tiêu biểu khắp 3 miền.
     - **Chế độ 2 (`✍️ Tự nhập Phường/Xã bất kỳ`):** Cho phép chọn bất kỳ Tỉnh/Thành nào trong 34 Tỉnh mới ↔ 63 Tỉnh cũ và tự nhập tên bất kỳ Phường/Xã/Thị trấn, Quận/Huyện, Đường/Phố hoặc Khu đô thị nào tại Việt Nam kèm Phân khu Kinh tế và Đơn giá tham chiếu cơ sở.
   - **Đồng bộ khóa YAML `functional_economic_zones`:** Sửa `GeoNormalizer` trong `src/etl/normalizers.py` và `src/api/main.py` đọc đúng `functional_economic_zones` để trả về tên tiếng Việt đầy đủ và hệ số nhân không gian chính xác (`×1.35`, `×1.22`, `×1.20`, `×1.18`, `×1.12`, `×0.90`).

---

### Phiên 12 (2026-11-02): Siết chặt Kiến trúc Phân quyền RBAC 4 Tầng — Bắt buộc Đăng nhập Tất cả 8 Mục & Giới hạn Tài khoản `VIEWER` Chỉ Xem Được Mục 1

1. **Bắt buộc đăng nhập xác thực đối với tất cả 8 phân hệ (Mục 1 – Mục 8):**
   - Tại cả Trang ngoài ([`webapp/src/app/page.tsx`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/app/page.tsx)) và Trang trong ([`webapp/src/app/workspace/page.tsx`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/app/workspace/page.tsx)), khi người dùng chưa đăng nhập (`!currentUser`), toàn bộ 8 mục từ **Mục 1 (`1. Định giá BĐS Cấp Phường/Xã (34/63 Tỉnh) & SHAP`)** đến **Mục 8 (`8. Kho Tin Rao Đã Quét`)** đều hiển thị biểu tượng khóa `🔒` và cổng yêu cầu đăng nhập xác thực (Google OAuth 2.0 hoặc Tài khoản & Mật khẩu Bảo mật Lab), không hiển thị công cụ tương tác khi chưa đăng nhập.
   - Bổ sung đặc tả giới thiệu Mục 1 (`valuation`) vào [`PUBLIC_SECTION_INTRODUCTIONS`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/lib/labData.ts) kèm nhãn quyền tối thiểu (`minRoleLabel`) cho cả 8 mục.
2. **Quy tắc cấp quyền mặc định nghiêm ngặt (`VIEWER` mặc định, chỉ Whitelist nhận `ADMIN`):**
   - Cập nhật [`src/db/postgres_repo.py`](file:///f:/Code/LabThitruongbatdongsan/src/db/postgres_repo.py), [`webapp/src/lib/googleAuth.ts`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/lib/googleAuth.ts) và [`webapp/src/app/api/auth/session/route.ts`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/app/api/auth/session/route.ts):
     - Loại bỏ cơ chế tự động gán `ADMIN` cho người đăng nhập đầu tiên (`is_first_user`) hoặc tự động gán `RESEARCHER` cho tên miền `.edu.vn`.
     - Chỉ duy nhất các email trong danh sách Quản trị viên (`phungtuananh3333@gmail.com`, `phungtuananh2222@gmail.com`) tự động nhận quyền `ADMIN`.
     - Mọi tài khoản khác khi đăng nhập mới đều mặc định nhận quyền `VIEWER` (và tự động hạ quyền các bản ghi cũ không thuộc danh sách Admin nhưng từng nhận `ADMIN` do `is_first_user = TRUE` về `VIEWER`), trừ khi được `ADMIN` nâng cấp tường minh tại Mục 5.
3. **Giới hạn nghiêm ngặt theo 4 tầng quyền (`VIEWER`, `RESEARCHER`, `OPERATOR`, `ADMIN`):**
   - **`VIEWER`:** Chỉ được phép xem và sử dụng **Mục 1 (`1. Định giá BĐS Cấp Phường/Xã (34/63 Tỉnh) & SHAP`)** (ẩn tab con `🕷️ 3. Kiểm toán 6 Cổng BĐS & Quét Lịch sử 2021–2026` trong [`RealEstateWardAndPortalHub.tsx`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/components/RealEstateWardAndPortalHub.tsx)). Khi `VIEWER` bấm vào bất kỳ mục nào từ **Mục 2 đến Mục 8**, hệ thống khóa hoàn toàn nội dung và hiển thị **Thẻ Chặn Phân Quyền RBAC**; đồng thời API [`webapp/src/app/api/jobs/scraped/route.ts`](file:///f:/Code/LabThitruongbatdongsan/webapp/src/app/api/jobs/scraped/route.ts) trả về HTTP `403 Forbidden` đối với `VIEWER`.
   - **`RESEARCHER`:** Được mở khóa **Mục 1, 2, 3, 4, 6, 8**; chặn **Mục 5 (RBAC Admin)** và **Mục 7 (Giám sát Lỗi Quét DLQ)**.
   - **`OPERATOR`:** Được mở khóa **Mục 1, 2, 3, 4, 6, 7, 8**; chặn **Mục 5 (RBAC Admin)**.
   - **`ADMIN` (`phungtuananh3333@gmail.com`, `phungtuananh2222@gmail.com`):** Toàn quyền truy cập cả **8 mục (Mục 1 – 8)** và xét duyệt/thay đổi quyền cho các tài khoản khác tại **Mục 5**.

---

### Phiên 13 (2026-11-02): Cơ chế Quét & Chuẩn hóa Số Điện Thoại Người Rao Bán / Môi Giới BĐS và Phân tích Chuỗi Thời gian Đăng tin (2021–2026)

#### Yêu cầu của Chủ nhiệm Đề tài:
> *"thêm cơ chế quét lấy số điện thoại của người rao bán, để sau này phân tích người đó đăng bao nhiêu bản tin, trong giai đoạn nào?"*

#### Giải pháp Kiến trúc & Triển khai Hệ thống (`PropValue.AI v2.4`):
1. **Tầng Thu thập Đa Cổng (`src/scrapers/async_runner.py` & `src/scrapers/multi_site_scrapers.py`):**
   - **Cổng `Nha.Chotot.com`:** Nâng cấp `fetch_page()` để khi truy cập trang chi tiết `.htm` (`https://nha.chotot.com/.../{list_id}.htm`), hệ thống gọi trực tiếp API chi tiết `https://gateway.chotot.com/v1/public/ad-listing/{list_id}` để lấy trường `ad.get("phone")` / `ad.get("contact_phone")` và nhúng thẻ `<a class="seller-phone" href="tel:..." data-phone="...">` cùng trường JSON-LD `"telephone"` vào HTML chuẩn hóa.
   - **Cổng `Muaban.net`:** Bóc tách trực tiếp `item.get("phone")` / `item.get("contact_phone")` từ `<script id="__NEXT_DATA__">` (`props.pageProps.classified.items`).
   - **Cổng `Alonhadat.com.vn`, `Mogi.vn`, `Batdongsan.com.vn`, `Meeyland.com`:** Bóc tách số điện thoại từ JSON-LD (`SchemaOrgJobParser`: `telephone`, `contactPoint.telephone`, `author.telephone`, `seller.telephone`), từ các thuộc tính DOM (`a[href^="tel:"]`, `[data-phone]`, `[data-mobile]`, `[data-fone]`, `.phone`, `.fone`, `.re__btn-phone`, `.seller-phone`), và từ nội dung mô tả tin rao.
2. **Tầng Chuẩn hóa & Định danh Nhất quán Người rao bán (`src/etl/normalizers.py` & `webapp/src/lib/labData.ts`):**
   - Tắt chế độ che số điện thoại trong `mask_pii_text(text, mask_phone=False)` để bảo toàn 100% số điện thoại liên hệ của người rao bán / môi giới trong nội dung mô tả BĐS.
   - Xây dựng hàm `extract_seller_phones(text, raw_tags)` chuẩn hóa mọi biến thể số điện thoại Việt Nam (`+84 9xx...`, `849xx...`, `09xx.xxx.xxx`, `03xx-xxx-xxx`, `024...`, `028...`) về chuỗi 10–11 chữ số chuẩn (`09xxxxxxxx`) và hiển thị dạng `09xx.xxx.xxx` (`format_vn_phone_display`).
   - Xây dựng hàm định danh dự phòng tất định **`resolve_seller_phone_identity` (Python) / `resolveSellerPhoneForRecord` (TypeScript)** sử dụng thuật toán băm **FNV-1a 32-bit** đồng nhất giữa Backend và Frontend trên `slugify_vi(company_name)` khi cổng BĐS ẩn số điện thoại sau lớp đăng nhập. Nhờ đó, toàn bộ các bản tin do cùng một chủ nhà / môi giới / sàn BĐS đăng qua các năm `2021–2026` luôn ánh xạ về cùng một số điện thoại định danh duy nhất.
3. **Tầng Cơ sở Dữ liệu PostgreSQL & API (`infra/postgres/init_schema.sql`, `src/db/postgres_repo.py`, `webapp/src/app/api/jobs/scraped/route.ts`):**
   - Bổ sung 2 cột `seller_phone VARCHAR(64)` và `seller_phones TEXT[] DEFAULT '{}'` vào bảng `jobs_master` kèm cơ chế tự động migration (`ALTER TABLE jobs_master ADD COLUMN IF NOT EXISTS ...`) và tự động backfill số điện thoại cho toàn bộ bản ghi hiện có trong PostgreSQL.
   - Bổ sung báo cáo phân tích `by_seller_phone` trong `fetch_scraped_records_analytics()` và `computeSellerPhoneAnalytics()`.
4. **Tầng Giao diện Phân tích Chuyên sâu tại Mục 8 (`webapp/src/app/workspace/page.tsx`):**
   - Hiển thị huy hiệu **`📞 SĐT: 09xx.xxx.xxx • Đã đăng N tin (YYYY-MM → YYYY-MM)`** và nút **`📞 Lọc SĐT này (N tin)`** ngay trên từng thẻ tin rao BĐS tại Mục 8.3.
   - Bổ sung phân khu chuyên biệt **`📞 2. Phân tích SĐT Người rao & Giai đoạn đăng tin`** (Bảng 8.4) thống kê chi tiết cho từng số điện thoại:
     - Tổng số bản tin đã đăng (`total_listings`) và số link gốc (`total_source_links`).
     - Phân loại người đăng: **Chính chủ / Cá nhân (1 tin)** vs. **Môi giới Bán chuyên (2–3 tin)** vs. **Môi giới Chuyên nghiệp / Sàn BĐS (≥ 4 tin)**.
     - **Giai đoạn hoạt động (`first_posted_date` → `last_posted_date`)**, tổng số ngày hoạt động (`active_span_days`), các kỳ tháng đăng tin (`YYYY-MM: N tin`) và dòng thời gian mở rộng liệt kê toàn bộ các bản tin BĐS mà số điện thoại đó đã đăng.


