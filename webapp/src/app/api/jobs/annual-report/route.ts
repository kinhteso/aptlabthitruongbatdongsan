import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/googleAuth";
import { buildAnnualComparativeReport } from "@/lib/labData";

export async function GET(request: NextRequest) {
  const sessionUser = getSessionUserFromRequest(request);
  if (!sessionUser) {
    return NextResponse.json(
      { error: "Yêu cầu đăng nhập xác thực để xem báo cáo chuyên sâu liên năm." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const baseYear = Number(searchParams.get("base_year") || 2021);
  const targetYear = Number(searchParams.get("target_year") || 2026);

  const candidateBases = [
    process.env.INTERNAL_API_URL,
    "http://api:8000",
    "http://localhost:8000",
  ].filter(Boolean) as string[];

  for (const base of candidateBases) {
    try {
      const res = await fetch(
        `${base.replace(/\/+$/, "")}/api/v1/reports/annual-comparison?base_year=${baseYear}&target_year=${targetYear}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({
          ...buildAnnualComparativeReport(baseYear, targetYear),
          backend_engine: data,
        });
      }
    } catch {
      // Fallback to local engine
    }
  }

  return NextResponse.json(buildAnnualComparativeReport(baseYear, targetYear));
}
