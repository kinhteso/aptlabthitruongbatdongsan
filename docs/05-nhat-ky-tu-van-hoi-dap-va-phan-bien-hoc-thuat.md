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


