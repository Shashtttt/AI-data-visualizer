"""
report_generator.py - PDF and HTML report generation for the
Multi-Industry Predictive Analytics module.
"""

import io
import os
import base64
from datetime import datetime


# ---- HTML REPORT ----

def generate_html_report(report_data: dict) -> str:
    """
    Generate a styled HTML report string from report_data dict.
    """
    industry = report_data.get("industry", "Generic").capitalize()
    problem_type = report_data.get("problem_type", "regression").capitalize()
    target_col = report_data.get("target_col", "Target")
    best_model = report_data.get("best_model", "N/A")
    dataset_shape = report_data.get("dataset_shape", [0, 0])
    eval_results = report_data.get("eval_results", {})
    feature_importance = report_data.get("feature_importance", [])
    shap_plot_b64 = report_data.get("shap_plot_base64")
    recommendations = report_data.get("recommendations", [])
    actual_vs_pred = report_data.get("actual_vs_predicted", [])
    whatif_scenarios = report_data.get("whatif_scenarios", [])
    generated_at = datetime.now().strftime("%B %d, %Y at %H:%M")

    # ---- Eval table rows ----
    eval_rows = ""
    for model_name, metrics in eval_results.items():
        is_best = model_name == best_model
        badge = ' <span style="background:#6366f1;color:#fff;padding:2px 8px;border-radius:12px;font-size:11px;">Best</span>' if is_best else ""
        row_style = 'background:#f0f0ff;font-weight:bold;' if is_best else ''
        if "error" in metrics:
            eval_rows += f'<tr style="{row_style}"><td>{model_name}{badge}</td><td colspan="5" style="color:red;">{metrics["error"]}</td></tr>'
        else:
            cv = f'{metrics.get("cv_mean",0):.4f} ± {metrics.get("cv_std",0):.4f}'
            if report_data.get("problem_type") == "regression":
                eval_rows += (
                    f'<tr style="{row_style}"><td>{model_name}{badge}</td>'
                    f'<td>{metrics.get("r2","N/A") if not isinstance(metrics.get("r2"), float) else round(metrics["r2"],4)}</td>'
                    f'<td>{metrics.get("rmse","N/A") if not isinstance(metrics.get("rmse"), float) else round(metrics["rmse"],4)}</td>'
                    f'<td>{metrics.get("mae","N/A") if not isinstance(metrics.get("mae"), float) else round(metrics["mae"],4)}</td>'
                    f'<td>{cv}</td></tr>'
                )
            else:
                eval_rows += (
                    f'<tr style="{row_style}"><td>{model_name}{badge}</td>'
                    f'<td>{round(metrics["accuracy"],4) if isinstance(metrics.get("accuracy"), float) else "N/A"}</td>'
                    f'<td>{round(metrics["f1"],4) if isinstance(metrics.get("f1"), float) else "N/A"}</td>'
                    f'<td>{round(metrics["auc"],4) if isinstance(metrics.get("auc"), float) else "N/A"}</td>'
                    f'<td>{cv}</td></tr>'
                )

    if report_data.get("problem_type") == "regression":
        metric_header = "<tr><th>Model</th><th>R²</th><th>RMSE</th><th>MAE</th><th>CV Score</th></tr>"
    else:
        metric_header = "<tr><th>Model</th><th>Accuracy</th><th>F1</th><th>AUC</th><th>CV Score</th></tr>"

    # ---- Feature importance bars ----
    fi_html = ""
    if feature_importance:
        max_val = max(v for _, v in feature_importance[:10]) or 1
        for feat, val in feature_importance[:10]:
            pct = round((val / max_val) * 100, 1)
            fi_html += f'''
            <div style="margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px;">
                <span><strong>{feat}</strong></span><span>{round(val,4)}</span>
              </div>
              <div style="background:#e5e7eb;border-radius:8px;height:10px;">
                <div style="background:linear-gradient(90deg,#6366f1,#8b5cf6);width:{pct}%;height:10px;border-radius:8px;"></div>
              </div>
            </div>'''

    # ---- Recommendations ----
    rec_colors = {"high": "#ef4444", "medium": "#f59e0b", "low": "#10b981"}
    rec_html = ""
    for rec in recommendations[:12]:
        color = rec_colors.get(rec.get("priority", "low"), "#6b7280")
        rec_html += f'''
        <div style="border-left:4px solid {color};background:#fafafa;padding:12px 16px;margin-bottom:10px;border-radius:0 8px 8px 0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="background:{color};color:#fff;padding:2px 8px;border-radius:12px;font-size:11px;text-transform:uppercase;">{rec.get("priority","")}</span>
            <span style="font-size:12px;color:#6b7280;">{rec.get("category","")}</span>
          </div>
          <strong style="font-size:14px;">{rec.get("title","")}</strong>
          <p style="margin:4px 0 0;font-size:13px;color:#374151;">{rec.get("description","")}</p>
        </div>'''

    # ---- What-If table ----
    whatif_html = ""
    if whatif_scenarios:
        whatif_html = '<table style="width:100%;border-collapse:collapse;font-size:13px;"><tr style="background:#6366f1;color:#fff;">'
        if whatif_scenarios:
            headers = list(whatif_scenarios[0].keys())
            for h in headers:
                whatif_html += f"<th style='padding:8px;text-align:left;'>{h}</th>"
            whatif_html += "</tr>"
            for row in whatif_scenarios:
                whatif_html += "<tr style='border-bottom:1px solid #e5e7eb;'>"
                for h in headers:
                    whatif_html += f"<td style='padding:8px;'>{row.get(h,'')}</td>"
                whatif_html += "</tr>"
        whatif_html += "</table>"

    # ---- SHAP image ----
    shap_html = ""
    if shap_plot_b64:
        shap_html = f'<img src="data:image/png;base64,{shap_plot_b64}" style="max-width:100%;border-radius:8px;" alt="SHAP Feature Importance"/>'

    # ---- Actual vs predicted sample table ----
    avp_html = ""
    if actual_vs_pred:
        avp_html = '<table style="width:100%;border-collapse:collapse;font-size:13px;"><tr style="background:#6366f1;color:#fff;"><th style="padding:8px;">Index</th><th style="padding:8px;">Actual</th><th style="padding:8px;">Predicted</th><th style="padding:8px;">? Error</th></tr>'
        for row in actual_vs_pred[:30]:
            a = row.get("actual", 0)
            p = row.get("predicted", 0)
            try:
                delta = round(float(p) - float(a), 4)
                delta_color = "#10b981" if abs(delta) < abs(float(a)) * 0.1 else "#ef4444"
                avp_html += f'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px;">{row.get("index","")}</td><td style="padding:8px;">{round(float(a),4)}</td><td style="padding:8px;">{round(float(p),4)}</td><td style="padding:8px;color:{delta_color};">{delta:+.4f}</td></tr>'
            except Exception:
                avp_html += f'<tr><td>{row.get("index","")}</td><td>{a}</td><td>{p}</td><td>N/A</td></tr>'
        avp_html += "</table>"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Predictive Analytics Report — {industry}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
    * {{ box-sizing:border-box; margin:0; padding:0; }}
    body {{ font-family:'Inter',sans-serif; background:#f8fafc; color:#1e293b; line-height:1.6; }}
    .cover {{ background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#06b6d4 100%); color:#fff; padding:60px 48px; }}
    .cover h1 {{ font-size:32px; font-weight:700; margin-bottom:8px; }}
    .cover p {{ font-size:16px; opacity:0.85; margin-bottom:4px; }}
    .badge {{ display:inline-block; background:rgba(255,255,255,0.2); padding:4px 14px; border-radius:20px; font-size:13px; margin-top:10px; }}
    .container {{ max-width:900px; margin:0 auto; padding:32px 24px; }}
    .section {{ background:#fff; border-radius:12px; padding:28px; margin-bottom:24px; box-shadow:0 1px 8px rgba(0,0,0,0.06); }}
    .section h2 {{ font-size:18px; font-weight:700; margin-bottom:16px; color:#1e293b; border-bottom:2px solid #e2e8f0; padding-bottom:10px; }}
    .stat-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:16px; margin-bottom:16px; }}
    .stat-card {{ background:#f1f5f9; border-radius:10px; padding:16px; text-align:center; }}
    .stat-card .val {{ font-size:24px; font-weight:700; color:#6366f1; }}
    .stat-card .lbl {{ font-size:12px; color:#64748b; margin-top:4px; }}
    table {{ width:100%; border-collapse:collapse; }}
    th {{ background:#f1f5f9; padding:10px; text-align:left; font-size:13px; }}
    td {{ padding:10px; border-bottom:1px solid #f1f5f9; font-size:13px; }}
    .footer {{ text-align:center; padding:24px; font-size:12px; color:#94a3b8; }}
    @media print {{
      body {{ background:#fff; }}
      .section {{ box-shadow:none; border:1px solid #e2e8f0; }}
    }}
  </style>
</head>
<body>
  <div class="cover">
    <h1>Predictive Analytics Report</h1>
    <p>Industry: <strong>{industry}</strong></p>
    <p>Target Variable: <strong>{target_col}</strong></p>
    <p>Problem Type: <strong>{problem_type}</strong></p>
    <p>Best Model: <strong>{best_model}</strong></p>
    <span class="badge">Generated: {generated_at}</span>
  </div>

  <div class="container">

    <!-- 1. Dataset Summary -->
    <div class="section">
      <h2>1. Dataset Summary</h2>
      <div class="stat-grid">
        <div class="stat-card"><div class="val">{dataset_shape[0]:,}</div><div class="lbl">Total Rows</div></div>
        <div class="stat-card"><div class="val">{dataset_shape[1]}</div><div class="lbl">Total Columns</div></div>
        <div class="stat-card"><div class="val">{len(feature_importance)}</div><div class="lbl">Features Used</div></div>
        <div class="stat-card"><div class="val">{industry}</div><div class="lbl">Industry</div></div>
      </div>
    </div>

    <!-- 2. Model Evaluation -->
    <div class="section">
      <h2>2. Model Evaluation Results</h2>
      <table>
        {metric_header}
        {eval_rows}
      </table>
    </div>

    <!-- 3. Actual vs Predicted -->
    <div class="section">
      <h2>3. Actual vs Predicted (Test Set Sample)</h2>
      {avp_html if avp_html else "<p style='color:#94a3b8;'>No prediction data available.</p>"}
    </div>

    <!-- 4. Feature Importance -->
    <div class="section">
      <h2>4. Feature Importance (Top 10)</h2>
      {fi_html if fi_html else "<p style='color:#94a3b8;'>No feature importance data available.</p>"}
    </div>

    <!-- 5. SHAP Explanation -->
    <div class="section">
      <h2>5. SHAP Explainability</h2>
      {shap_html if shap_html else "<p style='color:#94a3b8;'>SHAP plot not available (requires tree-based or kernel explainer).</p>"}
    </div>

    <!-- 6. Recommendations -->
    <div class="section">
      <h2>6. Data-Driven Recommendations</h2>
      {rec_html if rec_html else "<p style='color:#94a3b8;'>No recommendations generated.</p>"}
    </div>

    <!-- 7. What-If Scenarios -->
    <div class="section">
      <h2>7. What-If Simulation Results</h2>
      {whatif_html if whatif_html else "<p style='color:#94a3b8;'>No What-If scenarios recorded.</p>"}
    </div>

  </div>

  <div class="footer">
    Generated by AetherBI Predictive Analytics · {generated_at}
  </div>
</body>
</html>"""

    return html


# ---- PDF REPORT ----

def generate_pdf_report(report_data: dict) -> bytes:
    """
    Generate a PDF from the report data using ReportLab.
    Returns raw PDF bytes.
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.lib import colors
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            HRFlowable, Image
        )
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
    except ImportError:
        raise ImportError("reportlab is required for PDF generation. Install with: pip install reportlab")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2*cm,
        title="Predictive Analytics Report",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("Title2", parent=styles["Title"], textColor=colors.HexColor("#6366f1"), fontSize=20)
    h2_style = ParagraphStyle("H2", parent=styles["Heading2"], textColor=colors.HexColor("#1e293b"), fontSize=14, spaceBefore=14)
    body_style = styles["BodyText"]
    small_style = ParagraphStyle("Small", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#64748b"))

    industry = report_data.get("industry", "Generic").capitalize()
    problem_type = report_data.get("problem_type", "regression").capitalize()
    target_col = report_data.get("target_col", "Target")
    best_model = report_data.get("best_model", "N/A")
    dataset_shape = report_data.get("dataset_shape", [0, 0])
    eval_results = report_data.get("eval_results", {})
    feature_importance = report_data.get("feature_importance", [])
    recommendations = report_data.get("recommendations", [])
    actual_vs_pred = report_data.get("actual_vs_predicted", [])
    whatif_scenarios = report_data.get("whatif_scenarios", [])
    shap_plot_b64 = report_data.get("shap_plot_base64")
    generated_at = datetime.now().strftime("%B %d, %Y at %H:%M")

    story = []

    # ---- Cover ----
    story.append(Paragraph("Predictive Analytics Report", title_style))
    story.append(Spacer(1, 8))
    story.append(Paragraph(f"<b>Industry:</b> {industry}  |  <b>Problem Type:</b> {problem_type}  |  <b>Target:</b> {target_col}", body_style))
    story.append(Paragraph(f"<b>Best Model:</b> {best_model}  |  <b>Generated:</b> {generated_at}", small_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#6366f1"), spaceAfter=12))

    # ---- Dataset Summary ----
    story.append(Paragraph("1. Dataset Summary", h2_style))
    summary_data = [
        ["Rows", "Columns", "Features Used", "Industry"],
        [str(dataset_shape[0]), str(dataset_shape[1]), str(len(feature_importance)), industry],
    ]
    t = Table(summary_data, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#6366f1")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f8fafc"), colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 12))

    # ---- Model Evaluation ----
    story.append(Paragraph("2. Model Evaluation Results", h2_style))
    if problem_type.lower() == "regression":
        headers = ["Model", "R²", "RMSE", "MAE", "CV Score"]
        eval_rows_pdf = [headers]
        for model_name, metrics in eval_results.items():
            if "error" in metrics:
                eval_rows_pdf.append([model_name, "Error", "", "", ""])
            else:
                cv = f'{metrics.get("cv_mean",0):.4f} ± {metrics.get("cv_std",0):.4f}'
                eval_rows_pdf.append([
                    model_name,
                    round(metrics.get("r2", 0), 4),
                    round(metrics.get("rmse", 0), 4),
                    round(metrics.get("mae", 0), 4),
                    cv
                ])
    else:
        headers = ["Model", "Accuracy", "F1", "AUC", "CV Score"]
        eval_rows_pdf = [headers]
        for model_name, metrics in eval_results.items():
            if "error" in metrics:
                eval_rows_pdf.append([model_name, "Error", "", "", ""])
            else:
                cv = f'{metrics.get("cv_mean",0):.4f} ± {metrics.get("cv_std",0):.4f}'
                eval_rows_pdf.append([
                    model_name,
                    round(metrics.get("accuracy", 0), 4),
                    round(metrics.get("f1", 0), 4),
                    round(metrics.get("auc", 0), 4) if metrics.get("auc") is not None else "N/A",
                    cv
                ])

    t2 = Table(eval_rows_pdf, hAlign="LEFT")
    t2.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#6366f1")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f8fafc"), colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t2)
    story.append(Spacer(1, 12))

    # ---- Feature Importance ----
    story.append(Paragraph("3. Feature Importance (Top 10)", h2_style))
    if feature_importance:
        fi_data = [["Feature", "Importance Score"]] + [
            [fn, round(val, 6)] for fn, val in feature_importance[:10]
        ]
        t3 = Table(fi_data, hAlign="LEFT", colWidths=[10*cm, 5*cm])
        t3.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#6366f1")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f8fafc"), colors.white]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(t3)
    story.append(Spacer(1, 12))

    # ---- SHAP plot ----
    if shap_plot_b64:
        story.append(Paragraph("4. SHAP Explainability", h2_style))
        img_bytes = base64.b64decode(shap_plot_b64)
        img_buf = io.BytesIO(img_bytes)
        img = Image(img_buf, width=14*cm, height=8.75*cm)
        story.append(img)
        story.append(Spacer(1, 12))

    # ---- Recommendations ----
    story.append(Paragraph("5. Data-Driven Recommendations", h2_style))
    priority_colors_pdf = {"high": colors.HexColor("#ef4444"), "medium": colors.HexColor("#f59e0b"), "low": colors.HexColor("#10b981")}
    for rec in recommendations[:10]:
        color = priority_colors_pdf.get(rec.get("priority", "low"), colors.gray)
        story.append(Paragraph(
            f'<font color="#{color.hexval()[2:] if hasattr(color,"hexval") else "6b7280"}"><b>[{rec.get("priority","").upper()}]</b></font> '
            f'<b>{rec.get("title","")}</b>',
            body_style
        ))
        story.append(Paragraph(rec.get("description", ""), small_style))
        story.append(Spacer(1, 6))
    story.append(Spacer(1, 8))

    # ---- What-If Scenarios ----
    if whatif_scenarios:
        story.append(Paragraph("6. What-If Simulation Results", h2_style))
        if whatif_scenarios:
            wf_headers = list(whatif_scenarios[0].keys())
            wf_data = [wf_headers] + [[str(row.get(h, "")) for h in wf_headers] for row in whatif_scenarios]
            t4 = Table(wf_data, hAlign="LEFT")
            t4.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#6366f1")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("PADDING", (0, 0), (-1, -1), 4),
            ]))
            story.append(t4)

    # ---- Actual vs Predicted ----
    if actual_vs_pred:
        story.append(Spacer(1, 12))
        story.append(Paragraph("7. Actual vs Predicted (Test Sample)", h2_style))
        avp_data = [["#", "Actual", "Predicted", "? Error"]]
        for row in actual_vs_pred[:25]:
            try:
                a = round(float(row.get("actual", 0)), 4)
                p = round(float(row.get("predicted", 0)), 4)
                delta = round(p - a, 4)
                avp_data.append([str(row.get("index","")), str(a), str(p), f"{delta:+.4f}"])
            except Exception:
                avp_data.append([str(row.get("index","")), str(row.get("actual","")), str(row.get("predicted","")), ""])
        t5 = Table(avp_data, hAlign="LEFT", colWidths=[2*cm, 4*cm, 4*cm, 4*cm])
        t5.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#6366f1")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f8fafc"), colors.white]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("PADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t5)

    story.append(Spacer(1, 24))
    story.append(Paragraph(f"Generated by AetherBI Predictive Analytics · {generated_at}", small_style))

    doc.build(story)
    buf.seek(0)
    return buf.read()
