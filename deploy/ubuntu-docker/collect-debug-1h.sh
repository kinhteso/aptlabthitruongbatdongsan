#!/usr/bin/env bash
# ==============================================================================
# Kịch bản Thu thập Gói Thông tin Chẩn đoán & Debug 1 Giờ (1-Hour Daemon Debug Bundle)
# Dùng để kiểm tra hiệu suất từng cổng (TopCV, ITviec, CareerViet, VietnamWorks)
# sau 1 giờ chạy ngầm trên Ubuntu Docker và xuất khối văn bản gửi cho AI hiệu chỉnh.
# Cách chạy:
#   bash deploy/ubuntu-docker/collect-debug-1h.sh
# ==============================================================================
set -e

echo "================================================================================"
echo " 🩺 THU THẬP GÓI CHẨN ĐOÁN DEBUG 1 GIỜ CHO 4 TIẾN TRÌNH DAEMON QUÉT DỮ LIỆU"
echo "================================================================================"

if docker ps --format '{{.Names}}' | grep -q "skillvalue_scraper_etl"; then
    echo ">>> [1/3] Trạng thái Container Daemon (skillvalue_scraper_etl):"
    docker ps --filter "name=skillvalue_scraper_etl" --format "table {{.Names}}\t{{.Status}}\t{{.RunningFor}}"
    echo ""
    echo ">>> [2/3] Tạo & Tự động hiệu chỉnh sơ bộ Gói Debug 1 Giờ (--mode debug-1h):"
    docker exec skillvalue_scraper_etl python -m src.scrapers.scheduler --mode debug-1h
    echo ""
    echo ">>> [3/3] 25 dòng nhật ký (Live Logs) gần nhất của Daemon:"
    docker logs --tail 25 skillvalue_scraper_etl
else
    echo ">>> Container skillvalue_scraper_etl chưa bật, chạy trực tiếp bằng Python cục bộ:"
    python3 -m src.scrapers.scheduler --mode debug-1h
fi

echo "================================================================================"
echo " 💡 HƯỚNG DẪN GỬI CHO AI ĐỂ HIỆU CHỈNH:"
echo " Bạn chỉ cần copy khối [BÁO CÁO DEBUG 1 GIỜ TIẾN TRÌNH DAEMON QUÉT DỮ LIỆU]"
echo " ở trên (hoặc nội dung tệp logs/hourly_debug_bundle.json) và dán vào khung chat"
echo " với AI. Nếu 1 trong 4 trang (TopCV, ITviec, CareerViet, VietnamWorks) bị 0 link,"
echo " lệch CSS Selector hoặc bị chặn Cloudflare 403, AI sẽ đọc 'Chẩn đoán DOM thực tế'"
echo " trong báo cáo trên và sửa chính xác bộ chọn của cổng đó ngay lập tức!"
echo "================================================================================"
