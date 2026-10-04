/**
 * utils/report.js
 * Comprehensive PDF & Printable Report Generator for AetherBI
 * Generates executive briefing with Dataset Overview, Quality Score,
 * Cleaning Log, Key Statistics, Smart Analytics, ML Performance, and AI Insights.
 */

const ReportGenerator = {
  /**
   * Generates a fully-styled standalone printable HTML report that triggers window.print() (Save as PDF).
   */
  generateHtmlReport(data = {}) {
    const profile = data.profile || {};
    const domainInfo = data.domainInfo || {};

    const datasetName = data.datasetName || 'Webpage Dataset';
    const domainTitle = data.domainTitle || domainInfo.title || domainInfo.name || 'General Dataset';
    const domainIcon = data.domainIcon || domainInfo.icon || '📊';
    const qualityScore = data.qualityScore !== undefined ? data.qualityScore : (profile.qualityScore !== undefined ? profile.qualityScore : 100);
    const rowCount = data.rowCount || profile.rowCount || (data.rows ? data.rows.length : 0);
    const colCount = data.colCount || profile.colCount || (data.columns ? data.columns.length : 0);
    const numericCount = data.numericCount || profile.numericCount || 0;
    const categoricalCount = data.categoricalCount || profile.categoricalCount || 0;
    const dateCount = data.dateCount || profile.dateCount || 0;
    const totalNulls = data.totalNulls !== undefined ? data.totalNulls : (profile.totalNulls || 0);
    const totalDuplicates = data.totalDuplicates !== undefined ? data.totalDuplicates : (profile.totalDuplicates || 0);
    const columnProfiles = data.columnProfiles || profile.columnProfiles || {};
    const smartAnalytics = data.smartAnalytics || profile.smartAnalytics || [];
    const cleaningOperations = data.cleaningOperations || (data.cleaner ? data.cleaner.getOperationLog() : []);
    const mlResults = data.mlResults || data.autoML || null;
    const aiInsights = data.aiInsights || '';
    const timestamp = data.timestamp || new Date().toLocaleString();

    const columnRowsHtml = Object.entries(columnProfiles).map(([col, p]) => `
      <tr>
        <td style="font-weight: 600; color: #0f172a;">${col}</td>
        <td><span class="badge ${p.inferredType}">${p.userOverrideType || p.inferredType}</span></td>
        <td>${p.nullCount} (${p.nullPercentage}%)</td>
        <td>${p.distinctCount}</td>
        <td>${p.stats?.min !== null ? `${p.stats.min} to ${p.stats.max}` : (p.topValues?.[0]?.value || 'N/A')}</td>
        <td>${p.stats?.mean !== null ? `Mean: ${p.stats.mean} | SD: ${p.stats.stdDev || 'N/A'}` : `${p.distinctCount} classes`}</td>
      </tr>
    `).join('');

    const analyticsListHtml = (smartAnalytics && smartAnalytics.length > 0)
      ? smartAnalytics.map(a => `
        <div class="insight-box">
          <span class="insight-icon">${a.icon || '💡'}</span>
          <div>
            <strong>${a.title}</strong>
            <p>${a.text}</p>
          </div>
        </div>
      `).join('')
      : '<p style="color: #64748b;">No high-cardinality anomalies or extreme correlations detected.</p>';

    const cleaningListHtml = (cleaningOperations && cleaningOperations.length > 0)
      ? cleaningOperations.map((op, i) => `<li><strong>Step ${i + 1}:</strong> ${op}</li>`).join('')
      : '<li>Dataset remained in its original extracted state.</li>';

    let mlSectionHtml = '';
    if (mlResults && mlResults.models && mlResults.models.length > 0) {
      const modelRows = mlResults.models.map(m => `
        <tr>
          <td style="font-weight: 600;">${m.modelName}</td>
          <td>${m.task.toUpperCase()}</td>
          <td>${m.primaryMetricLabel}: <strong>${m.primaryMetricVal}</strong></td>
          <td>${m.rmse ? `RMSE: ${m.rmse}` : `F1: ${m.f1 || 'N/A'}%`}</td>
        </tr>
      `).join('');

      mlSectionHtml = `
        <div class="section">
          <h2>Machine Learning Performance (AutoML)</h2>
          <p style="color: #64748b; font-size: 13px;">Target Column: <strong>${mlResults.targetCol}</strong> | Input Features: <strong>${mlResults.featureCols.join(', ')}</strong></p>
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Task</th>
                <th>Primary Metric</th>
                <th>Secondary Evaluation</th>
              </tr>
            </thead>
            <tbody>
              ${modelRows}
            </tbody>
          </table>
        </div>
      `;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AetherBI Intelligence Report - ${datasetName}</title>
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      line-height: 1.5;
      margin: 0;
      padding: 24px;
      background: #ffffff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 14px;
      margin-bottom: 20px;
    }
    .brand-title {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
    }
    .brand-subtitle {
      font-size: 13px;
      color: #64748b;
    }
    .meta-tag {
      font-size: 12px;
      color: #475569;
      text-align: right;
    }
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 10px;
      margin-bottom: 24px;
    }
    .kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      text-align: center;
    }
    .kpi-card .val {
      font-size: 18px;
      font-weight: 700;
      color: #0284c7;
      display: block;
    }
    .kpi-card .lbl {
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
    }
    .section {
      margin-bottom: 24px;
      page-break-inside: avoid;
    }
    .section h2 {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 8px;
    }
    th {
      background: #f1f5f9;
      color: #475569;
      text-align: left;
      padding: 8px 10px;
      font-weight: 600;
      border: 1px solid #cbd5e1;
    }
    td {
      padding: 7px 10px;
      border: 1px solid #e2e8f0;
      color: #334155;
    }
    tr:nth-child(even) {
      background: #f8fafc;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      background: #e0f2fe;
      color: #0369a1;
    }
    .insight-box {
      display: flex;
      gap: 12px;
      padding: 10px 14px;
      background: #f0fdf4;
      border-left: 4px solid #10b981;
      border-radius: 6px;
      margin-bottom: 8px;
      font-size: 12px;
    }
    .insight-icon {
      font-size: 18px;
    }
    .insight-box strong {
      color: #065f46;
      display: block;
      margin-bottom: 2px;
    }
    .insight-box p {
      margin: 0;
      color: #1e293b;
    }
    .ai-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 14px;
      font-size: 12px;
      line-height: 1.6;
      color: #1e293b;
      white-space: pre-wrap;
    }
    .btn-print {
      position: fixed;
      top: 16px;
      right: 16px;
      padding: 8px 16px;
      background: #0284c7;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
    }
    @media print {
      .btn-print { display: none; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>

  <div class="header">
    <div>
      <h1 class="brand-title">AetherBI Executive Intelligence Report</h1>
      <span class="brand-subtitle">${domainIcon} ${domainTitle} &bull; ${datasetName}</span>
    </div>
    <div class="meta-tag">
      Generated: <strong>${timestamp}</strong><br>
      Browser Client-Side Engine
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi-card">
      <span class="val" style="color: ${qualityScore >= 80 ? '#10b981' : '#f59e0b'};">${qualityScore}/100</span>
      <span class="lbl">Quality Score</span>
    </div>
    <div class="kpi-card">
      <span class="val">${rowCount.toLocaleString()}</span>
      <span class="lbl">Total Rows</span>
    </div>
    <div class="kpi-card">
      <span class="val">${colCount}</span>
      <span class="lbl">Columns</span>
    </div>
    <div class="kpi-card">
      <span class="val">${numericCount}</span>
      <span class="lbl">Numeric</span>
    </div>
    <div class="kpi-card">
      <span class="val">${categoricalCount}</span>
      <span class="lbl">Categorical</span>
    </div>
    <div class="kpi-card">
      <span class="val" style="color: ${totalNulls > 0 ? '#ef4444' : '#10b981'};">${totalNulls}</span>
      <span class="lbl">Nulls</span>
    </div>
  </div>

  <div class="section">
    <h2>Dataset Schema &amp; Column Statistics</h2>
    <table>
      <thead>
        <tr>
          <th>Column</th>
          <th>Type</th>
          <th>Missing</th>
          <th>Distinct</th>
          <th>Range / Top Value</th>
          <th>Metrics</th>
        </tr>
      </thead>
      <tbody>
        ${columnRowsHtml}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>Smart Analytics &amp; Anomaly Detection</h2>
    ${analyticsListHtml}
  </div>

  ${mlSectionHtml}

  <div class="section">
    <h2>Applied Data Cleaning Operations</h2>
    <ul style="font-size: 12px; color: #334155; padding-left: 20px;">
      ${cleaningListHtml}
    </ul>
  </div>

  ${aiInsights ? `
  <div class="section">
    <h2>AI Executive Advisor Insights</h2>
    <div class="ai-box">${aiInsights}</div>
  </div>` : ''}

</body>
</html>`;
  },

  /**
   * Opens the printable report in a new browser tab and triggers print dialog
   */
  openPrintableReport(reportData) {
    const htmlContent = this.generateHtmlReport(reportData);
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      alert('Popup blocker prevented opening the report. Please allow popups for this extension.');
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReportGenerator;
}
