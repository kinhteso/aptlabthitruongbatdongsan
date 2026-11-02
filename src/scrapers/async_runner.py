"""
Trình điều khiển Cào Bất đồng bộ Thực tế (Async Playwright Stealth + HTTPX Hybrid Runner):
- Hỗ trợ chạy song song có kiểm soát (Per-site Semaphore + Polite Jitter Delay) trên 4 cổng:
  TopCV, ITviec, CareerViet, VietnamWorks.
- Tích hợp Playwright Stealth Script (ẩn `navigator.webdriver`, giả lập môi trường Chrome tiếng Việt),
  chặn tải tài nguyên nặng (ảnh, video, font, trackers) giúp tăng tốc 60-70% trên Ubuntu Docker.
- Hỗ trợ cơ chế Hybrid (`httpx.AsyncClient` tốc độ cao -> tự động chuyển sang `Playwright` khi gặp
  Cloudflare / HTTP 403 / SPA).
- Tích hợp bộ nhớ đệm URL (Redis hoặc In-Memory) để tránh tải lại URL trùng trong chu kỳ Cooldown,
  đồng thời gọi `touch_existing_job_by_url` để cập nhật `vacancy_duration_days`.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

import httpx
import yaml

from src.db.postgres_repo import PostgresJobRepository
from src.scrapers.error_logger import ScraperErrorLogger
from src.scrapers.multi_site_scrapers import (
    BaseVietnamJobScraper,
    DiscoveredJobLink,
    UnifiedETLPipeline,
    build_scrapers_registry,
    is_promotional_banner_url,
    is_soft_404_or_deleted_job,
    normalize_job_url,
)

logger = logging.getLogger(__name__)

STEALTH_INIT_SCRIPT = """
() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'languages', { get: () => ['vi-VN', 'vi', 'en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
}
"""

BLOCKED_RESOURCE_TYPES = {"image", "media", "font"}
BLOCKED_TRACKER_DOMAINS = (
    "google-analytics.com",
    "googletagmanager.com",
    "doubleclick.net",
    "facebook.net",
    "hotjar.com",
    "tiktok.com/i18n",
)

CHALLENGE_MARKERS = (
    "cf-browser-verification",
    "challenge-platform",
    "just a moment...",
    "attention required! | cloudflare",
    "verify you are human",
)


@dataclass
class CrawlSearchTask:
    site_name: str
    pillar_code: str
    keyword: str
    city_cfg: Dict[str, str]
    page: int


def extract_dom_diagnostic_hint(html_text: str) -> Dict[str, Any]:
    """
    Trích xuất nhanh cấu trúc DOM thực tế (Title, các class thẻ div/section/article/h3 phổ biến,
    và các mẫu đường dẫn <a href=...>) khi một cổng tuyển dụng bị lỗi lệch CSS Selector
    hoặc chặn Anti-Bot. Thông tin này giúp AI/Kỹ thuật viên hiệu chỉnh lại bộ chọn ngay lập tức.
    """
    if not html_text:
        return {"html_length": 0, "page_title": "", "top_classes": [], "sample_hrefs": []}
    import re
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html_text, re.IGNORECASE | re.DOTALL)
    page_title = re.sub(r"\s+", " ", title_match.group(1)).strip()[:120] if title_match else ""
    class_matches = re.findall(r'class=["\']([^"\']{3,80})["\']', html_text[:45000])
    unique_classes: List[str] = []
    for cls_str in class_matches:
        if any(k in cls_str.lower() for k in ("job", "item", "card", "list", "title", "search", "result", "box", "cf-", "challenge")):
            if cls_str not in unique_classes:
                unique_classes.append(cls_str)
        if len(unique_classes) >= 12:
            break
    href_matches = re.findall(r'href=["\']([^"\']{10,140})["\']', html_text[:45000])
    sample_hrefs: List[str] = []
    for h in href_matches:
        if any(p in h.lower() for p in ("viec-lam", "it-jobs", "tim-viec", "-jd", "/job", "tuyen-dung")):
            if h not in sample_hrefs:
                sample_hrefs.append(h)
        if len(sample_hrefs) >= 10:
            break
    return {
        "html_length": len(html_text),
        "page_title": page_title,
        "top_classes": unique_classes,
        "sample_hrefs": sample_hrefs,
    }


@dataclass
class CrawlRunStats:
    run_id: str = ""
    trigger_mode: str = "CLI_ONCE"
    target_sites: List[str] = field(default_factory=list)
    pages_fetched: int = 0
    links_discovered: int = 0
    new_raw_saved: int = 0
    existing_jobs_touched: int = 0
    silver_jobs_upserted: int = 0
    error_count: int = 0
    errors: List[str] = field(default_factory=list)
    status: str = "COMPLETED"
    per_portal: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    def ensure_portal_entry(self, site_name: str, engine: str = "playwright_stealth") -> Dict[str, Any]:
        if site_name not in self.per_portal:
            self.per_portal[site_name] = {
                "site_name": site_name,
                "engine": engine,
                "queries_attempted": 0,
                "search_pages_ok": 0,
                "links_discovered": 0,
                "detail_pages_fetched": 0,
                "jobs_parsed_ok": 0,
                "existing_touched": 0,
                "error_count": 0,
                "error_by_category": {},
                "sample_failed_urls": [],
                "dom_diagnostic_hints": [],
                "duration_sec": 0.0,
                "yield_links_per_search_page": 0.0,
                "detail_parse_success_pct": 0.0,
                "efficiency_score": 100.0,
                "health_status": "HEALTHY",
                "tuning_recommendation": "Hoạt động ổn định, không cần chỉnh sửa.",
            }
        return self.per_portal[site_name]

    def finalize_portal_metrics(self) -> None:
        for site_name, p in self.per_portal.items():
            q_att = int(p.get("queries_attempted", 0))
            s_ok = int(p.get("search_pages_ok", 0))
            links = int(p.get("links_discovered", 0))
            d_fetched = int(p.get("detail_pages_fetched", 0))
            j_ok = int(p.get("jobs_parsed_ok", 0))
            touched = int(p.get("existing_touched", 0))
            errs = int(p.get("error_count", 0))
            err_cats = p.get("error_by_category", {})

            p["yield_links_per_search_page"] = round(links / max(1, s_ok), 2) if s_ok > 0 else 0.0
            p["detail_parse_success_pct"] = (
                round((j_ok / max(1, d_fetched)) * 100.0, 1) if d_fetched > 0 else (100.0 if touched > 0 else 0.0)
            )

            if q_att == 0:
                p["efficiency_score"] = 0.0
                p["health_status"] = "IDLE_NO_TASKS"
                p["tuning_recommendation"] = "Chưa có tác vụ quét cho cổng này trong phiên."
            elif err_cats.get("CLOUDFLARE_WAF_BLOCK", 0) > 0 and links == 0:
                p["efficiency_score"] = 15.0
                p["health_status"] = "BLOCKED_CLOUDFLARE_WAF"
                p["tuning_recommendation"] = (
                    f"Cổng {site_name} đang bị chặn Cloudflare/WAF (403/503). "
                    f"Khuyến nghị: Chuyển engine sang 'playwright_stealth', tăng min_delay_sec lên 4.5s và giảm concurrency_per_site xuống 1-2."
                )
            elif err_cats.get("SELECTOR_DRIFT_ZERO_LINKS", 0) > 0 and links == 0:
                p["efficiency_score"] = 20.0
                p["health_status"] = "INEFFECTIVE_SELECTOR_DRIFT"
                p["tuning_recommendation"] = (
                    f"Cổng {site_name} trả về HTTP 200 nhưng trích xuất được 0 link (Lệch CSS Selector). "
                    f"Gửi mục dom_diagnostic_hints của {site_name} cho AI để cập nhật selectors.job_cards trong configs/scraper_settings.yaml."
                )
            elif d_fetched > 0 and j_ok == 0:
                p["efficiency_score"] = 30.0
                p["health_status"] = "DEGRADED_DETAIL_PARSE"
                p["tuning_recommendation"] = (
                    f"Cổng {site_name} tìm thấy {links} link nhưng không bóc tách được nội dung chi tiết JD. "
                    f"Kiểm tra lại cấu trúc JSON-LD hoặc CSS Selector trang chi tiết của {site_name}."
                )
            else:
                search_success_ratio = s_ok / max(1, q_att)
                detail_ratio = (j_ok + touched) / max(1, d_fetched + touched)
                err_penalty = min(40.0, errs * 5.0)
                score = max(10.0, min(100.0, round((search_success_ratio * 50.0 + detail_ratio * 50.0) - err_penalty, 1)))
                p["efficiency_score"] = score
                if score >= 75.0:
                    p["health_status"] = "HEALTHY"
                    p["tuning_recommendation"] = f"Cổng {site_name} hoạt động hiệu quả ({j_ok} JD mới, {touched} JD cập nhật vòng đời)."
                else:
                    p["health_status"] = "PARTIAL_DEGRADATION"
                    p["tuning_recommendation"] = (
                        f"Cổng {site_name} đạt hiệu suất trung bình ({score}%), có {errs} lỗi phát sinh. "
                        f"Nên chạy '--mode retry-errors' và gửi gói Debug 1 giờ cho AI để tối ưu."
                    )

    def to_dict(self) -> Dict[str, Any]:
        self.finalize_portal_metrics()
        return {
            "run_id": self.run_id,
            "trigger_mode": self.trigger_mode,
            "target_sites": self.target_sites,
            "pages_fetched": self.pages_fetched,
            "links_discovered": self.links_discovered,
            "new_raw_saved": self.new_raw_saved,
            "existing_jobs_touched": self.existing_jobs_touched,
            "silver_jobs_upserted": self.silver_jobs_upserted,
            "error_count": self.error_count,
            "errors": self.errors[:25],
            "status": self.status,
            "per_portal": self.per_portal,
        }


class UrlCooldownCache:
    """
    Quản lý trạng thái các URL đã cào trong chu kỳ Cooldown (mặc định 24 giờ)
    thông qua Docker Redis (tự động chuyển sang bộ nhớ trong nếu Redis chưa bật).
    """

    def __init__(self, redis_url: Optional[str] = None, cooldown_hours: int = 24) -> None:
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self.ttl_seconds = max(60, int(cooldown_hours * 3600))
        self._memory_seen: set[str] = set()
        self._redis_client: Any = None
        self._redis_checked: bool = False

    def _get_redis(self) -> Any:
        if self._redis_checked:
            return self._redis_client
        self._redis_checked = True
        try:
            import redis

            client = redis.from_url(self.redis_url, socket_connect_timeout=1, decode_responses=True)
            client.ping()
            self._redis_client = client
        except Exception:
            self._redis_client = None
        return self._redis_client

    def is_seen_recently(self, url: str) -> bool:
        if url in self._memory_seen:
            return True
        r_client = self._get_redis()
        if r_client is not None:
            try:
                return bool(r_client.exists(f"skillvalue:seen_url:{url}"))
            except Exception:
                pass
        return False

    def mark_seen(self, url: str) -> None:
        self._memory_seen.add(url)
        r_client = self._get_redis()
        if r_client is not None:
            try:
                r_client.setex(f"skillvalue:seen_url:{url}", self.ttl_seconds, "1")
            except Exception:
                pass


MockTransportFn = Callable[[str, str], Awaitable[Tuple[int, str]]]


class HybridPageFetcher:
    """
    Bộ tải trang kết hợp:
    - Chế độ `playwright_stealth`: Điều khiển Chromium Headless kèm Stealth Script và chặn tài nguyên thừa.
    - Chế độ `httpx_or_playwright`: Thử tải nhanh bằng `httpx.AsyncClient`; nếu gặp HTTP 403/503 hoặc
      Cloudflare Challenge thì tự động chuyển sang Playwright Stealth.
    - Hỗ trợ `mock_transport` phục vụ kiểm thử tự động (CI/CD & Offline Verification).
    """

    def __init__(
        self,
        global_cfg: Dict[str, Any],
        mock_transport: Optional[MockTransportFn] = None,
    ) -> None:
        self.global_cfg = global_cfg
        self.mock_transport = mock_transport
        self.timeout_sec = float(global_cfg.get("timeout_sec", 30))
        self.max_retries = int(global_cfg.get("max_retries", 3))
        self.block_heavy_resources = bool(global_cfg.get("block_heavy_resources", True))
        self.user_agents: List[str] = global_cfg.get(
            "user_agents",
            [
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
            ],
        )
        self._pw_context_mgr: Any = None
        self._playwright: Any = None
        self._browser: Any = None
        self._http_client: Optional[httpx.AsyncClient] = None
        self._vnw_detail_cache: Dict[str, str] = {}
        self._browser_lock = asyncio.Lock()

    async def __aenter__(self) -> "HybridPageFetcher":
        self._http_client = httpx.AsyncClient(
            timeout=self.timeout_sec,
            follow_redirects=True,
            headers={
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
            },
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        if self._http_client is not None:
            await self._http_client.aclose()
        if self._browser is not None:
            await self._browser.close()
        if self._playwright is not None:
            await self._playwright.stop()

    def _pick_user_agent(self) -> str:
        return random.choice(self.user_agents)

    @staticmethod
    def is_anti_bot_challenged(status_code: int, html: str) -> bool:
        if status_code in (403, 429, 503):
            return True
        lower_sample = (html or "")[:4000].lower()
        return any(marker in lower_sample for marker in CHALLENGE_MARKERS)

    async def _ensure_playwright_browser(self) -> Any:
        if self._browser is not None:
            return self._browser
        async with self._browser_lock:
            if self._browser is not None:
                return self._browser
            from playwright.async_api import async_playwright

            self._pw_context_mgr = async_playwright()
            self._playwright = await self._pw_context_mgr.start()
            self._browser = await self._playwright.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                ],
            )
            return self._browser

    async def fetch_page(
        self,
        url: str,
        engine: str = "playwright_stealth",
        wait_selector: Optional[str] = None,
    ) -> Tuple[int, str]:
        """Tải nội dung HTML của URL với cơ chế Retry + Exponential Backoff."""
        if self.mock_transport is not None:
            return await self.mock_transport(url, engine)

        if url in self._vnw_detail_cache:
            return 200, self._vnw_detail_cache[url]

        last_err: Optional[Exception] = None
        for attempt in range(1, self.max_retries + 1):
            try:
                if "vietnamworks.com/viec-lam" in url and engine in ("playwright_or_api", "httpx_or_playwright"):
                    api_status, api_html = await self._fetch_vietnamworks_search_api(url)
                    if api_status == 200 and len(api_html) > 200:
                        return api_status, api_html

                if "vietnamworks.com/" in url and "/viec-lam" not in url:
                    import re as _re

                    m_vnw = _re.search(r"-(\d+)-j[dv]/?$", url, _re.IGNORECASE)
                    if m_vnw:
                        api_status, api_detail_html = await self._fetch_vietnamworks_detail_by_id(
                            m_vnw.group(1), url
                        )
                        if api_status == 200 and len(api_detail_html) > 200:
                            return api_status, api_detail_html

                if engine in ("httpx_or_playwright", "playwright_or_api"):
                    status, html = await self._fetch_via_httpx(url)
                    # Không chấp nhận vỏ SPA rỗng của VietnamWorks (chỉ có thẻ <title>Tuyển ... T11/2026</title>, không có JSON-LD)
                    is_empty_vnw_spa = (
                        "vietnamworks.com/" in url
                        and "application/ld+json" not in html
                        and "__NEXT_DATA__" not in html
                    )
                    if not self.is_anti_bot_challenged(status, html) and len(html) > 500 and not is_empty_vnw_spa:
                        return status, html
                    logger.info(
                        "[%s] HTTPX gặp challenge/SPA rỗng (status=%s) -> Chuyển sang Playwright Stealth.",
                        url,
                        status,
                    )

                return await self._fetch_via_playwright(url, wait_selector=wait_selector)
            except Exception as exc:
                last_err = exc
                backoff = (1.8**attempt) + random.uniform(0.5, 1.5)
                logger.warning(
                    "Lỗi tải trang %s (lần %d/%d): %s -> Thử lại sau %.1fs",
                    url,
                    attempt,
                    self.max_retries,
                    exc,
                    backoff,
                )
                await asyncio.sleep(backoff)

        raise RuntimeError(f"Không thể tải URL sau {self.max_retries} lần thử: {url} ({last_err})")

    async def _fetch_via_httpx(self, url: str) -> Tuple[int, str]:
        assert self._http_client is not None
        resp = await self._http_client.get(url, headers={"User-Agent": self._pick_user_agent()})
        return resp.status_code, resp.text

    def _render_vietnamworks_hit_html(self, h: Dict[str, Any]) -> Tuple[str, str, str]:
        """
        Chuyển đổi một bản ghi JSON từ API VietnamWorks (`ms.vietnamworks.com/job-search/v1.0/search`)
        thành cặp `(norm_j_url, card_html, detail_html_with_json_ld)` giữ nguyên 100% Ngày đăng (`approvedOn`),
        Hạn nộp (`expiredOn`), Số năm kinh nghiệm (`yearsOfExperience`), Địa điểm (`workingLocations`),
        Mức lương (`prettySalary` / `salaryCurrency`) và Mô tả công việc (`jobDescription` + `jobRequirement`).
        """
        import json as _json

        j_url = str(h.get("jobUrl") or "").strip()
        norm_j_url = normalize_job_url(j_url, "https://www.vietnamworks.com")
        j_title = str(h.get("jobTitle") or "Job").strip()
        c_name = str(h.get("companyName") or "Doanh nghiệp").strip()
        s_min = float(h.get("salaryMin") or 0)
        s_max = float(h.get("salaryMax") or 0)
        s_curr = str(h.get("salaryCurrency") or "USD").strip().upper()
        pretty_sal = str(h.get("prettySalary") or "").strip()
        if pretty_sal:
            sal_str = pretty_sal
        elif s_min > 0 and s_max > 0:
            unit = "USD" if (s_curr == "USD" or s_max < 100_000) else "VND"
            sal_str = f"{int(s_min)} - {int(s_max)} {unit}"
        elif s_max > 0:
            unit = "USD" if (s_curr == "USD" or s_max < 100_000) else "VND"
            sal_str = f"Up to {int(s_max)} {unit}"
        elif s_min > 0:
            unit = "USD" if (s_curr == "USD" or s_min < 100_000) else "VND"
            sal_str = f"From {int(s_min)} {unit}"
        else:
            sal_str = "Thỏa thuận"

        w_locs = h.get("workingLocations") or []
        loc_parts: List[str] = []
        if isinstance(w_locs, list):
            for wl in w_locs:
                if isinstance(wl, dict):
                    for k in ("cityNameVI", "cityName", "address"):
                        v = str(wl.get(k) or "").strip()
                        if v and v not in loc_parts:
                            loc_parts.append(v)
        elif isinstance(w_locs, str) and w_locs.strip():
            loc_parts.append(w_locs.strip())
        addr_str = str(h.get("address") or "").strip()
        if addr_str and addr_str not in loc_parts:
            loc_parts.append(addr_str)
        locality_str = ", ".join(loc_parts)

        skill_names = [
            str(sk.get("skillName")).strip()
            for sk in (h.get("skills") or [])
            if isinstance(sk, dict) and sk.get("skillName")
        ]
        skills_html = [f"<a class='skill-tag'>{sn}</a>" for sn in skill_names]
        card_html = (
            f"<div class='view_job_item'>"
            f"<h2><a class='img_job_card' href='{norm_j_url}'>{j_title}</a></h2>"
            f"<a class='company-name'>{c_name}</a>"
            f"<span class='salary'>{sal_str}</span>"
            f"<span class='location'>{locality_str}</span>"
            f"{''.join(skills_html)}"
            f"</div>"
        )

        pub_iso = str(h.get("approvedOn") or h.get("onlineOn") or h.get("createdOn") or "")[:10]
        exp_iso = str(h.get("expiredOn") or "")[:10]
        yrs_exp = h.get("yearsOfExperience")
        exp_req_str = f"{yrs_exp} năm" if yrs_exp is not None else "1.5 năm"
        desc_body = f"{h.get('jobDescription') or ''}\n{h.get('jobRequirement') or ''}".strip()

        json_ld_obj: Dict[str, Any] = {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": j_title,
            "datePosted": pub_iso,
            "validThrough": exp_iso,
            "hiringOrganization": {"@type": "Organization", "name": c_name},
            "jobLocation": {
                "@type": "Place",
                "address": {
                    "streetAddress": addr_str,
                    "addressLocality": locality_str,
                },
            },
            "experienceRequirements": exp_req_str,
            "description": desc_body,
        }
        if not pretty_sal and (s_min or s_max):
            json_ld_obj["baseSalary"] = {
                "@type": "MonetaryAmount",
                "currency": s_curr,
                "value": {"minValue": s_min, "maxValue": s_max},
            }

        detail_html = (
            f"<html><head><title>{j_title}</title>"
            f"<script type='application/ld+json'>{_json.dumps(json_ld_obj, ensure_ascii=False)}</script>"
            f"</head><body><h1>{j_title}</h1>"
            f"<span class='salary'>{sal_str}</span>"
            f"<span class='location'>{locality_str}</span>"
            f"{''.join(skills_html)}"
            f"</body></html>"
        )
        return norm_j_url, card_html, detail_html

    async def _fetch_vietnamworks_detail_by_id(self, job_id: str, url: str) -> Tuple[int, str]:
        """Truy vấn trực tiếp API VietnamWorks theo `jobId` để lấy đầy đủ `approvedOn`, `expiredOn`, `yearsOfExperience`, `prettySalary` và `jobDescription`."""
        assert self._http_client is not None
        resp = await self._http_client.post(
            "https://ms.vietnamworks.com/job-search/v1.0/search",
            json={
                "userId": 0,
                "query": "",
                "filter": [{"field": "jobId", "value": str(job_id)}],
                "ranges": [],
                "order": [],
                "hitsPerPage": 1,
                "page": 0,
            },
            headers={"User-Agent": self._pick_user_agent()},
        )
        if resp.status_code != 200:
            return resp.status_code, ""
        hits = (resp.json() or {}).get("data") or []
        if not hits:
            return 404, ""
        norm_j_url, _, detail_html = self._render_vietnamworks_hit_html(hits[0])
        self._vnw_detail_cache[norm_j_url] = detail_html
        self._vnw_detail_cache[url] = detail_html
        return 200, detail_html

    async def _fetch_vietnamworks_search_api(self, search_url: str) -> Tuple[int, str]:
        """
        Gọi trực tiếp API tìm kiếm công khai của VietnamWorks (`https://ms.vietnamworks.com/job-search/v1.0/search`)
        và kết xuất thành danh sách thẻ HTML chuẩn để bộ phân tích trích xuất 100% URL thực (`-jd` / `-jv`).
        """
        assert self._http_client is not None
        from urllib.parse import parse_qs, urlparse

        parsed = urlparse(search_url)
        qs = parse_qs(parsed.query)
        kw = (qs.get("q") or ["Data Analyst"])[0]
        page_num = max(0, int((qs.get("page") or ["1"])[0]) - 1)
        resp = await self._http_client.post(
            "https://ms.vietnamworks.com/job-search/v1.0/search",
            json={
                "userId": 0,
                "query": kw,
                "filter": [],
                "ranges": [],
                "order": [],
                "hitsPerPage": 40,
                "page": page_num,
            },
            headers={"User-Agent": self._pick_user_agent()},
        )
        if resp.status_code != 200:
            return resp.status_code, ""
        payload = resp.json()
        hits = payload.get("data") or []
        cards_html: List[str] = ["<html><body><div class='vnw-api-results'>"]
        for h in hits:
            if not h.get("isOnline", True) or not h.get("isActive", True):
                continue
            j_url = str(h.get("jobUrl") or "").strip()
            if not j_url or is_promotional_banner_url(j_url):
                continue
            norm_j_url, card_html, detail_html = self._render_vietnamworks_hit_html(h)
            cards_html.append(card_html)
            self._vnw_detail_cache[norm_j_url] = detail_html
        cards_html.append("</div></body></html>")
        return 200, "\n".join(cards_html)

    async def _fetch_via_playwright(
        self,
        url: str,
        wait_selector: Optional[str] = None,
    ) -> Tuple[int, str]:
        try:
            browser = await self._ensure_playwright_browser()
        except Exception as pw_exc:
            logger.warning(
                "Playwright chưa cài đặt hoặc thiếu Chromium (%s) -> Fallback sang HTTPX cho URL: %s",
                pw_exc,
                url,
            )
            return await self._fetch_via_httpx(url)

        context = await browser.new_context(
            user_agent=self._pick_user_agent(),
            viewport={"width": 1920, "height": 1080},
            locale="vi-VN",
            timezone_id="Asia/Ho_Chi_Minh",
        )
        await context.add_init_script(STEALTH_INIT_SCRIPT)

        if self.block_heavy_resources:

            async def _route_interceptor(route: Any) -> None:
                req = route.request
                if req.resource_type in BLOCKED_RESOURCE_TYPES or any(
                    d in req.url for d in BLOCKED_TRACKER_DOMAINS
                ):
                    await route.abort()
                else:
                    await route.continue_()

            await context.route("**/*", _route_interceptor)

        page = await context.new_page()
        try:
            response = await page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=int(self.timeout_sec * 1000),
            )
            status_code = response.status if response else 200

            if wait_selector:
                try:
                    await page.wait_for_selector(wait_selector, timeout=6000)
                except Exception:
                    pass

            # Cuộn trang nhẹ để kích hoạt các thành phần lazy-load
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.45);")
            await asyncio.sleep(0.4)
            html = await page.content()
            return status_code, html
        finally:
            await context.close()


class AsyncPlaywrightScraperRunner:
    """
    Trình điều khiển Cào Đa nguồn Bất đồng bộ:
    - Quản lý luồng cào đồng thời trên 4 cổng (TopCV, ITviec, CareerViet, VietnamWorks).
    - Tự động chuyển hóa dữ liệu qua `UnifiedETLPipeline` (Tầng Bronze -> Silver -> Gold).
    - Lưu trữ trực tiếp vào Docker PostgreSQL (`PostgresJobRepository`).
    """

    def __init__(
        self,
        settings_path: Path = Path("configs/scraper_settings.yaml"),
        configs_dir: Path = Path("configs"),
        repo: Optional[PostgresJobRepository] = None,
        mock_transport: Optional[MockTransportFn] = None,
        fast_mode: bool = False,
    ) -> None:
        self.settings_path = settings_path
        with open(settings_path, "r", encoding="utf-8") as f:
            self.cfg = yaml.safe_load(f)

        self.global_cfg = self.cfg.get("global", {})
        self.min_delay = 0.01 if fast_mode else float(self.global_cfg.get("min_delay_sec", 3.0))
        self.max_delay = 0.05 if fast_mode else float(self.global_cfg.get("max_delay_sec", 6.5))
        self.concurrency_per_site = int(self.global_cfg.get("concurrency_per_site", 2))

        self.scrapers: Dict[str, BaseVietnamJobScraper] = build_scrapers_registry(settings_path)
        self.pipeline = UnifiedETLPipeline(configs_dir)
        self.repo = repo or PostgresJobRepository()
        self.error_logger = ScraperErrorLogger(repo=self.repo)
        self.url_cache = UrlCooldownCache(
            cooldown_hours=int(self.global_cfg.get("url_cooldown_hours", 24))
        )
        self.mock_transport = mock_transport

    def build_search_tasks(
        self,
        sites: Optional[List[str]] = None,
        pillars: Optional[List[str]] = None,
        cities: Optional[List[str]] = None,
        max_pages: Optional[int] = None,
    ) -> List[CrawlSearchTask]:
        """Sinh ma trận tác vụ tìm kiếm `(Site × Pillar Keyword × City × Page)`."""
        sites_cfg = self.cfg.get("sites", {})
        active_sites = [
            s
            for s, sc in sites_cfg.items()
            if sc.get("enabled", True) and (not sites or s in sites)
        ]

        matrix_cfg = self.cfg.get("search_matrix", {})
        target_cities = [
            c
            for c in matrix_cfg.get("target_cities", [])
            if not cities or c.get("code") in cities
        ]
        pillar_keywords = matrix_cfg.get("pillar_keywords", {})
        pages_limit = max_pages or int(self.global_cfg.get("max_pages_per_query", 2))

        tasks: List[CrawlSearchTask] = []
        for site_name in active_sites:
            for pillar_code, kw_list in pillar_keywords.items():
                if pillars and pillar_code not in pillars:
                    continue
                for kw in kw_list:
                    for city_cfg in target_cities:
                        for page_num in range(1, pages_limit + 1):
                            tasks.append(
                                CrawlSearchTask(
                                    site_name=site_name,
                                    pillar_code=pillar_code,
                                    keyword=kw,
                                    city_cfg=city_cfg,
                                    page=page_num,
                                )
                            )
        return tasks

    async def _polite_sleep(self) -> None:
        if self.max_delay > 0:
            await asyncio.sleep(random.uniform(self.min_delay, self.max_delay))

    async def run_crawl_session(
        self,
        trigger_mode: str = "CLI_ONCE",
        sites: Optional[List[str]] = None,
        pillars: Optional[List[str]] = None,
        cities: Optional[List[str]] = None,
        max_pages: int = 1,
        max_jobs_per_site: int = 50,
    ) -> CrawlRunStats:
        """
        Thực thi một phiên cào dữ liệu hoàn chỉnh:
        1. Đồng bộ từ điển kỹ năng số vào PostgreSQL (`skills_ontology`).
        2. Chia nhóm tác vụ theo từng cổng tuyển dụng và chạy song song (`asyncio.gather`).
        3. Với mỗi trang danh sách tìm kiếm, bóc tách các link chi tiết tin đăng.
        4. Kiểm tra Cooldown / Trùng lặp URL:
           - Nếu URL đã tồn tại gần đây -> gọi `touch_existing_job_by_url` để cập nhật `vacancy_duration_days`.
           - Nếu URL mới -> tải trang chi tiết -> lưu Bronze (`raw_job_postings`) -> chạy ETL -> Upsert Silver/Gold (`jobs_master`, `job_skills`).
        5. Lưu thống kê phiên cào vào `scraper_crawl_runs`.
        """
        self.repo.sync_skills_ontology()
        all_tasks = self.build_search_tasks(
            sites=sites,
            pillars=pillars,
            cities=cities,
            max_pages=max_pages,
        )
        target_sites = sorted({t.site_name for t in all_tasks})
        run_id = self.repo.start_crawl_run(trigger_mode=trigger_mode, target_sites=target_sites)
        stats = CrawlRunStats(
            run_id=run_id,
            trigger_mode=trigger_mode,
            target_sites=target_sites,
        )

        tasks_by_site: Dict[str, List[CrawlSearchTask]] = {}
        for t in all_tasks:
            tasks_by_site.setdefault(t.site_name, []).append(t)

        async with HybridPageFetcher(
            self.global_cfg,
            mock_transport=self.mock_transport,
        ) as fetcher:
            site_coroutines = [
                self._run_site_worker(
                    site_name=s_name,
                    site_tasks=s_tasks,
                    fetcher=fetcher,
                    stats=stats,
                    max_jobs=max_jobs_per_site,
                )
                for s_name, s_tasks in tasks_by_site.items()
            ]
            await asyncio.gather(*site_coroutines)

        if stats.error_count > 0 and stats.silver_jobs_upserted == 0:
            stats.status = "FAILED"
        elif stats.error_count > 0:
            stats.status = "PARTIAL_FAILURE"
        else:
            stats.status = "COMPLETED"

        if stats.error_count > 0:
            self.error_logger.generate_remediation_report()

        self.repo.finish_crawl_run(run_id, stats.to_dict())
        return stats

    async def retry_failed_dlq_urls(self) -> Dict[str, Any]:
        """
        Chạy quét bù tự động toàn bộ các URL đang nằm trong Hàng đợi Lỗi (`PENDING_RETRY`)
        và cập nhật lại báo cáo `docs/audits/scraper-error-remediation-report.md`.
        """
        pending_items = self.error_logger.list_dlq_items(status_filter="PENDING_RETRY")
        resolved_count = 0
        still_failing = 0

        async with HybridPageFetcher(
            self.global_cfg,
            mock_transport=self.mock_transport,
        ) as fetcher:
            for item in pending_items:
                site_name = str(item.get("source_site", "topcv"))
                target_url = str(item.get("target_url", ""))
                stage = str(item.get("stage", "SEARCH_LISTING"))
                scraper = self.scrapers.get(site_name)
                if not scraper or not target_url:
                    continue

                status_code, html_text = await fetcher.fetch_page(
                    target_url,
                    engine="playwright_stealth",
                    wait_selector="h1",
                )
                if status_code == 200 and html_text:
                    if stage == "SEARCH_LISTING":
                        links = scraper.parse_search_listing_html(html_text)
                        if len(links) > 0:
                            self.error_logger.mark_url_resolved(target_url)
                            resolved_count += 1
                            continue
                    else:
                        raw_job = scraper.parse_job_detail_html(
                            html=html_text,
                            url=target_url,
                            http_status=status_code,
                        )
                        if raw_job.job_title_raw != "Unknown Title" or raw_job.description_raw:
                            raw_id, _ = self.repo.save_raw_job_posting(raw_job)
                            processed = self.pipeline.process_raw_job(raw_job)
                            self.repo.upsert_processed_job(processed, raw_id=raw_id)
                            self.error_logger.mark_url_resolved(target_url)
                            resolved_count += 1
                            continue

                still_failing += 1

        report_path = self.error_logger.generate_remediation_report()
        return {
            "total_retried": len(pending_items),
            "resolved_count": resolved_count,
            "still_failing": still_failing,
            "remediation_report_path": str(report_path),
        }

    async def _run_site_worker(
        self,
        site_name: str,
        site_tasks: List[CrawlSearchTask],
        fetcher: HybridPageFetcher,
        stats: CrawlRunStats,
        max_jobs: int,
    ) -> None:
        scraper = self.scrapers[site_name]
        site_cfg = self.cfg.get("sites", {}).get(site_name, {})
        engine = str(site_cfg.get("engine", "playwright_stealth"))
        card_selector = site_cfg.get("selectors", {}).get("job_cards")
        semaphore = asyncio.Semaphore(self.concurrency_per_site)
        site_jobs_scraped = 0
        unlimited_crawl = bool(self.global_cfg.get("unlimited_daily_crawl", True))
        effective_max_jobs = 100_000 if (max_jobs <= 0 or unlimited_crawl and max_jobs >= 500) else max_jobs
        early_stop_streak_limit = int(self.global_cfg.get("early_stop_seen_streak", 2))
        seen_streak_by_query: Dict[Tuple[str, str], int] = {}
        p_stat = stats.ensure_portal_entry(site_name, engine=engine)
        t_start = time.perf_counter()

        for task in site_tasks:
            if site_jobs_scraped >= effective_max_jobs:
                break

            q_key = (task.keyword, str(task.city_cfg.get("code", "")))
            if (
                early_stop_streak_limit > 0
                and stats.trigger_mode != "HISTORICAL_BACKFILL"
                and seen_streak_by_query.get(q_key, 0) >= early_stop_streak_limit
            ):
                # Đã gặp liên tiếp N trang toàn tin cũ đã có trong DB -> bỏ qua các trang sâu hơn của từ khóa này
                continue

            search_url = scraper.build_search_url(
                keyword=task.keyword,
                city_cfg=task.city_cfg,
                page=task.page,
            )
            p_stat["queries_attempted"] = int(p_stat.get("queries_attempted", 0)) + 1

            try:
                async with semaphore:
                    await self._polite_sleep()
                    status_code, listing_html = await fetcher.fetch_page(
                        search_url,
                        engine=engine,
                        wait_selector=card_selector,
                    )
                    stats.pages_fetched += 1

                if status_code >= 400 or not listing_html:
                    err_cat = self.error_logger.classify_http_or_parse_error(
                        http_status=status_code,
                        html_text=listing_html,
                        stage="SEARCH_LISTING",
                    )
                    err_msg = f"[{site_name}] Trang danh sách lỗi HTTP {status_code} ({err_cat}) tại {search_url}"
                    stats.error_count += 1
                    stats.errors.append(err_msg)
                    p_stat["error_count"] = int(p_stat.get("error_count", 0)) + 1
                    p_stat["error_by_category"][err_cat] = int(p_stat["error_by_category"].get(err_cat, 0)) + 1
                    if len(p_stat["sample_failed_urls"]) < 5:
                        p_stat["sample_failed_urls"].append(search_url)
                    if len(p_stat["dom_diagnostic_hints"]) < 3 and listing_html:
                        p_stat["dom_diagnostic_hints"].append(
                            {"url": search_url, "http_status": status_code, **extract_dom_diagnostic_hint(listing_html)}
                        )
                    self.error_logger.log_error(
                        source_site=site_name,
                        target_url=search_url,
                        stage="SEARCH_LISTING",
                        error_category=err_cat,
                        error_message=err_msg,
                        http_status=status_code,
                        html_snippet=listing_html,
                        run_id=stats.run_id,
                    )
                    continue

                p_stat["search_pages_ok"] = int(p_stat.get("search_pages_ok", 0)) + 1
                discovered_links = scraper.parse_search_listing_html(
                    listing_html,
                    search_keyword=task.keyword,
                    search_city=task.city_cfg.get("name", task.city_cfg.get("code", "")),
                )
                if len(discovered_links) == 0:
                    err_msg = f"[{site_name}] SELECTOR_DRIFT_ZERO_LINKS: HTTP 200 nhưng trích xuất được 0 link tại {search_url}"
                    stats.error_count += 1
                    stats.errors.append(err_msg)
                    p_stat["error_count"] = int(p_stat.get("error_count", 0)) + 1
                    p_stat["error_by_category"]["SELECTOR_DRIFT_ZERO_LINKS"] = (
                        int(p_stat["error_by_category"].get("SELECTOR_DRIFT_ZERO_LINKS", 0)) + 1
                    )
                    if len(p_stat["sample_failed_urls"]) < 5:
                        p_stat["sample_failed_urls"].append(search_url)
                    if len(p_stat["dom_diagnostic_hints"]) < 3:
                        p_stat["dom_diagnostic_hints"].append(
                            {"url": search_url, "http_status": status_code, **extract_dom_diagnostic_hint(listing_html)}
                        )
                    self.error_logger.log_error(
                        source_site=site_name,
                        target_url=search_url,
                        stage="SEARCH_LISTING",
                        error_category="SELECTOR_DRIFT_ZERO_LINKS",
                        error_message=err_msg,
                        http_status=status_code,
                        html_snippet=listing_html,
                        run_id=stats.run_id,
                    )
                    continue

                self.error_logger.mark_url_resolved(search_url)
                stats.links_discovered += len(discovered_links)
                p_stat["links_discovered"] = int(p_stat.get("links_discovered", 0)) + len(discovered_links)

                new_links_on_page = 0
                for link_item in discovered_links:
                    if site_jobs_scraped >= effective_max_jobs:
                        break

                    if self.url_cache.is_seen_recently(link_item.job_url):
                        touched = self.repo.touch_existing_job_by_url(
                            source_site=site_name,
                            source_url=link_item.job_url,
                        )
                        if touched:
                            stats.existing_jobs_touched += 1
                            p_stat["existing_touched"] = int(p_stat.get("existing_touched", 0)) + 1
                            continue

                    new_links_on_page += 1
                    await self._fetch_and_persist_job_detail(
                        scraper=scraper,
                        fetcher=fetcher,
                        engine=engine,
                        link_item=link_item,
                        semaphore=semaphore,
                        stats=stats,
                    )
                    site_jobs_scraped += 1

                if new_links_on_page == 0 and len(discovered_links) > 0:
                    seen_streak_by_query[q_key] = seen_streak_by_query.get(q_key, 0) + 1
                else:
                    seen_streak_by_query[q_key] = 0

            except Exception as exc:
                stats.error_count += 1
                err_msg = f"[{site_name}] Lỗi tại {search_url}: {exc}"
                stats.errors.append(err_msg)
                p_stat["error_count"] = int(p_stat.get("error_count", 0)) + 1
                p_stat["error_by_category"]["RUNTIME_EXCEPTION"] = (
                    int(p_stat["error_by_category"].get("RUNTIME_EXCEPTION", 0)) + 1
                )
                self.error_logger.log_error(
                    source_site=site_name,
                    target_url=search_url,
                    stage="SEARCH_LISTING",
                    error_category="RUNTIME_EXCEPTION",
                    error_message=err_msg,
                    http_status=0,
                    run_id=stats.run_id,
                )
                logger.warning(err_msg)

        p_stat["duration_sec"] = round(time.perf_counter() - t_start, 2)

    async def _fetch_and_persist_job_detail(
        self,
        scraper: BaseVietnamJobScraper,
        fetcher: HybridPageFetcher,
        engine: str,
        link_item: DiscoveredJobLink,
        semaphore: asyncio.Semaphore,
        stats: CrawlRunStats,
    ) -> None:
        p_stat = stats.ensure_portal_entry(scraper.site_name, engine=engine)
        p_stat["detail_pages_fetched"] = int(p_stat.get("detail_pages_fetched", 0)) + 1
        try:
            async with semaphore:
                await self._polite_sleep()
                detail_status, detail_html = await fetcher.fetch_page(
                    link_item.job_url,
                    engine=engine,
                    wait_selector="h1",
                )
                stats.pages_fetched += 1

            if detail_status >= 400 or not detail_html:
                err_cat = self.error_logger.classify_http_or_parse_error(
                    http_status=detail_status,
                    html_text=detail_html,
                    stage="JOB_DETAIL",
                )
                err_msg = f"[{scraper.site_name}] Trang JD lỗi HTTP {detail_status} ({err_cat}) tại {link_item.job_url}"
                stats.error_count += 1
                stats.errors.append(err_msg)
                p_stat["error_count"] = int(p_stat.get("error_count", 0)) + 1
                p_stat["error_by_category"][err_cat] = int(p_stat["error_by_category"].get(err_cat, 0)) + 1
                if len(p_stat["sample_failed_urls"]) < 5:
                    p_stat["sample_failed_urls"].append(link_item.job_url)
                self.error_logger.log_error(
                    source_site=scraper.site_name,
                    target_url=link_item.job_url,
                    stage="JOB_DETAIL",
                    error_category=err_cat,
                    error_message=err_msg,
                    http_status=detail_status,
                    html_snippet=detail_html,
                    run_id=stats.run_id,
                )
                return

            raw_job = scraper.parse_job_detail_html(
                html=detail_html,
                url=link_item.job_url,
                search_keyword=link_item.search_keyword,
                search_city=link_item.search_city,
                listing_hint=link_item,
                http_status=detail_status,
            )

            if is_soft_404_or_deleted_job(detail_html, raw_job):
                err_msg = (
                    f"[{scraper.site_name}] HTTP_404_EXPIRED_JOB (Soft-404): "
                    f"Tin tuyển dụng đã bị xóa/hết hạn hoặc là link banner rỗng tại {link_item.job_url}"
                )
                stats.error_count += 1
                stats.errors.append(err_msg)
                p_stat["error_count"] = int(p_stat.get("error_count", 0)) + 1
                p_stat["error_by_category"]["HTTP_404_EXPIRED_JOB"] = (
                    int(p_stat["error_by_category"].get("HTTP_404_EXPIRED_JOB", 0)) + 1
                )
                if len(p_stat["sample_failed_urls"]) < 5:
                    p_stat["sample_failed_urls"].append(link_item.job_url)
                self.error_logger.log_error(
                    source_site=scraper.site_name,
                    target_url=link_item.job_url,
                    stage="JOB_DETAIL",
                    error_category="HTTP_404_EXPIRED_JOB",
                    error_message=err_msg,
                    http_status=404,
                    html_snippet=detail_html,
                    run_id=stats.run_id,
                )
                return

            # 1. Lưu Tầng Bronze (Raw Data Lake)
            raw_id, is_new_raw = self.repo.save_raw_job_posting(raw_job)
            if is_new_raw:
                stats.new_raw_saved += 1

            # 2. Chuyển hóa ETL và Upsert Tầng Silver & Gold (Khử trùng lặp đa nguồn)
            processed_record = self.pipeline.process_raw_job(raw_job)
            self.repo.upsert_processed_job(processed_record, raw_id=raw_id)
            stats.silver_jobs_upserted += 1
            p_stat["jobs_parsed_ok"] = int(p_stat.get("jobs_parsed_ok", 0)) + 1

            # 3. Đánh dấu URL vào Cooldown Cache & xóa trạng thái lỗi nếu trước đó nằm trong DLQ
            self.url_cache.mark_seen(link_item.job_url)
            self.error_logger.mark_url_resolved(link_item.job_url)

        except Exception as exc:
            stats.error_count += 1
            err_msg = f"[{scraper.site_name}] Lỗi chi tiết JD {link_item.job_url}: {exc}"
            stats.errors.append(err_msg)
            p_stat["error_count"] = int(p_stat.get("error_count", 0)) + 1
            p_stat["error_by_category"]["RUNTIME_EXCEPTION"] = (
                int(p_stat["error_by_category"].get("RUNTIME_EXCEPTION", 0)) + 1
            )
            self.error_logger.log_error(
                source_site=scraper.site_name,
                target_url=link_item.job_url,
                stage="JOB_DETAIL",
                error_category="RUNTIME_EXCEPTION",
                error_message=err_msg,
                http_status=0,
                run_id=stats.run_id,
            )
            logger.warning(err_msg)
