import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/googleAuth";
import {
  buildDefaultCampaign100kPlan,
  SCRAPED_JOBS_DATASET,
} from "@/lib/labData";

export async function GET(request: NextRequest) {
  const sessionUser = getSessionUserFromRequest(request);

  if (!sessionUser) {
    return NextResponse.json(
      { error: "Yêu cầu đăng nhập xác thực để xem kế hoạch chiến dịch 100k bản ghi." },
      { status: 401 }
    );
  }

  const candidateBases = [
    process.env.INTERNAL_API_URL,
    "http://api:8000",
    "http://localhost:8000",
  ].filter(Boolean) as string[];

  for (const base of candidateBases) {
    try {
      const res = await fetch(
        `${base.replace(/\/+$/, "")}/api/v1/scraper/campaign-plan`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      // Fallback to local calculation
    }
  }

  return NextResponse.json(buildDefaultCampaign100kPlan(SCRAPED_JOBS_DATASET));
}

export async function PUT(request: NextRequest) {
  const sessionUser = getSessionUserFromRequest(request);

  if (!sessionUser) {
    return NextResponse.json(
      { error: "Yêu cầu đăng nhập xác thực để căn chỉnh kế hoạch quét." },
      { status: 401 }
    );
  }

  if (sessionUser.role !== "ADMIN" && sessionUser.role !== "OPERATOR") {
    return NextResponse.json(
      {
        error: `Tài khoản ${sessionUser.email} (${sessionUser.role}) không đủ quyền căn chỉnh Kế hoạch Quét (cần quyền OPERATOR hoặc ADMIN).`,
      },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));

  const candidateBases = [
    process.env.INTERNAL_API_URL,
    "http://api:8000",
    "http://localhost:8000",
  ].filter(Boolean) as string[];

  for (const base of candidateBases) {
    try {
      const res = await fetch(
        `${base.replace(/\/+$/, "")}/api/v1/scraper/campaign-plan`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      // Fallback to local calculation
    }
  }

  if (body?.auto_tune_optimal_30days) {
    const plan = buildDefaultCampaign100kPlan(SCRAPED_JOBS_DATASET, {
      target_master_records: Number(body?.target_master_records || 100000),
      campaign_execution_days: Number(body?.campaign_execution_days || 30),
      schedule_mode: "interval",
      interval_hours: 4,
      max_pages_per_query: 15,
      max_jobs_per_site_run: 600,
      concurrency_per_site: 3,
      enable_wayback_cdx_2021_2024: true,
      enable_sitemap_archive: true,
    });
    return NextResponse.json({ status: "updated", plan });
  }

  const plan = buildDefaultCampaign100kPlan(SCRAPED_JOBS_DATASET, {
    target_master_records: body?.target_master_records
      ? Number(body.target_master_records)
      : undefined,
    campaign_execution_days: body?.campaign_execution_days
      ? Number(body.campaign_execution_days)
      : undefined,
    schedule_mode: body?.schedule_mode ? String(body.schedule_mode) : undefined,
    interval_hours: body?.interval_hours ? Number(body.interval_hours) : undefined,
    daily_run_hour:
      body?.daily_run_hour != null ? Number(body.daily_run_hour) : undefined,
    max_pages_per_query: body?.max_pages_per_query
      ? Number(body.max_pages_per_query)
      : undefined,
    unlimited_daily_crawl:
      body?.unlimited_daily_crawl != null
        ? Boolean(body.unlimited_daily_crawl)
        : undefined,
    max_jobs_per_site_run:
      body?.max_jobs_per_site_run != null
        ? Number(body.max_jobs_per_site_run)
        : undefined,
    concurrency_per_site: body?.concurrency_per_site
      ? Number(body.concurrency_per_site)
      : undefined,
    enable_wayback_cdx_2021_2024:
      body?.enable_wayback_cdx_2021_2024 != null
        ? Boolean(body.enable_wayback_cdx_2021_2024)
        : undefined,
    enable_sitemap_archive:
      body?.enable_sitemap_archive != null
        ? Boolean(body.enable_sitemap_archive)
        : undefined,
    full_retention_months: body?.full_retention_months
      ? Number(body.full_retention_months)
      : undefined,
    sample_retention_ratio: body?.sample_retention_ratio
      ? Number(body.sample_retention_ratio)
      : undefined,
    min_records_per_stratum: body?.min_records_per_stratum
      ? Number(body.min_records_per_stratum)
      : undefined,
  });

  return NextResponse.json({ status: "updated", plan });
}
