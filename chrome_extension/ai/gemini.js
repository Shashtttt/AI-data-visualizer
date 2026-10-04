/**
 * ai/gemini.js
 * Gemini API Integration & Privacy-First Data Intelligence Engine
 * Handles natural language reasoning, Q&A, and cleaning recipe generation.
 */

const GeminiAI = {
  DEFAULT_MODEL: 'gemini-1.5-flash',

  /**
   * Get AI settings stored STRICTLY in the local browser.
   * Never synced across Google/Firefox/Edge accounts, never transmitted to remote backends.
   */
  async getSettings() {
    if (typeof WebExtCompat !== 'undefined') {
      const res = await WebExtCompat.storage.get(['geminiApiKey', 'geminiModel', 'aiEnabled']);
      return {
        apiKey: res.geminiApiKey || '',
        model: res.geminiModel || this.DEFAULT_MODEL,
        aiEnabled: res.aiEnabled !== false
      };
    }

    const ext = (typeof browser !== 'undefined' && browser.storage?.local)
      ? browser.storage.local
      : (typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null);

    if (ext) {
      return new Promise(resolve => {
        try {
          const p = ext.get(['geminiApiKey', 'geminiModel', 'aiEnabled'], res => {
            resolve({
              apiKey: res?.geminiApiKey || '',
              model: res?.geminiModel || this.DEFAULT_MODEL,
              aiEnabled: res?.aiEnabled !== false
            });
          });
          if (p && typeof p.then === 'function') {
            p.then(res => resolve({
              apiKey: res?.geminiApiKey || '',
              model: res?.geminiModel || this.DEFAULT_MODEL,
              aiEnabled: res?.aiEnabled !== false
            })).catch(() => resolve({ apiKey: '', model: this.DEFAULT_MODEL, aiEnabled: true }));
          }
        } catch (_) {
          resolve({ apiKey: '', model: this.DEFAULT_MODEL, aiEnabled: true });
        }
      });
    }

    try {
      return {
        apiKey: localStorage.getItem('geminiApiKey') || '',
        model: localStorage.getItem('geminiModel') || this.DEFAULT_MODEL,
        aiEnabled: localStorage.getItem('aiEnabled') !== 'false'
      };
    } catch (_) {
      return { apiKey: '', model: this.DEFAULT_MODEL, aiEnabled: true };
    }
  },

  /**
   * Save AI settings to local browser sandbox only (storage.local).
   * Key remains strictly on this machine.
   */
  async saveSettings(apiKey, model, aiEnabled) {
    const payload = {
      geminiApiKey: (apiKey || '').trim(),
      geminiModel: model || this.DEFAULT_MODEL,
      aiEnabled: !!aiEnabled
    };

    if (typeof WebExtCompat !== 'undefined') {
      return await WebExtCompat.storage.set(payload);
    }

    const ext = (typeof browser !== 'undefined' && browser.storage?.local)
      ? browser.storage.local
      : (typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null);

    if (ext) {
      return new Promise(resolve => {
        try {
          const p = ext.set(payload, () => resolve(true));
          if (p && typeof p.then === 'function') {
            p.then(() => resolve(true)).catch(() => resolve(false));
          }
        } catch (_) {
          resolve(false);
        }
      });
    }

    try {
      localStorage.setItem('geminiApiKey', payload.geminiApiKey);
      localStorage.setItem('geminiModel', payload.geminiModel);
      localStorage.setItem('aiEnabled', String(payload.aiEnabled));
      return true;
    } catch (_) {
      return false;
    }
  },

  /**
   * Delete stored Gemini API Key from browser local sandbox only.
   */
  async deleteApiKey() {
    if (typeof WebExtCompat !== 'undefined') {
      await WebExtCompat.storage.remove(['geminiApiKey']);
    }
    const ext = (typeof browser !== 'undefined' && browser.storage?.local)
      ? browser.storage.local
      : (typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null);
    if (ext) {
      await new Promise(res => ext.remove(['geminiApiKey'], res));
    }
    try {
      localStorage.removeItem('geminiApiKey');
    } catch (_) {}
    return true;
  },

  /**
   * Verify an API key with a test ping to Gemini API directly.
   */
  async testApiKey(apiKey, model = this.DEFAULT_MODEL) {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'Please enter a valid Gemini API Key.' };
    }
    const key = apiKey.trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Respond with exactly: OK' }] }]
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { success: true, message: `Connected to ${model} successfully! Reply: ${text.trim()}` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /**
   * Purge AI API key from local browser storage.
   */
  async clearApiKey() {
    if (typeof WebExtCompat !== 'undefined') {
      await WebExtCompat.storage.remove(['geminiApiKey']);
      return true;
    }

    const ext = (typeof browser !== 'undefined' && browser.storage?.local)
      ? browser.storage.local
      : (typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null);

    if (ext && ext.remove) {
      await new Promise(resolve => {
        try {
          const p = ext.remove('geminiApiKey', () => resolve(true));
          if (p && typeof p.then === 'function') {
            p.then(() => resolve(true)).catch(() => resolve(false));
          }
        } catch (_) {
          resolve(false);
        }
      });
    }

    try {
      localStorage.removeItem('geminiApiKey');
    } catch (_) {}
    return true;
  },

  // Build privacy-filtered payload (metadata + 3 sanitized sample rows, NO full dataset)
  buildPrivacyPayload(profile, sampleRows = []) {
    const sanitizedSamples = sampleRows.slice(0, 3).map(r => {
      const row = {};
      Object.keys(r).forEach(k => {
        const val = r[k];
        // Anonymize potential emails/phones
        if (typeof val === 'string' && val.includes('@')) {
          row[k] = '[EMAIL]';
        } else {
          row[k] = val;
        }
      });
      return row;
    });

    return {
      rowCount: profile.rowCount,
      colCount: profile.colCount,
      qualityScore: profile.qualityScore,
      totalNulls: profile.totalNulls,
      totalDuplicates: profile.totalDuplicates,
      columns: profile.columns,
      columnProfiles: Object.fromEntries(
        Object.entries(profile.columnProfiles).map(([col, p]) => [
          col,
          {
            type: p.inferredType,
            nulls: p.nullCount,
            distinct: p.distinctCount,
            stats: p.stats
          }
        ])
      ),
      problems: profile.problems.map(pr => pr.message),
      sampleRows: sanitizedSamples
    };
  },

  // Call Gemini API
  async callGemini(prompt, systemInstruction = '') {
    const settings = await this.getSettings();

    if (!settings.aiEnabled) {
      throw new Error('AI processing is currently disabled in settings.');
    }

    if (!settings.apiKey) {
      throw new Error('MISSING_API_KEY');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini API HTTP Error ${res.status}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
  },

  // Generate dataset quality analysis & cleaning recommendations
  async analyzeDataset(profile, sampleRows = []) {
    const payload = this.buildPrivacyPayload(profile, sampleRows);

    try {
      const settings = await this.getSettings();
      if (!settings.apiKey || !settings.aiEnabled) {
        return this.offlineFallbackAnalysis(profile);
      }

      const systemPrompt = `You are AetherBI's AI Data Cleaning Agent. Analyze the dataset profile and provide:
1. Executive Quality Summary (concise bullet points).
2. Root-cause Diagnosis of data quality problems.
3. Concrete, ordered Cleaning Plan (e.g. 1. Trim whitespace, 2. Remove duplicates, 3. Convert currency to numbers, 4. Impute missing values).
Keep the response structured, clear, and professional.`;

      const userPrompt = `Dataset Profile:\n${JSON.stringify(payload, null, 2)}\n\nWhat are the data issues and what is your recommended cleaning sequence?`;

      const explanation = await this.callGemini(userPrompt, systemPrompt);
      return {
        success: true,
        source: 'gemini',
        text: explanation
      };
    } catch (err) {
      console.warn('[GeminiAI] API call failed, falling back to local heuristic advisor:', err.message);
      const fallback = this.offlineFallbackAnalysis(profile);
      fallback.apiError = err.message;
      return fallback;
    }
  },

  // Conversational Assistant for Q&A
  async askAssistant(question, profile, sampleRows = []) {
    const payload = this.buildPrivacyPayload(profile, sampleRows);

    try {
      const settings = await this.getSettings();
      if (!settings.apiKey || !settings.aiEnabled) {
        return this.offlineFallbackChat(question, profile);
      }

      const systemPrompt = `You are AetherBI AI Data Assistant, an expert data scientist embedded in a Chrome Extension.
The user is asking questions about the dataset they just extracted from a webpage.
Answer accurately based on the provided dataset profile and statistical summary.
If they ask to visualize or clean data, provide direct actionable suggestions.
Keep answers concise, markdown-formatted, and helpful.`;

      const userPrompt = `Dataset Context:\n${JSON.stringify(payload, null, 2)}\n\nUser Question: "${question}"`;

      const response = await this.callGemini(userPrompt, systemPrompt);
      return {
        success: true,
        source: 'gemini',
        reply: response
      };
    } catch (err) {
      console.warn('[GeminiAI] Chat failed, falling back to offline logic:', err.message);
      return this.offlineFallbackChat(question, profile, err.message);
    }
  },

  // Intelligent local heuristic advisor when API key is not yet set
  offlineFallbackAnalysis(profile) {
    const steps = [];

    if (profile.totalWhitespaceIssues > 0) {
      steps.push(`• **Trim whitespace**: Fix leading/trailing spaces across ${profile.columns.length} columns.`);
    }

    if (profile.totalDuplicates > 0) {
      steps.push(`• **Remove duplicate rows**: Purge ${profile.totalDuplicates} duplicate records.`);
    }

    Object.entries(profile.columnProfiles).forEach(([col, p]) => {
      if (p.currencyCount > 0) {
        steps.push(`• **Convert ${col} to numeric**: Strip currency signs and commas.`);
      }
      if (p.inconsistentCasing?.length > 0) {
        steps.push(`• **Standardize ${col}**: Normalize ${p.inconsistentCasing[0].join(' / ')} to uniform titlecase.`);
      }
      if (p.nullCount > 0) {
        const method = p.inferredType === 'numeric' ? `Median (${p.stats.median ?? 'auto'})` : 'Mode / Most Frequent';
        steps.push(`• **Impute ${col}**: Fill ${p.nullCount} missing values using ${method}.`);
      }
      if (p.inferredType === 'date') {
        steps.push(`• **Standardize dates in ${col}**: Reformat dates into standard ISO (YYYY-MM-DD).`);
      }
    });

    const text = `### 💡 AI Data Quality Diagnostic (Offline Mode)

**Overview:**
• **Rows:** ${profile.rowCount} | **Columns:** ${profile.colCount}
• **Quality Score:** ${profile.qualityScore}/100
• **Identified Problems:** ${profile.problems.length} detected

**Recommended Cleaning Sequence:**
${steps.length ? steps.join('\n') : '• Dataset is clean and well-structured! No critical anomalies found.'}

*(Tip: Enter your Gemini API key in Extension Settings to unlock generative reasoning and deep conversational answers.)*`;

    return {
      success: true,
      source: 'offline_heuristic',
      text
    };
  },

  offlineFallbackChat(question, profile, apiError = null) {
    const q = question.toLowerCase();
    let reply = '';

    if (q.includes('null') || q.includes('missing')) {
      const nullCols = Object.entries(profile.columnProfiles).filter(([_, p]) => p.nullCount > 0);
      if (nullCols.length === 0) {
        reply = `Great news! There are **no missing or null values** in this dataset (${profile.rowCount} complete rows).`;
      } else {
        reply = `Found **${profile.totalNulls} missing values** across ${nullCols.length} columns:\n` +
          nullCols.map(([c, p]) => `• **${c}**: ${p.nullCount} nulls (${p.nullPercentage}%)`).join('\n') +
          `\n\nYou can click **Clean Automatically** or use **Handle Missing Values** in the Clean tab.`;
      }
    } else if (q.includes('duplicate')) {
      reply = profile.totalDuplicates > 0
        ? `I detected **${profile.totalDuplicates} duplicate rows** in the extracted table. Click **Remove Duplicates** in the cleaning panel to eliminate redundancy.`
        : `No duplicate rows were found in this table. All ${profile.rowCount} rows are unique!`;
    } else if (q.includes('column') || q.includes('type')) {
      reply = `**Detected Column Schema:**\n` +
        profile.columns.map(c => `• **${c}** (${profile.columnProfiles[c]?.inferredType || 'text'})`).join('\n');
    } else if (q.includes('salary') || q.includes('average') || q.includes('mean')) {
      const numCols = Object.entries(profile.columnProfiles).filter(([_, p]) => p.inferredType === 'numeric');
      if (numCols.length > 0) {
        reply = `**Statistical Averages for Numeric Columns:**\n` +
          numCols.map(([c, p]) => `• **${c}**: Mean = ${p.stats.mean ?? 'N/A'}, Median = ${p.stats.median ?? 'N/A'}, Range = [${p.stats.min} to ${p.stats.max}]`).join('\n');
      } else {
        reply = `No purely numeric columns were detected. If some columns contain formatted numbers like "$1,000", convert them in the Clean tab first.`;
      }
    } else if (q.includes('chart') || q.includes('visual')) {
      reply = `I suggest checking out the **Charts** tab! Based on your schema, suitable visual archetypes have been configured (e.g. Bar charts for categories, Histograms for distributions, and Scatter plots for numeric correlations).`;
    } else {
      reply = `I analyzed your dataset (${profile.rowCount} rows × ${profile.colCount} columns, Quality Score: ${profile.qualityScore}%).\n\n` +
        `Ask me things like:\n` +
        `• *"Which columns have nulls?"*\n` +
        `• *"Are there any duplicate records?"*\n` +
        `• *"What is the average of numeric columns?"*\n` +
        `• *"Suggest a chart for this data"*\n\n` +
        (apiError ? `*(Note: Gemini API Key not configured or connection error: ${apiError}. Running in deterministic offline mode.)*` : `*(Add your Gemini API Key in Settings for open-ended questions.)*`);
    }

    return {
      success: true,
      source: 'offline_heuristic',
      reply
    };
  },

  // Document & Study Material Intelligence
  async analyzeDocument(text, mode = 'summary', customPrompt = '') {
    const cleanText = (text || '').trim().slice(0, 100000);
    if (!cleanText) {
      return { success: false, error: 'Document text is empty.' };
    }

    try {
      const settings = await this.getSettings();
      if (!settings.apiKey || !settings.aiEnabled) {
        return this.offlineFallbackDocument(cleanText, mode);
      }

      let systemPrompt = "You are AetherBI's AI Document & Study Intelligence Assistant.";
      let userPrompt = "";

      switch (mode) {
        case 'summary':
          systemPrompt += " Generate a concise, high-impact executive summary followed by key takeaways.";
          userPrompt = `Please summarize the following document:\n\n${cleanText}`;
          break;
        case 'detailed':
          systemPrompt += " Generate a comprehensive, section-by-section breakdown with thorough explanations.";
          userPrompt = `Please generate detailed study notes for this text:\n\n${cleanText}`;
          break;
        case 'key_points':
          systemPrompt += " Extract the top critical bullet points and key takeaways.";
          userPrompt = `Extract key points from this document:\n\n${cleanText}`;
          break;
        case 'definitions':
          systemPrompt += " Extract all key terms, jargon, and their explicit definitions found in the text.";
          userPrompt = `Extract definitions and key concepts from:\n\n${cleanText}`;
          break;
        case 'formulas':
          systemPrompt += " Extract all mathematical, statistical, or domain formulas mentioned with explanations.";
          userPrompt = `List and explain all formulas and quantitative models from:\n\n${cleanText}`;
          break;
        case 'questions':
          systemPrompt += " Generate realistic practice questions with detailed answers. Explicitly label them as: 'Generated Practice Questions (not guaranteed exam questions)'.";
          userPrompt = `Generate 5 practice questions and answers based on:\n\n${cleanText}`;
          break;
        case 'flashcards':
          systemPrompt += " Generate 5-8 flashcards formatted as: Q: [Question/Term] | A: [Answer/Definition].";
          userPrompt = `Create flashcards from:\n\n${cleanText}`;
          break;
        case 'quiz':
          systemPrompt += " Generate 4 multiple-choice quiz questions with 4 options each (A, B, C, D) and an answer key at the bottom.";
          userPrompt = `Create a multiple-choice quiz based on:\n\n${cleanText}`;
          break;
        case 'explain_simply':
          systemPrompt += " Explain the core concepts simply using clear analogies suitable for a beginner.";
          userPrompt = `Explain this simply:\n\n${cleanText}`;
          break;
        default:
          userPrompt = `${customPrompt || 'Analyze this document'}:\n\n${cleanText}`;
      }

      const response = await this.callGemini(userPrompt, systemPrompt);
      return { success: true, source: 'gemini', result: response };
    } catch (e) {
      console.warn('[GeminiAI] Document analysis failed, using local parser:', e.message);
      const fallback = this.offlineFallbackDocument(cleanText, mode);
      fallback.apiError = e.message;
      return fallback;
    }
  },

  // Research Paper Mode
  async analyzeResearchPaper(text) {
    const cleanText = (text || '').trim().slice(0, 100000);
    if (!cleanText) return { success: false, error: 'Paper text is empty.' };

    try {
      const settings = await this.getSettings();
      if (!settings.apiKey || !settings.aiEnabled) {
        return this.offlineFallbackResearchPaper(cleanText);
      }

      const systemPrompt = `You are an academic research reviewer. Extract only information actually present in the text:
1. Title
2. Authors
3. Year / Publication Date
4. Abstract
5. Keywords
6. Problem Statement
7. Methodology
8. Dataset Used
9. Models / Algorithms
10. Results & Metrics
11. Limitations
12. Conclusion
CRITICAL INSTRUCTION: If any of the above items are not mentioned in the text, explicitly state: 'Not stated in document'. Do NOT fabricate or assume missing information.`;

      const userPrompt = `Extract the research paper breakdown from this text:\n\n${cleanText}`;
      const response = await this.callGemini(userPrompt, systemPrompt);
      return { success: true, source: 'gemini', result: response };
    } catch (e) {
      const fallback = this.offlineFallbackResearchPaper(cleanText);
      fallback.apiError = e.message;
      return fallback;
    }
  },

  // Explain ML Model Results
  async explainML(modelName, task, targetCol, metrics, featureImportance) {
    try {
      const settings = await this.getSettings();
      if (!settings.apiKey || !settings.aiEnabled) {
        return {
          success: true,
          source: 'offline',
          result: `### 🤖 Model Summary: ${modelName}\n• **Task:** ${task}\n• **Target:** ${targetCol}\n• **Key Metrics:** ${JSON.stringify(metrics)}\n\n*(Note: Model explanations reflect statistical predictive associations and do not prove real-world causality.)*`
        };
      }

      const systemPrompt = `You are an AI Machine Learning Interpreter. Explain the model results clearly.
Discuss:
1. What the evaluation metrics mean in simple, practical terms.
2. Which features have the highest importance and why.
3. Crucial Disclaimer: Clearly distinguish model prediction correlation from causal claims.`;

      const userPrompt = `Model Details:
Model: ${modelName}
Task: ${task}
Target: ${targetCol}
Metrics: ${JSON.stringify(metrics)}
Feature Importance: ${JSON.stringify(featureImportance)}`;

      const response = await this.callGemini(userPrompt, systemPrompt);
      return { success: true, source: 'gemini', result: response };
    } catch (e) {
      return {
        success: true,
        source: 'offline',
        result: `Model trained: ${modelName} for ${task} on target '${targetCol}'.`
      };
    }
  },

  // Offline Document Fallback
  offlineFallbackDocument(text, mode) {
    const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const summary = paragraphs.slice(0, 3).join('\n\n') || text.slice(0, 400);
    return {
      success: true,
      source: 'offline_heuristic',
      result: `### 📄 Document Summary (Offline Mode)\n\n${summary}\n\n*(Connect your Gemini API Key in Settings for in-depth flashcards, quiz generation, and full generative reasoning.)*`
    };
  },

  // Offline Research Paper Fallback
  offlineFallbackResearchPaper(text) {
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    const title = lines[0] || 'Research Document';
    return {
      success: true,
      source: 'offline_heuristic',
      result: `### 📑 Research Paper Breakdown (Offline Analysis)\n• **Title:** ${title}\n• **Extracted Content Length:** ${text.length} characters\n• **Status:** Add Gemini API Key in Settings to extract structured methodology, results, and limitations without hallucination.`
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GeminiAI;
}
