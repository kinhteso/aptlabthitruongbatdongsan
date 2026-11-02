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
  T1_INTERN: { maxMid: 8.0, maxHigh: 10.0 },
  T2_FRESHER: { maxMid: 18.0, maxHigh: 22.0 },
  T3_JUNIOR: { maxMid: 30.0, maxHigh: 36.0 },
  T4_MIDDLE_SENIOR: { maxMid: 60.0, maxHigh: 72.0 },
  T5_LEAD_MANAGER: { maxMid: 75.0, maxHigh: 85.0 },
  T6_DIRECTOR: { maxMid: 82.0, maxHigh: 90.0 },
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

function sanitizeScrapedRecord(rec: ScrapedJobRecord): ScrapedJobRecord {
  const titleLower = rec.job_title_raw.toLowerCase();
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
  } = rec;

  const cleanUrls = Array.from(
    new Set((rec.source_urls || []).map(cleanSourceUrl).filter(Boolean))
  );

  // 1. Sửa phân loại chức danh Thực tập sinh không dấu ("Thuc tap sinh") hoặc Trợ lý / Thư ký bị nhầm sang T6_DIRECTOR / T5_LEAD_MANAGER
  if (
    career_tier !== "T1_INTERN" &&
    ["thực tập", "thuc tap", "intern", "internship"].some((kw) =>
      titleLower.includes(kw)
    )
  ) {
    career_tier = "T1_INTERN";
    exp_years_mid = Math.min(exp_years_mid, 0.5);
  } else if (
    (career_tier === "T6_DIRECTOR" || career_tier === "T5_LEAD_MANAGER") &&
    ["trợ lý", "thư ký", "assistant", "secretary", "pa to ", "ea to "].some(
      (kw) => titleLower.includes(kw)
    )
  ) {
    career_tier = exp_years_mid > 2.5 ? "T4_MIDDLE_SENIOR" : "T3_JUNIOR";
  }

  // 2. Sửa UNCLASSIFIED cho các chức danh phổ biến (Solution Architect, Business Development, Sales Supervisor)
  if (canonical_role === "UNCLASSIFIED") {
    if (
      [
        "solution architect",
        "solutions architect",
        "system architect",
        "software architect",
        "cloud architect",
        "kiến trúc sư giải pháp",
      ].some((kw) => titleLower.includes(kw))
    ) {
      sector_pillar = "DE-01";
      canonical_role = "ROLE_SOFTWARE_CLOUD";
    } else if (
      [
        "business development",
        "phát triển kinh doanh",
        "sales supervisor",
        "giám sát kinh doanh",
        "giám sát bán hàng",
        "giám sát tiếp thị",
      ].some((kw) => titleLower.includes(kw))
    ) {
      sector_pillar = "DE-02";
      canonical_role = "ROLE_DIGITAL_GROWTH_BD";
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

  if (
    !hasDigits ||
    (negotiableKeywords.some((k) => rawLower.includes(k)) && !hasDigits)
  ) {
    salary_min_vnd = null;
    salary_max_vnd = null;
    salary_mid_vnd = null;
    currency_original = "VND";
  } else {
    const cleanNumStr = rawLower
      .replace(/(\d),(\d{3})\b/g, "$1$2")
      .replace(/,/g, ".");
    const nums = (cleanNumStr.match(/\d+(?:\.\d+)?/g) || []).map(Number);

    if (nums.length === 0) {
      salary_min_vnd = null;
      salary_max_vnd = null;
      salary_mid_vnd = null;
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

  const mergedMap = new Map<string, ScrapedJobRecord>();
  const realBackendRecords = backendRecords.filter(
    (item) =>
      !DEMO_SIG_SUFFIXES.some((sfx) => item.dedup_signature.includes(sfx)) &&
      !item.description_clean.startsWith("[Bản ghi Hồi cứu Lịch sử - Backfill ") &&
      !item.source_urls.some((u) => MOCK_TEST_URLS.has(u))
  );

  for (const item of realBackendRecords) {
    mergedMap.set(item.dedup_signature, item);
  }

  let candidateRecords = Array.from(mergedMap.values());

  // Chỉ gọi API VietnamWorks để hồi phục các bản ghi vỏ SPA rỗng ("Tuyển ...") khi người dùng nhấn Đồng bộ (reprocessBronze)
  const vnwIdsToHeal = new Set<string>();
  if (reprocessBronze) {
    for (const rec of candidateRecords) {
      const desc = (rec.description_clean || "").trim();
      if (desc.startsWith("Tuyển ") || desc.length < 80) {
        for (const u of rec.source_urls) {
          const m = u.match(/-(\d+)-j[dv]\b/i);
          if (m?.[1]) {
            vnwIdsToHeal.add(m[1]);
          }
        }
      }
    }
  }

  if (vnwIdsToHeal.size > 0) {
    const allIds = Array.from(vnwIdsToHeal).slice(0, 80);
    const vnwHitsMap = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < allIds.length; i += 40) {
      const batch = allIds.slice(i, i + 40);
      try {
        const vnwRes = await fetch(
          "https://ms.vietnamworks.com/job-search/v1.0/search",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: 0,
              query: "",
              filter: [{ field: "jobId", value: batch.join(",") }],
              ranges: [],
              order: [],
              hitsPerPage: 40,
              page: 0,
            }),
            cache: "no-store",
          }
        );
        if (vnwRes.ok) {
          const vnwJson = await vnwRes.json();
          const hits = Array.isArray(vnwJson?.data) ? vnwJson.data : [];
          for (const h of hits) {
            if (h?.jobId) {
              vnwHitsMap.set(String(h.jobId), h as Record<string, unknown>);
            }
          }
        }
      } catch {
        // Ignore network errors on VietnamWorks API fallback
      }
    }

    if (vnwHitsMap.size > 0) {
      const stripHtml = (s: string) =>
        s
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      candidateRecords = candidateRecords.map((rec) => {
        let matchedHit: Record<string, unknown> | undefined;
        for (const u of rec.source_urls) {
          const m = u.match(/-(\d+)-j[dv]\b/i);
          if (m?.[1] && vnwHitsMap.has(m[1])) {
            matchedHit = vnwHitsMap.get(m[1]);
            break;
          }
        }
        if (!matchedHit) return rec;

        const pubIso = String(
          matchedHit.approvedOn ||
            matchedHit.onlineOn ||
            matchedHit.createdOn ||
            rec.published_date
        ).slice(0, 10);
        const expIso = String(
          matchedHit.expiredOn || rec.expired_date
        ).slice(0, 10);
        const ym = pubIso.slice(0, 7);
        const monthNum = Number(pubIso.slice(5, 7) || 10);
        const yq = `${pubIso.slice(0, 4)}-Q${Math.floor((monthNum - 1) / 3) + 1}`;
        const vacDays =
          pubIso && expIso && expIso >= pubIso
            ? Math.max(
                1,
                Math.round(
                  (new Date(expIso).getTime() - new Date(pubIso).getTime()) /
                    86400000
                )
              )
            : rec.vacancy_duration_days;

        const prettySal = String(matchedHit.prettySalary || "").trim();
        const yrsExp =
          matchedHit.yearsOfExperience != null
            ? Number(matchedHit.yearsOfExperience)
            : rec.exp_years_mid;
        const rawDesc = stripHtml(String(matchedHit.jobDescription || ""));
        const rawReq = stripHtml(String(matchedHit.jobRequirement || ""));

        let cityCode = rec.primary_city_code;
        let macroRegion = rec.primary_macro_region;
        let searchCity = rec.search_city;
        const wLocs = Array.isArray(matchedHit.workingLocations)
          ? (matchedHit.workingLocations as Array<Record<string, unknown>>)
          : [];
        const locStr = wLocs
          .map((w) => `${w.cityNameVI || ""} ${w.cityName || ""} ${w.address || ""}`)
          .join(" ")
          .toLowerCase();
        if (locStr.includes("hồ chí minh") || locStr.includes("ho chi minh")) {
          cityCode = "HCM";
          macroRegion = "SOUTH";
          searchCity = "TP. Hồ Chí Minh";
        } else if (locStr.includes("hà nội") || locStr.includes("ha noi")) {
          cityCode = "HN";
          macroRegion = "NORTH";
          searchCity = "Hà Nội";
        } else if (locStr.includes("đà nẵng") || locStr.includes("da nang")) {
          cityCode = "DN";
          macroRegion = "CENTRAL";
          searchCity = "Đà Nẵng";
        }

        return {
          ...rec,
          published_date: pubIso || rec.published_date,
          expired_date: expIso || rec.expired_date,
          year_month: ym || rec.year_month,
          year_quarter: yq || rec.year_quarter,
          vacancy_duration_days: vacDays,
          salary_raw_text: prettySal || rec.salary_raw_text,
          exp_years_mid: yrsExp,
          primary_city_code: cityCode,
          primary_macro_region: macroRegion,
          search_city: searchCity,
          description_clean: rawDesc || rec.description_clean,
          requirements_clean: rawReq || rec.requirements_clean,
        };
      });
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
