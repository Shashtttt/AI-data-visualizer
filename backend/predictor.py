"""
predictor.py - Multi-Industry Predictive Analytics Engine
Handles: industry detection, problem-type detection, preprocessing,
         model training, evaluation, SHAP explainability, What-If,
         and recommendation generation.
"""

import os
import json
import pickle
import base64
import warnings
import io

import numpy as np
import pandas as pd
from scipy import stats

warnings.filterwarnings("ignore")

# ---- INDUSTRY DETECTION ----

INDUSTRY_KEYWORDS = {
    "education": [
        "student", "grade", "gpa", "score", "exam", "attendance",
        "marks", "course", "teacher", "school", "university", "pass",
        "fail", "homework", "test", "quiz", "degree", "study"
    ],
    "healthcare": [
        "patient", "diagnosis", "disease", "symptom", "bmi", "blood",
        "pressure", "cholesterol", "age", "hospital", "medicine",
        "treatment", "readmission", "mortality", "clinical", "glucose",
        "insulin", "pulse", "heartrate", "heart_rate"
    ],
    "automobile": [
        "car", "vehicle", "fuel", "mileage", "engine", "model",
        "transmission", "horsepower", "price", "sales", "dealer",
        "manufacturer", "brand", "sedan", "suv", "electric", "hybrid",
        "mpg", "displacement"
    ],
    "finance": [
        "revenue", "profit", "loss", "interest", "rate", "inflation",
        "stock", "investment", "loan", "credit", "debt", "income",
        "expense", "tax", "gdp", "market", "portfolio", "dividend",
        "equity", "liability", "asset", "balance"
    ],
}


def detect_industry(df):
    col_text = " ".join(df.columns.str.lower().tolist())
    scores = {}
    for industry, keywords in INDUSTRY_KEYWORDS.items():
        scores[industry] = sum(1 for kw in keywords if kw in col_text)
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "generic"


# ---- PROBLEM TYPE DETECTION ----

def detect_problem_type(df, target_col):
    series = df[target_col].dropna()
    if series.dtype == object or series.dtype == bool:
        return "classification"
    unique_ratio = series.nunique() / max(len(series), 1)
    if series.nunique() <= 15 or unique_ratio < 0.05:
        return "classification"
    return "regression"


# ---- DATA LOADING ----

def _load_df(filepath):
    if isinstance(filepath, pd.DataFrame):
        return filepath.copy()
    ext = os.path.splitext(filepath)[1].lower()
    if ext == ".csv":
        try:
            return pd.read_csv(filepath)
        except UnicodeDecodeError:
            return pd.read_csv(filepath, encoding="latin1")
    elif ext in [".xls", ".xlsx"]:
        return pd.read_excel(filepath)
    raise ValueError(f"Unsupported file format: {ext}")


# ---- PREPROCESSING ----

def preprocess(df, target_col, feature_cols, problem_type):
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import LabelEncoder, StandardScaler
    from sklearn.impute import SimpleImputer

    df = df.copy()
    y_raw = df[target_col].copy()

    le_target = None
    if problem_type == "classification":
        le_target = LabelEncoder()
        y = le_target.fit_transform(y_raw.astype(str).fillna("Unknown"))
        class_names = list(le_target.classes_)
    else:
        y = pd.to_numeric(y_raw, errors="coerce")
        valid_mask = y.notna()
        df = df[valid_mask]
        y = y[valid_mask].values.astype(float)
        class_names = None

    X = df[feature_cols].copy()
    cat_cols = X.select_dtypes(include=["object", "category", "bool"]).columns.tolist()
    num_cols = [c for c in X.columns if c not in cat_cols]

    label_encoders = {}
    for col in cat_cols:
        le = LabelEncoder()
        X[col] = le.fit_transform(X[col].astype(str).fillna("Unknown"))
        label_encoders[col] = le

    for col in num_cols:
        X[col] = pd.to_numeric(X[col], errors="coerce")

    imputer = SimpleImputer(strategy="median")
    X_imputed = imputer.fit_transform(X)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_imputed)

    feature_names = list(X.columns)

    preprocessor_meta = {
        "scaler": scaler,
        "imputer": imputer,
        "label_encoders": label_encoders,
        "le_target": le_target,
        "class_names": class_names,
        "feature_names": feature_names,
        "cat_cols": cat_cols,
        "num_cols": num_cols,
    }

    if problem_type == "classification":
        try:
            X_train, X_test, y_train, y_test = train_test_split(
                X_scaled, y, test_size=0.2, random_state=42, stratify=y
            )
        except Exception:
            X_train, X_test, y_train, y_test = train_test_split(
                X_scaled, y, test_size=0.2, random_state=42
            )
    else:
        X_train, X_test, y_train, y_test = train_test_split(
            X_scaled, y, test_size=0.2, random_state=42
        )

    return X_train, X_test, y_train, y_test, preprocessor_meta, feature_names


# ---- MODEL TRAINING ----

def train_models(X_train, y_train, problem_type):
    from sklearn.linear_model import LinearRegression, LogisticRegression
    from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
    from sklearn.model_selection import cross_val_score
    import xgboost as xgb

    models = {}

    if problem_type == "regression":
        candidates = {
            "Linear Regression": LinearRegression(),
            "Random Forest": RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1),
            "XGBoost": xgb.XGBRegressor(n_estimators=100, random_state=42, verbosity=0, n_jobs=-1),
        }
        scoring = "r2"
    else:
        n_classes = len(np.unique(y_train))
        candidates = {
            "Logistic Regression": LogisticRegression(max_iter=500, random_state=42, n_jobs=-1),
            "Random Forest": RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1),
            "XGBoost": xgb.XGBClassifier(
                n_estimators=100, random_state=42, verbosity=0, n_jobs=-1,
                use_label_encoder=False, eval_metric="logloss",
            ),
        }
        scoring = "f1_weighted"

    for name, model in candidates.items():
        try:
            model.fit(X_train, y_train)
            cv_scores = cross_val_score(model, X_train, y_train, cv=5, scoring=scoring)
            models[name] = {
                "model": model,
                "cv_mean": float(np.mean(cv_scores)),
                "cv_std": float(np.std(cv_scores)),
            }
        except Exception as e:
            print(f"[predictor] Failed to train {name}: {e}")

    return models


# ---- EVALUATION ----

def evaluate_models(models, X_test, y_test, problem_type):
    from sklearn.metrics import (
        mean_squared_error, mean_absolute_error, r2_score,
        accuracy_score, f1_score, roc_auc_score
    )

    results = {}
    for name, info in models.items():
        model = info["model"]
        try:
            y_pred = model.predict(X_test)
            entry = {"cv_mean": info["cv_mean"], "cv_std": info["cv_std"]}

            if problem_type == "regression":
                mse = float(mean_squared_error(y_test, y_pred))
                entry["rmse"] = float(np.sqrt(mse))
                entry["mae"] = float(mean_absolute_error(y_test, y_pred))
                entry["r2"] = float(r2_score(y_test, y_pred))
                entry["mse"] = mse
            else:
                entry["accuracy"] = float(accuracy_score(y_test, y_pred))
                entry["f1"] = float(f1_score(y_test, y_pred, average="weighted"))
                try:
                    proba = model.predict_proba(X_test)
                    if proba.shape[1] == 2:
                        entry["auc"] = float(roc_auc_score(y_test, proba[:, 1]))
                    else:
                        entry["auc"] = float(roc_auc_score(y_test, proba, multi_class="ovr", average="weighted"))
                except Exception:
                    entry["auc"] = None

            entry["y_pred"] = y_pred.tolist()
            results[name] = entry
        except Exception as e:
            results[name] = {"error": str(e)}

    return results


def get_best_model(eval_results, problem_type):
    primary = "r2" if problem_type == "regression" else "f1"
    best_name = None
    best_val = -999
    for name, metrics in eval_results.items():
        if "error" in metrics:
            continue
        val = metrics.get(primary, -999)
        if val is not None and val > best_val:
            best_val = val
            best_name = name
    return best_name


# ---- FEATURE IMPORTANCE + SHAP ----

def get_feature_importance(model, X_train, feature_names, problem_type):
    import shap
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    importance_dict = {}
    shap_plot_b64 = None

    try:
        if hasattr(model, "feature_importances_"):
            imp = model.feature_importances_
            importance_dict = {fn: float(v) for fn, v in zip(feature_names, imp)}
        elif hasattr(model, "coef_"):
            coef = model.coef_
            if hasattr(coef, "ndim") and coef.ndim > 1:
                coef = np.abs(coef).mean(axis=0)
            imp = np.abs(coef)
            importance_dict = {fn: float(v) for fn, v in zip(feature_names, imp)}
    except Exception as e:
        print(f"[predictor] Built-in importance error: {e}")

    sorted_imp = sorted(importance_dict.items(), key=lambda x: x[1], reverse=True)[:15]

    shap_values_list = None
    try:
        sample_size = min(200, X_train.shape[0])
        X_sample = X_train[:sample_size]

        try:
            explainer = shap.TreeExplainer(model)
            sv = explainer.shap_values(X_sample)
        except Exception:
            bg = shap.sample(X_sample, min(50, X_sample.shape[0]))
            explainer = shap.KernelExplainer(model.predict, bg)
            sv = explainer.shap_values(bg)

        if isinstance(sv, list):
            sv_arr = np.abs(np.array(sv)).mean(axis=0)
        else:
            sv_arr = sv

        shap_mean = np.abs(sv_arr).mean(axis=0)
        shap_dict = {fn: float(v) for fn, v in zip(feature_names, shap_mean[:len(feature_names)])}
        sorted_shap = sorted(shap_dict.items(), key=lambda x: x[1], reverse=True)[:15]

        fig, ax = plt.subplots(figsize=(8, 5))
        names_plot = [s[0] for s in sorted_shap[:10]][::-1]
        vals_plot = [s[1] for s in sorted_shap[:10]][::-1]
        colors = ["#6366f1"] * len(vals_plot)
        ax.barh(names_plot, vals_plot, color=colors)
        ax.set_xlabel("Mean |SHAP Value|", fontsize=10)
        ax.set_title("Feature Importance (SHAP)", fontsize=12, fontweight="bold")
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        fig.tight_layout()

        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=120, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        shap_plot_b64 = base64.b64encode(buf.read()).decode("utf-8")
        shap_values_list = sorted_shap

    except Exception as e:
        print(f"[predictor] SHAP error: {e}")

    return {
        "builtin_importance": sorted_imp,
        "shap_importance": shap_values_list,
        "shap_plot_base64": shap_plot_b64,
    }


# ---- WHAT-IF SIMULATION ----

def whatif_predict(model, preprocessor_meta, base_row, changes, problem_type):
    feature_names = preprocessor_meta["feature_names"]
    scaler = preprocessor_meta["scaler"]
    imputer = preprocessor_meta["imputer"]
    label_encoders = preprocessor_meta["label_encoders"]
    le_target = preprocessor_meta.get("le_target")
    cat_cols = preprocessor_meta["cat_cols"]

    modified_row = {**base_row, **changes}
    row_arr = []
    for fn in feature_names:
        val = modified_row.get(fn, 0)
        if fn in cat_cols and fn in label_encoders:
            le = label_encoders[fn]
            try:
                val = le.transform([str(val)])[0]
            except ValueError:
                val = 0
        else:
            try:
                val = float(val)
            except (TypeError, ValueError):
                val = 0.0
        row_arr.append(val)

    X_row = np.array(row_arr).reshape(1, -1)
    X_imputed = imputer.transform(X_row)
    X_scaled = scaler.transform(X_imputed)

    y_pred_raw = model.predict(X_scaled)
    y_pred = float(y_pred_raw[0])

    result = {"raw_prediction": y_pred}

    if problem_type == "classification" and le_target is not None:
        try:
            label = le_target.inverse_transform([int(round(y_pred))])[0]
            result["prediction_label"] = str(label)
        except Exception:
            result["prediction_label"] = str(y_pred)
        try:
            proba = model.predict_proba(X_scaled)[0]
            result["probabilities"] = {
                str(le_target.classes_[i]): round(float(p), 4)
                for i, p in enumerate(proba)
            }
        except Exception:
            pass
    else:
        result["prediction_label"] = str(round(y_pred, 4))

    return result


# ---- RECOMMENDATIONS ----

INDUSTRY_RECOMMENDATION_RULES = {
    "education": {
        "high": [
            "Identify students below the 25th percentile on the most important features and provide targeted academic support.",
            "Increase classroom engagement for features with high negative SHAP impact.",
        ],
        "medium": [
            "Introduce peer-mentoring programs to bridge performance gaps across cohorts.",
            "Review curriculum pacing based on attendance trends.",
        ],
        "low": [
            "Monitor mid-tier students to prevent performance slippage.",
            "Leverage positive-impact features in teacher training programs.",
        ],
    },
    "healthcare": {
        "high": [
            "Flag patients in the top-risk quartile for immediate clinical review.",
            "Implement early intervention protocols for the highest-impact clinical features.",
        ],
        "medium": [
            "Schedule regular follow-ups for moderate-risk patient segments.",
            "Improve data collection for poorly-represented features to reduce model uncertainty.",
        ],
        "low": [
            "Embed predictive risk scores into routine clinical workflows.",
            "Conduct periodic model recalibration as new patient data accrues.",
        ],
    },
    "automobile": {
        "high": [
            "Adjust pricing strategy for models/segments predicted to underperform in the next period.",
            "Increase inventory of top-predicted sellers ahead of demand spikes.",
        ],
        "medium": [
            "Align marketing spend with features that most positively influence sales predictions.",
            "Review fuel-price sensitivity to pre-empt demand shifts.",
        ],
        "low": [
            "Use predicted volumes to negotiate better supplier terms.",
            "Monitor seasonal feature patterns for proactive fleet planning.",
        ],
    },
    "finance": {
        "high": [
            "Flag high-default-risk accounts for credit review or enhanced monitoring.",
            "Hedge against top macro-economic features driving the largest prediction shifts.",
        ],
        "medium": [
            "Stress-test portfolios by running What-If scenarios on adverse macro conditions.",
            "Rebalance asset allocation in segments with negative feature contribution.",
        ],
        "low": [
            "Automate periodic re-training as new market data becomes available.",
            "Integrate predictions into monthly financial planning cycles.",
        ],
    },
    "generic": {
        "high": [
            "Focus immediate attention on the top 3 high-importance features  -  they drive the most predictive power.",
            "Investigate records where the model prediction diverges greatly from the actual outcome.",
        ],
        "medium": [
            "Collect more data on medium-importance features to improve model accuracy.",
            "Run What-If scenarios to quantify the business impact of changing key features.",
        ],
        "low": [
            "Schedule model re-training as new data is collected.",
            "Share prediction insights with domain stakeholders for validation.",
        ],
    },
}


def generate_recommendations(feature_importance, problem_type, industry, eval_metrics, best_model_name):
    rules = INDUSTRY_RECOMMENDATION_RULES.get(industry, INDUSTRY_RECOMMENDATION_RULES["generic"])
    recs = []

    if feature_importance:
        top3 = feature_importance[:3]
        for i, (feat, val) in enumerate(top3):
            priority = "high" if i == 0 else "medium"
            recs.append({
                "priority": priority,
                "title": f"Key Driver: {feat}",
                "description": (
                    f"'{feat}' is the {'#1 most' if i == 0 else 'a highly'} influential factor "
                    f"(importance score: {val:.4f}). Monitor and optimize this feature to directly "
                    f"improve {problem_type} outcomes."
                ),
                "category": "Feature Insight",
            })

    best_metrics = eval_metrics.get(best_model_name, {})
    if problem_type == "regression":
        r2 = best_metrics.get("r2")
        rmse = best_metrics.get("rmse")
        if r2 is not None:
            if r2 < 0.6:
                recs.append({
                    "priority": "high",
                    "title": "Model Accuracy Alert",
                    "description": (
                        f"The best model ({best_model_name}) achieves R² = {r2:.3f}. "
                        f"Consider collecting additional features or reviewing data quality."
                    ),
                    "category": "Model Health",
                })
            elif r2 > 0.85:
                rmse_str = f"{rmse:.3f}" if rmse is not None else "N/A"
                recs.append({
                    "priority": "low",
                    "title": "Strong Predictive Accuracy",
                    "description": (
                        f"{best_model_name} achieves R² = {r2:.3f} (RMSE: {rmse_str}). "
                        f"Predictions are reliable - deploy this model for operational forecasting."
                    ),
                    "category": "Model Health",
                })
    else:
        f1 = best_metrics.get("f1")
        acc = best_metrics.get("accuracy")
        acc_str = f"{acc:.3f}" if acc is not None else "N/A"
        if f1 is not None and f1 < 0.65:
            recs.append({
                "priority": "high",
                "title": "Classification Performance Alert",
                "description": (
                    f"{best_model_name} achieves F1 = {f1:.3f} (Accuracy: {acc_str}). "
                    f"Consider class balancing, feature engineering, or hyper-parameter tuning."
                ),
                "category": "Model Health",
            })

    for priority in ["high", "medium", "low"]:
        for desc in rules[priority]:
            recs.append({
                "priority": priority,
                "title": f"{priority.capitalize()} Priority Action",
                "description": desc,
                "category": industry.capitalize(),
            })

    return recs


# ---- FULL PIPELINE ----

def run_full_pipeline(filepath, target_col, feature_cols, industry_override=None):
    df = _load_df(filepath)
    industry = industry_override if industry_override else detect_industry(df)
    problem_type = detect_problem_type(df, target_col)

    X_train, X_test, y_train, y_test, preprocessor_meta, feature_names = preprocess(
        df, target_col, feature_cols, problem_type
    )

    models_dict = train_models(X_train, y_train, problem_type)
    eval_results = evaluate_models(models_dict, X_test, y_test, problem_type)
    best_name = get_best_model(eval_results, problem_type)

    best_model = models_dict[best_name]["model"]
    fi = get_feature_importance(best_model, X_train, feature_names, problem_type)

    preds = {
        "predictions": eval_results[best_name].get("y_pred", []),
    }
    if problem_type == "classification" and preprocessor_meta.get("le_target"):
        le = preprocessor_meta["le_target"]
        raw_preds = eval_results[best_name].get("y_pred", [])
        preds["prediction_labels"] = [str(le.inverse_transform([int(round(p))])[0]) for p in raw_preds]
        preds["class_names"] = list(le.classes_)

    recs = generate_recommendations(
        fi["builtin_importance"], problem_type, industry, eval_results, best_name
    )

    models_serialized = {}
    for name, info in models_dict.items():
        models_serialized[name] = {
            "model_bytes": base64.b64encode(pickle.dumps(info["model"])).decode("utf-8"),
            "cv_mean": info["cv_mean"],
            "cv_std": info["cv_std"],
        }

    preprocessor_bytes = base64.b64encode(pickle.dumps(preprocessor_meta)).decode("utf-8")

    y_test_list = y_test.tolist() if hasattr(y_test, "tolist") else list(y_test)
    raw_preds = eval_results[best_name].get("y_pred", [])
    actual_vs_pred = [
        {"index": i, "actual": float(a), "predicted": float(p)}
        for i, (a, p) in enumerate(zip(y_test_list, raw_preds))
    ][:200]

    # Get baseline row (first test row) for What-If
    baseline_dict = {}
    for j, fn in enumerate(feature_names):
        try:
            baseline_dict[fn] = float(X_test[0][j])
        except Exception:
            baseline_dict[fn] = 0.0

    return {
        "industry": industry,
        "problem_type": problem_type,
        "target_col": target_col,
        "feature_cols": feature_names,
        "dataset_shape": list(df.shape),
        "eval_results": {
            name: {k: v for k, v in m.items() if k != "y_pred"}
            for name, m in eval_results.items()
        },
        "best_model": best_name,
        "feature_importance": fi["builtin_importance"],
        "shap_importance": fi["shap_importance"],
        "shap_plot_base64": fi["shap_plot_base64"],
        "actual_vs_predicted": actual_vs_pred,
        "class_names": preprocessor_meta.get("class_names"),
        "predictions": preds,
        "recommendations": recs,
        "baseline_row": baseline_dict,
        "_models_serialized": models_serialized,
        "_preprocessor_bytes": preprocessor_bytes,
        "_best_model_name": best_name,
    }


def load_model_from_bytes(model_bytes_b64):
    return pickle.loads(base64.b64decode(model_bytes_b64))


def load_preprocessor_from_bytes(preprocessor_bytes_b64):
    return pickle.loads(base64.b64decode(preprocessor_bytes_b64))


# ---- DATASET ANALYSIS ----

def analyze_dataset(filepath, target_col=None):
    df = _load_df(filepath)
    industry = detect_industry(df)

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()

    missing_info = {
        col: {
            "count": int(df[col].isna().sum()),
            "pct": round(df[col].isna().mean() * 100, 2),
        }
        for col in df.columns
    }

    target_suggestions = []
    for col in df.columns:
        if df[col].dtype == object:
            card = df[col].nunique()
            if 2 <= card <= 20:
                target_suggestions.append({"col": col, "reason": f"Categorical ({card} classes) - good for classification"})
        else:
            num = pd.to_numeric(df[col], errors="coerce")
            if num.notna().mean() > 0.5:
                target_suggestions.append({"col": col, "reason": "Numeric - suitable for regression or classification"})

    problem_type_guess = None
    if target_col and target_col in df.columns:
        problem_type_guess = detect_problem_type(df, target_col)

    desc = {}
    for col in numeric_cols[:20]:
        s = pd.to_numeric(df[col], errors="coerce").dropna()
        if len(s):
            desc[col] = {
                "mean": round(float(s.mean()), 4),
                "std": round(float(s.std()), 4),
                "min": round(float(s.min()), 4),
                "max": round(float(s.max()), 4),
                "median": round(float(s.median()), 4),
            }

    return {
        "shape": list(df.shape),
        "columns": list(df.columns),
        "numeric_cols": numeric_cols,
        "categorical_cols": categorical_cols,
        "missing_info": missing_info,
        "industry": industry,
        "problem_type_guess": problem_type_guess,
        "target_suggestions": target_suggestions[:10],
        "numeric_stats": desc,
    }
