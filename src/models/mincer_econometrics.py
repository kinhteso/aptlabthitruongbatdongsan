"""
Module Kinh tế lượng Cổ điển & Hiện đại (Econometric Wage Modeling):
1. Phương trình Tiền lương Mincer Mở rộng (Extended Mincerian Wage Equation - OLS với sai số chuẩn
   kháng phương sai thay đổi White/MacKinnon HC3):
   ln(W) = beta_0 + beta_1*Exp + beta_2*Exp^2 + sum(gamma_k*Skill_k) + sum(delta_m*Synergy_m)
           + FE_Region + FE_Pillar + epsilon
2. Mô hình Hiệu chỉnh Chệch Chọn mẫu Heckman 2 Bước (Heckman Two-Step Selection Model - Heckit):
   - Bước 1 (Selection Probit): Ước lượng xác suất công bố lương P(D_i = 1 | Z_i) và tính
     Tỷ số Mills Nghịch đảo (Inverse Mills Ratio - lambda_i).
   - Bước 2 (Outcome OLS): Đưa lambda_i vào phương trình Mincer để kiểm định giả thuyết H0: beta_lambda = 0
     (Kiểm định xem hiện tượng "Lương Thỏa thuận" có gây chệch chọn mẫu thống kê hay không).
3. Kiểm định Đa cộng tuyến VIF (Variance Inflation Factor) cho nhóm biến giải thích chính.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy.stats import norm
from statsmodels.stats.outliers_influence import variance_inflation_factor


class MincerHeckmanEconometricModel:
    """
    Bộ ước lượng Kinh tế lượng Mincer OLS Mở rộng & Kiểm định Heckman 2 Bước.
    """

    def __init__(self, skills_meta: Optional[Dict[str, Dict[str, Any]]] = None) -> None:
        self.skills_meta = skills_meta or {}
        self.ols_result: Any = None
        self.probit_result: Any = None
        self.heckman_result: Any = None
        self.reg_columns: List[str] = []

    def select_econometric_features(
        self,
        df_disclosed: pd.DataFrame,
        candidate_skill_cols: List[str],
        min_skill_obs: int = 8,
    ) -> List[str]:
        """
        Chọn các biến kiểm soát chuẩn (Kinh nghiệm, Cấp bậc, Thành phố, Hình thức làm việc, Ngành)
        cùng các biến Kỹ năng & Cộng hưởng có tần suất xuất hiện >= `min_skill_obs` để tránh suy biến ma trận.
        """
        core_controls = [
            "exp_years_mid",
            "exp_years_sq",
            "career_tier_num",
            "FE_CITY_HCM",
            "FE_CITY_HN",
            "FE_CITY_DN",
            "FE_WORK_REMOTE",
            "FE_WORK_HYBRID",
            "FE_PILLAR_DE01",
            "FE_PILLAR_DE02",
            "FE_PILLAR_DE04",
        ]
        active_controls = [
            c for c in core_controls if c in df_disclosed.columns and df_disclosed[c].std() > 1e-6
        ]

        active_skills: List[str] = []
        for sk_col in candidate_skill_cols:
            if sk_col in df_disclosed.columns:
                n_pos = int(df_disclosed[sk_col].sum())
                if min_skill_obs <= n_pos <= (len(df_disclosed) - min_skill_obs):
                    active_skills.append(sk_col)

        self.reg_columns = active_controls + active_skills
        return self.reg_columns

    def fit_extended_mincer_ols(
        self,
        df: pd.DataFrame,
        candidate_skill_cols: List[str],
        min_skill_obs: int = 8,
    ) -> Dict[str, Any]:
        """
        Ước lượng Phương trình Mincer Mở rộng bằng OLS với sai số chuẩn bền vững HC3.
        Quy đổi hệ số kỹ năng sang Phần bù Tiền lương Chính xác theo Halvorsen-Palm (1980):
            SWP_k (%) = (exp(gamma_k) - 1) * 100
        """
        df_valid = df[df["is_disclosed"] == 1].dropna(subset=["ln_salary"]).copy()
        if len(df_valid) < 25:
            min_skill_obs = max(1, len(df_valid) // 6)

        reg_cols = self.select_econometric_features(df_valid, candidate_skill_cols, min_skill_obs)
        X = sm.add_constant(df_valid[reg_cols].astype(float), has_constant="add")
        y = df_valid["ln_salary"].astype(float)

        model = sm.OLS(y, X)
        self.ols_result = model.fit(cov_type="HC3")

        # Bóc tách bảng hệ số & phần bù tiền lương kỹ năng
        coef_table: List[Dict[str, Any]] = []
        skill_premiums: List[Dict[str, Any]] = []

        for var_name in self.ols_result.params.index:
            beta = float(self.ols_result.params[var_name])
            se = float(self.ols_result.bse[var_name])
            t_stat = float(self.ols_result.tvalues[var_name])
            p_val = float(self.ols_result.pvalues[var_name])
            pct_premium = (math.exp(beta) - 1.0) * 100.0 if beta < 5.0 else 0.0

            sig_stars = "***" if p_val < 0.01 else "**" if p_val < 0.05 else "*" if p_val < 0.10 else ""
            entry = {
                "variable": var_name,
                "coef_beta": round(beta, 4),
                "robust_se": round(se, 4),
                "t_stat": round(t_stat, 3),
                "p_value": round(p_val, 4),
                "significance": sig_stars,
                "halvorsen_palm_pct": round(pct_premium, 2),
            }
            coef_table.append(entry)

            if var_name.startswith("SK_") or var_name.startswith("SYN_"):
                sk_meta = self.skills_meta.get(var_name, {})
                skill_premiums.append(
                    {
                        **entry,
                        "skill_name": sk_meta.get("name", var_name),
                        "layer": sk_meta.get("layer", "SYNERGY" if var_name.startswith("SYN_") else "L2_TOOL"),
                    }
                )

        skill_premiums.sort(key=lambda x: x["halvorsen_palm_pct"], reverse=True)

        # Tính VIF kiểm định đa cộng tuyến cho nhóm biến kiểm soát chính
        vif_summary = self._compute_vif_diagnostics(df_valid)

        return {
            "n_observations": int(self.ols_result.nobs),
            "r_squared": round(float(self.ols_result.rsquared), 4),
            "adj_r_squared": round(float(self.ols_result.rsquared_adj), 4),
            "f_statistic": round(float(self.ols_result.fvalue or 0.0), 2),
            "aic": round(float(self.ols_result.aic), 2),
            "bic": round(float(self.ols_result.bic), 2),
            "coefficients": coef_table,
            "top_skill_wage_premiums": skill_premiums,
            "vif_diagnostics": vif_summary,
        }

    def fit_heckman_two_step(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Thực hiện quy trình Heckman Two-Step Correction (Heckit):
        - Bước 1: Hồi quy Probit trên toàn bộ mẫu (gồm cả tin "Thỏa thuận" D_i=0 và tin có lương D_i=1)
          với biến công cụ (Exclusion Restrictions: `INST_SITE_ITVIEC`, `INST_SITE_TOPCV`, `vacancy_duration_days`)
          để tính Inverse Mills Ratio: lambda_i = phi(Z_i * alpha) / Phi(Z_i * alpha).
        - Bước 2: Đưa `imr_lambda` vào phương trình lương Mincer OLS trên mẫu D_i=1.
        """
        df_all = df.copy()
        n_total = len(df_all)
        n_disclosed = int(df_all["is_disclosed"].sum())
        n_censored = n_total - n_disclosed

        if n_censored < 5 or n_disclosed < 20:
            return {
                "applicable": False,
                "reason": "Cỡ mẫu tin ẩn lương hoặc tin công bố lương chưa đủ lớn để chạy Probit.",
                "total_samples": n_total,
                "disclosed_samples": n_disclosed,
                "censored_negotiable_samples": n_censored,
            }

        selection_cols = [
            c
            for c in [
                "INST_SITE_ITVIEC",
                "INST_SITE_TOPCV",
                "INST_MULTI_SOURCE",
                "career_tier_num",
                "exp_years_mid",
                "vacancy_duration_days",
                "FE_CITY_HCM",
                "FE_CITY_HN",
                "FE_PILLAR_DE01",
                "FE_PILLAR_DE04",
            ]
            if c in df_all.columns and df_all[c].std() > 1e-6
        ]

        Z = sm.add_constant(df_all[selection_cols].astype(float), has_constant="add")
        d_target = df_all["is_disclosed"].astype(int)

        try:
            probit_mod = sm.Probit(d_target, Z)
            self.probit_result = probit_mod.fit(disp=False, maxiter=100)
            linear_index = np.asarray(Z @ self.probit_result.params, dtype=float)
        except Exception:
            # Fallback Linear Probability / Logit index nếu Probit gặp hội tụ biên
            ols_sel = sm.OLS(d_target, Z).fit()
            linear_index = np.clip(np.asarray( ols_sel.fittedvalues, dtype=float) * 2.0 - 1.0, -3.0, 3.0)

        # Tính Tỷ số Mills Nghịch đảo: lambda = phi(z) / Phi(z)
        cdf_vals = np.clip(norm.cdf(linear_index), 1e-6, 1.0 - 1e-6)
        pdf_vals = norm.pdf(linear_index)
        df_all["imr_lambda"] = pdf_vals / cdf_vals

        # Bước 2: Hồi quy Mincer OLS có kèm biến `imr_lambda`
        df_sub = df_all[df_all["is_disclosed"] == 1].dropna(subset=["ln_salary"]).copy()
        step2_cols = list(self.reg_columns) + ["imr_lambda"]
        X_step2 = sm.add_constant(df_sub[step2_cols].astype(float), has_constant="add")
        y_step2 = df_sub["ln_salary"].astype(float)

        self.heckman_result = sm.OLS(y_step2, X_step2).fit(cov_type="HC3")

        lambda_beta = float(self.heckman_result.params.get("imr_lambda", 0.0))
        lambda_se = float(self.heckman_result.bse.get("imr_lambda", 0.0))
        lambda_pval = float(self.heckman_result.pvalues.get("imr_lambda", 1.0))
        selection_bias_detected = lambda_pval < 0.05

        return {
            "applicable": True,
            "total_samples": n_total,
            "disclosed_samples": n_disclosed,
            "censored_negotiable_samples": n_censored,
            "censored_rate_pct": round(n_censored / n_total * 100.0, 2),
            "imr_lambda_coef": round(lambda_beta, 4),
            "imr_lambda_se": round(lambda_se, 4),
            "imr_lambda_pvalue": round(lambda_pval, 4),
            "selection_bias_significant_5pct": selection_bias_detected,
            "heckman_adj_r2": round(float(self.heckman_result.rsquared_adj), 4),
            "interpretation": (
                "Phát hiện chệch chọn mẫu có ý nghĩa thống kê (p < 0.05): cần giữ biến Inverse Mills Ratio (lambda) để hiệu chỉnh hệ số kỹ năng."
                if selection_bias_detected
                else "Hệ số Inverse Mills Ratio (lambda) không có ý nghĩa thống kê ở mức 5% (p >= 0.05): việc ẩn lương ('Thỏa thuận') không làm chệch đáng kể ước lượng phần bù kỹ năng của Mincer OLS."
            ),
        }

    def _compute_vif_diagnostics(self, df_valid: pd.DataFrame) -> List[Dict[str, Any]]:
        """Tính hệ số phóng đại phương sai (VIF) cho nhóm biến cấu trúc chính để kiểm tra đa cộng tuyến."""
        vif_cols = [
            c
            for c in [
                "exp_years_mid",
                "career_tier_num",
                "FE_CITY_HCM",
                "FE_CITY_HN",
                "FE_WORK_REMOTE",
                "FE_PILLAR_DE01",
                "FE_PILLAR_DE04",
                "n_skills_L2",
                "n_skills_L3",
                "n_skills_L4",
            ]
            if c in df_valid.columns and df_valid[c].std() > 1e-6
        ]
        if len(vif_cols) < 2:
            return []

        X_vif = sm.add_constant(df_valid[vif_cols].astype(float), has_constant="add")
        vif_list: List[Dict[str, Any]] = []
        for idx, col_name in enumerate(X_vif.columns):
            if col_name == "const":
                continue
            try:
                val = float(variance_inflation_factor(X_vif.values, idx))
            except Exception:
                val = 1.0
            vif_list.append(
                {
                    "variable": col_name,
                    "vif": round(val, 2),
                    "status": "OK (VIF < 5)" if val < 5.0 else "MODERATE (5 <= VIF < 10)" if val < 10.0 else "HIGH",
                }
            )
        return vif_list
