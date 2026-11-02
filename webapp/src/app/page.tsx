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

const ALL_TAB_KEYS: TabKey[] = [
  "valuation",
  "pyramid",
  "econometrics",
  "provenance",
  "rbac",
  "mcp",
  "errors",
  "scraped",
];

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
  const [loginTargetTab, setLoginTargetTab] = useState<TabKey>("valuation");
  const [loginEmailInput, setLoginEmailInput] = useState("");
  const [loginPasswordInput, setLoginPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const [valuationSubMode, setValuationSubMode] = useState<
    "ALL" | "WARD_HUB" | "SIMULATOR"
  >("ALL");
  const [pillar, setPillar] = useState("DE-01");
  const [tier, setTier] = useState("T3_JUNIOR");
  const [city, setCity] = useState("HN");
  const [expYears, setExpYears] = useState(75);
  const [valuationYear, setValuationYear] = useState<number>(2026);
  const [priceMode, setPriceMode] = useState<"NOMINAL" | "REAL_CPI_2026">(
    "NOMINAL"
  );
  const [selectedSkills, setSelectedSkills] = useState<string[]>([
    "SK_EXCEL",
    "SK_SQL",
    "SK_POWERBI",
    "SK_SPARK_BIGDATA",
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
    setLoginTargetTab(tab);
    setLoginError("");
    setShowLoginModal(true);
  };

  const canUserAccessTab = (tab: TabKey): boolean => {
    if (!currentUser) return false;
    if (tab === "valuation") return true;
    if (currentUser.role === "VIEWER") return false;
    if (tab === "rbac") return currentUser.role === "ADMIN";
    if (tab === "errors") {
      return currentUser.role === "OPERATOR" || currentUser.role === "ADMIN";
    }
    return true;
  };

  const toggleSkill = (id: string) => {
    setSelectedSkills((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const tierBaseMap: Record<string, number> = {
    T1_INTERN: 24.0,
    T2_FRESHER: 42.0,
    T3_JUNIOR: 64.0,
    T4_MIDDLE_SENIOR: 92.0,
    T5_LEAD_MANAGER: 148.0,
    T6_DIRECTOR: 265.0,
  };
  const cityMultMap: Record<string, number> = {
    HN: 1.04,
    HCM: 1.02,
    DN: 0.78,
    BD: 0.68,
    REMOTE: 0.88,
  };
  const skillShapAddon: Record<string, number> = {
    SK_EXCEL: 12.5,
    SK_SQL: 16.5,
    SK_PYTHON: 34.0,
    SK_POWERBI: 13.8,
    SK_SPARK_BIGDATA: 15.4,
    SK_AIRFLOW_DBT: 11.2,
    SK_CLOUD_PLATFORM: 14.0,
    SK_ML_DL_FRAMEWORKS: 11.8,
    SK_GENAI_LLM: 19.5,
    SK_DATA_MODELING_DWH: 8.5,
    SK_STATISTICAL_AB_TESTING: 10.6,
    SK_REQUIREMENTS_SRS_BRD: 7.8,
    SK_FINTECH_CREDIT_RISK: 14.5,
    SK_AGILE_SCRUM: 5.5,
    SK_ENGLISH_PROFESSIONAL: 12.2,
  };

  const baseWage = (tierBaseMap[tier] || 64.0) * (cityMultMap[city] || 1.0);
  const expBonus = Number(Math.min(18.0, Math.max(3.5, expYears * 0.08)).toFixed(2));
  const skillsBonus = selectedSkills.reduce(
    (acc, sk) => acc + (skillShapAddon[sk] || 8.0),
    0
  );
  const synergyBonus =
    (selectedSkills.includes("SK_SQL") || selectedSkills.includes("SK_PYTHON")) &&
    selectedSkills.includes("SK_POWERBI")
      ? 8.5
      : 0.0;

  const p50_2026 = Number(
    (baseWage + expBonus + skillsBonus + synergyBonus).toFixed(2)
  );
  const p25_2026 = Number((p50_2026 * 0.86).toFixed(2));
  const p10_2026 = Number((p50_2026 * 0.75).toFixed(2));
  const p75_2026 = Number((p50_2026 * 1.16).toFixed(2));
  const p90_2026 = Number((p50_2026 * 1.32).toFixed(2));

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
  const totalValueBilVnd = Number(((p50 * expYears) / 1000).toFixed(2));
  const totalValueP25BilVnd = Number(((p25 * expYears) / 1000).toFixed(2));
  const totalValueP75BilVnd = Number(((p75 * expYears) / 1000).toFixed(2));

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
      shap: Number(((skillShapAddon[skId] || 8.0) * effMult).toFixed(2)),
    };
  });

  const missingRecommendations = SKILLS_CATALOG.filter(
    (s) => !selectedSkills.includes(s.id)
  )
    .map((s) => {
      const gain = Number(((skillShapAddon[s.id] || 8.5) * effMult).toFixed(2));
      const diff =
        s.layer.startsWith("L1_") ? 1.2 : s.layer.startsWith("L2_") ? 2.5 : 3.2;
      const ups = Number(
        ((0.22 * gain + 1.5) / Math.pow(diff, 0.65)).toFixed(2)
      );
      return { ...s, gain: String(gain), ups: String(ups) };
    })
    .sort((a, b) => Number(b.ups) - Number(a.ups))
    .slice(0, 5);

  const isValuationUnlocked = Boolean(currentUser) && activeTab === "valuation";
  const currentIntro: SectionIntroMeta | null = !isValuationUnlocked
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
            Định giá tự động BĐS Cấp Phường/Xã (Hedonic OLS + Heckman 2-Step + LightGBM Quantile + Empirical Bayes + SHAP) • Tất cả 8 mục yêu cầu đăng nhập xác thực (VIEWER chỉ xem Mục 1).
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
                href={`/workspace?tab=${encodeURIComponent(
                  canUserAccessTab(activeTab) ? activeTab : "valuation"
                )}`}
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
                href={`/api/auth/login?tab=${encodeURIComponent(activeTab)}`}
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

      {/* Hộp chọn nhanh 8 phân hệ BĐS trên Điện thoại + Lưới 8 Mục đồng nhất trên cả Điện thoại & Web */}
      <div className="mobile-quick-select-bar">
        <span style={{ fontSize: "0.78rem", color: "#38bdf8", fontWeight: 700, whiteSpace: "nowrap" }}>
          ☰ Chọn phân hệ BĐS:
        </span>
        <select
          aria-label="Chọn phân hệ định giá & nghiên cứu BĐS"
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value as TabKey)}
        >
          <option value="valuation">
            {canUserAccessTab("valuation") ? "🔓" : "🔒"} 1. Định giá BĐS Cấp Phường/Xã (34/63 Tỉnh) &amp; SHAP
          </option>
          <option value="pyramid">
            {canUserAccessTab("pyramid") ? "🔓" : "🔒"} 2. Tháp Phân tầng Giá BĐS 6 Tầng &amp; Từ điển 4 Lớp
          </option>
          <option value="econometrics">
            {canUserAccessTab("econometrics") ? "🔓" : "🔒"} 3. Kinh tế lượng Hedonic OLS &amp; Khử chệch Heckman
          </option>
          <option value="provenance">
            {canUserAccessTab("provenance") ? "🔓" : "🔒"} 4. Đối chứng Link Tin rao 6 Cổng BĐS (SHA-256)
          </option>
          <option value="rbac">
            {canUserAccessTab("rbac") ? "🔓" : "🔒"} 5. Phân quyền RBAC &amp; Quản trị Lab BĐS
          </option>
          <option value="mcp">
            {canUserAccessTab("mcp") ? "🔓" : "🔒"} 6. Trạm Truy vấn AI BĐS qua Giao thức MCP
          </option>
          <option value="errors">
            {canUserAccessTab("errors") ? "🔓" : "🔒"} 7. Nhật ký Lỗi Quét (DLQ) &amp; Đồng bộ Giờ GMT+07
          </option>
          <option value="scraped">
            {canUserAccessTab("scraped") ? "🔓" : "🔒"} 8. Kho Tin Rao Đã Quét (2021–2026 • 34/63 Tỉnh)
          </option>
        </select>
      </div>

      {/* Thanh Điều hướng 8 Phân hệ Bất động sản Chuẩn */}
      <nav className="desktop-tabs">
        <button
          className={`tab-btn ${activeTab === "valuation" ? "active" : ""}`}
          onClick={() => setActiveTab("valuation")}
        >
          {!canUserAccessTab("valuation") ? "🔒 " : ""}1. Định giá BĐS Cấp Phường/Xã (34/63 Tỉnh) &amp; SHAP
        </button>
        <button
          className={`tab-btn ${activeTab === "pyramid" ? "active" : ""}`}
          onClick={() => setActiveTab("pyramid")}
        >
          {!canUserAccessTab("pyramid") ? "🔒 " : ""}2. Tháp Phân tầng Giá BĐS 6 Tầng &amp; Từ điển 4 Lớp
        </button>
        <button
          className={`tab-btn ${activeTab === "econometrics" ? "active" : ""}`}
          onClick={() => setActiveTab("econometrics")}
        >
          {!canUserAccessTab("econometrics") ? "🔒 " : ""}3. Kinh tế lượng Hedonic OLS &amp; Khử chệch Heckman
        </button>
        <button
          className={`tab-btn ${activeTab === "provenance" ? "active" : ""}`}
          onClick={() => setActiveTab("provenance")}
        >
          {!canUserAccessTab("provenance") ? "🔒 " : ""}4. Đối chứng Link Tin rao 6 Cổng BĐS (SHA-256)
        </button>
        <button
          className={`tab-btn ${activeTab === "rbac" ? "active" : ""}`}
          onClick={() => setActiveTab("rbac")}
        >
          {!canUserAccessTab("rbac") ? "🔒 " : ""}5. Phân quyền RBAC &amp; Quản trị Lab BĐS
        </button>
        <button
          className={`tab-btn ${activeTab === "mcp" ? "active" : ""}`}
          onClick={() => setActiveTab("mcp")}
        >
          {!canUserAccessTab("mcp") ? "🔒 " : ""}6. Trạm Truy vấn AI BĐS qua Giao thức MCP
        </button>
        <button
          className={`tab-btn ${activeTab === "errors" ? "active" : ""}`}
          onClick={() => setActiveTab("errors")}
        >
          {!canUserAccessTab("errors") ? "🔒 " : ""}7. Nhật ký Lỗi Quét (DLQ) &amp; Đồng bộ Giờ GMT+07
        </button>
        <button
          className={`tab-btn ${activeTab === "scraped" ? "active" : ""}`}
          onClick={() => setActiveTab("scraped")}
        >
          {!canUserAccessTab("scraped") ? "🔒 " : ""}8. Kho Tin Rao Đã Quét (2021–2026 • 34/63 Tỉnh)
        </button>
      </nav>

      {/* MỤC 1 (CHỈ HIỂN THỊ KHI ĐÃ ĐĂNG NHẬP): ĐỊNH GIÁ BẤT ĐỘNG SẢN CẤP PHƯỜNG/XÃ (34/63 TỈNH THÀNH), MÔ PHỎNG HEDONIC P10-P90 & SHAP */}
      {isValuationUnlocked && currentUser && (
        <>
          {/* Thanh chuyển nhanh chế độ hiển thị trong Mục 1 giúp giao diện gọn gàng, khoa học */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.6rem",
              background: "rgba(15, 23, 42, 0.9)",
              border: "1px solid #334155",
              borderRadius: "0.65rem",
              padding: "0.6rem 0.85rem",
              marginBottom: "1rem",
            }}
          >
            <div style={{ fontSize: "0.83rem", color: "#e2e8f0" }}>
              <strong style={{ color: "#38bdf8" }}>
                Mục 1 — Đã mở khóa cho tài khoản {currentUser.role}:
              </strong>{" "}
              Tích hợp Tra cứu Phường/Xã (34/63 Tỉnh) &amp; Mô phỏng Định giá Thửa đất / Căn hộ (TreeSHAP 2021–2026)
            </div>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className={`tab-btn ${valuationSubMode === "ALL" ? "active" : ""}`}
                style={{ fontSize: "0.76rem", padding: "0.35rem 0.7rem" }}
                onClick={() => setValuationSubMode("ALL")}
              >
                👁️ Hiển thị Toàn cảnh (1A + 1B)
              </button>
              <button
                type="button"
                className={`tab-btn ${valuationSubMode === "WARD_HUB" ? "active" : ""}`}
                style={{ fontSize: "0.76rem", padding: "0.35rem 0.7rem" }}
                onClick={() => setValuationSubMode("WARD_HUB")}
              >
                🗺️ 1A. Định giá Phường/Xã (34/63 Tỉnh) &amp; 6 Phân khu
              </button>
              <button
                type="button"
                className={`tab-btn ${valuationSubMode === "SIMULATOR" ? "active" : ""}`}
                style={{ fontSize: "0.76rem", padding: "0.35rem 0.7rem" }}
                onClick={() => setValuationSubMode("SIMULATOR")}
              >
                🧮 1B. Mô phỏng Thửa đất / Căn hộ (SHAP &amp; Chuỗi 2021–2026)
              </button>
            </div>
          </div>

          {/* 1A: Trung tâm Định giá BĐS Cấp Phường/Xã (34/63 Tỉnh Thành & 6 Phân khu Kinh tế) + Rà soát Cổng BĐS */}
          {(valuationSubMode === "ALL" || valuationSubMode === "WARD_HUB") && (
            <RealEstateWardAndPortalHub userRole={currentUser.role} />
          )}

          {/* 1B: Bộ Mô phỏng Định giá Bất động sản Hedonic + LightGBM Quantile + TreeSHAP (2021–2026) */}
          {(valuationSubMode === "ALL" || valuationSubMode === "SIMULATOR") && (
            <section className="rwd-grid-2">
              <div className="lab-card">
                <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem", color: "#38bdf8" }}>
                  🧮 1B. Cấu hình Thông số Thửa đất / Căn hộ (Mô phỏng Hedonic &amp; TreeSHAP)
                </h2>
                <div style={{ display: "grid", gap: "0.85rem" }}>
                  <label style={{ fontSize: "0.85rem" }}>
                    Phân khúc Bất động sản Chủ đạo (4 Trụ cột):
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
                        RES-01: Căn hộ Chung cư (Bình dân, Trung cấp, Cao cấp, Penthouse)
                      </option>
                      <option value="DE-02">
                        LAND-02: Nhà ở Thổ cư, Nhà Phân lô, Liền kề &amp; Biệt thự
                      </option>
                      <option value="DE-03">
                        COM-03: BĐS Thương mại, Nhà Mặt phố Kinh doanh &amp; Shophouse
                      </option>
                      <option value="DE-04">
                        IND-04: Đất nền Dự án, Đất Đấu giá, Ven đô &amp; BĐS Công nghiệp (KCN)
                      </option>
                    </select>
                  </label>

                  <label style={{ fontSize: "0.85rem" }}>
                    Tầng Giá trị Bất động sản (Tháp 6 Tầng T1 – T6):
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
                      <option value="T1_INTERN">
                        Tầng 1 (T1_AFFORDABLE): BĐS Bình dân / Nhà ở xã hội / Đất ngoại ô
                      </option>
                      <option value="T2_FRESHER">
                        Tầng 2 (T2_MASS_MARKET): BĐS Phổ thông / Chung cư thương mại / Nhà ngõ
                      </option>
                      <option value="T3_JUNIOR">
                        Tầng 3 (T3_UPPER_MID): BĐS Trung – Cao cấp / Nhà ngõ ô tô / Đất KCN
                      </option>
                      <option value="T4_MIDDLE_SENIOR">
                        Tầng 4 (T4_PREMIUM): BĐS Cao cấp / Nhà phân lô thang máy / Căn hộ Hạng A
                      </option>
                      <option value="T5_LEAD_MANAGER">
                        Tầng 5 (T5_LUXURY): BĐS Hạng sang / Biệt thự Compound / Nhà mặt phố
                      </option>
                      <option value="T6_DIRECTOR">
                        Tầng 6 (T6_TROPHY_ULTRA): BĐS Siêu sang / Mặt phố Lõi CBD / Dinh thự
                      </option>
                    </select>
                  </label>

                  <div className="rwd-subgrid-2">
                    <label style={{ fontSize: "0.85rem" }}>
                      Đô thị / Vùng Kinh tế Trọng điểm:
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
                        <option value="HN">Hà Nội (Thủ đô • Đô thị Đặc biệt)</option>
                        <option value="HCM">TP. Hồ Chí Minh (Siêu Đô thị Mở rộng)</option>
                        <option value="DN">Đà Nẵng (Đô thị Biển &amp; Du lịch)</option>
                        <option value="BD">Thủ phủ KCN &amp; Vệ tinh (Bắc Ninh/Hải Phòng/Đồng Nai)</option>
                        <option value="REMOTE">Đô thị Du lịch Biển &amp; Di sản (Nha Trang/Hạ Long/Phú Quốc)</option>
                      </select>
                    </label>

                    <label style={{ fontSize: "0.85rem" }}>
                      Diện tích Đất / Sàn thông thủy: <strong>{expYears} m²</strong>
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

                  {/* Bộ chọn Kỳ Năm Định giá (2021..2026) & Chế độ Giá Danh nghĩa / Thực tế CPI */}
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
                      📅 Kỳ Năm Định giá BĐS (Chuỗi Lịch sử 2021–2026):
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
                          Năm 2026 (Thị trường Hiện hành / Bảng giá Đất mới)
                        </option>
                        <option value={2025}>Năm 2025 (Chu kỳ phục hồi thanh khoản)</option>
                        <option value={2024}>Năm 2024 (Thông qua Luật Đất đai 2024)</option>
                        <option value={2023}>Năm 2023 (Giai đoạn trầm lắng lãi suất cao)</option>
                        <option value={2022}>Năm 2022 (Đỉnh sốt đất nửa đầu năm)</option>
                        <option value={2021}>Năm 2021 (Mặt bằng giá nền đầu chu kỳ)</option>
                      </select>
                    </label>

                    <label style={{ fontSize: "0.82rem", color: "#e2e8f0" }}>
                      💱 Hệ quy chiếu Đơn giá (CPI Deflator):
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
                          Đơn giá Danh nghĩa tại Năm {valuationYear} (Nominal Price)
                        </option>
                        <option value="REAL_CPI_2026">
                          Đơn giá Thực tế quy đổi CPI 2026 (Real CPI-Adjusted)
                        </option>
                      </select>
                    </label>
                  </div>

                  <div>
                    <div style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                      Chọn các Thuộc tính Định giá Hedonic của Bất động sản (Click để bật/tắt):
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
                <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem", color: "#34d399" }}>
                  📊 Kết quả Dự báo Phân vị Đơn giá BĐS (LightGBM Quantile) &amp; Giải thích TreeSHAP
                </h2>
                <div
                  style={{
                    background: "#1e293b",
                    padding: "1rem",
                    borderRadius: "0.75rem",
                    marginBottom: "1rem",
                    border: "1px solid #334155",
                  }}
                >
                  <div
                    style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}
                  >
                    Đơn giá Trung vị P50 &amp; Tổng giá trị Tài sản ({expYears} m²) tại{" "}
                    <strong style={{ color: "#34d399" }}>
                      Năm {valuationYear}
                    </strong>{" "}
                    ({priceMode === "REAL_CPI_2026" ? "Quy đổi CPI 2026" : "Danh nghĩa"}
                    ):
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                      marginTop: "0.25rem",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "1.95rem",
                        fontWeight: 800,
                        color: "#38bdf8",
                      }}
                    >
                      {p50} triệu VNĐ / m²
                    </div>
                    <div
                      style={{
                        fontSize: "1.35rem",
                        fontWeight: 800,
                        color: "#34d399",
                      }}
                    >
                      ≈ {totalValueBilVnd} tỷ VNĐ ({expYears} m²)
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: "0.83rem",
                      color: "#94a3b8",
                      marginTop: "0.35rem",
                    }}
                  >
                    • Dải Tứ phân vị (P25 – P75):{" "}
                    <strong style={{ color: "#e2e8f0" }}>
                      {p25} – {p75} tr/m²
                    </strong>{" "}
                    (Tổng giá: <strong>{totalValueP25BilVnd} – {totalValueP75BilVnd} tỷ VNĐ</strong>) | Dải P10 – P90:{" "}
                    <strong>
                      {p10} – {p90} tr/m²
                    </strong>
                  </div>
                </div>

                {/* Biểu đồ Tiến hóa Dải Phân vị Đơn giá P10-P90 qua các năm (2021 -> 2026) */}
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

                {/* Biểu đồ Thác nước Đóng góp SHAP & Chỉ số Tối ưu Giá trị BĐS PVS */}
                <ShapAndUpsChart
                  basePay={Number(((baseWage + expBonus) * effMult).toFixed(2))}
                  selectedSkillsData={selectedSkillsChartData}
                  missingRecommendations={missingRecommendations}
                />

                <h3 style={{ fontSize: "0.95rem", marginBottom: "0.6rem" }}>
                  Khuyến nghị Gia tăng Giá trị Tài sản (Property Value Score - PVS)
                </h3>
                <div className="table-scroll">
                  <table className="lab-table">
                    <thead>
                      <tr>
                        <th>Thuộc tính / Tiêu chí Nâng cấp Giá trị</th>
                        <th>Tầng Bản thể học</th>
                        <th>Phần bù SHAP Kỳ vọng</th>
                        <th>Điểm Tối ưu PVS</th>
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

          {/* Danh mục Giới thiệu 7 Phân hệ Chuyên sâu (Mục 2 - 8) ở Trang ngoài */}
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
                  Giới thiệu 7 Phân hệ Nghiên cứu &amp; Quản trị Dữ liệu BĐS Chuyên sâu (Mục
                  2 – 8)
                </h2>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  Tại Trang ngoài, các mục 2 – 8 hiển thị tóm tắt phương pháp luận và kiến trúc dữ liệu. Nhấn vào từng mục hoặc đăng nhập vào Trang trong (/workspace) để khai thác toàn bộ bảng số liệu và công cụ điều khiển.
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

      {/* TẤT CẢ 8 MỤC KHI CHƯA LOGIN (HOẶC MỤC 2 – 8 KHI ĐÃ LOGIN): YÊU CẦU ĐĂNG NHẬP & KIỂM TRA PHÂN QUYỀN RBAC */}
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
                  PHÂN HỆ {currentIntro.number}/8 • KIỂM SOÁT TRUY CẬP RBAC
                </span>
                <span className="badge badge-green">
                  {currentIntro.badgeText}
                </span>
                <span className="badge badge-amber">
                  Yêu cầu quyền tối thiểu: {currentIntro.minRoleLabel}
                </span>
              </div>
              <h2 style={{ fontSize: "1.25rem", color: "#f8fafc" }}>
                {currentIntro.fullTitle}
              </h2>
            </div>
          </div>

          {/* HỘP KIỂM SOÁT ĐĂNG NHẬP & PHÂN QUYỀN RBAC NGAY TRÊN CÙNG ĐỂ NGƯỜI DÙNG THẤY RÕ */}
          {!currentUser ? (
            <div
              style={{
                padding: "1.25rem",
                background:
                  "linear-gradient(135deg, rgba(99, 102, 241, 0.16), rgba(15, 23, 42, 0.96))",
                border: "1px solid #6366f1",
                borderRadius: "0.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
                marginBottom: "1.25rem",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                    marginBottom: "0.35rem",
                  }}
                >
                  <span className="badge badge-red">
                    🔒 BẮT BUỘC ĐĂNG NHẬP CHO TẤT CẢ 8 MỤC (MỤC 1 – MỤC 8)
                  </span>
                  <span className="badge badge-amber">
                    Tài khoản VIEWER chỉ xem được Mục 1
                  </span>
                </div>
                <strong style={{ fontSize: "1.02rem", color: "#f8fafc" }}>
                  🔐 Yêu cầu đăng nhập xác thực để truy cập Mục {currentIntro.number}{" "}
                  ({currentIntro.shortTitle}):
                </strong>
                <p
                  style={{
                    fontSize: "0.86rem",
                    color: "#cbd5e1",
                    marginTop: "0.35rem",
                    lineHeight: 1.6,
                  }}
                >
                  Theo quy chế bảo mật RBAC của PropValue.AI Lab,{" "}
                  <strong>tất cả 8 phân hệ (từ Mục 1 đến Mục 8) đều yêu cầu đăng nhập</strong>{" "}
                  mới được xem và sử dụng. Sau khi đăng nhập:
                  <br />• Tài khoản mức <strong style={{ color: "#38bdf8" }}>VIEWER (mặc định khi đăng nhập mới)</strong>{" "}
                  chỉ được phép xem và sử dụng{" "}
                  <strong>Mục 1 (Định giá BĐS Cấp Phường/Xã 34/63 Tỉnh &amp; SHAP)</strong>.
                  <br />• Các phân hệ chuyên sâu từ{" "}
                  <strong style={{ color: "#fbbf24" }}>Mục 2 đến Mục 8</strong>{" "}
                  chỉ mở khóa khi tài khoản được Quản trị viên Lab (
                  <code>phungtuananh3333@gmail.com</code>,{" "}
                  <code>phungtuananh2222@gmail.com</code>) cấp quyền{" "}
                  <strong>RESEARCHER / OPERATOR / ADMIN</strong> tại Mục 5.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.65rem",
                  flexWrap: "wrap",
                }}
              >
                <a
                  href={`/api/auth/login?tab=${encodeURIComponent(currentIntro.tabKey)}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    background: "#fff",
                    color: "#0f172a",
                    padding: "0.6rem 1.15rem",
                    borderRadius: "0.55rem",
                    fontWeight: 700,
                    fontSize: "0.86rem",
                    textDecoration: "none",
                  }}
                >
                  <span style={{ color: "#2563eb", fontWeight: 900 }}>G</span>
                  Đăng nhập với Google để mở Mục {currentIntro.number} →
                </a>
                <button
                  type="button"
                  onClick={() => openLoginModalForTab(currentIntro.tabKey)}
                  className="tab-btn active"
                  style={{
                    padding: "0.6rem 1.15rem",
                    borderRadius: "0.55rem",
                    fontWeight: 700,
                    fontSize: "0.86rem",
                    cursor: "pointer",
                  }}
                >
                  🔑 Đăng nhập bằng Tài khoản &amp; Mật khẩu Lab →
                </button>
              </div>
            </div>
          ) : !canUserAccessTab(currentIntro.tabKey) ? (
            <div
              style={{
                padding: "1.25rem",
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid #ef4444",
                borderRadius: "0.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.8rem",
                marginBottom: "1.25rem",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                    marginBottom: "0.35rem",
                  }}
                >
                  <span className="badge badge-red">
                    🔒 CHẶN TRUY CẬP THEO PHÂN QUYỀN RBAC ({currentUser.role})
                  </span>
                  <span className="badge badge-amber">
                    Yêu cầu tối thiểu: {currentIntro.minRoleLabel}
                  </span>
                </div>
                <strong style={{ fontSize: "1rem", color: "#fca5a5" }}>
                  Tài khoản {currentUser.email} đang ở mức quyền{" "}
                  <code>{currentUser.role}</code> — Chỉ được phép xem Mục 1!
                </strong>
                <p
                  style={{
                    fontSize: "0.86rem",
                    color: "#e2e8f0",
                    marginTop: "0.35rem",
                    lineHeight: 1.6,
                  }}
                >
                  Theo quy định phân quyền của hệ thống, tài khoản mức{" "}
                  <strong>VIEWER</strong> chỉ được phép xem và tương tác tại{" "}
                  <strong style={{ color: "#34d399" }}>
                    Mục 1 (Định giá BĐS Cấp Phường/Xã 34/63 Tỉnh &amp; SHAP)
                  </strong>
                  . Để truy cập{" "}
                  <strong>
                    Mục {currentIntro.number} ({currentIntro.shortTitle})
                  </strong>
                  , tài khoản cần được Quản trị viên Lab (
                  <code>phungtuananh3333@gmail.com</code>,{" "}
                  <code>phungtuananh2222@gmail.com</code>) nâng cấp quyền tại{" "}
                  <strong>Mục 5 (Phân quyền RBAC)</strong>.
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="tab-btn active"
                  onClick={() => setActiveTab("valuation")}
                >
                  ← Quay về Mục 1 (Định giá BĐS Cấp Phường/Xã 34/63 Tỉnh &amp; SHAP)
                </button>
                <a
                  href="/workspace?tab=valuation"
                  className="tab-btn"
                  style={{ textDecoration: "none" }}
                >
                  Mở Mục 1 trong Trang trong (/workspace) →
                </a>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "1.15rem",
                background: "rgba(52, 211, 153, 0.12)",
                border: "1px solid #34d399",
                borderRadius: "0.75rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.85rem",
                marginBottom: "1.25rem",
              }}
            >
              <div>
                <strong style={{ fontSize: "0.96rem", color: "#34d399" }}>
                  ✅ Tài khoản {currentUser.email} ({currentUser.role}) đủ quyền
                  truy cập Mục {currentIntro.number}:
                </strong>
                <div style={{ fontSize: "0.84rem", color: "#cbd5e1", marginTop: "0.2rem" }}>
                  Nhấn nút bên phải để mở toàn bộ bảng dữ liệu và công cụ tương
                  tác của Mục {currentIntro.number} tại Trang trong (/workspace).
                </div>
              </div>
              <a
                href={`/workspace?tab=${encodeURIComponent(currentIntro.tabKey)}`}
                className="tab-btn active"
                style={{
                  textDecoration: "none",
                  padding: "0.6rem 1.15rem",
                  fontSize: "0.88rem",
                }}
              >
                Vào Trang trong mở Mục {currentIntro.number} ({currentUser.role}) →
              </a>
            </div>
          )}

          {/* Nội dung Tóm tắt Phương pháp luận của Phân hệ */}
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
              3. Nội dung Chi tiết Được Mở khóa Khi Đủ Quyền RBAC ({currentIntro.minRoleLabel})
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

          {/* Thanh chuyển nhanh xem thông tin 8 phân hệ */}
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
              Chuyển nhanh giữa 8 phân hệ (Mục 1 – 8):
            </span>
            {ALL_TAB_KEYS.map((k) => {
              const item = PUBLIC_SECTION_INTRODUCTIONS[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setActiveTab(k)}
                  className={`tab-btn ${activeTab === k ? "active" : ""}`}
                  style={{ fontSize: "0.78rem", padding: "0.35rem 0.7rem" }}
                >
                  {canUserAccessTab(k) ? "🔓" : "🔒"} {item.shortTitle}
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
                Xác thực trực tiếp qua tài khoản Google OAuth 2.0 (Mặc định cấp quyền{" "}
                <code>VIEWER</code> chỉ xem được <strong>Mục 1</strong>; chỉ cấp{" "}
                <code>ADMIN</code> cho <code>{oauthInfo.admin_emails.join(", ")}</code>):
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

      {/* Mobile Bottom Navigation Bar (Hiển thị ĐẦY ĐỦ 8 phân hệ BĐS trên Điện thoại & Tablet) */}
      <nav className="mobile-bottom-nav" aria-label="Menu điều hướng nhanh 8 phân hệ BĐS trên di động">
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
          2. Tháp Giá 6T
        </button>
        <button
          className={`tab-btn ${activeTab === "econometrics" ? "active" : ""}`}
          onClick={() => setActiveTab("econometrics")}
        >
          3. Hedonic OLS
        </button>
        <button
          className={`tab-btn ${activeTab === "provenance" ? "active" : ""}`}
          onClick={() => setActiveTab("provenance")}
        >
          4. 6 Cổng BĐS
        </button>
        <button
          className={`tab-btn ${activeTab === "rbac" ? "active" : ""}`}
          onClick={() => setActiveTab("rbac")}
        >
          5. RBAC Lab
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
          8. Kho Tin Rao
        </button>
      </nav>
    </main>
  );
}
