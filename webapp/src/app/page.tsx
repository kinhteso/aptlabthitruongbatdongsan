"use client";

import React, { useEffect, useState } from "react";
import {
  AppRole,
  computeYearValuationMultiplier,
  PUBLIC_SECTION_INTRODUCTIONS,
  SectionIntroMeta,
  SKILLS_CATALOG,
  TabKey,
} from "@/lib/labData";
import {
  ShapAndUpsChart,
  ValuationMultiYearFanChart,
} from "@/components/LabCharts";
import RealEstateWardAndPortalHub from "@/components/RealEstateWardAndPortalHub";

const INTRO_TAB_KEYS: Exclude<TabKey, "valuation">[] = [
  "pyramid",
  "econometrics",
  "provenance",
  "rbac",
  "mcp",
  "errors",
  "scraped",
];

export default function PublicLandingPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("valuation");
  const [currentUser, setCurrentUser] = useState<{
    email: string;
    name: string;
    picture?: string;
    role: AppRole;
    isFirstUser: boolean;
  } | null>(null);
  const [oauthInfo, setOauthInfo] = useState<{
    google_client_id: string;
    redirect_uri: string;
    admin_emails: string[];
  }>({
    google_client_id:
      "647264796658-h96idjs8hohr4hf8pjid8i531lqr2gra.apps.googleusercontent.com",
    redirect_uri: "http://localhost:3359/api/auth/callback/google",
    admin_emails: [
      "phungtuananh3333@gmail.com",
      "phungtuananh2222@gmail.com",
    ],
  });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginTargetTab, setLoginTargetTab] = useState<TabKey>("pyramid");
  const [loginEmailInput, setLoginEmailInput] = useState("");
  const [loginPasswordInput, setLoginPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const [pillar, setPillar] = useState("DE-01");
  const [tier, setTier] = useState("T3_JUNIOR");
  const [city, setCity] = useState("HCM");
  const [expYears, setExpYears] = useState(2.0);
  const [valuationYear, setValuationYear] = useState<number>(2026);
  const [priceMode, setPriceMode] = useState<"NOMINAL" | "REAL_CPI_2026">(
    "NOMINAL"
  );
  const [selectedSkills, setSelectedSkills] = useState<string[]>([
    "SK_EXCEL",
    "SK_SQL",
    "SK_POWERBI",
  ]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authErr = params.get("auth_error");
    if (authErr) {
      setShowLoginModal(true);
      setLoginError(
        `Google OAuth trả về mã lỗi "${authErr}". Vui lòng kiểm tra GOOGLE_CLIENT_SECRET trong .env hoặc thêm Redirect URI chuẩn (http://localhost:3359/api/auth/callback/google) trên Google Cloud Console, hoặc đăng nhập bằng Mật khẩu Bảo mật Lab bên dưới.`
      );
    }

    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data?.authenticated && data?.user) {
          setCurrentUser(data.user);
        }
        if (data?.oauth_config) {
          setOauthInfo({
            google_client_id:
              data.oauth_config.google_client_id ||
              "647264796658-h96idjs8hohr4hf8pjid8i531lqr2gra.apps.googleusercontent.com",
            redirect_uri:
              data.oauth_config.redirect_uri ||
              "http://localhost:3359/api/auth/callback/google",
            admin_emails: data.oauth_config.admin_emails || [
              "phungtuananh3333@gmail.com",
              "phungtuananh2222@gmail.com",
            ],
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleSecurePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);
    const destTab = loginTargetTab || activeTab;
    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmailInput.trim(),
          password: loginPasswordInput,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.authenticated) {
        setLoginError(
          data?.error || "Xác thực thất bại. Vui lòng kiểm tra lại email và mật khẩu!"
        );
        setIsLoggingIn(false);
        return;
      }
      if (data?.user) {
        setCurrentUser(data.user);
        window.location.href = `/workspace?tab=${encodeURIComponent(destTab)}`;
        return;
      }
    } catch {
      setLoginError("Không thể kết nối máy chủ xác thực. Vui lòng thử lại!");
    }
    setIsLoggingIn(false);
  };

  const openLoginModalForTab = (tab: TabKey) => {
    setLoginTargetTab(tab === "valuation" ? "pyramid" : tab);
    setLoginError("");
    setShowLoginModal(true);
  };

  const toggleSkill = (id: string) => {
    setSelectedSkills((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const tierBaseMap: Record<string, number> = {
    T1_INTERN: 4.5,
    T2_FRESHER: 9.8,
    T3_JUNIOR: 16.2,
    T4_MIDDLE_SENIOR: 29.5,
    T5_LEAD_MANAGER: 52.0,
    T6_DIRECTOR: 88.0,
  };
  const cityMultMap: Record<string, number> = {
    HCM: 1.02,
    HN: 0.97,
    DN: 0.83,
    BD: 0.88,
    REMOTE: 1.18,
  };
  const skillShapAddon: Record<string, number> = {
    SK_EXCEL: 0.4,
    SK_SQL: 1.9,
    SK_PYTHON: 2.8,
    SK_POWERBI: 1.6,
    SK_SPARK_BIGDATA: 3.6,
    SK_AIRFLOW_DBT: 2.7,
    SK_CLOUD_PLATFORM: 3.4,
    SK_ML_DL_FRAMEWORKS: 4.2,
    SK_GENAI_LLM: 4.6,
    SK_DATA_MODELING_DWH: 2.4,
    SK_STATISTICAL_AB_TESTING: 1.9,
    SK_REQUIREMENTS_SRS_BRD: 2.1,
    SK_FINTECH_CREDIT_RISK: 3.5,
    SK_AGILE_SCRUM: 1.2,
    SK_ENGLISH_PROFESSIONAL: 3.1,
  };

  const baseWage = (tierBaseMap[tier] || 16.0) * (cityMultMap[city] || 1.0);
  const expBonus = Math.min(18.0, expYears * 1.35);
  const skillsBonus = selectedSkills.reduce(
    (acc, sk) => acc + (skillShapAddon[sk] || 1.0),
    0
  );
  const synergyBonus =
    selectedSkills.includes("SK_SQL") && selectedSkills.includes("SK_PYTHON")
      ? 1.8
      : 0.0;

  const p50_2026 = Number(
    (baseWage + expBonus + skillsBonus + synergyBonus).toFixed(2)
  );
  const p25_2026 = Number((p50_2026 * 0.84).toFixed(2));
  const p10_2026 = Number((p50_2026 * 0.72).toFixed(2));
  const p75_2026 = Number((p50_2026 * 1.18).toFixed(2));
  const p90_2026 = Number((p50_2026 * 1.36).toFixed(2));

  const yearAdj = computeYearValuationMultiplier(
    valuationYear,
    priceMode,
    selectedSkills
  );
  const effMult = yearAdj.effective_multiplier;

  const p50 = Number((p50_2026 * effMult).toFixed(2));
  const p25 = Number((p25_2026 * effMult).toFixed(2));
  const p10 = Number((p10_2026 * effMult).toFixed(2));
  const p75 = Number((p75_2026 * effMult).toFixed(2));
  const p90 = Number((p90_2026 * effMult).toFixed(2));

  const yearlyMultipliers = [2021, 2022, 2023, 2024, 2025, 2026].map((yr) => {
    const m = computeYearValuationMultiplier(yr, priceMode, selectedSkills);
    return {
      year: yr,
      nominalMult: m.nominal_multiplier,
      realMult: m.real_cpi_2026_multiplier,
      effectiveMult: m.effective_multiplier,
    };
  });

  const selectedSkillsChartData = selectedSkills.map((skId) => {
    const found = SKILLS_CATALOG.find((s) => s.id === skId);
    return {
      id: skId,
      name: found ? found.name : skId,
      shap: Number(((skillShapAddon[skId] || 1.0) * effMult).toFixed(2)),
    };
  });

  const missingRecommendations = SKILLS_CATALOG.filter(
    (s) => !selectedSkills.includes(s.id)
  )
    .map((s) => {
      const gain = Number(((skillShapAddon[s.id] || 1.5) * effMult).toFixed(2));
      const diff =
        s.layer === "L1_FOUNDATION" ? 1 : s.layer === "L2_TOOL" ? 3 : 3.5;
      const ups = Number(
        ((0.5 * gain + 1.8) / Math.pow(diff, 0.7)).toFixed(2)
      );
      return { ...s, gain: String(gain), ups: String(ups) };
    })
    .sort((a, b) => Number(b.ups) - Number(a.ups))
    .slice(0, 5);

  const currentIntro: SectionIntroMeta | null =
    activeTab !== "valuation"
      ? PUBLIC_SECTION_INTRODUCTIONS[activeTab]
      : null;

  return (
    <main className="lab-container">
      {/* Header Trang ngoài (Public Landing Portal) */}
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
            PropValue.AI — Lab Nghiên cứu & Định giá Thị trường Bất động sản Việt Nam (34/63 Tỉnh Thành)
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
            Định giá tự động BĐS Cấp Phường/Xã (Hedonic OLS + Heckman 2-Step + LightGBM Quantile + Empirical Bayes + SHAP), Quét 34/63 Tỉnh Thành & Lịch sử 2021–2026.
          </p>
        </div>

        {/* Hộp Đăng nhập / Vào Trang trong */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
          }}
        >
          {currentUser ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                flexWrap: "wrap",
              }}
            >
              {currentUser.picture && (
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
                <strong>{currentUser.email}</strong>{" "}
                <span className="badge badge-amber" style={{ marginLeft: "0.25rem" }}>
                  {currentUser.role}
                </span>
              </span>
              <a
                href={`/workspace?tab=${encodeURIComponent(activeTab)}`}
                className="tab-btn active"
                style={{ textDecoration: "none" }}
              >
                Vào Trang trong →
              </a>
              <button
                type="button"
                className="tab-btn"
                onClick={() => {
                  fetch("/api/auth/session", { method: "DELETE" }).then(() =>
                    setCurrentUser(null)
                  );
                }}
              >
                Đăng xuất
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <a
                href={`/api/auth/login?tab=${encodeURIComponent(
                  activeTab === "valuation" ? "pyramid" : activeTab
                )}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  background: "#fff",
                  color: "#0f172a",
                  padding: "0.5rem 0.9rem",
                  borderRadius: "0.55rem",
                  fontWeight: 700,
                  fontSize: "0.83rem",
                  textDecoration: "none",
                }}
              >
                <span style={{ color: "#2563eb", fontWeight: 900 }}>G</span>
                Đăng nhập Google
              </a>
              <button
                type="button"
                onClick={() => openLoginModalForTab(activeTab)}
                className="tab-btn active"
                style={{
                  padding: "0.5rem 0.95rem",
                  borderRadius: "0.55rem",
                  fontWeight: 700,
                  fontSize: "0.83rem",
                  cursor: "pointer",
                }}
              >
                Đăng nhập Lab
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Trung tâm Định giá BĐS Cấp Phường/Xã (34/63 Tỉnh Thành & 6 Phân khu Kinh tế) + Rà soát Cổng BĐS 2021-2026 */}
      <RealEstateWardAndPortalHub />

      {/* Hộp chọn nhanh 8 tính năng trên Điện thoại + Lưới 8 Mục tự động co giãn trên cả Điện thoại & Web */}
      <div className="mobile-quick-select-bar">
        <span style={{ fontSize: "0.78rem", color: "#38bdf8", fontWeight: 700, whiteSpace: "nowrap" }}>
          ☰ Chọn mục:
        </span>
        <select
          aria-label="Chọn mục tính năng"
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value as TabKey)}
        >
          <option value="valuation">1. Định giá Lương (P10–P90) &amp; SHAP</option>
          <option value="pyramid">2. Tháp Nghề nghiệp 6 Tầng &amp; Điểm UPS</option>
          <option value="econometrics">3. Kinh tế lượng Mincer &amp; Heckman</option>
          <option value="provenance">4. Khai thác &amp; Đối chứng Link Đa nguồn</option>
          <option value="rbac">5. Phân quyền RBAC &amp; Quản trị Lab</option>
          <option value="mcp">6. Trạm Truy vấn AI qua MCP</option>
          <option value="errors">7. Nhật ký Lỗi Quét (DLQ) &amp; Giờ GMT+07</option>
          <option value="scraped">8. Bản ghi Quét (Thời gian • Địa điểm • Nội dung)</option>
        </select>
      </div>

      {/* Thanh Điều hướng 8 Mục ở Trang ngoài (Hiển thị đầy đủ trên cả Điện thoại & Web) */}
      <nav className="desktop-tabs">
        <button
          className={`tab-btn ${activeTab === "valuation" ? "active" : ""}`}
          onClick={() => setActiveTab("valuation")}
        >
          1. Định giá Lương (P10–P90) &amp; SHAP
        </button>
        <button
          className={`tab-btn ${activeTab === "pyramid" ? "active" : ""}`}
          onClick={() => setActiveTab("pyramid")}
        >
          2. Tháp Nghề nghiệp 6 Tầng &amp; Điểm UPS
        </button>
        <button
          className={`tab-btn ${activeTab === "econometrics" ? "active" : ""}`}
          onClick={() => setActiveTab("econometrics")}
        >
          3. Kinh tế lượng Mincer &amp; Heckman
        </button>
        <button
          className={`tab-btn ${activeTab === "provenance" ? "active" : ""}`}
          onClick={() => setActiveTab("provenance")}
        >
          4. Khai thác &amp; Đối chứng Link Đa nguồn
        </button>
        <button
          className={`tab-btn ${activeTab === "rbac" ? "active" : ""}`}
          onClick={() => setActiveTab("rbac")}
        >
          5. Phân quyền RBAC &amp; Quản trị Lab
        </button>
        <button
          className={`tab-btn ${activeTab === "mcp" ? "active" : ""}`}
          onClick={() => setActiveTab("mcp")}
        >
          6. Trạm Truy vấn AI qua MCP
        </button>
        <button
          className={`tab-btn ${activeTab === "errors" ? "active" : ""}`}
          onClick={() => setActiveTab("errors")}
        >
          7. Nhật ký Lỗi Quét (DLQ) &amp; Giờ GMT+07
        </button>
        <button
          className={`tab-btn ${activeTab === "scraped" ? "active" : ""}`}
          onClick={() => setActiveTab("scraped")}
        >
          8. Bản ghi Quét (Thời gian • Địa điểm • Nội dung)
        </button>
      </nav>

      {/* MỤC 1: ĐỊNH GIÁ LƯƠNG (P10-P90) & SHAP (Mở trải nghiệm trực tiếp ở Trang ngoài) */}
      {activeTab === "valuation" && (
        <>
          <section className="rwd-grid-2">
            <div className="lab-card">
              <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>
                Cấu hình Hồ sơ Lao động Số (Công cụ Mở tại Trang ngoài)
              </h2>
              <div style={{ display: "grid", gap: "0.85rem" }}>
                <label style={{ fontSize: "0.85rem" }}>
                  Nhóm ngành Kinh tế số:
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
                      DE-01: Công nghệ, Dữ liệu &amp; AI
                    </option>
                    <option value="DE-02">
                      DE-02: Thương mại điện tử &amp; Product
                    </option>
                    <option value="DE-03">
                      DE-03: Digital Marketing &amp; MarTech
                    </option>
                    <option value="DE-04">
                      DE-04: FinTech &amp; Business Analytics (BA)
                    </option>
                  </select>
                </label>

                <label style={{ fontSize: "0.85rem" }}>
                  Tầng Tháp Nghề nghiệp Hiện tại:
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
                    <option value="T1_INTERN">Tầng 1: Intern / Trainee</option>
                    <option value="T2_FRESHER">
                      Tầng 2: Fresher (0 - 1 năm)
                    </option>
                    <option value="T3_JUNIOR">
                      Tầng 3: Junior Specialist (1 - 2.5 năm)
                    </option>
                    <option value="T4_MIDDLE_SENIOR">
                      Tầng 4: Middle / Senior (3 - 5+ năm)
                    </option>
                    <option value="T5_LEAD_MANAGER">
                      Tầng 5: Team Lead / Manager
                    </option>
                    <option value="T6_DIRECTOR">
                      Tầng 6: Head / Director / C-Level
                    </option>
                  </select>
                </label>

                <div className="rwd-subgrid-2">
                  <label style={{ fontSize: "0.85rem" }}>
                    Đô thị / Khu vực:
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
                      <option value="HCM">TP. Hồ Chí Minh</option>
                      <option value="HN">Hà Nội</option>
                      <option value="DN">Đà Nẵng</option>
                      <option value="BD">Đô thị Vệ tinh (BD/BN/HP)</option>
                      <option value="REMOTE">Remote Xuyên biên giới</option>
                    </select>
                  </label>

                  <label style={{ fontSize: "0.85rem" }}>
                    Số năm kinh nghiệm: <strong>{expYears} năm</strong>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.5}
                      value={expYears}
                      onChange={(e) => setExpYears(parseFloat(e.target.value))}
                      style={{ width: "100%", marginTop: "0.5rem" }}
                    />
                  </label>
                </div>

                {/* Bộ chọn Kỳ Năm Định giá (2021..2026) & Chế độ Lương Danh nghĩa / Thực tế CPI */}
                <div
                  className="rwd-subgrid-2"
                  style={{
                    background: "rgba(56, 189, 248, 0.08)",
                    border: "1px solid #38bdf8",
                    borderRadius: "0.55rem",
                    padding: "0.65rem",
                  }}
                >
                  <label style={{ fontSize: "0.82rem", color: "#e2e8f0" }}>
                    📅 Kỳ Năm Định giá Lương (Không gộp chung chuỗi thời gian):
                    <select
                      value={valuationYear}
                      onChange={(e) => setValuationYear(Number(e.target.value))}
                      style={{
                        width: "100%",
                        padding: "0.45rem",
                        marginTop: "0.25rem",
                        background: "#0f172a",
                        color: "#38bdf8",
                        fontWeight: 700,
                        border: "1px solid #38bdf8",
                        borderRadius: "0.4rem",
                      }}
                    >
                      <option value={2026}>
                        Năm 2026 (Thị trường Hiện hành / 12 tháng gần nhất)
                      </option>
                      <option value={2025}>Năm 2025 (Dữ liệu lịch sử 2025)</option>
                      <option value={2024}>Năm 2024 (Dữ liệu lịch sử 2024)</option>
                      <option value={2023}>Năm 2023 (Dữ liệu lịch sử 2023)</option>
                      <option value={2022}>Năm 2022 (Dữ liệu lịch sử 2022)</option>
                      <option value={2021}>Năm 2021 (Dữ liệu lịch sử 2021)</option>
                    </select>
                  </label>

                  <label style={{ fontSize: "0.82rem", color: "#e2e8f0" }}>
                    💱 Hệ quy chiếu Tiền lương (CPI Deflator):
                    <select
                      value={priceMode}
                      onChange={(e) =>
                        setPriceMode(
                          e.target.value as "NOMINAL" | "REAL_CPI_2026"
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "0.45rem",
                        marginTop: "0.25rem",
                        background: "#0f172a",
                        color: "#34d399",
                        fontWeight: 700,
                        border: "1px solid #34d399",
                        borderRadius: "0.4rem",
                      }}
                    >
                      <option value="NOMINAL">
                        Lương Danh nghĩa tại Năm {valuationYear} (Nominal Wage)
                      </option>
                      <option value="REAL_CPI_2026">
                        Lương Thực tế quy đổi Sức mua 2026 (CPI-Adjusted)
                      </option>
                    </select>
                  </label>
                </div>

                <div>
                  <div style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                    Chọn các Kỹ năng Số hiện có (Click để bật/tắt):
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
                Kết quả Dự báo Phân vị Lương (LightGBM Quantile) &amp; Đóng góp
                SHAP
              </h2>
              <div
                style={{
                  background: "#1e293b",
                  padding: "1rem",
                  borderRadius: "0.75rem",
                  marginBottom: "1rem",
                }}
              >
                <div
                  style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}
                >
                  Mức lương Trung vị Kỳ vọng tại{" "}
                  <strong style={{ color: "#34d399" }}>
                    Năm {valuationYear}
                  </strong>{" "}
                  ({priceMode === "REAL_CPI_2026" ? "Sức mua CPI 2026" : "Danh nghĩa"}
                  ):
                </div>
                <div
                  style={{
                    fontSize: "2rem",
                    fontWeight: 800,
                    color: "#38bdf8",
                  }}
                >
                  {p50} triệu VNĐ / tháng
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
                    {p25} – {p75} tr.VNĐ
                  </strong>{" "}
                  | Khoảng tin cậy 80% (P10 – P90):{" "}
                  <strong>
                    {p10} – {p90} tr.VNĐ
                  </strong>
                </div>
              </div>

              {/* Biểu đồ Tiến hóa Dải Phân vị Lương P10-P90 qua các năm (2021 -> 2026) */}
              <ValuationMultiYearFanChart
                selectedYear={valuationYear}
                priceMode={priceMode}
                p10_2026={p10_2026}
                p25_2026={p25_2026}
                p50_2026={p50_2026}
                p75_2026={p75_2026}
                p90_2026={p90_2026}
                yearlyMultipliers={yearlyMultipliers}
              />

              {/* Biểu đồ Thác nước Đóng góp SHAP & Điểm Ưu tiên Học tập UPS */}
              <ShapAndUpsChart
                basePay={Number(((baseWage + expBonus) * effMult).toFixed(2))}
                selectedSkillsData={selectedSkillsChartData}
                missingRecommendations={missingRecommendations}
              />

              <h3 style={{ fontSize: "0.95rem", marginBottom: "0.6rem" }}>
                Khuyến nghị Nâng cấp Kỹ năng Tối ưu ROI (Upskilling Priority
                Score - UPS)
              </h3>
              <div className="table-scroll">
                <table className="lab-table">
                  <thead>
                    <tr>
                      <th>Kỹ năng Gợi ý Học thêm</th>
                      <th>Tầng Ontology</th>
                      <th>Phần bù SHAP Kỳ vọng</th>
                      <th>Điểm Ưu tiên UPS</th>
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
                          +{item.gain} tr.VNĐ
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

          {/* Danh mục Giới thiệu 6 Phân hệ Chuyên sâu (Mục 2 - 7) ở Trang ngoài */}
          <section className="lab-card" style={{ marginTop: "1.25rem" }}>
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
                <h2 style={{ fontSize: "1.1rem" }}>
                  Giới thiệu 6 Phân hệ Nghiên cứu &amp; Quản trị Chuyên sâu (Mục
                  2 – 7)
                </h2>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  Tại Trang ngoài, các mục 2 – 7 hiển thị lời giới thiệu tổng
                  quan. Nhấn vào từng mục để đọc giới thiệu hoặc đăng nhập vào
                  Trang trong để xem chi tiết.
                </p>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 275px), 1fr))",
                gap: "1rem",
              }}
            >
              {INTRO_TAB_KEYS.map((k) => {
                const item = PUBLIC_SECTION_INTRODUCTIONS[k];
                return (
                  <div
                    key={k}
                    style={{
                      background: "#1e293b",
                      border: "1px solid #334155",
                      borderRadius: "0.75rem",
                      padding: "1rem",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                    }}
                  >
                    <div>
                      <span
                        className="badge badge-blue"
                        style={{ marginBottom: "0.4rem" }}
                      >
                        {item.badgeText}
                      </span>
                      <h3
                        style={{
                          fontSize: "0.95rem",
                          color: "#f8fafc",
                          marginBottom: "0.4rem",
                        }}
                      >
                        {item.shortTitle}
                      </h3>
                      <p
                        style={{
                          fontSize: "0.82rem",
                          color: "#cbd5e1",
                          lineHeight: 1.5,
                        }}
                      >
                        {item.summaryParagraph}
                      </p>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        type="button"
                        className="tab-btn"
                        style={{ fontSize: "0.78rem", padding: "0.4rem 0.75rem" }}
                        onClick={() => setActiveTab(k)}
                      >
                        Xem lời giới thiệu Mục {item.number}
                      </button>
                      {currentUser ? (
                        <a
                          href={`/workspace?tab=${k}`}
                          className="tab-btn active"
                          style={{
                            fontSize: "0.78rem",
                            padding: "0.4rem 0.75rem",
                            textDecoration: "none",
                          }}
                        >
                          Vào Trang trong xem chi tiết →
                        </a>
                      ) : (
                        <button
                          type="button"
                          className="tab-btn active"
                          style={{
                            fontSize: "0.78rem",
                            padding: "0.4rem 0.75rem",
                          }}
                          onClick={() => openLoginModalForTab(k)}
                        >
                          Login xem chi tiết →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* 6 MỤC TỪ MỤC 2 ĐẾN MỤC 7 Ở TRANG NGOÀI: CHỈ HIỂN THỊ LỜI GIỚI THIỆU, MUỐN XEM CHI TIẾT PHẢI LOGIN VÀO TRANG TRONG */}
      {currentIntro && (
        <section className="lab-card">
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
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: "0.4rem",
                }}
              >
                <span className="badge badge-blue">
                  LỜI GIỚI THIỆU TẠI TRANG NGOÀI (MỤC {currentIntro.number}/7)
                </span>
                <span className="badge badge-green">
                  {currentIntro.badgeText}
                </span>
              </div>
              <h2 style={{ fontSize: "1.25rem", color: "#f8fafc" }}>
                {currentIntro.fullTitle}
              </h2>
            </div>
          </div>

          {/* Nội dung Lời giới thiệu & Phương pháp luận */}
          <div
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "0.75rem",
              padding: "1.25rem",
              marginBottom: "1.25rem",
            }}
          >
            <h3
              style={{
                fontSize: "0.95rem",
                color: "#38bdf8",
                marginBottom: "0.5rem",
              }}
            >
              1. Giới thiệu Tổng quan Phân hệ
            </h3>
            <p
              style={{
                fontSize: "0.92rem",
                color: "#e2e8f0",
                lineHeight: 1.65,
                marginBottom: "1rem",
              }}
            >
              {currentIntro.summaryParagraph}
            </p>

            <h3
              style={{
                fontSize: "0.95rem",
                color: "#38bdf8",
                marginBottom: "0.5rem",
              }}
            >
              2. Phương pháp Luận &amp; Kiến trúc Kỹ thuật
            </h3>
            <p
              style={{
                fontSize: "0.9rem",
                color: "#cbd5e1",
                lineHeight: 1.65,
                marginBottom: "1rem",
              }}
            >
              {currentIntro.methodologyNote}
            </p>

            <h3
              style={{
                fontSize: "0.95rem",
                color: "#34d399",
                marginBottom: "0.5rem",
              }}
            >
              3. Nội dung Chi tiết Được Mở khóa tại Trang trong (Sau khi Login)
            </h3>
            <ul
              style={{
                paddingLeft: "1.25rem",
                color: "#cbd5e1",
                fontSize: "0.88rem",
                lineHeight: 1.7,
              }}
            >
              {currentIntro.innerDetailsList.map((detail, idx) => (
                <li key={idx} style={{ marginBottom: "0.25rem" }}>
                  {detail}
                </li>
              ))}
            </ul>
          </div>

          {/* Hộp Yêu cầu Đăng nhập vào Trang trong để xem chi tiết */}
          <div
            style={{
              padding: "1.25rem",
              background: "rgba(99, 102, 241, 0.12)",
              border: "1px solid #6366f1",
              borderRadius: "0.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.85rem",
            }}
          >
            <div>
              <strong style={{ fontSize: "0.98rem", color: "#f8fafc" }}>
                🔐 Truy cập Trang trong để xem chi tiết Mục {currentIntro.number}{" "}
                ({currentIntro.shortTitle}):
              </strong>
              <p
                style={{
                  fontSize: "0.88rem",
                  color: "#cbd5e1",
                  marginTop: "0.35rem",
                }}
              >
                Theo quy định bảo mật của Phòng thí nghiệm, 6 mục từ{" "}
                <strong>Mục 2 đến Mục 7</strong> ở Trang ngoài chỉ hiển thị lời
                giới thiệu. Để xem toàn bộ bảng số liệu chi tiết, cấu hình hệ
                thống và thực thi công cụ tương tác, vui lòng đăng nhập để vào{" "}
                <strong>Trang trong (/workspace)</strong>.
              </p>
            </div>

            {currentUser ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                }}
              >
                <a
                  href={`/workspace?tab=${encodeURIComponent(currentIntro.tabKey)}`}
                  className="tab-btn active"
                  style={{
                    textDecoration: "none",
                    padding: "0.65rem 1.2rem",
                    fontSize: "0.9rem",
                  }}
                >
                  Vào Trang trong xem chi tiết Mục {currentIntro.number} ngay (
                  {currentUser.email} • {currentUser.role}) →
                </a>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.65rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openLoginModalForTab(currentIntro.tabKey)}
                    style={{
                      background: "#fff",
                      color: "#0f172a",
                      padding: "0.6rem 1.15rem",
                      borderRadius: "0.55rem",
                      fontWeight: 700,
                      fontSize: "0.88rem",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Đăng nhập xác thực để vào Trang trong xem chi tiết →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Thanh chuyển nhanh xem lời giới thiệu các mục khác trong nhóm Mục 2 - 7 */}
          <div
            style={{
              marginTop: "1.25rem",
              paddingTop: "1rem",
              borderTop: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Xem lời giới thiệu các mục khác (2 – 7):
            </span>
            {INTRO_TAB_KEYS.map((k) => {
              const item = PUBLIC_SECTION_INTRODUCTIONS[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setActiveTab(k)}
                  className={`tab-btn ${activeTab === k ? "active" : ""}`}
                  style={{ fontSize: "0.78rem", padding: "0.35rem 0.7rem" }}
                >
                  {item.shortTitle}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Hộp Thoại Đăng nhập (Hỗ trợ cả Đăng nhập Trực tiếp bằng Email Lab & Google OAuth 2.0) */}
      {showLoginModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2, 6, 23, 0.82)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 100,
          }}
        >
          <div
            className="lab-card"
            style={{
              width: "100%",
              maxWidth: "540px",
              border: "1px solid #6366f1",
              boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.85rem",
              }}
            >
              <h2 style={{ fontSize: "1.15rem", color: "#f8fafc" }}>
                Đăng nhập vào Trang trong (/workspace)
              </h2>
              <button
                type="button"
                className="tab-btn"
                style={{ padding: "0.25rem 0.6rem" }}
                onClick={() => setShowLoginModal(false)}
              >
                Đóng ✕
              </button>
            </div>

            {/* Cách 1: Xác thực bằng Email được cấp phép + Mật khẩu Bảo mật Lab */}
            <form
              onSubmit={handleSecurePasswordLogin}
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
                  marginBottom: "0.4rem",
                }}
              >
                1. Đăng nhập bằng Tài khoản &amp; Mật khẩu Bảo mật Lab
              </div>
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "#cbd5e1",
                  marginBottom: "0.75rem",
                }}
              >
                Dành cho Chủ nhiệm Đề tài và thành viên nghiên cứu đã được cấp
                quyền trong hệ thống:
              </p>

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
                    value={loginEmailInput}
                    onChange={(e) => setLoginEmailInput(e.target.value)}
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
                    value={loginPasswordInput}
                    onChange={(e) => setLoginPasswordInput(e.target.value)}
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
                  style={{
                    padding: "0.6rem 1rem",
                    fontSize: "0.85rem",
                    marginTop: "0.25rem",
                  }}
                >
                  {isLoggingIn
                    ? "Đang xác thực bảo mật..."
                    : "Xác thực & Vào Trang trong →"}
                </button>
              </div>
            </form>

            {/* Cách 2: Đăng nhập qua Google OAuth 2.0 Redirect */}
            <div
              style={{
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "0.65rem",
                padding: "1rem",
              }}
            >
              <div
                style={{
                  fontSize: "0.88rem",
                  fontWeight: 700,
                  color: "#38bdf8",
                  marginBottom: "0.4rem",
                }}
              >
                2. Đăng nhập qua Cổng Google OAuth 2.0
              </div>
              <p
                style={{
                  fontSize: "0.78rem",
                  color: "#94a3b8",
                  marginBottom: "0.65rem",
                  lineHeight: 1.5,
                }}
              >
                Xác thực trực tiếp qua tài khoản Google OAuth 2.0 (Tự động cấp quyền{" "}
                <code>ADMIN</code> cho <code>{oauthInfo.admin_emails.join(", ")}</code>{" "}
                hoặc người dùng đầu tiên; <code>RESEARCHER</code> cho{" "}
                <code>*.edu.vn</code>):
              </p>
              <div
                style={{
                  fontSize: "0.72rem",
                  color: "#cbd5e1",
                  background: "#0f172a",
                  padding: "0.45rem 0.65rem",
                  borderRadius: "0.4rem",
                  border: "1px solid #334155",
                  marginBottom: "0.65rem",
                  wordBreak: "break-all",
                }}
              >
                • <strong>Redirect URI (Port 3359):</strong>{" "}
                <code>{oauthInfo.redirect_uri}</code>
              </div>
              <a
                href={`/api/auth/login?tab=${encodeURIComponent(loginTargetTab)}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  background: "#fff",
                  color: "#0f172a",
                  padding: "0.5rem 1rem",
                  borderRadius: "0.45rem",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  textDecoration: "none",
                }}
              >
                <span style={{ color: "#2563eb", fontWeight: 900 }}>G</span>
                Đăng nhập với Google →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (Hiển thị ĐẦY ĐỦ 8 tính năng trên Điện thoại & Tablet) */}
      <nav className="mobile-bottom-nav" aria-label="Menu điều hướng nhanh 8 tính năng trên di động">
        <button
          className={`tab-btn ${activeTab === "valuation" ? "active" : ""}`}
          onClick={() => setActiveTab("valuation")}
        >
          1. Định giá
        </button>
        <button
          className={`tab-btn ${activeTab === "pyramid" ? "active" : ""}`}
          onClick={() => setActiveTab("pyramid")}
        >
          2. Tháp NN
        </button>
        <button
          className={`tab-btn ${activeTab === "econometrics" ? "active" : ""}`}
          onClick={() => setActiveTab("econometrics")}
        >
          3. Mincer
        </button>
        <button
          className={`tab-btn ${activeTab === "provenance" ? "active" : ""}`}
          onClick={() => setActiveTab("provenance")}
        >
          4. Đa nguồn
        </button>
        <button
          className={`tab-btn ${activeTab === "rbac" ? "active" : ""}`}
          onClick={() => setActiveTab("rbac")}
        >
          5. RBAC
        </button>
        <button
          className={`tab-btn ${activeTab === "mcp" ? "active" : ""}`}
          onClick={() => setActiveTab("mcp")}
        >
          6. AI MCP
        </button>
        <button
          className={`tab-btn ${activeTab === "errors" ? "active" : ""}`}
          onClick={() => setActiveTab("errors")}
        >
          7. Lỗi DLQ
        </button>
        <button
          className={`tab-btn ${activeTab === "scraped" ? "active" : ""}`}
          onClick={() => setActiveTab("scraped")}
        >
          8. Bản ghi
        </button>
      </nav>
    </main>
  );
}
