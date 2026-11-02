"""
Bộ Xây dựng Ma trận Đặc trưng (Feature Store Builder - Tầng Gold):
Chuyển đổi dữ liệu tin tuyển dụng chuẩn hóa (Tầng Silver) sang Ma trận Đặc trưng
phục vụ đồng thời:
1. Kinh tế lượng Cổ điển (Mincer Wage Equation OLS + Heckman 2-Step Selection Probit).
2. Học máy Phi tuyến & Hồi quy Phân vị (LightGBM / Gradient Boosting Quantile Regression P10..P90).
3. Phân tích Giá trị Biên SHAP, Ma trận Cộng hưởng Kỹ năng (Lift) và Điểm Ưu tiên Học tập (UPS).
"""

from __future__ import annotations

import math
import random
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import yaml

TIER_TO_NUM = {
    "T1_INTERN": 1,
    "T2_FRESHER": 2,
    "T3_JUNIOR": 3,
    "T4_MIDDLE_SENIOR": 4,
    "T5_LEAD_MANAGER": 5,
    "T6_DIRECTOR": 6,
}

NUM_TO_TIER = {v: k for k, v in TIER_TO_NUM.items()}

SYNERGY_PAIRS: List[Tuple[str, str, str]] = [
    ("SYN_SQL_PYTHON", "SK_SQL", "SK_PYTHON"),
    ("SYN_SQL_POWERBI", "SK_SQL", "SK_POWERBI"),
    ("SYN_ML_GENAI", "SK_ML_DL_FRAMEWORKS", "SK_GENAI_LLM"),
    ("SYN_SPARK_CLOUD", "SK_SPARK_BIGDATA", "SK_CLOUD_PLATFORM"),
    ("SYN_ECOM_PAID_ADS", "SK_ECOM_SELLER_CENTER", "SK_PAID_ADS_PLATFORMS"),
    ("SYN_BA_API_SQL", "SK_REQUIREMENTS_SRS_BRD", "SK_API_INTEGRATION"),
]


class LaborMarketFeatureBuilder:
    """Biến đổi danh sách bản ghi tuyển dụng chuẩn hóa thành DataFrame & Feature Matrix."""

    def __init__(self, configs_dir: Path = Path("configs")) -> None:
        self.configs_dir = configs_dir
        with open(configs_dir / "skills_ontology.yaml", "r", encoding="utf-8") as f:
            self.skills_cfg = yaml.safe_load(f)
        with open(configs_dir / "roles_taxonomy.yaml", "r", encoding="utf-8") as f:
            self.roles_cfg = yaml.safe_load(f)

        self.skills_meta: Dict[str, Dict[str, Any]] = self.skills_cfg.get("skills", {})
        self.skill_ids: List[str] = sorted(self.skills_meta.keys())

    def build_dataframe(self, records: List[Dict[str, Any]]) -> pd.DataFrame:
        rows: List[Dict[str, Any]] = []
        for idx, r in enumerate(records):
            sal_mid = r.get("salary_mid_vnd")
            is_neg = bool(r.get("is_negotiable", sal_mid is None))
            is_disclosed = 1 if (not is_neg and sal_mid is not None and float(sal_mid) > 0) else 0
            sal_val = float(sal_mid) if is_disclosed else np.nan
            ln_sal = math.log(sal_val) if (is_disclosed and sal_val > 0) else np.nan

            exp_mid = float(r.get("exp_years_mid", 1.5) or 1.5)
            tier_code = str(r.get("career_tier", "T3_JUNIOR"))
            tier_num = TIER_TO_NUM.get(tier_code, 3)

            pillar = str(r.get("sector_pillar", "DE-01"))
            if pillar == "UNCLASSIFIED":
                pillar = "DE-01"
            city = str(r.get("primary_city_code", "HCM"))
            work_mode = str(r.get("work_mode", "ONSITE"))
            source_site = str(r.get("source_site") or (r.get("source_sites") or ["topcv"])[0])
            quarter = str(r.get("year_quarter", "2026-Q4"))
            vac_days = int(r.get("vacancy_duration_days", 15) or 15)

            matched_skills = set(r.get("matched_skill_ids", []))

            row: Dict[str, Any] = {
                "job_id": r.get("job_id", f"job_{idx}"),
                "dedup_signature": r.get("dedup_signature", f"sig_{idx}"),
                "canonical_role": r.get("canonical_role", "DATA_ANALYST"),
                "sector_pillar": pillar,
                "career_tier": tier_code,
                "career_tier_num": tier_num,
                "primary_city_code": city,
                "work_mode": work_mode,
                "source_site": source_site,
                "year_quarter": quarter,
                "vacancy_duration_days": vac_days,
                "exp_years_mid": exp_mid,
                "exp_years_sq": round((exp_mid**2) / 10.0, 4),
                "is_disclosed": is_disclosed,
                "salary_mid_vnd": sal_val,
                "ln_salary": ln_sal,
            }

            # Biến giả Khu vực (Spatial Fixed Effects - Lấy Đô thị Vệ tinh/Khác làm nhóm cơ sở)
            row["FE_CITY_HCM"] = 1 if city == "HCM" else 0
            row["FE_CITY_HN"] = 1 if city == "HN" else 0
            row["FE_CITY_DN"] = 1 if city == "DN" else 0
            row["FE_WORK_REMOTE"] = 1 if work_mode == "REMOTE" or city == "REMOTE" else 0
            row["FE_WORK_HYBRID"] = 1 if work_mode == "HYBRID" else 0

            # Biến giả Trụ cột Ngành (Sector Fixed Effects - Lấy DE-03 làm cơ sở)
            row["FE_PILLAR_DE01"] = 1 if pillar == "DE-01" else 0
            row["FE_PILLAR_DE02"] = 1 if pillar == "DE-02" else 0
            row["FE_PILLAR_DE04"] = 1 if pillar == "DE-04" else 0

            # Biến công cụ (Exclusion Restrictions) cho Phương trình Chọn mẫu Heckman Probit
            row["INST_SITE_ITVIEC"] = 1 if "itviec" in (r.get("source_sites") or [source_site]) else 0
            row["INST_SITE_TOPCV"] = 1 if "topcv" in (r.get("source_sites") or [source_site]) else 0
            row["INST_MULTI_SOURCE"] = 1 if len(r.get("source_urls") or r.get("source_sites") or []) > 1 else 0

            # Biến chỉ báo Kỹ năng Số 4 Tầng
            layer_counts = {"L1_FOUNDATION": 0, "L2_TOOL": 0, "L3_DOMAIN": 0, "L4_MINDSET": 0}
            for sk_id in self.skill_ids:
                has_sk = 1 if sk_id in matched_skills else 0
                row[sk_id] = has_sk
                if has_sk:
                    layer = self.skills_meta[sk_id].get("layer", "L2_TOOL")
                    layer_counts[layer] = layer_counts.get(layer, 0) + 1

            row["n_skills_L1"] = layer_counts["L1_FOUNDATION"]
            row["n_skills_L2"] = layer_counts["L2_TOOL"]
            row["n_skills_L3"] = layer_counts["L3_DOMAIN"]
            row["n_skills_L4"] = layer_counts["L4_MINDSET"]
            row["total_digital_skills"] = sum(layer_counts.values())

            # Biến tương tác Cộng hưởng Kỹ năng (Skill Synergy Interactions)
            for syn_name, sk_a, sk_b in SYNERGY_PAIRS:
                row[syn_name] = 1 if (row.get(sk_a, 0) == 1 and row.get(sk_b, 0) == 1) else 0

            rows.append(row)

        return pd.DataFrame(rows)

    def get_ml_feature_columns(self) -> List[str]:
        """Danh sách các biến đầu vào chuẩn cho mô hình LightGBM Quantile & SHAP."""
        base_cols = [
            "exp_years_mid",
            "exp_years_sq",
            "career_tier_num",
            "vacancy_duration_days",
            "FE_CITY_HCM",
            "FE_CITY_HN",
            "FE_CITY_DN",
            "FE_WORK_REMOTE",
            "FE_WORK_HYBRID",
            "FE_PILLAR_DE01",
            "FE_PILLAR_DE02",
            "FE_PILLAR_DE04",
            "n_skills_L1",
            "n_skills_L2",
            "n_skills_L3",
            "n_skills_L4",
        ]
        syn_cols = [s[0] for s in SYNERGY_PAIRS]
        return base_cols + self.skill_ids + syn_cols


def generate_calibrated_labor_dataset(
    n_samples: int = 450,
    seed: int = 42,
) -> List[Dict[str, Any]]:
    """
    Sinh tập dữ liệu mô phỏng thực nghiệm được hiệu chỉnh sát với cấu trúc thị trường lao động số Việt Nam
    (tuân thủ phân phối lương 6 tầng tại `roles_taxonomy.yaml`, cấu trúc kỹ năng 4 tầng tại `skills_ontology.yaml`
    và cơ chế ẩn lương "Thỏa thuận" ~30% phục vụ kiểm định Heckman 2-Step & Huấn luyện LightGBM Quantile).
    """
    rng = random.Random(seed)
    np_rng = np.random.default_rng(seed)

    pillars_roles = {
        "DE-01": ["DATA_ANALYST", "DATA_ENGINEER", "AI_ML_ENGINEER", "CLOUD_DEVOPS_ENGINEER"],
        "DE-02": ["ECOMMERCE_OPERATIONS", "DIGITAL_PRODUCT_OWNER", "DIGITAL_GROWTH_SPECIALIST"],
        "DE-03": ["PERFORMANCE_MARKETER", "SEO_CONTENT_GROWTH", "MARTECH_CRM_SPECIALIST"],
        "DE-04": ["IT_BUSINESS_ANALYST", "FINTECH_PAYMENT_SPECIALIST", "CREDIT_RISK_DATA_ANALYST", "ERP_CONSULTANT"],
    }

    pillar_skill_pools = {
        "DE-01": {
            "core": ["SK_SQL", "SK_EXCEL", "SK_PYTHON", "SK_POWERBI", "SK_TABLEAU"],
            "advanced": [
                "SK_SPARK_BIGDATA",
                "SK_AIRFLOW_DBT",
                "SK_CLOUD_PLATFORM",
                "SK_ML_DL_FRAMEWORKS",
                "SK_GENAI_LLM",
                "SK_DOCKER_GIT_CICD",
                "SK_DATA_MODELING_DWH",
                "SK_STATISTICAL_AB_TESTING",
            ],
            "mindset": ["SK_AGILE_SCRUM", "SK_PRODUCT_DATA_MINDSET", "SK_DATA_GOVERNANCE_SECURITY", "SK_ENGLISH_PROFESSIONAL"],
        },
        "DE-02": {
            "core": ["SK_EXCEL", "SK_CANVA_CAPCUT", "SK_ECOM_SELLER_CENTER", "SK_LOOKER_STUDIO"],
            "advanced": [
                "SK_PAID_ADS_PLATFORMS",
                "SK_GA4_GTM",
                "SK_CRM_CDP_AUTOMATION",
                "SK_POWERBI",
                "SK_ECOM_MERCHANDISING_PL",
                "SK_ROAS_CRO_FUNNEL",
                "SK_GENAI_LLM",
            ],
            "mindset": ["SK_AGILE_SCRUM", "SK_PRODUCT_DATA_MINDSET", "SK_ENGLISH_PROFESSIONAL"],
        },
        "DE-03": {
            "core": ["SK_CANVA_CAPCUT", "SK_PAID_ADS_PLATFORMS", "SK_SEO_TOOLS", "SK_GA4_GTM"],
            "advanced": [
                "SK_LOOKER_STUDIO",
                "SK_CRM_CDP_AUTOMATION",
                "SK_ROAS_CRO_FUNNEL",
                "SK_STATISTICAL_AB_TESTING",
                "SK_GENAI_LLM",
                "SK_SQL",
            ],
            "mindset": ["SK_AGILE_SCRUM", "SK_PRODUCT_DATA_MINDSET", "SK_ENGLISH_PROFESSIONAL"],
        },
        "DE-04": {
            "core": ["SK_EXCEL", "SK_SQL", "SK_BA_MODELING_TOOLS", "SK_REQUIREMENTS_SRS_BRD"],
            "advanced": [
                "SK_API_INTEGRATION",
                "SK_POWERBI",
                "SK_PYTHON",
                "SK_FINTECH_CREDIT_RISK",
                "SK_ERP_SAP_ODOO",
                "SK_DATA_MODELING_DWH",
                "SK_GENAI_LLM",
            ],
            "mindset": ["SK_AGILE_SCRUM", "SK_PRODUCT_DATA_MINDSET", "SK_DATA_GOVERNANCE_SECURITY", "SK_ENGLISH_PROFESSIONAL"],
        },
    }

    # Phần bù lương biên thực tế (log-wage points) của một số kỹ năng Differentiator & Mindset
    skill_log_premiums = {
        "SK_SQL": 0.08,
        "SK_PYTHON": 0.14,
        "SK_POWERBI": 0.07,
        "SK_SPARK_BIGDATA": 0.16,
        "SK_AIRFLOW_DBT": 0.12,
        "SK_CLOUD_PLATFORM": 0.15,
        "SK_ML_DL_FRAMEWORKS": 0.18,
        "SK_GENAI_LLM": 0.19,
        "SK_DATA_MODELING_DWH": 0.11,
        "SK_STATISTICAL_AB_TESTING": 0.09,
        "SK_ECOM_MERCHANDISING_PL": 0.11,
        "SK_ROAS_CRO_FUNNEL": 0.10,
        "SK_CRM_CDP_AUTOMATION": 0.09,
        "SK_API_INTEGRATION": 0.10,
        "SK_FINTECH_CREDIT_RISK": 0.16,
        "SK_ERP_SAP_ODOO": 0.14,
        "SK_AGILE_SCRUM": 0.06,
        "SK_PRODUCT_DATA_MINDSET": 0.08,
        "SK_DATA_GOVERNANCE_SECURITY": 0.10,
        "SK_ENGLISH_PROFESSIONAL": 0.15,
    }

    tiers_spec = [
        ("T1_INTERN", 0.0, 0.5, 4.2),
        ("T2_FRESHER", 0.5, 1.0, 9.0),
        ("T3_JUNIOR", 1.0, 2.5, 15.0),
        ("T4_MIDDLE_SENIOR", 3.0, 5.5, 27.5),
        ("T5_LEAD_MANAGER", 5.5, 8.5, 48.0),
        ("T6_DIRECTOR", 8.5, 12.0, 82.0),
    ]
    tier_weights = [0.08, 0.18, 0.30, 0.26, 0.13, 0.05]

    cities_spec = [
        ("HCM", "SOUTH", "TIER_SPECIAL", 1.02),
        ("HN", "NORTH", "TIER_SPECIAL", 0.97),
        ("DN", "CENTRAL", "TIER_1_HUB", 0.82),
        ("BD", "SOUTH", "TIER_INDUSTRIAL", 0.88),
        ("BN", "NORTH", "TIER_INDUSTRIAL", 0.87),
    ]
    city_weights = [0.44, 0.36, 0.10, 0.05, 0.05]

    records: List[Dict[str, Any]] = []
    for i in range(n_samples):
        pillar = rng.choices(["DE-01", "DE-02", "DE-03", "DE-04"], weights=[0.35, 0.22, 0.20, 0.23])[0]
        role = rng.choice(pillars_roles[pillar])
        tier_code, exp_min, exp_max, base_tier_sal = rng.choices(tiers_spec, weights=tier_weights)[0]
        tier_num = TIER_TO_NUM[tier_code]
        exp_mid = round(rng.uniform(exp_min, exp_max), 1)

        city_code, macro_reg, urban_tier, city_mult = rng.choices(cities_spec, weights=city_weights)[0]
        work_mode = rng.choices(["ONSITE", "HYBRID", "REMOTE"], weights=[0.68, 0.22, 0.10])[0]
        if work_mode == "REMOTE":
            city_mult = max(city_mult, 1.15)

        pool = pillar_skill_pools[pillar]
        n_core = min(len(pool["core"]), rng.randint(1, 3 if tier_num <= 2 else 4))
        n_adv = min(
            len(pool["advanced"]),
            rng.randint(0, 1) if tier_num <= 2 else rng.randint(1, 3) if tier_num <= 4 else rng.randint(2, 5),
        )
        n_mind = min(
            len(pool["mindset"]),
            0 if tier_num == 1 else rng.randint(0, 1) if tier_num <= 3 else rng.randint(1, 3),
        )

        chosen_skills = sorted(
            set(
                rng.sample(pool["core"], n_core)
                + rng.sample(pool["advanced"], n_adv)
                + rng.sample(pool["mindset"], n_mind)
            )
        )

        # Phương trình cấu trúc tiền lương (Data Generating Process - DGP chuẩn Mincer + Synergy)
        pillar_mult = {"DE-01": 1.12, "DE-02": 0.94, "DE-03": 0.90, "DE-04": 1.08}[pillar]
        ln_w = math.log(base_tier_sal * pillar_mult * city_mult)
        ln_w += 0.065 * exp_mid - 0.0028 * (exp_mid**2)

        for sk in chosen_skills:
            ln_w += skill_log_premiums.get(sk, 0.03)

        # Cộng hưởng phi tuyến (Skill Synergy Bonus)
        if "SK_SQL" in chosen_skills and "SK_PYTHON" in chosen_skills:
            ln_w += 0.06
        if "SK_ML_DL_FRAMEWORKS" in chosen_skills and "SK_GENAI_LLM" in chosen_skills:
            ln_w += 0.08
        if "SK_ECOM_SELLER_CENTER" in chosen_skills and "SK_PAID_ADS_PLATFORMS" in chosen_skills:
            ln_w += 0.05

        noise = float(np_rng.normal(0.0, 0.11))
        true_salary_vnd = round(max(3.0, math.exp(ln_w + noise)), 2)

        # Cơ chế Chọn mẫu Heckman (Xác suất công bố lương phụ thuộc mạnh vào cổng tuyển dụng & cấp bậc)
        site = rng.choices(["topcv", "itviec", "careerviet", "vietnamworks"], weights=[0.38, 0.24, 0.20, 0.18])[0]
        latent_disclose = (
            0.25
            + (0.95 if site == "itviec" else 0.15 if site == "topcv" else -0.25)
            - 0.12 * (tier_num >= 5)
            + float(np_rng.normal(0.0, 0.75))
        )
        is_disclosed = latent_disclose > 0.0

        vac_days = int(max(3, min(60, round(10 + 3.5 * tier_num + 6 * ("SK_GENAI_LLM" in chosen_skills) + np_rng.normal(0, 4)))))
        quarter = rng.choice(["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"])

        records.append(
            {
                "job_id": f"sim_{i:04d}",
                "dedup_signature": f"sim_company_{i:04d}__{role}__{tier_code}__{city_code}",
                "source_site": site,
                "source_sites": [site] if rng.random() > 0.25 else [site, "topcv"],
                "source_urls": [f"https://{site}.vn/jobs/{i:04d}"],
                "company_name_raw": f"Digital Corp #{i % 60}",
                "company_slug": f"digital-corp-{i % 60}",
                "job_title_raw": f"{tier_code.split('_')[1].title()} {role.replace('_', ' ').title()}",
                "sector_pillar": pillar,
                "canonical_role": role,
                "role_confidence": 0.95,
                "career_tier": tier_code,
                "exp_years_min": exp_min,
                "exp_years_max": exp_max,
                "exp_years_mid": exp_mid,
                "salary_raw_text": f"{true_salary_vnd} triệu" if is_disclosed else "Thỏa thuận",
                "salary_type": "RANGE" if is_disclosed else "NEGOTIABLE",
                "is_negotiable": not is_disclosed,
                "currency_original": "VND",
                "salary_min_vnd": round(true_salary_vnd * 0.88, 2) if is_disclosed else None,
                "salary_max_vnd": round(true_salary_vnd * 1.12, 2) if is_disclosed else None,
                "salary_mid_vnd": true_salary_vnd if is_disclosed else None,
                "true_latent_salary_vnd": true_salary_vnd,
                "primary_macro_region": macro_reg,
                "primary_city_code": city_code,
                "primary_urban_tier": urban_tier,
                "primary_district_cluster": "TECH_CLUSTER",
                "work_mode": work_mode,
                "published_date": "2026-10-15",
                "expired_date": "2026-11-15",
                "year_month": "2026-10",
                "year_quarter": quarter,
                "vacancy_duration_days": vac_days,
                "matched_skill_ids": chosen_skills,
                "raw_skill_tags": chosen_skills,
                "unmapped_tags": [],
            }
        )

    return records
