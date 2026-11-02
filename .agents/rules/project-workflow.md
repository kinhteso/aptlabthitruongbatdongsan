---
trigger: always_on
description: Tự động cập nhật tài liệu thiết kế, mô tả và nhật ký hỏi đáp trong thư mục docs/ khi tư vấn hoặc thay đổi kiến trúc dự án Thị trường Bất động sản Số.
---

# Quy tắc Quản lý Tài liệu & Khung Phân tích Dự án Thị trường Bất động sản Số (PropValue.AI)

1. **Tự động lưu trữ tài liệu vào `docs/`:**
   - Khi tư vấn, thiết kế kiến trúc, điều chỉnh khung phân tích Hedonic hoặc trả lời các câu hỏi chuyên môn của người dùng, luôn cập nhật tự động vào các tài liệu tương ứng trong thư mục `docs/` (đặc biệt là `docs/05-nhat-ky-tu-van-va-hoi-dap.md` và `docs/README.md`).
2. **Định kỳ rà soát Khung phân tích khi dữ liệu lớn (`framework-review`):**
   - Khi dữ liệu tin đăng bất động sản thu thập trong PostgreSQL hoặc `data/` đạt quy mô mới (hoặc khi người dùng yêu cầu đánh giá lại khung), hãy sử dụng skill `framework-review` và chạy `python -m src.analytics.framework_auditor` để kiểm tra xem có cần tái cấu trúc `configs/skills_ontology.yaml` (Từ điển Thuộc tính Giá trị BĐS 4 tầng), `configs/roles_taxonomy.yaml` (Khung 4 phân khúc & 16 loại hình BĐS) và Tháp Phân tầng Giá trị 6 Tầng hay không.
3. **Tự động cập nhật Báo cáo & Bảng Ánh xạ (Schema Mapping) khi thêm Cổng BĐS mới:**
   - Khi thêm bất kỳ trang tin mua bán bất động sản mới nào vào `configs/scraper_settings.yaml` hoặc `src/scrapers/multi_site_scrapers.py`, luôn:
     1. Đảm bảo adapter của trang mới ánh xạ về chuẩn DTO `RawScrapedJob` (Bản ghi Tin đăng BĐS thô) và qua `UnifiedETLPipeline` để gộp vào `jobs_master` kèm lưu vết toàn bộ link gốc trong `job_source_links` (`source_urls`, `source_links_meta`).
     2. Cập nhật tài liệu đặc tả ánh xạ tại `docs/03-thiet-ke-he-thong-cao-du-lieu-va-pipeline-ml.md` và chạy lại `python -m src.analytics.framework_auditor` để Bảng Kiểm toán Cổng Bất động sản (Mục 0 trong `docs/audits/`) luôn phản ánh đầy đủ trang mới.
