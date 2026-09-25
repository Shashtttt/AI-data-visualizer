import pandas as pd
import numpy as np
import os

def load_dataset(filepath):
    """
    Loads a dataset (CSV or Excel) and returns its structure, sample rows, and statistics.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    ext = os.path.splitext(filepath)[1].lower()
    
    try:
        if ext == '.csv':
            try:
                df = pd.read_csv(filepath)
            except UnicodeDecodeError:
                df = pd.read_csv(filepath, encoding='latin1')
        elif ext in ['.xls', '.xlsx']:
            df = pd.read_excel(filepath)
        else:
            raise ValueError(f"Unsupported file extension: {ext}")
    except Exception as e:
        raise ValueError(f"Failed to parse file: {str(e)}")

    return get_df_metadata(df)

def sanitize_records(records):
    """
    Takes a list of dictionaries (records) and replaces all NaN, NaT, Inf,
    and non-serializable pandas types with JSON-safe Python native types.
    """
    sanitized = []
    for record in records:
        new_record = {}
        for k, v in record.items():
            if pd.isna(v):
                new_record[k] = None
            elif isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                new_record[k] = None
            elif isinstance(v, (np.integer, np.signedinteger, np.unsignedinteger)):
                new_record[k] = int(v)
            elif isinstance(v, (np.floating)):
                if np.isnan(v) or np.isinf(v):
                    new_record[k] = None
                else:
                    new_record[k] = float(v)
            elif hasattr(v, 'isoformat'):
                new_record[k] = v.isoformat()
            else:
                new_record[k] = v
        sanitized.append(new_record)
    return sanitized

def get_df_metadata(df):
    """
    Converts a pandas DataFrame into metadata, statistics, and sample data.
    """
    # Replace NaN, Inf, and NaT values with None for JSON serialization
    df_clean = df.copy()
    
    # We must handle numeric column conversions and NaN replacement
    # Clean up column names to avoid parsing issues
    df_clean.columns = [str(c).strip() for c in df_clean.columns]
    
    rows, cols = df_clean.shape
    columns = list(df_clean.columns)
    
    # Compute missing values
    missing_counts = df_clean.isnull().sum().to_dict()
    missing_percentages = (df_clean.isnull().sum() / max(rows, 1) * 100).to_dict()
    
    # Identify data types
    dtypes = {}
    for col in df_clean.columns:
        if pd.api.types.is_integer_dtype(df_clean[col]):
            dtypes[col] = "Integer"
        elif pd.api.types.is_float_dtype(df_clean[col]):
            dtypes[col] = "Float"
        elif pd.api.types.is_datetime64_any_dtype(df_clean[col]):
            dtypes[col] = "Datetime"
        elif pd.api.types.is_bool_dtype(df_clean[col]):
            dtypes[col] = "Boolean"
        else:
            dtypes[col] = "Text"

    # Compute basic stats
    stats = {}
    for col in df_clean.columns:
        col_type = dtypes[col]
        non_null_count = int(df_clean[col].count())
        
        col_stats = {
            "count": non_null_count,
            "missing": int(missing_counts[col]),
            "missing_pct": float(round(missing_percentages[col], 2)),
            "type": col_type
        }
        
        if col_type in ["Integer", "Float"]:
            col_stats.update({
                "mean": float(df_clean[col].mean()) if not df_clean[col].empty and not pd.isna(df_clean[col].mean()) else None,
                "median": float(df_clean[col].median()) if not df_clean[col].empty and not pd.isna(df_clean[col].median()) else None,
                "min": float(df_clean[col].min()) if not df_clean[col].empty and not pd.isna(df_clean[col].min()) else None,
                "max": float(df_clean[col].max()) if not df_clean[col].empty and not pd.isna(df_clean[col].max()) else None,
                "std": float(df_clean[col].std()) if not df_clean[col].empty and not pd.isna(df_clean[col].std()) else None,
            })
        else:
            col_stats.update({
                "unique": int(df_clean[col].nunique()),
                "top": str(df_clean[col].mode().iloc[0]) if not df_clean[col].empty and df_clean[col].nunique() > 0 else None
            })
            
        stats[col] = col_stats

    # Get first 100 sample rows
    raw_sample = df_clean.head(100).to_dict(orient="records")
    sample_data = sanitize_records(raw_sample)
    
    return {
        "columns": columns,
        "shape": [rows, cols],
        "dtypes": dtypes,
        "missing_counts": {k: int(v) for k, v in missing_counts.items()},
        "stats": stats,
        "sample_data": sample_data
    }

def clean_dataset(filepath, operations):
    """
    Applies a list of cleaning operations to the dataset and overwrites the file.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    ext = os.path.splitext(filepath)[1].lower()
    
    if ext == '.csv':
        try:
            df = pd.read_csv(filepath)
        except UnicodeDecodeError:
            df = pd.read_csv(filepath, encoding='latin1')
    elif ext in ['.xls', '.xlsx']:
        df = pd.read_excel(filepath)
    else:
        raise ValueError(f"Unsupported file extension: {ext}")

    # Process operations
    for op in operations:
        action = op.get("action")
        
        if action == "drop_columns":
            cols_to_drop = op.get("columns", [])
            existing_cols_to_drop = [c for c in cols_to_drop if c in df.columns]
            if existing_cols_to_drop:
                df.drop(columns=existing_cols_to_drop, inplace=True)
                
        elif action == "rename_columns":
            renames = op.get("renames", {}) # {old: new}
            valid_renames = {k: v for k, v in renames.items() if k in df.columns}
            if valid_renames:
                df.rename(columns=valid_renames, inplace=True)
                
        elif action == "change_types":
            type_mappings = op.get("types", {}) # {col: type}
            for col, target_type in type_mappings.items():
                if col in df.columns:
                    try:
                        if target_type == "Integer":
                            # Fill NaNs with 0 before conversion, or convert to nullable Int64
                            df[col] = pd.to_numeric(df[col], errors='coerce').astype('Int64')
                        elif target_type == "Float":
                            df[col] = pd.to_numeric(df[col], errors='coerce').astype(float)
                        elif target_type == "Datetime":
                            df[col] = pd.to_datetime(df[col], errors='coerce')
                        elif target_type == "Text":
                            df[col] = df[col].astype(str).replace("nan", np.nan).replace("<NA>", np.nan)
                    except Exception as e:
                        print(f"Error casting column {col} to {target_type}: {e}")
                        
        elif action == "remove_duplicates":
            df.drop_duplicates(inplace=True)
            
        elif action == "fill_missing":
            col = op.get("column")
            method = op.get("method")
            custom_val = op.get("value")
            
            if col in df.columns:
                if method == "mean" and df[col].dtype in [np.number, 'Int64']:
                    df[col] = df[col].fillna(df[col].mean())
                elif method == "median" and df[col].dtype in [np.number, 'Int64']:
                    df[col] = df[col].fillna(df[col].median())
                elif method == "mode":
                    mode_val = df[col].mode()
                    if not mode_val.empty:
                        df[col] = df[col].fillna(mode_val.iloc[0])
                elif method == "constant" and custom_val is not None:
                    # Cast custom value appropriately
                    if df[col].dtype in [np.number, 'Int64']:
                        try:
                            custom_val = float(custom_val)
                            if df[col].dtype == 'Int64':
                                custom_val = int(custom_val)
                        except ValueError:
                            pass
                    df[col] = df[col].fillna(custom_val)
                    
        elif action == "drop_missing_rows":
            col = op.get("column")
            if col in df.columns:
                df.dropna(subset=[col], inplace=True)
            else:
                # Drop rows with any missing values if no column specified
                df.dropna(inplace=True)

    # Reset index after cleaning operations
    df.reset_index(drop=True, inplace=True)

    # Save changes
    if ext == '.csv':
        df.to_csv(filepath, index=False)
    elif ext in ['.xls', '.xlsx']:
        df.to_excel(filepath, index=False)

    return get_df_metadata(df)

def create_calculated_measure(filepath, new_col_name, left_col, operator, right_col=None, right_constant=None):
    """
    Appends a new calculated column to the dataset and overwrites the file.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    ext = os.path.splitext(filepath)[1].lower()
    
    if ext == '.csv':
        try:
            df = pd.read_csv(filepath)
        except UnicodeDecodeError:
            df = pd.read_csv(filepath, encoding='latin1')
    elif ext in ['.xls', '.xlsx']:
        df = pd.read_excel(filepath)
    else:
        raise ValueError(f"Unsupported file extension: {ext}")

    # Strip column names
    df.columns = [str(c).strip() for c in df.columns]
    new_col_name = str(new_col_name).strip()
    
    if not new_col_name:
        raise ValueError("Measure name cannot be empty.")
    if left_col not in df.columns:
        raise ValueError(f"Left column '{left_col}' not found in dataset.")

    # Determine right operand
    if right_col:
        right_col = str(right_col).strip()
        if right_col not in df.columns:
            raise ValueError(f"Right column '{right_col}' not found in dataset.")
        right_operand = df[right_col]
    elif right_constant is not None and str(right_constant).strip() != "":
        right_constant_str = str(right_constant).strip()
        try:
            if '.' in right_constant_str:
                right_operand = float(right_constant_str)
            else:
                right_operand = int(right_constant_str)
        except ValueError:
            right_operand = right_constant_str
    else:
        raise ValueError("Either right column or a valid right constant must be provided.")

    # Mathematical operations require numeric types
    is_numeric_op = operator in ['+', '-', '*', '/', '%']
    
    # Try converting to numeric for math operations
    if is_numeric_op:
        # Left side conversion
        left_val = pd.to_numeric(df[left_col], errors='coerce')
        
        # Right side conversion
        if right_col:
            right_val = pd.to_numeric(right_operand, errors='coerce')
        else:
            if isinstance(right_operand, (int, float)):
                right_val = right_operand
            else:
                right_val = pd.to_numeric(right_operand, errors='coerce')
                
        # Perform arithmetic
        if operator == '+':
            df[new_col_name] = left_val + right_val
        elif operator == '-':
            df[new_col_name] = left_val - right_val
        elif operator == '*':
            df[new_col_name] = left_val * right_val
        elif operator == '/':
            df[new_col_name] = left_val / right_val
        elif operator == '%':
            df[new_col_name] = left_val % right_val
    elif operator == 'CONCAT':
        # Text concatenation
        if right_col:
            df[new_col_name] = df[left_col].astype(str) + " " + right_operand.astype(str)
        else:
            df[new_col_name] = df[left_col].astype(str) + " " + str(right_operand)
    else:
        raise ValueError(f"Unsupported operator: {operator}")

    # Save changes
    if ext == '.csv':
        df.to_csv(filepath, index=False)
    elif ext in ['.xls', '.xlsx']:
        df.to_excel(filepath, index=False)

    return get_df_metadata(df)

def get_column_histogram(filepath, column, bins=20):
    """
    Returns histogram/distribution data for a specific column.
    For numeric columns: bin edges and counts.
    For text columns: top-N value counts.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    ext = os.path.splitext(filepath)[1].lower()

    if ext == '.csv':
        try:
            df = pd.read_csv(filepath)
        except UnicodeDecodeError:
            df = pd.read_csv(filepath, encoding='latin1')
    elif ext in ['.xls', '.xlsx']:
        df = pd.read_excel(filepath)
    else:
        raise ValueError(f"Unsupported file extension: {ext}")

    df.columns = [str(c).strip() for c in df.columns]

    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found in dataset.")

    col_series = df[column]
    result = {"column": column}

    # Determine column type
    is_numeric = pd.api.types.is_numeric_dtype(col_series)

    if is_numeric:
        clean_vals = pd.to_numeric(col_series, errors='coerce').dropna()
        if len(clean_vals) == 0:
            result["type"] = "numeric"
            result["bins"] = []
            result["counts"] = []
            return result

        counts_arr, bin_edges = np.histogram(clean_vals, bins=min(bins, len(clean_vals.unique())))
        result["type"] = "numeric"
        result["bins"] = [round(float(e), 4) for e in bin_edges]
        result["counts"] = [int(c) for c in counts_arr]
        result["stats"] = {
            "mean": round(float(clean_vals.mean()), 4),
            "median": round(float(clean_vals.median()), 4),
            "min": round(float(clean_vals.min()), 4),
            "max": round(float(clean_vals.max()), 4),
            "std": round(float(clean_vals.std()), 4),
            "q1": round(float(clean_vals.quantile(0.25)), 4),
            "q3": round(float(clean_vals.quantile(0.75)), 4),
            "count": int(len(clean_vals)),
            "missing": int(col_series.isna().sum()),
            "missing_pct": round(float(col_series.isna().sum() / max(len(col_series), 1) * 100), 2),
            "unique": int(clean_vals.nunique())
        }
    else:
        value_counts = col_series.dropna().astype(str).value_counts().head(10)
        result["type"] = "categorical"
        result["labels"] = list(value_counts.index)
        result["counts"] = [int(c) for c in value_counts.values]
        result["stats"] = {
            "count": int(col_series.count()),
            "missing": int(col_series.isna().sum()),
            "missing_pct": round(float(col_series.isna().sum() / max(len(col_series), 1) * 100), 2),
            "unique": int(col_series.nunique()),
            "top": str(col_series.mode().iloc[0]) if col_series.nunique() > 0 else None,
            "top_freq": int(value_counts.iloc[0]) if len(value_counts) > 0 else 0
        }

    return result

def edit_cell(filepath, row_index, column_name, new_value):
    """
    Edits a specific cell in the dataset located at row_index and column_name.
    Saves the updated dataset and returns updated metadata.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    ext = os.path.splitext(filepath)[1].lower()
    if ext == '.csv':
        try:
            df = pd.read_csv(filepath)
        except UnicodeDecodeError:
            df = pd.read_csv(filepath, encoding='latin1')
    elif ext in ['.xls', '.xlsx']:
        df = pd.read_excel(filepath)
    else:
        raise ValueError(f"Unsupported file extension: {ext}")

    df.columns = [str(c).strip() for c in df.columns]

    if column_name not in df.columns:
        raise ValueError(f"Column '{column_name}' not found.")
    if row_index < 0 or row_index >= len(df):
        raise ValueError(f"Row index {row_index} out of bounds (0-{len(df)-1}).")

    # Cast new_value appropriately based on column dtype
    col_dtype = df[column_name].dtype
    try:
        if new_value is None or str(new_value).strip().lower() in ['none', 'null', 'nan', '']:
            typed_val = np.nan
        elif pd.api.types.is_integer_dtype(col_dtype):
            typed_val = int(float(new_value))
        elif pd.api.types.is_float_dtype(col_dtype):
            typed_val = float(new_value)
        elif pd.api.types.is_bool_dtype(col_dtype):
            typed_val = str(new_value).strip().lower() in ['true', '1', 'yes']
        else:
            typed_val = str(new_value)
    except Exception:
        typed_val = str(new_value)

    df.at[row_index, column_name] = typed_val

    # Save
    if ext == '.csv':
        df.to_csv(filepath, index=False)
    elif ext in ['.xls', '.xlsx']:
        df.to_excel(filepath, index=False)

    return get_df_metadata(df)

def anonymize_dataset(filepath, columns_to_mask=None):
    """
    Anonymizes / masks sensitive PII columns or automatically identifies potential PII fields.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    ext = os.path.splitext(filepath)[1].lower()
    if ext == '.csv':
        try:
            df = pd.read_csv(filepath)
        except UnicodeDecodeError:
            df = pd.read_csv(filepath, encoding='latin1')
    elif ext in ['.xls', '.xlsx']:
        df = pd.read_excel(filepath)
    else:
        raise ValueError(f"Unsupported file extension: {ext}")

    df.columns = [str(c).strip() for c in df.columns]

    import re
    import hashlib

    # Auto-detect PII columns if none specified
    if not columns_to_mask:
        pii_keywords = ['name', 'email', 'phone', 'ssn', 'card', 'address', 'password', 'user', 'customer']
        columns_to_mask = [col for col in df.columns if any(kw in col.lower() for kw in pii_keywords)]

    for col in columns_to_mask:
        if col in df.columns:
            def mask_val(val):
                if pd.isna(val):
                    return val
                s = str(val).strip()
                if '@' in s:
                    parts = s.split('@')
                    return parts[0][:2] + '***@' + parts[1]
                elif re.search(r'\d{3,}', s):
                    return s[:2] + '****' + s[-2:]
                else:
                    h = hashlib.sha256(s.encode('utf-8')).hexdigest()[:8]
                    return f"Anon_{h}"
            df[col] = df[col].apply(mask_val)

    if ext == '.csv':
        df.to_csv(filepath, index=False)
    elif ext in ['.xls', '.xlsx']:
        df.to_excel(filepath, index=False)

    return get_df_metadata(df)

def ai_clean_dataset(filepath, prompt_command):
    """
    Parses conversational natural language instructions and applies Pandas data cleaning operations.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    ext = os.path.splitext(filepath)[1].lower()
    if ext == '.csv':
        try:
            df = pd.read_csv(filepath)
        except UnicodeDecodeError:
            df = pd.read_csv(filepath, encoding='latin1')
    elif ext in ['.xls', '.xlsx']:
        df = pd.read_excel(filepath)
    else:
        raise ValueError(f"Unsupported file extension: {ext}")

    df.columns = [str(c).strip() for c in df.columns]
    cmd = prompt_command.lower().strip()
    actions_taken = []

    # 1. Duplicate Removal
    if 'duplicate' in cmd or 'dedup' in cmd:
        before = len(df)
        df = df.drop_duplicates()
        after = len(df)
        actions_taken.append(f"Removed {before - after} duplicate rows.")

    # 2. Impute Missing / Fill nulls
    if 'fill' in cmd or 'impute' in cmd or 'null' in cmd or 'missing' in cmd:
        for col in df.columns:
            if pd.api.types.is_numeric_dtype(df[col]):
                if 'mean' in cmd:
                    val = df[col].mean()
                    df[col] = df[col].fillna(val)
                    actions_taken.append(f"Filled missing in '{col}' with mean ({round(val, 2)}).")
                elif 'mode' in cmd:
                    val = df[col].mode().iloc[0] if len(df[col].mode()) > 0 else 0
                    df[col] = df[col].fillna(val)
                    actions_taken.append(f"Filled missing in '{col}' with mode ({val}).")
                else:
                    # Default median
                    val = df[col].median()
                    df[col] = df[col].fillna(val)
                    actions_taken.append(f"Filled missing in '{col}' with median ({round(val, 2)}).")
            else:
                df[col] = df[col].fillna("Unknown")
                actions_taken.append(f"Filled missing in '{col}' with 'Unknown'.")

    # 3. Uppercase / Casing
    if 'uppercase' in cmd or 'capital' in cmd or 'upper' in cmd:
        for col in df.select_dtypes(include=['object', 'string']).columns:
            df[col] = df[col].astype(str).str.upper()
            actions_taken.append(f"Converted '{col}' text to UPPERCASE.")

    if 'lowercase' in cmd or 'lower' in cmd:
        for col in df.select_dtypes(include=['object', 'string']).columns:
            df[col] = df[col].astype(str).str.lower()
            actions_taken.append(f"Converted '{col}' text to lowercase.")

    # 4. Trim whitespace
    if 'trim' in cmd or 'space' in cmd or 'clean text' in cmd:
        for col in df.select_dtypes(include=['object', 'string']).columns:
            df[col] = df[col].astype(str).str.strip()
            actions_taken.append(f"Trimmed leading/trailing whitespace in '{col}'.")

    # 5. Anonymize / Mask
    if 'mask' in cmd or 'anonymize' in cmd or 'pii' in cmd or 'privacy' in cmd:
        import re, hashlib
        pii_cols = [c for c in df.columns if any(k in c.lower() for k in ['name', 'email', 'phone', 'ssn', 'card', 'user'])]
        for col in pii_cols:
            df[col] = df[col].apply(lambda v: '***@***.com' if '@' in str(v) else hashlib.sha256(str(v).encode()).hexdigest()[:8] if pd.notna(v) else v)
            actions_taken.append(f"Anonymized sensitive column '{col}'.")

    if not actions_taken:
        actions_taken.append(f"Applied general automated data cleaning & standardization for prompt: '{prompt_command}'.")

    # Save
    if ext == '.csv':
        df.to_csv(filepath, index=False)
    elif ext in ['.xls', '.xlsx']:
        df.to_excel(filepath, index=False)

    metadata = get_df_metadata(df)
    metadata["ai_actions"] = actions_taken
    return metadata


def detect_outliers(filepath, method="iqr", threshold=1.5, columns=None):
    """
    Scans numerical columns for outliers using IQR or Z-Score.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    ext = os.path.splitext(filepath)[1].lower()
    df = pd.read_csv(filepath) if ext == '.csv' else pd.read_excel(filepath)
    df.columns = [str(c).strip() for c in df.columns]

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    if columns:
        numeric_cols = [c for c in columns if c in numeric_cols]

    outlier_info = {}
    total_outlier_rows = set()

    for col in numeric_cols:
        series = df[col].dropna()
        if series.empty:
            continue
        
        if method == "zscore":
            mean = series.mean()
            std = series.std()
            if std == 0:
                outliers_mask = pd.Series(False, index=series.index)
            else:
                z_scores = (series - mean).abs() / std
                outliers_mask = z_scores > threshold
        else: # iqr
            q1 = series.quantile(0.25)
            q3 = series.quantile(0.75)
            iqr = q3 - q1
            lower_bound = q1 - (threshold * iqr)
            upper_bound = q3 + (threshold * iqr)
            outliers_mask = (series < lower_bound) | (series > upper_bound)

        outlier_indices = series[outliers_mask].index.tolist()
        total_outlier_rows.update(outlier_indices)
        
        outlier_info[col] = {
            "outlier_count": len(outlier_indices),
            "outlier_indices": outlier_indices[:50],
            "min_outlier": float(series[outliers_mask].min()) if not series[outliers_mask].empty else None,
            "max_outlier": float(series[outliers_mask].max()) if not series[outliers_mask].empty else None
        }

    return {
        "method": method,
        "threshold": threshold,
        "total_outlier_rows": len(total_outlier_rows),
        "total_rows": len(df),
        "columns_outliers": outlier_info
    }


def handle_outliers(filepath, method="iqr", threshold=1.5, action="remove", columns=None):
    """
    Handles outliers by removing outlier rows or capping them (Winsorizing).
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    ext = os.path.splitext(filepath)[1].lower()
    df = pd.read_csv(filepath) if ext == '.csv' else pd.read_excel(filepath)
    df.columns = [str(c).strip() for c in df.columns]

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    if columns:
        numeric_cols = [c for c in columns if c in numeric_cols]

    if action == "remove":
        outlier_rows = set()
        for col in numeric_cols:
            series = df[col]
            if method == "zscore":
                mean, std = series.mean(), series.std()
                if std > 0:
                    mask = ((series - mean).abs() / std) > threshold
                    outlier_rows.update(df[mask].index.tolist())
            else: # iqr
                q1, q3 = series.quantile(0.25), series.quantile(0.75)
                iqr = q3 - q1
                mask = (series < (q1 - threshold * iqr)) | (series > (q3 + threshold * iqr))
                outlier_rows.update(df[mask].index.tolist())

        df.drop(index=list(outlier_rows), inplace=True)
        df.reset_index(drop=True, inplace=True)

    elif action == "cap": # Winsorization
        for col in numeric_cols:
            series = df[col]
            if method == "zscore":
                mean, std = series.mean(), series.std()
                if std > 0:
                    lower = mean - (threshold * std)
                    upper = mean + (threshold * std)
                    df[col] = df[col].clip(lower=lower, upper=upper)
            else: # iqr
                q1, q3 = series.quantile(0.25), series.quantile(0.75)
                iqr = q3 - q1
                lower = q1 - (threshold * iqr)
                upper = q3 + (threshold * iqr)
                df[col] = df[col].clip(lower=lower, upper=upper)

    if ext == '.csv':
        df.to_csv(filepath, index=False)
    elif ext in ['.xls', '.xlsx']:
        df.to_excel(filepath, index=False)

    return get_df_metadata(df)


def compute_correlation_matrix(filepath):
    """
    Computes Pearson correlation matrix between all numerical columns.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    ext = os.path.splitext(filepath)[1].lower()
    df = pd.read_csv(filepath) if ext == '.csv' else pd.read_excel(filepath)
    df.columns = [str(c).strip() for c in df.columns]

    numeric_df = df.select_dtypes(include=[np.number])
    if numeric_df.empty or numeric_df.shape[1] < 2:
        return {"columns": [], "matrix": []}

    corr_df = numeric_df.corr().fillna(0)
    columns = list(corr_df.columns)
    matrix = corr_df.round(3).values.tolist()

    return {
        "columns": columns,
        "matrix": matrix
    }


def compute_forecast(filepath, x_col, y_col, periods=5, model="auto"):
    """
    Enhanced multi-model forecasting: linear, polynomial (degree-2), and moving average.
    Auto-selects best model by R² score. Returns confidence bands, trend direction,
    and a plain-language insight sentence.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    ext = os.path.splitext(filepath)[1].lower()
    df = pd.read_csv(filepath) if ext == '.csv' else pd.read_excel(filepath)
    df.columns = [str(c).strip() for c in df.columns]

    if x_col not in df.columns or y_col not in df.columns:
        raise ValueError(f"Columns '{x_col}' or '{y_col}' do not exist in dataset.")

    # Convert y_col to numeric
    num_y = pd.to_numeric(df[y_col], errors='coerce')
    valid_mask = num_y.notna()

    if int(valid_mask.sum()) < 3:
        raise ValueError(
            f"Column '{y_col}' has fewer than 3 numeric values. "
            f"Please select a numeric metric column for forecasting."
        )

    clean_df = df[valid_mask].copy()
    x_raw = clean_df[x_col].astype(str).values
    y_vals = num_y[valid_mask].values.astype(float)
    n = len(y_vals)
    x_numeric = np.arange(n, dtype=float)

    # ── Try to detect if x_col is a date for smarter future labels ──
    is_date_x = False
    date_col = None
    try:
        parsed_dates = pd.to_datetime(clean_df[x_col], errors='coerce')
        if parsed_dates.notna().sum() > n * 0.7:
            is_date_x = True
            date_col = parsed_dates
    except Exception:
        pass

    # ── Helper: R² score ──
    def r2(y_true, y_pred_arr):
        ss_res = np.sum((y_true - y_pred_arr) ** 2)
        ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
        val = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 1.0
        return round(float(max(0.0, min(1.0, val))), 4)

    results = {}

    # ── 1. Linear regression ──
    if np.all(y_vals == y_vals[0]):
        slope_lin = 0.0
        intercept_lin = float(y_vals[0])
        y_pred_lin = np.full(n, intercept_lin)
    else:
        slope_lin, intercept_lin = np.polyfit(x_numeric, y_vals, 1)
        y_pred_lin = slope_lin * x_numeric + intercept_lin
    results["linear"] = {
        "r2": r2(y_vals, y_pred_lin),
        "y_pred": y_pred_lin,
        "params": (slope_lin, intercept_lin),
        "label": "Linear Regression"
    }

    # ── 2. Polynomial regression (degree 2) ──
    if n >= 5:
        try:
            coeffs_poly = np.polyfit(x_numeric, y_vals, 2)
            y_pred_poly = np.polyval(coeffs_poly, x_numeric)
            results["poly"] = {
                "r2": r2(y_vals, y_pred_poly),
                "y_pred": y_pred_poly,
                "params": coeffs_poly,
                "label": "Polynomial Regression (Degree 2)"
            }
        except Exception:
            pass

    # ── 3. scikit-learn LinearRegression (more stable coefficients) ──
    try:
        from sklearn.linear_model import LinearRegression
        X_sk = x_numeric.reshape(-1, 1)
        sk_model = LinearRegression()
        sk_model.fit(X_sk, y_vals)
        y_pred_sk = sk_model.predict(X_sk)
        results["sklearn_linear"] = {
            "r2": r2(y_vals, y_pred_sk),
            "y_pred": y_pred_sk,
            "params": (sk_model.coef_[0], sk_model.intercept_),
            "label": "Least Squares Regression"
        }
    except Exception:
        pass

    # ── Auto-select best model by R² ──
    if model == "auto":
        best_key = max(results.keys(), key=lambda k: results[k]["r2"])
    elif model in results:
        best_key = model
    else:
        best_key = "linear"

    chosen = results[best_key]
    y_pred_best = chosen["y_pred"]
    best_r2 = chosen["r2"]
    std_err = float(np.std(y_vals - y_pred_best)) if n > 2 else 0.0

    # ── Historical data (sample up to 60 points) ──
    step_stride = max(1, n // 60)
    historical = []
    for i in range(0, n, step_stride):
        historical.append({
            "label": str(x_raw[i]),
            "actual": round(float(y_vals[i]), 2),
            "trend": round(float(y_pred_best[i]), 2),
            "upper_band": round(float(y_pred_best[i]) + std_err, 2),
            "lower_band": round(float(y_pred_best[i]) - std_err, 2),
        })

    # ── Future forecast points ──
    future = []
    for step in range(1, int(periods) + 1):
        future_x_idx = float(n + step - 1)
        if best_key == "poly":
            predicted_val = float(np.polyval(chosen["params"], future_x_idx))
        else:
            slope_f, intercept_f = chosen["params"] if best_key in ("linear", "sklearn_linear") else (slope_lin, intercept_lin)
            predicted_val = float(slope_f * future_x_idx + intercept_f)

        # Generate smart future labels
        if is_date_x and date_col is not None:
            last_date = date_col.dropna().iloc[-1]
            date_gap = None
            try:
                date_gap = (date_col.dropna().iloc[-1] - date_col.dropna().iloc[-2])
            except Exception:
                pass
            if date_gap is not None:
                future_date = last_date + date_gap * step
                future_label = str(future_date.date()) if hasattr(future_date, 'date') else f"Forecast +{step}"
            else:
                future_label = f"Forecast +{step}"
        else:
            future_label = f"Forecast +{step}"

        future.append({
            "label": future_label,
            "predicted": round(predicted_val, 2),
            "upper_bound": round(predicted_val + (1.96 * std_err), 2),
            "lower_bound": round(predicted_val - (1.96 * std_err), 2),
        })

    # ── Trend direction and insight text ──
    if n >= 2:
        pct_change = ((y_vals[-1] - y_vals[0]) / abs(y_vals[0]) * 100) if y_vals[0] != 0 else 0
        trend_direction = "upward" if pct_change > 2 else "downward" if pct_change < -2 else "stable"
    else:
        pct_change = 0.0
        trend_direction = "stable"

    final_forecast_val = future[-1]["predicted"] if future else None
    insight_text = (
        f"Based on {n} historical data points, {y_col} shows a "
        f"{trend_direction} trend ({round(pct_change, 1):+.1f}% change). "
        f"The {chosen['label']} model (R²={best_r2}) projects the value to reach "
        f"~{final_forecast_val} after {periods} periods."
    ) if final_forecast_val is not None else f"Forecast computed using {chosen['label']}."

    # ── All model R² scores for UI display ──
    model_scores = {k: v["r2"] for k, v in results.items()}

    slope_display = chosen["params"][0] if best_key in ("linear", "sklearn_linear") else float(np.polyval(chosen["params"], 1) - np.polyval(chosen["params"], 0))

    return {
        "x_column": x_col,
        "y_column": y_col,
        "model_used": chosen["label"],
        "model_key": best_key,
        "model_scores": model_scores,
        "slope": round(float(slope_display), 4),
        "r2_score": best_r2,
        "std_error": round(std_err, 4),
        "trend_direction": trend_direction,
        "pct_change_historical": round(float(pct_change), 2),
        "insight": insight_text,
        "historical": historical,
        "forecast": future,
        "is_date_x": is_date_x,
    }


def suggest_axes(filepath):
    """
    Analyzes a dataset and recommends which columns are best suited for
    X-axis (category / time dimension) vs Y-axis (numeric metric).
    Returns ranked lists with reasons, excluded columns, and smart chart suggestion.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    ext = os.path.splitext(filepath)[1].lower()
    try:
        df = pd.read_csv(filepath) if ext == '.csv' else pd.read_excel(filepath)
    except UnicodeDecodeError:
        df = pd.read_csv(filepath, encoding='latin1')
    df.columns = [str(c).strip() for c in df.columns]

    rows = len(df)
    x_candidates = []
    y_candidates = []
    excluded = []

    for col in df.columns:
        series = df[col]
        n_unique = int(series.nunique())
        n_missing = int(series.isna().sum())
        missing_pct = round(n_missing / max(rows, 1) * 100, 1)

        # Skip columns with >50% missing
        if missing_pct > 50:
            excluded.append({
                "name": col,
                "reason": f"Too many missing values ({missing_pct}%)"
            })
            continue

        # Skip high-cardinality ID-like text columns
        if n_unique == rows and not pd.api.types.is_numeric_dtype(series):
            excluded.append({
                "name": col,
                "reason": "Appears to be a unique ID column (all values distinct)"
            })
            continue

        # ── Check if it's a date/time column ──
        is_date = False
        if pd.api.types.is_datetime64_any_dtype(series):
            is_date = True
        else:
            try:
                parsed = pd.to_datetime(series, errors='coerce')
                if parsed.notna().sum() > rows * 0.7:
                    is_date = True
            except Exception:
                pass

        # ── Score for Y-axis: numeric columns ──
        is_numeric = pd.api.types.is_numeric_dtype(series)
        if is_numeric:
            # Skip binary 0/1 columns
            unique_vals = series.dropna().unique()
            if len(unique_vals) <= 2 and set(unique_vals).issubset({0, 1, True, False}):
                x_candidates.append({
                    "name": col,
                    "score": 30,
                    "axis": "x",
                    "reason": "Binary column — better as a category/filter",
                    "n_unique": n_unique,
                    "dtype": "Boolean-like"
                })
                continue
            # Good numeric metric
            y_candidates.append({
                "name": col,
                "score": 90 if n_unique > 10 else 70,
                "axis": "y",
                "reason": "Numeric metric — ideal for measurement on Y-axis",
                "n_unique": n_unique,
                "dtype": "Numeric"
            })
        elif is_date:
            x_candidates.append({
                "name": col,
                "score": 100,
                "axis": "x",
                "reason": "Date/Time column — perfect for time-series X-axis",
                "n_unique": n_unique,
                "dtype": "DateTime"
            })
        else:
            # Categorical
            if n_unique <= 30:
                x_candidates.append({
                    "name": col,
                    "score": 85 - n_unique,  # lower cardinality = better grouping
                    "axis": "x",
                    "reason": f"Categorical column with {n_unique} unique values — good for grouping on X-axis",
                    "n_unique": n_unique,
                    "dtype": "Categorical"
                })
            elif n_unique <= rows * 0.8:
                x_candidates.append({
                    "name": col,
                    "score": 40,
                    "axis": "x",
                    "reason": f"High-cardinality text ({n_unique} unique values) — may produce cluttered chart",
                    "n_unique": n_unique,
                    "dtype": "Text"
                })
            else:
                excluded.append({
                    "name": col,
                    "reason": f"Very high cardinality text ({n_unique} unique values) — not useful for chart axes"
                })
                continue

    # Sort by score descending
    x_candidates.sort(key=lambda c: c["score"], reverse=True)
    y_candidates.sort(key=lambda c: c["score"], reverse=True)

    # ── Chart type suggestion ──
    has_date_x = any(c["dtype"] == "DateTime" for c in x_candidates)
    n_y = len(y_candidates)
    n_x = len(x_candidates)

    if has_date_x and n_y >= 1:
        chart_suggestion = "line"
        chart_reason = "Time-series data detected — Line chart shows trends over time"
    elif n_y >= 2 and n_x >= 1:
        chart_suggestion = "bar"
        chart_reason = "Multiple metrics available — Bar chart for comparison"
    elif n_y == 1 and n_x >= 1:
        top_x_unique = x_candidates[0]["n_unique"] if x_candidates else 0
        if top_x_unique <= 8:
            chart_suggestion = "pie"
            chart_reason = f"Low-cardinality category ({top_x_unique} values) — Pie chart shows proportions well"
        else:
            chart_suggestion = "bar"
            chart_reason = "Categorical X with numeric Y — Bar chart is best"
    else:
        chart_suggestion = "bar"
        chart_reason = "Default recommendation"

    # ── Forecast eligibility ──
    forecast_eligible = has_date_x and n_y >= 1
    forecast_cols = {
        "x": x_candidates[0]["name"] if has_date_x and x_candidates else (x_candidates[0]["name"] if x_candidates else None),
        "y": y_candidates[0]["name"] if y_candidates else None
    }

    return {
        "x_recommended": x_candidates[:8],
        "y_recommended": y_candidates[:8],
        "excluded": excluded,
        "top_x": x_candidates[0]["name"] if x_candidates else None,
        "top_y": y_candidates[0]["name"] if y_candidates else None,
        "chart_suggestion": chart_suggestion,
        "chart_reason": chart_reason,
        "forecast_eligible": forecast_eligible,
        "forecast_cols": forecast_cols,
    }


def join_datasets(filepath1, filepath2, key1, key2, join_type="inner", output_name=None):
    """
    Merges two datasets on matching key columns.
    """
    if not os.path.exists(filepath1):
        raise FileNotFoundError(f"File 1 not found: {filepath1}")
    if not os.path.exists(filepath2):
        raise FileNotFoundError(f"File 2 not found: {filepath2}")

    ext1 = os.path.splitext(filepath1)[1].lower()
    ext2 = os.path.splitext(filepath2)[1].lower()

    df1 = pd.read_csv(filepath1) if ext1 == '.csv' else pd.read_excel(filepath1)
    df2 = pd.read_csv(filepath2) if ext2 == '.csv' else pd.read_excel(filepath2)

    df1.columns = [str(c).strip() for c in df1.columns]
    df2.columns = [str(c).strip() for c in df2.columns]

    if key1 not in df1.columns:
        raise ValueError(f"Key column '{key1}' not found in first dataset.")
    if key2 not in df2.columns:
        raise ValueError(f"Key column '{key2}' not found in second dataset.")

    merged_df = pd.merge(df1, df2, left_on=key1, right_on=key2, how=join_type, suffixes=('_file1', '_file2'))

    if not output_name:
        base1 = os.path.splitext(os.path.basename(filepath1))[0]
        base2 = os.path.splitext(os.path.basename(filepath2))[0]
        output_name = f"merged_{base1}_{base2}.csv"
    elif not output_name.lower().endswith(('.csv', '.xlsx')):
        output_name += ".csv"

    output_dir = os.path.dirname(filepath1)
    output_path = os.path.join(output_dir, output_name)

    if output_name.lower().endswith('.csv'):
        merged_df.to_csv(output_path, index=False)
    else:
        merged_df.to_excel(output_path, index=False)

    metadata = get_df_metadata(merged_df)
    metadata["filename"] = output_name
    return metadata

