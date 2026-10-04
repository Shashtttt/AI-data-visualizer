/**
 * utils/api_client.js
 * AetherBI Intelligent Backend Gateway
 * Coordinates communication between Chrome Extension, Local Flask ML, and Render Python Backend.
 * Features automatic capability discovery, cold-start waking detection, and graceful offline fallback.
 */

const AetherAPI = {
  DEFAULT_LOCAL_URL: 'http://127.0.0.1:5000',
  DEFAULT_RENDER_URL: 'https://aetherbi-data-visualizer.onrender.com',

  state: {
    browserEngine: true,
    renderBackend: false,
    localFlask: false,
    gemini: false,
    renderUrl: 'https://aetherbi-data-visualizer.onrender.com',
    localUrl: 'http://127.0.0.1:5000',
    isWakingUp: false
  },

  listeners: [],

  onStatusChange(cb) {
    if (typeof cb === 'function') this.listeners.push(cb);
  },

  notifyListeners() {
    this.listeners.forEach(fn => {
      try { fn(this.state); } catch (_) {}
    });
  },

  async init() {
    // Load configured URLs from local storage
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await new Promise(resolve => {
        chrome.storage.local.get(['customRenderUrl', 'customLocalUrl', 'geminiApiKey'], res => {
          if (res?.customRenderUrl) this.state.renderUrl = res.customRenderUrl.replace(/\/+$/, '');
          if (res?.customLocalUrl) this.state.localUrl = res.customLocalUrl.replace(/\/+$/, '');
          this.state.gemini = !!(res?.geminiApiKey && res.geminiApiKey.trim());
          resolve();
        });
      });
    }

    await this.detectCapabilities();
  },

  async detectCapabilities() {
    // Check Local Flask first (zero latency)
    try {
      const localCtrl = new AbortController();
      const localTimeout = setTimeout(() => localCtrl.abort(), 1200);
      const res = await fetch(`${this.state.localUrl}/api/health`, { signal: localCtrl.signal });
      clearTimeout(localTimeout);
      if (res.ok) {
        const data = await res.json();
        this.state.localFlask = !!data.success;
      } else {
        this.state.localFlask = false;
      }
    } catch (_) {
      this.state.localFlask = false;
    }

    // Check Render Backend with cold-start detection
    try {
      const renderCtrl = new AbortController();
      const renderTimeout = setTimeout(() => renderCtrl.abort(), 2500);
      const res = await fetch(`${this.state.renderUrl}/api/health`, { signal: renderCtrl.signal });
      clearTimeout(renderTimeout);
      if (res.ok) {
        const data = await res.json();
        this.state.renderBackend = !!data.success;
        this.state.isWakingUp = false;
      } else {
        this.state.renderBackend = false;
      }
    } catch (e) {
      this.state.renderBackend = false;
    }

    this.notifyListeners();
    return this.state;
  },

  // Pick the most capable active backend
  getActiveBackendUrl() {
    if (this.state.localFlask) return this.state.localUrl;
    if (this.state.renderBackend) return this.state.renderUrl;
    return null;
  },

  // Unified Request Wrapper with cold-start retry
  async post(endpoint, payload, onStatusUpdate = null) {
    const targetUrl = this.getActiveBackendUrl();
    if (!targetUrl) {
      return { success: false, fallback: true, error: 'No Python backend connected.' };
    }

    const fullUrl = `${targetUrl}/api/${endpoint.replace(/^\/+/, '')}`;
    const maxRetries = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 20000); // 20s timeout for heavy ML

        const res = await fetch(fullUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctrl.signal
        });
        clearTimeout(timeout);

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}: ${res.statusText}`);
        }

        const json = await res.json();
        return json;
      } catch (err) {
        if (targetUrl === this.state.renderUrl && attempt < maxRetries) {
          this.state.isWakingUp = true;
          this.notifyListeners();
          if (onStatusUpdate) onStatusUpdate(`Python backend waking up... Retrying (attempt ${attempt}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, 2000));
        } else {
          return { success: false, fallback: true, error: err.message };
        }
      }
    }

    return { success: false, fallback: true, error: 'Request timed out.' };
  },

  // 1. Table & Dataset Profiling
  async profileDataset(records) {
    return await this.post('table/analyze', { records });
  },

  // 2. Data Cleaning
  async cleanData(records, operations) {
    return await this.post('clean', { records, operations });
  },

  // 3. Statistical Analysis & Correlation
  async getStatistics(records, columns = null) {
    return await this.post('statistics', { records, columns });
  },

  // 4. Group-By Aggregations
  async groupby(records, groupBy, measure, aggregation) {
    return await this.post('groupby', { records, group_by: groupBy, measure, aggregation });
  },

  // 5. ML Model Training
  async trainModel(records, targetCol, featureCols, modelName, isAutoml = false) {
    const endpoint = isAutoml ? 'automl' : 'train';
    return await this.post(endpoint, {
      records,
      target_col: targetCol,
      feature_cols: featureCols,
      model_name: modelName,
      is_automl: isAutoml
    });
  },

  // 6. What-If Simulation
  async whatif(modelId, baseRow, changes) {
    return await this.post('whatif', { model_id: modelId, base_row: baseRow, changes });
  },

  // 7. SHAP Explanation
  async explainModel(modelId) {
    return await this.post('explain', { model_id: modelId });
  },

  // 8. Document Analysis
  async analyzeDocument(text) {
    return await this.post('document/analyze', { text });
  }
};

if (typeof window !== 'undefined') {
  window.AetherAPI = AetherAPI;
}
if (typeof globalThis !== 'undefined') {
  globalThis.AetherAPI = AetherAPI;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AetherAPI;
}

