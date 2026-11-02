"""
Pipeline Huấn luyện & Kiểm định Toàn diện Hệ Mô hình Định lượng (Tầng Gold):
1. Kinh tế lượng Mincer OLS Mở rộng (HC3 Robust SE + Halvorsen-Palm % Wage Premium + VIF).
2. Kiểm định & Hiệu chỉnh Chệch Chọn mẫu Heckman 2 Bước (Heckit Probit + Inverse Mills Ratio lambda).
3. Học máy Phi tuyến & Hồi quy Phân vị (LightGBM / GBDT Quantile Regression P10, P25, P50, P75, P90)
   kèm Nội suy lương ẩn cho các tin tuyển dụng "Thỏa thuận".
4. Giải thích Mô hình bằng SHAP (Global Skill Valuation + Ma trận Cộng hưởng Kỹ năng Lift).
5. Khuyến nghị Lộ trình Học tập Tối ưu ROI (Upskilling Priority Score - UPS).
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from src.db.postgres_repo import PostgresJobRepository
from src.models.feature_builder import (
    SYNERGY_PAIRS,
    LaborMarketFeatureBuilder,
    generate_calibrated_labor_dataset,
)
from src.models.mincer_econometrics import MincerHeckmanEconometricModel
from src.models.quantile_ml_shap import (
    CareerUpskillingRecommender,
    QuantileSalaryPredictor,
    ShapSkillExplainer,
)


def run_full_modeling_pipeline(
    min_training_samples: int = 350,
    configs_dir: Path = Path("configs"),
    gold_dir: Path = Path("data/gold"),
    reports_dir: Path = Path("docs/audits"),
) -> Dict[str, Any]:
    """
    Thực thi trọn vẹn chu trình huấn luyện Kinh tế lượng + Học máy Phân vị + SHAP + UPS
    và lưu kết quả ra `data/gold/model_artifacts.json` cùng báo cáo học thuật tại `docs/audits/`.
    """
    repo = PostgresJobRepository()
    db_records = repo.fetch_enriched_jobs()

    if len(db_records) < min_training_samples:
        sim_records = generate_calibrated_labor_dataset(
            n_samples=max(min_training_samples, 450 - len(db_records)),
            seed=42,
        )
        all_records = db_records + sim_records
        dataset_source = (
            f"Hybrid ({len(db_records)} bản ghi thực tế từ DB + {len(sim_records)} mẫu hiệu chỉnh thị trường VN)"
        )
    else:
        all_records = db_records
        dataset_source = f"Empirical PostgreSQL ({len(db_records)} bản ghi)"

    fb = LaborMarketFeatureBuilder(configs_dir)
    df = fb.build_dataframe(all_records)
    ml_feature_cols = fb.get_ml_feature_columns()
    candidate_skill_cols = fb.skill_ids + [s[0] for s in SYNERGY_PAIRS]

    # 1. Huấn luyện Kinh tế lượng Mincer OLS + Kiểm định Heckman 2 Bước
    econ_model = MincerHeckmanEconometricModel(skills_meta=fb.skills_meta)
    mincer_res = econ_model.fit_extended_mincer_ols(df, candidate_skill_cols=candidate_skill_cols)
    heckman_res = econ_model.fit_heckman_two_step(df)

    # 2. Huấn luyện Mô hình Học máy Phân vị (P10..P90) & Nội suy Lương Thỏa thuận
    q_predictor = QuantileSalaryPredictor(feature_cols=ml_feature_cols)
    ml_metrics = q_predictor.fit_and_evaluate(df)
    df_imputed = q_predictor.impute_negotiable_salaries(df)

    # 3. Phân tích Giá trị Biên SHAP & Ma trận Cộng hưởng Kỹ năng (Lift)
    shap_explainer = ShapSkillExplainer(predictor=q_predictor, skills_meta=fb.skills_meta)
    shap_explainer.fit_explainer(df)
    global_shap_skills = shap_explainer.summarize_global_skill_shap(df)
    synergy_lifts = shap_explainer.compute_skill_synergy_lift_matrix(df)

    # 4. Khuyến nghị Lộ trình Nâng cấp Kỹ năng (UPS) cho 2 hồ sơ điển hình
    recommender = CareerUpskillingRecommender(
        feature_builder=fb,
        predictor=q_predictor,
        explainer=shap_explainer,
        df_market=df,
    )
    sample_da_rec = recommender.evaluate_profile_and_recommend(
        sector_pillar="DE-01",
        canonical_role="DATA_ANALYST",
        current_tier="T3_JUNIOR",
        city_code="HCM",
        exp_years=2.0,
        current_skills=["SK_EXCEL", "SK_SQL", "SK_POWERBI"],
        work_mode="HYBRID",
        top_k=5,
    )
    sample_ba_rec = recommender.evaluate_profile_and_recommend(
        sector_pillar="DE-04",
        canonical_role="IT_BUSINESS_ANALYST",
        current_tier="T3_JUNIOR",
        city_code="HN",
        exp_years=2.0,
        current_skills=["SK_EXCEL", "SK_SQL", "SK_BA_MODELING_TOOLS", "SK_REQUIREMENTS_SRS_BRD"],
        work_mode="ONSITE",
        top_k=5,
    )

    # 5. Lưu Artifacts xuống Tầng Gold (`./data/gold/`)
    gold_dir.mkdir(parents=True, exist_ok=True)
    imputed_summary = {
        "total_jobs": len(df_imputed),
        "disclosed_jobs": int(df_imputed["is_disclosed"].sum()),
        "imputed_negotiable_jobs": int((df_imputed["is_disclosed"] == 0).sum()),
        "mean_disclosed_salary_vnd": round(
            float(df_imputed.loc[df_imputed["is_disclosed"] == 1, "salary_mid_vnd"].mean()), 2
        ),
        "mean_imputed_negotiable_salary_vnd": round(
            float(df_imputed.loc[df_imputed["is_disclosed"] == 0, "salary_imputed_vnd"].mean()), 2
        ),
    }

    artifacts = {
        "trained_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "dataset_source": dataset_source,
        "dataset_summary": imputed_summary,
        "mincer_ols": mincer_res,
        "heckman_two_step": heckman_res,
        "quantile_ml_metrics": ml_metrics,
        "global_shap_skill_valuation": global_shap_skills[:15],
        "skill_synergy_lifts": synergy_lifts[:12],
        "sample_upskilling_recommendations": {
            "junior_data_analyst_hcm": sample_da_rec,
            "junior_business_analyst_hn": sample_ba_rec,
        },
    }

    artifact_path = gold_dir / "model_artifacts.json"
    artifact_path.write_text(json.dumps(artifacts, ensure_ascii=False, indent=2), encoding="utf-8")

    report_path = generate_modeling_markdown_report(artifacts, reports_dir)
    artifacts["report_path"] = str(report_path)
    artifacts["artifact_path"] = str(artifact_path)
    return artifacts


def generate_modeling_markdown_report(artifacts: Dict[str, Any], reports_dir: Path) -> Path:
    """Sinh báo cáo Kết quả Ước lượng Kinh tế lượng Mincer + Heckman + LightGBM Quantile + SHAP."""
    reports_dir.mkdir(parents=True, exist_ok=True)
    report_path = reports_dir / "model-evaluation-report.md"

    mincer = artifacts["mincer_ols"]
    heckman = artifacts["heckman_two_step"]
    q_ml = artifacts["quantile_ml_metrics"]
    ds = artifacts["dataset_summary"]
    da_rec = artifacts["sample_upskilling_recommendations"]["junior_data_analyst_hcm"]

    lines: List[str] = [
        "# Báo cáo Kết quả Huấn luyện Kinh tế lượng (Mincer OLS & Heckman) + LightGBM Quantile + Giải thích SHAP",
        "",
        f"- **Thời gian huấn luyện:** `{artifacts['trained_at']}`",
        f"- **Nguồn dữ liệu:** {artifacts['dataset_source']}",
        f"- **Tổng quy mô mẫu ($N$):** `{ds['total_jobs']}` tin tuyển dụng "
        f"(`{ds['disclosed_jobs']}` tin công bố lương + `{ds['imputed_negotiable_jobs']}` tin ẩn lương 'Thỏa thuận').",
        "",
        "---",
        "",
        "## 1. Kết quả Ước lượng Phương trình Tiền lương Mincer Mở rộng (OLS với Robust SE HC3)",
        f"- **Số quan sát có công bố lương ($N_{{\\text{{OLS}}}}$):** `{mincer['n_observations']}`",
        f"- **Hệ số xác định ($R^2$ / Adjusted $R^2$):** `{mincer['r_squared']:.4f}` / `{mincer['adj_r_squared']:.4f}`",
        f"- **Thống kê $F$ (HC3):** `{mincer['f_statistic']}` | **AIC / BIC:** `{mincer['aic']}` / `{mincer['bic']}`",
        "",
        "### Top Kỹ năng Số & Tổ hợp Cộng hưởng có Phần bù Tiền lương (Halvorsen-Palm Wage Premium) Cao nhất",
        "| Mã Kỹ năng | Tên Kỹ năng / Cộng hưởng | Tầng | Hệ số $\\hat{\\gamma}_k$ | Robust SE | $p$-value | Phần bù Lương $\\text{SWP}_k$ (%) |",
        "| :--- | :--- | :---: | :---: | :---: | :---: | :---: |",
    ]

    for sk in mincer.get("top_skill_wage_premiums", [])[:12]:
        lines.append(
            f"| `{sk['variable']}` | {sk['skill_name']} | `{sk['layer']}` | `{sk['coef_beta']:+.4f}`{sk['significance']} | `{sk['robust_se']:.4f}` | `{sk['p_value']:.4f}` | **`{sk['halvorsen_palm_pct']:+.2f}%`** |"
        )

    lines.extend(
        [
            "",
            "### Kiểm định Đa cộng tuyến (VIF - Variance Inflation Factor)",
            "| Biến giải thích | Chỉ số VIF | Đánh giá |",
            "| :--- | :---: | :--- |",
        ]
    )
    for v_item in mincer.get("vif_diagnostics", []):
        lines.append(f"| `{v_item['variable']}` | `{v_item['vif']}` | {v_item['status']} |")

    lines.extend(
        [
            "",
            "---",
            "",
            "## 2. Kiểm định & Hiệu chỉnh Chệch Chọn mẫu Heckman 2 Bước (Bài toán 'Lương Thỏa thuận')",
            f"- **Tỷ lệ tin ẩn lương ('Thỏa thuận'):** `{heckman.get('censored_rate_pct', 0)}%` (`{heckman.get('censored_negotiable_samples', 0)}/{heckman.get('total_samples', 0)}` tin).",
            f"- **Hệ số Tỷ số Mills Nghịch đảo ($\\hat{{\\beta}}_\\lambda$ - Inverse Mills Ratio):** `{heckman.get('imr_lambda_coef')}` (Robust SE: `{heckman.get('imr_lambda_se')}`, $p$-value: `{heckman.get('imr_lambda_pvalue')}`).",
            f"- **Kết luận Kiểm định:** {heckman.get('interpretation')}",
            f"- **Lương trung bình nhóm công bố:** `{ds['mean_disclosed_salary_vnd']} triệu VNĐ` | **Lương nội suy trung bình nhóm 'Thỏa thuận':** `{ds['mean_imputed_negotiable_salary_vnd']} triệu VNĐ`.",
            "",
            "---",
            "",
            "## 3. Hiệu năng Mô hình Học máy Phi tuyến & Hồi quy Phân vị ($P_{10} - P_{25} - P_{50} - P_{75} - P_{90}$)",
            f"- **Động cơ huấn luyện:** `{q_ml['engine']}`",
            f"- **Độ chính xác trên tập Kiểm định (Out-of-sample Test):**",
            f"  - **$R^2$ Score:** `{q_ml['r2_score']:.4f}`",
            f"  - **MAE (Sai số tuyệt đối trung bình):** `{q_ml['mae_vnd']} triệu VNĐ/tháng`",
            f"  - **RMSE:** `{q_ml['rmse_vnd']} triệu VNĐ/tháng` | **MAPE:** `{q_ml['mape_pct']}%`",
            f"  - **Độ phủ Khoảng tin cậy 80% ($\\text{{PICP}}_{{80\\%}}: P_{{10}} \\to P_{{90}}$):** `{q_ml['picp_80_coverage_pct']}%` (Độ rộng trung bình: `{q_ml['mean_80_interval_width_vnd']} triệu VNĐ`).",
            "",
            "---",
            "",
            "## 4. Định giá Kỹ năng theo Lý thuyết Trò chơi Shapley (SHAP) & Ma trận Cộng hưởng ($Lift$)",
            "",
            "### 4.1. Giá trị Đóng góp Biên SHAP Trung bình của Kỹ năng Số (Đơn vị: Triệu VNĐ/tháng)",
            "| Mã Kỹ năng | Tên Kỹ năng | Tầng | Tần suất Cầu (%) | $|\\text{SHAP}|$ Trung bình | Phần bù SHAP Ròng (Triệu VNĐ/tháng) |",
            "| :--- | :--- | :---: | :---: | :---: | :---: |",
        ]
    )

    for sh in artifacts.get("global_shap_skill_valuation", [])[:12]:
        lines.append(
            f"| `{sh['skill_id']}` | {sh['skill_name']} | `{sh['layer']}` | `{sh['demand_freq_pct']}%` | `{sh['mean_abs_shap_vnd']:.3f}` | **`{sh['net_shap_premium_vnd']:+.2f} tr.VNĐ`** |"
        )

    lines.extend(
        [
            "",
            "### 4.2. Top Cặp Kỹ năng Cộng hưởng Mạnh nhất (Skill Co-occurrence & Synergy Lift)",
            "| Kỹ năng A | Kỹ năng B | Số tin đi cùng | Xác suất chung (%) | Hệ số Cộng hưởng $\\text{Lift}(A, B)$ |",
            "| :--- | :--- | :---: | :---: | :---: |",
        ]
    )
    for syn in artifacts.get("skill_synergy_lifts", [])[:8]:
        lines.append(
            f"| `{syn['skill_a']}` ({syn['skill_a_name']}) | `{syn['skill_b']}` ({syn['skill_b_name']}) | {syn['cooccurrence_count']} | `{syn['joint_prob_pct']}%` | **`{syn['synergy_lift']}x`** |"
        )

    sf = da_rec["salary_forecast_vnd"]
    lines.extend(
        [
            "",
            "---",
            "",
            "## 5. Minh họa Khuyến nghị Lộ trình Nâng cấp Kỹ năng (Upskilling Priority Score - $UPS$)",
            f"- **Hồ sơ thử nghiệm:** `Junior Data Analyst` (`T3_JUNIOR` $\\to$ mục tiêu `T4_MIDDLE_SENIOR`), 2 năm KN tại `TP.HCM` (`HYBRID`), kỹ năng hiện có: `Excel, SQL, Power BI`.",
            f"- **Dự báo phân phối lương hiện tại:** $P_{{10}} = {sf['p10_vnd']}$ | $P_{{25}} = {sf['p25_vnd']}$ | **Trung vị $P_{{50}} = {sf['p50_median_vnd']} tr.VNĐ** | $P_{{75}} = {sf['p75_vnd']}$ | $P_{{90}} = {sf['p90_vnd']} tr.VNĐ$.",
            "",
            "| Hạng | Kỹ năng Khuyến nghị Học thêm | Tầng | Tăng lương Kỳ vọng $\\widehat{\\Delta W}_{\\text{SHAP}}$ | Cầu ở Tầng T4 (%) | Hệ số Synergy | Độ khó (Giờ học) | Điểm Ưu tiên $UPS$ |",
            "| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |",
        ]
    )

    for rank, rec in enumerate(da_rec.get("upskilling_recommendations", []), start=1):
        lines.append(
            f"| **#{rank}** | `{rec['skill_id']}` ({rec['skill_name']}) | `{rec['layer']}` | **`+{rec['expected_wage_gain_vnd']} tr.VNĐ`** | `{rec['next_tier_demand_pct']}%` | `{rec['synergy_lift_with_profile']}x` | Lv.{rec['learning_difficulty']} ({rec['estimated_learning_hours']}h) | **`{rec['ups_score']}`** |"
        )

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return report_path


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        description="Huấn luyện Mô hình Kinh tế lượng Mincer OLS + Heckman + LightGBM Quantile + SHAP"
    )
    parser.add_argument(
        "--min-samples",
        type=int,
        default=350,
        help="Số lượng mẫu tối thiểu (tự động bổ sung mẫu hiệu chỉnh nếu DB mới khởi tạo)",
    )
    args = parser.parse_args()

    res = run_full_modeling_pipeline(min_training_samples=args.min_samples)
    print("=== KẾT QUẢ HUẤN LUYỆN MÔ HÌNH MINCER OLS + HECKMAN + QUANTILE ML + SHAP ===")
    print(f"- Nguồn dữ liệu: {res['dataset_source']}")
    print(
        f"- Mincer OLS (HC3): R2 = {res['mincer_ols']['r_squared']:.4f}, Adj_R2 = {res['mincer_ols']['adj_r_squared']:.4f}"
    )
    print(
        f"- Kiểm định Heckman 2-Step: IMR lambda = {res['heckman_two_step'].get('imr_lambda_coef')} (p = {res['heckman_two_step'].get('imr_lambda_pvalue')})"
    )
    print(
        f"- Quantile ML ({res['quantile_ml_metrics']['engine']}): R2 = {res['quantile_ml_metrics']['r2_score']:.4f}, MAE = {res['quantile_ml_metrics']['mae_vnd']} tr.VNĐ, PICP_80% = {res['quantile_ml_metrics']['picp_80_coverage_pct']}%"
    )
    print(f"- Đã lưu Artifacts tại: {res['artifact_path']}")
    print(f"- Đã xuất Báo cáo Học thuật tại: {res['report_path']}")


if __name__ == "__main__":
    main()
