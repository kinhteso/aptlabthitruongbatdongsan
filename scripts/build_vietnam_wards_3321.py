# -*- coding: utf-8 -*-
"""
Script tải, chuẩn hóa và xuất toàn bộ danh mục 3.321 Phường, Xã, Đặc khu hiện nay của Việt Nam
(thuộc 34 Tỉnh / Thành phố sau sắp xếp theo Nghị quyết 202/2025/QH15, 34 Nghị quyết của UBTVQH
và Quyết định 19/2025/QĐ-TTg áp dụng từ 01/07/2025).
Kết hợp dữ liệu phân loại chính thức (697 Phường, 2.611 Xã, 13 Đặc khu) từ VietMap và chi tiết
sáp nhập các Phường/Xã/Thị trấn cũ từ BenaAsia/DVHCVN.
"""
import csv
import json
import os
import re
import unicodedata
import urllib.request
from collections import defaultdict

BENA_URL = "https://raw.githubusercontent.com/benaasia/dvhcvn/master/json/data-new.json"
VIETMAP_PROV_URL = "https://raw.githubusercontent.com/vietmap-company/vietnam_administrative_address/main/admin_new/province.json"
VIETMAP_WARD_URL = "https://raw.githubusercontent.com/vietmap-company/vietnam_administrative_address/main/admin_new/ward.json"


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", str(s or "")).strip()


def slugify_vi(s: str) -> str:
    s = nfc(s).lower()
    s = s.replace("đ", "d")
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r"^(phuong|xa|dac khu|thi tran|thanh pho|tinh)\s+", "", s).strip()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


PROVINCE_NAME_TO_CODE34 = {
    "Thành phố Hà Nội": ("HN", "TP. Hà Nội", "01", "NORTH", "Miền Bắc", ["Hà Nội"], 115),
    "Hà Nội": ("HN", "TP. Hà Nội", "01", "NORTH", "Miền Bắc", ["Hà Nội"], 115),
    "Thành phố Hồ Chí Minh": ("HCM", "TP. Hồ Chí Minh", "79", "SOUTH", "Miền Nam", ["TP. Hồ Chí Minh", "Bình Dương", "Bà Rịa - Vũng Tàu"], 120),
    "Hồ Chí Minh": ("HCM", "TP. Hồ Chí Minh", "79", "SOUTH", "Miền Nam", ["TP. Hồ Chí Minh", "Bình Dương", "Bà Rịa - Vũng Tàu"], 120),
    "Thành phố Hải Phòng": ("HP", "TP. Hải Phòng", "31", "NORTH", "Miền Bắc", ["Hải Phòng", "Hải Dương"], 62),
    "Hải Phòng": ("HP", "TP. Hải Phòng", "31", "NORTH", "Miền Bắc", ["Hải Phòng", "Hải Dương"], 62),
    "Thành phố Đà Nẵng": ("DN", "TP. Đà Nẵng", "48", "CENTRAL", "Miền Trung", ["Đà Nẵng", "Quảng Nam"], 72),
    "Đà Nẵng": ("DN", "TP. Đà Nẵng", "48", "CENTRAL", "Miền Trung", ["Đà Nẵng", "Quảng Nam"], 72),
    "Thành phố Huế": ("HUE", "TP. Huế", "46", "CENTRAL", "Miền Trung", ["Thừa Thiên Huế"], 48),
    "Huế": ("HUE", "TP. Huế", "46", "CENTRAL", "Miền Trung", ["Thừa Thiên Huế"], 48),
    "Thành phố Cần Thơ": ("CT", "TP. Cần Thơ", "92", "SOUTH", "Miền Nam", ["Cần Thơ", "Sóc Trăng", "Hậu Giang"], 46),
    "Cần Thơ": ("CT", "TP. Cần Thơ", "92", "SOUTH", "Miền Nam", ["Cần Thơ", "Sóc Trăng", "Hậu Giang"], 46),
    "Bắc Ninh": ("BN", "Tỉnh Bắc Ninh", "24", "NORTH", "Miền Bắc", ["Bắc Ninh", "Bắc Giang"], 56),
    "Hưng Yên": ("HY", "Tỉnh Hưng Yên", "33", "NORTH", "Miền Bắc", ["Hưng Yên", "Thái Bình"], 64),
    "Đồng Nai": ("DNAI", "Tỉnh Đồng Nai", "75", "SOUTH", "Miền Nam", ["Đồng Nai", "Bình Phước"], 48),
    "Quảng Ninh": ("QNI", "Tỉnh Quảng Ninh", "22", "NORTH", "Miền Bắc", ["Quảng Ninh"], 58),
    "Khánh Hòa": ("KH", "Tỉnh Khánh Hòa", "56", "CENTRAL", "Miền Trung", ["Khánh Hòa", "Ninh Thuận"], 68),
    "Lâm Đồng": ("LD", "Tỉnh Lâm Đồng", "68", "CENTRAL", "Miền Trung", ["Lâm Đồng", "Bình Thuận", "Đắk Nông"], 55),
    "Ninh Bình": ("NB", "Tỉnh Ninh Bình", "37", "NORTH", "Miền Bắc", ["Ninh Bình", "Hà Nam", "Nam Định"], 42),
    "Phú Thọ": ("PTH", "Tỉnh Phú Thọ", "25", "NORTH", "Miền Bắc", ["Phú Thọ", "Vĩnh Phúc", "Hòa Bình"], 38),
    "Thái Nguyên": ("TNG", "Tỉnh Thái Nguyên", "19", "NORTH", "Miền Bắc", ["Thái Nguyên", "Bắc Kạn"], 35),
    "An Giang": ("AG", "Tỉnh An Giang", "91", "SOUTH", "Miền Nam", ["Kiên Giang", "An Giang"], 52),
    "Tây Ninh": ("TNI", "Tỉnh Tây Ninh", "80", "SOUTH", "Miền Nam", ["Long An", "Tây Ninh"], 38),
    "Thanh Hóa": ("TH", "Tỉnh Thanh Hóa", "38", "CENTRAL", "Miền Trung", ["Thanh Hóa"], 42),
    "Nghệ An": ("NA", "Tỉnh Nghệ An", "40", "CENTRAL", "Miền Trung", ["Nghệ An"], 40),
    "Gia Lai": ("GL", "Tỉnh Gia Lai", "52", "CENTRAL", "Miền Trung", ["Bình Định", "Gia Lai"], 44),
    "Đắk Lắk": ("DLK", "Tỉnh Đắk Lắk", "66", "CENTRAL", "Miền Trung", ["Đắk Lắk", "Phú Yên"], 38),
    "Quảng Trị": ("QT", "Tỉnh Quảng Trị", "44", "CENTRAL", "Miền Trung", ["Quảng Bình", "Quảng Trị"], 35),
    "Quảng Ngãi": ("QNG", "Tỉnh Quảng Ngãi", "51", "CENTRAL", "Miền Trung", ["Quảng Ngãi", "Kon Tum"], 34),
    "Đồng Tháp": ("DT", "Tỉnh Đồng Tháp", "82", "SOUTH", "Miền Nam", ["Tiền Giang", "Đồng Tháp"], 34),
    "Vĩnh Long": ("VL", "Tỉnh Vĩnh Long", "86", "SOUTH", "Miền Nam", ["Vĩnh Long", "Bến Tre", "Trà Vinh"], 32),
    "Cà Mau": ("CM", "Tỉnh Cà Mau", "96", "SOUTH", "Miền Nam", ["Cà Mau", "Bạc Liêu"], 28),
    "Hà Tĩnh": ("HT", "Tỉnh Hà Tĩnh", "42", "CENTRAL", "Miền Trung", ["Hà Tĩnh"], 32),
    "Lào Cai": ("LCA", "Tỉnh Lào Cai", "15", "NORTH", "Miền Bắc", ["Lào Cai", "Yên Bái"], 36),
    "Tuyên Quang": ("TQ", "Tỉnh Tuyên Quang", "08", "NORTH", "Miền Bắc", ["Tuyên Quang", "Hà Giang"], 28),
    "Lạng Sơn": ("LS", "Tỉnh Lạng Sơn", "20", "NORTH", "Miền Bắc", ["Lạng Sơn"], 30),
    "Cao Bằng": ("CB", "Tỉnh Cao Bằng", "04", "NORTH", "Miền Bắc", ["Cao Bằng"], 26),
    "Sơn La": ("SL", "Tỉnh Sơn La", "14", "NORTH", "Miền Bắc", ["Sơn La"], 28),
    "Điện Biên": ("DB", "Tỉnh Điện Biên", "11", "NORTH", "Miền Bắc", ["Điện Biên"], 26),
    "Lai Châu": ("LCH", "Tỉnh Lai Châu", "12", "NORTH", "Miền Bắc", ["Lai Châu"], 24),
}


def infer_zone_and_price(ward_name: str, unit_type: str, code34: str, default_base: int) -> tuple[str, float]:
    wl = ward_name.lower()
    if unit_type == "Đặc khu":
        return "ZONE_TOURISM_RESORT_COASTAL", round(default_base * 1.25, 1)
    if any(k in wl for k in ["hoàn kiếm", "ba đình", "bến nghé", "sài gòn", "thủ thiêm", "tây hồ", "cầu giấy", "đống đa", "hải châu", "xuân hòa", "bàn cờ"]):
        return "ZONE_CBD_URBAN_CORE", round(default_base * 1.65, 1)
    if any(k in wl for k in ["biển", "bãi cháy", "nha trang", "mũi né", "vũng tàu", "sầm sơn", "cửa lò", "sa pa", "đà lạt", "hội an", "phú quốc", "cát bà", "hạ long"]):
        return "ZONE_TOURISM_RESORT_COASTAL", round(default_base * 1.25, 1)
    if any(k in wl for k in ["đồng kỵ", "bát tràng", "ninh hiệp", "vạn phúc"]):
        return "ZONE_CRAFT_VILLAGE_HERITAGE", round(default_base * 1.2, 1)
    if any(k in wl for k in ["yên phong", "quế võ", "từ sơn", "việt yên", "dĩ an", "thuận an", "bến cát", "tân uyên", "phú mỹ", "phổ yên", "bình xuyên"]):
        return "ZONE_INDUSTRIAL_FDI_PARK", round(default_base * 1.08, 1)
    if unit_type == "Phường":
        return "ZONE_CBD_URBAN_CORE", float(default_base)
    return "ZONE_SUBURBAN_RESIDENTIAL_AGRI", round(default_base * 0.68, 1)


def main():
    print("Downloading BenaAsia & VietMap datasets ...")
    bn_items = json.loads(urllib.request.urlopen(BENA_URL).read().decode("utf-8"))
    vm_provs = json.loads(urllib.request.urlopen(VIETMAP_PROV_URL).read().decode("utf-8"))
    vm_wards = json.loads(urllib.request.urlopen(VIETMAP_WARD_URL).read().decode("utf-8"))

    # Build lookup of BenaAsia items by (code34, slug) and (code34, exact_name)
    bena_by_key = {}
    for item in bn_items:
        p_raw = nfc(item.get("province_name", ""))
        short_p = p_raw.replace("Thành phố ", "").replace("Tỉnh ", "").strip()
        p_info = PROVINCE_NAME_TO_CODE34.get(p_raw) or PROVINCE_NAME_TO_CODE34.get(short_p)
        c34 = p_info[0] if p_info else "HN"
        w_name = nfc(item.get("ward_name", ""))
        w_slug = slugify_vi(w_name)
        bena_by_key[(c34, w_slug)] = item

    provinces_summary = {}
    normalized_wards = []

    for vm_code, vm_w in vm_wards.items():
        vm_prov = vm_provs.get(str(vm_w.get("parent_code", "")), {})
        prov_name_raw = nfc(vm_prov.get("name", ""))
        p_info = PROVINCE_NAME_TO_CODE34.get(prov_name_raw) or PROVINCE_NAME_TO_CODE34.get(nfc(vm_prov.get("name_with_type", "")))
        code34, name34, gso_prov_code, region, region_label, legacy63_list, default_base = p_info

        vm_type = vm_w.get("type", "xa")
        if vm_type == "phuong":
            unit_type = "Phường"
        elif vm_type == "dac-khu":
            unit_type = "Đặc khu"
        else:
            unit_type = "Xã"

        raw_name_with_type = nfc(vm_w.get("name_with_type", ""))
        # Standardize "Đặc Khu" -> "Đặc khu"
        ward_name = raw_name_with_type.replace("Đặc Khu ", "Đặc khu ")
        w_slug = slugify_vi(ward_name)

        bn_match = bena_by_key.get((code34, w_slug))
        if bn_match:
            ward_code = nfc(bn_match.get("ward_code", "")) or str(vm_code).zfill(5)
            has_merger = bool(bn_match.get("has_merger", False))
            old_units = [nfc(u) for u in (bn_match.get("old_units") or [])]
            merger_details = nfc(bn_match.get("merger_details") or "")
            admin_center = nfc(bn_match.get("administrative_center") or legacy63_list[0])
        else:
            ward_code = str(vm_code).zfill(5)
            has_merger = False
            old_units = []
            merger_details = ""
            admin_center = legacy63_list[0]

        zone_code, base_price_m2 = infer_zone_and_price(ward_name, unit_type, code34, default_base)

        if code34 not in provinces_summary:
            provinces_summary[code34] = {
                "code34": code34,
                "province_code_gso": gso_prov_code,
                "name34": name34,
                "place_type": "Thành phố trực thuộc TW" if name34.startswith("TP.") else "Tỉnh",
                "region": region,
                "region_label": region_label,
                "legacy63_list": legacy63_list,
                "administrative_center": admin_center,
                "total_units": 0,
                "phuong_count": 0,
                "xa_count": 0,
                "dac_khu_count": 0,
                "merged_units_count": 0,
                "unchanged_units_count": 0,
            }

        ps = provinces_summary[code34]
        ps["total_units"] += 1
        if unit_type == "Phường":
            ps["phuong_count"] += 1
        elif unit_type == "Xã":
            ps["xa_count"] += 1
        elif unit_type == "Đặc khu":
            ps["dac_khu_count"] += 1

        if has_merger:
            ps["merged_units_count"] += 1
        else:
            ps["unchanged_units_count"] += 1

        normalized_wards.append({
            "ward_code": ward_code,
            "ward_name": ward_name,
            "unit_type": unit_type,
            "code34": code34,
            "province_code_gso": gso_prov_code,
            "province_name": name34,
            "region": region,
            "region_label": region_label,
            "legacy63_list": legacy63_list,
            "administrative_center": admin_center,
            "has_merger": has_merger,
            "old_units_count": len(old_units),
            "old_units": old_units,
            "merger_details": merger_details if merger_details else "Giữ nguyên / Sắp xếp theo Nghị quyết UBTVQH",
            "zone_code": zone_code,
            "base_price_m2": base_price_m2,
        })

    provinces_list = sorted(provinces_summary.values(), key=lambda x: (-x["total_units"], x["name34"]))
    type_order = {"Phường": 1, "Đặc khu": 2, "Xã": 3}
    normalized_wards.sort(key=lambda x: (x["code34"], type_order.get(x["unit_type"], 9), x["ward_name"]))

    total_phuong = sum(p["phuong_count"] for p in provinces_list)
    total_xa = sum(p["xa_count"] for p in provinces_list)
    total_dac_khu = sum(p["dac_khu_count"] for p in provinces_list)

    payload = {
        "metadata": {
            "title": "Danh mục Toàn bộ 3.321 Phường, Xã, Đặc khu Việt Nam hiện nay (34 Tỉnh/Thành phố)",
            "legal_basis": "Nghị quyết 202/2025/QH15 của Quốc hội, 34 Nghị quyết của UBTVQH và Quyết định 19/2025/QĐ-TTg (áp dụng từ 01/07/2025)",
            "total_provinces": len(provinces_list),
            "total_commune_level_units": len(normalized_wards),
            "total_phuong": total_phuong,
            "total_xa": total_xa,
            "total_dac_khu": total_dac_khu,
        },
        "provinces_summary": provinces_list,
        "wards": normalized_wards,
    }

    os.makedirs("data", exist_ok=True)
    os.makedirs(os.path.join("webapp", "public", "data"), exist_ok=True)
    os.makedirs("docs", exist_ok=True)

    for jp in [
        os.path.join("data", "vietnam_wards_3321_2025.json"),
        os.path.join("webapp", "public", "data", "vietnam_wards_3321_2025.json"),
    ]:
        with open(jp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    for cp in [
        os.path.join("data", "vietnam_wards_3321_2025.csv"),
        os.path.join("webapp", "public", "data", "vietnam_wards_3321_2025.csv"),
    ]:
        with open(cp, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([
                "STT",
                "Mã Phường/Xã (5 số)",
                "Tên Phường / Xã / Đặc khu Mới",
                "Loại Đơn vị",
                "Mã Tỉnh (PropValue)",
                "Mã Tỉnh (GSO)",
                "Tỉnh / Thành phố Mới (34 Tỉnh)",
                "Vùng Kinh tế",
                "Các Tỉnh/Thành Cũ (63 Tỉnh)",
                "Trụ sở Hành chính",
                "Có Sáp nhập",
                "Số Phường/Xã Cũ Gộp vào",
                "Chi tiết Phường/Xã/Thị trấn Cũ Trước Sáp nhập",
                "Phân khu Kinh tế Mặc định",
                "Đơn giá Cơ sở Tham chiếu (Triệu/m2)",
            ])
            for idx, w in enumerate(normalized_wards, 1):
                writer.writerow([
                    idx,
                    w["ward_code"],
                    w["ward_name"],
                    w["unit_type"],
                    w["code34"],
                    w["province_code_gso"],
                    w["province_name"],
                    w["region_label"],
                    ", ".join(w["legacy63_list"]),
                    w["administrative_center"],
                    "Có sáp nhập" if w["has_merger"] else "Giữ nguyên",
                    w["old_units_count"],
                    w["merger_details"],
                    w["zone_code"],
                    w["base_price_m2"],
                ])

    md_lines = [
        "# Danh mục Toàn bộ 3.321 Phường, Xã, Đặc khu Việt Nam Hiện nay (34 Tỉnh / Thành phố)",
        "",
        "> **Căn cứ pháp lý:** Nghị quyết số `202/2025/QH15` của Quốc hội về sắp xếp đơn vị hành chính cấp tỉnh, 34 Nghị quyết của Ủy ban Thường vụ Quốc hội về sắp xếp đơn vị hành chính cấp xã của 34 tỉnh/thành phố, và Quyết định số `19/2025/QĐ-TTg` của Thủ tướng Chính phủ ban hành Bảng danh mục và mã số các đơn vị hành chính Việt Nam (chính thức áp dụng từ **01/07/2025** theo mô hình chính quyền địa phương 2 cấp: **Tỉnh/Thành phố — Phường/Xã/Đặc khu**).",
        "",
        "## 1. Tổng quan Quy mô Hành chính Toàn quốc Hiện nay",
        "",
        "- **Tổng số đơn vị hành chính cấp tỉnh:** **34** (gồm **6 Thành phố trực thuộc Trung ương** và **28 Tỉnh**).",
        f"- **Tổng số đơn vị hành chính cấp xã toàn quốc:** **{len(normalized_wards):,}** đơn vị (giảm 66,9% từ 10.035 đơn vị cấp xã trước đây), bao gồm:",
        f"  - **Phường:** **{total_phuong:,}** phường",
        f"  - **Xã:** **{total_xa:,}** xã",
        f"  - **Đặc khu (Hải đảo):** **{total_dac_khu:,}** đặc khu",
        "",
        "## 2. Bảng Thống kê Số lượng Phường, Xã, Đặc khu theo 34 Tỉnh / Thành phố",
        "",
        "| STT | Mã Tỉnh | Tỉnh / Thành phố Mới (34 Tỉnh) | Tỉnh/Thành Cũ Hợp nhất (63 Tỉnh) | Vùng | Tổng ĐV Cấp Xã | Số Phường | Số Xã | Số Đặc khu |",
        "| :---: | :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: |",
    ]

    for idx, p in enumerate(provinces_list, 1):
        md_lines.append(
            f"| {idx} | `{p['code34']}` (`{p['province_code_gso']}`) | **{p['name34']}** | {', '.join(p['legacy63_list'])} | {p['region_label']} | **{p['total_units']}** | {p['phuong_count']} | {p['xa_count']} | {p['dac_khu_count']} |"
        )

    md_lines.append(
        f"| — | **TỔNG** | **Toàn quốc (34 Tỉnh / Thành phố)** | **63 Tỉnh / Thành phố lịch sử** | **3 Miền** | **{len(normalized_wards):,}** | **{total_phuong:,}** | **{total_xa:,}** | **{total_dac_khu:,}** |"
    )
    md_lines.append("")
    md_lines.append("## 3. Danh sách 13 Đặc khu Hải đảo Toàn quốc")
    md_lines.append("")
    md_lines.append("| STT | Mã 5 Số | Tên Đặc khu | Trực thuộc Tỉnh / Thành phố | Chi tiết ĐVHC Cũ Trước Sáp nhập |")
    md_lines.append("| :---: | :---: | :--- | :--- | :--- |")
    dac_khus = [w for w in normalized_wards if w["unit_type"] == "Đặc khu"]
    for idx, dk in enumerate(dac_khus, 1):
        md_lines.append(
            f"| {idx} | `{dk['ward_code']}` | **{dk['ward_name']}** | {dk['province_name']} (`{dk['code34']}`) | {dk['merger_details']} |"
        )

    md_lines.append("")
    md_lines.append("## 4. Danh mục Chi tiết Toàn bộ 3.321 Phường, Xã, Đặc khu theo Từng Tỉnh / Thành phố")
    md_lines.append("")

    by_prov_wards = defaultdict(list)
    for w in normalized_wards:
        by_prov_wards[w["code34"]].append(w)

    for idx, p in enumerate(provinces_list, 1):
        c34 = p["code34"]
        wlist = by_prov_wards[c34]
        md_lines.append(
            f"### 4.{idx}. {p['name34']} (`{c34}` — Mã GSO `{p['province_code_gso']}`) — {p['total_units']} đơn vị ({p['phuong_count']} Phường, {p['xa_count']} Xã, {p['dac_khu_count']} Đặc khu)"
        )
        md_lines.append(f"- **Hợp nhất từ:** {', '.join(p['legacy63_list'])}")
        md_lines.append("")
        md_lines.append("| STT | Mã 5 Số | Tên Phường / Xã / Đặc khu Mới | Loại | Phường / Xã / Thị trấn Cũ Hợp thành |")
        md_lines.append("| :---: | :---: | :--- | :---: | :--- |")
        for w_idx, w in enumerate(wlist, 1):
            md_lines.append(
                f"| {w_idx} | `{w['ward_code']}` | **{w['ward_name']}** | {w['unit_type']} | {w['merger_details']} |"
            )
        md_lines.append("")

    doc_path = os.path.join("docs", "09-danh-muc-3321-phuong-xa-dac-khu-viet-nam-2025.md")
    with open(doc_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines))

    print(f"Summary: {len(provinces_list)} provinces | {len(normalized_wards)} total units ({total_phuong} Phường, {total_xa} Xã, {total_dac_khu} Đặc khu)")
    for idx, p in enumerate(provinces_list, 1):
        print(f"{idx:2d}. [{p['code34']:4s} | GSO {p['province_code_gso']}] {p['name34']}: {p['total_units']} ({p['phuong_count']} P, {p['xa_count']} X, {p['dac_khu_count']} ĐK)")


if __name__ == "__main__":
    main()
