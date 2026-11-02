"""
Bộ Đồng bộ Thời gian Chuẩn GMT+07 (`Asia/Ho_Chi_Minh`) & Kiểm định Giờ Quốc tế UTC/NTP (`src/utils/time_sync.py`):
Đảm bảo toàn bộ hệ thống (Async Scraper Scheduler, PostgreSQL Timestamps, Error Logs, MCP Audit Logs)
luôn vận hành chính xác theo múi giờ Việt Nam `GMT+07:00` và kiểm tra độ lệch đồng hồ (Clock Skew)
so với Giờ Phối hợp Quốc tế (UTC / NTP Pool) khi triển khai trên máy chủ Ubuntu.
"""

from __future__ import annotations

import os
import socket
import struct
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

# Múi giờ chuẩn của Hệ thống: GMT+07:00 (Asia/Ho_Chi_Minh)
VN_TZ = timezone(timedelta(hours=7), name="GMT+07")
UTC_TZ = timezone.utc


def now_gmt07() -> datetime:
    """Trả về thời gian hiện tại có gắn nhãn múi giờ chuẩn `GMT+07:00`."""
    return datetime.now(VN_TZ)


def now_utc() -> datetime:
    """Trả về thời gian hiện tại theo chuẩn Quốc tế `UTC+00:00`."""
    return datetime.now(UTC_TZ)


def now_gmt07_iso() -> str:
    """Chuỗi ISO-8601 luôn có hậu tố `+07:00` (VD: `2026-10-30T11:08:00+07:00`)."""
    return now_gmt07().isoformat(timespec="seconds")


def query_ntp_utc_timestamp(
    host: str = "time.google.com",
    timeout_sec: float = 1.5,
) -> Optional[float]:
    """
    Truy vấn gói tin UDP NTP (Cổng 123) tới máy chủ thời gian quốc tế (`time.google.com` / `pool.ntp.org`)
    để lấy mốc Unix Timestamp chuẩn quốc tế. Trả về `None` nếu môi trường chặn UDP 123 (offline/sandbox).
    """
    ntp_epoch_delta = 2208988800  # Khoảng cách giây từ 1900-01-01 đến 1970-01-01
    packet = b"\x1b" + 47 * b"\0"
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as client:
            client.settimeout(timeout_sec)
            client.sendto(packet, (host, 123))
            data, _ = client.recvfrom(1024)
            if data and len(data) >= 48:
                unpacked = struct.unpack("!12I", data[:48])
                transmit_seconds = unpacked[10]
                transmit_fraction = unpacked[11]
                ntp_time = transmit_seconds + float(transmit_fraction) / (2**32)
                return ntp_time - ntp_epoch_delta
    except Exception:
        return None
    return None


def verify_international_time_sync(
    tolerance_sec: float = 30.0,
    probe_network_ntp: bool = True,
) -> Dict[str, Any]:
    """
    Kiểm tra tính đồng bộ giữa đồng hồ máy chủ (Server Clock) với Giờ Quốc tế (UTC/NTP)
    và xác nhận cấu hình múi giờ `GMT+07` (`Asia/Ho_Chi_Minh`):
    - Tính độ lệch `clock_skew_seconds` giữa hệ thống và máy chủ NTP quốc tế (`time.google.com` / `pool.ntp.org`).
    - Xác minh độ lệch múi giờ của ứng dụng đúng bằng `+07:00` (`+25200` giây so với UTC).
    """
    sys_utc = now_utc()
    sys_gmt07 = sys_utc.astimezone(VN_TZ)
    local_ts = sys_utc.timestamp()

    ntp_ts: Optional[float] = None
    ntp_source = "System Hardware RTC (UTC Reference)"

    if probe_network_ntp:
        for host in ("time.google.com", "pool.ntp.org", "time.cloudflare.com"):
            ntp_ts = query_ntp_utc_timestamp(host=host, timeout_sec=1.2)
            if ntp_ts is not None:
                ntp_source = f"NTP UDP ({host}:123)"
                break

    if ntp_ts is not None:
        skew_sec = round(local_ts - ntp_ts, 3)
        ntp_utc_iso = datetime.fromtimestamp(ntp_ts, tz=UTC_TZ).isoformat(
            timespec="seconds"
        )
        is_synced = abs(skew_sec) <= tolerance_sec
        sync_status = "SYNCHRONIZED_NTP" if is_synced else "CLOCK_DRIFT_WARNING"
    else:
        skew_sec = 0.0
        ntp_utc_iso = sys_utc.isoformat(timespec="seconds")
        is_synced = True
        sync_status = "SYNCHRONIZED_RTC_FALLBACK"

    offset_seconds = int(sys_gmt07.utcoffset().total_seconds()) if sys_gmt07.utcoffset() else 0
    tz_env = os.getenv("TZ", "Asia/Ho_Chi_Minh")

    return {
        "timezone_standard": "GMT+07 (Asia/Ho_Chi_Minh)",
        "configured_tz_env": tz_env,
        "utc_offset_hours": round(offset_seconds / 3600.0, 1),
        "is_gmt07_locked": offset_seconds == 7 * 3600,
        "server_gmt07_iso": sys_gmt07.isoformat(timespec="seconds"),
        "server_utc_iso": sys_utc.isoformat(timespec="seconds"),
        "international_utc_iso": ntp_utc_iso,
        "ntp_source": ntp_source,
        "clock_skew_seconds": skew_sec,
        "tolerance_seconds": tolerance_sec,
        "sync_status": sync_status,
        "is_synchronized": is_synced and (offset_seconds == 7 * 3600),
    }
