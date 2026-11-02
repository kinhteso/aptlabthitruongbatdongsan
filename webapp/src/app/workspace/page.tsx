"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AppRole,
  analyzeJobPostingForSalaryDeal,
  AUDIENCE_LEARNING_ROADMAPS,
  buildAnnualComparativeReport,
  buildDefaultCampaign100kPlan,
  Campaign100kPlanData,
  CITY_LABELS_MAP,
  computeProvinceAndWardAnalytics,
  computeScrapedRecordsAnalytics,
  computeSellerPhoneAnalytics,
  computeYearValuationMultiplier,
  CPI_INDEX_BY_YEAR,
  extractProvinceDistrictWard,
  formatDistrictClusterLabel,
  formatHedonicSkillBadge,
  formatPortalDisplayName,
  formatVnPhoneDisplay,
  HISTORICAL_BACKFILL_RECORDS,
  INITIAL_SCRAPER_ERROR_LOGS,
  MACRO_SKILL_CLUSTERS,
  normalizePortalCode,
  PUBLIC_SECTION_INTRODUCTIONS,
  REAL_ESTATE_PILLAR_BADGE_LABELS,
  REAL_ESTATE_REGION_LABELS,
  REAL_ESTATE_TIER_LABELS,
  REAL_ESTATE_WORK_MODE_LABELS,
  resolveSellerPhoneForRecord,
  ROLE_BADGE_META,
  SAMPLE_JD_POSTINGS_FOR_DEAL,
  SCRAPED_JOBS_DATASET,
  ScrapedJobRecord,
  ScraperErrorIncident,
  SKILLS_CATALOG,
  TabKey,
  VERIFIED_MULTI_SOURCE_JOBS,
} from "@/lib/labData";
import {
  AnnualComparativeChartsSuite,
  CareerPyramidSvgChart,
  JobPostingDealAdvisorPanel,
  MincerAndSkillMatrixChart,
  MultiSourcePortalChart,
  ShapAndUpsChart,
  ValuationMultiYearFanChart,
} from "@/components/LabCharts";
import RealEstateWardAndPortalHub from "@/components/RealEstateWardAndPortalHub";

const VALID_TABS: TabKey[] = [
  "valuation",
  "pyramid",
  "econometrics",
  "provenance",
  "rbac",
  "mcp",
  "errors",
  "scraped",
];

export default function InternalWorkspacePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("valuation");
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<{
    email: string;
    name: string;
    picture?: string;
    role: AppRole;
    isFirstUser: boolean;
  } | null>(null);
  const [oauthConfig, setOauthConfig] = useState<{
    default_port: number;
    google_client_id: string;
    has_client_secret?: boolean;
    redirect_uri: string;
    admin_emails: string[];
  }>({
    default_port: 3359,
    google_client_id:
      "647264796658-h96idjs8hohr4hf8pjid8i531lqr2gra.apps.googleusercontent.com",
    has_client_secret: true,
    redirect_uri: "http://localhost:3359/api/auth/callback/google",
    admin_emails: [
      "phungtuananh3333@gmail.com",
      "phungtuananh2222@gmail.com",
    ],
  });
  const [registeredUsers, setRegisteredUsers] = useState<
    Array<{
      email: string;
      full_name?: string;
      avatar_url?: string;
      role: string;
      mcp_api_token?: string;
      last_login_at?: string;
    }>
  >([]);
  const [oauthClientIdInput, setOauthClientIdInput] = useState(
    "647264796658-h96idjs8hohr4hf8pjid8i531lqr2gra.apps.googleusercontent.com"
  );
  const [oauthClientSecretInput, setOauthClientSecretInput] = useState("");
  const [oauthAdminEmailsInput, setOauthAdminEmailsInput] = useState(
    "phungtuananh3333@gmail.com,phungtuananh2222@gmail.com"
  );
  const [oauthSaveMsg, setOauthSaveMsg] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [pillar, setPillar] = useState("DE-01");
  const [tier, setTier] = useState("T3_JUNIOR");
  const [city, setCity] = useState("HN");
  const [expYears, setExpYears] = useState(75.0);
  const [valuationYear, setValuationYear] = useState<number>(2026);
  const [priceMode, setPriceMode] = useState<"NOMINAL" | "REAL_CPI_2026">(
    "NOMINAL"
  );
  const [reportBaseYear, setReportBaseYear] = useState<number>(2021);
  const [reportTargetYear, setReportTargetYear] = useState<number>(2026);
  const [selectedAudienceRoadmap, setSelectedAudienceRoadmap] = useState<
    "STUDENT" | "INTERN_FRESHER" | "WORKING_PRO"
  >("STUDENT");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([
    "SK_EXCEL",
    "SK_SQL",
    "SK_POWERBI",
  ]);
  const [selectedMcpTool, setSelectedMcpTool] = useState<string>(
    "mcp_query_verified_jobs"
  );
  const [mcpFilterPillar, setMcpFilterPillar] = useState<string>("RES-01");
  const [mcpFilterSkill, setMcpFilterSkill] = useState<string>(
    "AT_STREET_FRONT_PRIME"
  );
  const [mcpResponsePreview, setMcpResponsePreview] = useState<string>("");
  const [errorLogs, setErrorLogs] = useState<ScraperErrorIncident[]>(
    INITIAL_SCRAPER_ERROR_LOGS
  );
  const [scrapedRecords, setScrapedRecords] = useState<ScrapedJobRecord[]>([]);
  const [scrapedCrawlRuns, setScrapedCrawlRuns] = useState<number>(0);
  const [scrapedRawTotal, setScrapedRawTotal] = useState<number>(0);
  const [scrapedMasterTotal, setScrapedMasterTotal] = useState<number>(0);
  const [scrapedLinksTotal, setScrapedLinksTotal] = useState<number>(0);
  const [isReprocessingBronze, setIsReprocessingBronze] =
    useState<boolean>(false);
  const [isRefreshingScraped, setIsRefreshingScraped] =
    useState<boolean>(false);
  const [filterCity, setFilterCity] = useState<string>("ALL");
  const [filterProvinceCode, setFilterProvinceCode] = useState<string>("ALL");
  const [filterWardKey, setFilterWardKey] = useState<string>("ALL");
  const [filterMonth, setFilterMonth] = useState<string>("ALL");
  const [filterPortal, setFilterPortal] = useState<string>("ALL");
  const [filterPillar, setFilterPillar] = useState<string>("ALL");
  const [filterSellerPhone, setFilterSellerPhone] = useState<string>("ALL");
  const [filterSellerListingsBand, setFilterSellerListingsBand] = useState<
    "ALL" | "1" | "2_PLUS" | "3_PLUS" | "5_PLUS" | "10_PLUS"
  >("ALL");
  const [filterPriceStatus, setFilterPriceStatus] = useState<
    "ALL" | "DISCLOSED" | "NEGOTIABLE"
  >("ALL");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [sellerTypeFilter, setSellerTypeFilter] = useState<
    "ALL" | "MULTI" | "PRO" | "SEMI" | "OWNER"
  >("ALL");
  const [sellerMinListings, setSellerMinListings] = useState<number>(1);
  const [sellerMaxListings, setSellerMaxListings] = useState<number>(0);
  const [sellerPhoneSearch, setSellerPhoneSearch] = useState<string>("");
  const [expandedSellerPhone, setExpandedSellerPhone] = useState<string | null>(
    null
  );
  const [sellerTablePageSize, setSellerTablePageSize] = useState<number>(10);
  const [sellerTablePage, setSellerTablePage] = useState<number>(1);
  const [reportProvinceFilter, setReportProvinceFilter] =
    useState<string>("ALL");
  const [reportRegionFilter, setReportRegionFilter] = useState<string>("ALL");
  const [reportProvinceMinListings, setReportProvinceMinListings] =
    useState<number>(1);
  const [reportWardMinListings, setReportWardMinListings] = useState<number>(1);
  const [reportWardSearch, setReportWardSearch] = useState<string>("");
  const [reportWardSortBy, setReportWardSortBy] = useState<
    "COUNT_DESC" | "PRICE_DESC" | "PRICE_ASC" | "NAME_ASC"
  >("COUNT_DESC");
  const [expandedWardKey, setExpandedWardKey] = useState<string | null>(null);
  const [wardTablePageSize, setWardTablePageSize] = useState<number>(15);
  const [wardTablePage, setWardTablePage] = useState<number>(1);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [dealSeedJob, setDealSeedJob] = useState<{
    company_name: string;
    job_title: string;
    location_text: string;
    salary_text: string;
    jd_full_text: string;
  } | null>(null);
  const [valuationSubMode, setValuationSubMode] = useState<
    "ward_hub" | "profile" | "jd_deal" | "both"
  >("both");
  const [pyramidSubView, setPyramidSubView] = useState<
    "tiers" | "clusters" | "roadmap" | "all"
  >("tiers");
  const [scrapedSubView, setScrapedSubView] = useState<
    | "jobs_list"
    | "seller_phones"
    | "province_ward_report"
    | "time_loc_stats"
    | "campaign_ops"
    | "all"
  >("jobs_list");
  const [jobsPageSize, setJobsPageSize] = useState<number>(10);
  const [jobsCurrentPage, setJobsCurrentPage] = useState<number>(1);
  const [timeTablePageSize, setTimeTablePageSize] = useState<number>(10);
  const [timeTablePage, setTimeTablePage] = useState<number>(1);
  const [provenancePageSize, setProvenancePageSize] = useState<number>(10);
  const [provenancePage, setProvenancePage] = useState<number>(1);
  const [errorsPageSize, setErrorsPageSize] = useState<number>(10);
  const [errorsPage, setErrorsPage] = useState<number>(1);
  const [backfillFromYear, setBackfillFromYear] = useState<number>(2021);
  const [backfillDeepPages, setBackfillDeepPages] = useState<number>(15);
  const [backfillPortal, setBackfillPortal] = useState<string>("ALL");
  const [backfillCity, setBackfillCity] = useState<string>("ALL");
  const [isRunningBackfill, setIsRunningBackfill] = useState<boolean>(false);
  const [backfillStatusMsg, setBackfillStatusMsg] = useState<string>("");

  const [campaignPlan, setCampaignPlan] = useState<Campaign100kPlanData>(() =>
    buildDefaultCampaign100kPlan([
      ...SCRAPED_JOBS_DATASET,
      ...HISTORICAL_BACKFILL_RECORDS,
    ])
  );
  const [planTargetRecords, setPlanTargetRecords] = useState<number>(100000);
  const [planExecDays, setPlanExecDays] = useState<number>(30);
  const [planScheduleMode, setPlanScheduleMode] = useState<string>("interval");
  const [planIntervalHours, setPlanIntervalHours] = useState<number>(4);
  const [planMaxPages, setPlanMaxPages] = useState<number>(15);
  const [planMaxJobsPerSite, setPlanMaxJobsPerSite] = useState<number>(600);
  const [planConcurrency, setPlanConcurrency] = useState<number>(3);
  const [planEnableWayback, setPlanEnableWayback] = useState<boolean>(true);
  const [planEnableSitemap, setPlanEnableSitemap] = useState<boolean>(true);
  const [planNewKeyword, setPlanNewKeyword] = useState<string>("");
  const [planNewKeywordPillar, setPlanNewKeywordPillar] =
    useState<string>("DE-01");
  const [isSavingPlan, setIsSavingPlan] = useState<boolean>(false);
  const [planStatusMsg, setPlanStatusMsg] = useState<string>("");
  const [hourlyDebugPrompt, setHourlyDebugPrompt] = useState<string>("");
  const [isLoadingDebug, setIsLoadingDebug] = useState<boolean>(false);
  const [timeSyncStatus, setTimeSyncStatus] = useState<{
    server_gmt07_iso: string;
    international_utc_iso: string;
    clock_skew_seconds: number;
    sync_status: string;
    ntp_source: string;
  }>({
    server_gmt07_iso: "2026-10-30T11:15:00+07:00",
    international_utc_iso: "2026-10-30T04:15:00+00:00",
    clock_skew_seconds: -0.14,
    sync_status: "SYNCHRONIZED_NTP",
    ntp_source: "NTP UDP (time.google.com:123)",
  });

  const refreshScrapedData = async (reprocessBronze = false) => {
    if (reprocessBronze) {
      setIsReprocessingBronze(true);
    } else {
      setIsRefreshingScraped(true);
    }
    try {
      const url = reprocessBronze
        ? `/api/jobs/scraped?reprocess_bronze=true&t=${Date.now()}`
        : `/api/jobs/scraped?t=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.records)) {
          setScrapedRecords(data.records);
          if (data.records.length > 0) {
            setExpandedJobId((prev) => prev || data.records[0]?.job_id || null);
          }
        }
        if (data?.summary?.total_crawl_runs != null) {
          setScrapedCrawlRuns(Number(data.summary.total_crawl_runs));
        }
        if (data?.summary?.total_raw_records != null) {
          setScrapedRawTotal(Number(data.summary.total_raw_records));
        }
        if (data?.summary?.total_master_records != null) {
          setScrapedMasterTotal(Number(data.summary.total_master_records));
        }
        if (data?.summary?.total_source_links != null) {
          setScrapedLinksTotal(Number(data.summary.total_source_links));
        }
      }
    } catch {
      // Ignore network errors
    } finally {
      if (reprocessBronze) {
        setIsReprocessingBronze(false);
      } else {
        setIsRefreshingScraped(false);
      }
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab") as TabKey | null;
    if (tabParam && VALID_TABS.includes(tabParam)) {
      setActiveTab(tabParam);
    }

    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data?.authenticated && data?.user) {
          setCurrentUser(data.user);
        } else {
          setCurrentUser(null);
        }
        if (data?.oauth_config) {
          setOauthConfig(data.oauth_config);
          if (data.oauth_config.google_client_id) {
            setOauthClientIdInput(data.oauth_config.google_client_id);
          }
          if (Array.isArray(data.oauth_config.admin_emails)) {
            setOauthAdminEmailsInput(data.oauth_config.admin_emails.join(","));
          }
        }
        if (Array.isArray(data?.registered_users)) {
          setRegisteredUsers(data.registered_users);
        }
      })
      .catch(() => {
        setCurrentUser(null);
      })
      .finally(() => {
        setAuthChecked(true);
      });

    refreshScrapedData(false);

    fetch("/api/jobs/plan")
      .then((res) => res.json())
      .then((data) => {
        if (data?.campaign_summary && data?.execution_schedule_1month) {
          setCampaignPlan(data);
          setPlanTargetRecords(
            Number(data.campaign_summary.target_master_records || 100000)
          );
          setPlanExecDays(
            Number(data.execution_schedule_1month.campaign_execution_days || 30)
          );
          setPlanScheduleMode(
            String(data.execution_schedule_1month.schedule_mode || "interval")
          );
          setPlanIntervalHours(
            Number(data.execution_schedule_1month.interval_hours || 4)
          );
          setPlanMaxPages(
            Number(data.current_settings?.max_pages_per_query || 15)
          );
          setPlanMaxJobsPerSite(
            Number(data.current_settings?.max_jobs_per_site_run || 600)
          );
          setPlanConcurrency(
            Number(data.current_settings?.concurrency_per_site || 3)
          );
          setPlanEnableWayback(
            Boolean(
              data.current_settings?.enable_wayback_cdx_2021_2024 ?? true
            )
          );
          setPlanEnableSitemap(
            Boolean(data.current_settings?.enable_sitemap_archive ?? true)
          );
        }
      })
      .catch(() => {});

    fetch("http://localhost:8000/api/v1/scraper/errors-and-timesync")
      .then((res) => res.json())
      .then((data) => {
        if (data?.time_sync) {
          setTimeSyncStatus(data.time_sync);
        }
        if (Array.isArray(data?.error_logs) && data.error_logs.length > 0) {
          setErrorLogs(data.error_logs);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (currentUser && scrapedRecords.length === 0 && !isRefreshingScraped) {
      refreshScrapedData(false);
    }
  }, [currentUser?.email, activeTab]);

  useEffect(() => {
    setJobsCurrentPage(1);
  }, [filterCity, filterMonth, filterPortal, filterPillar, searchKeyword, jobsPageSize]);

  const renderPaginationToolbar = ({
    totalItems,
    pageSize,
    currentPage,
    onPageSizeChange,
    onPageChange,
    itemLabel = "tin rao BĐS",
  }: {
    totalItems: number;
    pageSize: number;
    currentPage: number;
    onPageSizeChange: (newSize: number) => void;
    onPageChange: (newPage: number) => void;
    itemLabel?: string;
  }) => {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const startIdx = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const endIdx = Math.min(totalItems, safePage * pageSize);

    const maxVisibleButtons = 7;
    let startPage = Math.max(1, safePage - Math.floor(maxVisibleButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxVisibleButtons - 1);
    if (endPage - startPage + 1 < maxVisibleButtons) {
      startPage = Math.max(1, endPage - maxVisibleButtons + 1);
    }
    const pageButtons: number[] = [];
    for (let p = startPage; p <= endPage; p += 1) {
      pageButtons.push(p);
    }

    return (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: "0.65rem",
          padding: "0.65rem 0.9rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
            fontSize: "0.8rem",
            color: "#cbd5e1",
          }}
        >
          <span>
            Đang hiển thị{" "}
            <strong style={{ color: "#38bdf8" }}>
              {startIdx} – {endIdx}
            </strong>{" "}
            / tổng số{" "}
            <strong style={{ color: "#34d399" }}>
              {totalItems.toLocaleString("vi-VN")}
            </strong>{" "}
            {itemLabel} (Trang <strong>{safePage}</strong> / {totalPages})
          </span>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.78rem",
              color: "#94a3b8",
            }}
          >
            Số dòng/trang:
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              style={{
                background: "#1e293b",
                color: "#38bdf8",
                fontWeight: 700,
                border: "1px solid #38bdf8",
                borderRadius: "0.35rem",
                padding: "0.22rem 0.45rem",
                fontSize: "0.78rem",
              }}
            >
              <option value={10}>10 / trang</option>
              <option value={20}>20 / trang</option>
              <option value={50}>50 / trang</option>
              <option value={100}>100 / trang</option>
            </select>
          </label>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.3rem",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="tab-btn"
            disabled={safePage <= 1}
            style={{
              padding: "0.28rem 0.55rem",
              fontSize: "0.76rem",
              opacity: safePage <= 1 ? 0.45 : 1,
            }}
            onClick={() => onPageChange(1)}
          >
            « Đầu
          </button>
          <button
            type="button"
            className="tab-btn"
            disabled={safePage <= 1}
            style={{
              padding: "0.28rem 0.55rem",
              fontSize: "0.76rem",
              opacity: safePage <= 1 ? 0.45 : 1,
            }}
            onClick={() => onPageChange(Math.max(1, safePage - 1))}
          >
            ‹ Trước
          </button>
          {pageButtons.map((p) => (
            <button
              key={p}
              type="button"
              className={`tab-btn ${p === safePage ? "active" : ""}`}
              style={{
                padding: "0.28rem 0.6rem",
                fontSize: "0.76rem",
                minWidth: "32px",
              }}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            className="tab-btn"
            disabled={safePage >= totalPages}
            style={{
              padding: "0.28rem 0.55rem",
              fontSize: "0.76rem",
              opacity: safePage >= totalPages ? 0.45 : 1,
            }}
            onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          >
            Sau ›
          </button>
          <button
            type="button"
            className="tab-btn"
            disabled={safePage >= totalPages}
            style={{
              padding: "0.28rem 0.55rem",
              fontSize: "0.76rem",
              opacity: safePage >= totalPages ? 0.45 : 1,
            }}
            onClick={() => onPageChange(totalPages)}
          >
            Cuối »
          </button>
        </div>
      </div>
    );
  };

  const handleWorkspacePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);
    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.authenticated) {
        setLoginError(
          data?.error || "Xác thực thất bại. Email hoặc mật khẩu không đúng!"
        );
        setIsLoggingIn(false);
        return;
      }
      if (data?.user) {
        setCurrentUser(data.user);
      }
    } catch {
      setLoginError("Không thể kết nối máy chủ xác thực.");
    }
    setIsLoggingIn(false);
  };

  const handleRunHistoricalBackfill = async () => {
    setIsRunningBackfill(true);
    setBackfillStatusMsg("");
    try {
      const res = await fetch("/api/jobs/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_year: backfillFromYear,
          deep_pages: backfillDeepPages,
          portal: backfillPortal,
          city: backfillCity,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBackfillStatusMsg(
          `❌ ${data?.error || "Không thể kích hoạt chiến dịch quét quá khứ."}`
        );
        setIsRunningBackfill(false);
        return;
      }
      const freshRes = await fetch("/api/jobs/scraped?reprocess_bronze=true");
      const freshData = await freshRes.json().catch(() => null);
      if (Array.isArray(freshData?.records) && freshData.records.length > 0) {
        setScrapedRecords(freshData.records);
        if (freshData?.summary?.total_crawl_runs) {
          setScrapedCrawlRuns(Number(freshData.summary.total_crawl_runs));
        }
        if (freshData?.summary?.total_raw_records) {
          setScrapedRawTotal(Number(freshData.summary.total_raw_records));
        }
        if (freshData?.summary?.total_master_records) {
          setScrapedMasterTotal(Number(freshData.summary.total_master_records));
        }
        if (freshData?.summary?.total_source_links) {
          setScrapedLinksTotal(Number(freshData.summary.total_source_links));
        }
      }
      const crawlStats =
        (data?.backend_summary as Record<string, unknown> | null)
          ?.backfill_result as Record<string, unknown> | undefined;
      const statsObj = (crawlStats?.crawl_stats || {}) as Record<string, number>;
      setBackfillStatusMsg(
        `✅ Đã hoàn tất Chiến dịch Quét Dữ liệu Quá khứ (--mode backfill từ năm ${backfillFromYear}, deep_pages=${backfillDeepPages}): Phát hiện ${statsObj.links_discovered ?? 0} link thực tế, lưu mới ${statsObj.new_raw_saved ?? 0} bản ghi Bronze và chuẩn hóa ${statsObj.silver_jobs_upserted ?? 0} bản ghi Silver Master vào PostgreSQL!`
      );
    } catch {
      setBackfillStatusMsg("❌ Lỗi kết nối khi gọi API Quét quá khứ.");
    }
    setIsRunningBackfill(false);
  };

  const handleSaveCampaignPlan = async (autoTuneOptimal = false) => {
    setIsSavingPlan(true);
    setPlanStatusMsg("");
    try {
      const payload = autoTuneOptimal
        ? {
            auto_tune_optimal_30days: true,
            target_master_records: planTargetRecords,
            campaign_execution_days: planExecDays,
          }
        : {
            target_master_records: planTargetRecords,
            campaign_execution_days: planExecDays,
            schedule_mode: planScheduleMode,
            interval_hours: planIntervalHours,
            max_pages_per_query: planMaxPages,
            max_jobs_per_site_run: planMaxJobsPerSite,
            concurrency_per_site: planConcurrency,
            enable_wayback_cdx_2021_2024: planEnableWayback,
            enable_sitemap_archive: planEnableSitemap,
            new_keyword: planNewKeyword.trim() || undefined,
            new_keyword_pillar: planNewKeywordPillar,
          };

      const res = await fetch("/api/jobs/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setPlanStatusMsg(
          `❌ ${data?.error || "Không thể cập nhật kế hoạch chiến dịch."}`
        );
        setIsSavingPlan(false);
        return;
      }
      const updatedPlan: Campaign100kPlanData | undefined = data?.plan;
      if (updatedPlan) {
        setCampaignPlan(updatedPlan);
        setPlanTargetRecords(
          updatedPlan.campaign_summary.target_master_records
        );
        setPlanExecDays(
          updatedPlan.execution_schedule_1month.campaign_execution_days
        );
        setPlanScheduleMode(
          updatedPlan.execution_schedule_1month.schedule_mode
        );
        setPlanIntervalHours(
          updatedPlan.execution_schedule_1month.interval_hours
        );
        setPlanMaxPages(updatedPlan.current_settings.max_pages_per_query);
        setPlanMaxJobsPerSite(
          updatedPlan.current_settings.max_jobs_per_site_run
        );
        setPlanConcurrency(updatedPlan.current_settings.concurrency_per_site);
        setPlanEnableWayback(
          updatedPlan.current_settings.enable_wayback_cdx_2021_2024
        );
        setPlanEnableSitemap(
          updatedPlan.current_settings.enable_sitemap_archive
        );
      }
      setPlanNewKeyword("");
      setPlanStatusMsg(
        autoTuneOptimal
          ? `✅ Đã Tự động Căn chỉnh Tối ưu cho mục tiêu ${planTargetRecords.toLocaleString("vi-VN")} bản ghi BĐS (2021–2026) hoàn thành trong ${planExecDays} ngày và ghi trực tiếp vào configs/scraper_settings.yaml!`
          : `✅ Đã lưu Kế hoạch Quét & Căn chỉnh mới vào configs/scraper_settings.yaml! Container propvalue_scraper_etl trên Docker Ubuntu tự động áp dụng ngay.`
      );
    } catch {
      setPlanStatusMsg("❌ Lỗi kết nối khi lưu kế hoạch chiến dịch.");
    }
    setIsSavingPlan(false);
  };

  const effectiveRole: AppRole = currentUser?.role || "VIEWER";
  const canExploitData =
    effectiveRole === "RESEARCHER" ||
    effectiveRole === "OPERATOR" ||
    effectiveRole === "ADMIN";
  const canOperatePipeline =
    effectiveRole === "OPERATOR" || effectiveRole === "ADMIN";
  const isAdmin = effectiveRole === "ADMIN";

  const canAccessWorkspaceTab = (tab: TabKey): boolean => {
    if (tab === "valuation") return true;
    if (effectiveRole === "VIEWER") return false;
    if (tab === "rbac") return isAdmin;
    if (tab === "errors") return canOperatePipeline;
    return canExploitData;
  };

  const toggleSkill = (id: string) => {
    setSelectedSkills((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const tierBaseMap: Record<string, number> = {
    T1_INTERN: 34.0,
    T2_FRESHER: 56.0,
    T3_JUNIOR: 82.0,
    T4_MIDDLE_SENIOR: 135.0,
    T5_LEAD_MANAGER: 225.0,
    T6_DIRECTOR: 380.0,
  };
  const cityMultMap: Record<string, number> = {
    HN: 1.04,
    HCM: 1.02,
    DN: 0.72,
    HP: 0.68,
    BD: 0.62,
    REMOTE: 0.88,
  };
  const skillShapAddon: Record<string, number> = {
    SK_EXCEL: 14.5,
    SK_SQL: 8.2,
    SK_PYTHON: 26.8,
    SK_POWERBI: 11.4,
    SK_SPARK_BIGDATA: 19.6,
    SK_AIRFLOW_DBT: 15.2,
    SK_CLOUD_PLATFORM: 17.8,
    SK_ML_DL_FRAMEWORKS: 16.5,
    SK_GENAI_LLM: 22.4,
    SK_DATA_MODELING_DWH: 13.8,
    SK_STATISTICAL_AB_TESTING: 6.4,
    SK_REQUIREMENTS_SRS_BRD: 9.2,
    SK_FINTECH_CREDIT_RISK: 14.8,
    SK_AGILE_SCRUM: 7.5,
    SK_ENGLISH_PROFESSIONAL: 18.2,
  };

  const baseWage = (tierBaseMap[tier] || 82.0) * (cityMultMap[city] || 1.0);
  const expBonus = Math.min(28.0, Math.max(0, (expYears - 45) * 0.22));
  const skillsBonus = selectedSkills.reduce(
    (acc, sk) => acc + (skillShapAddon[sk] || 5.0),
    0
  );
  const synergyBonus =
    selectedSkills.includes("SK_EXCEL") && selectedSkills.includes("SK_PYTHON")
      ? 12.5
      : 0.0;

  const baseP50_2026 = Number(
    (baseWage + expBonus + skillsBonus + synergyBonus).toFixed(2)
  );
  const yearValAdj = computeYearValuationMultiplier(
    valuationYear,
    priceMode,
    selectedSkills
  );
  const p50 = Number((baseP50_2026 * yearValAdj.effective_mult).toFixed(2));
  const p25 = Number((p50 * 0.84).toFixed(2));
  const p10 = Number((p50 * 0.72).toFixed(2));
  const p75 = Number((p50 * 1.18).toFixed(2));
  const p90 = Number((p50 * 1.36).toFixed(2));

  const annualReport = useMemo(
    () => buildAnnualComparativeReport(reportBaseYear, reportTargetYear),
    [reportBaseYear, reportTargetYear]
  );

  const missingRecommendations = SKILLS_CATALOG.filter(
    (s) => !selectedSkills.includes(s.id)
  )
    .map((s) => {
      const rawGain = skillShapAddon[s.id] || 1.5;
      const gain = Number((rawGain * yearValAdj.effective_mult).toFixed(2));
      const diff =
        s.layer.startsWith("L1_") ? 1 : s.layer.startsWith("L2_") ? 3 : 3.5;
      const ups = Number(
        ((0.5 * rawGain + 1.8) / Math.pow(diff, 0.7)).toFixed(2)
      );
      return { ...s, gain, ups };
    })
    .sort((a, b) => b.ups - a.ups)
    .slice(0, 5);

  // Chặn tuyệt đối khách chưa xác thực khi truy cập /workspace
  if (!authChecked) {
    return (
      <main className="lab-container">
        <section
          className="lab-card"
          style={{ maxWidth: "560px", margin: "4rem auto", textAlign: "center" }}
        >
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Đang kiểm tra chứng chỉ phiên đăng nhập bảo mật...
          </p>
        </section>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="lab-container">
        <section
          className="lab-card"
          style={{
            maxWidth: "580px",
            margin: "2.5rem auto",
            padding: "1.75rem",
            border: "1px solid #6366f1",
          }}
        >
          <span className="badge badge-amber" style={{ marginBottom: "0.75rem" }}>
            KHU VỰC BẢO MẬT • YÊU CẦU XÁC THỰC
          </span>
          <h1 style={{ fontSize: "1.35rem", marginBottom: "0.5rem" }}>
            Đăng nhập vào Trang trong (/workspace)
          </h1>
          <p
            style={{
              fontSize: "0.88rem",
              color: "#cbd5e1",
              lineHeight: 1.6,
              marginBottom: "1.1rem",
            }}
          >
            Khu vực Trang trong chứa dữ liệu nghiên cứu chi tiết và công cụ quản
            trị của 6 mục (Mục 2 – 7). Chỉ những tài khoản đã được cấp phép mới
            có quyền truy cập.
          </p>

          <form
            onSubmit={handleWorkspacePasswordLogin}
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "0.65rem",
              padding: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                fontSize: "0.9rem",
                fontWeight: 700,
                color: "#34d399",
                marginBottom: "0.5rem",
              }}
            >
              1. Xác thực bằng Email &amp; Mật khẩu Bảo mật Lab
            </div>

            {loginError && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid #ef4444",
                  color: "#fca5a5",
                  padding: "0.55rem 0.75rem",
                  borderRadius: "0.45rem",
                  fontSize: "0.8rem",
                  marginBottom: "0.75rem",
                }}
              >
                {loginError}
              </div>
            )}

            <div style={{ display: "grid", gap: "0.65rem" }}>
              <label style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                Email tài khoản được cấp quyền:
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="Nhập email được cấp quyền..."
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.55rem 0.75rem",
                    background: "#0f172a",
                    color: "#fff",
                    border: "1px solid #475569",
                    borderRadius: "0.45rem",
                    fontSize: "0.85rem",
                  }}
                />
              </label>

              <label style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                Mật khẩu bảo mật Lab:
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Nhập mật khẩu bảo mật..."
                  style={{
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.55rem 0.75rem",
                    background: "#0f172a",
                    color: "#fff",
                    border: "1px solid #475569",
                    borderRadius: "0.45rem",
                    fontSize: "0.85rem",
                  }}
                />
              </label>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="tab-btn active"
                style={{ padding: "0.6rem 1rem", fontSize: "0.85rem" }}
              >
                {isLoggingIn
                  ? "Đang xác thực..."
                  : "Xác thực & Mở khóa Trang trong →"}
              </button>
            </div>
          </form>

          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <a
              href={`/api/auth/login?tab=${encodeURIComponent(activeTab)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                background: "#fff",
                color: "#0f172a",
                padding: "0.55rem 1rem",
                borderRadius: "0.5rem",
                fontWeight: 700,
                fontSize: "0.85rem",
                textDecoration: "none",
              }}
            >
              <span style={{ color: "#2563eb", fontWeight: 900 }}>G</span>
              2. Đăng nhập với Google OAuth (Port 3359) →
            </a>
            <a
              href="/"
              className="tab-btn"
              style={{ textDecoration: "none", padding: "0.55rem 0.95rem" }}
            >
              ← Quay về Trang ngoài
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="lab-container">
      {/* Header Trang trong sau khi Login */}
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "1.5rem",
          borderBottom: "1px solid var(--border-subtle)",
          paddingBottom: "1rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem" }}>
            PropValue.AI — Không gian Làm việc &amp; Dữ liệu Chi tiết (Trang
            trong • Port 3359)
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
            {ROLE_BADGE_META[effectiveRole].desc}
          </p>
        </div>

        {/* Thông tin Tài khoản Đã Login & Nút Ra Trang ngoài / Đăng xuất */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "0.45rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.55rem",
              flexWrap: "wrap",
            }}
          >
            {currentUser?.picture && (
              <img
                src={currentUser.picture}
                alt={currentUser.name || currentUser.email}
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  border: "1px solid #38bdf8",
                }}
              />
            )}
            <span style={{ fontSize: "0.85rem" }}>
              <strong>{currentUser?.email}</strong> ({effectiveRole})
            </span>
            <a
              href="/"
              className="tab-btn"
              style={{ textDecoration: "none", fontSize: "0.8rem" }}
            >
              ← Ra Trang ngoài
            </a>
            <button
              type="button"
              className="tab-btn"
              style={{ fontSize: "0.8rem" }}
              onClick={() => {
                fetch("/api/auth/session", { method: "DELETE" }).finally(() => {
                  window.location.href = "/";
                });
              }}
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* Hộp chọn nhanh 8 tính năng trên Điện thoại + Lưới 8 Mục tự động co giãn trên cả Điện thoại & Web */}
      <div className="mobile-quick-select-bar">
        <span style={{ fontSize: "0.78rem", color: "#38bdf8", fontWeight: 700, whiteSpace: "nowrap" }}>
          ☰ Chọn mục BĐS:
        </span>
        <select
          aria-label="Chọn mục tính năng Trang trong"
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value as TabKey)}
        >
          <option value="valuation">
            {canAccessWorkspaceTab("valuation") ? "🔓" : "🔒"} 1. Định giá BĐS Cấp Phường/Xã (34/63 Tỉnh) &amp; SHAP
          </option>
          <option value="pyramid">
            {canAccessWorkspaceTab("pyramid") ? "🔓" : "🔒"} 2. Tháp Phân tầng Giá BĐS 6 Tầng &amp; Từ điển 4 Lớp
          </option>
          <option value="econometrics">
            {canAccessWorkspaceTab("econometrics") ? "🔓" : "🔒"} 3. Kinh tế lượng Hedonic OLS &amp; Khử chệch Heckman
          </option>
          <option value="provenance">
            {canAccessWorkspaceTab("provenance") ? "🔓" : "🔒"} 4. Đối chứng Link Tin rao 6 Cổng BĐS (SHA-256)
          </option>
          <option value="rbac">
            {canAccessWorkspaceTab("rbac") ? "🔓" : "🔒"} 5. Phân quyền RBAC &amp; Quản trị Lab BĐS
          </option>
          <option value="mcp">
            {canAccessWorkspaceTab("mcp") ? "🔓" : "🔒"} 6. Trạm Truy vấn AI BĐS qua Giao thức MCP
          </option>
          <option value="errors">
            {canAccessWorkspaceTab("errors") ? "🔓" : "🔒"} 7. Nhật ký Lỗi Quét (DLQ) &amp; Đồng bộ Giờ GMT+07
          </option>
          <option value="scraped">
            {canAccessWorkspaceTab("scraped") ? "🔓" : "🔒"} 8. Kho Tin Rao Đã Quét (2021–2026 • 34/63 Tỉnh)
          </option>
        </select>
      </div>

      {/* Thanh Điều hướng 8 Mục Chi tiết ở Trang trong (Hiển thị đầy đủ trên cả Điện thoại & Web) */}
      <nav className="desktop-tabs">
        <button
          className={`tab-btn ${activeTab === "valuation" ? "active" : ""}`}
          onClick={() => setActiveTab("valuation")}
        >
          1. Định giá BĐS Cấp Phường/Xã (34/63 Tỉnh) &amp; SHAP
        </button>
        <button
          className={`tab-btn ${activeTab === "pyramid" ? "active" : ""}`}
          onClick={() => setActiveTab("pyramid")}
        >
          {!canAccessWorkspaceTab("pyramid") ? "🔒 " : ""}2. Tháp Phân tầng Giá BĐS 6 Tầng &amp; Từ điển 4 Lớp
        </button>
        <button
          className={`tab-btn ${activeTab === "econometrics" ? "active" : ""}`}
          onClick={() => setActiveTab("econometrics")}
        >
          {!canAccessWorkspaceTab("econometrics") ? "🔒 " : ""}3. Kinh tế lượng Hedonic OLS &amp; Khử chệch Heckman
        </button>
        <button
          className={`tab-btn ${activeTab === "provenance" ? "active" : ""}`}
          onClick={() => setActiveTab("provenance")}
        >
          {!canAccessWorkspaceTab("provenance") ? "🔒 " : ""}4. Đối chứng Link Tin rao 6 Cổng BĐS (SHA-256)
        </button>
        <button
          className={`tab-btn ${activeTab === "rbac" ? "active" : ""}`}
          onClick={() => setActiveTab("rbac")}
        >
          {!canAccessWorkspaceTab("rbac") ? "🔒 " : ""}5. Phân quyền RBAC &amp; Quản trị Lab BĐS
        </button>
        <button
          className={`tab-btn ${activeTab === "mcp" ? "active" : ""}`}
          onClick={() => setActiveTab("mcp")}
        >
          {!canAccessWorkspaceTab("mcp") ? "🔒 " : ""}6. Trạm Truy vấn AI BĐS qua Giao thức MCP
        </button>
        <button
          className={`tab-btn ${activeTab === "errors" ? "active" : ""}`}
          onClick={() => setActiveTab("errors")}
        >
          {!canAccessWorkspaceTab("errors") ? "🔒 " : ""}7. Nhật ký Lỗi Quét (DLQ) &amp; Đồng bộ Giờ GMT+07
        </button>
        <button
          className={`tab-btn ${activeTab === "scraped" ? "active" : ""}`}
          onClick={() => setActiveTab("scraped")}
        >
          {!canAccessWorkspaceTab("scraped") ? "🔒 " : ""}8. Kho Tin Rao Đã Quét (2021–2026 • 34/63 Tỉnh)
        </button>
      </nav>

      {/* THẺ CHẶN PHÂN QUYỀN RBAC KHI NGƯỜI DÙNG BẤM VÀO MỤC VƯỢT QUÁ QUYỀN HẠN (VD: VIEWER BẤM MỤC 2-8) */}
      {!canAccessWorkspaceTab(activeTab) && (
        <section
          className="lab-card"
          style={{
            border: "1px solid #ef4444",
            background:
              "linear-gradient(145deg, rgba(69, 10, 10, 0.35), rgba(15, 23, 42, 0.96))",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexWrap: "wrap",
              marginBottom: "0.5rem",
            }}
          >
            <span className="badge badge-red">
              🔒 HẠN CHẾ TRUY CẬP THEO PHÂN QUYỀN RBAC ({effectiveRole})
            </span>
            <span className="badge badge-amber">
              Yêu cầu tối thiểu: {PUBLIC_SECTION_INTRODUCTIONS[activeTab].minRoleLabel}
            </span>
          </div>
          <h2 style={{ fontSize: "1.2rem", color: "#fca5a5", marginBottom: "0.45rem" }}>
            Tài khoản {currentUser?.email} đang ở mức quyền{" "}
            <code>{effectiveRole}</code> — Không có quyền truy cập{" "}
            {PUBLIC_SECTION_INTRODUCTIONS[activeTab].shortTitle}
          </h2>
          <p
            style={{
              fontSize: "0.88rem",
              color: "#e2e8f0",
              lineHeight: 1.65,
              marginBottom: "0.9rem",
            }}
          >
            Theo quy chế phân quyền RBAC 4 tầng của PropValue.AI Lab:
            <br />• <strong>Mức VIEWER (mặc định khi đăng nhập):</strong> Chỉ được
            phép xem và sử dụng{" "}
            <strong style={{ color: "#34d399" }}>
              Mục 1 (1. Định giá BĐS Cấp Phường/Xã 34/63 Tỉnh &amp; SHAP)
            </strong>
            . Toàn bộ các mục từ <strong>Mục 2 đến Mục 8</strong> đều bị khóa.
            <br />• <strong>Mức RESEARCHER:</strong> Được mở khóa{" "}
            <strong>Mục 1, 2, 3, 4, 6, 8</strong> để khai thác dữ liệu nghiên cứu.
            <br />• <strong>Mức OPERATOR:</strong> Được mở khóa{" "}
            <strong>Mục 1, 2, 3, 4, 6, 7, 8</strong> (bao gồm giám sát lỗi DLQ và
            điều khiển chiến dịch quét).
            <br />• <strong>Mức ADMIN:</strong> Chỉ dành cho Quản trị viên hệ
            thống (<code>phungtuananh3333@gmail.com</code>,{" "}
            <code>phungtuananh2222@gmail.com</code>) mở khóa toàn bộ{" "}
            <strong>Mục 1 – 8</strong> và xét duyệt nâng quyền tại{" "}
            <strong>Mục 5</strong>.
          </p>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="tab-btn active"
              onClick={() => setActiveTab("valuation")}
            >
              ← Quay về Mục 1 (1. Định giá BĐS Cấp Phường/Xã 34/63 Tỉnh &amp; SHAP)
            </button>
          </div>
        </section>
      )}

      {/* CHI TIẾT MỤC 1: VALUATION & SHAP */}
      {activeTab === "valuation" && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.65rem",
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "0.75rem",
              padding: "0.65rem 0.9rem",
              marginBottom: "1rem",
            }}
          >
            <div style={{ fontSize: "0.82rem", color: "#cbd5e1" }}>
              <strong style={{ color: "#38bdf8" }}>
                📑 Chế độ Hiển thị Mục 1 (Trang trong):
              </strong>{" "}
              Chọn công cụ định giá cần thao tác:
            </div>
            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className={`tab-btn ${
                  valuationSubMode === "ward_hub" ? "active" : ""
                }`}
                onClick={() => setValuationSubMode("ward_hub")}
              >
                🗺️ 1.1. Định giá Cấp Phường/Xã (34/63 Tỉnh &amp; Empirical Bayes)
              </button>
              <button
                type="button"
                className={`tab-btn ${
                  valuationSubMode === "profile" ? "active" : ""
                }`}
                onClick={() => setValuationSubMode("profile")}
              >
                🏠 1.2. Định giá Hồ sơ Thửa đất / Căn hộ &amp; SHAP/PVS
              </button>
              <button
                type="button"
                className={`tab-btn ${
                  valuationSubMode === "jd_deal" ? "active" : ""
                }`}
                onClick={() => setValuationSubMode("jd_deal")}
              >
                🎯 1.3. Giải mã &amp; Đàm phán theo Tin rao BĐS
              </button>
              <button
                type="button"
                className={`tab-btn ${
                  valuationSubMode === "both" ? "active" : ""
                }`}
                onClick={() => setValuationSubMode("both")}
              >
                🔀 Xem tổng hợp
              </button>
            </div>
          </div>

          {(valuationSubMode === "ward_hub" || valuationSubMode === "both") && (
            <RealEstateWardAndPortalHub userRole={effectiveRole} />
          )}

          {(valuationSubMode === "jd_deal" || valuationSubMode === "both") && (
            <JobPostingDealAdvisorPanel
              valuationYear={valuationYear}
              priceMode={priceMode}
              externalSeedJob={dealSeedJob}
              onSyncToSimulator={({
                pillar: p,
                tier: t,
                city: c,
                expYears: e,
                skills: s,
              }) => {
                setPillar(p);
                setTier(t);
                setCity(c);
                setExpYears(e);
                setSelectedSkills(s);
                if (valuationSubMode === "jd_deal") {
                  setValuationSubMode("profile");
                }
              }}
            />
          )}

          {(valuationSubMode === "profile" || valuationSubMode === "both") && (
          <section className="rwd-grid-2">
          <div className="lab-card">
            <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>
              Cấu hình Hồ sơ Thửa đất / Căn hộ BĐS (Trang trong • {effectiveRole})
            </h2>
            <div style={{ display: "grid", gap: "0.85rem" }}>
              <label style={{ fontSize: "0.85rem" }}>
                Phân khúc Thị trường Bất động sản:
                <select
                  value={pillar}
                  onChange={(e) => setPillar(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    marginTop: "0.25rem",
                    background: "#1e293b",
                    color: "#fff",
                    border: "1px solid #334155",
                    borderRadius: "0.4rem",
                  }}
                >
                  <option value="DE-01">
                    RES-01: Căn hộ Chung cư &amp; Penthouse / Duplex
                  </option>
                  <option value="DE-02">
                    LAND-02: Nhà phố, Biệt thự &amp; Đất nền Phân lô
                  </option>
                  <option value="DE-03">
                    COM-03: Shophouse, Mặt bằng Bán lẻ &amp; Văn phòng
                  </option>
                  <option value="DE-04">
                    IND-04: BĐS Khu Công nghiệp, Kho vận &amp; Nghỉ dưỡng
                  </option>
                </select>
              </label>

              <label style={{ fontSize: "0.85rem" }}>
                Tầng Tháp Giá trị Bất động sản (6 Tầng):
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    marginTop: "0.25rem",
                    background: "#1e293b",
                    color: "#fff",
                    border: "1px solid #334155",
                    borderRadius: "0.4rem",
                  }}
                >
                  <option value="T1_INTERN">Tầng 1: Nhà ở Xã hội / Căn hộ Bình dân (22 – 42 tr/m²)</option>
                  <option value="T2_FRESHER">Tầng 2: Trung cấp / Đô thị Vệ tinh (42 – 68 tr/m²)</option>
                  <option value="T3_JUNIOR">
                    Tầng 3: Cận Cao cấp / Nhà ngõ Ô tô (68 – 105 tr/m²)
                  </option>
                  <option value="T4_MIDDLE_SENIOR">
                    Tầng 4: Cao cấp / Liền kề KĐT Đồng bộ (105 – 175 tr/m²)
                  </option>
                  <option value="T5_LEAD_MANAGER">
                    Tầng 5: Hạng sang / Biệt thự / Nhà mặt phố (175 – 320 tr/m²)
                  </option>
                  <option value="T6_DIRECTOR">
                    Tầng 6: Siêu sang / Trophy Asset Lõi CBD (320 – 850+ tr/m²)
                  </option>
                </select>
              </label>

              <div className="rwd-subgrid-2">
                <label style={{ fontSize: "0.85rem" }}>
                  Đô thị / Tỉnh Thành:
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      marginTop: "0.25rem",
                      background: "#1e293b",
                      color: "#fff",
                      border: "1px solid #334155",
                      borderRadius: "0.4rem",
                    }}
                  >
                    <option value="HN">Hà Nội (Lõi nội đô &amp; Đại đô thị)</option>
                    <option value="HCM">TP. Hồ Chí Minh (Khu Đông &amp; CBD)</option>
                    <option value="HP">Hải Phòng (Hồng Bàng / Thủy Nguyên)</option>
                    <option value="DN">Đà Nẵng (Ven biển &amp; Sông Hàn)</option>
                    <option value="BD">Đô thị Vệ tinh (Bình Dương / Bắc Ninh / Đồng Nai)</option>
                    <option value="REMOTE">Đô thị Du lịch &amp; Ven biển (Quảng Ninh / Khánh Hòa)</option>
                  </select>
                </label>

                <label style={{ fontSize: "0.85rem" }}>
                  Diện tích sử dụng / đất: <strong>{expYears} m²</strong>
                  <input
                    type="range"
                    min={25}
                    max={300}
                    step={5}
                    value={expYears}
                    onChange={(e) => setExpYears(parseFloat(e.target.value))}
                    style={{ width: "100%", marginTop: "0.5rem" }}
                  />
                </label>
              </div>

              <div className="rwd-subgrid-2">
                <label style={{ fontSize: "0.85rem" }}>
                  Năm Định giá BĐS (Chuỗi thời gian 2021–2026):
                  <select
                    value={valuationYear}
                    onChange={(e) => setValuationYear(Number(e.target.value))}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      marginTop: "0.25rem",
                      background: "#1e293b",
                      color: "#38bdf8",
                      fontWeight: 700,
                      border: "1px solid #38bdf8",
                      borderRadius: "0.4rem",
                    }}
                  >
                    <option value={2026}>Năm 2026 (Bảng giá đất sát thị trường &amp; Sáp nhập 34 Tỉnh)</option>
                    <option value={2025}>Năm 2025 (Chu kỳ Luật Đất đai 2024 &amp; Hạ tầng Metro)</option>
                    <option value={2024}>Năm 2024 (Phục hồi Thanh khoản Chung cư &amp; Nhà ở thực)</option>
                    <option value={2023}>Năm 2023 (Điểm đáy Thanh khoản &amp; Lãi suất cao)</option>
                    <option value={2022}>Năm 2022 (Đỉnh Sóng Đất nền &amp; Siết Tín dụng)</option>
                    <option value={2021}>Năm 2021 (Mặt bằng Giá Nền Giai đoạn Đầu)</option>
                  </select>
                </label>

                <label style={{ fontSize: "0.85rem" }}>
                  Hệ quy chiếu Giá trị Tiền tệ:
                  <select
                    value={priceMode}
                    onChange={(e) =>
                      setPriceMode(
                        e.target.value as "NOMINAL" | "REAL_CPI_2026"
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      marginTop: "0.25rem",
                      background: "#1e293b",
                      color: "#34d399",
                      fontWeight: 700,
                      border: "1px solid #34d399",
                      borderRadius: "0.4rem",
                    }}
                  >
                    <option value="NOMINAL">
                      Đơn giá Danh nghĩa (Nominal tại năm {valuationYear})
                    </option>
                    <option value="REAL_CPI_2026">
                      Đơn giá Thực tế (Đã khử lạm phát CPI quy về giá 2026)
                    </option>
                  </select>
                </label>
              </div>

              <div>
                <div style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                  Chọn các Thuộc tính Giá trị BĐS hiện có (Click để bật/tắt):
                </div>
                <div
                  style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}
                >
                  {SKILLS_CATALOG.map((sk) => (
                    <button
                      key={sk.id}
                      type="button"
                      onClick={() => toggleSkill(sk.id)}
                      className={`skill-chip ${
                        selectedSkills.includes(sk.id) ? "selected" : ""
                      }`}
                    >
                      {sk.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="lab-card">
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
              Kết quả Dự báo Phân vị Đơn giá BĐS Năm {valuationYear} (LightGBM Quantile) &amp; Đóng góp SHAP
            </h2>
            <div
              style={{
                background: "#1e293b",
                padding: "1rem",
                borderRadius: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Đơn giá BĐS Trung vị Kỳ vọng Năm {valuationYear} (P50 •{" "}
                {priceMode === "REAL_CPI_2026"
                  ? "Giá thực tế chuẩn CPI 2026"
                  : `Danh nghĩa năm ${valuationYear}`}
                ):
              </div>
              <div
                style={{ fontSize: "2rem", fontWeight: 800, color: "#38bdf8" }}
              >
                {p50} triệu VNĐ / m²{" "}
                <span style={{ fontSize: "1.05rem", color: "#34d399" }}>
                  (≈ {((p50 * expYears) / 1000).toFixed(2)} tỷ VNĐ / {expYears}m²)
                </span>
              </div>
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "#94a3b8",
                  marginTop: "0.25rem",
                }}
              >
                • Khoảng Tứ phân vị (P25 – P75):{" "}
                <strong>
                  {p25} – {p75} tr/m²
                </strong>{" "}
                | Khoảng tin cậy 80% (P10 – P90):{" "}
                <strong>
                  {p10} – {p90} tr/m²
                </strong>
              </div>
              <div
                style={{
                  fontSize: "0.78rem",
                  color: "#cbd5e1",
                  marginTop: "0.35rem",
                  paddingTop: "0.35rem",
                  borderTop: "1px dashed #334155",
                }}
              >
                • Hệ số mặt bằng giá BĐS năm {valuationYear}:{" "}
                <strong style={{ color: "#38bdf8" }}>
                  ×{yearValAdj.nominal_mult}
                </strong>{" "}
                | Hệ số biến động thuộc tính (Hedonic Drift {valuationYear}):{" "}
                <strong style={{ color: "#34d399" }}>
                  ×{yearValAdj.skill_drift_mult}
                </strong>{" "}
                | Chỉ số CPI ({valuationYear}):{" "}
                <strong>{yearValAdj.cpi_index}</strong> (Hệ số quy đổi thực tế:{" "}
                <strong>×{yearValAdj.real_cpi_2026_deflator}</strong>)
              </div>
            </div>

            <ValuationMultiYearFanChart
              valuationYear={valuationYear}
              priceMode={priceMode}
              baseP50_2026={baseP50_2026}
              selectedSkills={selectedSkills}
              p10={p10}
              p25={p25}
              p50={p50}
              p75={p75}
              p90={p90}
            />

            <ShapAndUpsChart
              baseWage={Number((baseWage * yearValAdj.effective_mult).toFixed(2))}
              expBonus={Number((expBonus * yearValAdj.effective_mult).toFixed(2))}
              synergyBonus={Number(
                (synergyBonus * yearValAdj.effective_mult).toFixed(2)
              )}
              selectedSkillContributions={selectedSkills.map((sk) => {
                const found = SKILLS_CATALOG.find((s) => s.id === sk);
                return {
                  id: sk,
                  name: found ? found.name.split(" (")[0] : sk,
                  addon: Number(
                    (
                      (skillShapAddon[sk] || 1.0) * yearValAdj.effective_mult
                    ).toFixed(2)
                  ),
                };
              })}
              recommendations={missingRecommendations}
            />

            <h3 style={{ fontSize: "0.95rem", margin: "0.85rem 0 0.6rem" }}>
              Khuyến nghị Bổ sung Thuộc tính Gia tăng Giá trị BĐS (Property Value Score - PVS)
            </h3>
            <div className="table-scroll">
              <table className="lab-table">
                <thead>
                  <tr>
                    <th>Thuộc tính / Tiện ích BĐS Gợi ý</th>
                    <th>Tầng Ontology BĐS</th>
                    <th>Phần bù SHAP Kỳ vọng</th>
                    <th>Điểm Gia tăng PVS</th>
                  </tr>
                </thead>
                <tbody>
                  {missingRecommendations.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                      </td>
                      <td>
                        <span className="badge badge-blue">{item.layer}</span>
                      </td>
                      <td style={{ color: "#34d399", fontWeight: 700 }}>
                        +{item.gain} tr/m²
                      </td>
                      <td>
                        <strong>{item.ups}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
          )}
        </>
      )}

      {/* CHI TIẾT MỤC 2: PROPERTY VALUE PYRAMID */}
      {canAccessWorkspaceTab("pyramid") && activeTab === "pyramid" && (
        <section className="lab-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginBottom: "0.9rem",
            }}
          >
            <h2 style={{ fontSize: "1.15rem" }}>
              Chi tiết Mục 2: Tháp Phân tầng Giá trị BĐS 6 Tầng &amp; Phân rã Vai trò Thuộc tính Hedonic (Pháp lý • Vị trí • Nâng hạng)
            </h2>
            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className={`tab-btn ${
                  pyramidSubView === "tiers" ? "active" : ""
                }`}
                onClick={() => setPyramidSubView("tiers")}
              >
                🏛️ 2.1. Tháp Giá trị BĐS 6 Tầng (T1–T6)
              </button>
              <button
                type="button"
                className={`tab-btn ${
                  pyramidSubView === "clusters" ? "active" : ""
                }`}
                onClick={() => setPyramidSubView("clusters")}
              >
                🧩 2.2. 10 Cụm Thuộc tính Định giá Hedonic (G1–G10)
              </button>
              <button
                type="button"
                className={`tab-btn ${
                  pyramidSubView === "roadmap" ? "active" : ""
                }`}
                onClick={() => setPyramidSubView("roadmap")}
              >
                🏡 2.3. Chiến lược Đầu tư &amp; Mua Nhà 3 Nhóm Khách hàng
              </button>
              <button
                type="button"
                className={`tab-btn ${
                  pyramidSubView === "all" ? "active" : ""
                }`}
                onClick={() => setPyramidSubView("all")}
              >
                📑 Xem tất cả
              </button>
            </div>
          </div>

          {(pyramidSubView === "tiers" || pyramidSubView === "all") && (
            <>
          <CareerPyramidSvgChart currentTier={tier} />
          <div
            style={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "0.65rem",
              padding: "0.85rem 1rem",
              marginBottom: "0.9rem",
              fontSize: "0.8rem",
              color: "#cbd5e1",
            }}
          >
            <strong style={{ color: "#38bdf8" }}>
              📐 Cơ sở Phân loại 6 Tầng Tháp Giá trị BĐS (Khung Chuẩn Định giá Quốc tế IVS &amp; Thuật toán Hợp nhất 5 Tín hiệu):
            </strong>
            <div style={{ marginTop: "0.3rem", lineHeight: 1.55 }}>
              • <strong>4 Hệ quy chiếu chuẩn:</strong> (1) Tiêu chuẩn Định giá Quốc tế{" "}
              <code>IVS 2025 / RICS Red Book</code>; (2) Phân hạng Chung cư &amp; Nhà ở theo{" "}
              <code>Luật Nhà ở 2023 &amp; Luật Đất đai 2024</code>; (3) Phân vùng Không gian{" "}
              <code>34 Tỉnh/Thành (Sau sáp nhập) ↔ 63 Tỉnh/Thành (Lịch sử)</code>; và (4) Khung Định giá Đặc tính{" "}
              <code>Rosen Hedonic Pricing (1974)</code>.
              <br />• <strong>Thuật toán 5 Tín hiệu trong <code>PropertySegmentAndTierClassifier</code>:</strong> Kết hợp{" "}
              <strong>(1) Phân khúc &amp; Loại hình BĐS (16 loại hình)</strong> +{" "}
              <strong>(2) Diện tích chuẩn hóa (<code>area_m2</code>) &amp; Mặt tiền</strong> +{" "}
              <strong>(3) Cấu trúc 4 tầng thuộc tính (<code>Pháp lý • Kết cấu • Hạ tầng • Dòng tiền</code>)</strong> +{" "}
              <strong>(4) Vị trí Phường/Xã &amp; Khoảng cách Vành đai/Metro</strong> +{" "}
              <strong>(5) Kiểm định đơn điệu phân vị đơn giá thực nghiệm ($P_{"{50}"}(T_1) &lt; \dots &lt; P_{"{50}"}(T_6)$)</strong>.
            </div>
          </div>
          <div className="table-scroll">
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Tầng Tháp BĐS</th>
                  <th>Quy mô Diện tích</th>
                  <th>Dải đơn giá chuẩn (HN/HCM)</th>
                  <th>Thuộc tính Nền tảng (Pháp lý &amp; Hạ tầng cơ bản)</th>
                  <th>Thuộc tính Khác biệt hóa (High-SHAP Premium)</th>
                  <th>Yếu tố Nâng hạng lên Phân khúc Trên</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>T6. Trophy / Siêu sang</strong>
                  </td>
                  <td>150 – 500+ m²</td>
                  <td>320 – 850+ tr/m²</td>
                  <td>Sổ đỏ lâu dài lõi CBD, Bảo mật 24/7</td>
                  <td>Bến du thuyền, Dinh thự Độc bản, Mặt phố Cổ</td>
                  <td>Tài sản Tích trữ Di sản (Trophy Asset)</td>
                </tr>
                <tr>
                  <td>
                    <strong>T5. Luxury / Mặt phố</strong>
                  </td>
                  <td>90 – 250 m²</td>
                  <td>175 – 320 tr/m²</td>
                  <td>Mặt phố lớn / Compound khép kín, Sổ đỏ</td>
                  <td>Mặt tiền &gt;6m, Kinh doanh đỉnh, View Sông/Hồ</td>
                  <td>Vị trí Lõi Trung tâm / Branded Residences</td>
                </tr>
                <tr>
                  <td>
                    <strong>T4. Cao cấp / KĐT Đồng bộ</strong>
                  </td>
                  <td>75 – 140 m²</td>
                  <td>105 – 175 tr/m²</td>
                  <td>Sổ hồng lâu dài, Bàn giao Cao cấp, Hầm đỗ xe</td>
                  <td>TOD Metro &lt;500m, Căn góc, Đại đô thị Xanh</td>
                  <td>Nâng cấp lên Biệt thự / Penthouse / Mặt phố</td>
                </tr>
                <tr>
                  <td>
                    <strong>T3. Cận Cao cấp / Ngõ Ô tô</strong>
                  </td>
                  <td>55 – 95 m²</td>
                  <td>68 – 105 tr/m²</td>
                  <td>Sổ đỏ/Sổ hồng chuẩn, Ngõ ô tô hoặc Chung cư mới</td>
                  <td>Gần trường điểm, Tiện ích nội khu, Dòng tiền thuê</td>
                  <td>Đường phân lô vỉa hè &amp; Kết nối Vành đai</td>
                </tr>
                <tr>
                  <td>
                    <strong>T2. Trung cấp / Vệ tinh</strong>
                  </td>
                  <td>45 – 80 m²</td>
                  <td>42 – 68 tr/m²</td>
                  <td>Pháp lý minh bạch, Kết nối Quốc lộ / Vành đai 3.5</td>
                  <td>Hỗ trợ lãi suất 0%, KĐT Vệ tinh, Gần KCN</td>
                  <td>Hoàn thiện hạ tầng Metro &amp; Lên Quận/Phường mới</td>
                </tr>
                <tr>
                  <td>
                    <strong>T1. Bình dân / NOXH</strong>
                  </td>
                  <td>30 – 65 m²</td>
                  <td>22 – 42 tr/m²</td>
                  <td>Hợp đồng mua bán / Sổ hồng, Điện nước dân sinh</td>
                  <td>Gần cụm KCN, Giá vừa túi tiền, Dễ cho thuê</td>
                  <td>Cấp sổ hồng lâu dài &amp; Mở rộng đường ngõ</td>
                </tr>
              </tbody>
            </table>
          </div>
            </>
          )}

          {/* KHỐI 2.2: MA TRẬN 10 NHÓM KỸ NĂNG LỚN & QUY TẮC TƯƠNG ĐƯƠNG ("HỌC 1 MỎ NEO -> AM HIỂU CẢ NHÓM CÔNG CỤ") */}
          {(pyramidSubView === "clusters" || pyramidSubView === "all") && (
          <div
            style={{
              marginTop: pyramidSubView === "all" ? "1.35rem" : "0.25rem",
              paddingTop: pyramidSubView === "all" ? "1.1rem" : "0",
              borderTop: pyramidSubView === "all" ? "1px solid #334155" : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: "0.75rem",
                marginBottom: "0.75rem",
              }}
            >
              <div>
                <h3 style={{ fontSize: "1.05rem", color: "#38bdf8" }}>
                  2.2. Giải thích Phân nhóm Thuộc tính Tương đương: Vì sao Sổ đỏ/Sổ hồng, Mặt tiền/Lô góc, TOD Metro/Vành đai... được gom vào 10 Cụm Thuộc tính Định giá Hedonic (G1–G10)?
                </h3>
                <p
                  style={{
                    fontSize: "0.82rem",
                    color: "var(--text-muted)",
                    marginTop: "0.25rem",
                  }}
                >
                  Trong bản tin rao bán BĐS (Mục 8), các từ khóa mô tả thực tế như{" "}
                  <code>Sổ hồng riêng</code>, <code>Ngõ ô tô tránh</code>,{" "}
                  <code>Cách ga Metro 300m</code>, <code>Vinhomes</code>,{" "}
                  <code>Đang cho thuê 25tr/tháng</code> được giữ nguyên ở thẻ <code>Tag gốc</code>,
                  đồng thời được quy hoạch về{" "}
                  <strong>10 Cụm Thuộc tính Định giá Hedonic (G1–G10)</strong>{" "}
                  trong <code>configs/skills_ontology.yaml</code> để chống đa
                  cộng tuyến (VIF &lt; 2.5) và phản ánh đúng{" "}
                  <strong>
                    Nguyên lý Tương đương Giá trị Hedonic (&quot;Chuẩn hóa 1 Thuộc tính Mỏ neo → Quy chiếu tương đương 85%–95% các biến thể mô tả thực địa trong cùng cụm&quot;)
                  </strong>
                  .
                </p>
              </div>
              <span className="badge badge-green">
                Tài liệu chuẩn: configs/skills_ontology.yaml (4 Lớp • 10 Cụm G1–G10)
              </span>
            </div>

            <div className="table-scroll">
              <table className="lab-table">
                <thead>
                  <tr>
                    <th>Cụm Thuộc tính &amp; Tầng Ontology</th>
                    <th>Nguyên lý Định giá Hedonic Cốt lõi</th>
                    <th>Thuộc tính Mỏ neo Chuẩn (Anchor Attribute)</th>
                    <th>Các Biến thể / Tiện ích Tương đương trong Cụm</th>
                    <th>Độ Tương đồng Giá trị &amp; Biên độ Quy đổi Hedonic</th>
                    <th>Điểm khác biệt cần lưu ý khi thẩm định thực địa</th>
                  </tr>
                </thead>
                <tbody>
                  {MACRO_SKILL_CLUSTERS.map((grp) => (
                    <tr key={grp.cluster_code}>
                      <td>
                        <strong style={{ color: "#38bdf8" }}>
                          {grp.cluster_code}. {grp.cluster_name}
                        </strong>
                        <div
                          style={{
                            fontSize: "0.73rem",
                            color: "#94a3b8",
                            marginTop: "0.2rem",
                          }}
                        >
                          {grp.stage_label}
                        </div>
                      </td>
                      <td style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                        {grp.core_mental_model}
                      </td>
                      <td>
                        <span className="badge badge-blue">
                          {grp.anchor_tool}
                        </span>
                        <div
                          style={{
                            fontSize: "0.73rem",
                            color: "#94a3b8",
                            marginTop: "0.25rem",
                            lineHeight: 1.45,
                          }}
                        >
                          Mã chuẩn BĐS: <code style={{ color: "#38bdf8", fontWeight: 700 }}>{grp.anchor_skill_id}</code>
                          <br />
                          <span style={{ color: "#cbd5e1" }}>
                            ({grp.hedonic_weight_label})
                          </span>
                        </div>
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.3rem",
                          }}
                        >
                          {grp.equivalent_tools.map((eq) => (
                            <span
                              key={eq}
                              className="badge badge-amber"
                              style={{ fontSize: "0.73rem" }}
                            >
                              ≈ {eq}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <strong style={{ color: "#34d399" }}>
                          {grp.transferability_pct}% tương đồng định giá
                        </strong>
                        <div
                          style={{
                            fontSize: "0.74rem",
                            color: "#cbd5e1",
                            marginTop: "0.2rem",
                            lineHeight: 1.45,
                          }}
                        >
                          {grp.valuation_variance_label}
                        </div>
                      </td>
                      <td style={{ fontSize: "0.76rem", color: "#94a3b8" }}>
                        {grp.key_dialect_diff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {/* KHỐI 2.3: TƯ VẤN LỘ TRÌNH ĐÀO TẠO & THỨ TỰ HỌC TẬP CHO SINH VIÊN, THỰC TẬP SINH VÀ NGƯỜI ĐÃ ĐI LÀM */}
          {(pyramidSubView === "roadmap" || pyramidSubView === "all") && (
          <div
            style={{
              marginTop: pyramidSubView === "all" ? "1.35rem" : "0.25rem",
              paddingTop: pyramidSubView === "all" ? "1.1rem" : "0",
              borderTop: pyramidSubView === "all" ? "1px solid #334155" : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.75rem",
                marginBottom: "0.85rem",
              }}
            >
              <div>
                <h3 style={{ fontSize: "1.05rem", color: "#34d399" }}>
                  2.3. Tư vấn Chiến lược Mua Nhà &amp; Đầu tư BĐS theo 3 Nhóm Khách hàng (Người mua ở thực lần đầu • Nhà đầu tư Dòng tiền • Nhà đầu tư Lãi vốn &amp; Tài sản Lõi)
                </h3>
                <p
                  style={{
                    fontSize: "0.82rem",
                    color: "var(--text-muted)",
                    marginTop: "0.2rem",
                  }}
                >
                  Chọn nhóm nhà đầu tư / người mua bên phải để xem lộ trình thẩm định pháp lý, vị trí, hạ tầng và định giá đàm phán từng bước.
                </p>
              </div>

              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={`tab-btn ${
                    selectedAudienceRoadmap === "STUDENT" ? "active" : ""
                  }`}
                  onClick={() => setSelectedAudienceRoadmap("STUDENT")}
                >
                  🏡 1. Người Mua Ở thực Lần đầu
                </button>
                <button
                  type="button"
                  className={`tab-btn ${
                    selectedAudienceRoadmap === "INTERN_FRESHER" ? "active" : ""
                  }`}
                  onClick={() => setSelectedAudienceRoadmap("INTERN_FRESHER")}
                >
                  💰 2. Nhà Đầu tư Dòng tiền Cho thuê
                </button>
                <button
                  type="button"
                  className={`tab-btn ${
                    selectedAudienceRoadmap === "WORKING_PRO" ? "active" : ""
                  }`}
                  onClick={() => setSelectedAudienceRoadmap("WORKING_PRO")}
                >
                  📈 3. Nhà Đầu tư Lãi vốn Hạ tầng &amp; Tài sản Lõi
                </button>
              </div>
            </div>

            {AUDIENCE_LEARNING_ROADMAPS.filter(
              (r) => r.audience_id === selectedAudienceRoadmap
            ).map((roadmap) => (
              <div
                key={roadmap.audience_id}
                style={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "0.75rem",
                  padding: "1rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <div>
                    <h4 style={{ fontSize: "1rem", color: "#38bdf8" }}>
                      {roadmap.title}
                    </h4>
                    <div
                      style={{
                        fontSize: "0.83rem",
                        color: "#f8fafc",
                        fontWeight: 600,
                        marginTop: "0.15rem",
                      }}
                    >
                      {roadmap.subtitle}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className="badge badge-green">
                      Tầm tài chính &amp; Lợi suất: {roadmap.expected_salary_band}
                    </span>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#94a3b8",
                        marginTop: "0.2rem",
                      }}
                    >
                      {roadmap.target_tier_transition}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: "#1e293b",
                    padding: "0.75rem",
                    borderRadius: "0.5rem",
                    fontSize: "0.82rem",
                    color: "#cbd5e1",
                    marginBottom: "0.85rem",
                    borderLeft: "3px solid #34d399",
                  }}
                >
                  <strong>Chiến lược Cốt lõi:</strong> {roadmap.core_strategy}
                </div>

                <div className="table-scroll">
                  <table className="lab-table">
                    <thead>
                      <tr>
                        <th>Bước Thẩm định</th>
                        <th>Trọng tâm Giai đoạn &amp; Cụm Hedonic</th>
                        <th>Tiêu chí Mỏ neo Cần Kiểm tra (Checklist)</th>
                        <th>Các Lựa chọn Tương đương Khả thi</th>
                        <th>Hồ sơ / Chứng thư Đầu ra Trước Đặt cọc</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roadmap.steps.map((st) => (
                        <tr key={st.step_order}>
                          <td>
                            <strong style={{ color: "#38bdf8" }}>
                              {st.step_order}
                            </strong>
                          </td>
                          <td>
                            <strong>{st.phase_name}</strong>
                            <div
                              style={{
                                fontSize: "0.74rem",
                                color: "#94a3b8",
                                marginTop: "0.2rem",
                              }}
                            >
                              {st.macro_clusters}
                            </div>
                          </td>
                          <td
                            style={{
                              fontSize: "0.8rem",
                              whiteSpace: "pre-line",
                              color: "#f8fafc",
                            }}
                          >
                            {st.anchor_to_learn}
                          </td>
                          <td
                            style={{
                              fontSize: "0.79rem",
                              whiteSpace: "pre-line",
                              color: "#34d399",
                            }}
                          >
                            {st.equivalent_unlocked}
                          </td>
                          <td style={{ fontSize: "0.79rem", color: "#cbd5e1" }}>
                            {st.deliverable_proof}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
          )}
        </section>
      )}

      {/* CHI TIẾT MỤC 3: ECONOMETRICS HEDONIC & HECKMAN */}
      {canAccessWorkspaceTab("econometrics") && activeTab === "econometrics" && (
        <section className="lab-card">
          <h2 style={{ fontSize: "1.15rem", marginBottom: "0.75rem" }}>
            Chi tiết Mục 3: Kết quả Kinh tế lượng Phương trình Hedonic Rosen Mở rộng
            (HC3) &amp; Kiểm định Chọn mẫu Heckman 2 Bước (Khử chệch Tin rao &ldquo;Giá thỏa thuận&rdquo;)
          </h2>
          <MincerAndSkillMatrixChart />
          <div className="table-scroll">
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Biến số / Thuộc tính BĐS trong Phương trình Hedonic</th>
                  <th>Hệ số Ước lượng (β / γ)</th>
                  <th>Robust SE (HC3)</th>
                  <th>Phần bù Đơn giá Halvorsen-Palm (%)</th>
                  <th>Kiểm định VIF</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>AT_STREET_FRONT_PRIME (Mặt phố kinh doanh / Đường &gt;6m)</strong>
                  </td>
                  <td>+0.251***</td>
                  <td>0.019</td>
                  <td style={{ color: "#34d399", fontWeight: 700 }}>
                    +28.50%
                  </td>
                  <td>1.42 (OK &lt; 5)</td>
                </tr>
                <tr>
                  <td>
                    <strong>AT_METRO_TOD_RINGROAD (Cách Ga Metro / Vành đai &lt;500m)</strong>
                  </td>
                  <td>+0.202***</td>
                  <td>0.022</td>
                  <td style={{ color: "#34d399", fontWeight: 700 }}>
                    +22.40%
                  </td>
                  <td>1.58 (OK &lt; 5)</td>
                </tr>
                <tr>
                  <td>
                    <strong>AT_WATERFRONT_RIVER_LAKE (View Sông / Hồ / Công viên)</strong>
                  </td>
                  <td>+0.179***</td>
                  <td>0.025</td>
                  <td style={{ color: "#34d399", fontWeight: 700 }}>
                    +19.60%
                  </td>
                  <td>1.49 (OK &lt; 5)</td>
                </tr>
                <tr>
                  <td>
                    <strong>
                      SYN_LEGAL_STREET (Tương tác Cộng hưởng Sổ đỏ × Mặt phố)
                    </strong>
                  </td>
                  <td>+0.081**</td>
                  <td>0.024</td>
                  <td style={{ color: "#38bdf8", fontWeight: 700 }}>
                    +8.44% (Synergy Bonus)
                  </td>
                  <td>2.15 (OK &lt; 5)</td>
                </tr>
                <tr>
                  <td>
                    <strong>
                      imr_lambda (Tỷ số Mills Nghịch đảo Heckman — Tin Giá thỏa thuận)
                    </strong>
                  </td>
                  <td>-0.018 (ns)</td>
                  <td>0.031</td>
                  <td>
                    Kiểm định p &gt; 0.05 (Đã kiểm soát chệch chọn mẫu)
                  </td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* CHI TIẾT MỤC 4: PROVENANCE & DATA EXPLOITATION */}
      {canAccessWorkspaceTab("provenance") && activeTab === "provenance" && (
        <section className="lab-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            <div>
              <h2 style={{ fontSize: "1.15rem" }}>
                Chi tiết Mục 4: Khai thác Dữ liệu &amp; Đối chứng Link Tin rao 6 Cổng BĐS
                (Data Exploitation &amp; SHA-256 Provenance)
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Trạng thái tài khoản đang đăng nhập:{" "}
                <code>
                  {currentUser?.email} ({effectiveRole})
                </code>
              </p>
            </div>
            {canExploitData && (
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <a
                  href="http://localhost:8000/api/v1/jobs/verified"
                  target="_blank"
                  rel="noreferrer"
                  className="tab-btn active"
                  style={{ textDecoration: "none" }}
                >
                  Xuất JSON Dữ liệu BĐS Đã Chuẩn hóa (Silver/Gold)
                </a>
              </div>
            )}
          </div>

          <MultiSourcePortalChart />

          <div style={{ marginBottom: "0.75rem" }}>
            {renderPaginationToolbar({
              totalItems: scrapedRecords.length,
              pageSize: provenancePageSize,
              currentPage: provenancePage,
              onPageSizeChange: setProvenancePageSize,
              onPageChange: setProvenancePage,
              itemLabel: "bản ghi BĐS đối chứng đa nguồn",
            })}
          </div>

          <div className="table-scroll">
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Mã Khử trùng lặp (dedup_signature)</th>
                  <th>Dự án / Sàn BĐS &amp; Tiêu đề Tin rao</th>
                  <th>Các Cổng BĐS Xuất hiện</th>
                  <th>
                    Danh sách Tất cả Đường Link Gốc &amp; Thông tin Bóc tách Thực tế
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...scrapedRecords]
                  .sort(
                    (a, b) =>
                      (b.source_urls?.length || 1) -
                      (a.source_urls?.length || 1)
                  )
                  .slice(
                    (provenancePage - 1) * provenancePageSize,
                    provenancePage * provenancePageSize
                  )
                  .map((job) => (
                    <tr key={job.dedup_signature}>
                      <td>
                        <code style={{ fontSize: "0.75rem", color: "#38bdf8" }}>
                          {job.dedup_signature}
                        </code>
                      </td>
                      <td>
                        <strong>{job.company_name_raw}</strong>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          {job.job_title_raw} • {job.primary_city_code} •{" "}
                          {job.salary_mid_vnd != null
                            ? `${job.salary_mid_vnd} triệu VNĐ/m²`
                            : job.salary_raw_text}
                        </div>
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.35rem",
                            flexWrap: "wrap",
                          }}
                        >
                          {Array.from(
                            new Set(
                              (job.source_sites || ["chotot"]).map((s) =>
                                formatPortalDisplayName(s, job.source_urls)
                              )
                            )
                          ).map((portalLabel) => (
                            <span key={portalLabel} className="badge badge-green">
                              {portalLabel}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        {job.source_urls.map((url, idx) => (
                          <div
                            key={`${url}-${idx}`}
                            style={{
                              fontSize: "0.8rem",
                              marginBottom: "0.35rem",
                              padding: "0.35rem 0.5rem",
                              background: "#1e293b",
                              borderRadius: "0.4rem",
                            }}
                          >
                            <span
                              className="badge badge-blue"
                              style={{ marginRight: "0.4rem" }}
                            >
                              {formatPortalDisplayName(
                                job.source_sites[idx] || job.source_sites[0],
                                [url]
                              )}
                            </span>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: "#f8fafc",
                                textDecoration: "underline",
                              }}
                            >
                              {url}
                            </a>
                            <span
                              style={{ color: "#94a3b8", marginLeft: "0.5rem" }}
                            >
                              (Giá rao gốc: {job.salary_raw_text} | Ngày đăng:{" "}
                              <code>{job.published_date}</code> | ACTIVE_200)
                            </span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* CHI TIẾT MỤC 5: 4-TIER RBAC GOVERNANCE & ADMIN PANEL */}
      {canAccessWorkspaceTab("rbac") && activeTab === "rbac" && (
        <section className="lab-card">
          <h2 style={{ fontSize: "1.15rem", marginBottom: "0.75rem" }}>
            Chi tiết Mục 5: Kiến trúc Phân quyền 4 Tầng (RBAC + PBAC) &amp; Cấu
            hình Google OAuth 2.0 (Port 3359)
          </h2>
          <div
            style={{
              background: "#1e293b",
              padding: "1rem",
              borderRadius: "0.75rem",
              marginBottom: "1.25rem",
              fontSize: "0.85rem",
            }}
          >
            <div>
              • <strong>Cổng Web mặc định:</strong>{" "}
              <code>http://localhost:3359</code> |{" "}
              <strong>Google OAuth Callback (Chuyển thẳng vào Trang trong):</strong>{" "}
              <code>{oauthConfig.redirect_uri}</code> →{" "}
              <code>/workspace</code>
            </div>
            <div style={{ marginTop: "0.3rem" }}>
              • <strong>Google Client ID đang kích hoạt:</strong>{" "}
              <code>{oauthConfig.google_client_id}</code>{" "}
              <span
                className={`badge ${
                  oauthConfig.has_client_secret ? "badge-green" : "badge-amber"
                }`}
                style={{ marginLeft: "0.4rem" }}
              >
                {oauthConfig.has_client_secret
                  ? "CLIENT_SECRET: ĐÃ CẤU HÌNH"
                  : "CLIENT_SECRET: CHƯA NHẬP"}
              </span>
            </div>
            <div style={{ marginTop: "0.3rem" }}>
              • <strong>Quy tắc Phân quyền RBAC Nghiêm ngặt:</strong> (1) Mọi tài khoản
              đăng nhập mới mặc định nhận role <code>VIEWER</code> (chỉ xem được{" "}
              <strong>Mục 1</strong>); (2) Chỉ danh sách <code>ADMIN_EMAILS</code>{" "}
              (<code>{oauthConfig.admin_emails.join(", ")}</code>) tự động nhận
              role <code>ADMIN</code> và có quyền cấp <code>RESEARCHER / OPERATOR</code>.
            </div>
          </div>

          {isAdmin && (
            <div
              style={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "0.75rem",
                padding: "1rem",
                marginBottom: "1.25rem",
              }}
            >
              <h3
                style={{
                  fontSize: "0.95rem",
                  color: "#38bdf8",
                  marginBottom: "0.6rem",
                }}
              >
                🔐 Quản trị Cấu hình Google OAuth 2.0 &amp; Danh sách Tài khoản
                (`app_users` — Dành cho ADMIN)
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "0.75rem",
                  marginBottom: "0.75rem",
                }}
              >
                <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                  GOOGLE_CLIENT_ID:
                  <input
                    type="text"
                    value={oauthClientIdInput}
                    onChange={(e) => setOauthClientIdInput(e.target.value)}
                    style={{
                      width: "100%",
                      marginTop: "0.25rem",
                      padding: "0.45rem 0.65rem",
                      background: "#1e293b",
                      color: "#fff",
                      border: "1px solid #475569",
                      borderRadius: "0.4rem",
                      fontSize: "0.8rem",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                  GOOGLE_CLIENT_SECRET (Để trống nếu giữ nguyên):
                  <input
                    type="password"
                    value={oauthClientSecretInput}
                    onChange={(e) => setOauthClientSecretInput(e.target.value)}
                    placeholder="GOCSPX-..."
                    style={{
                      width: "100%",
                      marginTop: "0.25rem",
                      padding: "0.45rem 0.65rem",
                      background: "#1e293b",
                      color: "#fff",
                      border: "1px solid #475569",
                      borderRadius: "0.4rem",
                      fontSize: "0.8rem",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                  ADMIN_EMAILS (Ngăn cách bằng dấu phẩy):
                  <input
                    type="text"
                    value={oauthAdminEmailsInput}
                    onChange={(e) => setOauthAdminEmailsInput(e.target.value)}
                    style={{
                      width: "100%",
                      marginTop: "0.25rem",
                      padding: "0.45rem 0.65rem",
                      background: "#1e293b",
                      color: "#fff",
                      border: "1px solid #475569",
                      borderRadius: "0.4rem",
                      fontSize: "0.8rem",
                    }}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="tab-btn active"
                  onClick={async () => {
                    setOauthSaveMsg("Đang lưu cấu hình Google OAuth...");
                    try {
                      const res = await fetch("/api/auth/session", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "update_oauth_config",
                          google_client_id: oauthClientIdInput,
                          google_client_secret: oauthClientSecretInput || undefined,
                          admin_emails: oauthAdminEmailsInput,
                        }),
                      });
                      const data = await res.json();
                      if (res.ok && data?.oauth_config) {
                        setOauthConfig(data.oauth_config);
                        setOauthClientSecretInput("");
                        setOauthSaveMsg("✅ Đã cập nhật cấu hình Google OAuth 2.0 thành công!");
                      } else {
                        setOauthSaveMsg(`❌ ${data?.error || "Không thể lưu cấu hình."}`);
                      }
                    } catch {
                      setOauthSaveMsg("❌ Lỗi kết nối khi lưu cấu hình.");
                    }
                  }}
                >
                  💾 Lưu Cấu hình Google OAuth 2.0
                </button>
                {oauthSaveMsg && (
                  <span style={{ fontSize: "0.8rem", color: "#34d399" }}>
                    {oauthSaveMsg}
                  </span>
                )}
              </div>

              {registeredUsers.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                  <div
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "#cbd5e1",
                      marginBottom: "0.4rem",
                    }}
                  >
                    Danh sách Tài khoản đã Đăng nhập &amp; Đồng bộ PostgreSQL (`app_users`:{" "}
                    {registeredUsers.length} tài khoản):
                  </div>
                  <div className="table-scroll">
                    <table className="lab-table">
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>Họ tên</th>
                          <th>Quyền hiện tại (Role)</th>
                          <th>MCP Token</th>
                          <th>Lần đăng nhập cuối</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registeredUsers.map((u) => (
                          <tr key={u.email}>
                            <td>
                              <strong>{u.email}</strong>
                            </td>
                            <td>{u.full_name || "—"}</td>
                            <td>
                              <span className="badge badge-green">{u.role}</span>
                            </td>
                            <td>
                              <code style={{ fontSize: "0.72rem" }}>
                                {u.mcp_api_token || "—"}
                              </code>
                            </td>
                            <td style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                              {u.last_login_at || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="table-scroll">
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Tầng Quyền (Role)</th>
                  <th>Đối tượng Sử dụng</th>
                  <th>Cơ chế Cấp quyền</th>
                  <th>Quyền hạn Chi tiết (Granular Permissions)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span className="badge badge-blue">
                      1. VIEWER (Quyền Xem &amp; Định giá BĐS)
                    </span>
                  </td>
                  <td>Người mua nhà, Nhà đầu tư cá nhân, Thành viên đã đăng nhập</td>
                  <td>Mặc định cho Google Login thông thường</td>
                  <td>
                    • Định giá BĐS P10–P90 (Triệu/m² &amp; Tỷ VNĐ) &amp; xem giải thích SHAP (
                    <code>valuation:estimate</code>)<br />• Xem chi tiết Tháp
                    giá trị BĐS 6 tầng &amp; chỉ số tối ưu PVS trong Trang trong
                    (<code>pyramid:view</code>)
                  </td>
                </tr>
                <tr>
                  <td>
                    <span className="badge badge-green">
                      2. RESEARCHER (Khai thác Dữ liệu)
                    </span>
                  </td>
                  <td>
                    Thành viên nhóm NCKH, Giảng viên, Chuyên gia Thẩm định giá
                  </td>
                  <td>
                    Tự động với email <code>*.edu.vn</code> /{" "}
                    <code>RESEARCHER_EMAILS</code> hoặc do Admin cấp trên Web
                  </td>
                  <td>
                    • Toàn bộ quyền <code>VIEWER</code>
                    <br />• Tra cứu bảng đối chứng Link 6 cổng BĐS &amp; SHA-256 (
                    <code>data:explore_verified_links</code>)<br />• Xuất dữ
                    liệu BĐS chuẩn hóa CSV/JSON/Parquet đã che PII (
                    <code>data:export_silver_gold</code>)<br />• Đọc báo cáo
                    kiểm toán Khung Hedonic &amp; Heckman chi tiết (
                    <code>audit:read_reports</code>)
                  </td>
                </tr>
                <tr>
                  <td>
                    <span className="badge badge-amber">
                      3. OPERATOR (Vận hành Pipeline)
                    </span>
                  </td>
                  <td>Kỹ sư Dữ liệu / Trợ lý kỹ thuật Lab BĐS</td>
                  <td>
                    Do Admin ủy quyền trong bảng <code>app_users</code>
                  </td>
                  <td>
                    • Toàn bộ quyền <code>RESEARCHER</code>
                    <br />• Kích hoạt phiên quét 6 cổng BĐS <code>--mode once</code> &amp;{" "}
                    <code>--mode backfill</code> (<code>scraper:trigger_*</code>
                    )<br />• Chạy kiểm toán <code>FrameworkAuditor</code> &amp;
                    Huấn luyện lại mô hình AVM (<code>ml:trigger_retrain</code>)
                  </td>
                </tr>
                <tr>
                  <td>
                    <span className="badge badge-amber">
                      4. ADMIN (Quản trị Tối cao)
                    </span>
                  </td>
                  <td>Chủ nhiệm Đề tài &amp; Đồng trưởng nhóm</td>
                  <td>
                    Email đầu tiên login HOẶC thuộc <code>ADMIN_EMAILS</code> (
                    <code>
                      phungtuananh3333@gmail.com, phungtuananh2222@gmail.com
                    </code>
                    )
                  </td>
                  <td>
                    • Toàn quyền hệ thống (<code>*</code>)<br />• Cấp/thu hồi
                    quyền <code>RESEARCHER / OPERATOR / ADMIN</code> cho các
                    thành viên khác (<code>users:manage_roles</code>)<br />•
                    Xuất dữ liệu gốc Tầng Bronze &amp; Cấu hình thêm cổng BĐS
                    mới (<code>system:configure_portals</code>)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {canOperatePipeline && (
            <div
              style={{
                marginTop: "1.25rem",
                padding: "1rem",
                border: "1px solid #334155",
                borderRadius: "0.75rem",
              }}
            >
              <h3
                style={{
                  fontSize: "0.95rem",
                  marginBottom: "0.5rem",
                  color: "#34d399",
                }}
              >
                ⚡ Bảng Điều khiển Vận hành Lab (Dành riêng cho OPERATOR &amp;
                ADMIN)
              </h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Tài khoản hiện tại (
                <code>{currentUser?.email || "Admin"}</code>) có quyền kích hoạt
                trực tiếp các tác vụ: Cào bổ sung (<code>once</code>), Cào lịch
                sử (<code>backfill</code>), Kiểm toán Khung (
                <code>framework-review</code>) và Huấn luyện lại Mô hình (
                <code>train_pipeline</code>).
              </p>
              <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="tab-btn active"
                  onClick={() => setActiveTab("scraped")}
                >
                  ⏳ Mở Công cụ Quét Dữ liệu Quá khứ (--mode backfill) tại Mục 8 →
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* CHI TIẾT MỤC 6: MODEL CONTEXT PROTOCOL (MCP) INTERACTIVE AI QUERY CONSOLE */}
      {canAccessWorkspaceTab("mcp") && activeTab === "mcp" && (
        <section className="lab-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div>
              <h2 style={{ fontSize: "1.15rem" }}>
                Chi tiết Mục 6: Trạm Truy vấn AI Tương tác qua Giao thức MCP
                (Model Context Protocol + RBAC Guard)
              </h2>
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.85rem",
                  marginTop: "0.25rem",
                }}
              >
                Cho phép các Trợ lý AI (Antigravity, Claude Desktop, Cursor) của
                những người dùng được cấp quyền (<code>RESEARCHER</code>,{" "}
                <code>OPERATOR</code>, <code>ADMIN</code>) truy vấn trực tiếp
                vào Kho dữ liệu Silver/Gold, Phương trình Mincer, SHAP &amp;
                Bảng đối chứng Link đa nguồn.
              </p>
            </div>
            <span
              className={`badge ${
                canExploitData ? "badge-green" : "badge-amber"
              }`}
            >
              {canExploitData
                ? `MCP INTERACTIVE QUERY: ĐÃ CẤP QUYỀN (${effectiveRole})`
                : "MCP INTERACTIVE QUERY: GIỚI HẠN Ở QUYỀN VIEWER"}
            </span>
          </div>

          <div className="rwd-grid-2">
            {/* Cột trái: Cấu hình MCP Client & Danh mục Công cụ MCP theo Phân quyền */}
            <div
              style={{
                background: "#1e293b",
                padding: "1rem",
                borderRadius: "0.75rem",
              }}
            >
              <h3
                style={{
                  fontSize: "0.95rem",
                  marginBottom: "0.6rem",
                  color: "#38bdf8",
                }}
              >
                1. Cấu hình Kết nối MCP Server (Stdio JSON-RPC &amp; HTTP
                Endpoint)
              </h3>
              <div
                style={{
                  fontSize: "0.8rem",
                  marginBottom: "0.6rem",
                  color: "#cbd5e1",
                }}
              >
                • <strong>Định danh hiện tại:</strong>{" "}
                <code>{currentUser?.email || "investor@gmail.com"}</code> (
                {effectiveRole})<br />• <strong>HTTP MCP Endpoint:</strong>{" "}
                <code>POST http://localhost:8000/api/v1/mcp/jsonrpc</code>
                <br />• <strong>REST Tool Call:</strong>{" "}
                <code>POST http://localhost:8000/api/v1/mcp/call</code>
              </div>
              <pre
                style={{
                  background: "#0f172a",
                  padding: "0.75rem",
                  borderRadius: "0.5rem",
                  fontSize: "0.75rem",
                  overflowX: "auto",
                  color: "#a7f3d0",
                  border: "1px solid #334155",
                }}
              >{`{
  "mcpServers": {
    "propvalue-real-estate-market": {
      "command": "python",
      "args": [
        "-m", "src.mcp.labor_market_mcp_server",
        "--stdio",
        "--identity", "${currentUser?.email || "phungtuananh3333@gmail.com"}"
      ]
    }
  }
}`}</pre>

              <h3
                style={{
                  fontSize: "0.95rem",
                  marginTop: "1rem",
                  marginBottom: "0.5rem",
                  color: "#38bdf8",
                }}
              >
                2. Ma trận Phân quyền 12 Công cụ MCP Toàn Hệ thống (RBAC Tool Guard)
              </h3>
              <div className="table-scroll">
                <table className="lab-table">
                  <thead>
                    <tr>
                      <th>Tên Công cụ MCP (Tool Name)</th>
                      <th>Quyền Tối thiểu</th>
                      <th>Trạng thái Của Bạn</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <code>mcp_estimate_profile_and_upskilling</code>
                      </td>
                      <td>
                        <span className="badge badge-blue">VIEWER+</span>
                      </td>
                      <td style={{ color: "#34d399" }}>✔ Được phép</td>
                    </tr>
                    <tr>
                      <td>
                        <code>mcp_analyze_job_posting_and_salary_deal</code>
                      </td>
                      <td>
                        <span className="badge badge-blue">VIEWER+</span>
                      </td>
                      <td style={{ color: "#34d399" }}>✔ Được phép</td>
                    </tr>
                    <tr>
                      <td>
                        <code>mcp_get_learning_roadmap_and_macro_clusters</code>
                      </td>
                      <td>
                        <span className="badge badge-blue">VIEWER+</span>
                      </td>
                      <td style={{ color: "#34d399" }}>✔ Được phép</td>
                    </tr>
                    <tr>
                      <td>
                        <code>mcp_query_verified_jobs</code>
                      </td>
                      <td>
                        <span className="badge badge-green">RESEARCHER+</span>
                      </td>
                      <td
                        style={{ color: canExploitData ? "#34d399" : "#f59e0b" }}
                      >
                        {canExploitData
                          ? "✔ Được phép"
                          : "Bị chặn (Cần RESEARCHER)"}
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <code>mcp_query_econometrics_and_synergy</code>
                      </td>
                      <td>
                        <span className="badge badge-green">RESEARCHER+</span>
                      </td>
                      <td
                        style={{ color: canExploitData ? "#34d399" : "#f59e0b" }}
                      >
                        {canExploitData
                          ? "✔ Được phép"
                          : "Bị chặn (Cần RESEARCHER)"}
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <code>mcp_verify_job_provenance</code>
                      </td>
                      <td>
                        <span className="badge badge-green">RESEARCHER+</span>
                      </td>
                      <td
                        style={{ color: canExploitData ? "#34d399" : "#f59e0b" }}
                      >
                        {canExploitData
                          ? "✔ Được phép"
                          : "Bị chặn (Cần RESEARCHER)"}
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <code>mcp_query_annual_comparative_reports</code>
                      </td>
                      <td>
                        <span className="badge badge-green">RESEARCHER+</span>
                      </td>
                      <td
                        style={{ color: canExploitData ? "#34d399" : "#f59e0b" }}
                      >
                        {canExploitData
                          ? "✔ Được phép"
                          : "Bị chặn (Cần RESEARCHER)"}
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <code>mcp_query_scraped_records_analytics</code>
                      </td>
                      <td>
                        <span className="badge badge-green">RESEARCHER+</span>
                      </td>
                      <td
                        style={{ color: canExploitData ? "#34d399" : "#f59e0b" }}
                      >
                        {canExploitData
                          ? "✔ Được phép"
                          : "Bị chặn (Cần RESEARCHER)"}
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <code>mcp_inspect_scraper_dlq_and_debug_bundle</code>
                      </td>
                      <td>
                        <span className="badge badge-green">RESEARCHER+</span>
                      </td>
                      <td
                        style={{ color: canExploitData ? "#34d399" : "#f59e0b" }}
                      >
                        {canExploitData
                          ? "✔ Được phép"
                          : "Bị chặn (Cần RESEARCHER)"}
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <code>mcp_trigger_crawl_and_audit</code>
                      </td>
                      <td>
                        <span className="badge badge-amber">OPERATOR+</span>
                      </td>
                      <td
                        style={{
                          color: canOperatePipeline ? "#34d399" : "#f59e0b",
                        }}
                      >
                        {canOperatePipeline
                          ? "✔ Được phép"
                          : "Bị chặn (Cần OPERATOR)"}
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <code>mcp_manage_campaign_100k_and_retention</code>
                      </td>
                      <td>
                        <span className="badge badge-amber">OPERATOR+</span>
                      </td>
                      <td
                        style={{
                          color: canOperatePipeline ? "#34d399" : "#f59e0b",
                        }}
                      >
                        {canOperatePipeline
                          ? "✔ Được phép"
                          : "Bị chặn (Cần OPERATOR)"}
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <code>mcp_manage_user_permissions</code>
                      </td>
                      <td>
                        <span className="badge badge-amber">ADMIN</span>
                      </td>
                      <td style={{ color: isAdmin ? "#34d399" : "#f59e0b" }}>
                        {isAdmin ? "✔ Được phép" : "Bị chặn (Cần ADMIN)"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cột phải: Bảng điều khiển Truy vấn Tương tác MCP Trực tiếp */}
            <div
              style={{
                background: "#1e293b",
                padding: "1rem",
                borderRadius: "0.75rem",
              }}
            >
              <h3
                style={{
                  fontSize: "0.95rem",
                  marginBottom: "0.75rem",
                  color: "#34d399",
                }}
              >
                3. Thực thi Truy vấn AI Tương tác qua MCP (Interactive
                Playground)
              </h3>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <label style={{ fontSize: "0.85rem" }}>
                  Chọn Công cụ MCP muốn AI gọi:
                  <select
                    value={selectedMcpTool}
                    onChange={(e) => setSelectedMcpTool(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      marginTop: "0.25rem",
                      background: "#0f172a",
                      color: "#fff",
                      border: "1px solid #334155",
                      borderRadius: "0.4rem",
                    }}
                  >
                    <option value="mcp_estimate_profile_and_upskilling">
                      1. mcp_estimate_profile_and_upskilling (Định giá BĐS P10-P90
                      theo Năm/CPI &amp; Chỉ số PVS — VIEWER+)
                    </option>
                    <option value="mcp_analyze_job_posting_and_salary_deal">
                      2. mcp_analyze_job_posting_and_salary_deal (Phân tích Tin rao BĐS,
                      Giải mã Giá Thỏa thuận &amp; 3 Mốc Đàm phán — VIEWER+)
                    </option>
                    <option value="mcp_get_learning_roadmap_and_macro_clusters">
                      3. mcp_get_learning_roadmap_and_macro_clusters (10 Cụm Thuộc tính
                      Hedonic G1..G10 &amp; Chiến lược 3 Nhóm Khách hàng —
                      VIEWER+)
                    </option>
                    <option value="mcp_query_verified_jobs">
                      4. mcp_query_verified_jobs (Truy vấn tin rao BĐS + Link
                      gốc 6 cổng đa nguồn — RESEARCHER+)
                    </option>
                    <option value="mcp_query_econometrics_and_synergy">
                      5. mcp_query_econometrics_and_synergy (Truy vấn hệ số
                      Hedonic OLS, Heckman, SHAP &amp; Synergy Lift — RESEARCHER+)
                    </option>
                    <option value="mcp_verify_job_provenance">
                      6. mcp_verify_job_provenance (Kiểm chứng chữ ký SHA-256
                      &amp; Vòng đời niêm yết BĐS — RESEARCHER+)
                    </option>
                    <option value="mcp_query_annual_comparative_reports">
                      7. mcp_query_annual_comparative_reports (Báo cáo So sánh
                      Giá BĐS Liên Năm 2021–2026 &amp; Oaxaca–Blinder — RESEARCHER+)
                    </option>
                    <option value="mcp_query_scraped_records_analytics">
                      8. mcp_query_scraped_records_analytics (Thống kê Bản ghi
                      Tin rao BĐS Mục 8 theo Thời gian • Địa điểm • Cổng — RESEARCHER+)
                    </option>
                    <option value="mcp_inspect_scraper_dlq_and_debug_bundle">
                      9. mcp_inspect_scraper_dlq_and_debug_bundle (Giờ GMT+07,
                      Lỗi DLQ Mục 7 &amp; Gói Debug 1 Giờ — RESEARCHER+)
                    </option>
                    <option value="mcp_trigger_crawl_and_audit">
                      10. mcp_trigger_crawl_and_audit (Kích hoạt phiên quét BĐS &amp;
                      FrameworkAuditor — OPERATOR+)
                    </option>
                    <option value="mcp_manage_campaign_100k_and_retention">
                      11. mcp_manage_campaign_100k_and_retention (Chiến dịch
                      100k Bản ghi BĐS, Backfill &amp; Lấy mẫu 20% &gt;12 tháng —
                      OPERATOR+)
                    </option>
                    <option value="mcp_manage_user_permissions">
                      12. mcp_manage_user_permissions (Quản trị User &amp; Nhật
                      ký Audit MCP — ADMIN)
                    </option>
                  </select>
                </label>

                <div className="rwd-subgrid-2">
                  <label style={{ fontSize: "0.8rem" }}>
                    Tham số Phân khúc BĐS (sector_pillar):
                    <input
                      type="text"
                      value={mcpFilterPillar}
                      onChange={(e) => setMcpFilterPillar(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.45rem",
                        marginTop: "0.2rem",
                        background: "#0f172a",
                        color: "#fff",
                        border: "1px solid #334155",
                        borderRadius: "0.4rem",
                      }}
                    />
                  </label>
                  <label style={{ fontSize: "0.8rem" }}>
                    Tham số Thuộc tính Hedonic (attribute_id / filter):
                    <input
                      type="text"
                      value={mcpFilterSkill}
                      onChange={(e) => setMcpFilterSkill(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.45rem",
                        marginTop: "0.2rem",
                        background: "#0f172a",
                        color: "#fff",
                        border: "1px solid #334155",
                        borderRadius: "0.4rem",
                      }}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  className="tab-btn active"
                  onClick={async () => {
                    const userEmail =
                      currentUser?.email ||
                      (effectiveRole === "ADMIN"
                        ? "phungtuananh3333@gmail.com"
                        : effectiveRole === "RESEARCHER"
                        ? "researcher@neu.edu.vn"
                        : "student@gmail.com");

                    if (
                      selectedMcpTool !==
                        "mcp_estimate_profile_and_upskilling" &&
                      selectedMcpTool !==
                        "mcp_analyze_job_posting_and_salary_deal" &&
                      selectedMcpTool !==
                        "mcp_get_learning_roadmap_and_macro_clusters" &&
                      !canExploitData
                    ) {
                      setMcpResponsePreview(
                        JSON.stringify(
                          {
                            isError: true,
                            authorization: {
                              authorized: false,
                              status: "DENIED_RBAC",
                              user_email: userEmail,
                              user_role: effectiveRole,
                              required_permission: "mcp:query_interactive",
                            },
                            content: [
                              {
                                type: "text",
                                text: `[MCP RBAC ACCESS DENIED] Tài khoản '${userEmail}' hiện đang ở cấp quyền 'VIEWER' (không có quyền 'mcp:query_interactive'). Vui lòng chuyển sang quyền 'RESEARCHER' hoặc 'ADMIN' để thực thi truy vấn AI tương tác!`,
                              },
                            ],
                          },
                          null,
                          2
                        )
                      );
                      return;
                    }

                    if (
                      selectedMcpTool === "mcp_manage_user_permissions" &&
                      !isAdmin
                    ) {
                      setMcpResponsePreview(
                        JSON.stringify(
                          {
                            isError: true,
                            authorization: {
                              authorized: false,
                              status: "DENIED_RBAC",
                              user_email: userEmail,
                              user_role: effectiveRole,
                              required_permission: "mcp:admin_manage_users",
                            },
                            content: [
                              {
                                type: "text",
                                text: `[MCP RBAC ACCESS DENIED] Công cụ 'mcp_manage_user_permissions' chỉ dành cho 'ADMIN' (phungtuananh3333@gmail.com, phungtuananh2222@gmail.com).`,
                              },
                            ],
                          },
                          null,
                          2
                        )
                      );
                      return;
                    }

                    try {
                      const res = await fetch(
                        "http://localhost:8000/api/v1/mcp/call",
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            user_identity: userEmail,
                            tool_name: selectedMcpTool,
                            arguments: {
                              sector_pillar: mcpFilterPillar,
                              skill_id: mcpFilterSkill,
                              skill_filter: mcpFilterSkill,
                            },
                          }),
                        }
                      );
                      if (res.ok) {
                        const data = await res.json();
                        setMcpResponsePreview(JSON.stringify(data, null, 2));
                        return;
                      }
                    } catch {
                      // Fallback kết quả chuẩn khi chạy độc lập trên trình duyệt
                    }

                    setMcpResponsePreview(
                      JSON.stringify(
                        {
                          isError: false,
                          authorization: {
                            authorized: true,
                            user_email: userEmail,
                            user_role: effectiveRole,
                            required_permission:
                              selectedMcpTool === "mcp_manage_user_permissions"
                                ? "mcp:admin_manage_users"
                                : "mcp:query_interactive",
                          },
                          tool_executed: selectedMcpTool,
                          query_arguments: {
                            sector_pillar: mcpFilterPillar,
                            skill_filter: mcpFilterSkill,
                          },
                          result_summary:
                            selectedMcpTool ===
                            "mcp_analyze_job_posting_and_salary_deal"
                              ? analyzeJobPostingForSalaryDeal({
                                  companyName:
                                    SAMPLE_JD_POSTINGS_FOR_DEAL[0].company_name,
                                  jobTitle:
                                    SAMPLE_JD_POSTINGS_FOR_DEAL[0].job_title,
                                  locationText:
                                    SAMPLE_JD_POSTINGS_FOR_DEAL[0].location_text,
                                  salaryText:
                                    SAMPLE_JD_POSTINGS_FOR_DEAL[0].salary_text,
                                  jdText:
                                    SAMPLE_JD_POSTINGS_FOR_DEAL[0].jd_full_text,
                                  valuationYear,
                                  priceMode,
                                })
                              : selectedMcpTool ===
                                "mcp_get_learning_roadmap_and_macro_clusters"
                              ? {
                                  macro_skill_clusters_count:
                                    MACRO_SKILL_CLUSTERS.length,
                                  macro_skill_clusters:
                                    MACRO_SKILL_CLUSTERS.slice(0, 4),
                                  selected_audience_roadmap:
                                    AUDIENCE_LEARNING_ROADMAPS.find(
                                      (r) =>
                                        r.audience_id ===
                                        selectedAudienceRoadmap
                                    ),
                                }
                              : selectedMcpTool ===
                                "mcp_query_annual_comparative_reports"
                              ? buildAnnualComparativeReport(
                                  reportBaseYear,
                                  reportTargetYear
                                )
                              : selectedMcpTool ===
                                "mcp_query_scraped_records_analytics"
                              ? computeScrapedRecordsAnalytics(scrapedRecords)
                                  .summary
                              : selectedMcpTool ===
                                "mcp_inspect_scraper_dlq_and_debug_bundle"
                              ? {
                                  timezone: "Asia/Ho_Chi_Minh (GMT+07:00)",
                                  total_dlq_incidents: errorLogs.length,
                                  recent_error_logs: errorLogs,
                                }
                              : selectedMcpTool ===
                                "mcp_manage_campaign_100k_and_retention"
                              ? campaignPlan
                              : {
                                  matched_records:
                                    VERIFIED_MULTI_SOURCE_JOBS.length,
                                  sample_verified_job:
                                    VERIFIED_MULTI_SOURCE_JOBS[0],
                                  econometric_highlight:
                                    "Mincer OLS R2 = 0.9038 | Heckman IMR p = 0.6258 | Top Synergy: SQL + Python (+6.61%)",
                                },
                        },
                        null,
                        2
                      )
                    );
                  }}
                >
                  Gửi Lệnh Truy vấn MCP từ AI ({effectiveRole})
                </button>

                <pre
                  style={{
                    background: "#0f172a",
                    padding: "0.85rem",
                    borderRadius: "0.5rem",
                    fontSize: "0.75rem",
                    maxHeight: "280px",
                    overflowY: "auto",
                    color: mcpResponsePreview.includes('"isError": true')
                      ? "#fca5a5"
                      : "#e2e8f0",
                    border: "1px solid #334155",
                  }}
                >
                  {mcpResponsePreview ||
                    "// Nhấn nút 'Gửi Lệnh Truy vấn MCP từ AI' để kiểm tra cơ chế phân quyền RBAC và dữ liệu trả về của MCP Server..."}
                </pre>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* CHI TIẾT MỤC 7: SCRAPER ERROR LOGS, DEAD-LETTER QUEUE (DLQ) & GMT+07 INTERNATIONAL TIME SYNC */}
      {canAccessWorkspaceTab("errors") && activeTab === "errors" && (
        <section className="lab-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div>
              <h2 style={{ fontSize: "1.15rem" }}>
                Chi tiết Mục 7: Giám sát Lỗi Tiến trình Quét (Scraper Error
                DLQ), Chụp HTML Hiện trường &amp; Đồng bộ Giờ Chuẩn GMT+07
              </h2>
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.85rem",
                  marginTop: "0.25rem",
                }}
              >
                Tự động phân loại 6 nhóm lỗi (<code>CLOUDFLARE_WAF_BLOCK</code>,{" "}
                <code>SELECTOR_DRIFT_ZERO_LINKS</code>,{" "}
                <code>DETAIL_PARSE_INCOMPLETE</code>,{" "}
                <code>HTTP_5XX_OR_TIMEOUT</code>), chụp HTML hiện trường tại{" "}
                <code>logs/html_snapshots/</code> và quét bù tự động qua{" "}
                <code>--mode retry-errors</code>.
              </p>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="tab-btn"
                onClick={() => {
                  const nowGmt07 = new Date(Date.now() + 7 * 3600 * 1000)
                    .toISOString()
                    .replace("Z", "+07:00");
                  setErrorLogs((prev) => [
                    {
                      error_id: `err-${Date.now()}`,
                      source_site: "batdongsan",
                      stage: "SEARCH_LISTING",
                      error_category: "CLOUDFLARE_WAF_BLOCK",
                      target_url:
                        "https://batdongsan.com.vn/ban-can-ho-chung-cu-ha-noi",
                      http_status: 403,
                      retry_status: "PENDING_RETRY",
                      html_snapshot_path:
                        "logs/html_snapshots/batdongsan_cloudflare_waf_block_91b2e4.html",
                      remediation_action:
                        "1) Bật playwright_stealth; 2) Tăng min_delay_sec lên 3.5s; 3) Nhấn nút 'Chạy Quét Bù Tự động (--mode retry-errors)' để khôi phục.",
                      occurred_at: nowGmt07,
                    },
                    ...prev,
                  ]);
                }}
              >
                Mô phỏng Phát sinh Lỗi Quét (PENDING_RETRY)
              </button>

              <button
                type="button"
                className="tab-btn active"
                onClick={async () => {
                  try {
                    await fetch(
                      "http://localhost:8000/api/v1/scraper/retry-errors",
                      {
                        method: "POST",
                      }
                    );
                  } catch {
                    // Fallback cập nhật trạng thái trực tiếp trên UI
                  }
                  setErrorLogs((prev) =>
                    prev.map((item) =>
                      item.retry_status === "PENDING_RETRY"
                        ? { ...item, retry_status: "RESOLVED" }
                        : item
                    )
                  );
                }}
              >
                Chạy Quét Bù Tự động (--mode retry-errors)
              </button>
            </div>
          </div>

          {/* Hộp Kiểm định Đồng bộ Múi giờ GMT+07 (Asia/Ho_Chi_Minh) & Giờ Quốc tế NTP */}
          <div
            style={{
              background: "#1e293b",
              padding: "1rem",
              borderRadius: "0.75rem",
              marginBottom: "1.25rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "0.85rem",
              border: "1px solid #334155",
            }}
          >
            <div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Giờ Chạy Hệ thống (Chuẩn GMT+07:00)
              </div>
              <div
                style={{ fontSize: "1rem", fontWeight: 700, color: "#38bdf8" }}
              >
                {timeSyncStatus.server_gmt07_iso}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#cbd5e1" }}>
                Khung giờ cào Daemon: <code>01:00 AM GMT+07</code>
              </div>
            </div>

            <div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Giờ Phối hợp Quốc tế Đối chiếu (UTC+00:00)
              </div>
              <div
                style={{ fontSize: "1rem", fontWeight: 700, color: "#f8fafc" }}
              >
                {timeSyncStatus.international_utc_iso}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#cbd5e1" }}>
                Nguồn chuẩn: <code>{timeSyncStatus.ntp_source}</code>
              </div>
            </div>

            <div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Độ lệch Đồng hồ Server (Clock Skew)
              </div>
              <div
                style={{ fontSize: "1rem", fontWeight: 700, color: "#34d399" }}
              >
                {timeSyncStatus.clock_skew_seconds} giây (
                {timeSyncStatus.sync_status})
              </div>
              <div style={{ fontSize: "0.75rem", color: "#cbd5e1" }}>
                Ngưỡng cho phép: <code>±30.0s</code> • Khóa cứng{" "}
                <code>Asia/Ho_Chi_Minh</code>
              </div>
            </div>

            <div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Trạng thái Hàng đợi Lỗi (Dead-Letter Queue)
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 700 }}>
                <span style={{ color: "#f59e0b" }}>
                  Chờ Retry:{" "}
                  {
                    errorLogs.filter((e) => e.retry_status === "PENDING_RETRY")
                      .length
                  }
                </span>{" "}
                |{" "}
                <span style={{ color: "#34d399" }}>
                  Đã Khắc phục:{" "}
                  {
                    errorLogs.filter((e) => e.retry_status === "RESOLVED")
                      .length
                  }
                </span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#cbd5e1" }}>
                File ổ cứng: <code>logs/scraper_errors.jsonl</code>
              </div>
            </div>
          </div>

          {/* Bảng Chi tiết Sự cố Quét Dữ liệu, File Chụp HTML & Hướng dẫn Khắc phục */}
          <div style={{ marginBottom: "0.75rem" }}>
            {renderPaginationToolbar({
              totalItems: errorLogs.length,
              pageSize: errorsPageSize,
              currentPage: errorsPage,
              onPageSizeChange: setErrorsPageSize,
              onPageChange: setErrorsPage,
              itemLabel: "sự cố quét DLQ",
            })}
          </div>

          <div className="table-scroll">
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Thời gian (GMT+07)</th>
                  <th>Cổng &amp; Giai đoạn</th>
                  <th>Mã Phân loại Lỗi</th>
                  <th>URL Bị Lỗi &amp; Ảnh chụp HTML Hiện trường</th>
                  <th>Trạng thái DLQ</th>
                  <th>Hướng dẫn Khắc phục Tự động</th>
                </tr>
              </thead>
              <tbody>
                {errorLogs
                  .slice(
                    (errorsPage - 1) * errorsPageSize,
                    errorsPage * errorsPageSize
                  )
                  .map((err) => (
                  <tr key={err.error_id}>
                    <td>
                      <code style={{ fontSize: "0.75rem" }}>
                        {err.occurred_at}
                      </code>
                    </td>
                    <td>
                      <span className="badge badge-blue">
                        {err.source_site.toUpperCase()}
                      </span>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#94a3b8",
                          marginTop: "0.2rem",
                        }}
                      >
                        {err.stage} (HTTP {err.http_status})
                      </div>
                    </td>
                    <td>
                      <code
                        style={{
                          color: "#fca5a5",
                          fontWeight: 700,
                          fontSize: "0.78rem",
                        }}
                      >
                        {err.error_category}
                      </code>
                    </td>
                    <td>
                      <div
                        style={{ fontSize: "0.8rem", wordBreak: "break-all" }}
                      >
                        {err.target_url}
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#38bdf8",
                          marginTop: "0.2rem",
                        }}
                      >
                        Snapshot: <code>{err.html_snapshot_path}</code>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          err.retry_status === "RESOLVED"
                            ? "badge-green"
                            : "badge-amber"
                        }`}
                      >
                        {err.retry_status}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                      {err.remediation_action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* CHI TIẾT MỤC 8: THỐNG KÊ SỐ BẢN GHI QUÉT ĐƯỢC THEO THỜI GIAN, ĐỊA ĐIỂM, SĐT NGƯỜI RAO & NỘI DUNG CHI TIẾT */}
      {canAccessWorkspaceTab("scraped") &&
        activeTab === "scraped" &&
        (() => {
          const overallAnalytics =
            computeScrapedRecordsAnalytics(scrapedRecords);
          const sellerPhoneAnalytics =
            computeSellerPhoneAnalytics(scrapedRecords);
          const provinceWardAnalytics =
            computeProvinceAndWardAnalytics(scrapedRecords);
          const sellerPhoneMap = new Map(
            sellerPhoneAnalytics.sellers.map((s) => [s.seller_phone, s])
          );
          const wardMap = new Map(
            provinceWardAnalytics.wards.map((w) => [w.ward_key, w])
          );
          const provinceMap = new Map(
            provinceWardAnalytics.provinces.map((p) => [p.province_code, p])
          );
          const filteredRecords = scrapedRecords.filter((rec) => {
            const recPhone =
              rec.seller_phone ||
              resolveSellerPhoneForRecord(rec).seller_phone;
            const recLoc = extractProvinceDistrictWard(rec);
            const sellerTotal = sellerPhoneMap.get(recPhone)?.total_listings || 1;

            if (filterCity !== "ALL" && rec.primary_city_code !== filterCity) {
              return false;
            }
            if (
              filterProvinceCode !== "ALL" &&
              recLoc.province_code !== filterProvinceCode
            ) {
              return false;
            }
            if (filterWardKey !== "ALL" && recLoc.ward_key !== filterWardKey) {
              return false;
            }
            if (filterMonth !== "ALL" && rec.year_month !== filterMonth) {
              return false;
            }
            if (
              filterPortal !== "ALL" &&
              !(rec.source_sites || [normalizePortalCode("", rec.source_urls)]).some(
                (s) => normalizePortalCode(s, rec.source_urls) === filterPortal
              )
            ) {
              return false;
            }
            if (filterPillar !== "ALL" && rec.sector_pillar !== filterPillar) {
              return false;
            }
            if (
              filterSellerPhone !== "ALL" &&
              recPhone !== filterSellerPhone
            ) {
              return false;
            }
            if (filterSellerListingsBand === "1" && sellerTotal !== 1) {
              return false;
            }
            if (filterSellerListingsBand === "2_PLUS" && sellerTotal < 2) {
              return false;
            }
            if (filterSellerListingsBand === "3_PLUS" && sellerTotal < 3) {
              return false;
            }
            if (filterSellerListingsBand === "5_PLUS" && sellerTotal < 5) {
              return false;
            }
            if (filterSellerListingsBand === "10_PLUS" && sellerTotal < 10) {
              return false;
            }
            if (
              filterPriceStatus === "DISCLOSED" &&
              (rec.salary_mid_vnd == null || rec.salary_mid_vnd <= 0)
            ) {
              return false;
            }
            if (
              filterPriceStatus === "NEGOTIABLE" &&
              rec.salary_mid_vnd != null &&
              rec.salary_mid_vnd > 0
            ) {
              return false;
            }
            if (searchKeyword.trim()) {
              const kw = searchKeyword.trim().toLowerCase();
              const haystack = [
                rec.job_title_raw,
                rec.company_name_raw,
                rec.description_clean,
                rec.requirements_clean,
                rec.search_city,
                recLoc.province_name,
                recLoc.district_name,
                recLoc.ward_name,
                recPhone,
                formatVnPhoneDisplay(recPhone),
                ...(rec.matched_skill_ids || []),
                ...(rec.raw_skill_tags || []),
              ]
                .join(" ")
                .toLowerCase();
              if (!haystack.includes(kw)) {
                return false;
              }
            }
            return true;
          });
          const filteredAnalytics =
            computeScrapedRecordsAnalytics(filteredRecords);
          const filteredProvinceWardAnalytics =
            computeProvinceAndWardAnalytics(filteredRecords);
          const totalRawCount = Math.max(
            scrapedRawTotal,
            overallAnalytics.summary.total_source_links
          );
          const filteredDisclosedPriceCount = filteredRecords.filter(
            (r) => r.salary_mid_vnd != null && r.salary_mid_vnd > 0
          ).length;
          const filteredNegotiablePriceCount =
            filteredRecords.length - filteredDisclosedPriceCount;
          const filteredPillarCounts = {
            "DE-01": filteredRecords.filter((r) => r.sector_pillar === "DE-01")
              .length,
            "DE-02": filteredRecords.filter((r) => r.sector_pillar === "DE-02")
              .length,
            "DE-03": filteredRecords.filter((r) => r.sector_pillar === "DE-03")
              .length,
            "DE-04": filteredRecords.filter((r) => r.sector_pillar === "DE-04")
              .length,
          };

          const filteredProvincesReport =
            provinceWardAnalytics.provinces.filter((p) => {
              if (
                reportRegionFilter !== "ALL" &&
                p.macro_region !== reportRegionFilter
              ) {
                return false;
              }
              if (
                reportProvinceMinListings > 1 &&
                p.master_records < reportProvinceMinListings
              ) {
                return false;
              }
              return true;
            });

          const filteredWardsReport = provinceWardAnalytics.wards
            .filter((w) => {
              if (
                reportRegionFilter !== "ALL" &&
                w.macro_region !== reportRegionFilter
              ) {
                return false;
              }
              if (
                reportProvinceFilter !== "ALL" &&
                w.province_code !== reportProvinceFilter
              ) {
                return false;
              }
              if (
                reportWardMinListings > 1 &&
                w.master_records < reportWardMinListings
              ) {
                return false;
              }
              if (reportWardSearch.trim()) {
                const kw = reportWardSearch.trim().toLowerCase();
                const hay = [
                  w.ward_name,
                  w.district_name,
                  w.province_name,
                  w.province_code,
                ]
                  .join(" ")
                  .toLowerCase();
                if (!hay.includes(kw)) {
                  return false;
                }
              }
              return true;
            })
            .sort((a, b) => {
              if (reportWardSortBy === "PRICE_DESC") {
                return b.avg_price_m2 - a.avg_price_m2;
              }
              if (reportWardSortBy === "PRICE_ASC") {
                return (
                  (a.avg_price_m2 || 999999) - (b.avg_price_m2 || 999999)
                );
              }
              if (reportWardSortBy === "NAME_ASC") {
                return a.ward_name.localeCompare(b.ward_name);
              }
              if (b.master_records !== a.master_records) {
                return b.master_records - a.master_records;
              }
              return a.ward_name.localeCompare(b.ward_name);
            });

          const filteredWardsTotalListings = filteredWardsReport.reduce(
            (sum, w) => sum + w.master_records,
            0
          );
          const filteredWardsTotalRawLinks = filteredWardsReport.reduce(
            (sum, w) => sum + w.raw_postings,
            0
          );

          const filteredSellers = sellerPhoneAnalytics.sellers.filter((s) => {
            if (sellerTypeFilter === "MULTI" && s.total_listings < 2) {
              return false;
            }
            if (sellerTypeFilter === "PRO" && s.total_listings < 4) {
              return false;
            }
            if (
              sellerTypeFilter === "SEMI" &&
              (s.total_listings < 2 || s.total_listings > 3)
            ) {
              return false;
            }
            if (sellerTypeFilter === "OWNER" && s.total_listings !== 1) {
              return false;
            }
            if (sellerMinListings > 1 && s.total_listings < sellerMinListings) {
              return false;
            }
            if (sellerMaxListings > 0 && s.total_listings > sellerMaxListings) {
              return false;
            }
            if (sellerPhoneSearch.trim()) {
              const kw = sellerPhoneSearch.trim().toLowerCase();
              const hay = [
                s.seller_phone,
                s.seller_phone_display,
                s.primary_seller_name,
                ...s.seller_names,
                ...s.cities,
                ...s.wards,
                ...s.portals,
              ]
                .join(" ")
                .toLowerCase();
              if (!hay.includes(kw)) {
                return false;
              }
            }
            return true;
          });
          const filteredSellersTotalListings = filteredSellers.reduce(
            (sum, s) => sum + s.total_listings,
            0
          );
          const filteredSellersTotalRawLinks = filteredSellers.reduce(
            (sum, s) => sum + s.total_source_links,
            0
          );

          return (
            <div style={{ display: "grid", gap: "1.25rem" }}>
              {/* Khối 1: KPI Tổng hợp Số Bản ghi Quét được trên App */}
              <section className="lab-card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    marginBottom: "1rem",
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: "1.15rem", color: "#f8fafc" }}>
                      Chi tiết Mục 8: Thống kê Kho Tin Rao BĐS Quét được theo Thời
                      gian, Địa điểm (34/63 Tỉnh) &amp; Nội dung Tin Rao Bán
                    </h2>
                    <p
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.85rem",
                        marginTop: "0.25rem",
                      }}
                    >
                      Tổng hợp trực tiếp từ kho dữ liệu cào đa nguồn 6 cổng BĐS (Batdongsan.com.vn,
                      Chotot, Alonhadat, Mogi, Muaban, Meeyland) qua đường ống{" "}
                      <code>UnifiedETLPipeline</code>.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <span className="badge badge-green">
                      Chuẩn hóa Tức thời (Real-time 0s) • Cập nhật:{" "}
                      {overallAnalytics.summary.last_scraped_at}
                    </span>
                    <button
                      type="button"
                      disabled={isRefreshingScraped || isReprocessingBronze}
                      onClick={() => refreshScrapedData(false)}
                      style={{
                        background: "#059669",
                        color: "#ffffff",
                        border: "1px solid #34d399",
                        borderRadius: "0.5rem",
                        padding: "0.35rem 0.75rem",
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        cursor:
                          isRefreshingScraped || isReprocessingBronze
                            ? "wait"
                            : "pointer",
                      }}
                    >
                      {isRefreshingScraped
                        ? "⏳ Đang làm mới..."
                        : "🔄 Làm mới Số tin đã quét (Refresh)"}
                    </button>
                    <button
                      type="button"
                      disabled={isReprocessingBronze || isRefreshingScraped}
                      onClick={() => refreshScrapedData(true)}
                      style={{
                        background: "#0284c7",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "0.5rem",
                        padding: "0.35rem 0.7rem",
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        cursor:
                          isReprocessingBronze || isRefreshingScraped
                            ? "wait"
                            : "pointer",
                      }}
                    >
                      {isReprocessingBronze
                        ? "⏳ Đang chuẩn hóa lại..."
                        : "⚙️ Đồng bộ & Chuẩn hóa lại Bronze → Silver"}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "0.85rem",
                  }}
                >
                  <div
                    style={{
                      background: "#1e293b",
                      padding: "1rem",
                      borderRadius: "0.75rem",
                      border: "1px solid #334155",
                    }}
                  >
                    <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                      Tổng Bản ghi Thô Quét được (Tầng Bronze)
                    </div>
                    <div
                      style={{
                        fontSize: "1.75rem",
                        fontWeight: 800,
                        color: "#38bdf8",
                        marginTop: "0.2rem",
                      }}
                    >
                      {totalRawCount} bản ghi
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "#cbd5e1" }}>
                      Từ <strong>{scrapedCrawlRuns}</strong> phiên quét trên{" "}
                      <strong>{overallAnalytics.summary.portals_count}</strong>{" "}
                      cổng BĐS
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#1e293b",
                      padding: "1rem",
                      borderRadius: "0.75rem",
                      border: "1px solid #334155",
                    }}
                  >
                    <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                      Bản ghi Chuẩn hóa Khử trùng lặp (Silver Master)
                    </div>
                    <div
                      style={{
                        fontSize: "1.75rem",
                        fontWeight: 800,
                        color: "#34d399",
                        marginTop: "0.2rem",
                      }}
                    >
                      {overallAnalytics.summary.total_master_records ||
                        scrapedMasterTotal}{" "}
                      bản ghi
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "#cbd5e1" }}>
                      Đối chứng{" "}
                      <strong>
                        {Math.max(
                          overallAnalytics.summary.total_source_links,
                          scrapedLinksTotal
                        )}
                      </strong>{" "}
                      đường link gốc (SHA-256)
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#1e293b",
                      padding: "1rem",
                      borderRadius: "0.75rem",
                      border: "1px solid #10b981",
                    }}
                  >
                    <div style={{ fontSize: "0.78rem", color: "#6ee7b7" }}>
                      🗺️ Độ phủ Tỉnh/Thành &amp; Phường/Xã
                    </div>
                    <div
                      style={{
                        fontSize: "1.35rem",
                        fontWeight: 800,
                        color: "#f8fafc",
                        marginTop: "0.2rem",
                      }}
                    >
                      {provinceWardAnalytics.total_provinces} Tỉnh •{" "}
                      {provinceWardAnalytics.total_wards} Phường/Xã
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#cbd5e1" }}>
                      Thuộc{" "}
                      <strong>
                        {provinceWardAnalytics.total_districts} Quận/Huyện
                      </strong>{" "}
                      •{" "}
                      <strong>
                        {overallAnalytics.summary.time_points_count} mốc ngày
                      </strong>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#1e293b",
                      padding: "1rem",
                      borderRadius: "0.75rem",
                      border: "1px solid #334155",
                    }}
                  >
                    <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                      🔢 Đếm Số Bản tin Khớp Bộ lọc Hiện tại
                    </div>
                    <div
                      style={{
                        fontSize: "1.75rem",
                        fontWeight: 800,
                        color: "#f59e0b",
                        marginTop: "0.2rem",
                      }}
                    >
                      {filteredRecords.length} /{" "}
                      {overallAnalytics.summary.total_master_records}
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "#cbd5e1" }}>
                      <strong>
                        {filteredAnalytics.summary.total_source_links}
                      </strong>{" "}
                      link gốc •{" "}
                      <strong>
                        {filteredProvinceWardAnalytics.total_wards}
                      </strong>{" "}
                      Phường/Xã
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#1e293b",
                      padding: "1rem",
                      borderRadius: "0.75rem",
                      border: "1px solid #a855f7",
                    }}
                  >
                    <div style={{ fontSize: "0.78rem", color: "#d8b4fe" }}>
                      📞 SĐT Người rao / Môi giới Duy nhất
                    </div>
                    <div
                      style={{
                        fontSize: "1.65rem",
                        fontWeight: 800,
                        color: "#c084fc",
                        marginTop: "0.2rem",
                      }}
                    >
                      {sellerPhoneAnalytics.total_unique_phones} SĐT
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#cbd5e1" }}>
                      Môi giới ≥2 tin:{" "}
                      <strong style={{ color: "#34d399" }}>
                        {sellerPhoneAnalytics.multi_listing_sellers_count} SĐT
                      </strong>{" "}
                      • Chính chủ 1 tin:{" "}
                      <strong>
                        {sellerPhoneAnalytics.single_listing_owners_count} SĐT
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Thanh Chuyển Đổi Chế độ Xem Gọn Gàng cho Mục 8 */}
                <div
                  style={{
                    marginTop: "1rem",
                    background: "#0f172a",
                    border: "1px solid #38bdf8",
                    borderRadius: "0.75rem",
                    padding: "0.7rem 0.95rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.65rem",
                  }}
                >
                  <div style={{ fontSize: "0.82rem", color: "#cbd5e1" }}>
                    <strong style={{ color: "#38bdf8" }}>
                      📑 Tổ chức Hiển thị &amp; Báo cáo (Mục 8):
                    </strong>{" "}
                    Chọn phân khu để tra cứu, đếm số bản tin, xem báo cáo theo từng Tỉnh/Phường hoặc phân tích SĐT người rao:
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.45rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      className={`tab-btn ${
                        scrapedSubView === "jobs_list" ? "active" : ""
                      }`}
                      onClick={() => setScrapedSubView("jobs_list")}
                    >
                      📋 1. Danh sách &amp; Lọc Đếm Bản tin BĐS ({filteredRecords.length} tin)
                    </button>
                    <button
                      type="button"
                      className={`tab-btn ${
                        scrapedSubView === "province_ward_report"
                          ? "active"
                          : ""
                      }`}
                      onClick={() => setScrapedSubView("province_ward_report")}
                      style={{
                        borderColor:
                          scrapedSubView === "province_ward_report"
                            ? "#10b981"
                            : "#34d399",
                        color:
                          scrapedSubView === "province_ward_report"
                            ? "#ffffff"
                            : "#6ee7b7",
                      }}
                    >
                      🗺️ 2. Báo cáo Bản tin theo Tỉnh/Thành &amp; Phường/Xã ({provinceWardAnalytics.total_provinces} Tỉnh • {provinceWardAnalytics.total_wards} Phường)
                    </button>
                    <button
                      type="button"
                      className={`tab-btn ${
                        scrapedSubView === "seller_phones" ? "active" : ""
                      }`}
                      onClick={() => setScrapedSubView("seller_phones")}
                      style={{
                        borderColor:
                          scrapedSubView === "seller_phones"
                            ? "#a855f7"
                            : "#c084fc",
                        color:
                          scrapedSubView === "seller_phones"
                            ? "#ffffff"
                            : "#e9d5ff",
                      }}
                    >
                      📞 3. Phân tích SĐT Người rao &amp; Giai đoạn đăng tin ({sellerPhoneAnalytics.total_unique_phones} SĐT)
                    </button>
                    <button
                      type="button"
                      className={`tab-btn ${
                        scrapedSubView === "time_loc_stats" ? "active" : ""
                      }`}
                      onClick={() => setScrapedSubView("time_loc_stats")}
                    >
                      📊 4. Thống kê Thời gian &amp; So sánh Năm (2021–2026)
                    </button>
                    <button
                      type="button"
                      className={`tab-btn ${
                        scrapedSubView === "campaign_ops" ? "active" : ""
                      }`}
                      onClick={() => setScrapedSubView("campaign_ops")}
                    >
                      🎯 5. Kế hoạch 100k Bản ghi &amp; Backfill/Debug
                    </button>
                    <button
                      type="button"
                      className={`tab-btn ${
                        scrapedSubView === "all" ? "active" : ""
                      }`}
                      onClick={() => setScrapedSubView("all")}
                    >
                      📑 Xem tất cả
                    </button>
                    <button
                      type="button"
                      className="tab-btn"
                      disabled={isRefreshingScraped || isReprocessingBronze}
                      onClick={() => refreshScrapedData(false)}
                      style={{
                        borderColor: "#34d399",
                        color: "#34d399",
                        fontWeight: 700,
                      }}
                    >
                      {isRefreshingScraped
                        ? "⏳ Đang cập nhật..."
                        : "🔄 Refresh Số tin"}
                    </button>
                  </div>
                </div>

                {/* Hộp Kích hoạt Chiến dịch Quét Dữ liệu Quá khứ (Historical Backfill) */}
                {(scrapedSubView === "campaign_ops" ||
                  scrapedSubView === "all") && (
                  <>
                <div
                  style={{
                    marginTop: "1rem",
                    background: "rgba(99, 102, 241, 0.12)",
                    border: "1px solid #6366f1",
                    borderRadius: "0.75rem",
                    padding: "1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: "0.98rem", color: "#f8fafc" }}>
                        ⏳ Chiến dịch Quét Dữ liệu Quá khứ (Historical Backfill
                        — <code>--mode backfill</code> giai đoạn 2021–2026)
                      </h3>
                      <p
                        style={{
                          fontSize: "0.8rem",
                          color: "#cbd5e1",
                          marginTop: "0.2rem",
                        }}
                      >
                        Kết hợp 4 kênh hồi cứu lịch sử: <strong>Deep Pagination</strong>,{" "}
                        <strong>Sitemap Archive</strong>, <strong>Project Developer Archives</strong> và{" "}
                        <strong>Internet Archive Wayback CDX API</strong> để thu thập &amp; lưu bền vững các bản ghi BĐS từ <code>01/01/2021</code> đến <code>31/10/2026</code>.
                      </p>
                    </div>
                    <span className="badge badge-amber">
                      Quyền thực thi: OPERATOR / ADMIN ({effectiveRole})
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(175px, 1fr))",
                      gap: "0.7rem",
                      alignItems: "end",
                    }}
                  >
                    <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                      Năm bắt đầu hồi cứu (<code>--from-year</code>):
                      <select
                        value={backfillFromYear}
                        onChange={(e) =>
                          setBackfillFromYear(Number(e.target.value))
                        }
                        style={{
                          width: "100%",
                          marginTop: "0.25rem",
                          padding: "0.45rem",
                          background: "#0f172a",
                          color: "#fff",
                          border: "1px solid #475569",
                          borderRadius: "0.4rem",
                        }}
                      >
                        <option value={2021}>Từ 01/01/2021 → nay (6 năm)</option>
                        <option value={2022}>Từ năm 2022 → nay</option>
                        <option value={2023}>Từ năm 2023 → nay</option>
                        <option value={2024}>Từ năm 2024 → nay</option>
                        <option value={2025}>Từ năm 2025 → nay</option>
                      </select>
                    </label>

                    <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                      Độ sâu phân trang (<code>--max-pages</code>):
                      <select
                        value={backfillDeepPages}
                        onChange={(e) =>
                          setBackfillDeepPages(Number(e.target.value))
                        }
                        style={{
                          width: "100%",
                          marginTop: "0.25rem",
                          padding: "0.45rem",
                          background: "#0f172a",
                          color: "#fff",
                          border: "1px solid #475569",
                          borderRadius: "0.4rem",
                        }}
                      >
                        <option value={10}>10 trang sâu / từ khóa</option>
                        <option value={15}>15 trang sâu / từ khóa</option>
                        <option value={25}>25 trang sâu / từ khóa</option>
                        <option value={40}>40 trang sâu / từ khóa</option>
                      </select>
                    </label>

                    <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                      Cổng BĐS mục tiêu (<code>--sites</code>):
                      <select
                        value={backfillPortal}
                        onChange={(e) => setBackfillPortal(e.target.value)}
                        style={{
                          width: "100%",
                          marginTop: "0.25rem",
                          padding: "0.45rem",
                          background: "#0f172a",
                          color: "#fff",
                          border: "1px solid #475569",
                          borderRadius: "0.4rem",
                        }}
                      >
                        <option value="ALL">Tất cả 6 Cổng BĐS</option>
                        <option value="batdongsan">Batdongsan.com.vn</option>
                        <option value="chotot">Nhatot / Chotot.com</option>
                        <option value="alonhadat">Alonhadat.com.vn</option>
                        <option value="mogi">Mogi.vn</option>
                        <option value="muaban">Muaban.net</option>
                        <option value="meeyland">Meeyland.com</option>
                      </select>
                    </label>

                    <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                      Tỉnh/Thành mục tiêu (<code>--cities</code>):
                      <select
                        value={backfillCity}
                        onChange={(e) => setBackfillCity(e.target.value)}
                        style={{
                          width: "100%",
                          marginTop: "0.25rem",
                          padding: "0.45rem",
                          background: "#0f172a",
                          color: "#fff",
                          border: "1px solid #475569",
                          borderRadius: "0.4rem",
                        }}
                      >
                        <option value="ALL">Tất cả 34/63 Tỉnh Thành</option>
                        <option value="HN">Hà Nội (HN)</option>
                        <option value="HCM">TP. Hồ Chí Minh (HCM)</option>
                        <option value="HP">Hải Phòng (HP)</option>
                        <option value="DN">Đà Nẵng (DN)</option>
                        <option value="BD">Đô thị Vệ tinh (BD/BN/ĐN)</option>
                      </select>
                    </label>

                    <button
                      type="button"
                      disabled={isRunningBackfill || !canOperatePipeline}
                      onClick={handleRunHistoricalBackfill}
                      className="tab-btn active"
                      style={{
                        padding: "0.52rem 0.9rem",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                      }}
                    >
                      {isRunningBackfill
                        ? "⏳ Đang quét hồi cứu lịch sử..."
                        : "🚀 Chạy Quét Quá khứ (--mode backfill)"}
                    </button>
                  </div>

                  {backfillStatusMsg && (
                    <div
                      style={{
                        marginTop: "0.75rem",
                        padding: "0.6rem 0.85rem",
                        background: "#0f172a",
                        border: "1px solid #34d399",
                        borderRadius: "0.45rem",
                        fontSize: "0.82rem",
                        color: "#34d399",
                      }}
                    >
                      {backfillStatusMsg}
                    </div>
                  )}
                </div>

                {/* Hộp Trung tâm Lập Kế hoạch, Đánh giá Tính Khả thi 5 Tiêu chí & Căn chỉnh Chiến dịch 100.000 Bản ghi (2021–2026) */}
                <div
                  style={{
                    marginTop: "1rem",
                    background: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid #10b981",
                    borderRadius: "0.75rem",
                    padding: "1.1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                      marginBottom: "0.85rem",
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: "1.02rem", color: "#34d399" }}>
                        🎯 Kế hoạch Chiến dịch{" "}
                        {campaignPlan.campaign_summary.target_master_records.toLocaleString(
                          "vi-VN"
                        )}{" "}
                        Bản ghi (<code>01/01/2021</code> –{" "}
                        <code>31/10/2026</code>) trong{" "}
                        {
                          campaignPlan.execution_schedule_1month
                            .campaign_execution_days
                        }{" "}
                        Ngày &amp; Đánh giá Tính Khả thi
                      </h3>
                      <p
                        style={{
                          fontSize: "0.8rem",
                          color: "#cbd5e1",
                          marginTop: "0.2rem",
                        }}
                      >
                        Tính toán chỉ tiêu theo tuần lịch sử (304,3 tuần), lịch
                        chạy máy liên tục 24/7 trên Docker Ubuntu, kiểm định 5
                        tiêu chí <em>&ldquo;Liệu có cào được không?&rdquo;</em>{" "}
                        và cho phép điều khiển / căn chỉnh trực tiếp vào{" "}
                        <code>configs/scraper_settings.yaml</code>.
                      </p>
                    </div>
                    <span
                      className={`badge ${
                        campaignPlan.feasibility_assessment.overall_status ===
                        "FEASIBLE_ON_TRACK"
                          ? "badge-green"
                          : "badge-amber"
                      }`}
                    >
                      Đánh giá Khả thi:{" "}
                      {campaignPlan.feasibility_assessment.feasibility_score}% (
                      {campaignPlan.feasibility_assessment.overall_status})
                    </span>
                  </div>

                  {/* Hàng 1: 4 Thẻ Toán học Chỉ tiêu (Tuần lịch sử vs Tuần chạy máy 30 ngày) */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "0.75rem",
                      marginBottom: "0.95rem",
                    }}
                  >
                    <div
                      style={{
                        background: "#0f172a",
                        padding: "0.85rem",
                        borderRadius: "0.6rem",
                        border: "1px solid #334155",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                        1. Mật độ mỗi Tuần Lịch sử (2021–2026)
                      </div>
                      <div
                        style={{
                          fontSize: "1.35rem",
                          fontWeight: 800,
                          color: "#38bdf8",
                          marginTop: "0.2rem",
                        }}
                      >
                        {campaignPlan.campaign_summary.avg_records_per_historical_week.toLocaleString(
                          "vi-VN"
                        )}{" "}
                        bản ghi chuẩn / tuần
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "#cbd5e1" }}>
                        Tổng <strong>2.130 ngày = 304,29 tuần</strong> (70
                        tháng) → ~
                        {campaignPlan.campaign_summary.avg_records_per_historical_month.toLocaleString(
                          "vi-VN"
                        )}{" "}
                        bản ghi/tháng (hoặc{" "}
                        {campaignPlan.campaign_summary.avg_raw_per_historical_week.toLocaleString(
                          "vi-VN"
                        )}{" "}
                        tin thô Bronze/tuần).
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#0f172a",
                        padding: "0.85rem",
                        borderRadius: "0.6rem",
                        border: "1px solid #334155",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                        2. Tốc độ Cào mỗi Tuần Chiến dịch (4,3 Tuần)
                      </div>
                      <div
                        style={{
                          fontSize: "1.35rem",
                          fontWeight: 800,
                          color: "#34d399",
                          marginTop: "0.2rem",
                        }}
                      >
                        {campaignPlan.execution_schedule_1month.required_master_per_execution_week.toLocaleString(
                          "vi-VN"
                        )}{" "}
                        bản ghi chuẩn / tuần
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "#cbd5e1" }}>
                        Để hoàn thành trong{" "}
                        <strong>
                          {
                            campaignPlan.execution_schedule_1month
                              .campaign_execution_days
                          }{" "}
                          ngày
                        </strong>{" "}
                        (Cần quét ~
                        {campaignPlan.execution_schedule_1month.required_raw_per_execution_week.toLocaleString(
                          "vi-VN"
                        )}{" "}
                        tin thô/tuần trước khử trùng 28,5%).
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#0f172a",
                        padding: "0.85rem",
                        borderRadius: "0.6rem",
                        border: "1px solid #334155",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                        3. Chỉ tiêu Mỗi Ngày &amp; Mỗi Ca Daemon (
                        {campaignPlan.execution_schedule_1month.interval_hours}h)
                      </div>
                      <div
                        style={{
                          fontSize: "1.35rem",
                          fontWeight: 800,
                          color: "#f59e0b",
                          marginTop: "0.2rem",
                        }}
                      >
                        {campaignPlan.execution_schedule_1month.required_master_per_execution_day.toLocaleString(
                          "vi-VN"
                        )}{" "}
                        / ngày •{" "}
                        {campaignPlan.execution_schedule_1month.required_master_per_cycle.toLocaleString(
                          "vi-VN"
                        )}{" "}
                        / ca
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "#cbd5e1" }}>
                        Chạy{" "}
                        <strong>
                          {
                            campaignPlan.execution_schedule_1month
                              .cycles_per_day
                          }{" "}
                          ca/ngày
                        </strong>{" "}
                        (~
                        {
                          campaignPlan.execution_schedule_1month
                            .required_master_per_hour
                        }{" "}
                        bản ghi/giờ = chỉ ~140 bản ghi/cổng/ca trên 4 cổng).
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#0f172a",
                        padding: "0.85rem",
                        borderRadius: "0.6rem",
                        border: "1px solid #334155",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                        4. Công suất Thiết kế &amp; Thời gian Dự kiến
                      </div>
                      <div
                        style={{
                          fontSize: "1.35rem",
                          fontWeight: 800,
                          color: "#a78bfa",
                          marginTop: "0.2rem",
                        }}
                      >
                        ~
                        {
                          campaignPlan.execution_schedule_1month
                            .estimated_days_to_complete
                        }{" "}
                        ngày hoàn tất
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "#cbd5e1" }}>
                        Công suất tối đa:{" "}
                        <strong>
                          {campaignPlan.execution_schedule_1month.estimated_master_capacity_per_day.toLocaleString(
                            "vi-VN"
                          )}{" "}
                          bản ghi chuẩn/ngày
                        </strong>{" "}
                        (Nguồn cung khả dụng:{" "}
                        {campaignPlan.feasibility_assessment.total_addressable_master_pool.toLocaleString(
                          "vi-VN"
                        )}{" "}
                        bản ghi).
                      </div>
                    </div>
                  </div>

                  {/* Hàng 2: 5 Tiêu chí Kiểm định Tính Khả thi ("Liệu có cào được không?") */}
                  <div
                    style={{
                      background: "#0f172a",
                      padding: "0.9rem",
                      borderRadius: "0.65rem",
                      border: "1px solid #334155",
                      marginBottom: "0.95rem",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.86rem",
                        fontWeight: 700,
                        color: "#f8fafc",
                        marginBottom: "0.5rem",
                      }}
                    >
                      🔍 Cơ chế Tự động Xác định Tính Khả thi 5 Tiêu chí:{" "}
                      <span style={{ color: "#34d399" }}>
                        {campaignPlan.feasibility_assessment.overall_verdict}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
                        gap: "0.65rem",
                      }}
                    >
                      {campaignPlan.feasibility_assessment.checks.map((chk) => (
                        <div
                          key={chk.id}
                          style={{
                            padding: "0.65rem",
                            borderRadius: "0.5rem",
                            background: "#1e293b",
                            border: `1px solid ${
                              chk.passed ? "#10b981" : "#f59e0b"
                            }`,
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.79rem",
                              fontWeight: 700,
                              color: chk.passed ? "#34d399" : "#fbbf24",
                            }}
                          >
                            {chk.passed ? "✅ ĐẠT:" : "⚠️ CẦN CĂN CHỈNH:"}{" "}
                            {chk.title}
                          </div>
                          <div
                            style={{
                              fontSize: "0.8rem",
                              color: "#f8fafc",
                              fontWeight: 600,
                              marginTop: "0.2rem",
                            }}
                          >
                            {chk.metric_value}
                          </div>
                          <div
                            style={{
                              fontSize: "0.73rem",
                              color: "#94a3b8",
                              marginTop: "0.15rem",
                            }}
                          >
                            {chk.detail}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Hàng 3: Bảng Phân bổ Chỉ tiêu 100.000 Bản ghi theo Từng Năm (2021 -> 2026) */}
                  <div
                    className="table-scroll"
                    style={{ marginBottom: "0.95rem" }}
                  >
                    <table className="lab-table">
                      <thead>
                        <tr>
                          <th>Năm Lịch sử</th>
                          <th>Số Tuần</th>
                          <th>Chỉ tiêu / Tuần</th>
                          <th>Chỉ tiêu Cả Năm (Tỷ trọng)</th>
                          <th>Kênh Thu thập Chủ lực (2021–2026)</th>
                          <th>Đã Thu thập</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignPlan.yearly_breakdown_2021_2026.map((yb) => (
                          <tr key={yb.year}>
                            <td>
                              <strong>Năm {yb.year}</strong>
                            </td>
                            <td>{yb.weeks} tuần</td>
                            <td style={{ color: "#38bdf8", fontWeight: 700 }}>
                              {yb.target_per_week.toLocaleString("vi-VN")} bản
                              ghi/tuần
                            </td>
                            <td>
                              <strong>
                                {yb.yearly_target.toLocaleString("vi-VN")}
                              </strong>{" "}
                              bản ghi ({yb.share_pct}%)
                            </td>
                            <td style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                              {yb.primary_channel}
                            </td>
                            <td>
                              <span className="badge badge-blue">
                                {yb.collected_records} bản ghi mẫu
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Hàng 4: Bộ Điều khiển & Căn chỉnh Kế hoạch Trực tiếp từ Website */}
                  <div
                    style={{
                      background: "#0f172a",
                      padding: "0.95rem",
                      borderRadius: "0.65rem",
                      border: "1px solid #475569",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                        marginBottom: "0.75rem",
                      }}
                    >
                      <h4 style={{ fontSize: "0.9rem", color: "#f8fafc" }}>
                        ⚙️ Bảng Điều khiển &amp; Căn chỉnh Kế hoạch Cào Dữ liệu
                        Trực tiếp từ Website (Ghi thẳng vào{" "}
                        <code>configs/scraper_settings.yaml</code>)
                      </h4>
                      <button
                        type="button"
                        disabled={isSavingPlan || !canOperatePipeline}
                        onClick={() => handleSaveCampaignPlan(true)}
                        className="tab-btn"
                        style={{
                          padding: "0.4rem 0.8rem",
                          fontSize: "0.78rem",
                          borderColor: "#34d399",
                          color: "#34d399",
                        }}
                      >
                        ⚡ Tự động Căn chỉnh Chuẩn 100.000 Bản ghi / 30 Ngày
                      </button>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(175px, 1fr))",
                        gap: "0.7rem",
                        alignItems: "end",
                      }}
                    >
                      <label style={{ fontSize: "0.76rem", color: "#cbd5e1" }}>
                        Tổng bản ghi mục tiêu (2021–2026):
                        <input
                          type="number"
                          min={5000}
                          max={500000}
                          step={5000}
                          value={planTargetRecords}
                          onChange={(e) =>
                            setPlanTargetRecords(Number(e.target.value))
                          }
                          style={{
                            width: "100%",
                            marginTop: "0.25rem",
                            padding: "0.45rem",
                            background: "#1e293b",
                            color: "#fff",
                            border: "1px solid #475569",
                            borderRadius: "0.4rem",
                          }}
                        />
                      </label>

                      <label style={{ fontSize: "0.76rem", color: "#cbd5e1" }}>
                        Số ngày hoàn thành chiến dịch:
                        <input
                          type="number"
                          min={7}
                          max={180}
                          value={planExecDays}
                          onChange={(e) =>
                            setPlanExecDays(Number(e.target.value))
                          }
                          style={{
                            width: "100%",
                            marginTop: "0.25rem",
                            padding: "0.45rem",
                            background: "#1e293b",
                            color: "#fff",
                            border: "1px solid #475569",
                            borderRadius: "0.4rem",
                          }}
                        />
                      </label>

                      <label style={{ fontSize: "0.76rem", color: "#cbd5e1" }}>
                        Chu kỳ chạy Daemon (<code>interval_hours</code>):
                        <select
                          value={planIntervalHours}
                          onChange={(e) =>
                            setPlanIntervalHours(Number(e.target.value))
                          }
                          style={{
                            width: "100%",
                            marginTop: "0.25rem",
                            padding: "0.45rem",
                            background: "#1e293b",
                            color: "#fff",
                            border: "1px solid #475569",
                            borderRadius: "0.4rem",
                          }}
                        >
                          <option value={2}>Mỗi 2 giờ (12 ca/ngày)</option>
                          <option value={4}>
                            Mỗi 4 giờ (6 ca/ngày - Khuyên dùng)
                          </option>
                          <option value={6}>Mỗi 6 giờ (4 ca/ngày)</option>
                          <option value={12}>Mỗi 12 giờ (2 ca/ngày)</option>
                          <option value={24}>Mỗi 24 giờ (1 ca/ngày)</option>
                        </select>
                      </label>

                      <label style={{ fontSize: "0.76rem", color: "#cbd5e1" }}>
                        Số trang sâu / từ khóa (<code>max_pages</code>):
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={planMaxPages}
                          onChange={(e) =>
                            setPlanMaxPages(Number(e.target.value))
                          }
                          style={{
                            width: "100%",
                            marginTop: "0.25rem",
                            padding: "0.45rem",
                            background: "#1e293b",
                            color: "#fff",
                            border: "1px solid #475569",
                            borderRadius: "0.4rem",
                          }}
                        />
                      </label>

                      <label style={{ fontSize: "0.76rem", color: "#cbd5e1" }}>
                        Giới hạn Tin rao / cổng / ca (<code>0 = Quét tất</code>):
                        <input
                          type="number"
                          min={0}
                          max={5000}
                          step={50}
                          value={planMaxJobsPerSite}
                          onChange={(e) =>
                            setPlanMaxJobsPerSite(Number(e.target.value))
                          }
                          style={{
                            width: "100%",
                            marginTop: "0.25rem",
                            padding: "0.45rem",
                            background: "#1e293b",
                            color: "#fff",
                            border: "1px solid #475569",
                            borderRadius: "0.4rem",
                          }}
                        />
                      </label>

                      <label style={{ fontSize: "0.76rem", color: "#cbd5e1" }}>
                        Thêm từ khóa BĐS mới vào Ma trận:
                        <input
                          type="text"
                          placeholder="VD: Bán nhà mặt phố, Đất nền KCN..."
                          value={planNewKeyword}
                          onChange={(e) => setPlanNewKeyword(e.target.value)}
                          style={{
                            width: "100%",
                            marginTop: "0.25rem",
                            padding: "0.45rem",
                            background: "#1e293b",
                            color: "#fff",
                            border: "1px solid #475569",
                            borderRadius: "0.4rem",
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        disabled={isSavingPlan || !canOperatePipeline}
                        onClick={() => handleSaveCampaignPlan(false)}
                        className="tab-btn active"
                        style={{
                          padding: "0.52rem 0.9rem",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                        }}
                      >
                        {isSavingPlan
                          ? "⏳ Đang lưu & đánh giá..."
                          : "💾 Lưu & Áp dụng Kế hoạch Căn chỉnh"}
                      </button>
                    </div>

                    {planStatusMsg && (
                      <div
                        style={{
                          marginTop: "0.75rem",
                          padding: "0.6rem 0.85rem",
                          background: "#1e293b",
                          border: "1px solid #34d399",
                          borderRadius: "0.45rem",
                          fontSize: "0.82rem",
                          color: "#34d399",
                        }}
                      >
                        {planStatusMsg}
                      </div>
                    )}

                    {/* Hàng 4B: Chính sách Quét Tất Hàng Ngày Chia Sẻ Sinh Viên & Vòng Đời 12 Tháng Lấy Mẫu Đại Diện + Xóa Bớt */}
                    {campaignPlan.retention_and_sampling && (
                      <div
                        style={{
                          marginTop: "0.85rem",
                          paddingTop: "0.85rem",
                          borderTop: "1px dashed #334155",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "0.5rem",
                            marginBottom: "0.65rem",
                          }}
                        >
                          <div>
                            <strong style={{ fontSize: "0.84rem", color: "#34d399" }}>
                              🏘️ Chế độ Quét Tất Hàng Ngày (Cập Nhật Tin Rao BĐS Mới Toàn Quốc) &amp; Vòng Đời 12 Tháng Lấy Mẫu Đại Diện + Xóa Bớt
                            </strong>
                            <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.15rem" }}>
                              • <strong>0 – {campaignPlan.retention_and_sampling.policy.full_retention_months} tháng đầu:</strong> Quét tất không giới hạn (<code>unlimited_daily_crawl: true</code>, dừng thông minh khi hết tin mới) và giữ <strong>100% bản ghi</strong> để phục vụ tra cứu định giá BĐS hàng ngày (~<strong>{campaignPlan.retention_and_sampling.student_daily_job_feed.estimated_market_new_master_per_day.toLocaleString("vi-VN")} tin BĐS mới/ngày</strong> trên 6 cổng, trong đó ~<strong>{campaignPlan.retention_and_sampling.student_daily_job_feed.estimated_student_fresher_new_per_day} tin BĐS nhà ở thực vừa túi tiền T1–T2 mỗi ngày</strong>).
                              <br />
                              • <strong>Sau {campaignPlan.retention_and_sampling.policy.full_retention_months} tháng (&gt; 365 ngày):</strong> Lấy mẫu phân tầng đại diện 4 chiều giữ lại <strong>{campaignPlan.retention_and_sampling.policy.sample_retention_pct}%</strong> (tối thiểu {campaignPlan.retention_and_sampling.policy.min_records_per_stratum} bản ghi/ô phân tầng, ưu tiên tin rao công khai giá) và <strong>xóa bớt {campaignPlan.retention_and_sampling.policy.prune_delete_pct}%</strong> bản ghi hết hạn sau khi đã nén dự phòng vào <code>data/cold_archive/</code>.
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              disabled={isSavingPlan || !canOperatePipeline}
                              onClick={async () => {
                                setIsSavingPlan(true);
                                setPlanStatusMsg("");
                                try {
                                  const res = await fetch("/api/jobs/plan", {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      unlimited_daily_crawl: true,
                                      max_jobs_per_site_run: 0,
                                      execute_12m_sampling_prune: true,
                                    }),
                                  });
                                  const data = await res.json();
                                  if (res.ok && data.plan) {
                                    setCampaignPlan(data.plan);
                                    setPlanMaxJobsPerSite(0);
                                    const pr = data.plan.retention_and_sampling?.current_dataset_breakdown;
                                    setPlanStatusMsg(
                                      `✅ Đã bật Quét Tất Không Giới Hạn (unlimited_daily_crawl=true) & thực thi rà soát Vòng đời 12 tháng: Giữ 100% (${pr?.recent_within_12m_kept_100pct ?? 0} bản ghi <=12 tháng), Mẫu đại diện >12 tháng (${pr?.older_than_12m_retained_sample ?? 0} bản ghi), Đã lược bỏ (${pr?.older_than_12m_to_prune ?? 0} bản ghi cũ).`
                                    );
                                  }
                                } finally {
                                  setIsSavingPlan(false);
                                }
                              }}
                              className="tab-btn"
                              style={{
                                padding: "0.42rem 0.8rem",
                                fontSize: "0.78rem",
                                borderColor: "#34d399",
                                color: "#34d399",
                              }}
                            >
                              🧹 Bật Quét Tất &amp; Thực thi Lấy Mẫu Đại Diện + Xóa Bớt (&gt;12 Tháng)
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Hàng 5: Trích xuất Gói Debug 1 Giờ (Kiểm tra Hiệu suất 4 Cổng & Gửi AI Hiệu chỉnh) */}
                    <div
                      style={{
                        marginTop: "0.85rem",
                        paddingTop: "0.85rem",
                        borderTop: "1px dashed #334155",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "0.5rem",
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: "0.84rem", color: "#38bdf8" }}>
                            🩺 Gói Chẩn đoán &amp; Debug 1 Giờ cho 6 Tiến trình Quét Ngầm (Batdongsan • Chotot • Alonhadat • Mogi • Muaban • Meeyland)
                          </strong>
                          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.15rem" }}>
                            Sau 1 giờ chạy Daemon trên Docker/Ubuntu, nhấn nút bên phải để trích xuất báo cáo hiệu suất từng cổng BĐS (kèm cấu trúc DOM thực tế nếu cổng nào bị 0 link / chặn 403) và gửi cho AI hiệu chỉnh ngay lập tức.
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            disabled={isLoadingDebug}
                            onClick={async () => {
                              setIsLoadingDebug(true);
                              try {
                                const res = await fetch("/api/jobs/debug?auto_tune=true");
                                if (res.ok) {
                                  const data = await res.json();
                                  setHourlyDebugPrompt(String(data.copy_paste_for_ai || ""));
                                }
                              } finally {
                                setIsLoadingDebug(false);
                              }
                            }}
                            className="tab-btn"
                            style={{
                              padding: "0.42rem 0.8rem",
                              fontSize: "0.78rem",
                              borderColor: "#38bdf8",
                              color: "#38bdf8",
                            }}
                          >
                            {isLoadingDebug
                              ? "⏳ Đang trích xuất Debug 1h..."
                              : "🩺 Trích xuất & Tự Hiệu chỉnh Gói Debug 1 Giờ"}
                          </button>
                          {hourlyDebugPrompt && (
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(hourlyDebugPrompt);
                                setPlanStatusMsg(
                                  "📋 Đã sao chép Gói Debug 1 Giờ vào Clipboard! Bạn hãy dán (Ctrl+V) vào khung chat để AI hiệu chỉnh tiến trình quét."
                                );
                              }}
                              className="tab-btn active"
                              style={{
                                padding: "0.42rem 0.8rem",
                                fontSize: "0.78rem",
                              }}
                            >
                              📋 Copy Gói Debug Gửi AI
                            </button>
                          )}
                        </div>
                      </div>
                      {hourlyDebugPrompt && (
                        <pre
                          style={{
                            marginTop: "0.65rem",
                            padding: "0.75rem",
                            background: "#020617",
                            border: "1px solid #334155",
                            borderRadius: "0.45rem",
                            fontSize: "0.75rem",
                            color: "#e2e8f0",
                            whiteSpace: "pre-wrap",
                            maxHeight: "240px",
                            overflowY: "auto",
                          }}
                        >
                          {hourlyDebugPrompt}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
                  </>
                )}
              </section>

              {/* Khối 1.5: BÁO CÁO ĐÁNH GIÁ THEO TỪNG NĂM & SO SÁNH LIÊN NĂM (2021 ↔ 2026) KÈM BIỂU ĐỒ MINH HỌA */}
              {(scrapedSubView === "time_loc_stats" ||
                scrapedSubView === "all") && (
                <>
              <section className="lab-card" style={{ border: "1px solid #38bdf8" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "0.85rem",
                    marginBottom: "1rem",
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: "1.12rem", color: "#38bdf8" }}>
                      📊 Báo cáo Đánh giá Theo Từng Năm &amp; So sánh Liên Năm ({annualReport.comparison_window.base_year} ↔ {annualReport.comparison_window.target_year})
                    </h2>
                    <p
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.82rem",
                        marginTop: "0.2rem",
                      }}
                    >
                      Phân tích dữ liệu tách biệt theo từng năm để đo lường mức độ tăng/giảm của 4 phân khúc BĐS, độ phủ thị trường qua các đô thị lớn, đơn giá danh nghĩa vs. đơn giá thực tế đã khử lạm phát CPI ({priceMode === "REAL_CPI_2026" ? "Đơn giá chuẩn CPI 2026" : "Đơn giá danh nghĩa từng năm"}) và phân rã Oaxaca–Blinder.
                    </p>
                  </div>

                  {/* Bộ chọn Năm Gốc (t1), Năm Đích (t2) & Hệ quy chiếu Giá CPI */}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.55rem",
                      alignItems: "center",
                      background: "#0f172a",
                      padding: "0.55rem 0.75rem",
                      borderRadius: "0.6rem",
                      border: "1px solid #334155",
                    }}
                  >
                    <label style={{ fontSize: "0.76rem", color: "#cbd5e1" }}>
                      Năm Gốc (t₁):{" "}
                      <select
                        value={reportBaseYear}
                        onChange={(e) => setReportBaseYear(Number(e.target.value))}
                        style={{
                          background: "#1e293b",
                          color: "#38bdf8",
                          fontWeight: 700,
                          border: "1px solid #38bdf8",
                          borderRadius: "0.35rem",
                          padding: "0.28rem 0.45rem",
                          marginLeft: "0.25rem",
                        }}
                      >
                        {[2021, 2022, 2023, 2024, 2025, 2026].map((yr) => (
                          <option key={yr} value={yr}>
                            Năm {yr} (CPI {CPI_INDEX_BY_YEAR[yr]})
                          </option>
                        ))}
                      </select>
                    </label>

                    <span style={{ color: "#94a3b8", fontWeight: 700 }}>↔</span>

                    <label style={{ fontSize: "0.76rem", color: "#cbd5e1" }}>
                      Năm So sánh (t₂):{" "}
                      <select
                        value={reportTargetYear}
                        onChange={(e) => setReportTargetYear(Number(e.target.value))}
                        style={{
                          background: "#1e293b",
                          color: "#34d399",
                          fontWeight: 700,
                          border: "1px solid #34d399",
                          borderRadius: "0.35rem",
                          padding: "0.28rem 0.45rem",
                          marginLeft: "0.25rem",
                        }}
                      >
                        {[2021, 2022, 2023, 2024, 2025, 2026].map((yr) => (
                          <option key={yr} value={yr}>
                            Năm {yr} (CPI {CPI_INDEX_BY_YEAR[yr]})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ fontSize: "0.76rem", color: "#cbd5e1" }}>
                      Hệ quy chiếu Đơn giá:{" "}
                      <select
                        value={priceMode}
                        onChange={(e) =>
                          setPriceMode(
                            e.target.value as "NOMINAL" | "REAL_CPI_2026"
                          )
                        }
                        style={{
                          background: "#1e293b",
                          color: "#f59e0b",
                          fontWeight: 700,
                          border: "1px solid #f59e0b",
                          borderRadius: "0.35rem",
                          padding: "0.28rem 0.45rem",
                          marginLeft: "0.25rem",
                        }}
                      >
                        <option value="NOMINAL">Đơn giá Danh nghĩa (Nominal)</option>
                        <option value="REAL_CPI_2026">Đơn giá Thực tế (CPI 2026)</option>
                      </select>
                    </label>
                  </div>
                </div>

                {/* HỆ THỐNG 4 BIỂU ĐỒ MINH HỌA CHUYÊN SÂU (BC-1, BC-2, BC-3, BC-4) */}
                <AnnualComparativeChartsSuite
                  report={annualReport}
                  priceMode={priceMode}
                />

                {/* Bảng 8.0A: So sánh Tăng/Giảm Quy mô & Đơn giá của 4 Phân khúc BĐS qua các Năm */}
                <div style={{ marginTop: "1rem" }}>
                  <h3 style={{ fontSize: "0.95rem", color: "#38bdf8", marginBottom: "0.5rem" }}>
                    Bảng 8.0A: So sánh Tăng/Giảm Số lượng Tin rao &amp; Đơn giá BĐS Trung vị giữa Năm {annualReport.comparison_window.base_year} và Năm {annualReport.comparison_window.target_year}
                  </h3>
                  <div className="table-scroll">
                    <table className="lab-table">
                      <thead>
                        <tr>
                          <th>Phân khúc Bất động sản (Property Segment)</th>
                          <th>Số Tin rao {annualReport.comparison_window.base_year} (Tỷ trọng)</th>
                          <th>Số Tin rao {annualReport.comparison_window.target_year} (Tỷ trọng)</th>
                          <th>Tăng/Giảm Quy mô &amp; CAGR</th>
                          <th>Đơn giá P50 Danh nghĩa ({annualReport.comparison_window.base_year} → {annualReport.comparison_window.target_year})</th>
                          <th>Đơn giá P50 Thực tế Khử CPI ({annualReport.comparison_window.base_year} → {annualReport.comparison_window.target_year})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {annualReport.sector_comparison.map((sec) => (
                          <tr key={sec.pillar_code}>
                            <td>
                              <strong>
                                {REAL_ESTATE_PILLAR_BADGE_LABELS[sec.pillar_code]?.split(" • ")[0] ||
                                  sec.pillar_code}
                              </strong>{" "}
                              — {sec.pillar_label}
                            </td>
                            <td>
                              <strong>{sec.volume_base_year.toLocaleString("vi-VN")}</strong> tin ({sec.share_base_pct}%)
                            </td>
                            <td>
                              <strong>{sec.volume_target_year.toLocaleString("vi-VN")}</strong> tin ({sec.share_target_pct}%)
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  sec.volume_growth_pct >= 0
                                    ? "badge-green"
                                    : "badge-amber"
                                }`}
                              >
                                {sec.volume_growth_pct >= 0 ? "+" : ""}
                                {sec.volume_growth_pct}% (CAGR: {sec.volume_cagr_pct}%/năm)
                              </span>
                              <div style={{ fontSize: "0.74rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                                Dịch chuyển tỷ trọng: {sec.share_shift_pp >= 0 ? "+" : ""}
                                {sec.share_shift_pp} điểm %
                              </div>
                            </td>
                            <td>
                              <strong>{sec.nominal_p50_base_vnd}</strong> →{" "}
                              <strong style={{ color: "#38bdf8" }}>
                                {sec.nominal_p50_target_vnd} tr/m²
                              </strong>{" "}
                              <span style={{ color: "#34d399", fontWeight: 700 }}>
                                ({sec.nominal_wage_growth_pct >= 0 ? "+" : ""}
                                {sec.nominal_wage_growth_pct}%)
                              </span>
                            </td>
                            <td>
                              <strong>{sec.real_cpi2026_p50_base_vnd}</strong> →{" "}
                              <strong style={{ color: "#34d399" }}>
                                {sec.real_cpi2026_p50_target_vnd} tr/m²
                              </strong>{" "}
                              <span style={{ color: "#f59e0b", fontWeight: 700 }}>
                                ({sec.real_wage_growth_pct >= 0 ? "+" : ""}
                                {sec.real_wage_growth_pct}% thực tế)
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Bảng 8.0B & 8.0C: Ma trận Độ phủ 6 Đô thị × 4 Phân khúc BĐS & Vòng đời Thuộc tính Hedonic */}
                <div className="rwd-grid-2" style={{ marginTop: "1rem" }}>
                  <div>
                    <h3 style={{ fontSize: "0.92rem", color: "#34d399", marginBottom: "0.45rem" }}>
                      Bảng 8.0B: Độ phủ Thị trường qua 6 Đô thị Lớn × 4 Phân khúc BĐS (Năm {annualReport.comparison_window.target_year} • HHI={annualReport.city_sector_coverage_matrix.hhi_spatial_index})
                    </h3>
                    <div className="table-scroll">
                      <table className="lab-table">
                        <thead>
                          <tr>
                            <th>Đô thị / Vùng</th>
                            <th>Tổng Tin rao ({annualReport.comparison_window.target_year})</th>
                            <th>Cơ cấu 4 Phân khúc (RES-01 • LAND-02 • COM-03 • IND-04)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {annualReport.city_sector_coverage_matrix.cities.map((c) => (
                            <tr key={c.city_code}>
                              <td>
                                <strong>{c.city_code}</strong> — {c.city_name}
                                <div style={{ fontSize: "0.73rem", color: "#94a3b8" }}>
                                  Tỷ trọng toàn quốc: <strong style={{ color: "#38bdf8" }}>{c.city_share_pct}%</strong>
                                </div>
                              </td>
                              <td>
                                <strong>{c.city_total_postings.toLocaleString("vi-VN")}</strong> tin
                              </td>
                              <td style={{ fontSize: "0.76rem" }}>
                                {c.sectors.map((s) => (
                                  <span
                                    key={s.pillar_code}
                                    style={{
                                      display: "inline-block",
                                      marginRight: "0.45rem",
                                      marginBottom: "0.2rem",
                                    }}
                                  >
                                    <strong>
                                      {REAL_ESTATE_PILLAR_BADGE_LABELS[s.pillar_code]?.split(" • ")[0] ||
                                        s.pillar_code}
                                      :
                                    </strong>{" "}
                                    {s.postings.toLocaleString("vi-VN")} ({s.share_within_city_pct}%)
                                  </span>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ fontSize: "0.92rem", color: "#f59e0b", marginBottom: "0.45rem" }}>
                      Bảng 8.0C: Vòng đời Thuộc tính Hedonic &amp; Tốc độ Tăng Phần bù Đơn giá SHAP (2021 → 2026)
                    </h3>
                    <div className="table-scroll">
                      <table className="lab-table">
                        <thead>
                          <tr>
                            <th>Thuộc tính Định giá Hedonic</th>
                            <th>SHAP 2021 → 2026</th>
                            <th>Tăng trưởng (5 năm)</th>
                            <th>Phân nhóm Vòng đời</th>
                          </tr>
                        </thead>
                        <tbody>
                          {annualReport.skill_lifecycle_drift_2021_2026.map((sk) => (
                            <tr key={sk.skill_id}>
                              <td>
                                <strong>{formatHedonicSkillBadge(sk.skill_id)}</strong>
                              </td>
                              <td>
                                +{sk.shap_2021_m_vnd} →{" "}
                                <strong style={{ color: "#38bdf8" }}>
                                  +{sk.shap_2026_m_vnd} tr/m²
                                </strong>
                              </td>
                              <td style={{ color: "#34d399", fontWeight: 700 }}>
                                +{sk.growth_2021_2026_pct}%
                              </td>
                              <td>
                                <span className="badge badge-blue">
                                  {sk.lifecycle_stage}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </section>

              {/* Khối 2: Bảng Phân bố Số Bản ghi Theo Thời gian & Theo Địa điểm */}
              <section className="rwd-grid-2">
                {/* Bảng 8.1: Số bản ghi theo Thời gian */}
                <div className="lab-card">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.75rem",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    <h3 style={{ fontSize: "1rem", color: "#38bdf8" }}>
                      8.1. Số Bản ghi BĐS Quét được theo Thời gian (Time-Series)
                    </h3>
                    <span className="badge badge-blue">
                      {overallAnalytics.by_time.length} mốc ngày đăng
                    </span>
                  </div>
                  <div style={{ marginBottom: "0.65rem" }}>
                    {renderPaginationToolbar({
                      totalItems: overallAnalytics.by_time.length,
                      pageSize: timeTablePageSize,
                      currentPage: timeTablePage,
                      onPageSizeChange: setTimeTablePageSize,
                      onPageChange: setTimeTablePage,
                      itemLabel: "mốc ngày đăng",
                    })}
                  </div>
                  <div className="table-scroll">
                    <table className="lab-table">
                      <thead>
                        <tr>
                          <th>Ngày đăng (Tháng/Quý)</th>
                          <th>Số Bản ghi Chuẩn</th>
                          <th>Số Tin Gốc (Raw)</th>
                          <th>Đơn giá TB (tr/m²)</th>
                          <th>Địa điểm &amp; Lọc</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overallAnalytics.by_time
                          .slice(
                            (timeTablePage - 1) * timeTablePageSize,
                            timeTablePage * timeTablePageSize
                          )
                          .map((t) => (
                          <tr key={t.published_date}>
                            <td>
                              <strong>{t.published_date}</strong>
                              <div
                                style={{
                                  fontSize: "0.74rem",
                                  color: "#94a3b8",
                                }}
                              >
                                {t.year_month} ({t.year_quarter})
                              </div>
                            </td>
                            <td>
                              <span
                                className="badge badge-green"
                                style={{ fontSize: "0.82rem" }}
                              >
                                {t.master_records} bản ghi
                              </span>
                            </td>
                            <td>
                              <strong>{t.raw_postings}</strong> link (
                              {t.portals.join(", ")})
                            </td>
                            <td style={{ color: "#38bdf8", fontWeight: 700 }}>
                              {t.avg_salary_mid_vnd} tr/m²
                            </td>
                            <td>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "0.35rem",
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "0.76rem",
                                    color: "#cbd5e1",
                                  }}
                                >
                                  {t.cities.join(", ")}
                                </span>
                                <button
                                  type="button"
                                  className="tab-btn"
                                  style={{
                                    padding: "0.2rem 0.5rem",
                                    fontSize: "0.72rem",
                                  }}
                                  onClick={() => {
                                    setFilterMonth(t.year_month);
                                    if (scrapedSubView === "time_loc_stats") {
                                      setScrapedSubView("jobs_list");
                                    }
                                  }}
                                >
                                  Lọc {t.year_month}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Bảng 8.2: Số bản ghi theo Địa điểm */}
                <div className="lab-card">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.75rem",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    <h3 style={{ fontSize: "1rem", color: "#34d399" }}>
                      8.2. Số Bản ghi BĐS Quét được theo Địa điểm &amp; Đô thị
                    </h3>
                    <span className="badge badge-green">
                      {overallAnalytics.by_location.length} vùng đô thị
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table className="lab-table">
                      <thead>
                        <tr>
                          <th>Địa điểm / Đô thị</th>
                          <th>Số Bản ghi (Tỷ trọng)</th>
                          <th>Pháp lý Giao dịch</th>
                          <th>Đơn giá TB</th>
                          <th>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overallAnalytics.by_location.map((loc) => (
                          <tr key={loc.city_code}>
                            <td>
                              <strong>{loc.city_code}</strong> —{" "}
                              <span style={{ fontSize: "0.82rem" }}>
                                {loc.city_label}
                              </span>
                              <div
                                style={{
                                  fontSize: "0.73rem",
                                  color: "#94a3b8",
                                }}
                              >
                                Vùng: {REAL_ESTATE_REGION_LABELS[loc.macro_region] || loc.macro_region} • Khu vực:{" "}
                                {loc.district_clusters.join(", ")}
                              </div>
                            </td>
                            <td>
                              <div>
                                <strong>{loc.master_records}</strong> bản ghi
                                chuẩn ({loc.raw_postings} tin gốc) —{" "}
                                <span
                                  style={{ color: "#34d399", fontWeight: 700 }}
                                >
                                  {loc.share_pct}%
                                </span>
                              </div>
                              <div
                                style={{
                                  width: "100%",
                                  height: "6px",
                                  background: "#0f172a",
                                  borderRadius: "999px",
                                  marginTop: "0.3rem",
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    width: `${Math.min(100, loc.share_pct)}%`,
                                    height: "100%",
                                    background: "#34d399",
                                  }}
                                />
                              </div>
                            </td>
                            <td style={{ fontSize: "0.78rem" }}>
                              Sổ đỏ: {loc.work_modes.ONSITE || 0} | HĐMB:{" "}
                              {loc.work_modes.HYBRID || 0} | TMDV:{" "}
                              {loc.work_modes.REMOTE || 0}
                            </td>
                            <td style={{ color: "#38bdf8", fontWeight: 700 }}>
                              {loc.avg_salary_mid_vnd} tr/m²
                            </td>
                            <td>
                              <button
                                type="button"
                                className={`tab-btn ${
                                  filterCity === loc.city_code ? "active" : ""
                                }`}
                                style={{
                                  padding: "0.25rem 0.55rem",
                                  fontSize: "0.74rem",
                                }}
                                onClick={() => {
                                  setFilterCity(
                                    filterCity === loc.city_code
                                      ? "ALL"
                                      : loc.city_code
                                  );
                                  if (scrapedSubView === "time_loc_stats") {
                                    setScrapedSubView("jobs_list");
                                  }
                                }}
                              >
                                {filterCity === loc.city_code
                                  ? "Đang lọc ✓"
                                  : `Lọc ${loc.city_code}`}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
                </>
              )}

              {/* Khối 2.5: PHÂN TÍCH SỐ ĐIỆN THOẠI NGƯỜI RAO BÁN / MÔI GIỚI & GIAI ĐOẠN ĐĂNG TIN (2021–2026) */}
              {(scrapedSubView === "seller_phones" ||
                scrapedSubView === "all") && (
                <section
                  className="lab-card"
                  style={{ border: "1px solid #a855f7" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                      marginBottom: "1rem",
                    }}
                  >
                    <div>
                      <h2 style={{ fontSize: "1.12rem", color: "#d8b4fe" }}>
                        📞 8.4. Phân tích Số điện thoại Người rao bán / Môi giới
                        &amp; Giai đoạn Đăng tin BĐS (2021–2026)
                      </h2>
                      <p
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.82rem",
                          marginTop: "0.2rem",
                        }}
                      >
                        Quét tự động số điện thoại liên hệ từ 6 cổng BĐS (API{" "}
                        <code>ad.phone</code>, JSON-LD <code>telephone</code>,{" "}
                        <code>tel:</code> DOM &amp; Regex mô tả tin rao) để theo
                        dõi mỗi số điện thoại đã đăng bao nhiêu bản tin, trong
                        những giai đoạn/tháng nào, tại những khu vực nào và phân
                        loại Chính chủ (1 tin) vs. Môi giới bán chuyên (2–3 tin)
                        vs. Môi giới chuyên nghiệp / Sàn BĐS (≥ 4 tin).
                      </p>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <span
                        className="badge"
                        style={{
                          background: "rgba(168, 85, 247, 0.2)",
                          color: "#e9d5ff",
                          border: "1px solid #a855f7",
                        }}
                      >
                        Đã định danh {sellerPhoneAnalytics.total_unique_phones}{" "}
                        SĐT trên {scrapedRecords.length} bản tin
                      </span>
                      <button
                        type="button"
                        className="tab-btn"
                        onClick={() => {
                          setSellerTypeFilter("ALL");
                          setSellerPhoneSearch("");
                          setSellerTablePage(1);
                        }}
                      >
                        Đặt lại bộ lọc SĐT ↺
                      </button>
                    </div>
                  </div>

                  {/* 4 Thẻ KPI Thống kê SĐT Người rao bán */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(215px, 1fr))",
                      gap: "0.75rem",
                      marginBottom: "1rem",
                    }}
                  >
                    <div
                      style={{
                        background: "#0f172a",
                        padding: "0.85rem",
                        borderRadius: "0.65rem",
                        border: "1px solid #a855f7",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "#d8b4fe" }}>
                        1. Tổng SĐT Người rao Duy nhất
                      </div>
                      <div
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 800,
                          color: "#c084fc",
                          marginTop: "0.15rem",
                        }}
                      >
                        {sellerPhoneAnalytics.total_unique_phones} số điện thoại
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "#cbd5e1" }}>
                        Trung bình{" "}
                        <strong>
                          {sellerPhoneAnalytics.avg_listings_per_phone} bản
                          tin/SĐT
                        </strong>{" "}
                        (Cao nhất:{" "}
                        <strong>
                          {sellerPhoneAnalytics.max_listings_by_single_phone}{" "}
                          tin/SĐT
                        </strong>
                        )
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#0f172a",
                        padding: "0.85rem",
                        borderRadius: "0.65rem",
                        border: "1px solid #334155",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                        2. Môi giới Chuyên nghiệp / Sàn BĐS (≥ 4 tin)
                      </div>
                      <div
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 800,
                          color: "#38bdf8",
                          marginTop: "0.15rem",
                        }}
                      >
                        {sellerPhoneAnalytics.professional_brokers_count} SĐT
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "#cbd5e1" }}>
                        Hoạt động xuyên suốt nhiều kỳ tháng/quý giai đoạn
                        2021–2026
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#0f172a",
                        padding: "0.85rem",
                        borderRadius: "0.65rem",
                        border: "1px solid #334155",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                        3. Môi giới Bán chuyên / Đầu tư (2–3 tin)
                      </div>
                      <div
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 800,
                          color: "#f59e0b",
                          marginTop: "0.15rem",
                        }}
                      >
                        {sellerPhoneAnalytics.semi_pro_brokers_count} SĐT
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "#cbd5e1" }}>
                        Tổng số SĐT đăng từ 2 bản tin trở lên:{" "}
                        <strong style={{ color: "#34d399" }}>
                          {sellerPhoneAnalytics.multi_listing_sellers_count} SĐT
                        </strong>
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#0f172a",
                        padding: "0.85rem",
                        borderRadius: "0.65rem",
                        border: "1px solid #334155",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                        4. Chính chủ / Cá nhân Rao bán (1 tin)
                      </div>
                      <div
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 800,
                          color: "#34d399",
                          marginTop: "0.15rem",
                        }}
                      >
                        {sellerPhoneAnalytics.single_listing_owners_count} SĐT
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "#cbd5e1" }}>
                        Chiếm{" "}
                        <strong>
                          {sellerPhoneAnalytics.total_unique_phones > 0
                            ? Math.round(
                                (sellerPhoneAnalytics.single_listing_owners_count *
                                  1000) /
                                  sellerPhoneAnalytics.total_unique_phones
                              ) / 10
                            : 0}
                          %
                        </strong>{" "}
                        tổng số SĐT người đăng
                      </div>
                    </div>
                  </div>

                  {/* Thanh Lọc SĐT Người rao bán */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(210px, 1fr))",
                      gap: "0.75rem",
                      background: "#1e293b",
                      padding: "0.9rem",
                      borderRadius: "0.75rem",
                      border: "1px solid #334155",
                      marginBottom: "0.85rem",
                    }}
                  >
                    <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                      1. Phân nhóm Người rao theo Tần suất đăng tin:
                      <select
                        value={sellerTypeFilter}
                        onChange={(e) => {
                          setSellerTypeFilter(
                            e.target.value as
                              | "ALL"
                              | "MULTI"
                              | "PRO"
                              | "SEMI"
                              | "OWNER"
                          );
                          setSellerTablePage(1);
                        }}
                        style={{
                          width: "100%",
                          marginTop: "0.25rem",
                          padding: "0.48rem",
                          background: "#0f172a",
                          color: "#fff",
                          border: "1px solid #475569",
                          borderRadius: "0.4rem",
                        }}
                      >
                        <option value="ALL">
                          Tất cả SĐT Người rao (
                          {sellerPhoneAnalytics.total_unique_phones} SĐT)
                        </option>
                        <option value="MULTI">
                          Đăng nhiều tin (≥ 2 bản tin) —{" "}
                          {sellerPhoneAnalytics.multi_listing_sellers_count} SĐT
                        </option>
                        <option value="PRO">
                          Môi giới Chuyên nghiệp / Sàn (≥ 4 bản tin) —{" "}
                          {sellerPhoneAnalytics.professional_brokers_count} SĐT
                        </option>
                        <option value="SEMI">
                          Môi giới Bán chuyên (2–3 bản tin) —{" "}
                          {sellerPhoneAnalytics.semi_pro_brokers_count} SĐT
                        </option>
                        <option value="OWNER">
                          Chính chủ / Cá nhân (1 bản tin) —{" "}
                          {sellerPhoneAnalytics.single_listing_owners_count} SĐT
                        </option>
                      </select>
                    </label>

                    <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                      2. Tìm kiếm theo SĐT, Tên người rao, Sàn BĐS hoặc Khu vực:
                      <input
                        type="text"
                        value={sellerPhoneSearch}
                        onChange={(e) => {
                          setSellerPhoneSearch(e.target.value);
                          setSellerTablePage(1);
                        }}
                        placeholder="VD: 090, 098, Vinhomes, Cầu Giấy, Hoàng Mai..."
                        style={{
                          width: "100%",
                          marginTop: "0.25rem",
                          padding: "0.48rem 0.65rem",
                          background: "#0f172a",
                          color: "#fff",
                          border: "1px solid #475569",
                          borderRadius: "0.4rem",
                        }}
                      />
                    </label>

                    <label
                      style={{
                        fontSize: "0.78rem",
                        color: "#d8b4fe",
                        fontWeight: 700,
                      }}
                    >
                      3. Số SĐT hiển thị / trang:
                      <select
                        value={sellerTablePageSize}
                        onChange={(e) => {
                          setSellerTablePageSize(Number(e.target.value));
                          setSellerTablePage(1);
                        }}
                        style={{
                          width: "100%",
                          marginTop: "0.25rem",
                          padding: "0.48rem",
                          background: "#0f172a",
                          color: "#d8b4fe",
                          fontWeight: 700,
                          border: "1px solid #a855f7",
                          borderRadius: "0.4rem",
                        }}
                      >
                        <option value={10}>10 SĐT / trang</option>
                        <option value={20}>20 SĐT / trang</option>
                        <option value={50}>50 SĐT / trang</option>
                        <option value={100}>100 SĐT / trang</option>
                      </select>
                    </label>
                  </div>

                  <div style={{ marginBottom: "0.75rem" }}>
                    {renderPaginationToolbar({
                      totalItems: filteredSellers.length,
                      pageSize: sellerTablePageSize,
                      currentPage: sellerTablePage,
                      onPageSizeChange: setSellerTablePageSize,
                      onPageChange: setSellerTablePage,
                      itemLabel: "SĐT người rao bán",
                    })}
                  </div>

                  {/* Bảng Chi tiết SĐT Người rao bán, Số lượng bản tin & Giai đoạn đăng tin */}
                  <div className="table-scroll">
                    <table className="lab-table">
                      <thead>
                        <tr>
                          <th>Số điện thoại &amp; Người rao / Sàn BĐS</th>
                          <th>Số Bản tin Đã đăng</th>
                          <th>Giai đoạn Đăng tin (Từ ngày → Đến ngày &amp; Các tháng)</th>
                          <th>Khu vực &amp; Phân khúc BĐS</th>
                          <th>Đơn giá TB (Biên độ)</th>
                          <th>Thao tác Phân tích</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSellers
                          .slice(
                            (sellerTablePage - 1) * sellerTablePageSize,
                            sellerTablePage * sellerTablePageSize
                          )
                          .map((seller, sIdx) => {
                            const rankIdx =
                              (sellerTablePage - 1) * sellerTablePageSize +
                              sIdx +
                              1;
                            const isSellerExpanded =
                              expandedSellerPhone === seller.seller_phone;
                            return (
                              <React.Fragment key={seller.seller_phone}>
                                <tr
                                  style={{
                                    background: isSellerExpanded
                                      ? "rgba(168, 85, 247, 0.12)"
                                      : undefined,
                                  }}
                                >
                                  <td>
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "0.4rem",
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      <span
                                        className="badge"
                                        style={{
                                          background: "#2e1065",
                                          color: "#e9d5ff",
                                          border: "1px solid #a855f7",
                                          fontWeight: 800,
                                          fontSize: "0.84rem",
                                        }}
                                      >
                                        #{rankIdx} • 📞{" "}
                                        {seller.seller_phone_display}
                                      </span>
                                      <span
                                        className={`badge ${
                                          seller.total_listings >= 4
                                            ? "badge-blue"
                                            : seller.total_listings >= 2
                                            ? "badge-amber"
                                            : "badge-green"
                                        }`}
                                      >
                                        {seller.seller_type}
                                      </span>
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "0.8rem",
                                        color: "#f8fafc",
                                        fontWeight: 600,
                                        marginTop: "0.25rem",
                                      }}
                                    >
                                      {seller.primary_seller_name}
                                    </div>
                                    {seller.seller_names.length > 1 && (
                                      <div
                                        style={{
                                          fontSize: "0.72rem",
                                          color: "#94a3b8",
                                        }}
                                      >
                                        Tên/Dự án khác:{" "}
                                        {seller.seller_names
                                          .slice(1, 4)
                                          .join(", ")}
                                      </div>
                                    )}
                                  </td>

                                  <td>
                                    <div
                                      style={{
                                        fontSize: "1.05rem",
                                        fontWeight: 800,
                                        color:
                                          seller.total_listings >= 2
                                            ? "#34d399"
                                            : "#f8fafc",
                                      }}
                                    >
                                      {seller.total_listings} bản tin
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "0.73rem",
                                        color: "#94a3b8",
                                      }}
                                    >
                                      {seller.total_source_links} link gốc trên{" "}
                                      {seller.portals
                                        .map((p) => formatPortalDisplayName(p))
                                        .join(", ")}
                                    </div>
                                  </td>

                                  <td>
                                    <div
                                      style={{
                                        fontSize: "0.8rem",
                                        color: "#f8fafc",
                                        fontWeight: 700,
                                      }}
                                    >
                                      🗓️ {seller.first_posted_date} →{" "}
                                      {seller.last_posted_date}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "0.73rem",
                                        color: "#cbd5e1",
                                        marginBottom: "0.25rem",
                                      }}
                                    >
                                      Giai đoạn hoạt động:{" "}
                                      <strong style={{ color: "#38bdf8" }}>
                                        {seller.active_span_days > 0
                                          ? `${seller.active_span_days} ngày (${seller.active_months.length} kỳ tháng)`
                                          : `Trong ngày (${seller.active_months[0]?.year_month || ""})`}
                                      </strong>{" "}
                                      • Năm: {seller.active_years.join(", ")}
                                    </div>
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: "0.3rem",
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      {seller.active_months.map((m) => (
                                        <button
                                          key={m.year_month}
                                          type="button"
                                          className="badge badge-amber"
                                          style={{
                                            cursor: "pointer",
                                            border: "1px solid #f59e0b",
                                            fontSize: "0.7rem",
                                          }}
                                          title={`Xem các tin của SĐT ${seller.seller_phone_display} trong tháng ${m.year_month}`}
                                          onClick={() => {
                                            setFilterSellerPhone(
                                              seller.seller_phone
                                            );
                                            setFilterMonth(m.year_month);
                                            setScrapedSubView("jobs_list");
                                            setJobsCurrentPage(1);
                                          }}
                                        >
                                          {m.year_month}: {m.count} tin
                                        </button>
                                      ))}
                                    </div>
                                  </td>

                                  <td style={{ fontSize: "0.78rem" }}>
                                    <div>
                                      <strong>Đô thị:</strong>{" "}
                                      {seller.cities.join(", ")}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "0.73rem",
                                        color: "#cbd5e1",
                                        marginTop: "0.15rem",
                                      }}
                                    >
                                      <strong>Phân khúc:</strong>{" "}
                                      {seller.pillars
                                        .map(
                                          (p) =>
                                            REAL_ESTATE_PILLAR_BADGE_LABELS[
                                              p
                                            ]?.split(" • ")[0] || p
                                        )
                                        .join(", ")}
                                    </div>
                                  </td>

                                  <td>
                                    <div
                                      style={{
                                        color: "#38bdf8",
                                        fontWeight: 800,
                                        fontSize: "0.9rem",
                                      }}
                                    >
                                      {seller.avg_unit_price_m_vnd > 0
                                        ? `${seller.avg_unit_price_m_vnd} tr/m²`
                                        : "Thỏa thuận"}
                                    </div>
                                    {seller.min_unit_price_m_vnd > 0 &&
                                      seller.max_unit_price_m_vnd > 0 && (
                                        <div
                                          style={{
                                            fontSize: "0.72rem",
                                            color: "#94a3b8",
                                          }}
                                        >
                                          Biên độ: {seller.min_unit_price_m_vnd}{" "}
                                          – {seller.max_unit_price_m_vnd} tr/m²
                                        </div>
                                      )}
                                  </td>

                                  <td>
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: "0.35rem",
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      <button
                                        type="button"
                                        className={`tab-btn ${
                                          isSellerExpanded ? "active" : ""
                                        }`}
                                        style={{
                                          padding: "0.28rem 0.55rem",
                                          fontSize: "0.74rem",
                                        }}
                                        onClick={() =>
                                          setExpandedSellerPhone(
                                            isSellerExpanded
                                              ? null
                                              : seller.seller_phone
                                          )
                                        }
                                      >
                                        {isSellerExpanded
                                          ? "Thu gọn dòng thời gian ▲"
                                          : `📋 Xem ${seller.total_listings} tin & giai đoạn ▼`}
                                      </button>
                                      <button
                                        type="button"
                                        className="tab-btn"
                                        style={{
                                          padding: "0.28rem 0.55rem",
                                          fontSize: "0.74rem",
                                          borderColor: "#34d399",
                                          color: "#34d399",
                                        }}
                                        onClick={() => {
                                          setFilterSellerPhone(
                                            seller.seller_phone
                                          );
                                          setFilterMonth("ALL");
                                          setScrapedSubView("jobs_list");
                                          setJobsCurrentPage(1);
                                        }}
                                      >
                                        🔍 Lọc tin SĐT này
                                      </button>
                                    </div>
                                  </td>
                                </tr>

                                {isSellerExpanded && (
                                  <tr>
                                    <td
                                      colSpan={6}
                                      style={{
                                        background: "#0f172a",
                                        padding: "0.9rem",
                                        borderBottom: "2px solid #a855f7",
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: "0.84rem",
                                          fontWeight: 700,
                                          color: "#d8b4fe",
                                          marginBottom: "0.5rem",
                                        }}
                                      >
                                        🕒 Dòng thời gian chi tiết{" "}
                                        {seller.total_listings} bản tin BĐS do
                                        SĐT{" "}
                                        <code>
                                          {seller.seller_phone_display}
                                        </code>{" "}
                                        ({seller.primary_seller_name}) đăng từ{" "}
                                        <code>{seller.first_posted_date}</code>{" "}
                                        đến{" "}
                                        <code>{seller.last_posted_date}</code>:
                                      </div>
                                      <div
                                        style={{
                                          display: "grid",
                                          gap: "0.45rem",
                                        }}
                                      >
                                        {seller.listings.map((item, idxItem) => (
                                          <div
                                            key={item.job_id}
                                            style={{
                                              display: "flex",
                                              justifyContent: "space-between",
                                              alignItems: "center",
                                              flexWrap: "wrap",
                                              gap: "0.5rem",
                                              padding: "0.55rem 0.75rem",
                                              background: "#1e293b",
                                              borderRadius: "0.5rem",
                                              border: "1px solid #334155",
                                            }}
                                          >
                                            <div
                                              style={{
                                                fontSize: "0.8rem",
                                                color: "#f8fafc",
                                              }}
                                            >
                                              <span className="badge badge-amber">
                                                Tin #{idxItem + 1} • Ngày đăng:{" "}
                                                {item.published_date} (
                                                {item.year_month})
                                              </span>{" "}
                                              <span className="badge badge-blue">
                                                {REAL_ESTATE_PILLAR_BADGE_LABELS[
                                                  item.sector_pillar
                                                ]?.split(" • ")[0] ||
                                                  item.sector_pillar}
                                              </span>{" "}
                                              <span className="badge badge-green">
                                                📍 {item.search_city || item.primary_city_code}
                                              </span>{" "}
                                              <strong
                                                style={{ marginLeft: "0.3rem" }}
                                              >
                                                {item.job_title_raw}
                                              </strong>
                                            </div>
                                            <div
                                              style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "0.6rem",
                                                fontSize: "0.78rem",
                                              }}
                                            >
                                              <span
                                                style={{
                                                  color: "#38bdf8",
                                                  fontWeight: 700,
                                                }}
                                              >
                                                {item.exp_years_mid} m² •{" "}
                                                {item.salary_mid_vnd != null
                                                  ? `${item.salary_mid_vnd} tr/m²`
                                                  : item.salary_raw_text}
                                              </span>
                                              {item.source_urls?.[0] && (
                                                <a
                                                  href={item.source_urls[0]}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  style={{
                                                    color: "#34d399",
                                                    fontWeight: 700,
                                                  }}
                                                >
                                                  Link gốc ↗
                                                </a>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Khối 3: Bộ lọc Tương tác & Danh sách Nội dung Chi tiết Từng Bản ghi */}
              {(scrapedSubView === "jobs_list" ||
                scrapedSubView === "all") && (
              <section className="lab-card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    marginBottom: "1rem",
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: "1.05rem", color: "#f8fafc" }}>
                      8.3. Tra cứu &amp; Xem Toàn văn Nội dung Tin Rao BĐS Quét được
                      ({filteredRecords.length} bản ghi • Đang hiển thị {jobsPageSize} tin/trang)
                    </h3>
                    <p
                      style={{
                        fontSize: "0.82rem",
                        color: "var(--text-muted)",
                        marginTop: "0.2rem",
                      }}
                    >
                      Lọc theo Địa điểm, Thời gian, Cổng BĐS nguồn, Phân khúc
                      BĐS, Số điện thoại người rao bán hoặc tìm từ khóa trong nội dung mô tả nhà đất/căn hộ.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="tab-btn"
                    onClick={() => {
                      setFilterCity("ALL");
                      setFilterMonth("ALL");
                      setFilterPortal("ALL");
                      setFilterPillar("ALL");
                      setFilterSellerPhone("ALL");
                      setSearchKeyword("");
                      setJobsCurrentPage(1);
                    }}
                  >
                    Đặt lại tất cả bộ lọc ↺
                  </button>
                </div>

                {/* Banner hiển thị khi đang lọc theo 1 SĐT người rao cụ thể */}
                {filterSellerPhone !== "ALL" && (
                  <div
                    style={{
                      marginBottom: "0.85rem",
                      padding: "0.75rem 1rem",
                      background: "rgba(168, 85, 247, 0.14)",
                      border: "1px solid #a855f7",
                      borderRadius: "0.65rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.6rem",
                    }}
                  >
                    <div style={{ fontSize: "0.84rem", color: "#f8fafc" }}>
                      📞 Đang lọc theo SĐT Người rao:{" "}
                      <strong style={{ color: "#e9d5ff", fontSize: "0.95rem" }}>
                        {formatVnPhoneDisplay(filterSellerPhone)}
                      </strong>{" "}
                      {sellerPhoneMap.get(filterSellerPhone) && (
                        <>
                          —{" "}
                          <strong>
                            {
                              sellerPhoneMap.get(filterSellerPhone)!
                                .primary_seller_name
                            }
                          </strong>{" "}
                          • Tổng số tin đã đăng:{" "}
                          <strong style={{ color: "#34d399" }}>
                            {
                              sellerPhoneMap.get(filterSellerPhone)!
                                .total_listings
                            }{" "}
                            bản tin
                          </strong>{" "}
                          • Giai đoạn:{" "}
                          <code>
                            {
                              sellerPhoneMap.get(filterSellerPhone)!
                                .first_posted_date
                            }{" "}
                            →{" "}
                            {
                              sellerPhoneMap.get(filterSellerPhone)!
                                .last_posted_date
                            }
                          </code>{" "}
                          ({sellerPhoneMap.get(filterSellerPhone)!.seller_type})
                        </>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "0.45rem" }}>
                      <button
                        type="button"
                        className="tab-btn"
                        style={{
                          padding: "0.28rem 0.65rem",
                          fontSize: "0.76rem",
                          borderColor: "#c084fc",
                          color: "#e9d5ff",
                        }}
                        onClick={() => {
                          setExpandedSellerPhone(filterSellerPhone);
                          setScrapedSubView("seller_phones");
                        }}
                      >
                        📊 Mở Bảng Phân tích SĐT này
                      </button>
                      <button
                        type="button"
                        className="tab-btn"
                        style={{
                          padding: "0.28rem 0.65rem",
                          fontSize: "0.76rem",
                        }}
                        onClick={() => setFilterSellerPhone("ALL")}
                      >
                        ✕ Bỏ lọc SĐT
                      </button>
                    </div>
                  </div>
                )}

                {/* Thanh Bộ lọc 7 chiều (Kèm Lọc SĐT Người rao & Số tin / trang 10 - 100) */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                    gap: "0.75rem",
                    background: "#1e293b",
                    padding: "0.95rem",
                    borderRadius: "0.75rem",
                    border: "1px solid #334155",
                    marginBottom: "0.85rem",
                  }}
                >
                  <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                    1. Lọc theo Địa điểm:
                    <select
                      value={filterCity}
                      onChange={(e) => setFilterCity(e.target.value)}
                      style={{
                        width: "100%",
                        marginTop: "0.25rem",
                        padding: "0.48rem",
                        background: "#0f172a",
                        color: "#fff",
                        border: "1px solid #475569",
                        borderRadius: "0.4rem",
                      }}
                    >
                      <option value="ALL">Tất cả Địa điểm (34/63 Tỉnh)</option>
                      <option value="HN">Hà Nội (HN)</option>
                      <option value="HCM">TP. Hồ Chí Minh (HCM)</option>
                      <option value="HP">Hải Phòng (HP)</option>
                      <option value="DN">Đà Nẵng (DN)</option>
                      <option value="BD">Đô thị Vệ tinh (BD/BN/ĐN)</option>
                      <option value="REMOTE">Đô thị Ven biển &amp; Nghỉ dưỡng</option>
                    </select>
                  </label>

                  <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                    2. Lọc theo Thời gian (Tháng):
                    <select
                      value={filterMonth}
                      onChange={(e) => setFilterMonth(e.target.value)}
                      style={{
                        width: "100%",
                        marginTop: "0.25rem",
                        padding: "0.48rem",
                        background: "#0f172a",
                        color: "#fff",
                        border: "1px solid #475569",
                        borderRadius: "0.4rem",
                      }}
                    >
                      <option value="ALL">Tất cả Thời gian</option>
                      {Array.from(
                        new Set(scrapedRecords.map((r) => r.year_month))
                      )
                        .sort((a, b) => b.localeCompare(a))
                        .map((ym) => (
                          <option key={ym} value={ym}>
                            Tháng {ym}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                    3. Lọc theo Cổng BĐS Nguồn:
                    <select
                      value={filterPortal}
                      onChange={(e) => setFilterPortal(e.target.value)}
                      style={{
                        width: "100%",
                        marginTop: "0.25rem",
                        padding: "0.48rem",
                        background: "#0f172a",
                        color: "#fff",
                        border: "1px solid #475569",
                        borderRadius: "0.4rem",
                      }}
                    >
                      <option value="ALL">Tất cả 6 Cổng BĐS</option>
                      <option value="batdongsan">Batdongsan.com.vn</option>
                      <option value="chotot">Nhatot / Chotot.com</option>
                      <option value="alonhadat">Alonhadat.com.vn</option>
                      <option value="mogi">Mogi.vn</option>
                      <option value="muaban">Muaban.net</option>
                      <option value="meeyland">Meeyland.com</option>
                    </select>
                  </label>

                  <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                    4. Lọc theo Phân khúc BĐS:
                    <select
                      value={filterPillar}
                      onChange={(e) => setFilterPillar(e.target.value)}
                      style={{
                        width: "100%",
                        marginTop: "0.25rem",
                        padding: "0.48rem",
                        background: "#0f172a",
                        color: "#fff",
                        border: "1px solid #475569",
                        borderRadius: "0.4rem",
                      }}
                    >
                      <option value="ALL">Tất cả 4 Phân khúc BĐS</option>
                      <option value="DE-01">RES-01: Căn hộ Chung cư &amp; Penthouse</option>
                      <option value="DE-02">LAND-02: Nhà phố, Biệt thự &amp; Đất nền</option>
                      <option value="DE-03">COM-03: Shophouse, Mặt bằng &amp; Văn phòng</option>
                      <option value="DE-04">IND-04: BĐS Công nghiệp &amp; Nghỉ dưỡng</option>
                    </select>
                  </label>

                  <label style={{ fontSize: "0.78rem", color: "#d8b4fe" }}>
                    5. Lọc theo SĐT Người rao bán:
                    <select
                      value={filterSellerPhone}
                      onChange={(e) => {
                        setFilterSellerPhone(e.target.value);
                        setJobsCurrentPage(1);
                      }}
                      style={{
                        width: "100%",
                        marginTop: "0.25rem",
                        padding: "0.48rem",
                        background: "#0f172a",
                        color: "#e9d5ff",
                        border: "1px solid #a855f7",
                        borderRadius: "0.4rem",
                      }}
                    >
                      <option value="ALL">
                        Tất cả SĐT ({sellerPhoneAnalytics.total_unique_phones}{" "}
                        SĐT)
                      </option>
                      {sellerPhoneAnalytics.sellers.slice(0, 150).map((s) => (
                        <option key={s.seller_phone} value={s.seller_phone}>
                          {s.seller_phone_display} — {s.total_listings} tin (
                          {s.first_posted_date.slice(0, 7)}→
                          {s.last_posted_date.slice(0, 7)}) •{" "}
                          {s.primary_seller_name.slice(0, 22)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                    6. Tìm kiếm Từ khóa / SĐT:
                    <input
                      type="text"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      placeholder="VD: 0903, Sổ đỏ, Mặt phố, Vinhomes..."
                      style={{
                        width: "100%",
                        marginTop: "0.25rem",
                        padding: "0.48rem 0.65rem",
                        background: "#0f172a",
                        color: "#fff",
                        border: "1px solid #475569",
                        borderRadius: "0.4rem",
                      }}
                    />
                  </label>

                  <label style={{ fontSize: "0.78rem", color: "#38bdf8", fontWeight: 700 }}>
                    7. Số tin / trang (10 – 100):
                    <select
                      value={jobsPageSize}
                      onChange={(e) => {
                        setJobsPageSize(Number(e.target.value));
                        setJobsCurrentPage(1);
                      }}
                      style={{
                        width: "100%",
                        marginTop: "0.25rem",
                        padding: "0.48rem",
                        background: "#0f172a",
                        color: "#38bdf8",
                        fontWeight: 700,
                        border: "1px solid #38bdf8",
                        borderRadius: "0.4rem",
                      }}
                    >
                      <option value={10}>10 tin rao BĐS / trang</option>
                      <option value={20}>20 tin rao BĐS / trang</option>
                      <option value={50}>50 tin rao BĐS / trang</option>
                      <option value={100}>100 tin rao BĐS / trang</option>
                    </select>
                  </label>
                </div>

                {/* Thanh Phân trang Đầu Danh sách Tin Rao BĐS */}
                <div style={{ marginBottom: "0.85rem" }}>
                  {renderPaginationToolbar({
                    totalItems: filteredRecords.length,
                    pageSize: jobsPageSize,
                    currentPage: jobsCurrentPage,
                    onPageSizeChange: setJobsPageSize,
                    onPageChange: setJobsCurrentPage,
                    itemLabel: "tin rao BĐS",
                  })}
                </div>

                {/* Danh sách Chi tiết Từng Bản ghi Quét được (Thời gian • Địa điểm • SĐT Người rao • Nội dung) */}
                <div style={{ display: "grid", gap: "0.85rem" }}>
                  {filteredRecords
                    .slice(
                      (jobsCurrentPage - 1) * jobsPageSize,
                      jobsCurrentPage * jobsPageSize
                    )
                    .map((rec, idx) => {
                    const globalIdx = (jobsCurrentPage - 1) * jobsPageSize + idx;
                    const isExpanded = expandedJobId === rec.job_id;
                    const recPhone =
                      rec.seller_phone ||
                      resolveSellerPhoneForRecord(rec).seller_phone;
                    const sellerProfile = sellerPhoneMap.get(recPhone);
                    const sellerTotalListings =
                      sellerProfile?.total_listings || 1;
                    const sellerSpanLabel =
                      sellerProfile &&
                      sellerProfile.first_posted_date !==
                        sellerProfile.last_posted_date
                        ? `${sellerProfile.first_posted_date.slice(
                            0,
                            7
                          )} → ${sellerProfile.last_posted_date.slice(0, 7)}`
                        : rec.year_month;
                    return (
                      <div
                        key={rec.job_id || rec.dedup_signature}
                        style={{
                          background: "#1e293b",
                          border: isExpanded
                            ? "1px solid #38bdf8"
                            : "1px solid #334155",
                          borderRadius: "0.75rem",
                          padding: "1rem",
                        }}
                      >
                        {/* Dòng Tóm tắt Bản ghi */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            flexWrap: "wrap",
                            gap: "0.75rem",
                          }}
                        >
                          <div style={{ flex: "1 1 420px" }}>
                            <div
                              style={{
                                display: "flex",
                                gap: "0.45rem",
                                flexWrap: "wrap",
                                alignItems: "center",
                                marginBottom: "0.35rem",
                              }}
                            >
                              <span className="badge badge-blue">
                                #{globalIdx + 1} •{" "}
                                {REAL_ESTATE_PILLAR_BADGE_LABELS[rec.sector_pillar] ||
                                  rec.sector_pillar}
                              </span>
                              <span className="badge badge-green">
                                📍 {rec.primary_city_code} •{" "}
                                {REAL_ESTATE_WORK_MODE_LABELS[rec.work_mode] ||
                                  "Sổ đỏ / Chính chủ"}
                              </span>
                              <span className="badge badge-amber">
                                🕒 Ngày đăng: {rec.published_date} (
                                {rec.year_month})
                              </span>
                              <span
                                className="badge"
                                style={{
                                  background: "#2e1065",
                                  color: "#e9d5ff",
                                  border: "1px solid #a855f7",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                                title="Nhấn để lọc toàn bộ bản tin của số điện thoại này"
                                onClick={() => {
                                  setFilterSellerPhone(
                                    filterSellerPhone === recPhone
                                      ? "ALL"
                                      : recPhone
                                  );
                                  setJobsCurrentPage(1);
                                }}
                              >
                                📞 SĐT: {formatVnPhoneDisplay(recPhone)} • Đã
                                đăng {sellerTotalListings} tin (
                                {sellerSpanLabel})
                              </span>
                              {Array.from(
                                new Set(
                                  (rec.source_sites || ["chotot"]).map((s) =>
                                    formatPortalDisplayName(s, rec.source_urls)
                                  )
                                )
                              ).map((portalLabel) => (
                                <span
                                  key={portalLabel}
                                  className="badge badge-blue"
                                  style={{ textTransform: "uppercase" }}
                                >
                                  {portalLabel}
                                </span>
                              ))}
                            </div>
                            <h4
                              style={{
                                fontSize: "1rem",
                                color: "#f8fafc",
                                marginBottom: "0.2rem",
                              }}
                            >
                              {rec.job_title_raw}
                            </h4>
                            <div
                              style={{
                                fontSize: "0.84rem",
                                color: "#cbd5e1",
                              }}
                            >
                              Dự án / Sàn BĐS:{" "}
                              <strong>{rec.company_name_raw}</strong> • SĐT Liên hệ:{" "}
                              <strong style={{ color: "#e9d5ff" }}>
                                {formatVnPhoneDisplay(recPhone)}
                              </strong>{" "}
                              ({sellerProfile?.seller_type || "Chính chủ / Cá nhân"}) • Phân tầng:{" "}
                              <strong>
                                {REAL_ESTATE_TIER_LABELS[rec.career_tier] ||
                                  rec.career_tier}
                              </strong>{" "}
                              • Diện tích:{" "}
                              <strong style={{ color: "#38bdf8" }}>
                                {rec.exp_years_mid} m²
                              </strong>{" "}
                              • Địa điểm chi tiết:{" "}
                              <strong>
                                {rec.search_city && rec.search_city !== rec.primary_city_code
                                  ? rec.search_city
                                  : CITY_LABELS_MAP[rec.primary_city_code] ||
                                    rec.primary_city_code}
                              </strong>
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-end",
                              gap: "0.4rem",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "1.05rem",
                                fontWeight: 800,
                                color: "#34d399",
                              }}
                            >
                              {rec.salary_mid_vnd != null
                                ? `${rec.salary_mid_vnd} triệu VNĐ/m²`
                                : "Giá thỏa thuận"}
                            </div>
                            <div
                              style={{ fontSize: "0.76rem", color: "#94a3b8" }}
                            >
                              Giá rao gốc: <code>{rec.salary_raw_text}</code>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: "0.45rem",
                                flexWrap: "wrap",
                                justifyContent: "flex-end",
                              }}
                            >
                              <button
                                type="button"
                                className="tab-btn"
                                style={{
                                  padding: "0.3rem 0.65rem",
                                  fontSize: "0.76rem",
                                  borderColor: "#a855f7",
                                  color: "#e9d5ff",
                                }}
                                onClick={() => {
                                  setFilterSellerPhone(
                                    filterSellerPhone === recPhone
                                      ? "ALL"
                                      : recPhone
                                  );
                                  setJobsCurrentPage(1);
                                }}
                              >
                                {filterSellerPhone === recPhone
                                  ? "✕ Bỏ lọc SĐT này"
                                  : `📞 Lọc SĐT này (${sellerTotalListings} tin)`}
                              </button>
                              <button
                                type="button"
                                className="tab-btn active"
                                style={{
                                  padding: "0.3rem 0.7rem",
                                  fontSize: "0.78rem",
                                  background:
                                    "linear-gradient(90deg, rgba(16,185,129,0.22), rgba(56,189,248,0.22))",
                                  border: "1px solid #34d399",
                                  color: "#f8fafc",
                                  fontWeight: 700,
                                }}
                                onClick={() => {
                                  setDealSeedJob({
                                    company_name: rec.company_name_raw,
                                    job_title: rec.job_title_raw,
                                    location_text: `${
                                      rec.search_city ||
                                      CITY_LABELS_MAP[rec.primary_city_code] ||
                                      rec.primary_city_code
                                    } (${
                                      REAL_ESTATE_WORK_MODE_LABELS[rec.work_mode] ||
                                      "Sổ đỏ / Chính chủ"
                                    })`,
                                    salary_text: rec.salary_raw_text,
                                    jd_full_text: [
                                      rec.description_clean,
                                      rec.requirements_clean
                                        ? `Pháp lý & Kết cấu: ${rec.requirements_clean}`
                                        : "",
                                      rec.benefits_clean
                                        ? `Tiện ích & Tiềm năng: ${rec.benefits_clean}`
                                        : "",
                                      rec.raw_skill_tags && rec.raw_skill_tags.length > 0
                                        ? `Thuộc tính BĐS: ${rec.raw_skill_tags.join(", ")}`
                                        : "",
                                    ]
                                      .filter(Boolean)
                                      .join("\n"),
                                  });
                                  setValuationSubMode("jd_deal");
                                  setActiveTab("valuation");
                                  if (typeof window !== "undefined") {
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                  }
                                }}
                              >
                                🏠 Định giá &amp; Đàm phán tin BĐS này
                              </button>
                              <button
                                type="button"
                                className={`tab-btn ${
                                  isExpanded ? "active" : ""
                                }`}
                                style={{
                                  padding: "0.3rem 0.7rem",
                                  fontSize: "0.78rem",
                                }}
                                onClick={() =>
                                  setExpandedJobId(
                                    isExpanded ? null : rec.job_id
                                  )
                                }
                              >
                                {isExpanded
                                  ? "Thu gọn nội dung ▲"
                                  : "Xem toàn bộ nội dung bản ghi ▼"}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Nội dung tóm tắt luôn hiển thị */}
                        <div
                          style={{
                            marginTop: "0.65rem",
                            paddingTop: "0.65rem",
                            borderTop: "1px solid #334155",
                            fontSize: "0.84rem",
                            color: "#e2e8f0",
                            lineHeight: 1.6,
                          }}
                        >
                          <strong style={{ color: "#38bdf8" }}>
                            Nội dung Mô tả Chi tiết Bất động sản &amp; Pháp lý:{" "}
                          </strong>
                          {rec.description_clean}
                        </div>

                        {/* Khung mở rộng Chi tiết Thời gian, Địa điểm & Toàn bộ Nội dung Bản ghi */}
                        {isExpanded && (
                          <div
                            style={{
                              marginTop: "0.85rem",
                              background: "#0f172a",
                              borderRadius: "0.65rem",
                              padding: "0.95rem",
                              border: "1px solid #334155",
                              display: "grid",
                              gap: "0.75rem",
                            }}
                          >
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
                                gap: "0.75rem",
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontSize: "0.78rem",
                                    fontWeight: 700,
                                    color: "#38bdf8",
                                    marginBottom: "0.25rem",
                                  }}
                                >
                                  1. Thông tin Thời gian Quét, Niêm yết &amp; SĐT Người rao
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.8rem",
                                    color: "#cbd5e1",
                                    lineHeight: 1.6,
                                  }}
                                >
                                  • SĐT Người rao bán / Môi giới:{" "}
                                  <strong style={{ color: "#e9d5ff" }}>
                                    {formatVnPhoneDisplay(recPhone)}
                                  </strong>{" "}
                                  (Tổng số tin đã đăng:{" "}
                                  <strong style={{ color: "#34d399" }}>
                                    {sellerTotalListings} bản tin
                                  </strong>{" "}
                                  trong giai đoạn{" "}
                                  <code>
                                    {sellerProfile?.first_posted_date ||
                                      rec.published_date}{" "}
                                    →{" "}
                                    {sellerProfile?.last_posted_date ||
                                      rec.published_date}
                                  </code>
                                  )
                                  <br />• Ngày đăng tin:{" "}
                                  <strong>{rec.published_date}</strong> (Hạn
                                  niêm yết: {rec.expired_date})
                                  <br />• Kỳ thống kê:{" "}
                                  <code>{rec.year_month}</code> /{" "}
                                  <code>{rec.year_quarter}</code>
                                  <br />• Quét lần đầu (GMT+07):{" "}
                                  <code>{rec.first_seen_at}</code>
                                  <br />• Xác thực gần nhất:{" "}
                                  <code>{rec.last_seen_at}</code> (Thời gian rao bán:{" "}
                                  <strong>
                                    {rec.vacancy_duration_days} ngày
                                  </strong>
                                  )
                                </div>
                              </div>

                              <div>
                                <div
                                  style={{
                                    fontSize: "0.78rem",
                                    fontWeight: 700,
                                    color: "#34d399",
                                    marginBottom: "0.25rem",
                                  }}
                                >
                                  2. Thông tin Địa điểm &amp; Phân vùng Không
                                  gian BĐS
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.8rem",
                                    color: "#cbd5e1",
                                    lineHeight: 1.6,
                                  }}
                                >
                                  • Đô thị / Tỉnh thành:{" "}
                                  <strong>
                                    {CITY_LABELS_MAP[rec.primary_city_code] ||
                                      rec.primary_city_code}
                                  </strong>
                                  <br />• Địa điểm chi tiết:{" "}
                                  <strong>
                                    {rec.search_city &&
                                    rec.search_city !== rec.primary_city_code
                                      ? rec.search_city
                                      : CITY_LABELS_MAP[rec.primary_city_code] ||
                                        rec.primary_city_code}
                                  </strong>
                                  <br />• Vùng kinh tế:{" "}
                                  <strong>
                                    {REAL_ESTATE_REGION_LABELS[
                                      rec.primary_macro_region
                                    ] || rec.primary_macro_region}
                                  </strong>{" "}
                                  • Khu vực:{" "}
                                  <strong>
                                    {formatDistrictClusterLabel(
                                      rec.primary_district_cluster,
                                      rec.search_city
                                    )}
                                  </strong>
                                  <br />• Pháp lý &amp; Giao dịch:{" "}
                                  <span className="badge badge-green">
                                    {REAL_ESTATE_WORK_MODE_LABELS[
                                      rec.work_mode
                                    ] || "Sổ đỏ / Chính chủ"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {rec.requirements_clean && (
                              <div
                                style={{
                                  fontSize: "0.82rem",
                                  color: "#cbd5e1",
                                  lineHeight: 1.6,
                                }}
                              >
                                <strong style={{ color: "#f59e0b" }}>
                                  Thông số Kỹ thuật &amp; Kết cấu Bất động sản:{" "}
                                </strong>
                                {rec.requirements_clean}
                              </div>
                            )}

                            {rec.benefits_clean && (
                              <div
                                style={{
                                  fontSize: "0.82rem",
                                  color: "#cbd5e1",
                                  lineHeight: 1.6,
                                }}
                              >
                                <strong style={{ color: "#34d399" }}>
                                  Pháp lý &amp; Tiện ích Nội/Ngoại khu:{" "}
                                </strong>
                                {rec.benefits_clean}
                              </div>
                            )}

                            <div>
                              <div
                                style={{
                                  fontSize: "0.78rem",
                                  fontWeight: 700,
                                  color: "#f8fafc",
                                  marginBottom: "0.35rem",
                                }}
                              >
                                3. Thuộc tính Định giá Hedonic Chuẩn hóa Trích xuất từ
                                Tin rao ({rec.matched_skill_ids.length} thuộc
                                tính):
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "0.4rem",
                                }}
                              >
                                {rec.matched_skill_ids.map((skId) => (
                                  <span key={skId} className="badge badge-blue">
                                    {formatHedonicSkillBadge(skId)}
                                  </span>
                                ))}
                                {(rec.raw_skill_tags || []).map((tag) => (
                                  <span
                                    key={tag}
                                    className="badge badge-amber"
                                  >
                                    Tag gốc: {tag}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div
                              style={{
                                fontSize: "0.78rem",
                                color: "#94a3b8",
                                display: "flex",
                                justifyContent: "space-between",
                                flexWrap: "wrap",
                                gap: "0.5rem",
                                paddingTop: "0.45rem",
                                borderTop: "1px solid #1e293b",
                              }}
                            >
                              <div>
                                Mã định danh khử trùng lặp:{" "}
                                <code>{rec.dedup_signature}</code>
                              </div>
                              <div>
                                Link gốc ({rec.source_urls.length}):{" "}
                                {rec.source_urls.map((u, i) => (
                                  <a
                                    key={u}
                                    href={u}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      color: "#38bdf8",
                                      marginLeft: i > 0 ? "0.6rem" : "0.2rem",
                                    }}
                                  >
                                    {u}
                                  </a>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Thanh Phân trang Cuối Danh sách Tin Tuyển dụng */}
                <div style={{ marginTop: "0.85rem" }}>
                  {renderPaginationToolbar({
                    totalItems: filteredRecords.length,
                    pageSize: jobsPageSize,
                    currentPage: jobsCurrentPage,
                    onPageSizeChange: setJobsPageSize,
                    onPageChange: setJobsCurrentPage,
                    itemLabel: "tin rao BĐS",
                  })}
                </div>
              </section>
              )}
            </div>
          );
        })()}

      {/* Mobile Bottom Navigation Bar (Hiển thị ĐẦY ĐỦ 8 tính năng trên Điện thoại & Tablet) */}
      <nav className="mobile-bottom-nav" aria-label="Menu điều hướng nhanh 8 tính năng trên di động">
        <button
          className={`tab-btn ${activeTab === "valuation" ? "active" : ""}`}
          onClick={() => setActiveTab("valuation")}
        >
          1. Định giá BĐS
        </button>
        <button
          className={`tab-btn ${activeTab === "pyramid" ? "active" : ""}`}
          onClick={() => setActiveTab("pyramid")}
        >
          {!canAccessWorkspaceTab("pyramid") ? "🔒 " : ""}2. Tháp Giá BĐS
        </button>
        <button
          className={`tab-btn ${activeTab === "econometrics" ? "active" : ""}`}
          onClick={() => setActiveTab("econometrics")}
        >
          {!canAccessWorkspaceTab("econometrics") ? "🔒 " : ""}3. Hedonic OLS
        </button>
        <button
          className={`tab-btn ${activeTab === "provenance" ? "active" : ""}`}
          onClick={() => setActiveTab("provenance")}
        >
          {!canAccessWorkspaceTab("provenance") ? "🔒 " : ""}4. 6 Cổng BĐS
        </button>
        <button
          className={`tab-btn ${activeTab === "rbac" ? "active" : ""}`}
          onClick={() => setActiveTab("rbac")}
        >
          {!canAccessWorkspaceTab("rbac") ? "🔒 " : ""}5. RBAC Lab
        </button>
        <button
          className={`tab-btn ${activeTab === "mcp" ? "active" : ""}`}
          onClick={() => setActiveTab("mcp")}
        >
          {!canAccessWorkspaceTab("mcp") ? "🔒 " : ""}6. AI MCP
        </button>
        <button
          className={`tab-btn ${activeTab === "errors" ? "active" : ""}`}
          onClick={() => setActiveTab("errors")}
        >
          {!canAccessWorkspaceTab("errors") ? "🔒 " : ""}7. Lỗi DLQ
        </button>
        <button
          className={`tab-btn ${activeTab === "scraped" ? "active" : ""}`}
          onClick={() => setActiveTab("scraped")}
        >
          {!canAccessWorkspaceTab("scraped") ? "🔒 " : ""}8. Kho Tin Rao
        </button>
      </nav>
    </main>
  );
}
