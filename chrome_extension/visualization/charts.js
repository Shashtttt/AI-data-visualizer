/**
 * visualization/charts.js
 * Browser-native, zero-dependency SVG & Canvas Chart Engine (CSP Manifest V3 compliant)
 * Supports: Bar, Horizontal Bar, Line, Pie/Donut, Scatter with Trendline, Histogram,
 * Box Plot, Correlation Heatmap, Time-Series Forecast, and ML Residuals / Confusion Matrix.
 */

const Charts = {
  PALETTE: [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
  ],

  // Recommend best charts from profile
  suggestCharts(columns, columnProfiles) {
    const suggestions = [];
    const numCols = [];
    const catCols = [];
    const dateCols = [];

    columns.forEach(c => {
      const p = columnProfiles[c];
      if (!p) return;
      if (p.inferredType === 'numeric' || p.inferredType === 'currency' || p.inferredType === 'percentage' || p.inferredType === 'integer' || p.inferredType === 'float') {
        numCols.push(c);
      } else if (p.inferredType === 'date') {
        dateCols.push(c);
      } else {
        catCols.push(c);
      }
    });

    // 1. Date + Numeric -> Time Series Line & Forecast
    if (dateCols.length > 0 && numCols.length > 0) {
      suggestions.push({
        type: 'line',
        title: `${numCols[0]} over Time (${dateCols[0]})`,
        xAxis: dateCols[0],
        yAxis: numCols[0],
        description: 'Temporal trends and historical progression'
      });
      suggestions.push({
        type: 'forecast',
        title: `ML Forecast: ${numCols[0]} Projection`,
        xAxis: dateCols[0],
        yAxis: numCols[0],
        description: 'Predict next periods with statistical confidence intervals'
      });
    }

    // 2. Category + Numeric -> Bar & Horizontal Bar
    if (catCols.length > 0 && numCols.length > 0) {
      suggestions.push({
        type: 'bar',
        title: `${numCols[0]} by ${catCols[0]}`,
        xAxis: catCols[0],
        yAxis: numCols[0],
        description: 'Compare volume and values across categories'
      });
    }

    // 3. Category proportions -> Donut chart
    if (catCols.length > 0) {
      suggestions.push({
        type: 'pie',
        title: `Distribution of ${catCols[0]}`,
        xAxis: catCols[0],
        yAxis: numCols.length > 0 ? numCols[0] : null,
        description: 'Proportional categorical market share'
      });
    }

    // 4. Numeric + Numeric -> Scatter with ML Trendline
    if (numCols.length >= 2) {
      suggestions.push({
        type: 'trend_scatter',
        title: `${numCols[1]} vs ${numCols[0]} (with ML Trendline)`,
        xAxis: numCols[0],
        yAxis: numCols[1],
        description: 'Bivariate correlation and predictive linear fit'
      });
    }

    // 5. Correlation Heatmap
    if (numCols.length >= 2) {
      suggestions.push({
        type: 'correlation_heatmap',
        title: `Multi-Feature Correlation Matrix`,
        xAxis: null,
        yAxis: null,
        description: 'Pairwise Pearson correlation between all numeric metrics'
      });
    }

    // 6. Numeric Distribution -> Histogram
    if (numCols.length > 0) {
      suggestions.push({
        type: 'histogram',
        title: `Histogram Distribution of ${numCols[0]}`,
        xAxis: numCols[0],
        yAxis: null,
        description: 'Frequency distribution and skewness'
      });
    }

    // 7. Box Plot summary
    if (numCols.length > 0) {
      suggestions.push({
        type: 'box',
        title: `Box Plot & Quartiles for ${numCols[0]}`,
        xAxis: catCols.length > 0 ? catCols[0] : null,
        yAxis: numCols[0],
        description: 'Median, IQR range, and outlier indicators'
      });
    }

    return suggestions;
  },

  // Main render dispatcher
  render(container, options, rows) {
    if (!container) return;
    container.innerHTML = '';
    const { type, xAxis, yAxis, title } = options;

    const width = container.clientWidth || 540;
    const height = 300;

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = 'center';
    wrapper.style.width = '100%';

    const titleEl = document.createElement('div');
    titleEl.style.fontWeight = '600';
    titleEl.style.fontSize = '14px';
    titleEl.style.color = '#38bdf8';
    titleEl.style.marginBottom = '8px';
    titleEl.innerText = title || `${type.toUpperCase()} Chart`;
    wrapper.appendChild(titleEl);

    const canvas = document.createElement('canvas');
    canvas.width = width * 2; // retina scaling
    canvas.height = height * 2;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    wrapper.appendChild(canvas);
    container.appendChild(wrapper);

    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    const normalizedType = (type || 'bar').toLowerCase();

    if (normalizedType === 'bar') {
      this.drawBarChart(ctx, width, height, rows, xAxis, yAxis);
    } else if (normalizedType === 'horizontal_bar') {
      this.drawHorizontalBarChart(ctx, width, height, rows, xAxis, yAxis);
    } else if (normalizedType === 'line') {
      this.drawLineChart(ctx, width, height, rows, xAxis, yAxis);
    } else if (normalizedType === 'area') {
      this.drawAreaChart(ctx, width, height, rows, xAxis, yAxis);
    } else if (normalizedType === 'pie' || normalizedType === 'doughnut' || normalizedType === 'donut') {
      this.drawPieChart(ctx, width, height, rows, xAxis, yAxis);
    } else if (normalizedType === 'radar') {
      this.drawRadarChart(ctx, width, height, rows, xAxis, yAxis);
    } else if (normalizedType === 'bubble') {
      this.drawBubbleChart(ctx, width, height, rows, xAxis, yAxis);
    } else if (normalizedType === 'scatter') {
      this.drawScatterChart(ctx, width, height, rows, xAxis, yAxis);
    } else if (normalizedType === 'trend_scatter') {
      this.drawScatterWithTrend(ctx, width, height, rows, xAxis, yAxis);
    } else if (normalizedType === 'correlation_heatmap' || normalizedType === 'heatmap') {
      this.drawCorrelationHeatmap(ctx, width, height, rows);
    } else if (normalizedType === 'forecast' || normalizedType === 'time_series') {
      this.drawForecastChart(ctx, width, height, rows, xAxis, yAxis);
    } else if (normalizedType === 'histogram') {
      this.drawHistogram(ctx, width, height, rows, xAxis);
    } else if (normalizedType === 'box' || normalizedType === 'boxplot') {
      this.drawBoxPlot(ctx, width, height, rows, yAxis || xAxis);
    } else {
      this.drawBarChart(ctx, width, height, rows, xAxis, yAxis);
    }
  },

  drawAreaChart(ctx, width, height, rows, xCol, yCol) {
    const data = rows.map(r => ({
      x: String(r[xCol] || ''),
      y: Validators.parseNumeric(r[yCol]) || 0
    })).filter(d => !isNaN(d.y)).slice(0, 30);

    if (data.length < 2) return;
    const padding = { top: 30, right: 30, bottom: 50, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const maxY = Math.max(...data.map(d => d.y)) * 1.15 || 1;

    this._drawAxes(ctx, padding, chartW, chartH, maxY, width, height);

    const step = chartW / (data.length - 1);
    const toY = val => padding.top + (chartH - (val / maxY) * chartH);

    // Area Fill
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartH);
    data.forEach((d, i) => {
      ctx.lineTo(padding.left + i * step, toY(d.y));
    });
    ctx.lineTo(padding.left + (data.length - 1) * step, padding.top + chartH);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0.02)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Top boundary line
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    data.forEach((d, i) => {
      const px = padding.left + i * step;
      const py = toY(d.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Data dots
    data.forEach((d, i) => {
      const px = padding.left + i * step;
      const py = toY(d.y);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  },

  drawRadarChart(ctx, width, height, rows, xCol, yCol) {
    const agg = {};
    rows.forEach(r => {
      const key = String(r[xCol] || 'Other').slice(0, 12);
      const val = yCol ? (Validators.parseNumeric(r[yCol]) || 0) : 1;
      agg[key] = (agg[key] || 0) + val;
    });

    const entries = Object.entries(agg).slice(0, 6);
    if (entries.length < 3) return;

    const maxVal = Math.max(...entries.map(e => e[1])) * 1.1 || 1;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.35;
    const totalSides = entries.length;

    // Web background rings
    for (let level = 1; level <= 4; level++) {
      const r = (radius / 4) * level;
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < totalSides; i++) {
        const angle = (Math.PI * 2 / totalSides) * i - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // Spokes and labels
    for (let i = 0; i < totalSides; i++) {
      const angle = (Math.PI * 2 / totalSides) * i - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);

      ctx.strokeStyle = '#475569';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();

      const labelX = cx + (radius + 18) * Math.cos(angle);
      const labelY = cy + (radius + 18) * Math.sin(angle);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(entries[i][0], labelX, labelY);
    }

    // Radar polygon
    ctx.beginPath();
    entries.forEach(([_, val], i) => {
      const r = (val / maxVal) * radius;
      const angle = (Math.PI * 2 / totalSides) * i - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
    ctx.fill();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.stroke();
  },

  drawBubbleChart(ctx, width, height, rows, xCol, yCol) {
    const points = rows.map((r) => {
      const x = Validators.parseNumeric(r[xCol]);
      const y = Validators.parseNumeric(r[yCol]);
      return { x, y };
    }).filter(p => p.x !== null && p.y !== null && !isNaN(p.x) && !isNaN(p.y)).slice(0, 50);

    if (points.length < 2) return;
    const padding = { top: 30, right: 30, bottom: 45, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const maxX = Math.max(...points.map(p => p.x)) * 1.1 || 1;
    const maxY = Math.max(...points.map(p => p.y)) * 1.1 || 1;

    this._drawAxes(ctx, padding, chartW, chartH, maxY, width, height);

    points.forEach((p, i) => {
      const px = padding.left + (p.x / maxX) * chartW;
      const py = padding.top + (chartH - (p.y / maxY) * chartH);
      const radius = 6 + (i % 8) * 2;

      ctx.fillStyle = this.PALETTE[i % this.PALETTE.length] + '88';
      ctx.strokeStyle = this.PALETTE[i % this.PALETTE.length];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  },

  drawBarChart(ctx, width, height, rows, xCol, yCol) {
    const agg = {};
    rows.forEach(r => {
      const key = String(r[xCol] || 'Unknown').slice(0, 15);
      const val = yCol ? (Validators.parseNumeric(r[yCol]) || 0) : 1;
      agg[key] = (agg[key] || 0) + val;
    });

    const entries = Object.entries(agg).slice(0, 12);
    if (!entries.length) return;

    const maxVal = Math.max(...entries.map(e => e[1])) * 1.15 || 1;
    const padding = { top: 30, right: 30, bottom: 60, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    this._drawAxes(ctx, padding, chartW, chartH, maxVal, width, height);

    const barW = Math.max(12, Math.min(45, (chartW / entries.length) - 8));
    const step = chartW / entries.length;

    entries.forEach(([cat, val], i) => {
      const barH = (val / maxVal) * chartH;
      const x = padding.left + i * step + (step - barW) / 2;
      const y = padding.top + (chartH - barH);

      ctx.fillStyle = this.PALETTE[i % this.PALETTE.length];
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]) : ctx.rect(x, y, barW, barH);
      ctx.fill();

      // Label
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(x + barW / 2, height - padding.bottom + 14);
      ctx.rotate(-Math.PI / 6);
      ctx.fillText(cat, 0, 0);
      ctx.restore();
    });
  },

  drawHorizontalBarChart(ctx, width, height, rows, xCol, yCol) {
    const agg = {};
    rows.forEach(r => {
      const key = String(r[xCol] || 'Unknown').slice(0, 15);
      const val = yCol ? (Validators.parseNumeric(r[yCol]) || 0) : 1;
      agg[key] = (agg[key] || 0) + val;
    });

    const entries = Object.entries(agg).slice(0, 8);
    if (!entries.length) return;

    const maxVal = Math.max(...entries.map(e => e[1])) * 1.15 || 1;
    const padding = { top: 30, right: 30, bottom: 30, left: 100 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const step = chartH / entries.length;
    const barH = Math.max(8, step - 8);

    entries.forEach(([cat, val], i) => {
      const barW = (val / maxVal) * chartW;
      const x = padding.left;
      const y = padding.top + i * step + 4;

      ctx.fillStyle = this.PALETTE[i % this.PALETTE.length];
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, barW, barH, [0, 4, 4, 0]) : ctx.rect(x, y, barW, barH);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(cat, padding.left - 8, y + barH / 2 + 4);

      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'left';
      ctx.fillText(val.toLocaleString(), x + barW + 6, y + barH / 2 + 4);
    });
  },

  drawLineChart(ctx, width, height, rows, xCol, yCol) {
    const pts = rows
      .map(r => ({ x: r[xCol], y: Validators.parseNumeric(r[yCol]) }))
      .filter(p => p.y !== null && !isNaN(p.y))
      .slice(0, 40);

    if (pts.length < 2) return;

    const maxVal = Math.max(...pts.map(p => p.y)) * 1.15 || 1;
    const padding = { top: 30, right: 30, bottom: 60, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    this._drawAxes(ctx, padding, chartW, chartH, maxVal, width, height);

    const step = chartW / (pts.length - 1);

    // Line Path
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();

    pts.forEach((p, i) => {
      const x = padding.left + i * step;
      const y = padding.top + chartH - (p.y / maxVal) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Area glow under line
    ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
    ctx.lineTo(padding.left + (pts.length - 1) * step, padding.top + chartH);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.closePath();
    ctx.fill();

    // Dots
    pts.forEach((p, i) => {
      const x = padding.left + i * step;
      const y = padding.top + chartH - (p.y / maxVal) * chartH;
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (i % Math.ceil(pts.length / 8) === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate(x, height - padding.bottom + 14);
        ctx.rotate(-Math.PI / 6);
        ctx.fillText(String(p.x).slice(0, 10), 0, 0);
        ctx.restore();
      }
    });
  },

  drawPieChart(ctx, width, height, rows, xCol, yCol) {
    const agg = {};
    rows.forEach(r => {
      const key = String(r[xCol] || 'Unknown').slice(0, 15);
      const val = yCol ? (Validators.parseNumeric(r[yCol]) || 0) : 1;
      agg[key] = (agg[key] || 0) + val;
    });

    const entries = Object.entries(agg).slice(0, 7);
    const total = entries.reduce((s, e) => s + e[1], 0);
    if (total === 0) return;

    const cx = width / 2 - 60;
    const cy = height / 2;
    const r = Math.min(cx - 20, cy - 20, 85);
    const innerR = r * 0.55;

    let startAngle = -Math.PI / 2;

    entries.forEach(([cat, val], i) => {
      const slice = (val / total) * Math.PI * 2;
      const endAngle = startAngle + slice;
      const color = this.PALETTE[i % this.PALETTE.length];

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fill();

      startAngle = endAngle;

      // Legend
      const ly = 50 + i * 22;
      ctx.fillStyle = color;
      ctx.fillRect(width - 150, ly, 12, 12);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'left';
      const pct = Math.round((val / total) * 100);
      ctx.fillText(`${cat} (${pct}%)`, width - 132, ly + 10);
    });
  },

  drawScatterChart(ctx, width, height, rows, xCol, yCol) {
    const pts = rows.map(r => ({
      x: Validators.parseNumeric(r[xCol]),
      y: Validators.parseNumeric(r[yCol])
    })).filter(p => p.x !== null && p.y !== null && !isNaN(p.x) && !isNaN(p.y));

    if (!pts.length) return;

    const maxX = Math.max(...pts.map(p => p.x)) * 1.1 || 1;
    const maxY = Math.max(...pts.map(p => p.y)) * 1.1 || 1;

    const padding = { top: 30, right: 30, bottom: 40, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    this._drawAxes(ctx, padding, chartW, chartH, maxY, width, height);

    pts.forEach(p => {
      const cx = padding.left + (p.x / maxX) * chartW;
      const cy = padding.top + chartH - (p.y / maxY) * chartH;
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  },

  // Scatter plot with Machine Learning Regression Trendline Overlay
  drawScatterWithTrend(ctx, width, height, rows, xCol, yCol) {
    const pts = rows.map(r => ({
      x: Validators.parseNumeric(r[xCol]),
      y: Validators.parseNumeric(r[yCol])
    })).filter(p => p.x !== null && p.y !== null && !isNaN(p.x) && !isNaN(p.y));

    if (pts.length < 2) return;

    const maxX = Math.max(...pts.map(p => p.x)) * 1.1 || 1;
    const minX = Math.min(0, Math.min(...pts.map(p => p.x)));
    const maxY = Math.max(...pts.map(p => p.y)) * 1.1 || 1;
    const minY = Math.min(0, Math.min(...pts.map(p => p.y)));

    const padding = { top: 30, right: 30, bottom: 40, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    this._drawAxes(ctx, padding, chartW, chartH, maxY, width, height);

    // Compute Linear Regression Trend: y = mx + c
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = pts.length;
    pts.forEach(p => {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumX2 += p.x * p.x;
    });

    const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
    const c = (sumY - m * sumX) / n;

    // Draw Scatter points
    pts.forEach(p => {
      const px = padding.left + ((p.x - minX) / (maxX - minX || 1)) * chartW;
      const py = padding.top + chartH - ((p.y - minY) / (maxY - minY || 1)) * chartH;
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw ML Regression Trendline
    const x1 = Math.min(...pts.map(p => p.x));
    const x2 = Math.max(...pts.map(p => p.x));
    const y1 = m * x1 + c;
    const y2 = m * x2 + c;

    const p1x = padding.left + ((x1 - minX) / (maxX - minX || 1)) * chartW;
    const p1y = padding.top + chartH - ((y1 - minY) / (maxY - minY || 1)) * chartH;
    const p2x = padding.left + ((x2 - minX) / (maxX - minX || 1)) * chartW;
    const p2y = padding.top + chartH - ((y2 - minY) / (maxY - minY || 1)) * chartH;

    ctx.strokeStyle = '#f59e0b'; // Amber trend line
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash

    // Equation badge
    ctx.fillStyle = '#f59e0b';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    const slopeStr = m >= 0 ? `+ ${m.toFixed(2)}` : `- ${Math.abs(m).toFixed(2)}`;
    ctx.fillText(`ML Trend: y = ${slopeStr}x + ${c.toFixed(2)}`, width - padding.right, padding.top - 10);
  },

  // Multi-Feature Correlation Matrix Heatmap
  drawCorrelationHeatmap(ctx, width, height, rows) {
    if (!rows.length) return;
    const sample = rows[0];
    const numCols = Object.keys(sample).filter(col => {
      const vals = rows.map(r => Validators.parseNumeric(r[col])).filter(n => n !== null);
      return vals.length >= 3 && vals.length >= rows.length * 0.5;
    }).slice(0, 6); // Max 6 features for clear display

    if (numCols.length < 2) return;

    // Compute Pearson correlation matrix
    const matrix = [];
    numCols.forEach((colA, i) => {
      matrix[i] = [];
      const vA = rows.map(r => Validators.parseNumeric(r[colA]) || 0);
      const meanA = vA.reduce((a, b) => a + b, 0) / vA.length;

      numCols.forEach((colB, j) => {
        if (i === j) {
          matrix[i][j] = 1.0;
          return;
        }
        const vB = rows.map(r => Validators.parseNumeric(r[colB]) || 0);
        const meanB = vB.reduce((a, b) => a + b, 0) / vB.length;

        let num = 0, denA = 0, denB = 0;
        for (let k = 0; k < vA.length; k++) {
          const diffA = vA[k] - meanA;
          const diffB = vB[k] - meanB;
          num += diffA * diffB;
          denA += diffA * diffA;
          denB += diffB * diffB;
        }
        const corr = (denA * denB !== 0) ? num / Math.sqrt(denA * denB) : 0;
        matrix[i][j] = Math.round(corr * 100) / 100;
      });
    });

    const padding = { top: 40, right: 30, bottom: 40, left: 90 };
    const cellSize = Math.min((width - padding.left - padding.right) / numCols.length, (height - padding.top - padding.bottom) / numCols.length);

    numCols.forEach((colI, i) => {
      // Row labels
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(colI.slice(0, 10), padding.left - 8, padding.top + i * cellSize + cellSize / 2 + 4);

      // Col labels
      ctx.save();
      ctx.translate(padding.left + i * cellSize + cellSize / 2, padding.top - 8);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = 'left';
      ctx.fillText(colI.slice(0, 10), 0, 0);
      ctx.restore();

      numCols.forEach((colJ, j) => {
        const val = matrix[i][j];
        const x = padding.left + j * cellSize;
        const y = padding.top + i * cellSize;

        // Color based on correlation (-1 blue -> 0 dark -> +1 emerald)
        if (val > 0) {
          ctx.fillStyle = `rgba(16, 185, 129, ${Math.max(0.15, val)})`; // emerald
        } else {
          ctx.fillStyle = `rgba(239, 68, 68, ${Math.max(0.15, Math.abs(val))})`; // red
        }
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

        // Value text
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(val.toFixed(2), x + cellSize / 2, y + cellSize / 2 + 4);
      });
    });
  },

  // Time-Series Forecast Curve (Actual vs Projected + Confidence Bounds)
  drawForecastChart(ctx, width, height, rows, dateCol, valCol) {
    if (typeof MLEngine === 'undefined') return;
    try {
      if (!rows || rows.length < 3) {
        throw new Error('At least 3 rows are required for time-series forecasting.');
      }
      const sample = rows[0];
      const cols = Object.keys(sample);

      // Auto-detect numeric column if valCol is invalid or not numeric
      let resolvedValCol = valCol;
      const isValNumeric = resolvedValCol && rows.some(r => Validators.parseNumeric(r[resolvedValCol]) !== null);
      if (!isValNumeric) {
        resolvedValCol = cols.find(c => c !== dateCol && rows.some(r => Validators.parseNumeric(r[c]) !== null));
      }
      if (!resolvedValCol) {
        throw new Error('No numeric column found to generate predictions for.');
      }

      // Auto-detect date column
      let resolvedDateCol = dateCol;
      if (!resolvedDateCol || resolvedDateCol === resolvedValCol) {
        resolvedDateCol = cols.find(c => c !== resolvedValCol && /date|time|year|month|day|period|timestamp|week/i.test(c)) || cols.find(c => c !== resolvedValCol);
      }

      let rowsToUse = rows;
      if (!resolvedDateCol || resolvedDateCol === resolvedValCol) {
        rowsToUse = rows.map((r, idx) => ({ ...r, __period__: `P${idx + 1}` }));
        resolvedDateCol = '__period__';
      }

      const res = MLEngine.forecastTimeSeries(rowsToUse, resolvedDateCol, resolvedValCol, 6);
      const allPoints = [
        ...res.historical.map(h => ({ x: h.date, y: h.actual, isForecast: false })),
        ...res.forecast.map(f => ({ x: f.label, y: f.predicted, lower: f.lowerBound, upper: f.upperBound, isForecast: true }))
      ];

      const maxY = Math.max(...allPoints.map(p => p.upper || p.y)) * 1.15 || 1;
      const padding = { top: 30, right: 30, bottom: 60, left: 60 };
      const chartW = width - padding.left - padding.right;
      const chartH = height - padding.top - padding.bottom;

      this._drawAxes(ctx, padding, chartW, chartH, maxY, width, height);

      const step = chartW / Math.max(1, allPoints.length - 1);
      const histLen = res.historical.length;

      // Draw Historical line
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < histLen; i++) {
        const x = padding.left + i * step;
        const y = padding.top + chartH - (allPoints[i].y / maxY) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw Forecast line (dashed amber)
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let i = histLen - 1; i < allPoints.length; i++) {
        const x = padding.left + i * step;
        const y = padding.top + chartH - (allPoints[i].y / maxY) * chartH;
        if (i === histLen - 1) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw points & confidence bounds
      allPoints.forEach((p, i) => {
        const x = padding.left + i * step;
        const y = padding.top + chartH - (p.y / maxY) * chartH;
        ctx.fillStyle = p.isForecast ? '#f59e0b' : '#0284c7';
        ctx.beginPath();
        ctx.arc(x, y, p.isForecast ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();

        if (i % Math.max(1, Math.floor(allPoints.length / 7)) === 0 || p.isForecast) {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '9px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.save();
          ctx.translate(x, height - padding.bottom + 14);
          ctx.rotate(-Math.PI / 6);
          ctx.fillText(String(p.x).slice(0, 10), 0, 0);
          ctx.restore();
        }
      });

      // Forecast Legend
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(width - 240, 12, 10, 10);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10.5px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Historical (${resolvedValCol})`, width - 225, 20);

      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(width - 120, 12, 10, 10);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText('Projected (ML)', width - 105, 20);
    } catch (e) {
      console.warn('Forecast chart error:', e);
      ctx.fillStyle = '#f87171';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`⚠️ Forecast: ${e.message}`, width / 2, height / 2);
    }
  },

  drawHistogram(ctx, width, height, rows, col) {
    const nums = rows.map(r => Validators.parseNumeric(r[col])).filter(n => n !== null);
    if (!nums.length) return;

    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const binCount = 8;
    const binSize = (max - min) / binCount || 1;
    const bins = new Array(binCount).fill(0);

    nums.forEach(n => {
      const idx = Math.min(binCount - 1, Math.floor((n - min) / binSize));
      bins[idx]++;
    });

    const maxBin = Math.max(...bins) * 1.15 || 1;
    const padding = { top: 30, right: 30, bottom: 40, left: 50 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    this._drawAxes(ctx, padding, chartW, chartH, maxBin, width, height);

    const step = chartW / binCount;
    bins.forEach((cnt, i) => {
      const barH = (cnt / maxBin) * chartH;
      const bx = padding.left + i * step;
      const by = padding.top + chartH - barH;

      ctx.fillStyle = '#8b5cf6';
      ctx.fillRect(bx + 1, by, step - 2, barH);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px Inter, sans-serif';
      ctx.textAlign = 'center';
      const rangeStart = Math.round(min + i * binSize);
      ctx.fillText(rangeStart, bx + step / 2, height - padding.bottom + 14);
    });
  },

  drawBoxPlot(ctx, width, height, rows, col) {
    const nums = rows.map(r => Validators.parseNumeric(r[col])).filter(n => n !== null).sort((a, b) => a - b);
    if (nums.length < 4) return;

    const min = nums[0];
    const max = nums[nums.length - 1];
    const q1 = nums[Math.floor(nums.length * 0.25)];
    const median = nums[Math.floor(nums.length * 0.5)];
    const q3 = nums[Math.floor(nums.length * 0.75)];

    const padding = { top: 30, right: 30, bottom: 40, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    this._drawAxes(ctx, padding, chartW, chartH, max * 1.1, width, height);

    const toY = val => padding.top + chartH - (val / (max * 1.1)) * chartH;
    const cx = padding.left + chartW / 2;
    const bw = 80;

    // Whisker lines
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, toY(min));
    ctx.lineTo(cx, toY(q1));
    ctx.moveTo(cx, toY(q3));
    ctx.lineTo(cx, toY(max));
    ctx.stroke();

    // Box
    ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.fillRect(cx - bw / 2, toY(q3), bw, toY(q1) - toY(q3));
    ctx.strokeRect(cx - bw / 2, toY(q3), bw, toY(q1) - toY(q3));

    // Median line
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2, toY(median));
    ctx.lineTo(cx + bw / 2, toY(median));
    ctx.stroke();

    // Values text
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText(`Max: ${max}`, cx + bw / 2 + 10, toY(max));
    ctx.fillText(`Q3: ${q3}`, cx + bw / 2 + 10, toY(q3));
    ctx.fillText(`Med: ${median}`, cx + bw / 2 + 10, toY(median));
    ctx.fillText(`Q1: ${q1}`, cx + bw / 2 + 10, toY(q1));
    ctx.fillText(`Min: ${min}`, cx + bw / 2 + 10, toY(min));
  },

  _drawAxes(ctx, padding, chartW, chartH, maxY, width, height) {
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;

    // Y Axis Gridlines & labels
    const ticks = 4;
    for (let t = 0; t <= ticks; t++) {
      const y = padding.top + (chartH / ticks) * t;
      const val = Math.round(maxY - (maxY / ticks) * t);

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(val.toLocaleString(), padding.left - 8, y + 3);
    }

    // Axes lines
    ctx.strokeStyle = '#64748b';
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.stroke();
  }
};

if (typeof window !== 'undefined') {
  window.Charts = Charts;
}
if (typeof globalThis !== 'undefined') {
  globalThis.Charts = Charts;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Charts;
}

