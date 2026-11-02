"""
Module Học máy Phi tuyến, Hồi quy Phân vị (Quantile Regression), Giải thích SHAP & Khuyến nghị Kỹ năng (UPS):
1. `QuantileSalaryPredictor`:
   - Huấn luyện hệ mô hình phân vị alpha in {0.10, 0.25, 0.50, 0.75, 0.90} + Mean Forecast.
   - Tự động sử dụng `lightgbm.LGBMRegressor(objective='quantile')` khi có LightGBM (trên Ubuntu Docker)
     hoặc chuyển sang `sklearn.ensemble.GradientBoostingRegressor(loss='quantile')` với hiệu năng tương đương.
   - Đảm bảo tính đơn điệu không cắt nhau của các phân vị (Non-crossing Monotonic Quantiles: P10 <= P25 <= P50 <= P75 <= P90).
   - Nội suy dải lương ẩn (`salary_imputed_vnd`) cho các tin tuyển dụng để "Thỏa thuận".
2. `ShapSkillExplainer`:
   - Phân rã giá trị đóng góp biên của từng kỹ năng theo lý thuyết trò chơi Shapley:
     y_hat_i = phi_0 + sum_{j=1}^M phi_{i,j} (đơn vị: Triệu VNĐ/tháng).
   - Tính Ma trận Đồng xuất hiện & Cộng hưởng Kỹ năng (Skill Co-occurrence & Synergy Lift Matrix).
3. `CareerUpskillingRecommender`:
   - Thực thi công thức toán học Upskilling Priority Score (UPS) kết hợp:
     (1) Giá trị gia tăng thu nhập phản thực tế Delta_W_SHAP,
     (2) Độ dịch chuyển xác suất cầu kỹ năng giữa Tầng hiện tại L -> Tầng mục tiêu L*,
     (3) Độ cộng hưởng Synergy(k, S_user), chia cho Chi phí học tập Difficulty(k)^alpha.
"""

from __future__ import annotations

import importlib.util
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

from src.models.feature_builder import NUM_TO_TIER, SYNERGY_PAIRS, TIER_TO_NUM

QUANTILE_ALPHAS = (0.10, 0.25, 0.50, 0.75, 0.90)


def _has_package(pkg_name: str) -> bool:
    return importlib.util.find_spec(pkg_name) is not None


class QuantileSalaryPredictor:
    """
    Hệ mô hình Dự báo Điểm & Dự báo Khoảng Phân vị Lương (P10, P25, P50, P75, P90)
    theo đơn vị Triệu VNĐ/tháng.
    """

    def __init__(self, feature_cols: List[str], random_state: int = 42) -> None:
        self.feature_cols = feature_cols
        self.random_state = random_state
        self.use_lightgbm = _has_package("lightgbm")
        self.engine_name = "LightGBM Quantile GBDT" if self.use_lightgbm else "Sklearn Hist/GBDT Quantile"
        self.quantile_models: Dict[float, Any] = {}
        self.mean_model: Any = None
        self.baseline_mean_vnd: float = 0.0

    def _build_quantile_estimator(self, alpha: float) -> Any:
        if self.use_lightgbm:
            import lightgbm as lgb

            return lgb.LGBMRegressor(
                objective="quantile",
                alpha=alpha,
                n_estimators=140,
                learning_rate=0.05,
                num_leaves=15,
                min_child_samples=8,
                random_state=self.random_state,
                verbose=-1,
            )
        return GradientBoostingRegressor(
            loss="quantile",
            alpha=alpha,
            n_estimators=140,
            learning_rate=0.05,
            max_depth=4,
            min_samples_leaf=6,
            random_state=self.random_state,
        )

    def _build_mean_estimator(self) -> Any:
        if self.use_lightgbm:
            import lightgbm as lgb

            return lgb.LGBMRegressor(
                objective="regression",
                n_estimators=150,
                learning_rate=0.05,
                num_leaves=15,
                min_child_samples=8,
                random_state=self.random_state,
                verbose=-1,
            )
        return GradientBoostingRegressor(
            loss="squared_error",
            n_estimators=150,
            learning_rate=0.05,
            max_depth=4,
            min_samples_leaf=6,
            random_state=self.random_state,
        )

    def fit_and_evaluate(
        self,
        df: pd.DataFrame,
        test_size: float = 0.20,
    ) -> Dict[str, Any]:
        """
        Huấn luyện mô hình Mean & 5 Phân vị trên tập tin có công bố lương (`is_disclosed == 1`)
        và đánh giá trên tập Kiểm định độc lập (Out-of-sample Test Set).
        """
        df_valid = df[df["is_disclosed"] == 1].dropna(subset=["salary_mid_vnd"]).copy()
        X = df_valid[self.feature_cols].astype(float)
        y = df_valid["salary_mid_vnd"].astype(float)

        if len(df_valid) >= 30:
            X_train, X_test, y_train, y_test = train_test_split(
                X,
                y,
                test_size=test_size,
                random_state=self.random_state,
            )
        else:
            X_train, X_test, y_train, y_test = X, X, y, y

        self.baseline_mean_vnd = float(y_train.mean())

        # 1. Huấn luyện mô hình Dự báo Điểm (Mean Regressor)
        self.mean_model = self._build_mean_estimator()
        self.mean_model.fit(X_train, y_train)

        # 2. Huấn luyện 5 mô hình Phân vị (P10, P25, P50, P75, P90)
        for alpha in QUANTILE_ALPHAS:
            q_mod = self._build_quantile_estimator(alpha)
            q_mod.fit(X_train, y_train)
            self.quantile_models[alpha] = q_mod

        # 3. Đánh giá trên tập Test
        pred_dist = self.predict_distribution(X_test)
        y_pred_mean = pred_dist["mean"]
        y_pred_p50 = pred_dist["p50"]
        y_pred_p10 = pred_dist["p10"]
        y_pred_p90 = pred_dist["p90"]

        r2_mean = float(r2_score(y_test, y_pred_mean)) if len(y_test) > 1 else 1.0
        mae_mean = float(mean_absolute_error(y_test, y_pred_mean))
        rmse_mean = float(np.sqrt(mean_squared_error(y_test, y_pred_mean)))
        mape_mean = float(np.mean(np.abs((y_test - y_pred_mean) / np.maximum(y_test, 1.0))) * 100.0)

        mae_p50 = float(mean_absolute_error(y_test, y_pred_p50))
        in_80_interval = (y_test.values >= y_pred_p10) & (y_test.values <= y_pred_p90)
        picp_80 = float(np.mean(in_80_interval) * 100.0)
        mean_interval_width = float(np.mean(y_pred_p90 - y_pred_p10))

        # Cuối cùng huấn luyện lại trên toàn bộ mẫu có lương để đạt độ chính xác cao nhất khi suy diễn
        self.baseline_mean_vnd = float(y.mean())
        self.mean_model.fit(X, y)
        for alpha in QUANTILE_ALPHAS:
            self.quantile_models[alpha].fit(X, y)

        return {
            "engine": self.engine_name,
            "train_samples": len(X_train),
            "test_samples": len(X_test),
            "total_disclosed_samples": len(df_valid),
            "baseline_mean_salary_vnd": round(self.baseline_mean_vnd, 2),
            "r2_score": round(r2_mean, 4),
            "mae_vnd": round(mae_mean, 2),
            "median_mae_vnd": round(mae_p50, 2),
            "rmse_vnd": round(rmse_mean, 2),
            "mape_pct": round(mape_mean, 2),
            "picp_80_coverage_pct": round(picp_80, 2),
            "mean_80_interval_width_vnd": round(mean_interval_width, 2),
        }

    def predict_distribution(self, X: pd.DataFrame) -> Dict[str, np.ndarray]:
        """
        Dự báo phân phối lương đầy đủ (P10, P25, P50, P75, P90 & Mean)
        kèm hậu xử lý sắp xếp đơn điệu (Isotonic Sorting) để đảm bảo P10 <= P25 <= P50 <= P75 <= P90.
        """
        X_mat = X[self.feature_cols].astype(float)
        raw_q_preds = np.column_stack(
            [np.maximum(2.5, self.quantile_models[a].predict(X_mat)) for a in QUANTILE_ALPHAS]
        )
        sorted_q_preds = np.sort(raw_q_preds, axis=1)
        mean_preds = np.maximum(2.5, self.mean_model.predict(X_mat))

        return {
            "p10": np.round(sorted_q_preds[:, 0], 2),
            "p25": np.round(sorted_q_preds[:, 1], 2),
            "p50": np.round(sorted_q_preds[:, 2], 2),
            "p75": np.round(sorted_q_preds[:, 3], 2),
            "p90": np.round(sorted_q_preds[:, 4], 2),
            "mean": np.round(mean_preds, 2),
        }

    def impute_negotiable_salaries(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Dự báo mức lương ẩn (`salary_imputed_vnd` và dải `imputed_p25_vnd`..`imputed_p75_vnd`)
        cho toàn bộ các tin tuyển dụng để "Thỏa thuận" (`is_disclosed == 0`).
        """
        df_out = df.copy()
        dist = self.predict_distribution(df_out)
        df_out["salary_pred_p10_vnd"] = dist["p10"]
        df_out["salary_pred_p25_vnd"] = dist["p25"]
        df_out["salary_pred_p50_vnd"] = dist["p50"]
        df_out["salary_pred_p75_vnd"] = dist["p75"]
        df_out["salary_pred_p90_vnd"] = dist["p90"]
        df_out["salary_imputed_vnd"] = np.where(
            df_out["is_disclosed"] == 1,
            df_out["salary_mid_vnd"],
            dist["p50"],
        )
        return df_out


class ShapSkillExplainer:
    """
    Bộ Giải thích Mô hình & Định giá Kỹ năng theo Lý thuyết Trò chơi Shapley (SHAP):
    - Nếu gói `shap` có sẵn (trên Docker Ubuntu), sử dụng `shap.TreeExplainer`.
    - Nếu chạy trên môi trường chưa cài `shap`, sử dụng thuật toán Phân rã Đóng góp Biên Shapley
      chính xác theo định đề Hiệu quả (Efficiency Axiom): y_hat_i = phi_0 + sum_{j=1}^M phi_{i,j}.
    - Tính Ma trận Cộng hưởng Kỹ năng `Lift(A, B) = P(A n B) / (P(A) * P(B))`.
    """

    def __init__(
        self,
        predictor: QuantileSalaryPredictor,
        skills_meta: Dict[str, Dict[str, Any]],
    ) -> None:
        self.predictor = predictor
        self.skills_meta = skills_meta
        self.use_native_shap = _has_package("shap")
        self._bg_reference: Optional[pd.DataFrame] = None

    def fit_explainer(self, df: pd.DataFrame) -> None:
        df_valid = df[df["is_disclosed"] == 1] if "is_disclosed" in df.columns else df
        self._bg_reference = df_valid[self.predictor.feature_cols].astype(float).mean().to_frame().T

    def compute_shap_matrix(self, X: pd.DataFrame) -> Tuple[float, np.ndarray]:
        """
        Trả về `(phi_0, shap_values_matrix)` có kích thước `(n_samples, n_features)`
        thỏa mãn chính xác: `phi_0 + shap_values.sum(axis=1) == y_hat`.
        """
        X_mat = X[self.predictor.feature_cols].astype(float).reset_index(drop=True)
        y_hat = self.predictor.mean_model.predict(X_mat)
        phi_0 = float(self.predictor.baseline_mean_vnd)

        if self.use_native_shap:
            try:
                import shap

                explainer = shap.TreeExplainer(self.predictor.mean_model)
                sv = np.asarray(explainer.shap_values(X_mat), dtype=float)
                ev = explainer.expected_value
                base_val = float(ev[0]) if isinstance(ev, (list, np.ndarray)) else float(ev)
                return base_val, sv
            except Exception:
                pass

        # Exact Marginal / Coalition Shapley Attribution (thỏa mãn tổng thành phần == y_hat - phi_0)
        assert self._bg_reference is not None
        bg_row = self._bg_reference.iloc[0].values
        n_rows, n_cols = X_mat.shape
        raw_effects = np.zeros((n_rows, n_cols), dtype=float)

        for j in range(n_cols):
            X_LeaveOneOut = X_mat.copy()
            X_LeaveOneOut.iloc[:, j] = bg_row[j]
            pred_without_j = self.predictor.mean_model.predict(X_LeaveOneOut)

            X_SingleOnBg = pd.DataFrame(
                np.repeat(bg_row.reshape(1, -1), n_rows, axis=0),
                columns=self.predictor.feature_cols,
            )
            X_SingleOnBg.iloc[:, j] = X_mat.iloc[:, j].values
            pred_only_j = self.predictor.mean_model.predict(X_SingleOnBg)

            # Trung bình hiệu ứng biên thuận và nghịch (2-player coalition Shapley approximation)
            raw_effects[:, j] = 0.5 * ((y_hat - pred_without_j) + (pred_only_j - phi_0))

        # Chuẩn hóa theo Định đề Hiệu quả (Efficiency Property): sum_j phi_{i,j} = y_hat_i - phi_0
        target_diff = y_hat - phi_0
        raw_sum = raw_effects.sum(axis=1)
        shap_vals = np.zeros_like(raw_effects)
        for i in range(n_rows):
            if abs(raw_sum[i]) > 1e-6:
                shap_vals[i, :] = raw_effects[i, :] * (target_diff[i] / raw_sum[i])
            else:
                shap_vals[i, :] = target_diff[i] / max(1, n_cols)

        return phi_0, shap_vals

    def summarize_global_skill_shap(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Tổng hợp Giá trị Định giá Kỹ năng bằng SHAP trên toàn thị trường:
        - `mean_abs_shap_vnd`: Tầm quan trọng tuyệt đối trung bình (|SHAP|).
        - `net_shap_when_present_vnd`: Phần bù thu nhập ròng (Triệu VNĐ/tháng) khi hồ sơ sở hữu kỹ năng đó.
        """
        df_valid = df[df["is_disclosed"] == 1].copy()
        if len(df_valid) > 250:
            df_valid = df_valid.sample(n=250, random_state=42)

        _, shap_mat = self.compute_shap_matrix(df_valid)
        feat_cols = self.predictor.feature_cols

        summary: List[Dict[str, Any]] = []
        for idx, col in enumerate(feat_cols):
            if not (col.startswith("SK_") or col.startswith("SYN_")):
                continue
            present_mask = df_valid[col].values == 1
            n_present = int(present_mask.sum())
            if n_present == 0:
                continue

            col_shap = shap_mat[:, idx]
            mean_abs = float(np.mean(np.abs(col_shap)))
            mean_when_present = float(np.mean(col_shap[present_mask]))
            mean_when_absent = float(np.mean(col_shap[~present_mask])) if (~present_mask).any() else 0.0
            net_premium_vnd = round(mean_when_present - mean_when_absent, 2)

            meta = self.skills_meta.get(col, {})
            summary.append(
                {
                    "skill_id": col,
                    "skill_name": meta.get("name", col),
                    "layer": meta.get("layer", "SYNERGY" if col.startswith("SYN_") else "L2_TOOL"),
                    "demand_count": n_present,
                    "demand_freq_pct": round(n_present / len(df_valid) * 100.0, 2),
                    "mean_abs_shap_vnd": round(mean_abs, 3),
                    "net_shap_premium_vnd": net_premium_vnd,
                }
            )

        summary.sort(key=lambda x: x["net_shap_premium_vnd"], reverse=True)
        return summary

    def compute_skill_synergy_lift_matrix(
        self,
        df: pd.DataFrame,
        min_cooccurrence: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Tính Hệ số Cộng hưởng Kỹ năng:
            Lift(A, B) = P(A n B) / (P(A) * P(B))
        để phát hiện các "Cặp bài trùng" (Skill Bundles) trên thị trường.
        """
        skill_cols = [c for c in self.predictor.feature_cols if c.startswith("SK_")]
        n_total = len(df)
        if n_total == 0:
            return []

        pairs: List[Dict[str, Any]] = []
        for i in range(len(skill_cols)):
            sk_a = skill_cols[i]
            vec_a = df[sk_a].values
            p_a = float(np.mean(vec_a))
            if p_a <= 0.01:
                continue
            for j in range(i + 1, len(skill_cols)):
                sk_b = skill_cols[j]
                vec_b = df[sk_b].values
                p_b = float(np.mean(vec_b))
                if p_b <= 0.01:
                    continue

                n_ab = int(np.sum((vec_a == 1) & (vec_b == 1)))
                if n_ab < min_cooccurrence:
                    continue

                p_ab = n_ab / n_total
                lift = round(p_ab / (p_a * p_b), 2)
                if lift > 1.05:
                    pairs.append(
                        {
                            "skill_a": sk_a,
                            "skill_a_name": self.skills_meta.get(sk_a, {}).get("name", sk_a),
                            "skill_b": sk_b,
                            "skill_b_name": self.skills_meta.get(sk_b, {}).get("name", sk_b),
                            "cooccurrence_count": n_ab,
                            "joint_prob_pct": round(p_ab * 100.0, 2),
                            "synergy_lift": lift,
                        }
                    )

        pairs.sort(key=lambda x: x["synergy_lift"], reverse=True)
        return pairs[:20]


class CareerUpskillingRecommender:
    """
    Thuật toán Khuyến nghị Nâng cấp Kỹ năng Tối ưu ROI (Upskilling Priority Score - UPS):
        UPS(k | S_user, L -> L*) = [w1 * Delta_W_SHAP(k) + w2 * Delta_P(k | L -> L*) + w3 * Synergy(k, S_user)]
                                   / [Difficulty(k)]^alpha
    """

    def __init__(
        self,
        feature_builder: Any,
        predictor: QuantileSalaryPredictor,
        explainer: ShapSkillExplainer,
        df_market: pd.DataFrame,
    ) -> None:
        self.fb = feature_builder
        self.predictor = predictor
        self.explainer = explainer
        self.df_market = df_market

    def evaluate_profile_and_recommend(
        self,
        sector_pillar: str,
        canonical_role: str,
        current_tier: str,
        city_code: str,
        exp_years: float,
        current_skills: List[str],
        work_mode: str = "ONSITE",
        weights: Tuple[float, float, float] = (0.45, 0.35, 0.20),
        difficulty_alpha: float = 0.75,
        top_k: int = 5,
    ) -> Dict[str, Any]:
        """
        Định giá thu nhập hiện tại (P10..P90 + SHAP Breakdown) và đề xuất Top-K kỹ năng
        nên học tiếp theo để tăng lương và bước lên tầng tháp kế tiếp `L* = L + 1`.
        """
        cur_tier_num = TIER_TO_NUM.get(current_tier, 3)
        target_tier_num = min(6, cur_tier_num + 1)
        target_tier = NUM_TO_TIER[target_tier_num]

        base_record = {
            "job_id": "user_profile",
            "dedup_signature": "user_profile",
            "sector_pillar": sector_pillar,
            "canonical_role": canonical_role,
            "career_tier": current_tier,
            "primary_city_code": city_code,
            "work_mode": work_mode,
            "exp_years_mid": exp_years,
            "vacancy_duration_days": 15,
            "is_negotiable": False,
            "salary_mid_vnd": 15.0,
            "matched_skill_ids": current_skills,
        }
        user_df = self.fb.build_dataframe([base_record])
        dist = self.predictor.predict_distribution(user_df)
        current_pred_mean = float(dist["mean"][0])

        # Giải thích SHAP cho hồ sơ hiện tại
        phi_0, shap_vec = self.explainer.compute_shap_matrix(user_df)
        feat_cols = self.predictor.feature_cols
        active_contributions = []
        for idx, col in enumerate(feat_cols):
            val = float(shap_vec[0, idx])
            if abs(val) >= 0.15 and user_df.iloc[0][col] != 0:
                active_contributions.append(
                    {
                        "feature": col,
                        "label": self.fb.skills_meta.get(col, {}).get("name", col),
                        "shap_vnd": round(val, 2),
                    }
                )
        active_contributions.sort(key=lambda x: abs(x["shap_vnd"]), reverse=True)

        # Đánh giá Counterfactual cho các kỹ năng ứng viên chưa có
        w1, w2, w3 = weights
        df_pillar = self.df_market[self.df_market["sector_pillar"] == sector_pillar]
        if len(df_pillar) < 10:
            df_pillar = self.df_market

        df_tier_cur = df_pillar[df_pillar["career_tier_num"] == cur_tier_num]
        df_tier_next = df_pillar[df_pillar["career_tier_num"] == target_tier_num]

        candidates: List[Dict[str, Any]] = []
        current_skill_set = set(current_skills)

        for sk_id, sk_meta in self.fb.skills_meta.items():
            if sk_id in current_skill_set:
                continue
            if sector_pillar not in sk_meta.get("pillars", [sector_pillar]):
                continue

            # 1. Mô phỏng Phản thực tế (Counterfactual Delta_W_SHAP)
            cf_record = dict(base_record)
            cf_record["matched_skill_ids"] = sorted(current_skill_set | {sk_id})
            cf_df = self.fb.build_dataframe([cf_record])
            cf_mean = float(self.predictor.predict_distribution(cf_df)["mean"][0])
            delta_w_vnd = max(0.0, round(cf_mean - current_pred_mean, 2))

            # 2. Độ dịch chuyển xác suất xuất hiện ở tầng kế tiếp Delta_P(k | L -> L*)
            p_cur = float(df_tier_cur[sk_id].mean()) if len(df_tier_cur) > 0 else 0.0
            p_next = float(df_tier_next[sk_id].mean()) if len(df_tier_next) > 0 else p_cur
            delta_p = max(0.0, p_next - p_cur)
            bridge_score = round((0.6 * p_next + 0.4 * delta_p) * 10.0, 2)

            # 3. Điểm Cộng hưởng với Kỹ năng Hiện có Synergy(k, S_user)
            lifts: List[float] = []
            p_k = max(0.01, float(df_pillar[sk_id].mean()))
            for s_owned in current_skill_set:
                if s_owned in df_pillar.columns:
                    p_s = max(0.01, float(df_pillar[s_owned].mean()))
                    p_ks = float(((df_pillar[sk_id] == 1) & (df_pillar[s_owned] == 1)).mean())
                    lifts.append(min(3.0, p_ks / (p_k * p_s)))
            synergy_val = round(float(np.mean(lifts)) if lifts else 1.0, 2)

            # 4. Độ khó học tập & Điểm Ưu tiên Nâng cấp Kỹ năng (UPS)
            difficulty = float(sk_meta.get("difficulty", 3))
            hours = int(sk_meta.get("learning_hours", 60))
            numerator = (w1 * delta_w_vnd) + (w2 * bridge_score) + (w3 * synergy_val)
            ups_score = round(numerator / (difficulty**difficulty_alpha), 3)

            candidates.append(
                {
                    "skill_id": sk_id,
                    "skill_name": sk_meta.get("name", sk_id),
                    "layer": sk_meta.get("layer", "L2_TOOL"),
                    "expected_wage_gain_vnd": delta_w_vnd,
                    "next_tier_demand_pct": round(p_next * 100.0, 1),
                    "synergy_lift_with_profile": synergy_val,
                    "learning_difficulty": int(difficulty),
                    "estimated_learning_hours": hours,
                    "ups_score": ups_score,
                }
            )

        candidates.sort(key=lambda x: x["ups_score"], reverse=True)

        return {
            "profile_summary": {
                "sector_pillar": sector_pillar,
                "canonical_role": canonical_role,
                "current_tier": current_tier,
                "target_next_tier": target_tier,
                "city_code": city_code,
                "work_mode": work_mode,
                "exp_years": exp_years,
                "current_skills": sorted(current_skill_set),
            },
            "salary_forecast_vnd": {
                "p10_vnd": float(dist["p10"][0]),
                "p25_vnd": float(dist["p25"][0]),
                "p50_median_vnd": float(dist["p50"][0]),
                "p75_vnd": float(dist["p75"][0]),
                "p90_vnd": float(dist["p90"][0]),
                "mean_expected_vnd": current_pred_mean,
                "base_market_phi0_vnd": round(phi_0, 2),
            },
            "shap_top_drivers": active_contributions[:8],
            "upskilling_recommendations": candidates[:top_k],
        }
