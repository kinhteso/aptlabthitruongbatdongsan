"""
Hệ thống Cào dữ liệu Đa nguồn (Tầng Bronze -> Silver):
Hỗ trợ 4 cổng tuyển dụng lớn tại Việt Nam:
1. TopCV.vn (TopCVScraper)
2. ITviec.com (ITviecScraper)
3. CareerViet.vn (CareerVietScraper)
4. VietnamWorks.com (VietnamWorksScraper)

Ưu tiên bóc tách cấu trúc chuẩn Schema.org/JobPosting (JSON-LD) kết hợp DOM CSS Selectors
và Next.js __NEXT_DATA__ state (cho SPA).
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qsl, quote_plus, urlencode, urljoin, urlparse, urlunparse

import yaml
from bs4 import BeautifulSoup

from src.etl.normalizers import (
    GeoNormalizer,
    RoleAndTierClassifier,
    SalaryNormalizer,
    SkillExtractor,
    TemporalNormalizer,
    build_dedup_signature,
    extract_property_area_m2,
    extract_seller_phones,
    mask_pii_text,
    resolve_seller_phone_identity,
    slugify_vi,
)

TRACKING_QUERY_PARAMS = {
    "ta_source",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_source_navi",
    "utm_medium_navi",
    "utm_campaign_navi",
    "utm_mkt_campaign",
    "fbclid",
    "gclid",
    "ref",
    "source",
    "searchtype",
    "placement",
    "sortby",
    "qs",
    "lab_feature",
}

PROMOTIONAL_BANNER_MARKERS = (
    "adrsturbobanner",
    "outstandingmobile",
    "specialoffers",
    "utm_mkt_campaign=",
)

SOFT_404_DELETED_MARKERS = (
    "có thể trang đã bị xóa",
    "trang đã bị xóa",
    "tin tuyển dụng không tồn tại",
    "việc làm đã hết hạn hoặc không tồn tại",
    "page not found",
    "job has expired",
)


def is_promotional_banner_url(raw_url: str) -> bool:
    """
    Phát hiện các đường link thuộc Banner Quảng cáo cố định (VD: ADRSTURBOBANNER,
    outStandingMobile, specialOffers trên VietnamWorks) để không quét nhầm tin rác/tin hết hạn.
    """
    if not raw_url:
        return False
    low = raw_url.lower()
    return any(marker in low for marker in PROMOTIONAL_BANNER_MARKERS)


def is_soft_404_or_deleted_job(html: str, raw_job: "RawScrapedJob") -> bool:
    """
    Phát hiện hiện tượng Soft-404 trên các cổng SPA (trả về HTTP 200 nhưng tin tuyển dụng
    đã bị xóa/gỡ bỏ, thẻ <title> rỗng hoặc hiện cảnh báo 'Có thể trang đã bị xóa').
    """
    title_clean = (raw_job.job_title_raw or "").strip()
    if not title_clean or title_clean == "Unknown Title":
        return True

    low_html = (html or "").lower()
    if any(m in low_html for m in SOFT_404_DELETED_MARKERS):
        return True

    if raw_job.source_site == "vietnamworks" and not raw_job.raw_json_ld:
        m_title = re.search(r"<title[^>]*>(.*?)</title>", html or "", re.IGNORECASE | re.DOTALL)
        if m_title and not m_title.group(1).strip():
            return True

    return False


def normalize_job_url(raw_url: str, base_url: str = "") -> str:
    """Chuẩn hóa URL tin tuyển dụng: ghép nối base_url và loại bỏ các tham số tracking quảng cáo."""
    if not raw_url:
        return ""
    full_url = urljoin(base_url, raw_url.strip())
    parsed = urlparse(full_url)
    clean_query = [
        (k, v)
        for k, v in parse_qsl(parsed.query, keep_blank_values=False)
        if k.lower() not in TRACKING_QUERY_PARAMS
    ]
    return urlunparse(
        (
            parsed.scheme or "https",
            parsed.netloc.lower(),
            parsed.path.rstrip("/") if parsed.path != "/" else parsed.path,
            parsed.params,
            urlencode(clean_query),
            "",  # Bỏ fragment (#...)
        )
    )


def extract_source_job_id(site_name: str, url: str) -> str:
    """Trích xuất mã định danh gốc (source_job_id) từ URL của từng cổng Bất động sản."""
    path = urlparse(url).path
    if site_name in ("topcv", "batdongsan"):
        m_pr = re.search(r"(?:pr|id)(\d+)", path, re.IGNORECASE)
        if m_pr:
            return f"bds_{m_pr.group(1)}"
        m = re.search(r"/(\d+)\.html$", path)
        if m:
            return f"topcv_{m.group(1)}"
    elif site_name in ("careerviet", "alonhadat"):
        m_alo = re.search(r"-(\d+)\.html$", path)
        if m_alo:
            return f"alo_{m_alo.group(1)}"
        m = re.search(r"\.([0-9A-Za-z]+)\.html$", path)
        if m:
            return f"cv_{m.group(1)}"
    elif site_name in ("vietnamworks", "mogi"):
        m_mogi = re.search(r"-id(\d+)/?$", path, re.IGNORECASE)
        if m_mogi:
            return f"mogi_{m_mogi.group(1)}"
        m = re.search(r"-(\d+)-j[dv]/?$", path)
        if m:
            return f"vnw_{m.group(1)}"
    elif site_name in ("itviec", "chotot"):
        m_ct = re.search(r"/(\d+)\.htm$", path, re.IGNORECASE)
        if m_ct:
            return f"chotot_{m_ct.group(1)}"
        m = re.search(r"/it-jobs/([^/?#]+)", path)
        if m:
            return f"itv_{m.group(1)[:64]}"

    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]
    return f"{site_name}_{digest}"


@dataclass
class DiscoveredJobLink:
    """Thông tin tóm tắt của một tin tuyển dụng phát hiện từ trang danh sách tìm kiếm (Search Listing)."""

    source_site: str
    job_url: str
    source_job_id: str = ""
    search_keyword: str = ""
    search_city: str = ""
    title_hint: str = ""
    company_hint: str = ""
    salary_hint: str = ""
    location_hint: str = ""
    work_mode_hint: str = ""
    seller_phone_hint: str = ""
    skill_tags_hint: List[str] = field(default_factory=list)


@dataclass
class RawScrapedJob:
    """Bản ghi dữ liệu thô ở Tầng Bronze (Raw Data Lake)."""

    source_site: str
    source_url: str
    source_job_id: str = ""
    search_keyword: str = ""
    search_city: str = ""
    http_status: int = 200
    raw_json_ld: Optional[Dict[str, Any]] = None
    job_title_raw: str = ""
    company_name_raw: str = ""
    seller_phone_raw: str = ""
    seller_phones: List[str] = field(default_factory=list)
    salary_raw_text: str = ""
    location_raw_text: str = ""
    experience_raw_text: str = ""
    level_raw_text: str = ""
    published_raw_text: str = ""
    expired_raw_text: str = ""
    description_raw: str = ""
    requirements_raw: str = ""
    benefits_raw: str = ""
    raw_skill_tags: List[str] = field(default_factory=list)
    raw_html_text: str = ""
    scraped_at: str = field(default_factory=lambda: datetime.now().isoformat())
    content_sha256: str = ""


class SchemaOrgJobParser:
    """Trích xuất khối <script type="application/ld+json"> chuẩn Schema.org/JobPosting."""

    @staticmethod
    def extract_job_posting_json_ld(html: str) -> Optional[Dict[str, Any]]:
        soup = BeautifulSoup(html, "html.parser")
        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            raw_txt = script.string or script.get_text()
            if not raw_txt:
                continue
            try:
                data = json.loads(raw_txt.strip())
            except json.JSONDecodeError:
                continue

            candidates = data if isinstance(data, list) else [data]
            valid_types = {
                "JobPosting",
                "RealEstateListing",
                "SingleFamilyResidence",
                "Apartment",
                "House",
                "Residence",
                "Product",
                "Offer",
            }
            for item in candidates:
                if isinstance(item, dict):
                    if item.get("@type") in valid_types:
                        return item
                    # Hỗ trợ cấu trúc JSON-LD của Mogi.vn (@type: Person -> makesOffer -> itemOffered)
                    makes_offer = item.get("makesOffer")
                    if isinstance(makes_offer, dict):
                        offered = makes_offer.get("itemOffered")
                        price_spec = makes_offer.get("priceSpecification") or {}
                        if isinstance(offered, dict):
                            price_vnd = price_spec.get("price")
                            price_str = ""
                            if price_vnd:
                                try:
                                    p_ty = round(float(price_vnd) / 1_000_000_000.0, 2)
                                    price_str = f"{p_ty} tỷ"
                                except Exception:
                                    price_str = str(price_vnd)
                            return {
                                "@type": offered.get("@type", "RealEstateListing"),
                                "title": offered.get("name") or offered.get("title") or "",
                                "description": offered.get("description") or "",
                                "telephone": str(item.get("telephone") or offered.get("telephone") or ""),
                                "hiringOrganization": {
                                    "name": item.get("name") or "Chính chủ Mogi.vn",
                                    "telephone": str(item.get("telephone") or ""),
                                },
                                "baseSalary": {
                                    "currency": "VND",
                                    "value": {"value": price_str},
                                } if price_str else {},
                            }
                    if "@graph" in item and isinstance(item["@graph"], list):
                        for node in item["@graph"]:
                            if isinstance(node, dict) and node.get("@type") in valid_types:
                                return node
        return None

    @staticmethod
    def clean_html_fragment(html_fragment: Optional[str]) -> str:
        if not html_fragment:
            return ""
        soup = BeautifulSoup(str(html_fragment), "html.parser")
        return re.sub(r"\s+", " ", soup.get_text(separator=" ")).strip()


class BaseVietnamJobScraper:
    """Lớp cơ sở cho 4 cổng tuyển dụng lớn tại Việt Nam."""

    site_name: str = "base"

    def __init__(self, settings_path: Path = Path("configs/scraper_settings.yaml")) -> None:
        with open(settings_path, "r", encoding="utf-8") as f:
            self.full_cfg = yaml.safe_load(f)
        self.site_cfg = self.full_cfg.get("sites", {}).get(self.site_name, {})
        self.base_url = self.site_cfg.get("base_url", "")
        self.selectors = self.site_cfg.get("selectors", {})

    def build_search_url(self, keyword: str, city_cfg: Dict[str, str], page: int = 1) -> str:
        template = self.site_cfg.get("search_url_template", "")
        return template.format(
            keyword_slug=slugify_vi(keyword),
            keyword_encoded=quote_plus(keyword),
            topcv_id=city_cfg.get("topcv_id", ""),
            careerviet_id=city_cfg.get("careerviet_id", ""),
            itviec_slug=city_cfg.get("itviec_slug", ""),
            vnworks_id=city_cfg.get("vnworks_id", ""),
            page=page,
        )

    def parse_search_listing_html(
        self,
        html: str,
        search_keyword: str = "",
        search_city: str = "",
    ) -> List[DiscoveredJobLink]:
        """
        Bóc tách danh sách URL chi tiết tin tuyển dụng kèm thông tin gợi ý (Title, Company, Salary, Tags)
        từ trang kết quả tìm kiếm (Search Listing Page).
        """
        soup = BeautifulSoup(html, "html.parser")
        card_selector = self.selectors.get("job_cards", "")
        link_selector = self.selectors.get("job_link", "a")
        sal_selector = self.selectors.get("salary_badge", "")
        loc_selector = self.selectors.get("location_badge", "")
        tag_selector = self.selectors.get("skill_tags", "")
        work_mode_selector = self.selectors.get("work_mode_badge", "")

        discovered: List[DiscoveredJobLink] = []
        seen_urls: set[str] = set()

        cards = soup.select(card_selector) if card_selector else []
        for card in cards:
            link_el = card.select_one(link_selector) or card.find("a", href=True)
            if not link_el or not link_el.get("href"):
                continue

            raw_href = str(link_el.get("href", "")).strip()
            if not raw_href or raw_href.startswith("javascript:") or is_promotional_banner_url(raw_href):
                continue

            norm_url = normalize_job_url(raw_href, self.base_url)
            if not norm_url or norm_url in seen_urls:
                continue
            seen_urls.add(norm_url)

            title_hint = link_el.get_text(strip=True) or str(link_el.get("title", "")).strip()

            company_hint = ""
            comp_el = card.select_one(
                "a.company, div.company-name, span.company-name, a.company-name, div.caption a.company"
            )
            if comp_el:
                company_hint = comp_el.get_text(strip=True)

            salary_hint = ""
            if sal_selector:
                sal_el = card.select_one(sal_selector)
                if sal_el:
                    salary_hint = sal_el.get_text(strip=True)

            location_hint = ""
            if loc_selector:
                loc_el = card.select_one(loc_selector)
                if loc_el:
                    location_hint = loc_el.get_text(strip=True)

            work_mode_hint = ""
            if work_mode_selector:
                wm_el = card.select_one(work_mode_selector)
                if wm_el:
                    work_mode_hint = wm_el.get_text(strip=True)

            tags_hint: List[str] = []
            if tag_selector:
                for t_el in card.select(tag_selector):
                    t_txt = t_el.get_text(" ", strip=True)
                    if t_txt and t_txt not in tags_hint:
                        tags_hint.append(t_txt)

            # Nếu thẻ tin BĐS có diện tích m² riêng biệt (VD: Alonhadat span.area, Mogi ul.prop-attr, Batdongsan re__card-config-area),
            # ghép diện tích m² vào salary_hint ("5,2 tỷ - 110 m²") để chuẩn hóa chính xác đơn giá Triệu/m²
            if salary_hint and not re.search(r"m2|m²", salary_hint, re.IGNORECASE):
                card_area = extract_property_area_m2(" ".join(tags_hint) + " " + title_hint)
                if card_area:
                    salary_hint = f"{salary_hint} - {card_area:g}m²"

            if not company_hint:
                portal_alias = str(self.site_cfg.get("portal_alias", self.site_name)).upper()
                company_hint = f"Chính chủ / Sàn {portal_alias}"

            # Bóc tách số điện thoại người rao bán trên thẻ danh sách (nếu có)
            phone_hint_candidates: List[str] = []
            for p_el in card.select(
                "a[href^='tel:'], [data-phone], [data-mobile], [mobile], span.phone, div.phone, div.fone, span.fone, .re__btn-phone, .seller-phone"
            ):
                href_v = str(p_el.get("href") or "")
                if href_v.lower().startswith("tel:"):
                    phone_hint_candidates.append(href_v[4:])
                for attr_k in ("data-phone", "data-mobile", "mobile", "phone"):
                    if p_el.get(attr_k):
                        phone_hint_candidates.append(str(p_el.get(attr_k)))
                phone_hint_candidates.append(p_el.get_text(" ", strip=True))
            card_phones = extract_seller_phones(
                " ".join(phone_hint_candidates) + " " + card.get_text(" ", strip=True),
                raw_tags=tags_hint,
            )
            seller_phone_hint = card_phones[0] if card_phones else ""
            if seller_phone_hint and not any("sđt:" in t.lower() for t in tags_hint):
                tags_hint.append(f"SĐT: {seller_phone_hint}")

            discovered.append(
                DiscoveredJobLink(
                    source_site=self.site_name,
                    job_url=norm_url,
                    source_job_id=extract_source_job_id(self.site_name, norm_url),
                    search_keyword=search_keyword,
                    search_city=search_city,
                    title_hint=title_hint,
                    company_hint=company_hint,
                    salary_hint=salary_hint,
                    location_hint=location_hint,
                    work_mode_hint=work_mode_hint,
                    seller_phone_hint=seller_phone_hint,
                    skill_tags_hint=tags_hint,
                )
            )

        # Fallback thông minh khi trang đổi class thẻ bao ngoài (DOM Drift Resilience):
        # Quét các thẻ <a href="..."> khớp với mẫu URL chi tiết tin rao BĐS đặc trưng của từng cổng
        if not discovered:
            url_patterns = {
                "topcv": re.compile(r"(?:/ban-[^/?#]+|-pr\d+|-id\d+|/viec-lam/[^/?#]+\.html)", re.IGNORECASE),
                "itviec": re.compile(r"(?:/mua-ban-[^/?#]+/\d+\.htm|^/it-jobs/[a-z0-9-]+-\d+$)", re.IGNORECASE),
                "careerviet": re.compile(r"(?:-\d+\.html$|/tim-viec-lam/[^/?#]+\.[0-9A-Za-z]+\.html)", re.IGNORECASE),
                "vietnamworks": re.compile(r"(?:/mua-[^/?#]+/.*-id\d+$|-\d+-j[dv]/?$)", re.IGNORECASE),
            }
            pat = url_patterns.get(self.site_name)
            if pat is not None:
                for a_el in soup.find_all("a", href=True):
                    raw_href = str(a_el.get("href", "")).strip()
                    if not raw_href or raw_href.startswith("javascript:") or is_promotional_banner_url(raw_href):
                        continue
                    parsed_href = urlparse(raw_href)
                    if not pat.search(parsed_href.path):
                        continue
                    norm_url = normalize_job_url(raw_href, self.base_url)
                    if not norm_url or norm_url in seen_urls:
                        continue
                    seen_urls.add(norm_url)
                    title_hint = a_el.get_text(strip=True) or str(a_el.get("title", "")).strip()
                    discovered.append(
                        DiscoveredJobLink(
                            source_site=self.site_name,
                            job_url=norm_url,
                            source_job_id=extract_source_job_id(self.site_name, norm_url),
                            search_keyword=search_keyword,
                            search_city=search_city,
                            title_hint=title_hint,
                        )
                    )

        return discovered

    def parse_job_detail_html(
        self,
        html: str,
        url: str,
        search_keyword: str = "",
        search_city: str = "",
        listing_hint: Optional[DiscoveredJobLink] = None,
        http_status: int = 200,
    ) -> RawScrapedJob:
        norm_url = normalize_job_url(url, self.base_url)
        soup = BeautifulSoup(html, "html.parser")
        json_ld = SchemaOrgJobParser.extract_job_posting_json_ld(html)

        title = ""
        company = ""
        salary_raw = ""
        location_raw = ""
        exp_raw = ""
        pub_raw = ""
        exp_date_raw = ""
        desc_raw = ""

        if json_ld:
            title = str(json_ld.get("title", "")).strip()
            org = json_ld.get("hiringOrganization", {})
            if isinstance(org, dict):
                company = str(org.get("name", "")).strip()
            pub_raw = str(json_ld.get("datePosted", "")).strip()
            exp_date_raw = str(json_ld.get("validThrough", "")).strip()
            desc_raw = SchemaOrgJobParser.clean_html_fragment(json_ld.get("description", ""))

            # Bóc tách địa điểm từ JSON-LD
            loc = json_ld.get("jobLocation")
            if isinstance(loc, list) and loc:
                loc = loc[0]
            if isinstance(loc, dict):
                addr = loc.get("address", {})
                if isinstance(addr, dict):
                    parts = [
                        str(addr.get("streetAddress", "")),
                        str(addr.get("addressLocality", "")),
                        str(addr.get("addressRegion", "")),
                    ]
                    location_raw = ", ".join(p for p in parts if p).strip()

            # Bóc tách lương từ JSON-LD baseSalary
            base_sal = json_ld.get("baseSalary")
            if isinstance(base_sal, dict):
                curr = base_sal.get("currency", "VND")
                val_obj = base_sal.get("value", {})
                if isinstance(val_obj, dict):
                    min_v = val_obj.get("minValue")
                    max_v = val_obj.get("maxValue")
                    exact_v = val_obj.get("value")
                    f_min = float(min_v or 0)
                    f_max = float(max_v or 0)
                    if f_min > 0 and f_max > 0:
                        salary_raw = f"{min_v} - {max_v} {curr}"
                    elif f_min <= 0 and f_max > 0:
                        salary_raw = f"Up to {max_v} {curr}"
                    elif f_min > 0 and f_max <= 0:
                        salary_raw = f"From {min_v} {curr}"
                    elif exact_v:
                        ev_str = str(exact_v).strip()
                        ev_low = ev_str.lower()
                        if any(
                            tok in ev_low
                            for tok in [
                                "triệu",
                                "tr",
                                "vnđ",
                                "vnd",
                                "₫",
                                "usd",
                                "$",
                                "thỏa thuận",
                                "thương lượng",
                                "cạnh tranh",
                                "negotiable",
                            ]
                        ) or re.search(r"\b\d+(?:\.\d+)?\s*(?:m|mil)\b", ev_low):
                            salary_raw = ev_str
                        else:
                            salary_raw = f"{ev_str} {curr}"

            # Bóc tách kinh nghiệm từ JSON-LD
            exp_req = json_ld.get("experienceRequirements")
            if isinstance(exp_req, dict):
                months = exp_req.get("monthsOfExperience")
                if months:
                    exp_raw = f"{months} tháng"
            elif isinstance(exp_req, str):
                exp_raw = exp_req

        # Bổ sung từ DOM Selectors đặc thù của từng trang BĐS (nếu JSON-LD thiếu hoặc để lấy Thuộc tính Hedonic)
        if not title and soup.find("h1"):
            title = soup.find("h1").get_text(" ", strip=True)
            title = re.sub(r"^(?:Giá tốt|Hot)\s*", "", title, flags=re.IGNORECASE).strip()

        if not salary_raw and self.selectors.get("salary_badge"):
            sal_el = soup.select_one(self.selectors["salary_badge"])
            if sal_el:
                salary_raw = re.sub(r"^Giá\s*[:\-]?\s*", "", sal_el.get_text(" ", strip=True), flags=re.IGNORECASE).strip()

        if not location_raw and self.selectors.get("location_badge"):
            loc_el = soup.select_one(self.selectors["location_badge"])
            if loc_el:
                location_raw = loc_el.get_text(" ", strip=True)

        # Bóc tách thêm từ trang chi tiết Alonhadat.com.vn (span.square, div.address, table thuộc tính, div.detail)
        sq_el = soup.select_one("span.square, span.area")
        if sq_el:
            sq_txt = sq_el.get_text(" ", strip=True)
            m_sq = extract_property_area_m2(sq_txt)
            if m_sq and not exp_raw:
                exp_raw = f"{m_sq:g} m2"
            if m_sq and salary_raw and not re.search(r"m2|m²", salary_raw, re.IGNORECASE):
                salary_raw = f"{salary_raw} - {m_sq:g}m²"

        if not location_raw:
            addr_el = soup.select_one("div.address, div.property-address, div.re__pr-short-description")
            if addr_el:
                location_raw = addr_el.get_text(" ", strip=True)

        tags: List[str] = []
        if self.selectors.get("skill_tags"):
            for tag_el in soup.select(self.selectors["skill_tags"]):
                t_val = tag_el.get_text(" ", strip=True)
                if t_val and t_val not in tags:
                    tags.append(t_val)

        # Bóc tách bảng thông số kỹ thuật BĐS trên Alonhadat / Mogi / Batdongsan
        for tr_el in soup.select("div.infor table tr, div.info-attrs div.info-attr"):
            row_txt = tr_el.get_text(" ", strip=True)
            if any(k in row_txt.lower() for k in ["pháp lý", "sổ hồng", "sổ đỏ", "đường trước nhà", "chiều ngang", "mặt tiền", "số lầu", "phòng ngủ", "hướng"]):
                if len(row_txt) <= 80 and row_txt not in tags:
                    tags.append(row_txt)
            if "thuộc dự án" in row_txt.lower() and not company:
                m_proj = re.search(r"thuộc\s*dự\s*án\s*[:\-]?\s*(.+)", row_txt, re.IGNORECASE)
                if m_proj:
                    company = re.sub(r"\(xem chi tiết.*\)", "", m_proj.group(1), flags=re.IGNORECASE).strip()

        # Hợp nhất với thông tin gợi ý từ trang Search Listing (nếu có)
        if listing_hint:
            if not title and listing_hint.title_hint:
                title = listing_hint.title_hint
            if not company and listing_hint.company_hint:
                company = listing_hint.company_hint
            if (not salary_raw or not re.search(r"\d", salary_raw)) and listing_hint.salary_hint:
                salary_raw = listing_hint.salary_hint
            elif salary_raw and listing_hint.salary_hint and ("m2" in listing_hint.salary_hint.lower() or "m²" in listing_hint.salary_hint.lower()) and not re.search(r"m2|m²", salary_raw, re.IGNORECASE):
                salary_raw = listing_hint.salary_hint
            if not location_raw and listing_hint.location_hint:
                location_raw = listing_hint.location_hint
            if not search_keyword and listing_hint.search_keyword:
                search_keyword = listing_hint.search_keyword
            if not search_city and listing_hint.search_city:
                search_city = listing_hint.search_city
            for hint_tag in listing_hint.skill_tags_hint:
                if hint_tag and hint_tag not in tags:
                    tags.append(hint_tag)

        if not desc_raw:
            detail_body = soup.select_one("div.detail, div.info-content-body, div.re__detail-content, article")
            if detail_body:
                desc_raw = SchemaOrgJobParser.clean_html_fragment(str(detail_body))
            else:
                desc_raw = SchemaOrgJobParser.clean_html_fragment(html)

        # Bóc tách Ngày đăng / Ngày cập nhật và Hạn hiển thị từ văn bản DOM nếu JSON-LD bị khuyết
        if not pub_raw or not exp_date_raw:
            time_el = soup.select_one("time.created-date[datetime], time[datetime]")
            if time_el and time_el.get("datetime") and not pub_raw:
                pub_raw = str(time_el.get("datetime")).strip()
            plain_page_text = soup.get_text(" ", strip=True)
            if not pub_raw:
                m_pub = re.search(
                    r"(?:ngày\s*cập\s*nhật|ngày\s*đăng(?:\s*tin)?|updated\s*date|date\s*posted)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{1,2}-\d{1,2})",
                    plain_page_text,
                    re.IGNORECASE,
                )
                if m_pub:
                    pub_raw = m_pub.group(1)
                else:
                    m_rel_pub = re.search(
                        r"(?:đăng|cập\s*nhật|posted)\s+(\d+\s*(?:ngày|tuần|tháng|giờ|day|week|month|hour)s?\s*(?:trước|ago)|hôm\s*nay|hôm\s*qua|today|yesterday)",
                        plain_page_text,
                        re.IGNORECASE,
                    )
                    if m_rel_pub:
                        pub_raw = m_rel_pub.group(1)
            if not exp_date_raw:
                m_exp = re.search(
                    r"(?:hết\s*hạn(?:\s*nộp)?|hạn\s*nộp(?:\s*hồ\s*sơ)?|hạn\s*chót|application\s*deadline|valid\s*through)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{1,2}-\d{1,2})",
                    plain_page_text,
                    re.IGNORECASE,
                )
                if m_exp:
                    exp_date_raw = m_exp.group(1)

        if listing_hint and listing_hint.work_mode_hint and listing_hint.work_mode_hint not in desc_raw:
            desc_raw = f"{desc_raw} [{listing_hint.work_mode_hint}]".strip()

        if not exp_raw:
            det_area = extract_property_area_m2(f"{salary_raw} {' '.join(tags)} {title} {desc_raw[:400]}")
            if det_area:
                exp_raw = f"{det_area:g} m2"
                if salary_raw and not re.search(r"m2|m²", salary_raw, re.IGNORECASE):
                    salary_raw = f"{salary_raw} - {det_area:g}m²"

        if not company:
            portal_alias = str(self.site_cfg.get("portal_alias", self.site_name)).upper()
            company = f"Chính chủ / Sàn {portal_alias}"

        # Bóc tách Số điện thoại người rao bán từ JSON-LD, DOM (tel:, data-phone, .phone, .fone) và nội dung chi tiết
        phone_candidates: List[str] = []
        if json_ld:
            if json_ld.get("telephone"):
                phone_candidates.append(str(json_ld.get("telephone")))
            org = json_ld.get("hiringOrganization")
            if isinstance(org, dict) and org.get("telephone"):
                phone_candidates.append(str(org.get("telephone")))
        if listing_hint and listing_hint.seller_phone_hint:
            phone_candidates.append(listing_hint.seller_phone_hint)

        for p_el in soup.select(
            "a[href^='tel:'], [data-phone], [data-mobile], [mobile], [phone], span.phone, div.phone, div.fone, span.fone, .re__btn-phone, .contact-phone, .agent-phone, .seller-phone"
        ):
            href_v = str(p_el.get("href") or "")
            if href_v.lower().startswith("tel:"):
                phone_candidates.append(href_v[4:])
            for attr_k in ("data-phone", "data-mobile", "mobile", "phone"):
                if p_el.get(attr_k):
                    phone_candidates.append(str(p_el.get(attr_k)))
            phone_candidates.append(p_el.get_text(" ", strip=True))

        detail_phones = extract_seller_phones(
            f"{' '.join(phone_candidates)} {title} {desc_raw}",
            raw_tags=tags,
        )
        seller_phone_raw = detail_phones[0] if detail_phones else ""
        if seller_phone_raw and not any("sđt:" in t.lower() for t in tags):
            tags.append(f"SĐT: {seller_phone_raw}")

        content_hash = hashlib.sha256(
            f"{norm_url}|{title}|{company}|{desc_raw[:500]}".encode("utf-8")
        ).hexdigest()
        source_job_id = (
            listing_hint.source_job_id
            if (listing_hint and listing_hint.source_job_id)
            else extract_source_job_id(self.site_name, norm_url)
        )

        return RawScrapedJob(
            source_site=self.site_name,
            source_url=norm_url,
            source_job_id=source_job_id,
            search_keyword=search_keyword,
            search_city=search_city,
            http_status=http_status,
            raw_json_ld=json_ld,
            job_title_raw=title,
            company_name_raw=company or "Chính chủ BĐS",
            seller_phone_raw=seller_phone_raw,
            seller_phones=detail_phones,
            salary_raw_text=salary_raw or "Thỏa thuận",
            location_raw_text=location_raw or search_city,
            experience_raw_text=exp_raw,
            published_raw_text=pub_raw,
            expired_raw_text=exp_date_raw,
            description_raw=desc_raw,
            raw_skill_tags=tags,
            raw_html_text=html,
            content_sha256=content_hash,
        )


class TopCVScraper(BaseVietnamJobScraper):
    site_name = "topcv"


class ITviecScraper(BaseVietnamJobScraper):
    site_name = "itviec"


class CareerVietScraper(BaseVietnamJobScraper):
    site_name = "careerviet"


class VietnamWorksScraper(BaseVietnamJobScraper):
    site_name = "vietnamworks"

    def parse_search_listing_html(
        self,
        html: str,
        search_keyword: str = "",
        search_city: str = "",
    ) -> List[DiscoveredJobLink]:
        """
        Hỗ trợ cả DOM CSS Selectors (Mogi.vn `ul.props li`) lẫn trạng thái Next.js (`__NEXT_DATA__`).
        Ưu tiên kết hợp cả hai để đảm bảo không bỏ sót tin đăng BĐS.
        """
        discovered = super().parse_search_listing_html(html, search_keyword, search_city)
        seen_urls = {item.job_url for item in discovered}

        soup = BeautifulSoup(html, "html.parser")
        next_script = soup.find("script", attrs={"id": "__NEXT_DATA__"})
        if next_script and (next_script.string or next_script.get_text()):
            try:
                payload = json.loads((next_script.string or next_script.get_text()).strip())
                jobs_list = self._find_jobs_in_next_data(payload)
                for j_obj in jobs_list:
                    raw_url = j_obj.get("jobUrl") or j_obj.get("url") or j_obj.get("alias", "")
                    if not raw_url or is_promotional_banner_url(str(raw_url)):
                        continue
                    norm_url = normalize_job_url(str(raw_url), self.base_url)
                    if not norm_url or norm_url in seen_urls:
                        continue
                    seen_urls.add(norm_url)

                    skills = [
                        str(s.get("skillName", s)) if isinstance(s, dict) else str(s)
                        for s in j_obj.get("skills", [])
                        if s
                    ]
                    for attr in j_obj.get("attributes", []) or []:
                        if isinstance(attr, dict) and attr.get("value"):
                            skills.append(str(attr["value"]))
                    sal_hint = str(j_obj.get("prettySalary") or j_obj.get("price_display") or "").strip()
                    area_hint = extract_property_area_m2(" ".join(skills) + " " + str(j_obj.get("title") or j_obj.get("jobTitle") or ""))
                    if sal_hint and area_hint and not re.search(r"m2|m²", sal_hint, re.IGNORECASE):
                        sal_hint = f"{sal_hint} - {area_hint:g}m²"
                    discovered.append(
                        DiscoveredJobLink(
                            source_site=self.site_name,
                            job_url=norm_url,
                            source_job_id=str(j_obj.get("jobId") or j_obj.get("id") or extract_source_job_id(self.site_name, norm_url)),
                            search_keyword=search_keyword,
                            search_city=search_city,
                            title_hint=str(j_obj.get("jobTitle") or j_obj.get("title") or "").strip(),
                            company_hint=str(j_obj.get("companyName") or j_obj.get("category_name") or "Chính chủ BĐS").strip(),
                            salary_hint=sal_hint,
                            location_hint=str(j_obj.get("workingLocations") or j_obj.get("location") or "").strip(),
                            skill_tags_hint=skills,
                        )
                    )
            except json.JSONDecodeError:
                pass

        return discovered

    def _find_jobs_in_next_data(self, node: Any) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        if isinstance(node, dict):
            if ("jobTitle" in node or "jobId" in node or ("title" in node and "price_display" in node)) and (
                "jobUrl" in node or "url" in node or "alias" in node
            ):
                results.append(node)
            for v in node.values():
                results.extend(self._find_jobs_in_next_data(v))
        elif isinstance(node, list):
            for item in node:
                results.extend(self._find_jobs_in_next_data(item))
        return results


class BatdongsanScraper(TopCVScraper):
    """Adapter cho cổng Batdongsan.com.vn (PropertyGuru Vietnam)."""
    portal_alias = "batdongsan"


class ChototNhaScraper(ITviecScraper):
    """Adapter cho cổng Nha.Chotot.com (Chợ Tốt Nhà)."""
    portal_alias = "chotot"


class AlonhadatScraper(CareerVietScraper):
    """Adapter cho cổng Alonhadat.com.vn (Alo Nhà Đất)."""
    portal_alias = "alonhadat"


class MogiScraper(VietnamWorksScraper):
    """Adapter cho cổng Mogi.vn (Mogi Real Estate)."""
    portal_alias = "mogi"


def build_scrapers_registry(
    settings_path: Path = Path("configs/scraper_settings.yaml"),
) -> Dict[str, BaseVietnamJobScraper]:
    """Khởi tạo bộ trình cào chuẩn cho 4 cổng BĐS lớn (Batdongsan, Chotot, Alonhadat, Mogi & các khóa tương thích)."""
    return {
        "topcv": TopCVScraper(settings_path),
        "itviec": ITviecScraper(settings_path),
        "careerviet": CareerVietScraper(settings_path),
        "vietnamworks": VietnamWorksScraper(settings_path),
    }


class UnifiedETLPipeline:
    """
    Pipeline chuyển hóa RawScrapedJob (Tầng Bronze) -> Bản ghi BĐS chuẩn hóa (Tầng Silver & Gold)
    sẵn sàng lưu vào Docker PostgreSQL hoặc Parquet phục vụ Machine Learning AVM.
    """

    def __init__(self, configs_dir: Path = Path("configs")) -> None:
        self.salary_norm = SalaryNormalizer()
        self.temporal_norm = TemporalNormalizer()
        self.geo_norm = GeoNormalizer(configs_dir / "geo_vietnam_cities.yaml")
        self.role_classifier = RoleAndTierClassifier(configs_dir / "roles_taxonomy.yaml")
        self.skill_extractor = SkillExtractor(configs_dir / "skills_ontology.yaml")

    def process_raw_job(self, raw: RawScrapedJob) -> Dict[str, Any]:
        detected_area_m2 = extract_property_area_m2(
            f"{raw.salary_raw_text} {raw.experience_raw_text} {' '.join(raw.raw_skill_tags)} {raw.job_title_raw} {raw.description_raw[:500]}"
        )
        sal = self.salary_norm.parse(raw.salary_raw_text, area_m2=detected_area_m2)
        salary_raw_display = raw.salary_raw_text
        if (
            detected_area_m2
            and salary_raw_display
            and not sal.is_negotiable
            and not re.search(r"m2|m²", salary_raw_display, re.IGNORECASE)
            and any(k in salary_raw_display.lower() for k in ["tỷ", "ty", "tỉ"])
        ):
            salary_raw_display = f"{salary_raw_display} - {detected_area_m2:g}m²"

        temp = self.temporal_norm.parse(raw.published_raw_text, raw.expired_raw_text)
        full_text = f"{raw.job_title_raw} {raw.description_raw} {raw.requirements_raw}"
        geo = self.geo_norm.parse(raw.location_raw_text, full_text)
        eff_exp_raw = raw.experience_raw_text or (f"{detected_area_m2:g} m2" if detected_area_m2 else None)
        role_tier = self.role_classifier.classify(
            f"{raw.job_title_raw} {' '.join(raw.raw_skill_tags or [])}",
            eff_exp_raw,
            raw.level_raw_text,
            unit_price_m2=sal.salary_mid_vnd,
        )
        skills_res = self.skill_extractor.extract(full_text, raw.raw_skill_tags)
        tag_only_skills = set(self.skill_extractor.extract("", raw.raw_skill_tags).matched_skill_ids)
        skill_sources = {
            sk_id: ("SITE_TAG" if sk_id in tag_only_skills else "REGEX_DESC")
            for sk_id in skills_res.matched_skill_ids
        }

        dedup_sig = build_dedup_signature(
            company_name=raw.company_name_raw,
            canonical_role=role_tier.canonical_role,
            career_tier=role_tier.career_tier,
            city_code=geo.city_code,
            year_month=temp.year_month,
            job_title_raw=raw.job_title_raw,
        )

        detailed_loc = (
            raw.location_raw_text.strip()
            if (raw.location_raw_text and len(raw.location_raw_text.strip()) > 3)
            else raw.search_city
        )

        seller_phone, seller_phones = resolve_seller_phone_identity(
            company_name=raw.company_name_raw,
            text=f"{raw.seller_phone_raw} {' '.join(raw.seller_phones or [])} {raw.job_title_raw} {raw.description_raw}",
            raw_tags=raw.raw_skill_tags,
            explicit_phone=raw.seller_phone_raw,
        )
        enriched_tags = list(raw.raw_skill_tags or [])
        if seller_phone and not any("sđt:" in str(t).lower() for t in enriched_tags):
            enriched_tags.append(f"SĐT: {seller_phone}")

        return {
            "source_site": raw.source_site,
            "source_job_id": raw.source_job_id or extract_source_job_id(raw.source_site, raw.source_url),
            "source_url": raw.source_url,
            "search_keyword": raw.search_keyword,
            "search_city": detailed_loc,
            "http_status": raw.http_status,
            "content_sha256": raw.content_sha256,
            "dedup_signature": dedup_sig,
            "company_name_raw": raw.company_name_raw,
            "company_slug": slugify_vi(raw.company_name_raw),
            "seller_phone": seller_phone,
            "seller_phones": seller_phones,
            "job_title_raw": raw.job_title_raw,
            "sector_pillar": role_tier.sector_pillar,
            "canonical_role": role_tier.canonical_role,
            "role_confidence": role_tier.role_confidence,
            "career_tier": role_tier.career_tier,
            "exp_years_min": role_tier.exp_years_min,
            "exp_years_max": role_tier.exp_years_max,
            "exp_years_mid": role_tier.exp_years_mid,
            "salary_raw_text": salary_raw_display,
            "salary_type": sal.salary_type,
            "is_negotiable": sal.is_negotiable,
            "currency_original": sal.currency_original,
            "salary_min_vnd": sal.salary_min_vnd,
            "salary_max_vnd": sal.salary_max_vnd,
            "salary_mid_vnd": sal.salary_mid_vnd,
            "primary_macro_region": geo.macro_region,
            "primary_city_code": geo.city_code,
            "primary_urban_tier": geo.urban_tier,
            "primary_district_cluster": geo.district_cluster,
            "province_34_code": geo.province_34_code,
            "province_34_name": geo.province_34_name,
            "legacy_province_63": geo.legacy_province_63,
            "ward_code": geo.ward_code,
            "ward_name": geo.ward_name,
            "economic_zone_type": geo.economic_zone_type,
            "work_mode": geo.work_mode,
            "published_date": temp.published_date.isoformat(),
            "expired_date": temp.expired_date.isoformat() if temp.expired_date else None,
            "year_month": temp.year_month,
            "year_quarter": temp.year_quarter,
            "vacancy_duration_days": temp.vacancy_duration_days,
            "description_clean": mask_pii_text(raw.description_raw),
            "requirements_clean": mask_pii_text(raw.requirements_raw),
            "benefits_clean": mask_pii_text(raw.benefits_raw),
            "matched_skill_ids": skills_res.matched_skill_ids,
            "skill_sources": skill_sources,
            "skills_by_layer": skills_res.skills_by_layer,
            "raw_skill_tags": enriched_tags,
            "unmapped_tags": skills_res.unmapped_tags,
        }
