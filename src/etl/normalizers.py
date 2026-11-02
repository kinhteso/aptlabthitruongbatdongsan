"""
Bộ chuẩn hóa dữ liệu Bất động sản & Định giá Tự động AVM đa chiều (Tầng Silver & Gold):
- SalaryNormalizer: Chuẩn hóa đơn giá BĐS (Triệu VNĐ/m², quy đổi từ Tỷ VNĐ / m²) & cờ Giá thỏa thuận (cùng tương thích dải VNĐ/USD).
- TemporalNormalizer: Chuẩn hóa thời gian đăng tin, Quý/Tháng, Thời gian tồn kho thanh khoản (Time-on-Market / Vacancy Duration).
- GeoNormalizer: Phân giải Song hành 34 Tỉnh/Thành mới (Nghị quyết 202/2025/QH15) <-> 63 Tỉnh/Thành cũ,
  Cấp Phường/Xã (Ward-level), 6 Phân khu Kinh tế Đặc thù (CBD, KCN FDI, Làng nghề, Du lịch, CNC/TOD, Ven đô)
  và Động cơ Định giá Cấp Phường/Xã theo Empirical Bayes Spatial Shrinkage.
- RoleAndTierClassifier: Ánh xạ 4 Trụ cột Bất động sản (RE-01..RE-04 / DE-01..DE-04), 16 Phân khúc chuẩn và 6 Tầng Tháp Giá trị.
- SkillExtractor: Trích xuất 24 Thuộc tính Hedonic 4 Tầng (L1 Pháp lý - L2 Hình học/Đường ngõ - L3 Hạ tầng/TOD - L4 CĐT/Dòng tiền).
"""

from __future__ import annotations

import hashlib
import re
import shutil
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import yaml


def ensure_configs_populated(
    configs_dir: Path = Path("configs"),
    backup_dir: Path = Path("default_configs"),
) -> None:
    """
    Tự động khôi phục các tệp cấu hình YAML chuẩn từ `default_configs/` (đóng gói sẵn trong Docker image)
    sang `configs/` nếu người dùng chạy Docker Compose từ thư mục trống làm Bind Mount `./configs:/app/configs`
    che khuất thư mục `/app/configs` bên trong container.
    """
    try:
        if not backup_dir.exists():
            return
        configs_dir.mkdir(parents=True, exist_ok=True)
        for yaml_file in backup_dir.glob("*.yaml"):
            target_file = configs_dir / yaml_file.name
            if not target_file.exists() or target_file.stat().st_size == 0:
                shutil.copy2(yaml_file, target_file)
    except Exception:
        pass


ensure_configs_populated()


def slugify_vi(text: str) -> str:
    """Chuyển chuỗi tiếng Việt có dấu thành slug chuẩn dùng cho khử trùng lặp."""
    if not text:
        return "unknown"
    text = text.lower().strip()
    text = re.sub(r"[đĐ]", "d", text)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("utf-8")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "unknown"


def mask_pii_text(text: str) -> str:
    """Ẩn danh email và số điện thoại cá nhân tuân thủ Nghị định 13/2023/NĐ-CP."""
    if not text:
        return ""
    text = re.sub(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", "[EMAIL_MASKED]", text)
    text = re.sub(r"\b(?:\+84|84|0)(?:3|5|7|8|9)\d{8}\b", "[PHONE_MASKED]", text)
    return text


@dataclass
class SalaryResult:
    salary_type: str  # RANGE, UPPER_BOUND, LOWER_BOUND, EXACT, NEGOTIABLE
    is_negotiable: bool
    currency_original: str
    salary_min_vnd: Optional[float]
    salary_max_vnd: Optional[float]
    salary_mid_vnd: Optional[float]


class SalaryNormalizer:
    """
    Chuẩn hóa mọi định dạng giá niêm yết BĐS về đơn vị chuẩn Triệu VNĐ/m²
    (Hỗ trợ: '6.8 tỷ - 80m2', '125 triệu/m2', '8.5 tỷ', 'Giá thỏa thuận', và tương thích dải VNĐ/USD).
    """

    def __init__(self, usd_to_vnd_rate: float = 25400.0) -> None:
        self.usd_to_million_vnd = usd_to_vnd_rate / 1_000_000.0

    def parse(self, raw_salary: Optional[str], area_m2: Optional[float] = None) -> SalaryResult:
        if not raw_salary or not raw_salary.strip():
            return SalaryResult("NEGOTIABLE", True, "VND", None, None, None)

        s = raw_salary.lower().strip()
        negotiable_keywords = [
            "thỏa thuận", "thoả thuận", "thương lượng", "cạnh tranh",
            "liên hệ", "giá thỏa thuận", "negotiable", "competitive", "you'll love it", "attractive"
        ]
        if any(k in s for k in negotiable_keywords) and not re.search(r"\d", s):
            return SalaryResult("NEGOTIABLE", True, "VND", None, None, None)

        # --- NHÁNH 1: ĐỊNH DẠNG GIÁ BẤT ĐỘNG SẢN TƯỜNG MINH (TỶ VNĐ / TRIỆU/M2 / DIỆN TÍCH M2) ---
        has_billion_ty = bool(re.search(r"\b(?:tỷ|ty|tỉ)\b|\d+(?:[.,]\d+)?\s*(?:tỷ|ty|tỉ)", s))
        has_per_m2 = any(tok in s for tok in ["/m2", "/m²", "tr/m2", "triệu/m2", "tr/m²", "triệu/m²", "trieu/m2"])
        m_area_inline = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:m2|m²|mét vuông)\b", s)

        if has_billion_ty or has_per_m2 or (m_area_inline and area_m2 is not None):
            s_re = s
            extracted_area = area_m2
            if m_area_inline and not has_per_m2:
                extracted_area = float(m_area_inline.group(1).replace(",", "."))
                # Loại bỏ cụm diện tích khỏi chuỗi trước khi lấy số tiền
                s_re = s_re[:m_area_inline.start()] + " " + s_re[m_area_inline.end():]

            # Loại bỏ ký tự số '2' trong đơn vị 'm2' để không bị tách nhầm thành số tiền 2.0
            s_re = re.sub(r"m2|m²", "msq", s_re)
            s_re_clean = s_re.replace(",", ".")
            re_nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", s_re_clean)]
            if not re_nums:
                return SalaryResult("NEGOTIABLE", True, "VND", None, None, None)

            eff_area = extracted_area if (extracted_area and extracted_area > 5.0) else 75.0

            def to_unit_million_m2(val: float) -> float:
                if has_per_m2 and not has_billion_ty:
                    return round(val, 2)
                if has_billion_ty:
                    # Quy đổi từ Tỷ VNĐ (= 1000 Triệu VNĐ) chia cho diện tích m2
                    if has_per_m2:
                        return round(val * 1000.0, 2)
                    return round((val * 1000.0) / eff_area, 2)
                return round(val, 2)

            unit_vals = [to_unit_million_m2(v) for v in re_nums]
            MAX_RE_UNIT_VND = 850.0
            MIN_RE_UNIT_VND = 1.5

            if len(unit_vals) >= 2:
                low, high = min(unit_vals[0], unit_vals[1]), max(unit_vals[0], unit_vals[1])
                if low < MIN_RE_UNIT_VND or high > MAX_RE_UNIT_VND:
                    return SalaryResult("NEGOTIABLE", True, "VND", None, None, None)
                mid = round((low + high) / 2.0, 2)
                return SalaryResult("RANGE", False, "VND", low, high, mid)

            single_re = unit_vals[0]
            if single_re < MIN_RE_UNIT_VND or single_re > MAX_RE_UNIT_VND:
                return SalaryResult("NEGOTIABLE", True, "VND", None, None, None)
            return SalaryResult("EXACT", False, "VND", single_re, single_re, single_re)

        # --- NHÁNH 2: ĐỊNH DẠNG DẢI SỐ TIÊU CHUẨN (VNĐ / USD / RANGE) ---
        has_k_unit = any(tok in s for tok in ["k", "nghìn", "ngàn"])
        has_vnd_million_unit = (
            any(tok in s for tok in ["triệu", "tr", "trieu", "củ", "₫", "vnđ", "vnd", "đồng"])
            or bool(re.search(r"\b\d+(?:\.\d+)?\s*(?:m|mil)\b", s))
        )
        is_usd = (not has_vnd_million_unit) and any(tok in s for tok in ["usd", "$", "đô"])
        is_annual = any(
            tok in s
            for tok in ["/năm", "/ năm", "mỗi năm", "tr/năm", "triệu/năm", "/year", "/yr", "per year", "annual"]
        )

        s_clean = re.sub(r"(\d),(\d{3})\b", r"\1\2", s)
        s_clean = s_clean.replace(",", ".")

        nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", s_clean)]
        if not nums:
            return SalaryResult("NEGOTIABLE", True, "USD" if is_usd else "VND", None, None, None)

        if not is_usd and not has_k_unit and not has_vnd_million_unit:
            max_num = max(nums)
            if 180.0 <= max_num < 100_000.0:
                is_usd = True

        currency = "USD" if is_usd else "VND"

        def to_million_vnd(val: float) -> float:
            if is_usd:
                res = val * self.usd_to_million_vnd
            elif val >= 1_000_000:
                res = val / 1_000_000.0
            elif val >= 1_000 and has_k_unit:
                res = val / 1_000.0
            else:
                res = val
            if is_annual:
                res = res / 12.0
            return round(res, 2)

        vals = [to_million_vnd(n) for n in nums]

        MAX_REALISTIC_HIGH_VND = 90.0
        MAX_REALISTIC_MID_VND = 82.0
        MIN_REALISTIC_VND = 1.5

        if len(vals) >= 2:
            low, high = min(vals[0], vals[1]), max(vals[0], vals[1])
            if low == 0.0 and high > 0.0:
                if high > MAX_REALISTIC_HIGH_VND or high < MIN_REALISTIC_VND:
                    return SalaryResult("NEGOTIABLE", True, currency, None, None, None)
                low_bound = round(high * 0.70, 2)
                mid_bound = round((low_bound + high) / 2.0, 2)
                if mid_bound > MAX_REALISTIC_MID_VND:
                    return SalaryResult("NEGOTIABLE", True, currency, None, None, None)
                return SalaryResult("UPPER_BOUND", False, currency, low_bound, high, mid_bound)

            if low < MIN_REALISTIC_VND or low > MAX_REALISTIC_MID_VND:
                return SalaryResult("NEGOTIABLE", True, currency, None, None, None)

            if low > 0 and (high / low > 2.4) and high >= 50.0:
                high = round(min(high, low * 1.45), 2)

            if high > MAX_REALISTIC_HIGH_VND or high < MIN_REALISTIC_VND:
                return SalaryResult("NEGOTIABLE", True, currency, None, None, None)
            mid = round((low + high) / 2.0, 2)
            if mid > MAX_REALISTIC_MID_VND:
                return SalaryResult("NEGOTIABLE", True, currency, None, None, None)
            return SalaryResult("RANGE", False, currency, low, high, mid)

        single = vals[0]
        if single > MAX_REALISTIC_HIGH_VND or single < MIN_REALISTIC_VND:
            return SalaryResult("NEGOTIABLE", True, currency, None, None, None)
        if any(k in s for k in ["tới", "đến", "up to", "upto", "dưới", "tối đa", "max"]):
            low = round(single * 0.70, 2)
            mid = round((low + single) / 2.0, 2)
            if mid > MAX_REALISTIC_MID_VND:
                return SalaryResult("NEGOTIABLE", True, currency, None, None, None)
            return SalaryResult("UPPER_BOUND", False, currency, low, single, mid)

        if any(k in s for k in ["từ", "trên", "from", "over", "tối thiểu", "min", "ít nhất"]):
            if single > MAX_REALISTIC_MID_VND:
                return SalaryResult("NEGOTIABLE", True, currency, None, None, None)
            high = round(min(MAX_REALISTIC_HIGH_VND, single * 1.30), 2)
            mid = round((single + high) / 2.0, 2)
            if mid > MAX_REALISTIC_MID_VND:
                return SalaryResult("NEGOTIABLE", True, currency, None, None, None)
            return SalaryResult("LOWER_BOUND", False, currency, single, high, mid)

        if single > MAX_REALISTIC_MID_VND:
            return SalaryResult("NEGOTIABLE", True, currency, None, None, None)
        return SalaryResult("EXACT", False, currency, single, single, single)


@dataclass
class TemporalResult:
    published_date: date
    expired_date: Optional[date]
    year_month: str
    year_quarter: str
    vacancy_duration_days: int


class TemporalNormalizer:
    """Chuẩn hóa ngày đăng tin, hạn hiển thị và tính vòng đời thanh khoản tin đăng BĐS (Time-on-Market)."""

    def parse(
        self,
        raw_published: Optional[str],
        raw_expired: Optional[str] = None,
        scraped_at: Optional[datetime] = None,
    ) -> TemporalResult:
        ref_dt = scraped_at or datetime.now()
        ref_date = ref_dt.date()
        pub_date = self._parse_single_date(raw_published, ref_date, is_expiry=False) or ref_date
        exp_date = self._parse_single_date(raw_expired, ref_date, is_expiry=True)

        duration = 1
        if exp_date and exp_date >= pub_date:
            duration = max(1, (exp_date - pub_date).days)
        elif ref_date >= pub_date:
            duration = max(1, (ref_date - pub_date).days + 1)

        quarter = (pub_date.month - 1) // 3 + 1
        return TemporalResult(
            published_date=pub_date,
            expired_date=exp_date,
            year_month=pub_date.strftime("%Y-%m"),
            year_quarter=f"{pub_date.year}-Q{quarter}",
            vacancy_duration_days=duration,
        )

    def _parse_single_date(self, text: Optional[str], ref_date: date, is_expiry: bool) -> Optional[date]:
        if not text:
            return None
        s = str(text).lower().strip()

        m_iso = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", s)
        if m_iso:
            try:
                return date(int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3)))
            except ValueError:
                pass

        m_vn = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", s)
        if m_vn:
            try:
                return date(int(m_vn.group(3)), int(m_vn.group(2)), int(m_vn.group(1)))
            except ValueError:
                pass

        if any(k in s for k in ["hôm nay", "today", "vừa đăng", "giờ trước", "phút trước"]):
            return ref_date
        if any(k in s for k in ["hôm qua", "yesterday"]):
            return ref_date - timedelta(days=1)

        m_rel = re.search(r"(\d+)\s*(ngày|tuần|tháng|day|week|month)", s)
        if m_rel:
            val = int(m_rel.group(1))
            unit = m_rel.group(2)
            days = val * (7 if unit in ("tuần", "week") else 30 if unit in ("tháng", "month") else 1)
            return (ref_date + timedelta(days=days)) if is_expiry else (ref_date - timedelta(days=days))

        return None


@dataclass
class GeoResult:
    macro_region: str
    city_code: str
    urban_tier: str
    district_cluster: Optional[str]
    work_mode: str
    province_34_code: str = "OTHER"
    province_34_name: str = "Tỉnh/Thành khác"
    legacy_province_63: str = "Other"
    ward_code: Optional[str] = None
    ward_name: Optional[str] = None
    economic_zone_type: str = "ZONE_SUBURBAN_RESIDENTIAL_AGRI"


class GeoNormalizer:
    """
    Phân giải địa lý Kép (Dual-Address Resolution):
    - Hệ thống 34 Tỉnh/Thành mới (Nghị quyết 202/2025/QH15: 6 TP trực thuộc TW + 28 Tỉnh)
    - Hệ thống 63 Tỉnh/Thành lịch sử (vẫn tồn tại song song trên tin đăng BĐS)
    - Phân giải Cấp Phường/Xã (Ward-level) và 6 Phân khu Kinh tế Đặc thù:
      + ZONE_CBD_URBAN_CORE (Lõi CBD)
      + ZONE_INDUSTRIAL_FDI_PARK (Đô thị Khu công nghiệp FDI)
      + ZONE_CRAFT_VILLAGE_HERITAGE (Làng nghề truyền thống giàu có)
      + ZONE_TOURISM_RESORT_COASTAL (Đặc khu Du lịch Biển / Nghỉ dưỡng)
      + ZONE_HITECH_UNIVERSITY_TOD (Khu Công nghệ cao / Đại học / Metro TOD)
      + ZONE_SUBURBAN_RESIDENTIAL_AGRI (Khu Dân cư Ven đô / Nông thôn mới)
    """

    def __init__(self, config_path: Path) -> None:
        with open(config_path, "r", encoding="utf-8") as f:
            self.cfg = yaml.safe_load(f)

    def _detect_economic_zone(self, combined_text: str, default_zone: str = "ZONE_SUBURBAN_RESIDENTIAL_AGRI") -> str:
        zones_cfg = self.cfg.get("economic_zones", {})
        # Thứ tự ưu tiên nhận diện phân khu chức năng đặc thù
        priority_zones = [
            "ZONE_CRAFT_VILLAGE_HERITAGE",
            "ZONE_INDUSTRIAL_FDI_PARK",
            "ZONE_TOURISM_RESORT_COASTAL",
            "ZONE_HITECH_UNIVERSITY_TOD",
            "ZONE_CBD_URBAN_CORE",
            "ZONE_SUBURBAN_RESIDENTIAL_AGRI",
        ]
        for z_code in priority_zones:
            z_info = zones_cfg.get(z_code, {})
            if any(kw.lower() in combined_text for kw in z_info.get("keywords", [])):
                return z_code
        return default_zone

    def _detect_ward(
        self, p34_code: str, combined_text: str
    ) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str], Optional[float]]:
        """Trả về (ward_code, ward_name, legacy_province_63, economic_zone_type, benchmark_m2_vnd) nếu khớp sample_wards."""
        p34_cfg = self.cfg.get("provinces_34_registry", {}).get(p34_code, {})
        sample_wards = p34_cfg.get("sample_wards", [])
        if isinstance(sample_wards, dict):
            ward_items = [{"ward_code": k, **v} for k, v in sample_wards.items()]
        else:
            ward_items = list(sample_wards or [])

        for w_info in ward_items:
            w_code = w_info.get("ward_code")
            w_name = w_info.get("ward_name") or w_info.get("name_vi", "")
            clean_name = re.sub(r"\([^)]*\)", "", w_name).strip().lower()
            short_name = re.sub(r"^(phường|xã|thị trấn)\s+", "", clean_name).strip()
            candidates = [clean_name]
            if len(short_name) >= 4:
                candidates.append(short_name)
            if any(cand and cand in combined_text for cand in candidates):
                return (
                    w_code,
                    w_name,
                    w_info.get("legacy_province_63"),
                    w_info.get("zone") or w_info.get("economic_zone"),
                    float(w_info.get("benchmark_m2_vnd") or w_info.get("base_price_m2") or 55.0),
                )
        return None, None, None, None, None

    def _detect_legacy_province_63(self, legacy_list: List[str], combined_text: str, default_val: str = "Other") -> str:
        if not legacy_list:
            return default_val
        norm_comb = slugify_vi(combined_text).replace("-", " ")
        for leg in legacy_list:
            leg_low = leg.lower()
            leg_slug = slugify_vi(leg).replace("-", " ")
            if leg_low in combined_text or (leg_slug and leg_slug in norm_comb):
                return leg
        return default_val if default_val != "Other" else legacy_list[0]

    def parse(self, raw_location: Optional[str], full_text: str = "") -> GeoResult:
        loc_text = (raw_location or "").lower()
        combined = f"{loc_text} {full_text.lower()}"

        # 1. Xác định Pháp lý / Hình thức (Work Mode / Legal Transaction Mode)
        work_mode = "ONSITE"
        for mode, m_cfg in self.cfg.get("work_modes", {}).items():
            if any(k in combined for k in m_cfg.get("keywords", [])):
                work_mode = mode
                break

        # 2. Xác định trong nhóm Đô thị trọng điểm (`cities`)
        for city_code, c_cfg in self.cfg.get("cities", {}).items():
            if any(alias in loc_text or alias in combined for alias in c_cfg.get("aliases", [])):
                p34_code = c_cfg.get("province_34_code", city_code)
                p34_cfg = self.cfg.get("provinces_34_registry", {}).get(p34_code, {})
                cluster_found = None
                cluster_zone = None
                for cl_code, cl_cfg in c_cfg.get("district_clusters", {}).items():
                    if any(kw in combined for kw in cl_cfg.get("keywords", [])):
                        cluster_found = cl_code
                        cluster_zone = cl_cfg.get("zone_type")
                        break

                w_code, w_name, w_leg63, w_zone, _ = self._detect_ward(p34_code, combined)
                legacy_candidates = p34_cfg.get("legacy_63_names", []) or c_cfg.get("legacy_provinces_63", [])
                default_leg = c_cfg.get("legacy_province_63") or (legacy_candidates[0] if legacy_candidates else c_cfg.get("name_vi", city_code))
                leg63 = w_leg63 or self._detect_legacy_province_63(legacy_candidates, combined, default_val=default_leg)
                default_zone = cluster_zone or ("ZONE_CBD_URBAN_CORE" if c_cfg.get("urban_tier") in ("TIER_SPECIAL", "TIER_1_HUB", "TIER_1_CORE") else "ZONE_SUBURBAN_RESIDENTIAL_AGRI")
                econ_zone = w_zone or self._detect_economic_zone(combined, default_zone=default_zone)

                return GeoResult(
                    macro_region=c_cfg["macro_region"],
                    city_code=city_code,
                    urban_tier=c_cfg["urban_tier"],
                    district_cluster=cluster_found,
                    work_mode=work_mode,
                    province_34_code=p34_code,
                    province_34_name=p34_cfg.get("name_vi", c_cfg.get("name_vi", city_code)),
                    legacy_province_63=leg63,
                    ward_code=w_code,
                    ward_name=w_name,
                    economic_zone_type=econ_zone,
                )

        # 3. Quét toàn bộ 34 Tỉnh/Thành mới (`provinces_34_registry`) và 63 Tỉnh/Thành lịch sử
        for p34_code, p_cfg in self.cfg.get("provinces_34_registry", {}).items():
            legacy_list = p_cfg.get("legacy_63_names", []) or p_cfg.get("legacy_provinces_63", [])
            name_vi = p_cfg.get("name_vi", p34_code)
            search_terms = [name_vi.lower()] + [x.lower() for x in legacy_list]
            if any(term in combined for term in search_terms):
                w_code, w_name, w_leg63, w_zone, _ = self._detect_ward(p34_code, combined)
                leg63 = w_leg63 or self._detect_legacy_province_63(legacy_list, combined)
                dominant_zones = p_cfg.get("dominant_zones", ["ZONE_SUBURBAN_RESIDENTIAL_AGRI"])
                econ_zone = w_zone or self._detect_economic_zone(combined, default_zone=dominant_zones[0])
                return GeoResult(
                    macro_region=p_cfg.get("macro_region", "NATIONWIDE"),
                    city_code=p34_code,
                    urban_tier=p_cfg.get("urban_tier", "TIER_2_PROVINCIAL"),
                    district_cluster=None,
                    work_mode=work_mode,
                    province_34_code=p34_code,
                    province_34_name=name_vi,
                    legacy_province_63=leg63,
                    ward_code=w_code,
                    ward_name=w_name,
                    economic_zone_type=econ_zone,
                )

        if work_mode == "REMOTE":
            return GeoResult("GLOBAL_REMOTE", "REMOTE", "TIER_SPECIAL", None, "REMOTE")

        return GeoResult("NATIONWIDE", "OTHER", "TIER_OTHER", None, work_mode)

    def estimate_ward_level_price(
        self,
        raw_location: str,
        full_text: str = "",
        career_tier: str = "T3_JUNIOR",
        area_m2: float = 75.0,
        frontage_m: float = 5.0,
        alley_width_m: float = 6.0,
        has_red_book: bool = True,
        observed_ward_samples: int = 18,
        observed_ward_mean_price: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Định giá Bất động sản Cấp Phường/Xã (Ward-Level AVM) theo Hierarchical Empirical Bayes Spatial Shrinkage:
            B_hat_ward = omega_w * P_bar_ward_DB + (1 - omega_w) * P_hat_parent_prior
            trong đó omega_w = n_w / (n_w + kappa), kappa = 15.
        Kết hợp Hệ số Phân khu Kinh tế Đặc thù (CBD, KCN FDI, Làng nghề, Du lịch, CNC/TOD, Ven đô)
        và Điều chỉnh Hedonic Vi mô (Pháp lý Sổ đỏ, Độ rộng ngõ/mặt phố, Mặt tiền, Phân tầng).
        """
        geo = self.parse(raw_location, full_text)
        ward_engine_cfg = self.cfg.get("ward_valuation_engine", {})
        kappa = float(ward_engine_cfg.get("shrinkage_prior_strength_m", ward_engine_cfg.get("shrinkage_kappa_prior_strength", 15)))

        # 1. Lấy đơn giá chuẩn cấp Tỉnh/Thành (Parent Prior) và Phường mẫu (nếu có)
        p34_cfg = self.cfg.get("provinces_34_registry", {}).get(geo.province_34_code, {})
        sal_mult = float(p34_cfg.get("salary_multiplier_benchmark", 0.60))
        province_base_median = float(p34_cfg.get("base_price_m2_median", round(sal_mult * 85.0, 2)))

        zones_cfg = self.cfg.get("economic_zones", {})
        zone_info = zones_cfg.get(geo.economic_zone_type, {})
        zone_mult = float(zone_info.get("price_multiplier", zone_info.get("hedonic_spatial_multiplier", 1.0)))

        # Kiểm tra xem Phường/Xã có nằm trong danh mục chuẩn sample_wards không
        _, _, _, _, ward_prior_median = self._detect_ward(geo.province_34_code, f"{raw_location.lower()} {full_text.lower()}")

        parent_prior_m2 = ward_prior_median if ward_prior_median is not None else round(province_base_median * zone_mult, 2)
        obs_mean = observed_ward_mean_price if observed_ward_mean_price is not None else round(parent_prior_m2 * 1.03, 2)

        # 2. Trọng số co rút Empirical Bayes (omega_w)
        n_w = max(0, int(observed_ward_samples))
        omega_w = round(n_w / (n_w + kappa), 4)
        eb_ward_baseline_m2 = round(omega_w * obs_mean + (1.0 - omega_w) * parent_prior_m2, 2)

        # 3. Hệ số điều chỉnh Hedonic Vi mô (Pháp lý, Đường ngõ, Mặt tiền, Phân tầng)
        tier_multipliers = {
            "T1_INTERN": 0.68,
            "T2_FRESHER": 0.85,
            "T3_JUNIOR": 1.00,
            "T4_MIDDLE_SENIOR": 1.32,
            "T5_LEAD_MANAGER": 1.75,
            "T6_DIRECTOR": 2.45,
        }
        tier_mult = tier_multipliers.get(career_tier, 1.00)
        legal_mult = 1.08 if has_red_book else 0.78
        alley_mult = 1.22 if alley_width_m >= 10.0 else (1.08 if alley_width_m >= 4.5 else (0.95 if alley_width_m >= 2.8 else 0.82))
        frontage_mult = 1.08 if frontage_m >= 6.0 else (1.02 if frontage_m >= 4.2 else 0.94)

        hedonic_combined_mult = round(tier_mult * legal_mult * alley_mult * frontage_mult, 4)
        unit_p50 = round(eb_ward_baseline_m2 * hedonic_combined_mult, 2)
        # Độ rộng dải phân vị phụ thuộc vào cỡ mẫu n_w (mẫu càng nhỏ dải P10-P90 càng rộng)
        uncertainty_band = 0.14 if n_w >= 20 else (0.20 if n_w >= 8 else 0.28)
        unit_p10 = round(unit_p50 * (1.0 - uncertainty_band), 2)
        unit_p25 = round(unit_p50 * (1.0 - uncertainty_band * 0.52), 2)
        unit_p75 = round(unit_p50 * (1.0 + uncertainty_band * 0.55), 2)
        unit_p90 = round(unit_p50 * (1.0 + uncertainty_band * 1.10), 2)

        total_billion_p50 = round((unit_p50 * area_m2) / 1000.0, 2)
        total_billion_p10 = round((unit_p10 * area_m2) / 1000.0, 2)
        total_billion_p90 = round((unit_p90 * area_m2) / 1000.0, 2)

        return {
            "dual_address_resolution": {
                "province_34_code": geo.province_34_code,
                "province_34_name": geo.province_34_name,
                "legacy_province_63": geo.legacy_province_63,
                "city_code": geo.city_code,
                "district_cluster": geo.district_cluster,
                "ward_code": geo.ward_code or f"WARD_{geo.province_34_code}_GENERIC",
                "ward_name": geo.ward_name or raw_location,
                "economic_zone_type": geo.economic_zone_type,
                "economic_zone_name_vi": zone_info.get("name_vi", geo.economic_zone_type),
                "macro_region": geo.macro_region,
            },
            "empirical_bayes_shrinkage": {
                "observed_ward_samples_n": n_w,
                "prior_strength_kappa": kappa,
                "shrinkage_weight_omega": omega_w,
                "parent_prior_unit_price_m2": parent_prior_m2,
                "observed_ward_mean_m2": obs_mean,
                "eb_ward_baseline_m2": eb_ward_baseline_m2,
                "economic_zone_multiplier": zone_mult,
                "hedonic_micro_multiplier": hedonic_combined_mult,
            },
            "valuation_result": {
                "unit_price_p10_million_m2": unit_p10,
                "unit_price_p25_million_m2": unit_p25,
                "unit_price_p50_million_m2": unit_p50,
                "unit_price_p75_million_m2": unit_p75,
                "unit_price_p90_million_m2": unit_p90,
                "area_m2": area_m2,
                "total_price_p10_billion_vnd": total_billion_p10,
                "total_price_p50_billion_vnd": total_billion_p50,
                "total_price_p90_billion_vnd": total_billion_p90,
                "confidence_tier": "HIGH_WARD_CONFIDENCE" if n_w >= 20 else ("MEDIUM_EB_SHRINKAGE" if n_w >= 5 else "SPATIAL_PRIOR_FALLBACK"),
            },
        }


@dataclass
class RoleTierResult:
    sector_pillar: str
    canonical_role: str
    role_confidence: float
    career_tier: str
    exp_years_min: float
    exp_years_max: float
    exp_years_mid: float


class RoleAndTierClassifier:
    """Phân loại tin đăng vào 4 Trụ cột Bất động sản (RE-01..RE-04 / DE-01..DE-04), 16 Phân khúc và 6 Tầng Tháp Giá trị."""

    def __init__(self, config_path: Path) -> None:
        with open(config_path, "r", encoding="utf-8") as f:
            self.cfg = yaml.safe_load(f)

    def classify(
        self,
        job_title: str,
        raw_experience: Optional[str] = None,
        raw_level: Optional[str] = None,
    ) -> RoleTierResult:
        title_lower = (job_title or "").lower()

        # 1. Phân loại Trụ cột & Phân khúc chuẩn (Canonical Role / Property Segment)
        matched_pillar = "UNCLASSIFIED"
        matched_role = "UNCLASSIFIED"
        best_len = 0

        for pillar_code, p_cfg in self.cfg.get("pillars", {}).items():
            for role_code, r_cfg in p_cfg.get("roles", {}).items():
                for alias in r_cfg.get("title_aliases", []):
                    if alias.lower() in title_lower and len(alias) > best_len:
                        matched_pillar = pillar_code
                        matched_role = role_code
                        best_len = len(alias)

        confidence = 0.95 if matched_role != "UNCLASSIFIED" else 0.30

        # 2. Bóc tách thông số quy mô / năm kinh nghiệm tương đương
        exp_min, exp_max = self._parse_experience_years(raw_experience, title_lower)
        exp_mid = round((exp_min + exp_max) / 2.0, 1)

        # 3. Xác định Tầng Tháp Giá trị (T1_INTERN / T1_AFFORDABLE .. T6_DIRECTOR / T6_TROPHY_ULTRA)
        tier = self._determine_tier(title_lower, (raw_level or "").lower(), exp_mid)

        return RoleTierResult(
            sector_pillar=matched_pillar,
            canonical_role=matched_role,
            role_confidence=confidence,
            career_tier=tier,
            exp_years_min=exp_min,
            exp_years_max=exp_max,
            exp_years_mid=exp_mid,
        )

    def _parse_experience_years(self, raw_exp: Optional[str], title_lower: str) -> Tuple[float, float]:
        s = (raw_exp or "").lower()
        if any(
            k in s or k in title_lower
            for k in ["không yêu cầu kinh nghiệm", "no experience", "intern", "thực tập", "thuc tap", "nhà ở xã hội", "noxh"]
        ):
            return 0.0, 0.5
        if any(k in s or k in title_lower for k in ["dưới 1 năm", "fresher", "mới tốt nghiệp", "studio", "chung cư mini"]):
            return 0.0, 1.0

        nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", s)]
        if len(nums) >= 2:
            return min(nums[0], nums[1]), max(nums[0], nums[1])
        if len(nums) == 1:
            val = nums[0]
            if "tháng" in s or "month" in s:
                yr = round(val / 12.0, 1)
                return yr, yr
            # Nếu truyền diện tích m2 (VD: "80 m2" -> quy chiếu sang thang năm tương đương 1..10 để giữ tương thích Mincer/Hedonic)
            if "m2" in s or "m²" in s:
                scaled = round(min(12.0, max(0.5, (val - 25.0) / 18.0)), 1)
                return scaled, round(scaled + 0.5, 1)
            return val, round(val + 1.0, 1)

        return 1.0, 2.0

    def _determine_tier(self, title_lower: str, level_lower: str, exp_mid: float) -> str:
        combined = f"{title_lower} {level_lower}"
        if any(kw in title_lower for kw in ["trợ lý", "thư ký", "assistant", "secretary", "pa to ", "ea to "]):
            if exp_mid < 0.4:
                return "T1_INTERN"
            if exp_mid <= 1.0:
                return "T2_FRESHER"
            if exp_mid <= 2.5:
                return "T3_JUNIOR"
            return "T4_MIDDLE_SENIOR"

        explicit_priority_order = [
            "T6_DIRECTOR",
            "T5_LEAD_MANAGER",
            "T1_INTERN",
            "T2_FRESHER",
            "T4_MIDDLE_SENIOR",
        ]
        tiers_cfg = self.cfg.get("career_tiers", {})
        for t_code in explicit_priority_order:
            kws = tiers_cfg.get(t_code, {}).get("title_keywords", [])
            if any(re.search(rf"\b{re.escape(kw)}\b", combined) for kw in kws):
                if t_code == "T4_MIDDLE_SENIOR" and 0 < exp_mid <= 1.6 and any(w in combined for w in ["senior", "sr"]):
                    return "T3_JUNIOR"
                return t_code

        if any(re.search(rf"\b{kw}\b", combined) for kw in ["junior", "jr"]):
            return "T3_JUNIOR"

        if exp_mid < 0.4:
            return "T1_INTERN"
        if exp_mid <= 1.0:
            return "T2_FRESHER"
        if exp_mid <= 2.5:
            return "T3_JUNIOR"
        if exp_mid <= 5.5:
            return "T4_MIDDLE_SENIOR"
        if exp_mid <= 8.5:
            return "T5_LEAD_MANAGER"
        return "T6_DIRECTOR"


@dataclass
class SkillExtractionResult:
    matched_skill_ids: List[str]
    skills_by_layer: Dict[str, List[str]]
    unmapped_tags: List[str]


class SkillExtractor:
    """Trích xuất 24 thuộc tính Hedonic BĐS 4 tầng từ văn bản tin đăng + Tags và ghi nhận các Tag phần dư."""

    def __init__(self, ontology_path: Path) -> None:
        with open(ontology_path, "r", encoding="utf-8") as f:
            self.cfg = yaml.safe_load(f)
        self.compiled_skills: Dict[str, Dict[str, Any]] = {}
        for sk_id, sk_info in self.cfg.get("skills", {}).items():
            regs = [re.compile(pat, re.IGNORECASE) for pat in sk_info.get("patterns", [])]
            self.compiled_skills[sk_id] = {
                "name": sk_info["name"],
                "layer": sk_info["layer"],
                "regexes": regs,
            }

    def extract(self, text: str, raw_tags: Optional[List[str]] = None) -> SkillExtractionResult:
        raw_tags = raw_tags or []
        combined_text = f"{text or ''} {' '.join(raw_tags)}"
        matched: List[str] = []
        by_layer: Dict[str, List[str]] = {
            "L1_FOUNDATION": [],
            "L2_TOOL": [],
            "L3_DOMAIN": [],
            "L4_MINDSET": [],
        }

        for sk_id, info in self.compiled_skills.items():
            if any(r.search(combined_text) for r in info["regexes"]):
                matched.append(sk_id)
                by_layer.setdefault(info["layer"], []).append(sk_id)

        unmapped: List[str] = []
        for tag in raw_tags:
            tag_clean = tag.strip()
            if not tag_clean:
                continue
            is_covered = any(
                any(r.search(tag_clean) for r in info["regexes"])
                for info in self.compiled_skills.values()
            )
            if not is_covered:
                unmapped.append(tag_clean)

        return SkillExtractionResult(
            matched_skill_ids=sorted(matched),
            skills_by_layer=by_layer,
            unmapped_tags=unmapped,
        )


def build_dedup_signature(
    company_name: str,
    canonical_role: str,
    career_tier: str,
    city_code: str,
    year_month: str,
    job_title_raw: str = "",
) -> str:
    """
    Tạo khóa khử trùng lặp đa nguồn cho cùng một BĐS / dự án đăng trên nhiều cổng (Batdongsan, Chotot, Alonhadat, Mogi).
    """
    comp_slug = slugify_vi(company_name)
    core_title_text = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", job_title_raw or "").strip()
    core_title_slug = slugify_vi(core_title_text or job_title_raw)[:48]
    role_key = canonical_role if canonical_role != "UNCLASSIFIED" else (core_title_slug[:32] or "UNCLASSIFIED")
    raw_key = f"{comp_slug}|{role_key}|{core_title_slug}|{career_tier}|{city_code}|{year_month}"
    digest = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:12]
    return f"{comp_slug[:24]}__{role_key}__{career_tier}__{city_code}__{year_month}__{digest}"
