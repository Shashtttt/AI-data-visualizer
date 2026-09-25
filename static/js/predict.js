ï»¿/*                                                            
   predict.js     Multi-Industry Predictive Analytics Wizard
                                                               */

const PredictModule = (() => {
  //    State   
  let state = {
    step: 1,
    totalSteps: 7,
    file: null,
    industry: null,
    problemType: null,
    targetCol: null,
    featureCols: [],
    analysisData: null,
    trainingResult: null,
    baselinePrediction: null,
    whatifScenarios: [],
    avpChart: null,
    fiChart: null,
  };

  const INDUSTRY_ICONS = {
    education: "ð",
    healthcare: "ð¥",
    automobile: "ð",
    finance: "ð¹",
    generic: "ð",
  };

  //    API helpers   
  async function apiFetch(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  //    DOM helpers   
  const $ = (id) => document.getElementById(id);
  function show(id) { const el=$(id); if(el) el.style.display=""; }
  function hide(id) { const el=$(id); if(el) el.style.display="none"; }
  function setText(id, txt) { const el=$(id); if(el) el.textContent=txt; }
  function setHTML(id, html) { const el=$(id); if(el) el.innerHTML=html; }
  function toast(msg, type="info") {
    // Re-use existing toast if present, else simple alert
    if (typeof window.showToast === "function") { window.showToast(msg, type); return; }
    if (typeof window.showNotification === "function") { window.showNotification(msg, type); return; }
    console.log(`[Predict] ${type}: ${msg}`);
  }

  //    Step navigation   
  function goToStep(n) {
    if (n < 1 || n > state.totalSteps) return;
    state.step = n;
    document.querySelectorAll(".predict-step").forEach((el) => el.classList.remove("active"));
    const panel = $(`predict-step-${n}`);
    if (panel) panel.classList.add("active");
    // Update stepper UI
    document.querySelectorAll(".step-item").forEach((el) => {
      const sn = parseInt(el.dataset.step);
      el.classList.remove("active", "done");
      if (sn === n) el.classList.add("active");
      else if (sn < n) el.classList.add("done");
    });
    document.querySelectorAll(".step-connector").forEach((el) => {
      const sn = parseInt(el.dataset.afterStep);
      el.classList.toggle("done", sn < n);
    });
  }

  //    Step 1: Setup   
  function initStep1() {
    // Populate dataset selector
    const sel = $("predict-file-select");
    if (!sel) return;
    sel.innerHTML = '<option value="">  Select a dataset  </option>';
    fetch("/api/datasets/list")
      .then((r) => r.json())
      .then((res) => {
        if (res.datasets) {
          res.datasets.forEach((d) => {
            const o = document.createElement("option");
            o.value = d.name;
            o.textContent = `${d.name} (${d.size_kb || "?"}KB)`;
            sel.appendChild(o);
          });
          if (typeof activeDataset === "string" && activeDataset) {
            sel.value = activeDataset;
          }
        }
      })
      .catch(() => {});
  }

  async function analyzeDataset() {
    const file = $("predict-file-select")?.value;
    if (!file) { toast("Please select a dataset first.", "warning"); return; }
    state.file = file;
    const btn = $("predict-analyze-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Analysing ¦"; }
    try {
      const res = await apiFetch("/api/predict/analyze", { file });
      if (!res.success) throw new Error(res.error || "Analysis failed");
      state.analysisData = res.data;
      state.industry = res.data.industry;
      state.problemType = res.data.problem_type_guess;
      renderStep2();
      goToStep(2);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Analyse Dataset"; }
    }
  }

  //    Step 2: Profile   
  function renderStep2() {
    const d = state.analysisData;
    if (!d) return;

    // Stats
    const statsEl = $("predict-profile-stats");
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="predict-stat-box"><div class="val">${d.shape[0].toLocaleString()}</div><div class="lbl">Rows</div></div>
        <div class="predict-stat-box"><div class="val">${d.shape[1]}</div><div class="lbl">Columns</div></div>
        <div class="predict-stat-box"><div class="val">${d.numeric_cols.length}</div><div class="lbl">Numeric</div></div>
        <div class="predict-stat-box"><div class="val">${d.categorical_cols.length}</div><div class="lbl">Categorical</div></div>`;
    }

    // Industry pill
    const pillEl = $("predict-industry-pill");
    if (pillEl) {
      const icon = INDUSTRY_ICONS[d.industry] || "ð";
      pillEl.innerHTML = `<span class="icon">${icon}</span> ${d.industry.charAt(0).toUpperCase() + d.industry.slice(1)} Detected`;
    }

    // Target selector
    const tSel = $("predict-target-select");
    if (tSel) {
      tSel.innerHTML = '<option value="">  Choose target column  </option>';
      d.target_suggestions.forEach((s) => {
        const o = document.createElement("option");
        o.value = s.col;
        o.textContent = `${s.col}   ${s.reason}`;
        tSel.appendChild(o);
      });
    }

    // Feature multi-select
    const fCont = $("predict-features-container");
    if (fCont) {
      fCont.innerHTML = d.columns.map((c) =>
        `<label><input type="checkbox" name="feature" value="${c}" checked/> ${c}</label>`
      ).join("");
    }

    // Industry override
    const iSel = $("predict-industry-override");
    if (iSel) iSel.value = d.industry;

    // Missing values warning
    const highMissing = Object.entries(d.missing_info)
      .filter(([, v]) => v.pct > 20)
      .map(([k, v]) => `${k} (${v.pct}%)`)
      .join(", ");
    const missingWarn = $("predict-missing-warn");
    if (missingWarn) {
      if (highMissing) {
        missingWarn.textContent = `  ï¸ High missing values in: ${highMissing}   will be auto-imputed.`;
        missingWarn.style.display = "";
      } else {
        missingWarn.style.display = "none";
      }
    }
  }

  //    Step 3: Training   
  async function trainModels() {
    const targetCol = $("predict-target-select")?.value;
    if (!targetCol) { toast("Please select a target column.", "warning"); return; }
    state.targetCol = targetCol;

    // Get selected features (exclude target)
    const checked = document.querySelectorAll('#predict-features-container input[type=checkbox]:checked');
    state.featureCols = Array.from(checked).map(cb => cb.value).filter(v => v !== targetCol);

    if (state.featureCols.length === 0) { toast("Select at least one feature column.", "warning"); return; }

    // Industry override
    const iOverride = $("predict-industry-override")?.value || null;
    if (iOverride) state.industry = iOverride;

    goToStep(3);
    // Show spinner
    const spinner = $("predict-training-spinner");
    if (spinner) spinner.style.display = "flex";
    const results = $("predict-model-results");
    if (results) results.style.display = "none";

    try {
      const res = await apiFetch("/api/predict/train", {
        file: state.file,
        target_col: state.targetCol,
        feature_cols: state.featureCols,
        industry: state.industry,
      });
      if (!res.success) throw new Error(res.error || "Training failed");
      state.trainingResult = res.data;
      renderStep3Results();
      if (spinner) spinner.style.display = "none";
      if (results) results.style.display = "";
    } catch (e) {
      toast(e.message, "error");
      if (spinner) spinner.style.display = "none";
      goToStep(2);
    }
  }

  function renderStep3Results() {
    const d = state.trainingResult;
    if (!d) return;

    const isReg = d.problem_type === "regression";
    const bestModel = d.best_model;

    // Problem type badge
    setText("predict-problem-type-badge", isReg ? "ð Regression" : "ð·ï¸ Classification");

    // Model table
    const tbody = $("predict-model-tbody");
    if (tbody) {
      tbody.innerHTML = "";
      Object.entries(d.eval_results).forEach(([name, m]) => {
        const isBest = name === bestModel;
        const tr = document.createElement("tr");
        if (isBest) tr.className = "best-row";
        if (m.error) {
          tr.innerHTML = `<td>${name}${isBest ? '<span class="model-best-badge"> ­ Best</span>' : ""}</td><td colspan="4" style="color:#ef4444">Error: ${m.error}</td>`;
        } else {
          const cv = `${(m.cv_mean || 0).toFixed(4)} Â± ${(m.cv_std || 0).toFixed(4)}`;
          if (isReg) {
            tr.innerHTML = `
              <td>${name}${isBest ? '<span class="model-best-badge"> ­ Best</span>' : ""}</td>
              <td>${(m.r2 ?? "N/A") !== "N/A" ? m.r2.toFixed(4) : "N/A"}</td>
              <td>${(m.rmse ?? "N/A") !== "N/A" ? m.rmse.toFixed(4) : "N/A"}</td>
              <td>${(m.mae ?? "N/A") !== "N/A" ? m.mae.toFixed(4) : "N/A"}</td>
              <td>${cv}</td>`;
          } else {
            tr.innerHTML = `
              <td>${name}${isBest ? '<span class="model-best-badge"> ­ Best</span>' : ""}</td>
              <td>${(m.accuracy ?? "N/A") !== "N/A" ? m.accuracy.toFixed(4) : "N/A"}</td>
              <td>${(m.f1 ?? "N/A") !== "N/A" ? m.f1.toFixed(4) : "N/A"}</td>
              <td>${m.auc != null ? m.auc.toFixed(4) : "N/A"}</td>
              <td>${cv}</td>`;
          }
        }
        tbody.appendChild(tr);
      });
    }

    // Update header
    const header = $("predict-model-header");
    if (header) {
      if (isReg) {
        header.innerHTML = "<tr><th>Model</th><th>RÂ²</th><th>RMSE</th><th>MAE</th><th>CV Score</th></tr>";
      } else {
        header.innerHTML = "<tr><th>Model</th><th>Accuracy</th><th>F1</th><th>AUC</th><th>CV Score</th></tr>";
      }
    }

    setText("predict-best-model-name", bestModel);
  }

  //    Step 4: Predictions & Feature Importance   
  function renderStep4() {
    const d = state.trainingResult;
    if (!d) return;

    // Actual vs Predicted chart
    renderAvpChart(d.actual_vs_predicted || []);

    // Feature importance bars
    renderFiBars(d.feature_importance || []);

    // SHAP plot
    const shap = $("predict-shap-img");
    if (shap) {
      if (d.shap_plot_base64) {
        shap.src = `data:image/png;base64,${d.shap_plot_base64}`;
        shap.style.display = "";
        $("predict-shap-placeholder")?.style && ($("predict-shap-placeholder").style.display = "none");
      } else {
        shap.style.display = "none";
      }
    }

    // Predictions table
    renderPredTable(d.actual_vs_predicted || []);

    // Compute baseline prediction (mean of predictions)
    const preds = d.actual_vs_predicted || [];
    if (preds.length > 0) {
      const meanPred = preds.reduce((s, r) => s + (r.predicted || 0), 0) / preds.length;
      state.baselinePrediction = meanPred;
    }
  }

  function renderAvpChart(data) {
    const canvas = $("predict-avp-chart");
    if (!canvas || !data.length) return;
    if (state.avpChart) { state.avpChart.destroy(); state.avpChart = null; }

    const sample = data.slice(0, 60);
    const labels = sample.map(r => r.index);
    const actuals = sample.map(r => r.actual);
    const preds = sample.map(r => r.predicted);

    state.avpChart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Actual", data: actuals, borderColor: "#6366f1", backgroundColor: "rgba(99,102,241,.1)", tension: 0.3, pointRadius: 2 },
          { label: "Predicted", data: preds, borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,.1)", tension: 0.3, borderDash: [5,3], pointRadius: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "top" } },
        scales: { x: { display: false }, y: { grid: { color: "#f1f5f9" } } },
      },
    });
  }

  function renderFiBars(fi) {
    const cont = $("predict-fi-bars");
    if (!cont) return;
    const top10 = fi.slice(0, 10);
    if (!top10.length) { cont.innerHTML = "<p style='color:#94a3b8;font-size:13px;'>No feature importance data.</p>"; return; }
    const maxVal = Math.max(...top10.map(([, v]) => v), 0.0001);
    cont.innerHTML = top10.map(([feat, val]) => {
      const pct = (val / maxVal * 100).toFixed(1);
      return `<div class="fi-bar-row">
        <div class="fi-bar-label"><span>${feat}</span><span>${val.toFixed(4)}</span></div>
        <div class="fi-bar-track"><div class="fi-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join("");
  }

  function renderPredTable(data) {
    const tbody = $("predict-pred-tbody");
    if (!tbody) return;
    tbody.innerHTML = data.slice(0, 50).map((r) => {
      const delta = (r.predicted - r.actual).toFixed(4);
      const dc = parseFloat(delta) >= 0 ? "#10b981" : "#ef4444";
      return `<tr>
        <td>${r.index}</td>
        <td>${typeof r.actual === "number" ? r.actual.toFixed(4) : r.actual}</td>
        <td>${typeof r.predicted === "number" ? r.predicted.toFixed(4) : r.predicted}</td>
        <td style="color:${dc};font-weight:700;">${parseFloat(delta) >= 0 ? "+" : ""}${delta}</td>
      </tr>`;
    }).join("");
  }

  //    Step 5: What-If   
  function renderStep5() {
    const d = state.trainingResult;
    if (!d) return;
    const fi = d.feature_importance || [];
    const top10 = fi.slice(0, 10).map(([name]) => name);
    const baseline = d.baseline_row || {};
    const stats = state.analysisData?.numeric_stats || {};

    const grid = $("predict-whatif-grid");
    if (!grid) return;
    grid.innerHTML = top10.map((feat) => {
      const baseVal = parseFloat(baseline[feat] || 0);
      const s = stats[feat];
      const min = s ? s.min : baseVal * 0.5;
      const max = s ? s.max : baseVal * 2;
      const step = s ? ((s.max - s.min) / 100).toFixed(4) : 0.01;
      return `<div class="whatif-slider-card">
        <div class="feat-name">${feat}</div>
        <input type="range" id="wi-slider-${feat.replace(/\W/g,"_")}" 
          min="${min}" max="${max}" step="${step}" value="${baseVal}"
          oninput="this.nextElementSibling.textContent=parseFloat(this.value).toFixed(4)"
          data-feature="${feat}"/>
        <div class="feat-val">${baseVal.toFixed(4)}</div>
      </div>`;
    }).join("");

    // Set baseline prediction display
    if (state.baselinePrediction !== null) {
      const baselineEl = $("predict-wi-baseline");
      if (baselineEl) baselineEl.textContent = parseFloat(state.baselinePrediction).toFixed(4);
    }
  }

  async function runWhatIf() {
    const sliders = document.querySelectorAll('#predict-whatif-grid input[type=range]');
    const changes = {};
    sliders.forEach(sl => {
      changes[sl.dataset.feature] = parseFloat(sl.value);
    });

    const btn = $("predict-wi-run-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Running ¦"; }

    try {
      const res = await apiFetch("/api/predict/whatif", { changes });
      if (!res.success) throw new Error(res.error || "What-If failed");
      const wiData = res.data;
      const pred = wiData.raw_prediction;
      const label = wiData.prediction_label || pred.toFixed(4);
      const baseline = state.baselinePrediction || 0;
      const delta = pred - baseline;

      // Display result
      const resCard = $("predict-wi-result");
      if (resCard) {
        resCard.style.display = "";
        setText("predict-wi-pred-value", label);
        const deltaEl = $("predict-wi-delta");
        if (deltaEl) {
          deltaEl.textContent = `${delta >= 0 ? " ²" : " ¼"} ${Math.abs(delta).toFixed(4)} vs baseline`;
          deltaEl.className = `pred-delta ${delta >= 0 ? "up" : "down"}`;
        }
        // Probabilities for classification
        if (wiData.probabilities) {
          const probEl = $("predict-wi-proba");
          if (probEl) {
            probEl.innerHTML = Object.entries(wiData.probabilities)
              .map(([cls, p]) => `<span style="margin-right:12px;font-size:13px;"><b>${cls}</b>: ${(p*100).toFixed(1)}%</span>`)
              .join("");
            probEl.style.display = "";
          }
        }
      }

      // Save scenario
      const changesSummary = Object.entries(changes)
        .map(([k, v]) => `${k}=${v}`)
        .slice(0, 3).join(", ");
      state.whatifScenarios.push({
        "#": state.whatifScenarios.length + 1,
        Prediction: label,
        Changes: changesSummary,
        Delta: `${delta >= 0 ? "+" : ""}${delta.toFixed(4)}`,
      });
      renderScenarioHistory();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Run Simulation"; }
    }
  }

  function renderScenarioHistory() {
    const cont = $("predict-scenario-history");
    if (!cont) return;
    if (!state.whatifScenarios.length) { cont.innerHTML = ""; return; }
    cont.innerHTML = state.whatifScenarios.map(s => {
      const isUp = !s.Delta.startsWith("-");
      return `<div class="scenario-row">
        <span class="s-id">#${s["#"]}</span>
        <span class="s-pred">${s.Prediction}</span>
        <span class="s-changes">${s.Changes}</span>
        <span class="s-delta ${isUp ? "up" : "down"}">${s.Delta}</span>
      </div>`;
    }).join("");
  }

  //    Step 6: Recommendations   
  function renderStep6() {
    const d = state.trainingResult;
    if (!d) return;
    const recs = d.recommendations || [];
    const cont = $("predict-recs-container");
    if (!cont) return;
    if (!recs.length) { cont.innerHTML = "<p style='color:#94a3b8;'>No recommendations generated.</p>"; return; }
    cont.innerHTML = recs.map(r => `
      <div class="rec-card ${r.priority}">
        <div class="rec-header">
          <span class="rec-priority ${r.priority}">${r.priority}</span>
          <span class="rec-category">${r.category || ""}</span>
        </div>
        <div class="rec-title">${r.title}</div>
        <div class="rec-desc">${r.description}</div>
      </div>
    `).join("");
  }

  //    Step 7: Report   
  async function generateReport() {
    const d = state.trainingResult;
    if (!d) { toast("No training results to report.", "warning"); return; }

    const btn = $("predict-gen-report-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Generating Report ¦"; }

    const reportData = {
      industry: d.industry,
      problem_type: d.problem_type,
      target_col: d.target_col,
      best_model: d.best_model,
      dataset_shape: d.dataset_shape,
      eval_results: d.eval_results,
      feature_importance: d.feature_importance || [],
      shap_plot_base64: d.shap_plot_base64 || null,
      recommendations: d.recommendations || [],
      actual_vs_predicted: d.actual_vs_predicted || [],
      whatif_scenarios: state.whatifScenarios,
    };

    try {
      const res = await apiFetch("/api/predict/report", { report_data: reportData, format: "both" });
      if (!res.success) throw new Error(res.error || "Report generation failed");
      const rData = res.data;

      // Show HTML preview in iframe
      if (rData.html) {
        const iframe = $("predict-report-iframe");
        if (iframe) {
          iframe.srcdoc = rData.html;
        }
      }

      // Store PDF base64 for download
      if (rData.pdf_base64) {
        const dlBtn = $("predict-download-pdf");
        if (dlBtn) {
          dlBtn.onclick = () => {
            const bytes = atob(rData.pdf_base64);
            const arr = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
            const blob = new Blob([arr], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `predictive_report_${d.industry}.pdf`;
            a.click(); URL.revokeObjectURL(url);
          };
        }
      }

      // Download HTML button
      if (rData.html) {
        const dlHtmlBtn = $("predict-download-html");
        if (dlHtmlBtn) {
          dlHtmlBtn.onclick = () => {
            const blob = new Blob([rData.html], { type: "text/html" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `predictive_report_${d.industry}.html`;
            a.click(); URL.revokeObjectURL(url);
          };
        }
      }

      // Open modal
      const modal = $("predict-report-modal");
      if (modal) modal.classList.add("open");
      goToStep(7);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Generate Full Report"; }
    }
  }

  function closeReportModal() {
    const modal = $("predict-report-modal");
    if (modal) modal.classList.remove("open");
  }

  //    CSV Export   
  function exportPredictionsCsv() {
    const d = state.trainingResult?.actual_vs_predicted || [];
    if (!d.length) { toast("No predictions to export.", "warning"); return; }
    const headers = ["Index", "Actual", "Predicted", "Delta"];
    const rows = d.map(r => [r.index, r.actual, r.predicted, (r.predicted - r.actual).toFixed(4)]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "predictions.csv";
    a.click(); URL.revokeObjectURL(url);
  }

  //    Select / deselect all features   
  function toggleAllFeatures(checked) {
    document.querySelectorAll('#predict-features-container input[type=checkbox]')
      .forEach(cb => cb.checked = checked);
  }

  //    Public API   
  return {
    init() {
      initStep1();
      goToStep(1);
    },
    goToStep,
    analyzeDataset,
    trainModels,
    renderStep4,
    renderStep5,
    renderStep6,
    runWhatIf,
    generateReport,
    closeReportModal,
    exportPredictionsCsv,
    toggleAllFeatures,
  };
})();

// Expose to window for onclick handlers
window.PredictModule = PredictModule;

// Auto-init when the Predict tab becomes active
document.addEventListener("DOMContentLoaded", () => {
  // Try to hook into existing tab system
  const predictTab = document.querySelector('[data-tab="predict"]') || document.getElementById("predict-tab-btn");
  if (predictTab) {
    predictTab.addEventListener("click", () => {
      PredictModule.init();
    });
  }
});

