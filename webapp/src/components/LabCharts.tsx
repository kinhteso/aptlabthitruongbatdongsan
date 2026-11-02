"use client";

import React, { useMemo, useState } from "react";
import {
  analyzeJobPostingForSalaryDeal,
  computeYearValuationMultiplier,
  SAMPLE_JD_POSTINGS_FOR_DEAL,
  type AnnualComparativeReportData,
  type JobPostingDealAnalysis,
} from "@/lib/labData";

const PILLAR_COLORS: Record<string, string> = {
  "DE-01": "#38bdf8",
  "DE-02": "#34d399",
  "DE-03": "#f59e0b",
  "DE-04": "#a78bfa",
};

/**
 * 1. Biểu đồ Dải Phân vị Lương (P10-P25-P50-P75-P90) & Quỹ đạo Lương theo Năm (2021 -> 2026) tại Mục 1
 */
export function ValuationMultiYearFanChart(props: {
  selectedYear?: number;
  valuationYear?: number;
  priceMode: "NOMINAL" | "REAL_CPI_2026";
  p10_2026?: number;
  p25_2026?: number;
  p50_2026?: number;
  p75_2026?: number;
  p90_2026?: number;
  baseP50_2026?: number;
  selectedSkills?: string[];
  p10?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p90?: number;
  yearlyMultipliers?: Array<{
    year: number;
    nominalMult: number;
    realMult: number;
    effectiveMult: number;
  }>;
}) {
  const selectedYear = props.selectedYear ?? props.valuationYear ?? 2026;
  const priceMode = props.priceMode;
  const p50_2026 = props.p50_2026 ?? props.baseP50_2026 ?? props.p50 ?? 25.0;
  const p25_2026 = props.p25_2026 ?? Number((p50_2026 * 0.84).toFixed(2));
  const p10_2026 = props.p10_2026 ?? Number((p50_2026 * 0.72).toFixed(2));
  const p75_2026 = props.p75_2026 ?? Number((p50_2026 * 1.18).toFixed(2));
  const p90_2026 = props.p90_2026 ?? Number((p50_2026 * 1.36).toFixed(2));

  const yearlyMultipliers =
    props.yearlyMultipliers ??
    [2021, 2022, 2023, 2024, 2025, 2026].map((yr) => {
      const m = computeYearValuationMultiplier(
        yr,
        priceMode,
        props.selectedSkills ?? []
      );
      return {
        year: yr,
        nominalMult: m.nominal_multiplier,
        realMult: m.real_cpi_2026_multiplier,
        effectiveMult: m.effective_multiplier,
      };
    });

  const series = yearlyMultipliers.map((ym) => ({
    year: ym.year,
    p10: Number((p10_2026 * ym.effectiveMult).toFixed(1)),
    p25: Number((p25_2026 * ym.effectiveMult).toFixed(1)),
    p50: Number((p50_2026 * ym.effectiveMult).toFixed(1)),
    p75: Number((p75_2026 * ym.effectiveMult).toFixed(1)),
    p90: Number((p90_2026 * ym.effectiveMult).toFixed(1)),
    nomP50: Number((p50_2026 * ym.nominalMult).toFixed(1)),
    realP50: Number((p50_2026 * ym.realMult).toFixed(1)),
  }));

  const maxVal = Math.max(45, ...series.map((s) => s.p90)) * 1.12;
  const W = 640;
  const H = 235;
  const padL = 46;
  const padR = 24;
  const padT = 24;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xOf = (idx: number) =>
    padL + (idx / Math.max(1, series.length - 1)) * plotW;
  const yOf = (val: number) =>
    padT + plotH - (Math.min(maxVal, Math.max(0, val)) / maxVal) * plotH;

  const p90Points = series.map((s, i) => `${xOf(i)},${yOf(s.p90)}`);
  const p10RevPoints = [...series]
    .reverse()
    .map((s, revI) => {
      const i = series.length - 1 - revI;
      return `${xOf(i)},${yOf(s.p10)}`;
    });
  const outerFanPolygon = [...p90Points, ...p10RevPoints].join(" ");

  const p75Points = series.map((s, i) => `${xOf(i)},${yOf(s.p75)}`);
  const p25RevPoints = [...series]
    .reverse()
    .map((s, revI) => {
      const i = series.length - 1 - revI;
      return `${xOf(i)},${yOf(s.p25)}`;
    });
  const innerFanPolygon = [...p75Points, ...p25RevPoints].join(" ");

  const p50Polyline = series.map((s, i) => `${xOf(i)},${yOf(s.p50)}`).join(" ");
  const realP50Polyline = series
    .map((s, i) => `${xOf(i)},${yOf(s.realP50)}`)
    .join(" ");

  return (
    <div
      style={{
        background: "#0b1120",
        border: "1px solid #334155",
        borderRadius: "0.65rem",
        padding: "0.75rem",
        marginBottom: "1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.4rem",
          marginBottom: "0.4rem",
        }}
      >
        <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f8fafc" }}>
          📈 Biểu đồ Tiến hóa Dải Phân vị Lương P10–P90 của Hồ sơ Đang Chọn qua
          Các Năm (2021 → 2026)
        </div>
        <div
          style={{
            display: "flex",
            gap: "0.65rem",
            flexWrap: "wrap",
            fontSize: "0.72rem",
            color: "#cbd5e1",
          }}
        >
          <span>
            <span style={{ color: "#38bdf8" }}>●</span> P50 (
            {priceMode === "REAL_CPI_2026"
              ? "Thực tế CPI 2026"
              : "Danh nghĩa"}
            )
          </span>
          <span>
            <span style={{ color: "#f59e0b" }}>---</span> Sức mua Thực tế (CPI
            2026)
          </span>
          <span>
            <span style={{ color: "#6366f1" }}>■</span> Dải P25–P75 &amp;
            P10–P90
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
          const val = Math.round(maxVal * t);
          const y = yOf(val);
          return (
            <g key={idx}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke="#1e293b"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 6}
                y={y + 4}
                textAnchor="end"
                fill="#94a3b8"
                fontSize="10"
              >
                {val}tr
              </text>
            </g>
          );
        })}

        {/* Vùng P10 - P90 */}
        <polygon points={outerFanPolygon} fill="rgba(99, 102, 241, 0.14)" />
        {/* Vùng P25 - P75 */}
        <polygon points={innerFanPolygon} fill="rgba(56, 189, 248, 0.24)" />

        {/* Đường Sức mua thực tế CPI */}
        <polyline
          fill="none"
          stroke="#f59e0b"
          strokeWidth="1.8"
          strokeDasharray="5 4"
          points={realP50Polyline}
        />

        {/* Đường Trung vị P50 */}
        <polyline
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2.8"
          points={p50Polyline}
        />

        {series.map((s, i) => {
          const cx = xOf(i);
          const cy = yOf(s.p50);
          const isSelected = s.year === selectedYear;
          return (
            <g key={s.year}>
              {isSelected && (
                <line
                  x1={cx}
                  y1={padT}
                  x2={cx}
                  y2={H - padB}
                  stroke="#34d399"
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={isSelected ? 5.5 : 3.8}
                fill={isSelected ? "#34d399" : "#38bdf8"}
                stroke="#0f172a"
                strokeWidth="1.5"
              />
              <text
                x={cx}
                y={cy - 9}
                textAnchor="middle"
                fill={isSelected ? "#34d399" : "#e2e8f0"}
                fontSize={isSelected ? "11" : "9.5"}
                fontWeight={isSelected ? "700" : "600"}
              >
                {s.p50}tr
              </text>
              <text
                x={cx}
                y={H - 10}
                textAnchor="middle"
                fill={isSelected ? "#34d399" : "#94a3b8"}
                fontSize="10.5"
                fontWeight={isSelected ? "700" : "500"}
              >
                {s.year}
                {isSelected ? " ★" : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * 2. Biểu đồ Thác nước Đóng góp SHAP & So sánh ROI Kỹ năng Khuyến nghị (UPS) tại Mục 1
 */
export function ShapAndUpsChart(props: {
  basePay?: number;
  baseWage?: number;
  expBonus?: number;
  synergyBonus?: number;
  selectedSkillsData?: Array<{ id: string; name: string; shap: number }>;
  selectedSkillContributions?: Array<{
    id: string;
    name: string;
    addon: number;
  }>;
  missingRecommendations?: Array<{
    id: string;
    name: string;
    gain: string | number;
    ups: string | number;
  }>;
  recommendations?: Array<{
    id: string;
    name: string;
    gain: string | number;
    ups: string | number;
  }>;
}) {
  const basePay =
    props.basePay ??
    Number(
      (
        (props.baseWage ?? 15) +
        (props.expBonus ?? 0) +
        (props.synergyBonus ?? 0)
      ).toFixed(2)
    );
  const selectedSkillsData =
    props.selectedSkillsData ??
    (props.selectedSkillContributions ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      shap: s.addon,
    }));
  const missingRecommendations =
    props.missingRecommendations ?? props.recommendations ?? [];
  const maxShap = Math.max(
    6,
    basePay,
    ...selectedSkillsData.map((s) => s.shap)
  );

  return (
    <div className="rwd-subgrid-2" style={{ marginBottom: "1rem" }}>
      {/* Cột trái: Biểu đồ Đóng góp Biên SHAP */}
      <div
        style={{
          background: "#0b1120",
          border: "1px solid #334155",
          borderRadius: "0.65rem",
          padding: "0.75rem",
        }}
      >
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 700,
            color: "#38bdf8",
            marginBottom: "0.5rem",
          }}
        >
          📊 Biểu đồ Giải thích Đóng góp Biên SHAP (φ₀ + Σφⱼ)
        </div>
        <div style={{ display: "grid", gap: "0.4rem" }}>
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.74rem",
                color: "#cbd5e1",
              }}
            >
              <span>Lương cơ sở kỳ vọng (φ₀)</span>
              <strong>{basePay.toFixed(1)} tr.VNĐ</strong>
            </div>
            <div
              style={{
                height: "8px",
                background: "#1e293b",
                borderRadius: "4px",
                overflow: "hidden",
                marginTop: "2px",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, (basePay / maxShap) * 100)}%`,
                  height: "100%",
                  background: "#6366f1",
                }}
              />
            </div>
          </div>
          {selectedSkillsData.map((sk) => (
            <div key={sk.id}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.74rem",
                  color: "#cbd5e1",
                }}
              >
                <span>+ {sk.name}</span>
                <strong style={{ color: "#34d399" }}>
                  +{sk.shap.toFixed(1)} tr.VNĐ
                </strong>
              </div>
              <div
                style={{
                  height: "8px",
                  background: "#1e293b",
                  borderRadius: "4px",
                  overflow: "hidden",
                  marginTop: "2px",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, (sk.shap / 6.0) * 100)}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #10b981, #38bdf8)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cột phải: Biểu đồ Khuyến nghị Kỹ năng UPS */}
      <div
        style={{
          background: "#0b1120",
          border: "1px solid #334155",
          borderRadius: "0.65rem",
          padding: "0.75rem",
        }}
      >
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 700,
            color: "#34d399",
            marginBottom: "0.5rem",
          }}
        >
          🚀 Biểu đồ Điểm Ưu tiên Học tập (UPS) &amp; Phần bù Kỳ vọng
        </div>
        <div style={{ display: "grid", gap: "0.45rem" }}>
          {missingRecommendations.map((item) => {
            const upsNum = Number(item.ups) || 1;
            const gainNum = Number(item.gain) || 1;
            return (
              <div key={item.id}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.74rem",
                    color: "#cbd5e1",
                  }}
                >
                  <span>{item.name}</span>
                  <span>
                    <strong style={{ color: "#34d399" }}>
                      +{item.gain}tr
                    </strong>{" "}
                    • <strong style={{ color: "#f59e0b" }}>UPS {item.ups}</strong>
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "4px",
                    marginTop: "2px",
                  }}
                >
                  <div
                    style={{
                      height: "7px",
                      background: "#1e293b",
                      borderRadius: "4px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, (gainNum / 6.0) * 100)}%`,
                        height: "100%",
                        background: "#34d399",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      height: "7px",
                      background: "#1e293b",
                      borderRadius: "4px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, (upsNum / 3.5) * 100)}%`,
                        height: "100%",
                        background: "#f59e0b",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * 3. Biểu đồ Tháp Nghề nghiệp 6 Tầng (T1 -> T6) Đối xứng (Tỷ trọng Việc làm & Dải Lương) tại Mục 2
 */
const DEFAULT_PYRAMID_TIERS = [
  {
    code: "T1_INTERN",
    label: "T1. Intern / Trainee",
    sharePct: 14.2,
    p25: 3.5,
    p50: 4.8,
    p75: 6.2,
  },
  {
    code: "T2_FRESHER",
    label: "T2. Fresher (0–1 năm)",
    sharePct: 19.0,
    p25: 8.0,
    p50: 10.2,
    p75: 13.0,
  },
  {
    code: "T3_JUNIOR",
    label: "T3. Junior Specialist",
    sharePct: 29.8,
    p25: 13.5,
    p50: 17.5,
    p75: 22.0,
  },
  {
    code: "T4_MIDDLE_SENIOR",
    label: "T4. Middle / Senior",
    sharePct: 24.5,
    p25: 24.0,
    p50: 32.5,
    p75: 44.0,
  },
  {
    code: "T5_LEAD_MANAGER",
    label: "T5. Team Lead / Manager",
    sharePct: 9.3,
    p25: 44.0,
    p50: 56.0,
    p75: 76.0,
  },
  {
    code: "T6_DIRECTOR",
    label: "T6. Head / Director",
    sharePct: 3.2,
    p25: 78.0,
    p50: 96.0,
    p75: 135.0,
  },
];

export function CareerPyramidSvgChart(props: {
  tiers?: Array<{
    code: string;
    label: string;
    sharePct: number;
    p25: number;
    p50: number;
    p75: number;
  }>;
  currentTier?: string;
}) {
  const tiers = props.tiers ?? DEFAULT_PYRAMID_TIERS;
  const ordered = [...tiers].reverse(); // T6 ở đỉnh, T1 ở đáy

  return (
    <div
      style={{
        background: "#0b1120",
        border: "1px solid #334155",
        borderRadius: "0.65rem",
        padding: "0.85rem",
        marginBottom: "1rem",
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
        <div style={{ fontSize: "0.84rem", fontWeight: 700, color: "#f8fafc" }}>
          🏛️ Biểu đồ Cấu trúc Tháp Nghề nghiệp 6 Tầng: Tỷ trọng Cầu Tuyển dụng
          (%) ↔ Phân vị Lương P25–P50–P75
        </div>
        <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
          Trái: Tỷ trọng bản tin tuyển dụng (%) | Phải: Mức lương trung vị P50
          (Dải P25–P75 triệu VNĐ)
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.45rem" }}>
        {ordered.map((t) => (
          <div
            key={t.code}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(110px, 1.2fr) 2fr 2.2fr",
              gap: "0.6rem",
              alignItems: "center",
              background: "#1e293b",
              padding: "0.45rem 0.65rem",
              borderRadius: "0.45rem",
            }}
          >
            <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "#e2e8f0" }}>
              {t.label}
            </div>
            {/* Thanh tỷ trọng việc làm */}
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.72rem",
                  color: "#38bdf8",
                }}
              >
                <span>Độ phủ tuyển dụng</span>
                <strong>{t.sharePct}%</strong>
              </div>
              <div
                style={{
                  height: "9px",
                  background: "#0f172a",
                  borderRadius: "4px",
                  overflow: "hidden",
                  marginTop: "2px",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, t.sharePct * 2.5)}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #6366f1, #38bdf8)",
                  }}
                />
              </div>
            </div>
            {/* Thanh Dải lương P25-P50-P75 */}
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.72rem",
                  color: "#34d399",
                }}
              >
                <span>P25: {t.p25}tr</span>
                <strong>P50: {t.p50} tr.VNĐ</strong>
                <span>P75: {t.p75}tr</span>
              </div>
              <div
                style={{
                  position: "relative",
                  height: "9px",
                  background: "#0f172a",
                  borderRadius: "4px",
                  marginTop: "2px",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: `${Math.min(90, (t.p25 / 110) * 100)}%`,
                    width: `${Math.max(
                      4,
                      Math.min(95, ((t.p75 - t.p25) / 110) * 100)
                    )}%`,
                    height: "100%",
                    background: "rgba(52, 211, 153, 0.45)",
                    borderRadius: "4px",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: `${Math.min(96, (t.p50 / 110) * 100)}%`,
                    width: "4px",
                    height: "100%",
                    background: "#34d399",
                    borderRadius: "2px",
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 4. Biểu đồ Forest Plot Hệ số Mincer & Ma trận Định vị Kỹ năng 2x2 (SDF vs. SHAP) tại Mục 3
 */
const DEFAULT_MINCER_COEFS = [
  {
    variable: "SK_GENAI_LLM (GenAI, LLM, RAG)",
    beta: 0.182,
    se: 0.021,
    pctImpact: "+19.96%",
  },
  {
    variable: "SK_ML_DL_FRAMEWORKS (PyTorch/XGBoost)",
    beta: 0.168,
    se: 0.024,
    pctImpact: "+18.29%",
  },
  {
    variable: "SK_SPARK_BIGDATA (Spark, Kafka)",
    beta: 0.151,
    se: 0.026,
    pctImpact: "+16.30%",
  },
  {
    variable: "SK_CLOUD_PLATFORM (AWS/GCP/Azure)",
    beta: 0.139,
    se: 0.022,
    pctImpact: "+14.91%",
  },
  {
    variable: "SYN_SQL_PYTHON (Cộng hưởng SQL × Python)",
    beta: 0.064,
    se: 0.025,
    pctImpact: "+6.61%",
  },
  {
    variable: "imr_lambda (Heckman Selection λ)",
    beta: -0.018,
    se: 0.031,
    pctImpact: "p > 0.05 (ns)",
  },
];

const DEFAULT_SKILLS_SCATTER = [
  { name: "GenAI/LLM", sdfPct: 34.6, shapVnd: 6.4, quadrant: "CORE" },
  { name: "ML/PyTorch", sdfPct: 24.0, shapVnd: 4.9, quadrant: "NICHE" },
  { name: "Airflow/dbt", sdfPct: 29.8, shapVnd: 4.8, quadrant: "NICHE" },
  { name: "AWS/GCP", sdfPct: 44.2, shapVnd: 4.3, quadrant: "CORE" },
  { name: "Python", sdfPct: 56.4, shapVnd: 3.6, quadrant: "CORE" },
  { name: "SQL", sdfPct: 68.5, shapVnd: 2.2, quadrant: "BASE" },
  { name: "Power BI", sdfPct: 48.0, shapVnd: 2.1, quadrant: "BASE" },
];

export function MincerAndSkillMatrixChart(props: {
  mincerCoefs?: Array<{
    variable: string;
    beta: number;
    se: number;
    pctImpact: string;
  }>;
  skillsScatter?: Array<{
    name: string;
    sdfPct: number;
    shapVnd: number;
    quadrant: string;
  }>;
}) {
  const mincerCoefs = props.mincerCoefs ?? DEFAULT_MINCER_COEFS;
  const skillsScatter = props.skillsScatter ?? DEFAULT_SKILLS_SCATTER;
  const W = 440;
  const H = 220;

  return (
    <div className="rwd-subgrid-2" style={{ marginBottom: "1rem" }}>
      {/* Trái: Forest Plot Hệ số Mincer */}
      <div
        style={{
          background: "#0b1120",
          border: "1px solid #334155",
          borderRadius: "0.65rem",
          padding: "0.75rem",
        }}
      >
        <div
          style={{
            fontSize: "0.82rem",
            fontWeight: 700,
            color: "#38bdf8",
            marginBottom: "0.5rem",
          }}
        >
          📐 Biểu đồ Forest Plot Hệ số Hồi quy Mincer (β̂ ± 1.96·SE_HC3)
        </div>
        <div style={{ display: "grid", gap: "0.45rem" }}>
          {mincerCoefs.map((c, idx) => {
            const absBeta = Math.abs(c.beta);
            const isPos = c.beta >= 0;
            return (
              <div key={idx}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.73rem",
                    color: "#cbd5e1",
                  }}
                >
                  <span>{c.variable}</span>
                  <strong style={{ color: isPos ? "#34d399" : "#f87171" }}>
                    β = {c.beta > 0 ? `+${c.beta}` : c.beta} ({c.pctImpact})
                  </strong>
                </div>
                <div
                  style={{
                    height: "7px",
                    background: "#1e293b",
                    borderRadius: "4px",
                    overflow: "hidden",
                    marginTop: "2px",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, (absBeta / 0.35) * 100)}%`,
                      height: "100%",
                      background: isPos ? "#34d399" : "#f87171",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Phải: Biểu đồ Phân tán 2x2 Ma trận Định vị Kỹ năng (SDF x SHAP) */}
      <div
        style={{
          background: "#0b1120",
          border: "1px solid #334155",
          borderRadius: "0.65rem",
          padding: "0.75rem",
        }}
      >
        <div
          style={{
            fontSize: "0.82rem",
            fontWeight: 700,
            color: "#f59e0b",
            marginBottom: "0.4rem",
          }}
        >
          🎯 Ma trận Định vị Kỹ năng 2×2: Tần suất Cầu (SDF%) × Phần bù SHAP
          (tr.VNĐ)
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          <rect
            x="40"
            y="15"
            width={W - 60}
            height={H - 45}
            fill="#0f172a"
            stroke="#334155"
          />
          {/* Đường chia 4 góc phần tư */}
          <line
            x1={40 + (W - 60) * 0.45}
            y1="15"
            x2={40 + (W - 60) * 0.45}
            y2={H - 30}
            stroke="#475569"
            strokeDasharray="4 4"
          />
          <line
            x1="40"
            y1={15 + (H - 45) * 0.5}
            x2={W - 20}
            y2={15 + (H - 45) * 0.5}
            stroke="#475569"
            strokeDasharray="4 4"
          />
          <text x="50" y="30" fill="#f59e0b" fontSize="9.5" fontWeight="700">
            Ngách Đột phá (Lương Rất Cao)
          </text>
          <text
            x={W - 30}
            y="30"
            textAnchor="end"
            fill="#34d399"
            fontSize="9.5"
            fontWeight="700"
          >
            Chiến lược Cốt lõi (Cầu Cao • Lương Cao)
          </text>
          <text
            x={W - 30}
            y={H - 36}
            textAnchor="end"
            fill="#38bdf8"
            fontSize="9.5"
            fontWeight="700"
          >
            Nền tảng Tiêu chuẩn (Baseline)
          </text>

          {skillsScatter.map((sk, idx) => {
            const cx = 40 + Math.min(0.95, sk.sdfPct / 75) * (W - 60);
            const cy =
              15 + (1 - Math.min(0.95, sk.shapVnd / 6.8)) * (H - 45);
            const color =
              sk.shapVnd >= 3.2
                ? sk.sdfPct >= 34
                  ? "#34d399"
                  : "#f59e0b"
                : "#38bdf8";
            return (
              <g key={idx}>
                <circle cx={cx} cy={cy} r="5" fill={color} />
                <text
                  x={cx}
                  y={cy - 7}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="9"
                >
                  {sk.name}
                </text>
              </g>
            );
          })}
          <text
            x={W / 2}
            y={H - 8}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="10"
          >
            Trục Hoành: Tần suất Yêu cầu của Thị trường SDF (%) →
          </text>
        </svg>
      </div>
    </div>
  );
}

/**
 * 5. Biểu đồ Đối chứng 4 Cổng Tuyển dụng & Khử trùng lặp Đa nguồn tại Mục 4
 */
const DEFAULT_PORTALS = [
  { site: "topcv", rawCount: 840, masterCount: 620, salaryDisclosedPct: 68.4 },
  { site: "itviec", rawCount: 410, masterCount: 335, salaryDisclosedPct: 74.2 },
  {
    site: "vietnamworks",
    rawCount: 650,
    masterCount: 485,
    salaryDisclosedPct: 52.8,
  },
  {
    site: "careerviet",
    rawCount: 462,
    masterCount: 350,
    salaryDisclosedPct: 48.5,
  },
];

export function MultiSourcePortalChart(props: {
  portals?: Array<{
    site: string;
    rawCount: number;
    masterCount: number;
    salaryDisclosedPct: number;
  }>;
}) {
  const portals = props.portals ?? DEFAULT_PORTALS;
  const maxRaw = Math.max(10, ...portals.map((p) => p.rawCount));

  return (
    <div
      style={{
        background: "#0b1120",
        border: "1px solid #334155",
        borderRadius: "0.65rem",
        padding: "0.85rem",
        marginBottom: "1rem",
      }}
    >
      <div
        style={{
          fontSize: "0.84rem",
          fontWeight: 700,
          color: "#f8fafc",
          marginBottom: "0.6rem",
        }}
      >
        📊 Biểu đồ So sánh Sản lượng Quét Thô (Bronze), Bản ghi Chuẩn Sau Khử
        Trùng lặp (Silver Master) &amp; Độ Minh bạch Lương giữa 4 Cổng
      </div>
      <div className="rwd-grid-4">
        {portals.map((p) => (
          <div
            key={p.site}
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "0.55rem",
              padding: "0.65rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.4rem",
              }}
            >
              <strong
                style={{
                  fontSize: "0.85rem",
                  color: "#38bdf8",
                  textTransform: "uppercase",
                }}
              >
                {p.site}
              </strong>
              <span className="badge badge-green">
                Minh bạch lương: {p.salaryDisclosedPct}%
              </span>
            </div>
            <div style={{ fontSize: "0.74rem", color: "#cbd5e1" }}>
              • Tin thô (Bronze): <strong>{p.rawCount}</strong>
            </div>
            <div
              style={{
                height: "7px",
                background: "#0f172a",
                borderRadius: "4px",
                overflow: "hidden",
                margin: "3px 0 6px",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, (p.rawCount / maxRaw) * 100)}%`,
                  height: "100%",
                  background: "#6366f1",
                }}
              />
            </div>
            <div style={{ fontSize: "0.74rem", color: "#cbd5e1" }}>
              • Bản ghi chuẩn (Master):{" "}
              <strong style={{ color: "#34d399" }}>{p.masterCount}</strong>
            </div>
            <div
              style={{
                height: "7px",
                background: "#0f172a",
                borderRadius: "4px",
                overflow: "hidden",
                marginTop: "3px",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, (p.masterCount / maxRaw) * 100)}%`,
                  height: "100%",
                  background: "#34d399",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 6. Bộ 5 Biểu đồ Chuyên sâu cho Báo cáo Đánh giá Theo Từng Năm & So sánh Liên Năm (2021 ↔ 2026)
 */
export function AnnualComparativeChartsSuite(props: {
  report: AnnualComparativeReportData;
  priceMode: "NOMINAL" | "REAL_CPI_2026";
}) {
  const { report, priceMode } = props;
  const series = report.annual_series_2021_2026;
  const maxYearJobs = Math.max(26000, ...series.map((s) => s.total_jobs));
  const W = 680;
  const H = 250;
  const padL = 52;
  const padR = 46;
  const padT = 26;
  const padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xOf = (idx: number) =>
    padL + (idx / Math.max(1, series.length - 1)) * plotW;
  const yWage = (w: number) => padT + plotH - (Math.min(42, w) / 42) * plotH;

  return (
    <div style={{ display: "grid", gap: "1rem", marginBottom: "1rem" }}>
      {/* Hàng Biểu đồ 1: Combo Chart Biến động Quy mô Tuyển dụng & Mặt bằng Lương 4 Lĩnh vực (2021 -> 2026) */}
      <div
        style={{
          background: "#0b1120",
          border: "1px solid #334155",
          borderRadius: "0.65rem",
          padding: "0.85rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
            marginBottom: "0.5rem",
          }}
        >
          <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#f8fafc" }}>
            📈 Biểu đồ BC-1: Diễn biến Quy mô Bản tin Tuyển dụng (Cột chồng)
            &amp; Mức lương Trung vị P50 của 4 Lĩnh vực qua Các Năm (2021 →
            2026)
          </div>
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              flexWrap: "wrap",
              fontSize: "0.73rem",
            }}
          >
            <span style={{ color: "#38bdf8" }}>● DE-01: Dữ liệu &amp; AI</span>
            <span style={{ color: "#34d399" }}>
              ● DE-02: TMĐT &amp; Sản phẩm số
            </span>
            <span style={{ color: "#f59e0b" }}>
              ● DE-03: Digital Marketing
            </span>
            <span style={{ color: "#a78bfa" }}>
              ● DE-04: FinTech &amp; BA
            </span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
            const y = padT + plotH * (1 - t);
            const jobsVal = Math.round((maxYearJobs * t) / 1000);
            const wageVal = Math.round(42 * t);
            return (
              <g key={idx}>
                <line
                  x1={padL}
                  y1={y}
                  x2={W - padR}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray="3 3"
                />
                <text
                  x={padL - 6}
                  y={y + 4}
                  textAnchor="end"
                  fill="#94a3b8"
                  fontSize="9.5"
                >
                  {jobsVal}k tin
                </text>
                <text
                  x={W - padR + 6}
                  y={y + 4}
                  textAnchor="start"
                  fill="#38bdf8"
                  fontSize="9.5"
                >
                  {wageVal}tr
                </text>
              </g>
            );
          })}

          {/* Cột chồng Quy mô bản tin theo từng năm */}
          {series.map((s, i) => {
            const cx = xOf(i);
            const barW = 36;
            let curY = padT + plotH;
            return (
              <g key={s.year}>
                {(["DE-01", "DE-02", "DE-03", "DE-04"] as const).map((pCode) => {
                  const jobs = s.pillars[pCode].jobs;
                  const h = (jobs / maxYearJobs) * plotH;
                  curY -= h;
                  return (
                    <rect
                      key={pCode}
                      x={cx - barW / 2}
                      y={curY}
                      width={barW}
                      height={Math.max(1, h)}
                      fill={PILLAR_COLORS[pCode]}
                      opacity="0.32"
                    />
                  );
                })}
                <text
                  x={cx}
                  y={curY - 5}
                  textAnchor="middle"
                  fill="#cbd5e1"
                  fontSize="9"
                  fontWeight="700"
                >
                  {(s.total_jobs / 1000).toFixed(1)}k
                </text>
                <text
                  x={cx}
                  y={H - 10}
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize="10.5"
                  fontWeight="700"
                >
                  Năm {s.year}
                </text>
              </g>
            );
          })}

          {/* 4 Đường xu hướng lương trung vị P50 của 4 Lĩnh vực */}
          {(["DE-01", "DE-02", "DE-03", "DE-04"] as const).map((pCode) => {
            const pts = series
              .map((s, i) => {
                const rawP50 = s.pillars[pCode].p50;
                const val =
                  priceMode === "REAL_CPI_2026"
                    ? rawP50 / s.cpi_index
                    : rawP50;
                return `${xOf(i)},${yWage(val)}`;
              })
              .join(" ");
            return (
              <g key={pCode}>
                <polyline
                  fill="none"
                  stroke={PILLAR_COLORS[pCode]}
                  strokeWidth="2.4"
                  points={pts}
                />
                {series.map((s, i) => {
                  const rawP50 = s.pillars[pCode].p50;
                  const val =
                    priceMode === "REAL_CPI_2026"
                      ? rawP50 / s.cpi_index
                      : rawP50;
                  return (
                    <circle
                      key={i}
                      cx={xOf(i)}
                      cy={yWage(val)}
                      r="3.5"
                      fill={PILLAR_COLORS[pCode]}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hàng Biểu đồ 2: Độ phủ Thành phố lớn x Ngành nghề & Phân rã Oaxaca-Blinder Liên Năm */}
      <div className="rwd-subgrid-2">
        {/* Trái: Biểu đồ Độ phủ Thị trường qua 6 Thành phố Lớn x 4 Lĩnh vực */}
        <div
          style={{
            background: "#0b1120",
            border: "1px solid #334155",
            borderRadius: "0.65rem",
            padding: "0.85rem",
          }}
        >
          <div
            style={{
              fontSize: "0.84rem",
              fontWeight: 700,
              color: "#34d399",
              marginBottom: "0.5rem",
            }}
          >
            🏙️ Biểu đồ BC-2: Độ phủ Thị trường Tuyển dụng qua 6 Thành phố Lớn
            &amp; Cơ cấu Ngành nghề (2021 → 2026)
          </div>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {report.city_coverage_matrix.map((c) => (
              <div
                key={c.city_code}
                style={{
                  background: "#1e293b",
                  padding: "0.5rem 0.65rem",
                  borderRadius: "0.45rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.75rem",
                    color: "#f8fafc",
                    marginBottom: "0.25rem",
                  }}
                >
                  <span>
                    <strong>{c.city_name}</strong> ({c.market_share_2026_pct}%
                    thị phần)
                  </span>
                  <span style={{ color: "#34d399", fontWeight: 700 }}>
                    {c.jobs_2021.toLocaleString("vi-VN")} →{" "}
                    {c.jobs_2026.toLocaleString("vi-VN")} tin (+{c.growth_pct}%)
                  </span>
                </div>
                {/* Thanh Stacked Bar 100% của 4 lĩnh vực tại thành phố */}
                <div
                  style={{
                    display: "flex",
                    height: "10px",
                    borderRadius: "5px",
                    overflow: "hidden",
                  }}
                >
                  {(["DE-01", "DE-02", "DE-03", "DE-04"] as const).map(
                    (pCode) => (
                      <div
                        key={pCode}
                        style={{
                          width: `${c.pillar_share_pct[pCode]}%`,
                          background: PILLAR_COLORS[pCode],
                        }}
                        title={`${pCode}: ${c.pillar_share_pct[pCode]}%`}
                      />
                    )
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.69rem",
                    color: "#94a3b8",
                    marginTop: "0.2rem",
                  }}
                >
                  <span>
                    Lương P50: {c.p50_2021}tr →{" "}
                    <strong style={{ color: "#38bdf8" }}>{c.p50_2026}tr</strong>{" "}
                    (+{c.wage_growth_pct}%)
                  </span>
                  <span>
                    Onsite {c.work_modes_2026.ONSITE}% • Hybrid{" "}
                    {c.work_modes_2026.HYBRID}% • Remote{" "}
                    {c.work_modes_2026.REMOTE}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Phải: Biểu đồ Thác nước Phân rã Oaxaca-Blinder & Chu kỳ Kỹ năng */}
        <div
          style={{
            background: "#0b1120",
            border: "1px solid #334155",
            borderRadius: "0.65rem",
            padding: "0.85rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.84rem",
                fontWeight: 700,
                color: "#f59e0b",
                marginBottom: "0.4rem",
              }}
            >
              ⚖️ Biểu đồ BC-3: Phân rã Tiền lương Liên Năm Oaxaca–Blinder (Năm{" "}
              {report.base_year} vs. Năm {report.target_year})
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "#cbd5e1",
                marginBottom: "0.5rem",
              }}
            >
              Mức lương trung vị toàn thị trường tăng từ{" "}
              <strong>
                {report.oaxaca_blinder_decomposition.base_mean_wage_vnd} tr.VNĐ
              </strong>{" "}
              ({report.base_year}) lên{" "}
              <strong style={{ color: "#34d399" }}>
                {report.oaxaca_blinder_decomposition.target_mean_wage_vnd}{" "}
                tr.VNĐ
              </strong>{" "}
              ({report.target_year}), tức{" "}
              <strong style={{ color: "#38bdf8" }}>
                +{report.oaxaca_blinder_decomposition.total_wage_change_vnd}{" "}
                tr.VNĐ (+
                {report.oaxaca_blinder_decomposition.total_wage_change_pct}%)
              </strong>
              , được giải thích bởi 3 nhân tố:
            </div>
            <div style={{ display: "grid", gap: "0.45rem" }}>
              {report.oaxaca_blinder_decomposition.components.map((comp) => (
                <div
                  key={comp.id}
                  style={{
                    background: "#1e293b",
                    padding: "0.48rem 0.65rem",
                    borderRadius: "0.45rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.74rem",
                      color: "#f8fafc",
                    }}
                  >
                    <span>{comp.label}</span>
                    <strong style={{ color: "#34d399" }}>
                      +{comp.delta_vnd} tr.VNĐ ({comp.share_of_increase_pct}%)
                    </strong>
                  </div>
                  <div
                    style={{
                      height: "8px",
                      background: "#0f172a",
                      borderRadius: "4px",
                      overflow: "hidden",
                      margin: "3px 0",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, comp.share_of_increase_pct * 1.8)}%`,
                        height: "100%",
                        background:
                          comp.id === "ENDOWMENT_EFFECT"
                            ? "#38bdf8"
                            : comp.id === "PRICE_RETURN_EFFECT"
                            ? "#34d399"
                            : "#f59e0b",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: "0.69rem", color: "#94a3b8" }}>
                    {comp.explanation}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Biểu đồ BC-4: Cơ hội Việc làm Sinh viên & Độ Minh bạch Lương qua các năm */}
          <div
            style={{
              background: "#1e293b",
              padding: "0.6rem",
              borderRadius: "0.5rem",
              border: "1px solid #334155",
            }}
          >
            <div
              style={{
                fontSize: "0.78rem",
                fontWeight: 700,
                color: "#38bdf8",
                marginBottom: "0.35rem",
              }}
            >
              🎓 Biểu đồ BC-4: Tỷ trọng Tuyển Sinh viên/Fresher (T1–T2) &amp;
              Minh bạch Lương (2021–2026)
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, 1fr)",
                gap: "0.35rem",
                textAlign: "center",
              }}
            >
              {series.map((s) => (
                <div
                  key={s.year}
                  style={{
                    background: "#0f172a",
                    padding: "0.35rem 0.2rem",
                    borderRadius: "0.35rem",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      color: "#f8fafc",
                    }}
                  >
                    {s.year}
                  </div>
                  <div
                    style={{
                      fontSize: "0.68rem",
                      color: "#34d399",
                      marginTop: "2px",
                    }}
                  >
                    SV: {s.student_entry_share_pct}%
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "#f59e0b" }}>
                    Lương: {s.salary_disclosed_pct}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


/**
 * 7. Trạm Phân tích Bản tin Tuyển dụng (JD) & Tư vấn Đàm phán Lương ("Deal Lương") với Doanh nghiệp
 */
export function JobPostingDealAdvisorPanel(props: {
  valuationYear: number;
  priceMode: "NOMINAL" | "REAL_CPI_2026";
  externalSeedJob?: {
    company_name: string;
    job_title: string;
    location_text: string;
    salary_text: string;
    jd_full_text: string;
  } | null;
  onSyncToSimulator?: (payload: {
    pillar: string;
    tier: string;
    city: string;
    expYears: number;
    skills: string[];
  }) => void;
}) {
  const defaultSample = SAMPLE_JD_POSTINGS_FOR_DEAL[0];
  const [companyName, setCompanyName] = useState<string>(
    defaultSample.company_name
  );
  const [jobTitle, setJobTitle] = useState<string>(defaultSample.job_title);
  const [locationText, setLocationText] = useState<string>(
    defaultSample.location_text
  );
  const [salaryText, setSalaryText] = useState<string>(
    defaultSample.salary_text
  );
  const [jdText, setJdText] = useState<string>(defaultSample.jd_full_text);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [syncedMsg, setSyncedMsg] = useState<string>("");

  React.useEffect(() => {
    if (props.externalSeedJob) {
      setCompanyName(props.externalSeedJob.company_name);
      setJobTitle(props.externalSeedJob.job_title);
      setLocationText(props.externalSeedJob.location_text);
      setSalaryText(props.externalSeedJob.salary_text);
      setJdText(props.externalSeedJob.jd_full_text);
    }
  }, [props.externalSeedJob]);

  const analysis: JobPostingDealAnalysis = useMemo(
    () =>
      analyzeJobPostingForSalaryDeal({
        jobTitle,
        companyName,
        locationText,
        salaryText,
        jdText,
        valuationYear: props.valuationYear,
        priceMode: props.priceMode,
      }),
    [
      jobTitle,
      companyName,
      locationText,
      salaryText,
      jdText,
      props.valuationYear,
      props.priceMode,
    ]
  );

  const loadSample = (sampleId: string) => {
    const found = SAMPLE_JD_POSTINGS_FOR_DEAL.find((s) => s.id === sampleId);
    if (!found) return;
    setCompanyName(found.company_name);
    setJobTitle(found.job_title);
    setLocationText(found.location_text);
    setSalaryText(found.salary_text);
    setJdText(found.jd_full_text);
    setSyncedMsg("");
  };

  const handleCopyScript = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(analysis.deal_strategy.negotiation_script_vi);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
    }
  };

  const handleSyncToProfile = () => {
    if (props.onSyncToSimulator) {
      props.onSyncToSimulator({
        pillar: analysis.extracted.sector_pillar,
        tier: analysis.extracted.career_tier,
        city: analysis.extracted.city_code,
        expYears: analysis.extracted.exp_years_mid,
        skills: analysis.extracted.matched_skills.map((s) => s.id),
      });
      setSyncedMsg(
        "✅ Đã đồng bộ Ngành, Tầng tháp, Đô thị, Năm KN & Danh sách Kỹ năng của JD xuống Bộ Mô phỏng Hồ sơ bên dưới!"
      );
      setTimeout(() => setSyncedMsg(""), 4000);
    }
  };

  const { extracted, valuation, deal_strategy } = analysis;
  const maxGauge = Math.max(valuation.p90_vnd * 1.12, extracted.employer_salary_max_vnd || 0, 25);
  const posPct = (val: number) =>
    Math.max(2, Math.min(98, Number(((val / maxGauge) * 100).toFixed(1))));

  return (
    <section
      className="lab-card"
      style={{
        border: "1px solid #38bdf8",
        background: "linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(11,17,32,0.98) 100%)",
        marginBottom: "1.25rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginBottom: "0.9rem",
        }}
      >
        <div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
            <span className="badge badge-blue">
              MỚI • AI JOB POSTING VALUATION &amp; SALARY DEAL ADVISOR
            </span>
            <span className="badge badge-green">
              Giải mã Tin &quot;Lương Thỏa thuận&quot; • Khuyến nghị 3 Mốc Deal Lương (P25 → P50 → P75)
            </span>
          </div>
          <h2 style={{ fontSize: "1.18rem", color: "#f8fafc", margin: 0 }}>
            💼 Dán Bản tin Tuyển dụng (JD) để Ước tính Mức Lương &amp; Tư vấn Chiến lược Deal Lương với Doanh nghiệp
          </h2>
          <p
            style={{
              fontSize: "0.82rem",
              color: "#94a3b8",
              marginTop: "0.3rem",
              lineHeight: 1.55,
            }}
          >
            Dán trực tiếp nội dung bất kỳ tin tuyển dụng nào (dù ghi mức lương cụ thể hay để{" "}
            <strong>&quot;Lương Thỏa thuận&quot;</strong>). Hệ thống tự động bóc tách{" "}
            <strong>Cấp bậc Tháp 6 tầng, Năm kinh nghiệm, Tổ hợp Kỹ năng 4 tầng &amp; 10 Cụm tương đương</strong>,
            phát hiện hiện tượng <em>&quot;ép cấp bậc / tuyển 1 người làm việc của 3 người&quot;</em> và tính ra{" "}
            <strong>3 mốc đàm phán lương kèm kịch bản trả lời HR</strong>.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {SAMPLE_JD_POSTINGS_FOR_DEAL.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => loadSample(s.id)}
              className="tab-btn"
              style={{
                fontSize: "0.74rem",
                padding: "0.38rem 0.65rem",
                border:
                  jobTitle === s.job_title
                    ? "1px solid #38bdf8"
                    : "1px solid #334155",
                background:
                  jobTitle === s.job_title ? "rgba(56,189,248,0.18)" : "#1e293b",
                color: jobTitle === s.job_title ? "#38bdf8" : "#cbd5e1",
              }}
            >
              ⚡ Mẫu JD #{idx + 1}: {s.label.split(":")[1]?.split("(")[0]?.trim() || s.id}
            </button>
          ))}
        </div>
      </div>

      <div className="rwd-grid-2">
        {/* CỘT TRÁI: Ô NHẬP / DÁN THÔNG TIN BẢN TIN TUYỂN DỤNG */}
        <div
          style={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "0.65rem",
            padding: "0.9rem",
            display: "grid",
            gap: "0.7rem",
            alignContent: "start",
          }}
        >
          <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#38bdf8" }}>
            1. Nhập hoặc Dán Nội dung Tin Tuyển dụng (Job Description — JD)
          </div>

          <div className="rwd-subgrid-2">
            <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
              Chức danh Tuyển dụng (Job Title):
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="VD: Senior Data Analyst / IT Business Analyst..."
                style={{
                  width: "100%",
                  marginTop: "0.25rem",
                  padding: "0.48rem 0.65rem",
                  background: "#1e293b",
                  color: "#fff",
                  border: "1px solid #475569",
                  borderRadius: "0.4rem",
                  fontSize: "0.82rem",
                }}
              />
            </label>

            <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
              Tên Doanh nghiệp / Ngân hàng (Tùy chọn):
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="VD: Techcombank, FPT Smart Cloud, MoMo..."
                style={{
                  width: "100%",
                  marginTop: "0.25rem",
                  padding: "0.48rem 0.65rem",
                  background: "#1e293b",
                  color: "#fff",
                  border: "1px solid #475569",
                  borderRadius: "0.4rem",
                  fontSize: "0.82rem",
                }}
              />
            </label>
          </div>

          <div className="rwd-subgrid-2">
            <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
              Địa điểm &amp; Hình thức làm việc trên JD:
              <input
                type="text"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder="VD: Hà Nội (Cầu Giấy • Hybrid) hoặc TP.HCM..."
                style={{
                  width: "100%",
                  marginTop: "0.25rem",
                  padding: "0.48rem 0.65rem",
                  background: "#1e293b",
                  color: "#fff",
                  border: "1px solid #475569",
                  borderRadius: "0.4rem",
                  fontSize: "0.82rem",
                }}
              />
            </label>

            <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
              Mức lương ghi trên JD (Để &quot;Thỏa thuận&quot; nếu ẩn lương):
              <input
                type="text"
                value={salaryText}
                onChange={(e) => setSalaryText(e.target.value)}
                placeholder="VD: Thỏa thuận, 18 - 25 triệu, $1,500 - $2,200..."
                style={{
                  width: "100%",
                  marginTop: "0.25rem",
                  padding: "0.48rem 0.65rem",
                  background: "#1e293b",
                  color: "#34d399",
                  fontWeight: 700,
                  border: "1px solid #34d399",
                  borderRadius: "0.4rem",
                  fontSize: "0.82rem",
                }}
              />
            </label>
          </div>

          <label style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
            Nội dung chi tiết Mô tả công việc &amp; Yêu cầu ứng viên (Copy &amp; Paste nguyên văn từ TopCV / ITviec / CareerViet / LinkedIn):
            <textarea
              rows={8}
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Dán toàn bộ Mô tả công việc (Responsibilities) và Yêu cầu ứng viên (Requirements) vào đây..."
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.6rem 0.7rem",
                background: "#1e293b",
                color: "#f8fafc",
                border: "1px solid #475569",
                borderRadius: "0.45rem",
                fontSize: "0.81rem",
                lineHeight: 1.5,
                fontFamily: "inherit",
              }}
            />
          </label>

          {/* Hộp Kết quả Bóc tách Tự động từ Văn bản JD */}
          <div
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "0.55rem",
              padding: "0.75rem",
              fontSize: "0.78rem",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: "#a78bfa",
                marginBottom: "0.45rem",
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.4rem",
              }}
            >
              <span>🔍 Kết quả AI Bóc tách Cấu trúc Bản tin (NLP Parser):</span>
              <span className="badge badge-purple">
                Phát hiện {extracted.matched_skills.length} Kỹ năng •{" "}
                {extracted.matched_macro_clusters.length} Cụm tương đương
              </span>
            </div>

            <div style={{ display: "grid", gap: "0.3rem", color: "#cbd5e1" }}>
              <div>
                • <strong>Trụ cột &amp; Nghề chuẩn:</strong>{" "}
                <span style={{ color: "#38bdf8", fontWeight: 700 }}>
                  {extracted.sector_pillar}
                </span>{" "}
                — {extracted.canonical_role_label}
              </div>
              <div>
                • <strong>Tầng Tháp &amp; Thâm niên yêu cầu:</strong>{" "}
                <span style={{ color: "#34d399", fontWeight: 700 }}>
                  {extracted.career_tier_label}
                </span>{" "}
                ({extracted.exp_years_mid} năm KN) • Khu vực:{" "}
                <strong>{extracted.city_code}</strong> ({extracted.work_mode})
              </div>
              <div>
                • <strong>Kỹ năng tạo phần bù lương trong JD:</strong>{" "}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.3rem",
                    marginTop: "0.3rem",
                  }}
                >
                  {extracted.matched_skills.map((sk) => (
                    <span
                      key={sk.id}
                      className="badge badge-blue"
                      style={{ fontSize: "0.71rem" }}
                    >
                      {sk.name.split(" (")[0]} (+{sk.shap_addon_vnd}tr)
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {(extracted.has_title_underleveling ||
              extracted.multi_role_overload_detected) && (
              <div
                style={{
                  marginTop: "0.55rem",
                  padding: "0.5rem 0.65rem",
                  background: "rgba(245, 158, 11, 0.14)",
                  border: "1px solid #f59e0b",
                  borderRadius: "0.45rem",
                  color: "#fde68a",
                  fontSize: "0.75rem",
                  lineHeight: 1.45,
                }}
              >
                ⚠️{" "}
                <strong>
                  Phát hiện Lợi thế Đàm phán Đặc biệt từ Yêu cầu JD:
                </strong>
                <br />
                {extracted.underleveling_warning || extracted.multi_role_note}
              </div>
            )}

            {props.onSyncToSimulator && (
              <div style={{ marginTop: "0.6rem" }}>
                <button
                  type="button"
                  onClick={handleSyncToProfile}
                  className="tab-btn active"
                  style={{
                    width: "100%",
                    fontSize: "0.78rem",
                    padding: "0.48rem 0.75rem",
                  }}
                >
                  🔄 Áp dụng Cấu hình JD này xuống Bộ Mô phỏng Hồ sơ Cá nhân
                </button>
                {syncedMsg && (
                  <div
                    style={{
                      marginTop: "0.35rem",
                      color: "#34d399",
                      fontSize: "0.74rem",
                      fontWeight: 600,
                    }}
                  >
                    {syncedMsg}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* CỘT PHẢI: KẾT QUẢ ĐỊNH GIÁ BẢN TIN & BẢNG CHIẾN LƯỢC DEAL LƯƠNG 3 MỐC */}
        <div
          style={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "0.65rem",
            padding: "0.9rem",
            display: "grid",
            gap: "0.75rem",
            alignContent: "start",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.4rem",
            }}
          >
            <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#34d399" }}>
              2. Định giá Thị trường của Bản tin &amp; 3 Mốc Deal Lương (Năm{" "}
              {valuation.valuation_year})
            </div>
            <span
              className={`badge ${
                valuation.employer_offer_verdict === "BELOW_MARKET"
                  ? "badge-amber"
                  : valuation.employer_offer_verdict === "ABOVE_MARKET_PREMIUM"
                  ? "badge-green"
                  : "badge-blue"
              }`}
            >
              Chỉ số Vị thế Đàm phán: {deal_strategy.bargaining_power_score}/100
            </span>
          </div>

          {/* Hộp 3 Mốc Chiến lược Đàm phán Lương */}
          <div className="rwd-grid-3">
            <div
              style={{
                background: "#1e293b",
                border: "1px solid #475569",
                borderRadius: "0.55rem",
                padding: "0.65rem",
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                🛡️ MỐC 1: GIÁ SÀN (WALK-AWAY P25)
              </div>
              <div
                style={{
                  fontSize: "1.22rem",
                  fontWeight: 800,
                  color: "#f59e0b",
                  marginTop: "0.15rem",
                }}
              >
                {deal_strategy.walk_away_floor_vnd} tr.VNĐ
              </div>
              <div style={{ fontSize: "0.7rem", color: "#cbd5e1", marginTop: "0.2rem" }}>
                Mức tối thiểu không nên nhận thấp hơn cho khối lượng việc trong JD này.
              </div>
            </div>

            <div
              style={{
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid #10b981",
                borderRadius: "0.55rem",
                padding: "0.65rem",
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "#6ee7b7", fontWeight: 700 }}>
                🎯 MỐC 2: MỤC TIÊU CHỐT DEAL (P50–P65)
              </div>
              <div
                style={{
                  fontSize: "1.22rem",
                  fontWeight: 800,
                  color: "#34d399",
                  marginTop: "0.15rem",
                }}
              >
                {deal_strategy.target_fair_deal_min_vnd} –{" "}
                {deal_strategy.target_fair_deal_max_vnd} tr
              </div>
              <div style={{ fontSize: "0.7rem", color: "#d1fae5", marginTop: "0.2rem" }}>
                Vùng lương công bằng đôi bên (Win-Win) phản ánh đúng giá trị kỹ năng.
              </div>
            </div>

            <div
              style={{
                background: "rgba(56, 189, 248, 0.12)",
                border: "1px solid #38bdf8",
                borderRadius: "0.55rem",
                padding: "0.65rem",
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "#7dd3fc", fontWeight: 700 }}>
                🚀 MỐC 3: PHÁT GIÁ MỞ ĐẦU (ANCHOR P65–P75)
              </div>
              <div
                style={{
                  fontSize: "1.22rem",
                  fontWeight: 800,
                  color: "#38bdf8",
                  marginTop: "0.15rem",
                }}
              >
                {deal_strategy.anchor_opening_ask_min_vnd} –{" "}
                {deal_strategy.anchor_opening_ask_max_vnd} tr
              </div>
              <div style={{ fontSize: "0.7rem", color: "#e0f2fe", marginTop: "0.2rem" }}>
                Mức lương nên đề xuất đầu tiên khi HR hỏi để trừ hao biên độ thương lượng.
              </div>
            </div>
          </div>

          {/* Thước đo Trực quan Phổ Lương P10 -> P90 vs. Offer của Doanh nghiệp */}
          <div
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "0.55rem",
              padding: "0.75rem",
            }}
          >
            <div
              style={{
                fontSize: "0.78rem",
                fontWeight: 700,
                color: "#f8fafc",
                marginBottom: "0.35rem",
              }}
            >
              📏 Thước Đo Định Giá Thị Trường (P10 → P90) &amp; Đánh Giá Offer Doanh Nghiệp:
            </div>
            <div style={{ fontSize: "0.75rem", color: "#38bdf8", marginBottom: "0.55rem" }}>
              • <strong>Chẩn đoán Offer trên JD:</strong>{" "}
              <span style={{ color: "#f8fafc" }}>
                {valuation.employer_offer_verdict_label}
              </span>
            </div>

            <div
              style={{
                position: "relative",
                height: "28px",
                background: "#0f172a",
                borderRadius: "14px",
                border: "1px solid #334155",
                overflow: "hidden",
                marginBottom: "0.45rem",
              }}
            >
              {/* Dải P10 - P90 */}
              <div
                style={{
                  position: "absolute",
                  left: `${posPct(valuation.p10_vnd)}%`,
                  width: `${Math.max(4, posPct(valuation.p90_vnd) - posPct(valuation.p10_vnd))}%`,
                  top: "6px",
                  height: "14px",
                  background: "rgba(99, 102, 241, 0.28)",
                  borderRadius: "7px",
                }}
              />
              {/* Dải Tứ phân vị P25 - P75 (Vùng Đàm phán Chuẩn) */}
              <div
                style={{
                  position: "absolute",
                  left: `${posPct(valuation.p25_vnd)}%`,
                  width: `${Math.max(4, posPct(valuation.p75_vnd) - posPct(valuation.p25_vnd))}%`,
                  top: "4px",
                  height: "18px",
                  background:
                    "linear-gradient(90deg, #f59e0b 0%, #10b981 55%, #38bdf8 100%)",
                  borderRadius: "9px",
                }}
              />
              {/* Vạch P50 */}
              <div
                title={`Trung vị P50: ${valuation.p50_vnd} triệu VNĐ`}
                style={{
                  position: "absolute",
                  left: `${posPct(valuation.p50_vnd)}%`,
                  top: "0px",
                  width: "3px",
                  height: "26px",
                  background: "#ffffff",
                }}
              />
              {/* Nếu JD có công bố mức lương -> hiển thị dấu kim đỏ/vàng */}
              {!extracted.is_negotiable &&
                extracted.employer_salary_mid_vnd !== null && (
                  <div
                    title={`Lương trung bình trên JD: ${extracted.employer_salary_mid_vnd} triệu VNĐ`}
                    style={{
                      position: "absolute",
                      left: `${posPct(extracted.employer_salary_mid_vnd)}%`,
                      top: "0px",
                      width: "4px",
                      height: "26px",
                      background: "#ec4899",
                    }}
                  />
                )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.72rem",
                color: "#94a3b8",
                flexWrap: "wrap",
                gap: "0.35rem",
              }}
            >
              <span>P10: {valuation.p10_vnd}tr</span>
              <span style={{ color: "#f59e0b", fontWeight: 700 }}>
                P25 (Sàn): {valuation.p25_vnd}tr
              </span>
              <span style={{ color: "#fff", fontWeight: 700 }}>
                P50 (Trung vị): {valuation.p50_vnd}tr
              </span>
              <span style={{ color: "#38bdf8", fontWeight: 700 }}>
                P75 (Neo cao): {valuation.p75_vnd}tr
              </span>
              <span>P90: {valuation.p90_vnd}tr</span>
            </div>
          </div>

          {/* Luận cứ Đàm phán (Leverage Points) */}
          <div
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "0.55rem",
              padding: "0.75rem",
              fontSize: "0.77rem",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: "#f8fafc",
                marginBottom: "0.4rem",
              }}
            >
              📌 Các Luận cứ Định lượng Dùng Để Bảo vệ Mức Lương Khi Phỏng vấn:
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.1rem",
                color: "#cbd5e1",
                display: "grid",
                gap: "0.3rem",
                lineHeight: 1.5,
              }}
            >
              {deal_strategy.key_leverage_points.map((pt, i) => (
                <li key={i}>{pt}</li>
              ))}
            </ul>
          </div>

          {/* Kịch bản Mẫu Trả lời HR / Email Deal Lương */}
          <div
            style={{
              background: "rgba(99, 102, 241, 0.1)",
              border: "1px solid #6366f1",
              borderRadius: "0.55rem",
              padding: "0.75rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.4rem",
                flexWrap: "wrap",
              }}
            >
              <strong style={{ fontSize: "0.79rem", color: "#c7d2fe" }}>
                💬 Mẫu Câu Trả Lời HR / Email Đàm phán Lương (Tự động sinh theo JD):
              </strong>
              <button
                type="button"
                onClick={handleCopyScript}
                className="tab-btn active"
                style={{ fontSize: "0.72rem", padding: "0.28rem 0.65rem" }}
              >
                {copiedScript ? "✅ Đã Copy Kịch bản!" : "📋 Copy Câu Trả lời Deal Lương"}
              </button>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "0.77rem",
                color: "#e2e8f0",
                fontStyle: "italic",
                lineHeight: 1.55,
              }}
            >
              {deal_strategy.negotiation_script_vi}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
