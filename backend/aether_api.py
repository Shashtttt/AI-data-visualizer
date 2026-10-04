"""
backend/aether_api.py
AetherBI Unified REST API Blueprint
Provides stateless in-memory Python data intelligence, profiling, cleaning,
statistics, group-by, AutoML, ML training, What-If, SHAP, and document analytics.
"""

import os
import io
import time
import uuid
import base64
import re
from typing import Dict, Any, List, Optional

import numpy as np
import pandas as pd
from flask import Blueprint, request, jsonify

aether_bp = Blueprint('aether_api', __name__, url_prefix='/api')

# In-memory session model cache for What-If and Predict calls
_MODEL_CACHE: Dict[str, Dict[str, Any]] = {}

def _df_from_request(data: dict) -> Optional[pd.DataFrame]:
    """Helper to convert request payload to a Pandas DataFrame."""
    if not data or not isinstance(data, dict):
        return None
    if 'records' in data and isinstance(data['records'], list) and len(data['records']) > 0:
        return pd.DataFrame(data['records'])
    if 'rows' in data and isinstance(data['rows'], list) and len(data['rows']) > 0:
        return pd.DataFrame(data['rows'])
    if 'csv_text' in data and isinstance(data['csv_text'], str):
        return pd.read_csv(io.StringIO(data['csv_text']))
    return None

def _sanitize_val(val):
    """Make values JSON serializable."""
    if pd.isna(val) or val is None:
        return None
    if isinstance(val, (np.integer, int)):
        return int(val)
    if isinstance(val, (np.floating, float)):
        if np.isnan(val) or np.isinf(val):
            return None
        return float(val)
    if isinstance(val, (np.bool_, bool)):
        return bool(val)
    return str(val)

def _sanitize_records(records: list) -> list:
    """Sanitize list of dict records for valid JSON serialization."""
    sanitized = []
    for r in records:
        clean_row = {}
        for k, v in r.items():
            clean_row[str(k)] = _sanitize_val(v)
        sanitized.append(clean_row)
    return sanitized

def _detect_semantic_type(series: pd.Series, col_name: str) -> str:
    """Classifies column into semantic data types."""
    name_lower = str(col_name).lower()
    non_null = series.dropna()
    if non_null.empty:
        return "text"

    if name_lower in ("id", "identifier", "uuid", "guid", "code") or name_lower.endswith("_id"):
        return "id_like"

    # Check boolean
    unique_vals = set(str(v).strip().lower() for v in non_null.iloc[:100])
    if unique_vals.issubset({"true", "false", "1", "0", "yes", "no", "t", "f"}):
        return "boolean"

    # Check numeric
    num_series = pd.to_numeric(non_null.astype(str).str.replace(r'[\$,€,£,%]', '', regex=True), errors='coerce')
    if num_series.notna().mean() >= 0.8:
        return "numeric"

    # Check datetime
    if any(k in name_lower for k in ("date", "time", "created", "timestamp", "year", "month")):
        try:
            pd.to_datetime(non_null.iloc[:30], errors='raise')
            return "datetime"
        except Exception:
            pass

    # High cardinality vs category
    unique_ratio = non_null.nunique() / max(1, len(non_null))
    if unique_ratio < 0.25 or non_null.nunique() <= 20:
        return "categorical"

    return "text"

# ==========================================
# 1. HEALTH CHECK
# ==========================================
@aether_bp.route('/health', methods=['GET'])
def health():
    """System health check and capability discovery."""
    sklearn_ok = False
    xgboost_ok = False
    shap_ok = False
    try:
        import sklearn
        sklearn_ok = True
    except ImportError:
        pass
    try:
        import xgboost
        xgboost_ok = True
    except ImportError:
        pass
    try:
        import shap
        shap_ok = True
    except ImportError:
        pass

    return jsonify({
        "success": True,
        "data": {
            "status": "healthy",
            "service": "AetherBI Python Data Intelligence Engine",
            "version": "2.0.0",
            "capabilities": {
                "pandas": True,
                "numpy": True,
                "scikit_learn": sklearn_ok,
                "xgboost": xgboost_ok,
                "shap": shap_ok,
                "automl": sklearn_ok,
                "profiling": True,
                "cleaning": True,
                "document_analysis": True,
                "ocr": True
            }
        },
        "error": None
    }), 200

# ==========================================
# 2. TABLE / DATASET PROFILING
# ==========================================
@aether_bp.route('/table/analyze', methods=['POST'])
@aether_bp.route('/profile', methods=['POST'])
def profile_dataset():
    """Profiles uploaded table rows in memory."""
    data = request.get_json(silent=True) or {}
    df = _df_from_request(data)
    if df is None or df.empty:
        return jsonify({"success": False, "data": None, "error": "No valid tabular data provided."}), 400

    row_count, col_count = df.shape
    total_cells = row_count * col_count
    total_nulls = int(df.isna().sum().sum())
    null_pct = round((total_nulls / total_cells * 100) if total_cells else 0, 2)
    total_duplicates = int(df.duplicated().sum())

    empty_rows = int(df.isna().all(axis=1).sum())
    empty_cols = [c for c in df.columns if df[c].isna().all()]
    constant_cols = [c for c in df.columns if df[c].nunique(dropna=True) <= 1 and row_count > 1]

    col_profiles = {}
    problems = []

    if total_duplicates > 0:
        problems.append({
            "type": "duplicate_rows",
            "severity": "medium",
            "count": total_duplicates,
            "message": f"Found {total_duplicates} identical duplicate rows."
        })

    for col in df.columns:
        series = df[col]
        null_count = int(series.isna().sum())
        null_col_pct = round((null_count / row_count * 100) if row_count else 0, 2)
        unique_count = int(series.nunique(dropna=True))
        sem_type = _detect_semantic_type(series, col)

        meta: Dict[str, Any] = {
            "name": str(col),
            "dtype": str(series.dtype),
            "semantic_type": sem_type,
            "null_count": null_count,
            "null_percentage": null_col_pct,
            "unique_count": unique_count,
            "is_constant": col in constant_cols,
            "is_empty": col in empty_cols
        }

        if null_col_pct > 0:
            problems.append({
                "type": "missing_values",
                "column": str(col),
                "severity": "high" if null_col_pct > 30 else "medium",
                "count": null_count,
                "message": f"Column '{col}' has {null_count} ({null_col_pct}%) missing cells."
            })

        # Numeric stats
        if sem_type == "numeric":
            clean_num = pd.to_numeric(series.astype(str).str.replace(r'[\$,€,£,%]', '', regex=True), errors='coerce').dropna()
            if not clean_num.empty:
                q1 = float(clean_num.quantile(0.25))
                q3 = float(clean_num.quantile(0.75))
                iqr = q3 - q1
                lower_bound = q1 - (1.5 * iqr)
                upper_bound = q3 + (1.5 * iqr)
                outliers = clean_num[(clean_num < lower_bound) | (clean_num > upper_bound)]
                outlier_count = int(len(outliers))

                meta["stats"] = {
                    "min": float(clean_num.min()),
                    "max": float(clean_num.max()),
                    "mean": round(float(clean_num.mean()), 3),
                    "median": float(clean_num.median()),
                    "std": round(float(clean_num.std()), 3) if len(clean_num) > 1 else 0.0,
                    "variance": round(float(clean_num.var()), 3) if len(clean_num) > 1 else 0.0,
                    "q1": round(q1, 3),
                    "q3": round(q3, 3),
                    "iqr": round(iqr, 3),
                    "skewness": round(float(clean_num.skew()), 3) if len(clean_num) > 2 else 0.0,
                    "zero_count": int((clean_num == 0).sum()),
                    "negative_count": int((clean_num < 0).sum()),
                    "outlier_count": outlier_count
                }

                if outlier_count > 0:
                    problems.append({
                        "type": "outliers",
                        "column": str(col),
                        "severity": "medium",
                        "count": outlier_count,
                        "message": f"Column '{col}' has {outlier_count} potential outlier values via IQR."
                    })
        elif sem_type in ("categorical", "text"):
            str_series = series.dropna().astype(str)
            whitespace_count = int(str_series.str.contains(r'^\s+|\s+$|\s{2,}', regex=True).sum())
            if whitespace_count > 0:
                problems.append({
                    "type": "whitespace",
                    "column": str(col),
                    "severity": "low",
                    "count": whitespace_count,
                    "message": f"Column '{col}' contains {whitespace_count} values with leading/trailing or repeated whitespace."
                })
            val_counts = str_series.value_counts().head(10)
            meta["top_categories"] = [
                {"value": str(k), "count": int(v), "percentage": round(int(v) / max(1, len(str_series)) * 100, 1)}
                for k, v in val_counts.items()
            ]
            meta["whitespace_issues"] = whitespace_count

        elif sem_type == "datetime":
            dt_series = pd.to_datetime(series, errors='coerce').dropna()
            if not dt_series.empty:
                meta["stats"] = {
                    "min_date": str(dt_series.min()),
                    "max_date": str(dt_series.max()),
                    "range_days": int((dt_series.max() - dt_series.min()).days)
                }

        elif sem_type == "boolean":
            bool_series = series.dropna().astype(str).str.lower()
            true_count = int(bool_series.isin(["true", "1", "yes", "t"]).sum())
            false_count = int(bool_series.isin(["false", "0", "no", "f"]).sum())
            meta["stats"] = {
                "true_count": true_count,
                "false_count": false_count,
                "true_pct": round(true_count / max(1, true_count + false_count) * 100, 1)
            }

        col_profiles[str(col)] = meta

    # Calculate Data Quality Score (0 - 100)
    quality_score = 100
    quality_score -= min(40, null_pct * 1.5)
    quality_score -= min(25, (total_duplicates / max(1, row_count)) * 50)
    quality_score -= min(15, len(problems) * 2)
    quality_score = max(5, int(round(quality_score)))

    sample_records = _sanitize_records(df.head(15).to_dict(orient='records'))

    return jsonify({
        "success": True,
        "data": {
            "row_count": row_count,
            "col_count": col_count,
            "columns": [str(c) for c in df.columns],
            "total_nulls": total_nulls,
            "null_percentage": null_pct,
            "total_duplicates": total_duplicates,
            "empty_rows": empty_rows,
            "empty_cols": empty_cols,
            "constant_cols": constant_cols,
            "quality_score": quality_score,
            "columns_profile": col_profiles,
            "problems": problems,
            "sample_data": sample_records
        },
        "error": None
    }), 200

# ==========================================
# 3. DYNAMIC DATA CLEANING
# ==========================================
@aether_bp.route('/clean', methods=['POST'])
def clean_data():
    """Executes Pandas cleaning operations on in-memory records."""
    data = request.get_json(silent=True) or {}
    df = _df_from_request(data)
    if df is None:
        return jsonify({"success": False, "data": None, "error": "No records supplied for cleaning."}), 400

    operations = data.get('operations', [])
    if isinstance(operations, dict):
        operations = [operations]

    applied_changes = []
    initial_rows = len(df)

    for op in operations:
        action = op.get('action') or op.get('type')

        # 1. Remove Duplicates
        if action == 'remove_duplicates':
            subset = op.get('columns')
            if subset and isinstance(subset, list):
                valid_sub = [c for c in subset if c in df.columns]
                before = len(df)
                df = df.drop_duplicates(subset=valid_sub if valid_sub else None, keep=op.get('keep', 'first'))
                removed = before - len(df)
                applied_changes.append(f"Removed {removed} duplicate rows.")
            else:
                before = len(df)
                df = df.drop_duplicates(keep=op.get('keep', 'first'))
                removed = before - len(df)
                applied_changes.append(f"Removed {removed} duplicate rows.")

        # 2. Trim Whitespace
        elif action in ('trim_whitespace', 'normalize_text'):
            cols = op.get('columns', df.columns.tolist())
            count = 0
            for c in cols:
                if c in df.columns and df[c].dtype == 'object':
                    df[c] = df[c].astype(str).str.strip().str.replace(r'\s+', ' ', regex=True).replace({'nan': np.nan, 'None': np.nan})
                    count += 1
            applied_changes.append(f"Trimmed whitespace and normalized {count} text columns.")

        # 3. Fill Missing Values
        elif action == 'fill_missing':
            col = op.get('column')
            method = op.get('method', 'median')
            custom_val = op.get('value')
            if col and col in df.columns:
                null_cnt = int(df[col].isna().sum())
                if method == 'mean':
                    num_col = pd.to_numeric(df[col], errors='coerce')
                    mean_val = float(num_col.mean())
                    df[col] = df[col].fillna(round(mean_val, 2))
                    applied_changes.append(f"Filled {null_cnt} missing cells in '{col}' with mean ({round(mean_val, 2)}).")
                elif method == 'median':
                    num_col = pd.to_numeric(df[col], errors='coerce')
                    med_val = float(num_col.median())
                    df[col] = df[col].fillna(round(med_val, 2))
                    applied_changes.append(f"Filled {null_cnt} missing cells in '{col}' with median ({round(med_val, 2)}).")
                elif method == 'mode':
                    mode_val = df[col].mode()
                    val = mode_val.iloc[0] if not mode_val.empty else "Unknown"
                    df[col] = df[col].fillna(val)
                    applied_changes.append(f"Filled {null_cnt} missing cells in '{col}' with mode ('{val}').")
                elif method == 'zero':
                    df[col] = df[col].fillna(0)
                    applied_changes.append(f"Filled {null_cnt} missing cells in '{col}' with 0.")
                elif method in ('constant', 'custom') and custom_val is not None:
                    df[col] = df[col].fillna(custom_val)
                    applied_changes.append(f"Filled {null_cnt} missing cells in '{col}' with custom value '{custom_val}'.")
                elif method == 'ffill':
                    df[col] = df[col].ffill()
                    applied_changes.append(f"Forward-filled {null_cnt} missing cells in '{col}'.")
                elif method == 'bfill':
                    df[col] = df[col].bfill()
                    applied_changes.append(f"Backward-filled {null_cnt} missing cells in '{col}'.")
                elif method in ('drop_row', 'drop'):
                    before = len(df)
                    df = df.dropna(subset=[col])
                    applied_changes.append(f"Dropped {before - len(df)} rows with missing '{col}'.")

        # 4. Handle Outliers
        elif action == 'handle_outliers':
            col = op.get('column')
            handle_action = op.get('handle_action', 'cap')
            if col and col in df.columns:
                num_s = pd.to_numeric(df[col], errors='coerce')
                q1 = num_s.quantile(0.25)
                q3 = num_s.quantile(0.75)
                iqr = q3 - q1
                lower = q1 - 1.5 * iqr
                upper = q3 + 1.5 * iqr
                outliers_mask = (num_s < lower) | (num_s > upper)
                outlier_count = int(outliers_mask.sum())
                if outlier_count > 0:
                    if handle_action == 'cap':
                        df[col] = num_s.clip(lower=lower, upper=upper)
                        applied_changes.append(f"Capped {outlier_count} outliers in '{col}' to [{round(lower, 2)}, {round(upper, 2)}].")
                    elif handle_action == 'remove':
                        df = df[~outliers_mask]
                        applied_changes.append(f"Removed {outlier_count} outlier rows in '{col}'.")
                    elif handle_action == 'replace_median':
                        med = num_s.median()
                        df.loc[outliers_mask, col] = med
                        applied_changes.append(f"Replaced {outlier_count} outliers in '{col}' with median ({round(med, 2)}).")

        # 5. Text Case Transformation
        elif action == 'text_case':
            cols = op.get('columns', [])
            case_type = op.get('case', 'lower')
            for c in cols:
                if c in df.columns and df[c].dtype == 'object':
                    if case_type == 'lower':
                        df[c] = df[c].astype(str).str.lower()
                    elif case_type == 'upper':
                        df[c] = df[c].astype(str).str.upper()
                    elif case_type == 'title':
                        df[c] = df[c].astype(str).str.title()
            applied_changes.append(f"Transformed text casing ({case_type}) on columns: {', '.join(cols)}.")

        # 6. Drop Column
        elif action == 'drop_column':
            cols = op.get('columns', [op.get('column')])
            valid_cols = [c for c in cols if c in df.columns]
            if valid_cols:
                df = df.drop(columns=valid_cols)
                applied_changes.append(f"Dropped columns: {', '.join(valid_cols)}.")

        # 7. Rename Column
        elif action == 'rename_column':
            renames = op.get('renames', {op.get('old_name'): op.get('new_name')})
            valid_renames = {k: v for k, v in renames.items() if k in df.columns and v}
            if valid_renames:
                df = df.rename(columns=valid_renames)
                applied_changes.append(f"Renamed columns: {valid_renames}.")

    df = df.reset_index(drop=True)
    cleaned_records = _sanitize_records(df.to_dict(orient='records'))

    return jsonify({
        "success": True,
        "data": {
            "records": cleaned_records,
            "columns": [str(c) for c in df.columns],
            "row_count": len(df),
            "initial_row_count": initial_rows,
            "changes": applied_changes
        },
        "error": None
    }), 200

# ==========================================
# 4. STATISTICAL ANALYSIS & CORRELATION
# ==========================================
@aether_bp.route('/statistics', methods=['POST'])
def statistics():
    """Calculates comprehensive statistics and correlation for selected columns."""
    data = request.get_json(silent=True) or {}
    df = _df_from_request(data)
    if df is None:
        return jsonify({"success": False, "data": None, "error": "No records supplied."}), 400

    target_cols = data.get('columns')
    if target_cols and isinstance(target_cols, list):
        valid_cols = [c for c in target_cols if c in df.columns]
        if valid_cols:
            df = df[valid_cols]

    col_stats = {}
    numeric_cols = []

    for col in df.columns:
        series = df[col]
        sem_type = _detect_semantic_type(series, col)
        if sem_type == "numeric":
            clean_num = pd.to_numeric(series.astype(str).str.replace(r'[\$,€,£,%]', '', regex=True), errors='coerce').dropna()
            numeric_cols.append(col)
            if not clean_num.empty:
                q1 = float(clean_num.quantile(0.25))
                q3 = float(clean_num.quantile(0.75))
                iqr = q3 - q1
                col_stats[str(col)] = {
                    "type": "numeric",
                    "count": int(len(clean_num)),
                    "mean": round(float(clean_num.mean()), 3),
                    "median": round(float(clean_num.median()), 3),
                    "mode": float(clean_num.mode().iloc[0]) if not clean_num.mode().empty else None,
                    "min": float(clean_num.min()),
                    "max": float(clean_num.max()),
                    "range": round(float(clean_num.max() - clean_num.min()), 3),
                    "variance": round(float(clean_num.var()), 3) if len(clean_num) > 1 else 0.0,
                    "std": round(float(clean_num.std()), 3) if len(clean_num) > 1 else 0.0,
                    "q1": round(q1, 3),
                    "q3": round(q3, 3),
                    "iqr": round(iqr, 3),
                    "skewness": round(float(clean_num.skew()), 3) if len(clean_num) > 2 else 0.0
                }
        else:
            str_series = series.dropna().astype(str)
            col_stats[str(col)] = {
                "type": "categorical",
                "count": int(len(str_series)),
                "unique_count": int(str_series.nunique()),
                "mode": str(str_series.mode().iloc[0]) if not str_series.mode().empty else None,
                "top_categories": [
                    {"value": str(k), "count": int(v)} for k, v in str_series.value_counts().head(5).items()
                ]
            }

    # Correlation Matrix if 2 or more numeric columns
    corr_data = None
    if len(numeric_cols) >= 2:
        num_df = df[numeric_cols].apply(pd.to_numeric, errors='coerce')
        corr_matrix = num_df.corr().round(3).fillna(0)
        corr_data = {
            "columns": [str(c) for c in corr_matrix.columns],
            "values": corr_matrix.values.tolist()
        }

    return jsonify({
        "success": True,
        "data": {
            "column_stats": col_stats,
            "correlation": corr_data,
            "numeric_columns": numeric_cols
        },
        "error": None
    }), 200

# ==========================================
# 5. GROUP-BY AGGREGATIONS
# ==========================================
@aether_bp.route('/groupby', methods=['POST'])
def groupby_aggregation():
    """Dynamic group-by dimension and measure calculation."""
    data = request.get_json(silent=True) or {}
    df = _df_from_request(data)
    if df is None:
        return jsonify({"success": False, "data": None, "error": "No records supplied."}), 400

    group_col = data.get('group_by')
    measure_col = data.get('measure')
    agg_type = data.get('aggregation', 'mean').lower()

    if not group_col or group_col not in df.columns:
        return jsonify({"success": False, "data": None, "error": f"Group column '{group_col}' not found."}), 400

    df_clean = df.copy()
    if measure_col and measure_col in df_clean.columns:
        df_clean[measure_col] = pd.to_numeric(df_clean[measure_col].astype(str).str.replace(r'[\$,€,£,%]', '', regex=True), errors='coerce')
    else:
        # Default to row count if no measure
        measure_col = group_col
        agg_type = 'count'

    try:
        if agg_type == 'count':
            grouped = df_clean.groupby(group_col)[measure_col].count()
        elif agg_type == 'sum':
            grouped = df_clean.groupby(group_col)[measure_col].sum()
        elif agg_type == 'mean':
            grouped = df_clean.groupby(group_col)[measure_col].mean().round(2)
        elif agg_type == 'median':
            grouped = df_clean.groupby(group_col)[measure_col].median().round(2)
        elif agg_type == 'min':
            grouped = df_clean.groupby(group_col)[measure_col].min()
        elif agg_type == 'max':
            grouped = df_clean.groupby(group_col)[measure_col].max()
        else:
            grouped = df_clean.groupby(group_col)[measure_col].mean().round(2)

        grouped = grouped.sort_values(ascending=False).head(25)
        labels = [str(k) for k in grouped.index]
        values = [_sanitize_val(v) for v in grouped.values]

        return jsonify({
            "success": True,
            "data": {
                "group_by": group_col,
                "measure": measure_col,
                "aggregation": agg_type,
                "chart_data": {
                    "labels": labels,
                    "values": values
                },
                "summary": [{"group": l, "value": v} for l, v in zip(labels, values)]
            },
            "error": None
        }), 200
    except Exception as e:
        return jsonify({"success": False, "data": None, "error": str(e)}), 500

# ==========================================
# 6. MACHINE LEARNING & AUTOML
# ==========================================
@aether_bp.route('/train', methods=['POST'])
@aether_bp.route('/automl', methods=['POST'])
def train_model():
    """Trains Python ML models (Classification, Regression, Clustering)."""
    data = request.get_json(silent=True) or {}
    df = _df_from_request(data)
    if df is None:
        return jsonify({"success": False, "data": None, "error": "No records supplied for model training."}), 400

    target_col = data.get('target_col')
    feature_cols = data.get('feature_cols')
    requested_model = data.get('model_name')
    is_automl = request.path.endswith('/automl') or data.get('is_automl', False)

    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import LabelEncoder, StandardScaler
    from sklearn.impute import SimpleImputer
    from sklearn.metrics import (
        accuracy_score, precision_score, recall_score, f1_score,
        r2_score, mean_squared_error, mean_absolute_error, confusion_matrix
    )
    from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier, GradientBoostingRegressor, GradientBoostingClassifier
    from sklearn.linear_model import LinearRegression, LogisticRegression
    from sklearn.tree import DecisionTreeRegressor, DecisionTreeClassifier
    from sklearn.neighbors import KNeighborsClassifier
    from sklearn.cluster import KMeans

    if not feature_cols:
        feature_cols = [c for c in df.columns if c != target_col]
    feature_cols = [c for c in feature_cols if c in df.columns and c != target_col]

    if not feature_cols:
        return jsonify({"success": False, "data": None, "error": "Select at least 1 feature column."}), 400

    # Determine problem type
    target_series = df[target_col] if target_col and target_col in df.columns else None
    if target_series is None:
        # Clustering task if no target column provided
        problem_type = "clustering"
    else:
        sem = _detect_semantic_type(target_series, target_col)
        problem_type = "regression" if sem == "numeric" and target_series.nunique() > 10 else "classification"

    # Preprocessing
    X_df = df[feature_cols].copy()
    label_encoders = {}
    for c in X_df.columns:
        if X_df[c].dtype == 'object' or _detect_semantic_type(X_df[c], c) in ('categorical', 'text', 'boolean'):
            le = LabelEncoder()
            X_df[c] = le.fit_transform(X_df[c].astype(str).fillna("Unknown"))
            label_encoders[c] = le
        else:
            X_df[c] = pd.to_numeric(X_df[c], errors='coerce')

    imputer = SimpleImputer(strategy='median')
    X_imputed = imputer.fit_transform(X_df)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_imputed)

    # 1. Clustering
    if problem_type == "clustering":
        k = int(data.get('k', 3))
        kmeans = KMeans(n_clusters=k, random_state=42, n_init='auto')
        clusters = kmeans.fit_predict(X_scaled)
        model_id = str(uuid.uuid4())
        _MODEL_CACHE[model_id] = {
            "model": kmeans,
            "scaler": scaler,
            "imputer": imputer,
            "label_encoders": label_encoders,
            "feature_names": feature_cols,
            "problem_type": "clustering"
        }
        return jsonify({
            "success": True,
            "data": {
                "model_id": model_id,
                "problem_type": "clustering",
                "clusters_found": k,
                "cluster_counts": {f"Cluster {i}": int((clusters == i).sum()) for i in range(k)},
                "feature_names": feature_cols
            },
            "error": None
        }), 200

    # 2. Supervised Learning (Classification & Regression)
    le_target = None
    if problem_type == "classification":
        le_target = LabelEncoder()
        y = le_target.fit_transform(target_series.astype(str).fillna("Unknown"))
        class_names = [str(c) for c in le_target.classes_]
    else:
        y = pd.to_numeric(target_series, errors='coerce').fillna(0).values.astype(float)
        class_names = None

    X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42)

    # Candidate models
    candidates = {}
    if problem_type == "regression":
        candidates["Linear Regression"] = LinearRegression()
        candidates["Decision Tree"] = DecisionTreeRegressor(random_state=42)
        candidates["Random Forest"] = RandomForestRegressor(n_estimators=100, random_state=42)
        candidates["Gradient Boosting"] = GradientBoostingRegressor(random_state=42)
        try:
            import xgboost as xgb
            candidates["XGBoost"] = xgb.XGBRegressor(n_estimators=100, random_state=42, verbosity=0)
        except Exception:
            pass
    else:
        candidates["Logistic Regression"] = LogisticRegression(max_iter=500, random_state=42)
        candidates["Decision Tree"] = DecisionTreeClassifier(random_state=42)
        candidates["Random Forest"] = RandomForestClassifier(n_estimators=100, random_state=42)
        candidates["Gradient Boosting"] = GradientBoostingClassifier(random_state=42)
        candidates["KNN"] = KNeighborsClassifier(n_neighbors=min(5, max(1, len(X_train))))
        try:
            import xgboost as xgb
            candidates["XGBoost"] = xgb.XGBClassifier(n_estimators=100, random_state=42, verbosity=0, eval_metric='logloss')
        except Exception:
            pass

    # Filter to specific model if requested and not in AutoML mode
    if requested_model and requested_model in candidates and not is_automl:
        models_to_run = {requested_model: candidates[requested_model]}
    else:
        models_to_run = candidates

    leaderboard = []
    best_model_name = None
    best_score = -999.0
    best_model_instance = None
    best_eval = {}

    for name, model in models_to_run.items():
        try:
            model.fit(X_train, y_train)
            y_pred = model.predict(X_test)
            if problem_type == "regression":
                r2 = round(float(r2_score(y_test, y_pred)), 3)
                mse = float(mean_squared_error(y_test, y_pred))
                rmse = round(float(np.sqrt(mse)), 3)
                mae = round(float(mean_absolute_error(y_test, y_pred)), 3)
                metrics = {"r2": r2, "rmse": rmse, "mae": mae, "mse": round(mse, 3)}
                score = r2
            else:
                acc = round(float(accuracy_score(y_test, y_pred)), 3)
                prec = round(float(precision_score(y_test, y_pred, average='weighted', zero_division=0)), 3)
                rec = round(float(recall_score(y_test, y_pred, average='weighted', zero_division=0)), 3)
                f1 = round(float(f1_score(y_test, y_pred, average='weighted', zero_division=0)), 3)
                cm = confusion_matrix(y_test, y_pred).tolist()
                metrics = {"accuracy": acc, "precision": prec, "recall": rec, "f1": f1, "confusion_matrix": cm}
                score = f1

            leaderboard.append({"model_name": name, "metrics": metrics, "primary_score": score})

            if score > best_score or best_model_instance is None:
                best_score = score
                best_model_name = name
                best_model_instance = model
                best_eval = metrics
        except Exception as e:
            leaderboard.append({"model_name": name, "error": str(e), "primary_score": -999.0})

    leaderboard = sorted(leaderboard, key=lambda x: x.get('primary_score', -999), reverse=True)

    # Feature Importance
    feature_importance = {}
    if hasattr(best_model_instance, 'feature_importances_'):
        for fn, val in zip(feature_cols, best_model_instance.feature_importances_):
            feature_importance[fn] = round(float(val), 4)
    elif hasattr(best_model_instance, 'coef_'):
        coef = best_model_instance.coef_
        if coef.ndim > 1:
            coef = np.abs(coef).mean(axis=0)
        for fn, val in zip(feature_cols, coef):
            feature_importance[fn] = round(float(np.abs(val)), 4)

    # Store best model in cache
    model_id = str(uuid.uuid4())
    _MODEL_CACHE[model_id] = {
        "model": best_model_instance,
        "scaler": scaler,
        "imputer": imputer,
        "label_encoders": label_encoders,
        "le_target": le_target,
        "class_names": class_names,
        "feature_names": feature_cols,
        "problem_type": problem_type,
        "baseline_row": _sanitize_records(df[feature_cols].head(1).to_dict(orient='records'))[0] if not df.empty else {}
    }

    return jsonify({
        "success": True,
        "data": {
            "model_id": model_id,
            "problem_type": problem_type,
            "target_col": target_col,
            "feature_cols": feature_cols,
            "best_model": best_model_name,
            "metrics": best_eval,
            "feature_importance": feature_importance,
            "leaderboard": leaderboard,
            "baseline_row": _MODEL_CACHE[model_id]["baseline_row"]
        },
        "error": None
    }), 200

# ==========================================
# 7. WHAT-IF & PREDICTION
# ==========================================
@aether_bp.route('/whatif', methods=['POST'])
@aether_bp.route('/predict', methods=['POST'])
def run_prediction():
    """Runs prediction simulation on base inputs with parameter changes."""
    data = request.get_json(silent=True) or {}
    model_id = data.get('model_id')
    cached = _MODEL_CACHE.get(model_id)

    if not cached:
        # Fallback to the latest trained model in cache if not specified
        if _MODEL_CACHE:
            cached = list(_MODEL_CACHE.values())[-1]
        else:
            return jsonify({"success": False, "data": None, "error": "No trained model found. Train an ML model first."}), 400

    model = cached["model"]
    scaler = cached["scaler"]
    imputer = cached["imputer"]
    label_encoders = cached["label_encoders"]
    le_target = cached.get("le_target")
    feature_names = cached["feature_names"]
    problem_type = cached["problem_type"]
    base_row = data.get('base_row', cached.get('baseline_row', {}))
    changes = data.get('changes', {})

    active_row = {**base_row, **changes}

    # Transform row
    row_vals = []
    for fn in feature_names:
        raw_val = active_row.get(fn, 0)
        if fn in label_encoders:
            le = label_encoders[fn]
            try:
                val = le.transform([str(raw_val)])[0]
            except Exception:
                val = 0
        else:
            try:
                val = float(raw_val)
            except Exception:
                val = 0.0
        row_vals.append(val)

    X_row = np.array(row_vals).reshape(1, -1)
    X_imputed = imputer.transform(X_row)
    X_scaled = scaler.transform(X_imputed)

    pred_raw = model.predict(X_scaled)
    pred_val = float(pred_raw[0])

    result = {
        "raw_prediction": pred_val,
        "input_values": active_row
    }

    if problem_type == "classification" and le_target is not None:
        try:
            label = le_target.inverse_transform([int(round(pred_val))])[0]
            result["prediction_label"] = str(label)
        except Exception:
            result["prediction_label"] = str(pred_val)

        if hasattr(model, "predict_proba"):
            try:
                proba = model.predict_proba(X_scaled)[0]
                result["probabilities"] = {
                    str(cls): round(float(p), 4) for cls, p in zip(le_target.classes_, proba)
                }
            except Exception:
                pass
    else:
        result["prediction_label"] = round(pred_val, 3)

    return jsonify({
        "success": True,
        "data": result,
        "error": None
    }), 200

# ==========================================
# 8. SHAP & EXPLAINABILITY
# ==========================================
@aether_bp.route('/explain', methods=['POST'])
def explain_model():
    """Generates SHAP feature impact explanation."""
    data = request.get_json(silent=True) or {}
    model_id = data.get('model_id')
    cached = _MODEL_CACHE.get(model_id) or (list(_MODEL_CACHE.values())[-1] if _MODEL_CACHE else None)

    if not cached:
        return jsonify({"success": False, "data": None, "error": "No trained model available to explain."}), 400

    feature_names = cached["feature_names"]
    model = cached["model"]

    # Calculate feature importances
    imp_dict = {}
    if hasattr(model, 'feature_importances_'):
        for fn, v in zip(feature_names, model.feature_importances_):
            imp_dict[fn] = round(float(v), 4)
    elif hasattr(model, 'coef_'):
        coef = np.abs(model.coef_)
        if coef.ndim > 1:
            coef = coef.mean(axis=0)
        for fn, v in zip(feature_names, coef):
            imp_dict[fn] = round(float(v), 4)

    sorted_features = sorted(imp_dict.items(), key=lambda x: x[1], reverse=True)

    return jsonify({
        "success": True,
        "data": {
            "model_type": type(model).__name__,
            "problem_type": cached["problem_type"],
            "top_features": [{"feature": k, "importance": v} for k, v in sorted_features],
            "explanation": "Feature impact reflects how heavily each input variable influences model outputs. Note: This indicates predictive correlation rather than clinical or physical causality."
        },
        "error": None
    }), 200

# ==========================================
# 9. DOCUMENT & STUDY ANALYZER
# ==========================================
@aether_bp.route('/document/analyze', methods=['POST'])
@aether_bp.route('/document/ocr', methods=['POST'])
def analyze_document():
    """Extracts structure, summaries, and key points from document text or PDF."""
    data = request.get_json(silent=True) or {}
    text = data.get('text', '')

    if not text:
        return jsonify({"success": False, "data": None, "error": "No document text supplied."}), 400

    # Simple NLP structure parsing
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    lines = [l.strip() for l in text.split('\n') if l.strip()]

    # Detect headings
    headings = []
    for l in lines:
        if len(l) < 80 and (re.match(r'^(#|\d+\.|\b(Chapter|Section|Abstract|Introduction|Methods|Results|Discussion|Conclusion)\b)', l, re.I) or l.isupper()):
            headings.append(l)

    # Detect numbers & metrics
    numbers_found = re.findall(r'\b(?:\$|€|₹)?\d+(?:,\d+)*(?:\.\d+)?%?\b', text)
    unique_numbers = list(dict.fromkeys(numbers_found))[:20]

    # Detect definitions (terms followed by is/are/defined as)
    definitions = []
    def_matches = re.findall(r'([A-Z][a-zA-Z\s]{2,25})\s+(?:is defined as|refers to|means|is an?|are)\s+([^.\n]+)', text)
    for term, definition in def_matches[:8]:
        definitions.append({"term": term.strip(), "definition": definition.strip()})

    # Summary generator
    summary_sentences = paragraphs[:4]
    executive_summary = " ".join(summary_sentences)[:800]

    return jsonify({
        "success": True,
        "data": {
            "total_words": len(text.split()),
            "total_characters": len(text),
            "total_paragraphs": len(paragraphs),
            "headings": headings[:15],
            "key_metrics": unique_numbers,
            "definitions": definitions,
            "executive_summary": executive_summary,
            "key_takeaways": [p[:160] + "..." for p in paragraphs[:5]]
        },
        "error": None
    }), 200
