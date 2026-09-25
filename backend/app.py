
from flask import Flask, request, jsonify, render_template, session, send_from_directory, redirect
import os
import secrets
import json
import base64
import io
import urllib.request
import urllib.error
from functools import wraps
import pandas as pd
import numpy as np

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db
import cleaner
import firebase_storage_helper as fb
import share_manager
import agent_advisor

# Helper: get current user UID from session
def _current_uid() -> str:
    user = session.get('user', {})
    return str(user.get('id', 'local'))

app = Flask(__name__, 
            static_folder=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'static'),
            template_folder=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'templates'))

# Set session secret key
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "power_bi_visualizer_secret_key_12984712")
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '-1'
    return response

# Ensure dataset directory exists
WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASETS_DIR = os.path.join(WORKSPACE_DIR, 'datasets')
os.makedirs(DATASETS_DIR, exist_ok=True)

# Initialize database
db.init_db()

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            # Auto-assign active session for seamless analytics
            session['user'] = {'id': 1, 'username': 'Shashvat Rai', 'email': 'shashvat@example.com'}
        return f(*args, **kwargs)
    return decorated_function

# Routes
@app.route('/')
def index():
    if 'user' not in session:
        session['user'] = {'id': 1, 'username': 'Shashvat Rai', 'email': 'shashvat@example.com'}
    return render_template('index.html')

# Auth Endpoints
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    
    result = db.register_user(username, email, password)
    if result["success"]:
        return jsonify(result), 200
    else:
        return jsonify(result), 400

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    username_or_email = data.get('username_or_email')
    password = data.get('password')
    
    user = db.validate_user(username_or_email, password)
    if user:
        session['user'] = user
        return jsonify({"success": True, "message": "Login successful.", "user": user}), 200
    else:
        return jsonify({"success": False, "message": "Invalid username/email or password."}), 401

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.pop('user', None)
    return jsonify({"success": True, "message": "Logged out successfully."}), 200

@app.route('/api/auth/me', methods=['GET'])
def me():
    if 'user' not in session:
        session['user'] = {'id': 1, 'username': 'Shashvat Rai', 'email': 'shashvat@example.com'}
    return jsonify({"logged_in": True, "user": session['user']}), 200

# Datasets Endpoints
@app.route('/api/datasets/samples', methods=['GET', 'POST'])
@login_required
def sample_datasets():
    try:
        sample_files = [f for f in os.listdir(DATASETS_DIR) if f.lower().endswith(('.csv', '.xlsx', '.xls'))] if os.path.exists(DATASETS_DIR) else []
        return jsonify({
            "success": True,
            "message": "Sample datasets available.",
            "samples": sample_files
        }), 200
    except Exception as e:
        return jsonify({"error": f"Failed to get sample datasets: {str(e)}"}), 500

@app.route('/api/datasets/list', methods=['GET'])
@login_required
def list_datasets():
    try:
        # Load local datasets first for instant zero-delay response
        files = []
        if os.path.exists(DATASETS_DIR):
            for filename in os.listdir(DATASETS_DIR):
                filepath = os.path.join(DATASETS_DIR, filename)
                if os.path.isfile(filepath) and filename.lower().endswith(('.csv', '.xls', '.xlsx')):
                    size = os.path.getsize(filepath)
                    files.append({
                        "name": filename,
                        "size_kb": round(size / 1024, 2),
                        "modified": os.path.getmtime(filepath)
                    })
            files.sort(key=lambda x: x['modified'], reverse=True)

        if files:
            return jsonify({"success": True, "datasets": files, "source": "local"}), 200

        # Safe fallback to Firebase only if local is empty
        uid = _current_uid()
        try:
            firebase_files = fb.list_user_datasets(uid)
            if firebase_files:
                return jsonify({"success": True, "datasets": firebase_files, "source": "firebase"}), 200
        except Exception:
            pass

        return jsonify({"success": True, "datasets": [], "source": "local"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/datasets/upload', methods=['POST'])
@login_required
def upload_dataset():
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request."}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected."}), 400

    if not file.filename.lower().endswith(('.csv', '.xls', '.xlsx')):
        return jsonify({"error": "Invalid file type. Only CSV and Excel files are allowed."}), 400

    filename = os.path.basename(file.filename)
    filepath = os.path.join(DATASETS_DIR, filename)
    uid = _current_uid()

    try:
        # Always save locally first (Pandas needs a file path)
        file.save(filepath)
        metadata = cleaner.load_dataset(filepath)
        size_kb = round(os.path.getsize(filepath) / 1024, 2)
        new_row_count = metadata["shape"][0]
        new_columns = metadata["columns"]

        # ── Check if this is a re-upload (dataset update detection) ──
        old_meta = fb.get_dataset_metadata(uid, filename)
        diff = fb.compute_dataset_diff(old_meta, new_row_count, new_columns)

        # ── Push to Firebase Storage + Firestore metadata ──
        uploaded_to_firebase = fb.upload_dataset(uid, filename, filepath)
        if uploaded_to_firebase:
            if diff["is_update"]:
                fb.bump_version(uid, filename, size_kb, new_row_count, new_columns)
            else:
                fb.save_dataset_metadata(uid, filename, size_kb, new_row_count, new_columns)
            storage_info = "firebase"
        else:
            storage_info = "local"

        return jsonify({
            "success": True,
            "message": f"File '{filename}' uploaded successfully.",
            "metadata": metadata,
            "filename": filename,
            "storage": storage_info,
            "diff": diff,
        }), 200
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({"error": f"Failed to upload and parse file: {str(e)}"}), 500

@app.route('/api/datasets/info', methods=['GET'])
@login_required
def get_dataset_info():
    filename = request.args.get('file')
    if not filename:
        return jsonify({"error": "Filename parameter 'file' is required."}), 400

    filename = os.path.basename(filename)
    filepath = os.path.join(DATASETS_DIR, filename)
    uid = _current_uid()

    # If not cached locally, try downloading from Firebase
    if not os.path.exists(filepath):
        tmp = fb.download_dataset_to_temp(uid, filename)
        if tmp:
            import shutil
            shutil.copy(tmp, filepath)
            os.remove(tmp)

    if not os.path.exists(filepath):
        return jsonify({"error": f"File '{filename}' does not exist."}), 404

    try:
        metadata = cleaner.load_dataset(filepath)
        return jsonify({"metadata": metadata, "filename": filename}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/datasets/clean', methods=['POST'])
@login_required
def clean_dataset_route():
    data = request.get_json() or {}
    filename = data.get('file')
    operations = data.get('operations', [])

    if not filename:
        return jsonify({"error": "Filename is required."}), 400

    filename = os.path.basename(filename)
    filepath = os.path.join(DATASETS_DIR, filename)
    uid = _current_uid()

    # Download from Firebase if not cached locally
    if not os.path.exists(filepath):
        tmp = fb.download_dataset_to_temp(uid, filename)
        if tmp:
            import shutil
            shutil.copy(tmp, filepath)
            os.remove(tmp)

    if not os.path.exists(filepath):
        return jsonify({"error": f"File '{filename}' does not exist."}), 404

    try:
        updated_metadata = cleaner.clean_dataset(filepath, operations)

        # Re-upload cleaned file to Firebase Storage
        size_kb = round(os.path.getsize(filepath) / 1024, 2)
        if fb.upload_dataset(uid, filename, filepath):
            fb.update_dataset_metadata(uid, filename, size_kb)

        return jsonify({
            "success": True,
            "message": "Dataset cleaned successfully.",
            "metadata": updated_metadata
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/datasets/measure', methods=['POST'])
@login_required
def create_measure_route():
    data = request.get_json() or {}
    filename = data.get('file')
    new_col_name = data.get('new_col_name')
    left_col = data.get('left_col')
    operator = data.get('operator')
    right_col = data.get('right_col')
    right_constant = data.get('right_constant')
    
    if not filename:
        return jsonify({"error": "Filename is required."}), 400
    if not new_col_name:
        return jsonify({"error": "New column name (new_col_name) is required."}), 400
    if not left_col:
        return jsonify({"error": "Left operand column (left_col) is required."}), 400
    if not operator:
        return jsonify({"error": "Operator is required."}), 400

    filepath = os.path.join(DATASETS_DIR, os.path.basename(filename))
    if not os.path.exists(filepath):
        return jsonify({"error": f"File '{filename}' does not exist."}), 404
        
    try:
        updated_metadata = cleaner.create_calculated_measure(
            filepath=filepath,
            new_col_name=new_col_name,
            left_col=left_col,
            operator=operator,
            right_col=right_col or None,
            right_constant=right_constant
        )
        return jsonify({
            "success": True,
            "message": f"Calculated measure '{new_col_name}' created successfully.",
            "metadata": updated_metadata
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/datasets/download', methods=['GET'])
@login_required
def download_dataset():
    filename = request.args.get('file')
    if not filename:
        return jsonify({"error": "Filename parameter 'file' is required."}), 400

    filename = os.path.basename(filename)
    uid = _current_uid()

    # Try Firebase signed URL first
    signed_url = fb.get_signed_download_url(uid, filename)
    if signed_url:
        return redirect(signed_url)

    # Fallback: serve from local disk
    filepath = os.path.join(DATASETS_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({"error": f"File '{filename}' does not exist."}), 404
    return send_from_directory(DATASETS_DIR, filename, as_attachment=True)


@app.route('/api/datasets/suggest-axes', methods=['POST'])
@login_required
def suggest_axes_route():
    """Analyses a dataset and returns smart X/Y axis recommendations"""
    data = request.get_json() or {}
    filename = data.get('file')
    if not filename:
        return jsonify({"error": "Filename is required."}), 400

    filename = os.path.basename(filename)
    filepath = os.path.join(DATASETS_DIR, filename)
    uid = _current_uid()

    if not os.path.exists(filepath):
        tmp = fb.download_dataset_to_temp(uid, filename)
        if tmp:
            import shutil
            shutil.copy(tmp, filepath)
            os.remove(tmp)

    if not os.path.exists(filepath):
        return jsonify({"error": f"File '{filename}' does not exist."}), 404

    try:
        suggestions = cleaner.suggest_axes(filepath)
        df = agent_advisor.load_df(filepath)
        agent_recs = agent_advisor.recommend_chart_axes(df, filename)
        suggestions["domain"] = agent_recs["domain"]
        suggestions["agent_recommendations"] = agent_recs["recommendations"]
        suggestions["best_x"] = agent_recs["best_x"]
        suggestions["best_y"] = agent_recs["best_y"]
        suggestions["best_chart_type"] = agent_recs["best_chart_type"]
        return jsonify({"success": True, "suggestions": suggestions}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/agent/profile', methods=['GET', 'POST'])
@login_required
def get_agent_profile():
    filename = request.args.get('file')
    if not filename and request.is_json:
        filename = (request.get_json() or {}).get('file')
    if not filename:
        return jsonify({"error": "Parameter 'file' is required."}), 400

    filename = os.path.basename(filename)
    filepath = os.path.join(DATASETS_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({"error": f"File '{filename}' does not exist."}), 404

    try:
        df = agent_advisor.load_df(filepath)
        domain_info = agent_advisor.detect_detailed_industry(df, filename)
        chart_recs = agent_advisor.recommend_chart_axes(df, filename)
        past_future_qa = agent_advisor.generate_past_to_future_qa(df, domain_info)
        business_problems = agent_advisor.solve_business_problems(df, domain_info)

        return jsonify({
            "success": True,
            "filename": filename,
            "domain": domain_info,
            "chart_recommendations": chart_recs,
            "past_to_future_qa": past_future_qa,
            "business_problems": business_problems
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/agent/ask', methods=['POST'])
@login_required
def ask_agent_route():
    data = request.get_json() or {}
    filename = data.get('file') or data.get('filename')
    question = data.get('question')
    if not filename or not question:
        return jsonify({"error": "Parameters 'file' and 'question' are required."}), 400

    filename = os.path.basename(filename)
    filepath = os.path.join(DATASETS_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({"error": f"File '{filename}' does not exist."}), 404

    try:
        df = agent_advisor.load_df(filepath)
        res = agent_advisor.answer_agent_question(df, question, filename)
        return jsonify({"success": True, "answer": res["answer"], "topic": res["topic"]}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/datasets/delete', methods=['DELETE'])
@login_required
def delete_dataset():
    filename = request.args.get('file')
    if not filename:
        return jsonify({"error": "Filename parameter 'file' is required."}), 400

    filename = os.path.basename(filename)
    uid = _current_uid()

    # ── Delete from Firebase Storage + Firestore ──
    fb_deleted = fb.delete_dataset_from_storage(uid, filename)
    if fb_deleted:
        fb.delete_dataset_metadata(uid, filename)

    # ── Also remove local cache copy ──
    filepath = os.path.join(DATASETS_DIR, filename)
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({"success": True, "message": f"File '{filename}' deleted successfully."}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to delete local copy: {str(e)}"}), 500

@app.route('/api/datasets/column-stats', methods=['POST'])
@login_required
def column_stats():
    data = request.get_json() or {}
    filename = data.get('file')
    column = data.get('column')
    
    if not filename:
        return jsonify({"error": "Filename is required."}), 400
    if not column:
        return jsonify({"error": "Column name is required."}), 400
        
    filepath = os.path.join(DATASETS_DIR, os.path.basename(filename))
    if not os.path.exists(filepath):
        return jsonify({"error": f"File '{filename}' does not exist."}), 404
        
    try:
        histogram_data = cleaner.get_column_histogram(filepath, column)
        return jsonify({"success": True, "data": histogram_data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/cleaner/edit_cell', methods=['POST'])
@login_required
def edit_cell_route():
    data = request.get_json() or {}
    filename = data.get('file')
    row_idx = data.get('row_index')
    col_name = data.get('column')
    new_value = data.get('value')

    if not filename or row_idx is None or not col_name:
        return jsonify({"error": "Parameters 'file', 'row_index', and 'column' are required."}), 400

    filepath = os.path.join(DATASETS_DIR, os.path.basename(filename))
    if not os.path.exists(filepath):
        return jsonify({"error": f"File '{filename}' does not exist."}), 404

    try:
        updated_metadata = cleaner.edit_cell(filepath, int(row_idx), col_name, new_value)
        return jsonify({
            "success": True,
            "message": f"Cell at row {row_idx}, column '{col_name}' updated successfully.",
            "metadata": updated_metadata
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/cleaner/ai_clean', methods=['POST'])
@login_required
def ai_clean_route():
    data = request.get_json() or {}
    filename = data.get('file')
    prompt = data.get('prompt')

    if not filename or not prompt:
        return jsonify({"error": "Parameters 'file' and 'prompt' are required."}), 400

    filepath = os.path.join(DATASETS_DIR, os.path.basename(filename))
    if not os.path.exists(filepath):
        return jsonify({"error": f"File '{filename}' does not exist."}), 404

    try:
        updated_metadata = cleaner.ai_clean_dataset(filepath, prompt)
        return jsonify({
            "success": True,
            "message": "AI conversational data cleaning completed successfully.",
            "metadata": updated_metadata,
            "actions": updated_metadata.get("ai_actions", [])
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/cleaner/anonymize', methods=['POST'])
@login_required
def anonymize_route():
    data = request.get_json() or {}
    filename = data.get('file')
    columns = data.get('columns')

    if not filename:
        return jsonify({"error": "Parameter 'file' is required."}), 400

    filepath = os.path.join(DATASETS_DIR, os.path.basename(filename))
    if not os.path.exists(filepath):
        return jsonify({"error": f"File '{filename}' does not exist."}), 404

    try:
        updated_metadata = cleaner.anonymize_dataset(filepath, columns)
        return jsonify({
            "success": True,
            "message": "PII data anonymization completed successfully.",
            "metadata": updated_metadata
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/export/pptx', methods=['GET'])
@login_required
def export_pptx_route():
    ppt_path = os.path.join(WORKSPACE_DIR, "AetherBI_Presentation_10_Slides.pptx")
    if not os.path.exists(ppt_path):
        import create_ppt
        create_ppt.create_presentation()

    return send_from_directory(WORKSPACE_DIR, "AetherBI_Presentation_10_Slides.pptx", as_attachment=True)


# Query Endpoint for Charts
@app.route('/api/datasets/query', methods=['POST'])
@login_required
def query_dataset():
    data = request.get_json() or {}
    filename = data.get('file')
    x_col = data.get('x_col')
    y_col = data.get('y_col')
    line_y_col = data.get('line_y_col') # secondary Y-axis for combo charts
    r_col = data.get('r_col') # bubble size radius
    aggregate = data.get('aggregate', 'NONE').upper() # NONE, SUM, AVG, COUNT, MIN, MAX
    group_by = data.get('group_by') # optional legend category column
    
    if not filename:
        return jsonify({"error": "Filename is required."}), 400
    if not x_col:
        return jsonify({"error": "X-axis column (x_col) is required."}), 400
        
    filepath = os.path.join(DATASETS_DIR, os.path.basename(filename))
    if not os.path.exists(filepath):
        return jsonify({"error": f"File '{filename}' does not exist."}), 404
        
    try:
        ext = os.path.splitext(filepath)[1].lower()
        if ext == '.csv':
            try:
                df = pd.read_csv(filepath)
            except UnicodeDecodeError:
                df = pd.read_csv(filepath, encoding='latin1')
        elif ext in ['.xls', '.xlsx']:
            df = pd.read_excel(filepath)
        else:
            return jsonify({"error": "Unsupported file format."}), 400
            
        # Strip whitespace from columns
        df.columns = [str(c).strip() for c in df.columns]
        
        # Verify columns exist
        if x_col not in df.columns:
            return jsonify({"error": f"Column '{x_col}' does not exist in dataset."}), 400
            
        if y_col and y_col not in df.columns:
            return jsonify({"error": f"Column '{y_col}' does not exist in dataset."}), 400

        if line_y_col and line_y_col not in df.columns:
            return jsonify({"error": f"Line Y Column '{line_y_col}' does not exist in dataset."}), 400

        if r_col and r_col not in df.columns:
            return jsonify({"error": f"Radius column '{r_col}' does not exist in dataset."}), 400
            
        if group_by and group_by not in df.columns:
            return jsonify({"error": f"Grouping column '{group_by}' does not exist in dataset."}), 400

        # Replace NaN/NaT for calculations
        df = df.replace([np.inf, -np.inf], np.nan)
        
        # Perform query aggregation
        result_data = []
        
        # Check if histogram requested
        if aggregate == 'HISTOGRAM':
            num_series = pd.to_numeric(df[x_col], errors='coerce').dropna()
            if num_series.empty:
                # Value counts for categorical column
                val_counts = df[x_col].value_counts().head(20)
                result_data = [{x_col: str(k), "count": int(v), "frequency": int(v)} for k, v in val_counts.items()]
            else:
                unique_vals = int(num_series.nunique())
                bin_count = min(12, max(5, unique_vals if unique_vals < 8 else 10))
                counts, bin_edges = np.histogram(num_series, bins=bin_count)
                hist_data = []
                for i in range(len(counts)):
                    s_val = round(float(bin_edges[i]), 1)
                    e_val = round(float(bin_edges[i+1]), 1)
                    if float(s_val).is_integer() and float(e_val).is_integer():
                        bin_label = f"{int(s_val)} - {int(e_val)}"
                    else:
                        bin_label = f"{s_val} - {e_val}"
                    hist_data.append({
                        x_col: bin_label,
                        "count": int(counts[i]),
                        "frequency": int(counts[i]),
                        "bin_start": float(bin_edges[i]),
                        "bin_end": float(bin_edges[i+1])
                    })
                result_data = hist_data

        # Check if correlation heatmap requested
        elif aggregate == 'HEATMAP':
            num_df = df.select_dtypes(include=[np.number])
            if num_df.shape[1] >= 2:
                corr_matrix = num_df.corr().round(3)
                corr_cols = list(corr_matrix.columns)
                corr_rows = []
                for row_name, row in corr_matrix.iterrows():
                    for col_name in corr_cols:
                        val = row[col_name]
                        corr_rows.append({
                            "x": col_name,
                            "y": row_name,
                            "value": None if pd.isna(val) else float(val)
                        })
                result_data = corr_rows
            else:
                return jsonify({"error": "Heatmap requires at least 2 numerical columns in dataset."}), 400

        # Check if box plot requested
        elif aggregate == 'BOXPLOT':
            if y_col:
                group_data = []
                df[y_col] = pd.to_numeric(df[y_col], errors='coerce')
                for cat_val, grp in df.groupby(x_col):
                    series = grp[y_col].dropna()
                    if not series.empty:
                        q1 = float(series.quantile(0.25))
                        med = float(series.median())
                        q3 = float(series.quantile(0.75))
                        iqr = q3 - q1
                        low_bound = q1 - 1.5 * iqr
                        high_bound = q3 + 1.5 * iqr
                        clean_pts = series[(series >= low_bound) & (series <= high_bound)]
                        outliers = series[(series < low_bound) | (series > high_bound)].tolist()
                        group_data.append({
                            x_col: str(cat_val),
                            "min": float(clean_pts.min() if not clean_pts.empty else series.min()),
                            "q1": q1,
                            "median": med,
                            "q3": q3,
                            "max": float(clean_pts.max() if not clean_pts.empty else series.max()),
                            "mean": float(series.mean()),
                            "outliers": [float(o) for o in outliers[:10]]
                        })
                result_data = group_data
            else:
                num_series = pd.to_numeric(df[x_col], errors='coerce').dropna()
                if not num_series.empty:
                    q1 = float(num_series.quantile(0.25))
                    med = float(num_series.median())
                    q3 = float(num_series.quantile(0.75))
                    iqr = q3 - q1
                    low_bound = q1 - 1.5 * iqr
                    high_bound = q3 + 1.5 * iqr
                    clean_pts = num_series[(num_series >= low_bound) & (num_series <= high_bound)]
                    outliers = num_series[(num_series < low_bound) | (num_series > high_bound)].tolist()
                    result_data = [{
                        x_col: "Overall",
                        "min": float(clean_pts.min() if not clean_pts.empty else num_series.min()),
                        "q1": q1,
                        "median": med,
                        "q3": q3,
                        "max": float(clean_pts.max() if not clean_pts.empty else num_series.max()),
                        "mean": float(num_series.mean()),
                        "outliers": [float(o) for o in outliers[:10]]
                    }]

        # Check if waterfall requested
        elif aggregate == 'WATERFALL':
            target_metric = y_col if y_col else x_col
            df[target_metric] = pd.to_numeric(df[target_metric], errors='coerce')
            if y_col:
                grouped = df.groupby(x_col, as_index=False)[y_col].sum()
                steps = []
                running_total = 0.0
                for _, row in grouped.head(15).iterrows():
                    val = float(row[y_col])
                    start_val = running_total
                    running_total += val
                    steps.append({
                        x_col: str(row[x_col]),
                        "value": val,
                        "start": start_val,
                        "end": running_total,
                        "type": "positive" if val >= 0 else "negative"
                    })
                # Add summary total step
                steps.append({
                    x_col: "Net Total",
                    "value": running_total,
                    "start": 0,
                    "end": running_total,
                    "type": "total"
                })
                result_data = steps
            else:
                result_data = []

        # Check if funnel requested
        elif aggregate == 'FUNNEL':
            metric_col = y_col if y_col else x_col
            df[metric_col] = pd.to_numeric(df[metric_col], errors='coerce')
            if y_col:
                grouped = df.groupby(x_col, as_index=False)[y_col].sum()
                grouped = grouped.sort_values(by=y_col, ascending=False).head(10)
                max_val = float(grouped[y_col].iloc[0]) if not grouped.empty and float(grouped[y_col].iloc[0]) > 0 else 1.0
                funnel_steps = []
                for _, row in grouped.iterrows():
                    val = float(row[y_col])
                    funnel_steps.append({
                        x_col: str(row[x_col]),
                        "value": val,
                        "percentage": round((val / max_val) * 100, 1)
                    })
                result_data = funnel_steps
            else:
                val_counts = df[x_col].value_counts().head(10)
                max_count = int(val_counts.iloc[0]) if not val_counts.empty else 1
                result_data = [{x_col: str(k), "value": int(v), "percentage": round((v / max_count) * 100, 1)} for k, v in val_counts.items()]

        # Check if treemap requested
        elif aggregate == 'TREEMAP':
            metric_col = y_col if y_col else x_col
            df[metric_col] = pd.to_numeric(df[metric_col], errors='coerce')
            if y_col:
                group_cols = [x_col]
                if group_by:
                    group_cols.append(group_by)
                grouped = df.groupby(group_cols, as_index=False)[y_col].sum()
                grouped = grouped.sort_values(by=y_col, ascending=False).head(25)
                total_sum = float(grouped[y_col].sum()) if float(grouped[y_col].sum()) > 0 else 1.0
                treemap_items = []
                for _, row in grouped.iterrows():
                    val = float(row[y_col])
                    item = {
                        x_col: str(row[x_col]),
                        "value": val,
                        "share": round((val / total_sum) * 100, 2)
                    }
                    if group_by:
                        item[group_by] = str(row[group_by])
                    treemap_items.append(item)
                result_data = treemap_items
            else:
                val_counts = df[x_col].value_counts().head(25)
                total_sum = int(val_counts.sum()) if int(val_counts.sum()) > 0 else 1
                result_data = [{x_col: str(k), "value": int(v), "share": round((v / total_sum) * 100, 2)} for k, v in val_counts.items()]

        # Check if gauge or bullet requested
        elif aggregate in ['GAUGE', 'BULLET']:
            target_metric = y_col if y_col else x_col
            num_series = pd.to_numeric(df[target_metric], errors='coerce').dropna()
            cur_val = float(num_series.sum() if not num_series.empty else 0)
            avg_val = float(num_series.mean() if not num_series.empty else 0)
            max_target = cur_val * 1.25 if cur_val > 0 else 100.0
            result_data = [{
                "current": round(cur_val, 2),
                "target": round(max_target, 2),
                "min": 0,
                "max": round(max_target * 1.2, 2),
                "percentage": round((cur_val / max_target) * 100, 1) if max_target > 0 else 0,
                "average": round(avg_val, 2)
            }]

        # Check if geo map requested
        elif aggregate == 'GEOMAP':
            metric_col = y_col if y_col else x_col
            df[metric_col] = pd.to_numeric(df[metric_col], errors='coerce')
            grouped = df.groupby(x_col, as_index=False)[metric_col].sum()
            grouped = grouped.sort_values(by=metric_col, ascending=False).head(30)
            result_data = cleaner.sanitize_records(grouped.to_dict(orient='records'))

        elif aggregate != 'NONE':
            if y_col:
                # Groupby aggregation
                cols_to_agg = [y_col]
                # Check if Y is non-numeric text
                num_y = pd.to_numeric(df[y_col], errors='coerce')
                effective_agg = aggregate
                if num_y.dropna().empty and aggregate in ['SUM', 'AVG', 'MIN', 'MAX']:
                    # Auto fallback to COUNT for text column
                    effective_agg = 'COUNT'
                else:
                    df[y_col] = num_y
                
                if line_y_col:
                    num_line_y = pd.to_numeric(df[line_y_col], errors='coerce')
                    df[line_y_col] = num_line_y
                    cols_to_agg.append(line_y_col)
                
                group_cols = [x_col]
                if group_by:
                    group_cols.append(group_by)
                    
                grouped = df.groupby(group_cols, as_index=False)
                
                if effective_agg == 'SUM':
                    res_df = grouped[cols_to_agg].sum()
                elif effective_agg == 'AVG':
                    res_df = grouped[cols_to_agg].mean()
                elif effective_agg == 'COUNT':
                    res_df = grouped[cols_to_agg].count()
                elif effective_agg == 'MIN':
                    res_df = grouped[cols_to_agg].min()
                elif effective_agg == 'MAX':
                    res_df = grouped[cols_to_agg].max()
                else:
                    return jsonify({"error": "Invalid aggregate function."}), 400
                
                # If high cardinality (>25 categories), sort descending and take top 25 for crisp visualization
                primary_metric = cols_to_agg[0]
                if len(res_df) > 25 and primary_metric in res_df.columns:
                    res_df = res_df.sort_values(by=primary_metric, ascending=False).head(25)
                elif primary_metric in res_df.columns:
                    res_df = res_df.sort_values(by=primary_metric, ascending=False)
                
                result_data = cleaner.sanitize_records(res_df.to_dict(orient='records'))
            else:
                # Dataset-wide single column aggregation (KPI card)
                num_x = pd.to_numeric(df[x_col], errors='coerce')
                effective_agg = aggregate
                if num_x.dropna().empty and aggregate in ['SUM', 'AVG', 'MIN', 'MAX']:
                    effective_agg = 'COUNT'
                else:
                    df[x_col] = num_x
                
                if effective_agg == 'SUM':
                    val = df[x_col].sum()
                elif effective_agg == 'AVG':
                    val = df[x_col].mean()
                elif effective_agg == 'COUNT':
                    val = df[x_col].count()
                elif effective_agg == 'MIN':
                    val = df[x_col].min()
                elif effective_agg == 'MAX':
                    val = df[x_col].max()
                else:
                    return jsonify({"error": "Invalid aggregate function."}), 400
                
                # Check for standard types
                if pd.isna(val):
                    val = None
                elif isinstance(val, (np.integer, np.signedinteger, np.unsignedinteger)):
                    val = int(val)
                elif isinstance(val, np.floating):
                    val = float(val)
                
                result_data = [{x_col: val}]
        else:
            # No aggregation or no Y column
            select_cols = [x_col]
            if y_col:
                select_cols.append(y_col)
            if line_y_col:
                select_cols.append(line_y_col)
            if r_col:
                select_cols.append(r_col)
            if group_by:
                select_cols.append(group_by)
                
            # Take a sample or first 1000 rows to keep charts fast
            res_df = df[select_cols].head(1000)
            result_data = cleaner.sanitize_records(res_df.to_dict(orient='records'))
            
        return jsonify({
            "success": True,
            "data": result_data,
            "x_col": x_col,
            "y_col": y_col,
            "r_col": r_col,
            "aggregate": aggregate,
            "group_by": group_by
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# AI Chart Narrative Summarizer Endpoint (Business Action Engine)
@app.route('/api/ai/summarize-chart', methods=['POST'])
@login_required
def summarize_chart():
    data = request.get_json() or {}
    
    chart_title = data.get('title', 'Chart')
    chart_type = data.get('chart_type', 'bar')
    x_col = data.get('x_col', 'X')
    y_col = data.get('y_col', 'Y')
    aggregate = data.get('aggregate', 'NONE')
    data_points = data.get('data_points', [])
    user_api_key = data.get('api_key') or request.headers.get('X-AI-API-Key') or os.environ.get('GEMINI_API_KEY') or os.environ.get('OPENAI_API_KEY')
    provider = data.get('provider', 'gemini').lower()

    if not data_points:
        return jsonify({"error": "No chart data points provided to summarize."}), 400

    sample_data = data_points[:50]
    
    prompt_text = (
        f"You are a Chief BI & Sales Strategy Advisor. Analyze this chart dataset:\n"
        f"- Chart Title: {chart_title}\n"
        f"- Chart Type: {chart_type}\n"
        f"- Primary Category Column (X-Axis): {x_col}\n"
        f"- Measured Metric (Y-Axis): {y_col or 'Count'} (Aggregated by: {aggregate})\n"
        f"- Dataset Size: {len(data_points)} records\n"
        f"- Sample Records: {json.dumps(sample_data)}\n\n"
        f"Provide a structured, highly actionable business analysis in valid JSON format with these exact keys:\n"
        f"1. headline: One sharp, executive takeaway sentence.\n"
        f"2. what_is_happening: Clear, plain-language paragraph explaining what is happening in this dataset (total volume sold/recorded, general performance, and overall trend).\n"
        f"3. top_performer: Detailed description of the top 1-2 leading categories, exact figures/sales, and percentage share.\n"
        f"4. bottom_performer: Detailed description of lowest performing categories, figures, and percentage deficit.\n"
        f"5. insights: Array of 3 to 5 quantitative bullet points detailing metric distributions, volume sold, ratios, and performance gaps.\n"
        f"6. where_to_focus: Array of 2 to 3 priority focus areas (which specific products, regions, or categories drive the most value or need attention).\n"
        f"7. how_to_increase_sales: Array of 3 specific, actionable steps to increase sales, boost performance, or optimize margins.\n"
        f"Return ONLY valid raw JSON."
    )

    # 1. Gemini API
    if user_api_key and (provider == 'gemini' or user_api_key.startswith('AIza')):
        for model_name in ["gemini-1.5-flash", "gemini-2.0-flash"]:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={user_api_key}"
                payload = {
                    "contents": [{"parts": [{"text": prompt_text}]}],
                    "generationConfig": {"response_mime_type": "application/json"}
                }
                req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=15) as response:
                    res_body = json.loads(response.read().decode('utf-8'))
                    raw_text = res_body['candidates'][0]['content']['parts'][0]['text']
                    ai_json = json.loads(raw_text)
                    return jsonify({"success": True, "provider": f"Google Gemini AI ({model_name})", "data": ai_json}), 200
            except Exception as e:
                print(f"Gemini API ({model_name}) Exception:", e)

    # 2. OpenAI API
    elif user_api_key and (provider == 'openai' or user_api_key.startswith('sk-')):
        try:
            url = "https://api.openai.com/v1/chat/completions"
            payload = {
                "model": "gpt-4o-mini",
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": "You are a chief executive BI analyst returning valid JSON."},
                    {"role": "user", "content": prompt_text}
                ]
            }
            req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {user_api_key}"
            })
            with urllib.request.urlopen(req, timeout=15) as response:
                res_body = json.loads(response.read().decode('utf-8'))
                raw_text = res_body['choices'][0]['message']['content']
                ai_json = json.loads(raw_text)
                return jsonify({"success": True, "provider": "OpenAI GPT-4o", "data": ai_json}), 200
        except Exception as e:
            print("OpenAI API Call Exception:", e)

    # 3. Detailed Local Business Intelligence Engine Fallback
    try:
        y_key = y_col if y_col and y_col in data_points[0] else None
        if not y_key:
            keys = [k for k in data_points[0].keys() if k != x_col]
            y_key = keys[0] if keys else None

        valid_pts = []
        if y_key:
            for p in data_points:
                val = p.get(y_key)
                if val is not None:
                    try:
                        fval = float(val)
                        valid_pts.append((p.get(x_col, 'Unknown'), fval))
                    except ValueError:
                        pass

        if valid_pts:
            sorted_pts = sorted(valid_pts, key=lambda x: x[1], reverse=True)
            top_item = sorted_pts[0]
            top_2nd = sorted_pts[1] if len(sorted_pts) > 1 else None
            bot_item = sorted_pts[-1]

            vals = [v[1] for v in sorted_pts]
            total_sum = sum(vals)
            avg_val = round(total_sum / len(vals), 2)
            max_val = sorted_pts[0][1]
            min_val = sorted_pts[-1][1]
            range_val = round(max_val - min_val, 2)
            
            top_share = round((top_item[1] / max(total_sum, 1)) * 100, 1)
            bot_share = round((bot_item[1] / max(total_sum, 1)) * 100, 1)

            top_str = f"'{top_item[0]}': {top_item[1]} units ({top_share}% of overall total)"
            bot_str = f"'{bot_item[0]}': {bot_item[1]} units ({bot_share}% of overall total)"

            insights_list = [
                f"Total Volume Sold/Recorded: Cumulative total of {total_sum} across {len(valid_pts)} categories.",
                f"Top Leader Contribution: '{top_item[0]}' leads the chart with {top_item[1]} ({top_share}% market/volume share).",
                f"Category Benchmark Average: Average volume per category is {avg_val}. {round(len([v for v in vals if v >= avg_val]) / len(vals) * 100, 1)}% of categories operate above average.",
                f"Bottom Deficit: Lowest category '{bot_item[0]}' produced {bot_item[1]}, creating a {round(top_item[1] - bot_item[1], 2)} unit gap behind the market leader."
            ]

            local_ai_response = {
                "headline": f"Analysis of '{chart_title}': Total cumulative {y_col or 'metric'} volume reached {total_sum} across {len(valid_pts)} categories.",
                "what_is_happening": f"In this dataset for '{chart_title}', a total of {total_sum} units/amount was measured across {len(valid_pts)} distinct '{x_col}' categories. The top performer '{top_item[0]}' accounts for {top_share}% of the overall total volume, showing strong demand dominance.",
                "top_performer": top_str,
                "bottom_performer": bot_str,
                "insights": insights_list,
                "where_to_focus": [
                    f"Primary Focus: Capitalize on high-volume leader '{top_item[0]}' which represents {top_share}% of all measured {y_col or 'sales'}.",
                    f"Growth Target: Investigate low-volume category '{bot_item[0]}' trailing at only {bot_share}% of total volume to identify recovery opportunities."
                ],
                "how_to_increase_sales": [
                    f"1. Double Down on Top Sellers: Increase inventory, marketing, or sales coverage for leader '{top_item[0]}' to capture remaining demand.",
                    f"2. Product Bundling & Discounts: Bundle low-performing '{bot_item[0]}' with high-volume '{top_item[0]}' at a slight discount to clear inventory and boost average order value.",
                    f"3. Targeted Promotional Campaigns: Launch regional or segment-focused promotions for middle-tier categories to push them above the {avg_val} category benchmark."
                ]
            }
        else:
            local_ai_response = {
                "headline": f"Categorical breakdown for '{chart_title}'.",
                "what_is_happening": f"This chart displays categorical distribution across {len(data_points)} data records under column '{x_col}'.",
                "top_performer": f"Recorded across {len(data_points)} entries",
                "bottom_performer": "N/A",
                "insights": [
                    f"Dataset contains {len(data_points)} categorical records under variable '{x_col}'.",
                    "Distribution analysis reveals multi-category representation across the dataset."
                ],
                "where_to_focus": [
                    f"Configure quantitative Y-Axis metrics to calculate exact revenue and volume distributions."
                ],
                "how_to_increase_sales": [
                    "Select a metric variable on the Y-Axis to generate automated sales optimization recommendations."
                ]
            }

        return jsonify({
            "success": True, 
            "provider": "Aether Insights Engine (Business Strategy AI)", 
            "data": local_ai_response,
            "note": "Add your Gemini API Key in AI Settings for LLM generation."
        }), 200

    except Exception as err:
        return jsonify({"error": f"Statistical summary error: {str(err)}"}), 500

# AI Combined Multi-Graph Report Summarizer Endpoint (Business Strategy Engine)
@app.route('/api/ai/summarize-report', methods=['POST'])
@login_required
def summarize_report():
    data = request.get_json() or {}
    
    report_title = data.get('report_title', 'Dashboard Report')
    report_subtitle = data.get('report_subtitle', '')
    charts = data.get('charts', [])
    user_api_key = data.get('api_key') or request.headers.get('X-AI-API-Key') or os.environ.get('GEMINI_API_KEY') or os.environ.get('OPENAI_API_KEY')
    provider = data.get('provider', 'gemini').lower()

    if not charts:
        return jsonify({"error": "No charts provided in the dashboard report to analyze."}), 400

    chart_summaries = []
    for i, c in enumerate(charts, 1):
        c_title = c.get('title', f'Chart {i}')
        c_type = c.get('type', 'bar')
        x_col = c.get('x_col', 'X')
        y_col = c.get('y_col', 'Y')
        agg = c.get('aggregate', 'NONE')
        pts = c.get('data_points', [])[:35]
        chart_summaries.append(
            f"=== Visualization #{i}: {c_title} ===\n"
            f"- Chart Type: {c_type}\n"
            f"- Category Variable (X): {x_col}, Metric/Sales Variable (Y): {y_col} (Aggregated: {agg})\n"
            f"- Data Records: {len(c.get('data_points', []))}\n"
            f"- Top Sample Records: {json.dumps(pts)}\n"
        )

    prompt_text = (
        f"You are a Chief Sales & Executive BI Officer. Provide a clear, actionable, highly structured executive analysis of this multi-graph report:\n"
        f"Report Title: {report_title}\n"
        f"Report Description: {report_subtitle or 'N/A'}\n"
        f"Total Pinned Graphs: {len(charts)}\n\n"
        + "\n".join(chart_summaries) + "\n\n"
        f"Generate a clear, professional executive report in valid JSON format with these exact keys:\n"
        f"1. headline: One powerful executive headline summarizing the multi-graph performance.\n"
        f"2. what_is_happening: Clear, plain-language paragraph explaining what is happening across the entire report (overall sales volume, main trends, and overall performance story).\n"
        f"3. executive_summary: A concise 2-3 sentence overview of multi-graph performance drivers.\n"
        f"4. key_metrics_summary: Array of 4 objects with 'label' and 'val' (e.g. Total Volume/Sales, Top Revenue Leader, Total Records Analyzed).\n"
        f"5. cross_graph_insights: Array of 4 to 6 detailed bullet points explaining exact figures, volume sold, ratios, and cross-chart trends.\n"
        f"6. where_to_focus: Array of 3 priority focus areas highlighting high-value categories, regions, or key products to target.\n"
        f"7. how_to_increase_sales: Array of 3 to 4 concrete, step-by-step strategies to increase sales, boost conversions, and maximize revenue.\n"
        f"Return ONLY valid raw JSON."
    )

    # 1. Gemini API
    if user_api_key and (provider == 'gemini' or user_api_key.startswith('AIza')):
        for model_name in ["gemini-1.5-flash", "gemini-2.0-flash"]:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={user_api_key}"
                payload = {
                    "contents": [{"parts": [{"text": prompt_text}]}],
                    "generationConfig": {"response_mime_type": "application/json"}
                }
                req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=18) as response:
                    res_body = json.loads(response.read().decode('utf-8'))
                    raw_text = res_body['candidates'][0]['content']['parts'][0]['text']
                    ai_json = json.loads(raw_text)
                    return jsonify({"success": True, "provider": f"Google Gemini AI ({model_name})", "data": ai_json}), 200
            except Exception as e:
                print(f"Gemini Multi-Graph API ({model_name}) Exception:", e)

    # 2. OpenAI API
    elif user_api_key and (provider == 'openai' or user_api_key.startswith('sk-')):
        try:
            url = "https://api.openai.com/v1/chat/completions"
            payload = {
                "model": "gpt-4o-mini",
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": "You are a chief executive BI analyst returning valid JSON."},
                    {"role": "user", "content": prompt_text}
                ]
            }
            req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {user_api_key}"
            })
            with urllib.request.urlopen(req, timeout=18) as response:
                res_body = json.loads(response.read().decode('utf-8'))
                raw_text = res_body['choices'][0]['message']['content']
                ai_json = json.loads(raw_text)
                return jsonify({"success": True, "provider": "OpenAI GPT-4o (Multi-Graph)", "data": ai_json}), 200
        except Exception as e:
            print("OpenAI Multi-Graph API Exception:", e)

    # 3. Detailed Local Business Strategy Engine Fallback
    try:
        total_charts = len(charts)
        chart_titles = [c.get('title', f'Graph #{i}') for i, c in enumerate(charts, 1)]

        key_metrics = []
        insights_bullets = []
        total_records_processed = 0
        all_max_values = []
        grand_total_volume = 0

        for i, c in enumerate(charts, 1):
            pts = c.get('data_points', [])
            total_records_processed += len(pts)
            y_col = c.get('y_col') or c.get('x_col') or 'Metric'
            x_col = c.get('x_col') or 'Category'
            agg = c.get('aggregate', 'NONE')
            
            if pts:
                try:
                    num_pts = len(pts)
                    vals = []
                    for p in pts:
                        v = p.get(y_col)
                        if v is not None:
                            try:
                                vals.append((p.get(x_col, 'Unknown'), float(v)))
                            except ValueError:
                                pass
                    if vals:
                        vals_sorted = sorted(vals, key=lambda x: x[1], reverse=True)
                        max_item = vals_sorted[0]
                        min_item = vals_sorted[-1]
                        sum_val = sum([v[1] for v in vals])
                        grand_total_volume += sum_val
                        avg_val = round(sum_val / len(vals), 2)
                        all_max_values.append((c.get('title'), max_item[0], max_item[1], sum_val))

                        insights_bullets.append(
                            f"Graph #{i} '{c.get('title')}' ({c.get('type','chart').upper()}): Total measured volume is {round(sum_val, 2)} across {num_pts} categories. "
                            f"Top performer is '{max_item[0]}' with {max_item[1]} units (average: {avg_val} per category)."
                        )
                        key_metrics.append({"label": f"Top: {c.get('title')[:15]}", "val": f"{max_item[1]} ({max_item[0]})"})
                    else:
                        insights_bullets.append(
                            f"Graph #{i} '{c.get('title')}': Analyzing distribution of {num_pts} records under dimension '{x_col}'."
                        )
                except Exception as ex:
                    insights_bullets.append(f"Graph #{i} '{c.get('title')}': Displaying categorical breakdown for variable '{x_col}'.")

        key_metrics.append({"label": "Combined Total Volume", "val": f"{round(grand_total_volume, 2) if grand_total_volume > 0 else 'N/A'}"})
        key_metrics.append({"label": "Total Graphs Pinned", "val": f"{total_charts} Widgets"})
        key_metrics.append({"label": "Analyzed Records", "val": f"{total_records_processed} Records"})

        # Multi-graph synthesis insights
        top_overall = sorted(all_max_values, key=lambda x: x[2], reverse=True)[0] if all_max_values else None

        local_ai_response = {
            "headline": f"Combined Executive Sales & Performance Synthesis for '{report_title}' ({total_charts} Visualizations, {total_records_processed} Records).",
            "what_is_happening": f"Across this combined report, a total volume of {round(grand_total_volume, 2) if grand_total_volume > 0 else total_records_processed} was measured across {total_charts} pinned graphs ({', '.join([f'&#34;{t}&#34;' for t in chart_titles[:3]])}). {f'Standout top leader across all graphs is &#34;{top_overall[1]}&#34; in {top_overall[0]} reaching {top_overall[2]} units.' if top_overall else ''}",
            "executive_summary": f"The multi-graph report integrates performance metrics from {total_charts} visualizations. High volume concentration is centered in top categories, while subordinate categories present immediate revenue growth opportunities.",
            "cross_graph_insights": insights_bullets,
            "key_metrics_summary": key_metrics[:4],
            "where_to_focus": [
                f"1. Core Revenue Driver: Scale category '{top_overall[1] if top_overall else chart_titles[0]}' which represents maximum measured volume in '{top_overall[0] if top_overall else 'primary graph'}'.",
                "2. High Margin Segments: Prioritize middle-tier categories in subordinate graphs that are close to crossing benchmark averages.",
                "3. Underperforming Categories: Fix operational friction and low demand in bottom-tier categories across all report widgets."
            ],
            "how_to_increase_sales": [
                f"1. Scale Winning Categories: Reallocate marketing budget and sales coverage to expand supply and promotions for top leader '{top_overall[1] if top_overall else 'primary seller'}'.",
                "2. Cross-Selling & Product Bundling: Create bundled offerings combining high-performing top sellers with lower-volume items at a promotional discount to raise average basket size.",
                "3. Targeted Sales Campaigns: Launch localized marketing campaigns and special offers targeting underperforming regions or customer segments.",
                "4. Pricing & Incentive Alignment: Adjust pricing tiers and offer volume rebates to incentivize bulk purchases across secondary category lines."
            ]
        }

        return jsonify({
            "success": True,
            "provider": "Aether Insights Engine (Business Strategy AI)",
            "data": local_ai_response,
            "note": "Add your Gemini API Key in AI Settings for LLM generation."
        }), 200

    except Exception as err:
        return jsonify({"error": f"Combined report analysis error: {str(err)}"}), 500

# Analytics & ETL Extensions (Outliers, Correlation, Forecast, Dataset Join)
@app.route('/api/analytics/detect_outliers', methods=['POST'])
@login_required
def detect_outliers_route():
    data = request.get_json() or {}
    filename = data.get('file')
    method = data.get('method', 'iqr')
    threshold = float(data.get('threshold', 1.5))
    columns = data.get('columns')

    if not filename:
        return jsonify({"error": "Filename is required."}), 400

    filepath = os.path.join(DATASETS_DIR, os.path.basename(filename))
    if not os.path.exists(filepath):
        return jsonify({"error": f"File '{filename}' does not exist."}), 404

    try:
        res = cleaner.detect_outliers(filepath, method=method, threshold=threshold, columns=columns)
        return jsonify({"success": True, "data": res}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/analytics/handle_outliers', methods=['POST'])
@login_required
def handle_outliers_route():
    data = request.get_json() or {}
    filename = data.get('file')
    method = data.get('method', 'iqr')
    threshold = float(data.get('threshold', 1.5))
    action = data.get('action', 'remove')
    columns = data.get('columns')

    if not filename:
        return jsonify({"error": "Filename is required."}), 400

    filepath = os.path.join(DATASETS_DIR, os.path.basename(filename))
    if not os.path.exists(filepath):
        return jsonify({"error": f"File '{filename}' does not exist."}), 404

    try:
        updated_metadata = cleaner.handle_outliers(filepath, method=method, threshold=threshold, action=action, columns=columns)
        return jsonify({"success": True, "message": f"Outliers {action}d successfully.", "metadata": updated_metadata}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/analytics/correlation', methods=['POST'])
@login_required
def correlation_route():
    data = request.get_json() or {}
    filename = data.get('file')

    if not filename:
        return jsonify({"error": "Filename is required."}), 400

    filepath = os.path.join(DATASETS_DIR, os.path.basename(filename))
    if not os.path.exists(filepath):
        return jsonify({"error": f"File '{filename}' does not exist."}), 404

    try:
        corr_data = cleaner.compute_correlation_matrix(filepath)
        return jsonify({"success": True, "data": corr_data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/analytics/forecast', methods=['POST'])
@login_required
def forecast_route():
    data = request.get_json() or {}
    filename = data.get('file')
    x_col = data.get('x_column')
    y_col = data.get('y_column')
    periods = int(data.get('periods', 5))
    model = data.get('model', 'auto')  # auto | linear | poly | sklearn_linear

    if not filename or not x_col or not y_col:
        return jsonify({"error": "Parameters 'file', 'x_column', and 'y_column' are required."}), 400

    filepath = os.path.join(DATASETS_DIR, os.path.basename(filename))
    if not os.path.exists(filepath):
        return jsonify({"error": f"File '{filename}' does not exist."}), 404

    try:
        forecast_data = cleaner.compute_forecast(filepath, x_col, y_col, periods=periods, model=model)
        return jsonify({"success": True, "data": forecast_data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
#  Share Endpoints
# ─────────────────────────────────────────────

@app.route('/api/share/create', methods=['POST'])
@login_required
def create_share():
    """Create a public shareable link for a chart or dashboard."""
    data = request.get_json() or {}
    share_type = data.get('type', 'chart')  # 'chart' or 'dashboard'
    payload = data.get('payload', {})
    expiry_hours = int(data.get('expiry_hours', 0))  # 0 = never
    uid = _current_uid()

    if not payload:
        return jsonify({"error": "Payload (chart/dashboard config) is required."}), 400

    try:
        token = share_manager.create_share(uid, share_type, payload, expiry_hours)
        share_url = request.host_url.rstrip('/') + f'/share/{token}'
        return jsonify({
            "success": True,
            "token": token,
            "share_url": share_url,
            "type": share_type,
            "expiry_hours": expiry_hours,
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/share/list', methods=['GET'])
@login_required
def list_shares():
    """List all active share links for the current user."""
    uid = _current_uid()
    try:
        shares = share_manager.list_shares(uid)
        return jsonify({"success": True, "shares": shares}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/share/revoke/<token>', methods=['DELETE'])
@login_required
def revoke_share(token):
    """Revoke / delete a share link."""
    uid = _current_uid()
    try:
        ok = share_manager.revoke_share(uid, token)
        if ok:
            return jsonify({"success": True, "message": "Share link revoked."}), 200
        return jsonify({"error": "Share not found or unauthorized."}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/share/<token>', methods=['GET'])
def view_share(token):
    """Public read-only share page - no login required."""
    try:
        share_data = share_manager.get_share(token)
        if not share_data:
            return render_template('index.html'), 404  # Let JS show 404 UI
        # Render index.html with share data injected as a script variable
        share_json = json.dumps({
            "token": token,
            "type": share_data.get("type"),
            "payload": share_data.get("payload", {}),
            "views": share_data.get("views", 0),
            "created_at": share_data.get("created_at"),
        })
        return render_template('share.html', share_json=share_json, token=token)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/share/data/<token>', methods=['GET'])
def get_share_data(token):
    """Returns share payload as JSON (used by share.html)."""
    try:
        share_data = share_manager.get_share(token)
        if not share_data:
            return jsonify({"error": "Share not found or expired."}), 404
        return jsonify({
            "success": True,
            "type": share_data.get("type"),
            "payload": share_data.get("payload", {}),
            "views": share_data.get("views", 0),
            "created_at": share_data.get("created_at"),
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@app.route('/api/datasets/join', methods=['POST'])
@login_required
def join_datasets_route():
    data = request.get_json() or {}
    file1 = data.get('file1')
    file2 = data.get('file2')
    key1 = data.get('key1')
    key2 = data.get('key2')
    join_type = data.get('join_type', 'inner')
    output_name = data.get('output_name')

    if not file1 or not file2 or not key1 or not key2:
        return jsonify({"error": "Parameters 'file1', 'file2', 'key1', and 'key2' are required."}), 400

    filepath1 = os.path.join(DATASETS_DIR, os.path.basename(file1))
    filepath2 = os.path.join(DATASETS_DIR, os.path.basename(file2))

    if not os.path.exists(filepath1):
        return jsonify({"error": f"File 1 '{file1}' does not exist."}), 404
    if not os.path.exists(filepath2):
        return jsonify({"error": f"File 2 '{file2}' does not exist."}), 404

    try:
        merged_meta = cleaner.join_datasets(filepath1, filepath2, key1, key2, join_type=join_type, output_name=output_name)
        return jsonify({"success": True, "message": "Datasets joined successfully.", "metadata": merged_meta}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ═══════════════════════════════════════════════════════════════════
#  PREDICTIVE ANALYTICS MODULE  —  /api/predict/*
# ═══════════════════════════════════════════════════════════════════
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def _get_predict_filepath(filename, uid):
    """Download from Firebase if needed, return local path."""
    filename = os.path.basename(filename)
    filepath = os.path.join(DATASETS_DIR, filename)
    if not os.path.exists(filepath):
        tmp = fb.download_dataset_to_temp(uid, filename)
        if tmp:
            import shutil
            shutil.copy(tmp, filepath)
            os.remove(tmp)
    return filepath if os.path.exists(filepath) else None


@app.route('/api/predict/analyze', methods=['POST'])
@login_required
def predict_analyze():
    """Auto-analyze dataset: detect industry, problem type, suggest target."""
    import predictor as pred
    data = request.get_json() or {}
    filename = data.get('file')
    target_col = data.get('target_col')  # optional hint

    if not filename:
        return jsonify({"error": "Filename is required."}), 400

    uid = _current_uid()
    filepath = _get_predict_filepath(filename, uid)
    if not filepath:
        return jsonify({"error": f"File '{filename}' not found."}), 404

    try:
        result = pred.analyze_dataset(filepath, target_col)
        return jsonify({"success": True, "data": result}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/predict/train', methods=['POST'])
@login_required
def predict_train():
    """Train all models on the dataset and return evaluation results."""
    import predictor as pred
    data = request.get_json() or {}
    filename = data.get('file')
    target_col = data.get('target_col')
    feature_cols = data.get('feature_cols')      # list or None (auto = all except target)
    industry_override = data.get('industry')     # optional manual override

    if not filename or not target_col:
        return jsonify({"error": "Parameters 'file' and 'target_col' are required."}), 400

    uid = _current_uid()
    filepath = _get_predict_filepath(filename, uid)
    if not filepath:
        return jsonify({"error": f"File '{filename}' not found."}), 404

    try:
        ext = os.path.splitext(filepath)[1].lower()
        if ext == '.csv':
            try:
                df_cols = pd.read_csv(filepath, nrows=0).columns.tolist()
            except Exception:
                df_cols = pd.read_csv(filepath, nrows=0, encoding='latin1').columns.tolist()
        else:
            df_cols = pd.read_excel(filepath, nrows=0).columns.tolist()

        if not feature_cols:
            feature_cols = [c for c in df_cols if c != target_col]

        if target_col not in df_cols:
            return jsonify({"error": f"Target column '{target_col}' not found in dataset."}), 400

        result = pred.run_full_pipeline(filepath, target_col, feature_cols, industry_override)

        # Store serialized model state in session (without SHAP plot for size)
        session['predict_state'] = {
            '_models_serialized': result['_models_serialized'],
            '_preprocessor_bytes': result['_preprocessor_bytes'],
            '_best_model_name': result['_best_model_name'],
            'problem_type': result['problem_type'],
            'industry': result['industry'],
            'target_col': result['target_col'],
            'feature_cols': result['feature_cols'],
            'baseline_row': result.get('baseline_row', {}),
        }

        # Return everything except raw model bytes
        safe_result = {k: v for k, v in result.items()
                       if k not in ('_models_serialized', '_preprocessor_bytes')}
        return jsonify({"success": True, "data": safe_result}), 200

    except ImportError as e:
        return jsonify({"error": f"Import error (check dependencies): {str(e)}"}), 500
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500


@app.route('/api/predict/whatif', methods=['POST'])
@login_required
def predict_whatif():
    """Run a What-If scenario: change feature values and see the new prediction."""
    import predictor as pred
    data = request.get_json() or {}
    changes = data.get('changes', {})       # {feature_name: new_value}
    base_row = data.get('base_row')         # optional override; uses session baseline

    state = session.get('predict_state')
    if not state:
        return jsonify({"error": "No trained model in session. Please train a model first."}), 400

    try:
        best_model_name = state['_best_model_name']
        model_bytes = state['_models_serialized'][best_model_name]['model_bytes']
        model = pred.load_model_from_bytes(model_bytes)
        preprocessor_meta = pred.load_preprocessor_from_bytes(state['_preprocessor_bytes'])
        problem_type = state['problem_type']

        row = base_row if base_row else state.get('baseline_row', {})
        result = pred.whatif_predict(model, preprocessor_meta, row, changes, problem_type)
        return jsonify({"success": True, "data": result}), 200
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500


@app.route('/api/predict/recommend', methods=['POST'])
@login_required
def predict_recommend():
    """Re-generate recommendations (can be called with custom eval_results)."""
    import predictor as pred
    data = request.get_json() or {}

    state = session.get('predict_state')
    if not state:
        return jsonify({"error": "No trained model in session."}), 400

    # Accept custom eval_results from the client if provided
    eval_results = data.get('eval_results', {})
    feature_importance = data.get('feature_importance', [])
    problem_type = state.get('problem_type', 'regression')
    industry = state.get('industry', 'generic')
    best_model_name = state.get('_best_model_name', '')

    try:
        recs = pred.generate_recommendations(
            feature_importance, problem_type, industry, eval_results, best_model_name
        )
        return jsonify({"success": True, "data": recs}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/predict/report', methods=['POST'])
@login_required
def predict_report():
    """Generate and return report data (HTML string + base64 PDF bytes)."""
    import report_generator as rg
    data = request.get_json() or {}
    report_data = data.get('report_data', {})
    fmt = data.get('format', 'both')   # 'html' | 'pdf' | 'both'

    if not report_data:
        return jsonify({"error": "report_data is required."}), 400

    try:
        result = {}
        if fmt in ('html', 'both'):
            html_str = rg.generate_html_report(report_data)
            result['html'] = html_str

        if fmt in ('pdf', 'both'):
            pdf_bytes = rg.generate_pdf_report(report_data)
            result['pdf_base64'] = base64.b64encode(pdf_bytes).decode('utf-8')

        return jsonify({"success": True, "data": result}), 200
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500


@app.route('/api/predict/report/download', methods=['POST'])
@login_required
def predict_report_download():
    """Stream the PDF or HTML report as a file download."""
    import report_generator as rg
    from flask import Response
    import time
    data = request.get_json() or {}
    report_data = data.get('report_data', {})
    fmt = data.get('format', 'pdf').lower()

    if not report_data:
        return jsonify({"error": "report_data is required."}), 400

    try:
        industry = report_data.get('industry', 'report').lower()
        ts = int(time.time())
        if fmt == 'html':
            html_content = rg.generate_html_report(report_data)
            filename = f"predictive_analytics_{industry}_{ts}.html"
            return Response(
                html_content,
                mimetype='text/html',
                headers={'Content-Disposition': f'attachment; filename="{filename}"'}
            )
        else:
            pdf_bytes = rg.generate_pdf_report(report_data)
            filename = f"predictive_analytics_{industry}_{ts}.pdf"
            return Response(
                pdf_bytes,
                mimetype='application/pdf',
                headers={'Content-Disposition': f'attachment; filename="{filename}"'}
            )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    is_debug = os.environ.get('FLASK_DEBUG', 'True').lower() in ('true', '1')
    app.run(host='0.0.0.0', port=port, debug=is_debug)





