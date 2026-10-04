/**
 * ai/copilot.js
 * AI Copilot Structured Command Parser & Executor for AetherBI
 * Translates natural language requests into deterministic local operations.
 * Flow: User Prompt -> Gemini / Heuristic Parser -> Validated Structured Command -> Local Execution
 */

const AICopilot = {
  // Supported Structured Operations
  OPERATIONS: [
    'clean_missing',
    'remove_duplicates',
    'trim_whitespace',
    'convert_numeric',
    'remove_outliers',
    'normalize_categories',
    'show_chart',
    'predict_target',
    'filter_data',
    'sort_data',
    'explain_column'
  ],

  /**
   * Parse user intent into a validated structured command
   */
  async parseCommand(userPrompt, datasetMeta) {
    if (!userPrompt || !userPrompt.trim()) {
      return { success: false, error: 'Empty command' };
    }

    const text = userPrompt.trim().toLowerCase();
    const columns = datasetMeta.columns || [];

    // 1. Fast local regex heuristic parsing (instant, zero token usage)
    const localParsed = this._parseLocalHeuristic(text, columns);
    if (localParsed) {
      return { success: true, source: 'local_heuristic', command: localParsed };
    }

    // 2. If Gemini is available, ask Gemini to parse complex phrasing into structured JSON
    try {
      if (typeof GeminiAI !== 'undefined') {
        const settings = await GeminiAI.getSettings();
        if (settings.apiKey && settings.aiEnabled) {
          const systemInstruction = `You are AetherBI Copilot Parser. Given a user query and columns list: ${JSON.stringify(columns)}, output STRICT valid JSON with schema:
{
  "action": "clean_missing" | "remove_duplicates" | "trim_whitespace" | "convert_numeric" | "remove_outliers" | "show_chart" | "predict_target" | "filter_data" | "sort_data" | "unknown",
  "column": "<column_name_or_null>",
  "param": "<method_or_chart_type_or_value>",
  "explanation": "<short_1_sentence_summary>"
}
Never include backticks or markdown, output pure JSON only.`;

          const responseText = await GeminiAI.callGemini(userPrompt, systemInstruction);
          const cleanJsonStr = responseText.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(cleanJsonStr);
          if (parsed && parsed.action && parsed.action !== 'unknown') {
            return { success: true, source: 'gemini', command: parsed };
          }
        }
      }
    } catch (err) {
      console.warn('[AICopilot] Gemini parsing fallback:', err);
    }

    // Fallback: Default safe interpretation
    return {
      success: true,
      source: 'fallback',
      command: {
        action: 'unknown',
        userQuery: userPrompt,
        explanation: 'Could not directly map query to an automated task. You can clean missing values, remove duplicates, create charts, or train ML models.'
      }
    };
  },

  _parseLocalHeuristic(text, columns) {
    // Missing values
    if ((text.includes('missing') || text.includes('null') || text.includes('nan') || text.includes('impute')) &&
        (text.includes('clean') || text.includes('fill') || text.includes('fix') || text.includes('handle') || text.includes('impute') || text.includes('remove') || text.includes('replace'))) {
      const col = columns.find(c => text.includes(c.toLowerCase()));
      const method = text.includes('mean') ? 'mean' : (text.includes('zero') ? 'zero' : (text.includes('mode') ? 'mode' : (text.includes('bfill') ? 'bfill' : (text.includes('ffill') ? 'ffill' : 'median'))));
      return {
        action: 'clean_missing',
        column: col || null,
        param: method,
        explanation: `Impute missing values${col ? ` in column "${col}"` : ' across columns'} using ${method}.`
      };
    }

    // Duplicates
    if (text.includes('duplicate') || text.includes('dedupe') || text.includes('remove duplicate')) {
      return {
        action: 'remove_duplicates',
        column: null,
        param: null,
        explanation: 'Remove all identical and whitespace-variant duplicate rows.'
      };
    }

    // Trim whitespace
    if (text.includes('trim') || text.includes('whitespace') || text.includes('spaces')) {
      return {
        action: 'trim_whitespace',
        column: null,
        param: null,
        explanation: 'Trim leading and trailing whitespace from all text cells.'
      };
    }

    // Outliers
    if (text.includes('outlier') || text.includes('anomaly') || text.includes('winsorize')) {
      const col = columns.find(c => text.includes(c.toLowerCase()));
      return {
        action: 'remove_outliers',
        column: col || null,
        param: 'winsorize',
        explanation: `Treat statistical outliers${col ? ` in "${col}"` : ''} by winsorizing at IQR bounds.`
      };
    }

    // Charts
    if (text.includes('chart') || text.includes('plot') || text.includes('graph') || text.includes('visualize') || text.includes('show ')) {
      let chartType = 'bar';
      if (text.includes('scatter')) chartType = 'scatter';
      else if (text.includes('line')) chartType = 'line';
      else if (text.includes('pie') || text.includes('donut')) chartType = 'pie';
      else if (text.includes('histogram')) chartType = 'histogram';
      else if (text.includes('box')) chartType = 'box';
      else if (text.includes('area')) chartType = 'area';
      else if (text.includes('radar')) chartType = 'radar';

      const foundCols = columns.filter(c => text.includes(c.toLowerCase()));
      return {
        action: 'show_chart',
        column: foundCols[0] || null,
        param: chartType,
        yColumn: foundCols[1] || null,
        explanation: `Generate a ${chartType} visualization${foundCols.length ? ` for ${foundCols.join(' vs ')}` : ''}.`
      };
    }

    // ML Predictions
    if (text.includes('predict') || text.includes('forecast') || text.includes('model') || text.includes('train')) {
      const col = columns.find(c => text.includes(c.toLowerCase()));
      return {
        action: 'predict_target',
        column: col || null,
        param: 'auto',
        explanation: `Train an in-browser predictive model${col ? ` for target "${col}"` : ''}.`
      };
    }

    return null;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AICopilot;
}
