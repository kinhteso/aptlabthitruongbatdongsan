import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/googleAuth";
import {
  computeScrapedRecordsAnalytics,
  HISTORICAL_BACKFILL_RECORDS,
  SCRAPED_JOBS_DATASET,
  ScrapedJobRecord,
} from "@/lib/labData";

const USD_TO_MILLION_VND = 0.0254;

const TIER_SALARY_CAPS: Record<string, { maxMid: number; maxHigh: number }> = {
  T1_INTERN: { maxMid: 65.0, maxHigh: 85.0 },
  T2_FRESHER: { maxMid: 110.0, maxHigh: 140.0 },
  T3_JUNIOR: { maxMid: 180.0, maxHigh: 230.0 },
  T4_MIDDLE_SENIOR: { maxMid: 320.0, maxHigh: 420.0 },
  T5_LEAD_MANAGER: { maxMid: 650.0, maxHigh: 850.0 },
  T6_DIRECTOR: { maxMid: 1800.0, maxHigh: 2500.0 },
};

function cleanSourceUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  try {
    const u = new URL(rawUrl.trim());
    const stripParams = [
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
    ];
    for (const k of Array.from(u.searchParams.keys())) {
      if (stripParams.includes(k.toLowerCase())) {
        u.searchParams.delete(k);
      }
    }
    u.hash = "";
    const out = u.toString();
    return out.endsWith("/") && u.pathname !== "/" ? out.slice(0, -1) : out;
  } catch {
    return rawUrl.split("?")[0].replace(/\/+$/, "");
  }
}

function canonicalizePortalSite(site: string, urls: string[]): string {
  for (const u of urls || []) {
    const uLow = (u || "").toLowerCase();
    if (uLow.includes("chotot.com") || uLow.includes("nhatot.com")) return "chotot";
    if (uLow.includes("alonhadat.com.vn")) return "alonhadat";
    if (uLow.includes("mogi.vn")) return "mogi";
    if (uLow.includes("muaban.net")) return "muaban";
    if (uLow.includes("meeyland.com")) return "meeyland";
    if (uLow.includes("batdongsan.com.vn")) return "batdongsan";
  }
  const sLow = (site || "").trim().toLowerCase();
  const map: Record<string, string> = {
    itviec: "chotot",
    careerviet: "alonhadat",
    vietnamworks: "mogi",
    topcv: "batdongsan",
  };
  return map[sLow] || sLow || "batdongsan";
}

function sanitizeScrapedRecord(rec: ScrapedJobRecord): ScrapedJobRecord {
  const titleLower = rec.job_title_raw.toLowerCase();
  const combinedText = `${rec.job_title_raw} ${(rec.raw_skill_tags || []).join(" ")} ${rec.description_clean || ""}`.toLowerCase();
  let {
    sector_pillar,
    canonical_role,
    career_tier,
    exp_years_mid,
    salary_raw_text,
    salary_min_vnd,
    salary_max_vnd,
    salary_mid_vnd,
    currency_original,
    search_city,
    primary_district_cluster,
  } = rec;

  const cleanUrls = Array.from(
    new Set((rec.source_urls || []).map(cleanSourceUrl).filter(Boolean))
  );
  const canonSites = Array.from(
    new Set(
      (rec.source_sites && rec.source_sites.length > 0 ? rec.source_sites : ["batdongsan"]).map(
        (s) => canonicalizePortalSite(s, cleanUrls)
      )
    )
  );

  // Khôi phục diện tích thực tế (m²) từ chuỗi giá hoặc tag/mô tả (khắc phục lỗi 18.5 m² do tách số '2' trong 'm2')
  const areaCandidateStr = `${salary_raw_text || ""} ${(rec.raw_skill_tags || []).join(" ")} ${rec.job_title_raw} ${rec.requirements_clean || ""}`;
  const mArea = areaCandidateStr.match(/\b(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:m2|m²)\b/i);
  if (mArea?.[1]) {
    const parsedArea = Number(mArea[1].replace(",", "."));
    if (parsedArea >= 8 && parsedArea <= 50000) {
      exp_years_mid = Number(parsedArea.toFixed(1));
    }
  }

  // Khôi phục địa chỉ Phường/Quận chi tiết từ mô tả nếu search_city chỉ lưu mã tỉnh ngắn (HN, HCM, DN...)
  if (!search_city || ["HN", "HCM", "DN", "BD", "BN", "HP"].includes(search_city.trim())) {
    const mAddr = (rec.description_clean || "").match(/Địa\s*chỉ\s*:\s*([^.\n]{6,120})/i);
    if (mAddr?.[1]) {
      search_city = mAddr[1].trim().replace(/^[,\s-]+|[,\s-]+$/g, "");
    }
  }
  if (!primary_district_cluster || primary_district_cluster === "TECH_HUB") {
    primary_district_cluster =
      search_city && !["HN", "HCM", "DN", "BD", "BN", "HP"].includes(search_city.trim())
        ? search_city
        : "Khu Đô thị Trung tâm & Dân cư Hiện hữu";
  }

  // 1. Sửa phân loại tầng giá trị BĐS Giá rẻ / NOXH
  if (
    career_tier !== "T1_INTERN" &&
    ["nhà ở xã hội", "noxh", "thu nhập thấp", "thực tập", "thuc tap", "intern"].some((kw) =>
      titleLower.includes(kw)
    )
  ) {
    career_tier = "T1_INTERN";
  }

  // 2. Sửa UNCLASSIFIED cho các phân khúc Bất động sản Việt Nam (Căn hộ/CCMN, Nhà riêng, Shophouse/Mặt phố, Đất nền)
  if (canonical_role === "UNCLASSIFIED" || sector_pillar === "UNCLASSIFIED") {
    if (
      [
        "căn hộ",
        "chung cư",
        "chcc",
        "ccmn",
        "chung cư mini",
        "studio",
        "officetel",
        "penthouse",
        "duplex",
        "nhà ở xã hội",
        "noxh",
        "tập thể",
        "căn 1 ngủ",
        "căn 2 ngủ",
        "1pn",
        "2pn",
        "3pn",
      ].some((kw) => combinedText.includes(kw))
    ) {
      sector_pillar = "DE-01";
      canonical_role = "ROLE_DATA_ANALYST";
    } else if (
      [
        "mặt phố",
        "shophouse",
        "building",
        "tòa nhà",
        "văn phòng",
        "mặt bằng kinh doanh",
        "khách sạn",
        "chdv",
        "căn hộ dịch vụ",
        "nhà trọ",
        "dãy trọ",
        "condotel",
        "resort",
      ].some((kw) => combinedText.includes(kw))
    ) {
      sector_pillar = "DE-03";
      canonical_role = "ROLE_IT_BA";
    } else if (
      [
        "bán đất",
        "đất nền",
        "lô đất",
        "thửa đất",
        "đất thổ cư",
        "đất mặt biển",
        "đất đấu giá",
        "đất dự án",
        "đất kdc",
        "đất kcn",
      ].some((kw) => combinedText.includes(kw))
    ) {
      sector_pillar = "DE-04";
      canonical_role = "ROLE_GROWTH_MARKETING";
    } else {
      sector_pillar = "DE-02";
      canonical_role = "ROLE_DATA_ENGINEER";
    }
  }

  // 3. Chuẩn hóa & Kiểm định toàn diện mức lương trên MỌI bản ghi:
  // - Khử lỗi sentinel 999 triệu VNĐ/tháng khi prettySalary = "Thương lượng"
  // - Khử lỗi nối nhầm hậu tố "USD" vào chuỗi lương VNĐ ("Up to 35m ₫/month USD", "25 - 40 triệu USD", "$ 15tr-40tr /tháng")
  // - Chia 12 cho các tin đăng lương theo năm ("Từ 185tr ₫/năm", "400m-450m ₫/year")
  // - Chặn trần thực tế theo từng tầng Tháp nghề nghiệp (không để lọt mức lương ảo > 90 triệu/tháng hoặc biên độ hoa hồng ảo)
  let rawCleanDisplay = (salary_raw_text || "Thỏa thuận").trim();
  const rawLowerInitial = rawCleanDisplay.toLowerCase();
  const hasVndMillion =
    ["triệu", "tr", "trieu", "củ", "₫", "vnđ", "vnd", "đồng"].some((t) =>
      rawLowerInitial.includes(t)
    ) || /\b\d+(?:\.\d+)?\s*(?:m|mil)\b/i.test(rawLowerInitial);

  if (hasVndMillion) {
    rawCleanDisplay = rawCleanDisplay
      .replace(/\s+USD\b/gi, "")
      .replace(/^\$\s*/g, "")
      .trim();
  } else if (/^(thương lượng|thỏa thuận|thoả thuận|cạnh tranh)\s+usd$/i.test(rawCleanDisplay)) {
    rawCleanDisplay = rawCleanDisplay.replace(/\s+usd$/i, "").trim();
  }
  salary_raw_text = rawCleanDisplay || "Thỏa thuận";

  const rawLower = salary_raw_text.toLowerCase();
  const negotiableKeywords = [
    "thỏa thuận",
    "thoả thuận",
    "thương lượng",
    "cạnh tranh",
    "negotiable",
    "competitive",
    "you'll love it",
    "attractive",
  ];
  const hasDigits = /\d/.test(rawLower);

  // Nếu backend Python (PriceNormalizer) đã tính sẵn đơn giá triệu/m² hợp lệ (5..2000 tr/m²), ưu tiên giữ nguyên
  if (
    salary_mid_vnd != null &&
    salary_mid_vnd >= 5.0 &&
    salary_mid_vnd <= 2000.0
  ) {
    salary_min_vnd =
      salary_min_vnd != null && salary_min_vnd > 0
        ? salary_min_vnd
        : Number((salary_mid_vnd * 0.92).toFixed(2));
    salary_max_vnd =
      salary_max_vnd != null && salary_max_vnd > 0
        ? salary_max_vnd
        : Number((salary_mid_vnd * 1.08).toFixed(2));
    currency_original = "VND";
  } else if (
    !hasDigits ||
    (negotiableKeywords.some((k) => rawLower.includes(k)) && !hasDigits)
  ) {
    salary_min_vnd = null;
    salary_max_vnd = null;
    salary_mid_vnd = null;
    currency_original = "VND";
  } else {
    const areaM2 = exp_years_mid >= 15 ? exp_years_mid : 75.0;
    const isBillionVnd = /\b(tỷ|ty|tỉ)\b/i.test(rawLower);
    const isPerM2 = /\b(tr\/m|triệu\/m|tr\s*\/\s*m2)\b/i.test(rawLower);
    const cleanNumStr = rawLower
      .replace(/(\d),(\d{3})\b/g, "$1$2")
      .replace(/,/g, ".");
    const nums = (cleanNumStr.match(/\d+(?:\.\d+)?/g) || []).map(Number);

    if (nums.length === 0) {
      salary_min_vnd = null;
      salary_max_vnd = null;
      salary_mid_vnd = null;
      currency_original = "VND";
    } else if (isPerM2) {
      const unitM2 = nums[0];
      salary_mid_vnd = Number(unitM2.toFixed(2));
      salary_min_vnd = Number((unitM2 * 0.92).toFixed(2));
      salary_max_vnd = Number((unitM2 * 1.08).toFixed(2));
      currency_original = "VND";
    } else if (isBillionVnd) {
      const totalMil = nums[0] * 1000.0;
      const unitM2 = Number((totalMil / Math.max(20, areaM2)).toFixed(2));
      salary_mid_vnd = unitM2;
      salary_min_vnd = Number((unitM2 * 0.92).toFixed(2));
      salary_max_vnd = Number((unitM2 * 1.08).toFixed(2));
      currency_original = "VND";
    } else {
      const hasK = ["k", "nghìn", "ngàn"].some((t) => rawLower.includes(t));
      const isAnnual = [
        "/năm",
        "/ năm",
        "mỗi năm",
        "tr/năm",
        "triệu/năm",
        "/year",
        "/yr",
        "per year",
        "annual",
      ].some((t) => rawLower.includes(t));

      let isUsd =
        !hasVndMillion &&
        ["usd", "$", "đô"].some((t) => rawLower.includes(t));
      if (!isUsd && !hasK && !hasVndMillion) {
        const maxNum = Math.max(...nums);
        if (maxNum >= 180 && maxNum < 100000) {
          isUsd = true;
        }
      }
      currency_original = isUsd ? "USD" : "VND";

      const toMillionVnd = (v: number) => {
        let res = v;
        if (isUsd) {
          res = v * USD_TO_MILLION_VND;
        } else if (v >= 1_000_000) {
          res = v / 1_000_000;
        } else if (v >= 1_000 && hasK) {
          res = v / 1_000;
        }
        if (isAnnual) {
          res = res / 12.0;
        }
        return Number(res.toFixed(2));
      };

      const vals = nums.map(toMillionVnd);
      if (vals.length >= 2) {
        const low = Math.min(vals[0], vals[1]);
        let high = Math.max(vals[0], vals[1]);
        if (low === 0 && high > 0) {
          const lowBound = Number((high * 0.7).toFixed(2));
          salary_min_vnd = lowBound;
          salary_max_vnd = high;
          salary_mid_vnd = Number(((lowBound + high) / 2).toFixed(2));
          if (isUsd && !rawLower.includes("usd") && !rawLower.includes("$")) {
            salary_raw_text = `Up to ${Math.round(Math.max(...nums))} USD`;
          }
        } else {
          // Khử biên độ hoa hồng quá rộng (VD: 15 - 80 triệu hoặc 1500 - 5000 USD cho vị trí Junior/Sales)
          if (low > 0 && high / low > 2.4 && high >= 50) {
            high = Number(Math.min(high, low * 1.45).toFixed(2));
          }
          salary_min_vnd = low;
          salary_max_vnd = high;
          salary_mid_vnd = Number(((low + high) / 2).toFixed(2));
        }
      } else {
        const single = vals[0];
        if (
          ["tới", "đến", "up to", "upto", "dưới", "tối đa", "max"].some((k) =>
            rawLower.includes(k)
          )
        ) {
          const low = Number((single * 0.7).toFixed(2));
          salary_min_vnd = low;
          salary_max_vnd = single;
          salary_mid_vnd = Number(((low + single) / 2).toFixed(2));
        } else if (
          ["từ", "trên", "from", "over", "tối thiểu", "min", "ít nhất"].some(
            (k) => rawLower.includes(k)
          )
        ) {
          const high = Number((single * 1.3).toFixed(2));
          salary_min_vnd = single;
          salary_max_vnd = high;
          salary_mid_vnd = Number(((single + high) / 2).toFixed(2));
        } else {
          salary_min_vnd = single;
          salary_max_vnd = single;
          salary_mid_vnd = single;
        }
      }

      // Nếu vị trí kỹ thuật/chuyên môn không có từ khóa thực tập/fresher/junior nhưng bị mặc định T2_FRESHER/T3_JUNIOR
      // trong khi mức lương thực tế đạt ngưỡng Senior (28 - 60 triệu) -> đồng bộ lên T4_MIDDLE_SENIOR
      const hasExplicitEntryKw = [
        "intern",
        "thực tập",
        "fresher",
        "mới tốt nghiệp",
        "junior",
        "jr",
        "nhân viên",
        "cộng tác viên",
        "trợ lý",
        "thư ký",
      ].some((kw) => titleLower.includes(kw));

      if (
        !hasExplicitEntryKw &&
        (career_tier === "T2_FRESHER" || career_tier === "T3_JUNIOR") &&
        salary_mid_vnd != null &&
        salary_mid_vnd >= 28 &&
        salary_mid_vnd <= 60
      ) {
        career_tier = "T4_MIDDLE_SENIOR";
        exp_years_mid = Math.max(exp_years_mid, 3.0);
      }

      // Kiểm định ngưỡng trần thực tế theo từng tầng Tháp nghề nghiệp (Loại bỏ lương ảo > 90tr hoặc lệch tầng)
      const tierCap = TIER_SALARY_CAPS[career_tier] || {
        maxMid: 75.0,
        maxHigh: 85.0,
      };
      if (
        salary_mid_vnd == null ||
        salary_mid_vnd < 1.5 ||
        (salary_min_vnd != null && salary_min_vnd < 1.0) ||
        salary_mid_vnd > tierCap.maxMid ||
        (salary_max_vnd != null && salary_max_vnd > tierCap.maxHigh)
      ) {
        salary_min_vnd = null;
        salary_max_vnd = null;
        salary_mid_vnd = null;
        salary_raw_text = "Thỏa thuận";
      }
    }
  }

  // Đồng bộ chuỗi hiển thị dedup_signature khi career_tier, canonical_role hoặc primary_city_code được hiệu chỉnh
  let syncedSig = rec.dedup_signature;
  const sigParts = syncedSig.split("__");
  if (sigParts.length === 6) {
    sigParts[1] = canonical_role;
    sigParts[2] = career_tier;
    sigParts[3] = rec.primary_city_code;
    sigParts[4] = rec.year_month;
    syncedSig = sigParts.join("__");
  }

  return {
    ...rec,
    dedup_signature: syncedSig,
    source_sites: canonSites,
    source_urls: cleanUrls.length > 0 ? cleanUrls : rec.source_urls,
    sector_pillar,
    canonical_role,
    career_tier,
    exp_years_mid,
    salary_raw_text,
    salary_min_vnd,
    salary_max_vnd,
    salary_mid_vnd,
    currency_original,
    search_city,
    primary_district_cluster,
  };
}

export async function GET(request: NextRequest) {
  const sessionUser = getSessionUserFromRequest(request);

  if (!sessionUser) {
    return NextResponse.json(
      { error: "Yêu cầu đăng nhập xác thực để xem dữ liệu bản ghi quét." },
      { status: 401 }
    );
  }

  if (sessionUser.role === "VIEWER") {
    return NextResponse.json(
      {
        error:
          "Tài khoản VIEWER chỉ được phép xem Mục 1 (Định giá BĐS Cấp Phường/Xã). Vui lòng liên hệ ADMIN để nâng quyền RESEARCHER / OPERATOR / ADMIN nhằm truy cập Kho Tin Rao (Mục 8).",
      },
      { status: 403 }
    );
  }

  const candidateBases = [
    process.env.INTERNAL_API_URL,
    "http://api:8000",
    "http://localhost:8000",
  ].filter(Boolean) as string[];

  let backendRecords: ScrapedJobRecord[] = [];
  let backendCrawlRuns = 0;
  let backendRawTotal = 0;
  let backendMasterTotal = 0;
  let backendLinksTotal = 0;
  let backendLastScrapedAt = "";
  const reprocessBronze =
    request.nextUrl.searchParams.get("reprocess_bronze") === "true";

  for (const base of candidateBases) {
    try {
      const res = await fetch(
        `${base.replace(/\/+$/, "")}/api/v1/jobs/scraped-analytics?limit=10000&reprocess_bronze=${reprocessBronze}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.records) && data.records.length > 0) {
          backendRecords = data.records.map((r: Record<string, unknown>) => ({
            job_id: String(r.job_id || r.dedup_signature || ""),
            dedup_signature: String(r.dedup_signature || ""),
            company_name_raw: String(r.company_name_raw || "Doanh nghiệp Số"),
            job_title_raw: String(r.job_title_raw || ""),
            sector_pillar: String(r.sector_pillar || "DE-01"),
            canonical_role: String(r.canonical_role || "ROLE_DATA_ANALYST"),
            career_tier: String(r.career_tier || "T3_JUNIOR"),
            exp_years_mid: Number(r.exp_years_mid ?? 2.0),
            salary_raw_text: String(r.salary_raw_text || "Thỏa thuận"),
            salary_min_vnd:
              r.salary_min_vnd != null ? Number(r.salary_min_vnd) : null,
            salary_max_vnd:
              r.salary_max_vnd != null ? Number(r.salary_max_vnd) : null,
            salary_mid_vnd:
              r.salary_mid_vnd != null ? Number(r.salary_mid_vnd) : null,
            currency_original: String(r.currency_original || "VND"),
            primary_macro_region: String(r.primary_macro_region || "NORTH"),
            primary_city_code: String(r.primary_city_code || "HN"),
            search_city: String(
              r.search_city || r.primary_city_code || "Hà Nội"
            ),
            primary_urban_tier: String(r.primary_urban_tier || "TIER_SPECIAL"),
            primary_district_cluster: String(
              r.primary_district_cluster || "TECH_HUB"
            ),
            work_mode: String(r.work_mode || "ONSITE"),
            published_date: String(r.published_date || "2026-10-25"),
            expired_date: String(r.expired_date || "2026-11-25"),
            year_month: String(r.year_month || "2026-10"),
            year_quarter: String(r.year_quarter || "2026-Q4"),
            first_seen_at: String(
              r.first_seen_at || "2026-10-25T01:00:00+07:00"
            ),
            last_seen_at: String(
              r.last_seen_at || "2026-10-30T11:12:00+07:00"
            ),
            vacancy_duration_days: Number(r.vacancy_duration_days || 30),
            description_clean: String(r.description_clean || ""),
            requirements_clean: String(r.requirements_clean || ""),
            benefits_clean: String(r.benefits_clean || ""),
            matched_skill_ids: Array.isArray(r.matched_skill_ids)
              ? (r.matched_skill_ids as string[])
              : [],
            raw_skill_tags: Array.isArray(r.raw_skill_tags)
              ? (r.raw_skill_tags as string[])
              : [],
            source_sites: Array.isArray(r.source_sites)
              ? (r.source_sites as string[])
              : r.source_site
              ? [String(r.source_site)]
              : ["topcv"],
            source_urls: Array.isArray(r.source_urls)
              ? (r.source_urls as string[])
              : r.source_url
              ? [String(r.source_url)]
              : [],
          }));
          backendCrawlRuns = Number(data?.summary?.total_crawl_runs || 0);
          backendRawTotal = Number(data?.summary?.total_raw_records || 0);
          backendMasterTotal = Number(data?.summary?.total_master_records || 0);
          backendLinksTotal = Number(data?.summary?.total_source_links || 0);
          backendLastScrapedAt = String(data?.summary?.last_scraped_at || "");
          break;
        }
      }
    } catch {
      // Continue to next candidate or fallback dataset
    }
  }

  // Khi kho PostgreSQL đã có dữ liệu cào thật, loại bỏ 100% các bản ghi mẫu giả lập (__bf001..__bf010, SCRAPED_JOBS_DATASET và 5 URL mock).
  const DEMO_SIG_SUFFIXES = [
    "__bf0",
    "__cc64cc61f7a5",
    "__ccb7ce2c119e",
    "__4a3737b09fe3",
    "__eefe14d9da4d",
    "__901ab23c",
    "__772cd34e",
    "__883de45f",
    "__994ef56a",
  ];
  const MOCK_TEST_URLS = new Set([
    "https://www.topcv.vn/viec-lam/junior-data-analyst/101.html",
    "https://itviec.com/it-jobs/jr-da-fpt-102",
    "https://itviec.com/it-jobs/sr-ai-momo-201",
    "https://careerviet.vn/vi/tim-viec-lam/sr-ba-tcb.35A999.html",
    "https://www.vietnamworks.com/ecom-perf-40199-jd",
  ]);

  const isRecruitmentRecord = (item: ScrapedJobRecord): boolean => {
    const urls = item.source_urls || [];
    if (
      urls.some(
        (u) =>
          u.includes("topcv.vn/viec-lam") ||
          u.includes("topcv.vn/tim-viec-lam") ||
          u.includes("itviec.com/it-jobs") ||
          u.includes("careerviet.vn/") ||
          u.includes("vietnamworks.com/")
      )
    ) {
      return true;
    }
    return /(tuyển dụng|tuyển gấp|nhân viên kinh doanh|chuyên viên tư vấn|chuyên viên kinh doanh|trưởng phòng kinh doanh|data engineer|data analyst|software engineer|backend developer|frontend developer|business analyst)/i.test(
      item.job_title_raw || ""
    );
  };

  const mergedMap = new Map<string, ScrapedJobRecord>();
  const realBackendRecords = backendRecords.filter(
    (item) =>
      !DEMO_SIG_SUFFIXES.some((sfx) => item.dedup_signature.includes(sfx)) &&
      !item.description_clean.startsWith("[Bản ghi Hồi cứu Lịch sử - Backfill ") &&
      !item.source_urls.some((u) => MOCK_TEST_URLS.has(u)) &&
      !isRecruitmentRecord(item)
  );

  for (const item of realBackendRecords) {
    mergedMap.set(item.dedup_signature, item);
  }

  let candidateRecords = Array.from(mergedMap.values());

  // Nếu kho dữ liệu vừa dọn sạch tin tuyển dụng việc làm cũ và trình cào đang chạy vòng đầu tiên,
  // tự động lấy trực tiếp luồng tin rao mua bán BĐS thời gian thực từ Chợ Tốt Nhà (gateway.chotot.com/v1/public/ad-listing?cg=1000&st=s,k)
  if (candidateRecords.length === 0) {
    const chototRegions = [
      { region_v2: "12000", cityCode: "HN" as const, macroRegion: "NORTH" as const, cityName: "Hà Nội" },
      { region_v2: "13000", cityCode: "HCM" as const, macroRegion: "SOUTH" as const, cityName: "TP. Hồ Chí Minh" },
      { region_v2: "3017", cityCode: "DN" as const, macroRegion: "CENTRAL" as const, cityName: "Đà Nẵng" },
    ];
    for (const reg of chototRegions) {
      try {
        const ctRes = await fetch(
          `https://gateway.chotot.com/v1/public/ad-listing?cg=1000&st=s,k&region_v2=${reg.region_v2}&limit=30`,
          { cache: "no-store" }
        );
        if (ctRes.ok) {
          const ctJson = await ctRes.json();
          const ads = Array.isArray(ctJson?.ads) ? ctJson.ads : [];
          for (const ad of ads) {
            const listId = String(ad?.list_id || "");
            const subject = String(ad?.subject || "").trim();
            if (!listId || !subject) continue;
            const areaM2 = Number(ad?.size || 65);
            const unitM2 = Number(ad?.price_million_per_m2 || 0) > 0
              ? Number(Number(ad.price_million_per_m2).toFixed(2))
              : Number(ad?.price || 0) > 0 && areaM2 > 0
              ? Number((Number(ad.price) / 1_000_000 / areaM2).toFixed(2))
              : null;
            const priceStr = String(ad?.price_string || "Thỏa thuận").trim();
            const salDisplay =
              unitM2 && unitM2 > 0
                ? `${priceStr} (~${unitM2} triệu/m² • ${areaM2}m²)`
                : `${priceStr} - ${areaM2}m²`;
            const catId = Number(ad?.category || 1020);
            const pillar =
              catId === 1010
                ? "DE-01"
                : catId === 1030
                ? "DE-03"
                : catId === 1040
                ? "DE-04"
                : "DE-02";
            const role =
              catId === 1010
                ? "ROLE_DATA_ANALYST"
                : catId === 1030
                ? "ROLE_IT_BA"
                : catId === 1040
                ? "ROLE_GROWTH_MARKETING"
                : "ROLE_DATA_ENGINEER";
            const tier =
              unitM2 == null
                ? "T3_JUNIOR"
                : unitM2 < 35
                ? "T1_INTERN"
                : unitM2 < 55
                ? "T2_FRESHER"
                : unitM2 < 85
                ? "T3_JUNIOR"
                : unitM2 < 140
                ? "T4_MIDDLE_SENIOR"
                : unitM2 < 220
                ? "T5_LEAD_MANAGER"
                : "T6_DIRECTOR";
            const listTimeMs = Number(ad?.list_time || Date.now());
            const pubDate = new Date(listTimeMs > 1e11 ? listTimeMs : Date.now())
              .toISOString()
              .slice(0, 10);
            const expDate = new Date(
              (listTimeMs > 1e11 ? listTimeMs : Date.now()) + 30 * 86400000
            )
              .toISOString()
              .slice(0, 10);
            const wardName = String(ad?.ward_name || "").trim();
            const areaName = String(ad?.area_name || "").trim();
            const regionName = String(ad?.region_name || reg.cityName).trim();
            const streetName = String(ad?.street_name || "").trim();
            const locDisplay = [streetName, wardName, areaName, regionName]
              .filter(Boolean)
              .join(", ");
            const detailUrl = `https://nha.chotot.com/mua-ban-bat-dong-san/${listId}.htm`;

            candidateRecords.push({
              job_id: `ct-${listId}`,
              dedup_signature: `${reg.cityCode}__${role}__${tier}__ct_${listId}`,
              company_name_raw: String(ad?.account_name || "Chính chủ / Sàn BĐS Chợ Tốt Nhà"),
              job_title_raw: subject,
              sector_pillar: pillar,
              canonical_role: role,
              career_tier: tier,
              exp_years_mid: areaM2,
              salary_raw_text: salDisplay,
              salary_min_vnd: unitM2 ? Number((unitM2 * 0.94).toFixed(2)) : null,
              salary_max_vnd: unitM2 ? Number((unitM2 * 1.06).toFixed(2)) : null,
              salary_mid_vnd: unitM2,
              currency_original: "VND",
              primary_macro_region: reg.macroRegion,
              primary_city_code: reg.cityCode,
              primary_urban_tier: reg.cityCode === "DN" ? "REGIONAL_HUB" : "SPECIAL_METROPOLIS",
              primary_district_cluster: locDisplay || regionName,
              work_mode: "ONSITE",
              search_city: locDisplay || regionName,
              published_date: pubDate,
              expired_date: expDate,
              year_month: pubDate.slice(0, 7),
              year_quarter: "2026-Q4",
              first_seen_at: new Date().toISOString(),
              last_seen_at: new Date().toISOString(),
              vacancy_duration_days: 15,
              description_clean: String(ad?.body || subject),
              requirements_clean: `Diện tích: ${areaM2} m² | Số phòng ngủ: ${ad?.rooms || "N/A"} | Vị trí: ${locDisplay}`,
              benefits_clean: "Sổ hồng / Sổ đỏ pháp lý minh bạch",
              matched_skill_ids: ["SK_EXCEL", "SK_SQL"],
              raw_skill_tags: [ `${areaM2} m²`, wardName, areaName ].filter(Boolean),
              source_sites: ["chotot"],
              source_urls: [detailUrl],
            });
          }
        }
      } catch {
        // Ignore network errors on Chotot gateway fallback
      }
    }
  }

  const sanitizedList = candidateRecords
    .map(sanitizeScrapedRecord)
    .sort((a, b) => b.published_date.localeCompare(a.published_date));

  // Khử trùng lặp triệt để theo Canonical URL và cặp (Doanh nghiệp, Chức danh, Thành phố)
  // (Tránh hiện tượng nhân đôi bản ghi do khóa dedup_signature lịch sử trước và sau khi thêm core_title_slug)
  const urlToRecord = new Map<string, ScrapedJobRecord>();
  const keyToRecord = new Map<string, ScrapedJobRecord>();
  const allRecords: ScrapedJobRecord[] = [];

  for (const rec of sanitizedList) {
    const cleanUrls = rec.source_urls.map(cleanSourceUrl).filter(Boolean);
    const compKey = rec.company_name_raw.trim().toLowerCase();
    const titleKey = rec.job_title_raw.trim().toLowerCase();
    const compositeKey = `${compKey}||${titleKey}||${rec.primary_city_code}`;

    let existing = keyToRecord.get(compositeKey);
    if (!existing) {
      for (const u of cleanUrls) {
        const hit = urlToRecord.get(u);
        if (hit) {
          existing = hit;
          break;
        }
      }
    }

    if (existing) {
      for (const u of cleanUrls) {
        if (!existing.source_urls.includes(u)) {
          existing.source_urls.push(u);
        }
      }
      for (const s of rec.source_sites) {
        if (!existing.source_sites.includes(s)) {
          existing.source_sites.push(s);
        }
      }
      if (existing.salary_mid_vnd == null && rec.salary_mid_vnd != null) {
        existing.salary_raw_text = rec.salary_raw_text;
        existing.salary_min_vnd = rec.salary_min_vnd;
        existing.salary_max_vnd = rec.salary_max_vnd;
        existing.salary_mid_vnd = rec.salary_mid_vnd;
        existing.currency_original = rec.currency_original;
      }
    } else {
      allRecords.push(rec);
      keyToRecord.set(compositeKey, rec);
      for (const u of cleanUrls) {
        urlToRecord.set(u, rec);
      }
    }
  }

  const analytics = computeScrapedRecordsAnalytics(allRecords);

  if (backendCrawlRuns > 0) {
    analytics.summary.total_crawl_runs = Math.max(
      analytics.summary.total_crawl_runs,
      backendCrawlRuns
    );
  }
  if (backendRawTotal > analytics.summary.total_raw_records) {
    analytics.summary.total_raw_records = backendRawTotal;
  }
  if (backendLinksTotal > analytics.summary.total_source_links) {
    analytics.summary.total_source_links = backendLinksTotal;
  }
  if (
    backendLastScrapedAt &&
    backendLastScrapedAt > analytics.summary.last_scraped_at
  ) {
    analytics.summary.last_scraped_at = backendLastScrapedAt;
  }

  return NextResponse.json({
    ...analytics,
    records: allRecords,
  });
}
