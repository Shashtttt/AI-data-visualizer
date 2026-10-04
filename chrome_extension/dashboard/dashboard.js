/**
 * dashboard/dashboard.js
 * Controller for Full Studio Workspace
 */

document.addEventListener('DOMContentLoaded', async () => {
  // State
  let currentDataset = null;
  let cleaner = null;
  let currentProfile = null;
  let currentPage = 1;
  const PAGE_SIZE = 50;
  let sortColumn = null;
  let sortAsc = true;

  // DOM Elements
  const datasetTitle = document.getElementById('datasetTitle');
  const datasetMeta = document.getElementById('datasetMeta');
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  const btnReset = document.getElementById('btnReset');
  const btnAutoClean = document.getElementById('btnAutoClean');

  // Domain & Report Controls
  const selStudioDomain = document.getElementById('selStudioDomain');
  const studioDomainIcon = document.getElementById('studioDomainIcon');
  const btnStudioReport = document.getElementById('btnStudioReport');
  let studioDomain = 'general';
  let columnTypeOverrides = {};
  let studioAutoMLResults = null;

  // Export Menu
  const btnExportMenu = document.getElementById('btnExportMenu');
  const exportMenuDropdown = document.getElementById('exportMenuDropdown');
  const btnExportCSV = document.getElementById('btnExportCSV');
  const btnExportExcel = document.getElementById('btnExportExcel');
  const btnExportJSON = document.getElementById('btnExportJSON');
  const btnCopyTSV = document.getElementById('btnCopyTSV');

  // Left Panel (Quality & Tools)
  const scoreBadge = document.getElementById('scoreBadge');
  const scoreBarFill = document.getElementById('scoreBarFill');
  const kpiNulls = document.getElementById('kpiNulls');
  const kpiDupes = document.getElementById('kpiDupes');
  const kpiMixed = document.getElementById('kpiMixed');
  const kpiOutliers = document.getElementById('kpiOutliers');
  const issueCountBadge = document.getElementById('issueCountBadge');
  const issueList = document.getElementById('issueList');

  // Operations
  const btnOpDupe = document.getElementById('btnOpDupe');
  const btnOpTrim = document.getElementById('btnOpTrim');
  const selCleanNumCol = document.getElementById('selCleanNumCol');
  const btnOpNum = document.getElementById('btnOpNum');
  const selCleanNullCol = document.getElementById('selCleanNullCol');
  const selCleanNullMethod = document.getElementById('selCleanNullMethod');
  const btnOpNull = document.getElementById('btnOpNull');
  const selCleanCatCol = document.getElementById('selCleanCatCol');
  const btnOpCat = document.getElementById('btnOpCat');
  const calcColName = document.getElementById('calcColName');
  const calcColExpr = document.getElementById('calcColExpr');
  const btnOpCalc = document.getElementById('btnOpCalc');

  // Center Panel Tabs & Views
  const tabViewGrid = document.getElementById('tabViewGrid');
  const tabViewCharts = document.getElementById('tabViewCharts');
  const tabViewML = document.getElementById('tabViewML');
  const tabViewTypes = document.getElementById('tabViewTypes');

  const viewGridContainer = document.getElementById('viewGridContainer');
  const viewChartsContainer = document.getElementById('viewChartsContainer');
  const viewMLContainer = document.getElementById('viewMLContainer');
  const viewTypesContainer = document.getElementById('viewTypesContainer');

  const studioSearch = document.getElementById('studioSearch');
  const chkStudioDiff = document.getElementById('chkStudioDiff');
  const studioTable = document.getElementById('studioTable');
  const pageInfo = document.getElementById('pageInfo');
  const btnStudioPrev = document.getElementById('btnStudioPrev');
  const btnStudioNext = document.getElementById('btnStudioNext');

  // Charts
  const studioChartType = document.getElementById('studioChartType');
  const studioChartX = document.getElementById('studioChartX');
  const studioChartY = document.getElementById('studioChartY');
  const studioChartSuggestions = document.getElementById('studioChartSuggestions');
  const studioChartCanvasContainer = document.getElementById('studioChartCanvasContainer');

  // ML Lab Elements
  const studioMLTask = document.getElementById('studioMLTask');
  const studioMLTargetWrap = document.getElementById('studioMLTargetWrap');
  const studioMLTargetLabel = document.getElementById('studioMLTargetLabel');
  const studioMLTargetCol = document.getElementById('studioMLTargetCol');
  const studioMLExtraWrap = document.getElementById('studioMLExtraWrap');
  const studioMLExtraLabel = document.getElementById('studioMLExtraLabel');
  const studioMLExtraVal = document.getElementById('studioMLExtraVal');
  const studioMLFeaturesWrap = document.getElementById('studioMLFeaturesWrap');
  const studioMLFeatureList = document.getElementById('studioMLFeatureList');
  const btnStudioTrainML = document.getElementById('btnStudioTrainML');
  const studioMLMetricsCard = document.getElementById('studioMLMetricsCard');
  const studioMLBadge = document.getElementById('studioMLBadge');
  const studioMLMetricsGrid = document.getElementById('studioMLMetricsGrid');
  const studioMLExtraVisual = document.getElementById('studioMLExtraVisual');
  const studioMLSimulatorCard = document.getElementById('studioMLSimulatorCard');
  const btnStudioSimulate = document.getElementById('btnStudioSimulate');
  const studioMLSimulatorInputs = document.getElementById('studioMLSimulatorInputs');
  const studioMLSimulationResult = document.getElementById('studioMLSimulationResult');
  const studioMLAppendCard = document.getElementById('studioMLAppendCard');
  const btnStudioAppendPredictions = document.getElementById('btnStudioAppendPredictions');

  // Type Telling Table
  const studioTypeTellingTableBody = document.getElementById('studioTypeTellingTableBody');

  // State for trained studio ML model
  let studioTrainedModel = null;
  let studioTrainedTask = null;
  let studioTrainedTarget = null;
  let studioTrainedFeatures = [];

  // AI Panel
  const btnRunAiDiagnostic = document.getElementById('btnRunAiDiagnostic');
  const aiDiagnosticContent = document.getElementById('aiDiagnosticContent');
  const studioChatMessages = document.getElementById('studioChatMessages');
  const studioChatInput = document.getElementById('studioChatInput');
  const btnStudioSendChat = document.getElementById('btnStudioSendChat');
  const promptChips = document.querySelectorAll('.studio-prompt-chips .chip');

  // Settings
  const btnSettings = document.getElementById('btnSettings');
  const studioSettingsModal = document.getElementById('studioSettingsModal');
  const btnCloseStudioSettings = document.getElementById('btnCloseStudioSettings');
  const studioApiKey = document.getElementById('studioApiKey');
  const btnToggleStudioApiKey = document.getElementById('btnToggleStudioApiKey');
  const btnClearStudioApiKey = document.getElementById('btnClearStudioApiKey');
  const studioModelSelect = document.getElementById('studioModelSelect');
  const studioAiToggle = document.getElementById('studioAiToggle');
  const btnSaveStudioSettings = document.getElementById('btnSaveStudioSettings');
  const studioToast = document.getElementById('studioToast');

  function showToast(msg) {
    studioToast.innerText = msg;
    studioToast.classList.add('show');
    setTimeout(() => studioToast.classList.remove('show'), 2500);
  }

  // 1. Load active dataset from local browser storage (Chrome, Edge, Firefox)
  const loadInitialDataset = async () => {
    let res = null;
    if (typeof WebExtCompat !== 'undefined') {
      res = await WebExtCompat.storage.get(['currentDataset']);
    } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      res = await new Promise(r => chrome.storage.local.get(['currentDataset'], r));
    }

    if (res && res.currentDataset && res.currentDataset.rows && res.currentDataset.rows.length) {
      loadDataset(res.currentDataset);
    } else {
      // Fallback sample data if opened directly without a webpage table
      const sample = createDemoDataset();
      loadDataset(sample);
    }
  };
  loadInitialDataset();

  function createDemoDataset() {
    return {
      name: 'Sample Car Sales & Staff Dataset',
      columns: ['Name', 'Age', 'Salary', 'Department', 'Units_Sold', 'Join_Date'],
      originalRows: [
        { Name: 'Rahul', Age: '23', Salary: '$50,000', Department: 'hr', Units_Sold: '12', Join_Date: '2023-01-15' },
        { Name: 'Amit', Age: null, Salary: '$55,000', Department: 'HR', Units_Sold: '18', Join_Date: '2022-04-10' },
        { Name: 'Priya', Age: '25', Salary: null, Department: 'Human Resources', Units_Sold: '25', Join_Date: '2021-08-01' },
        { Name: 'Rahul', Age: '23', Salary: '$50,000', Department: 'hr', Units_Sold: '12', Join_Date: '2023-01-15' },
        { Name: 'Vikram', Age: '32', Salary: '$78,000', Department: 'Sales', Units_Sold: '45', Join_Date: '2020-03-12' },
        { Name: 'Sneha', Age: '29', Salary: '$68,000', Department: 'Sales', Units_Sold: '38', Join_Date: '2021-11-20' },
        { Name: 'Ankit', Age: '41', Salary: '$120,000', Department: 'IT', Units_Sold: '5', Join_Date: '2019-06-01' },
        { Name: 'Rohan', Age: '28', Salary: '$62,000', Department: 'Information Technology', Units_Sold: '15', Join_Date: '2022-02-14' }
      ]
    };
  }

  function loadDataset(ds) {
    columnTypeOverrides = {};
    currentDataset = ds;
    datasetTitle.innerText = ds.name || 'Webpage Dataset';
    cleaner = new DataCleaner(ds.originalRows || ds.rows, ds.columns);

    if (typeof DomainTaxonomy !== 'undefined') {
      const detected = DomainTaxonomy.detectDomain(ds.columns, ds.rows || ds.originalRows, ds.name);
      studioDomain = detected.domain;
      if (selStudioDomain) selStudioDomain.value = studioDomain;
      if (studioDomainIcon) studioDomainIcon.innerText = detected.info.icon;
    }

    refreshStudio();
  }

  // Domain change handler
  selStudioDomain?.addEventListener('change', () => {
    const val = selStudioDomain.value;
    if (val === 'auto') {
      if (typeof DomainTaxonomy !== 'undefined' && currentDataset) {
        const detected = DomainTaxonomy.detectDomain(currentDataset.columns, currentDataset.rows || currentDataset.originalRows, currentDataset.name);
        studioDomain = detected.domain;
        if (studioDomainIcon) studioDomainIcon.innerText = detected.info.icon;
      }
    } else {
      studioDomain = val;
      if (typeof DomainTaxonomy !== 'undefined') {
        const info = DomainTaxonomy.getDomain(val);
        if (studioDomainIcon) studioDomainIcon.innerText = info.icon;
      }
    }
    if (cleaner && currentProfile) {
      renderChartSuggestions(cleaner.getCurrentData().columns, currentProfile.columnProfiles);
    }
    showToast(`Domain taxonomy updated: ${studioDomain.toUpperCase()}`);
  });

  // Executive Report generation
  btnStudioReport?.addEventListener('click', () => {
    if (!cleaner || !currentDataset) {
      showToast('Load a dataset first!');
      return;
    }
    const { rows, columns } = cleaner.getCurrentData();
    if (typeof ReportGenerator !== 'undefined') {
      ReportGenerator.openPrintableReport({
        datasetName: currentDataset.name,
        rows,
        columns,
        profile: currentProfile,
        domainInfo: typeof DomainTaxonomy !== 'undefined' ? DomainTaxonomy.getDomain(studioDomain) : null,
        autoML: studioAutoMLResults,
        cleaner
      });
      showToast('Opening Executive Report briefing...');
    } else {
      showToast('Report Generator not available');
    }
  });

  // 2. Synchronize Profiler & All Panels
  function refreshStudio() {
    const { rows, columns } = cleaner.getCurrentData();
    datasetMeta.innerText = `${rows.length.toLocaleString()} rows • ${columns.length} columns`;

    currentProfile = DataProfiler.profile(rows, columns, columnTypeOverrides);

    // Score & Progress Bar
    const score = currentProfile.qualityScore;
    scoreBadge.innerText = `${score}/100`;
    scoreBarFill.style.width = `${score}%`;
    if (score >= 80) {
      scoreBadge.style.color = 'var(--accent-green)';
      scoreBarFill.style.background = 'linear-gradient(90deg, #10b981, #38bdf8)';
    } else if (score >= 50) {
      scoreBadge.style.color = 'var(--accent-amber)';
      scoreBarFill.style.background = 'linear-gradient(90deg, #f59e0b, #eab308)';
    } else {
      scoreBadge.style.color = 'var(--accent-red)';
      scoreBarFill.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
    }

    // KPIs
    kpiNulls.innerText = currentProfile.totalNulls.toLocaleString();
    kpiDupes.innerText = currentProfile.totalDuplicates.toLocaleString();
    kpiMixed.innerText = currentProfile.totalMixedTypes;
    kpiOutliers.innerText = currentProfile.totalOutliers;

    // Issue List
    issueCountBadge.innerText = currentProfile.problems.length;
    if (currentProfile.problems.length === 0) {
      issueList.innerHTML = '<div class="empty-state" style="color: var(--accent-green)">✓ No critical issues detected!</div>';
    } else {
      issueList.innerHTML = currentProfile.problems.map(p => `
        <div class="issue-item ${p.severity}">
          <strong>${p.severity.toUpperCase()}</strong>: ${p.message}
        </div>
      `).join('');
    }

    // Populate Toolbox Dropdowns
    populateToolbox(columns, currentProfile.columnProfiles);

    // History controls
    btnUndo.disabled = !cleaner.canUndo();
    btnRedo.disabled = !cleaner.canRedo();

    // Render table
    renderStudioGrid();

    // Chart Axes & suggestions
    populateChartAxes(columns, currentProfile.columnProfiles);
    renderChartSuggestions(columns, currentProfile.columnProfiles);
    renderStudioChart();

    // In-Browser ML & Type Telling
    populateMLStudio(columns, currentProfile.columnProfiles);
    renderTypeTellingInspector(columns);
  }

  function populateToolbox(columns, colProfiles) {
    const opts = columns.map(c => `<option value="${c}">${c} (${colProfiles[c]?.inferredType || 'text'})</option>`).join('');
    selCleanNumCol.innerHTML = opts;
    selCleanNullCol.innerHTML = opts;
    selCleanCatCol.innerHTML = opts;

    // Pick recommended defaults
    const numCol = columns.find(c => colProfiles[c]?.currencyCount > 0 || colProfiles[c]?.inferredType === 'numeric');
    if (numCol) selCleanNumCol.value = numCol;

    const nullCol = columns.find(c => colProfiles[c]?.nullCount > 0);
    if (nullCol) selCleanNullCol.value = nullCol;

    const catCol = columns.find(c => colProfiles[c]?.inconsistentCasing?.length > 0 || colProfiles[c]?.inferredType === 'categorical');
    if (catCol) selCleanCatCol.value = catCol;
  }

  // 3. Grid View Rendering with Sorting, Diff, and Inline Cell Editing
  function renderStudioGrid() {
    if (!cleaner) return;
    const { rows, columns } = cleaner.getCurrentData();
    const origRows = currentDataset.originalRows || rows;
    const showDiff = chkStudioDiff.checked;

    // Filter
    const query = studioSearch.value.trim().toLowerCase();
    let displayRows = query
      ? rows.map((r, origIdx) => ({ row: r, origIdx })).filter(item => columns.some(c => String(item.row[c] || '').toLowerCase().includes(query)))
      : rows.map((r, origIdx) => ({ row: r, origIdx }));

    // Sort
    if (sortColumn) {
      displayRows.sort((a, b) => {
        let vA = a.row[sortColumn];
        let vB = b.row[sortColumn];
        const numA = Validators.parseNumeric(vA);
        const numB = Validators.parseNumeric(vB);

        if (numA !== null && numB !== null) {
          return sortAsc ? numA - numB : numB - numA;
        }
        vA = String(vA || '').toLowerCase();
        vB = String(vB || '').toLowerCase();
        return sortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
      });
    }

    const totalPages = Math.ceil(displayRows.length / PAGE_SIZE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    pageInfo.innerText = `Showing ${displayRows.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}-${Math.min(currentPage * PAGE_SIZE, displayRows.length)} of ${displayRows.length}`;
    btnStudioPrev.disabled = currentPage <= 1;
    btnStudioNext.disabled = currentPage >= totalPages;

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageSlice = displayRows.slice(start, start + PAGE_SIZE);

    // Headers
    const thead = studioTable.querySelector('thead');
    thead.innerHTML = `<tr>
      <th style="width: 50px;">#</th>
      ${columns.map(c => `
        <th data-col="${c}">
          <span>${c}</span>
          ${sortColumn === c ? (sortAsc ? ' ▲' : ' ▼') : ''}
        </th>
      `).join('')}
    </tr>`;

    thead.querySelectorAll('th[data-col]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortColumn === col) {
          sortAsc = !sortAsc;
        } else {
          sortColumn = col;
          sortAsc = true;
        }
        renderStudioGrid();
      });
    });

    // Body
    const tbody = studioTable.querySelector('tbody');
    tbody.innerHTML = '';

    pageSlice.forEach((item, idx) => {
      const r = item.row;
      const globalRowIdx = item.origIdx;
      const tr = document.createElement('tr');

      let rowHtml = `<td style="color: #64748b;">${start + idx + 1}</td>`;

      columns.forEach(col => {
        const val = r[col];
        const origVal = origRows[globalRowIdx] ? origRows[globalRowIdx][col] : undefined;
        const isChanged = showDiff && (val !== origVal);
        const isNull = val === null || val === undefined || val === '';

        const cellClass = `${isChanged ? 'cell-diff' : ''} ${isNull ? 'cell-null' : ''}`;
        const displayVal = isNull ? 'null' : (typeof val === 'number' ? val.toLocaleString() : String(val));

        rowHtml += `<td class="${cellClass}" data-row="${globalRowIdx}" data-col="${col}" title="${isChanged ? `Original: ${origVal}` : 'Double-click to edit'}">${displayVal}</td>`;
      });

      tr.innerHTML = rowHtml;
      tbody.appendChild(tr);
    });

    // Inline cell editing on double click
    tbody.querySelectorAll('td[data-row]').forEach(td => {
      td.addEventListener('dblclick', () => {
        const rIdx = parseInt(td.dataset.row, 10);
        const col = td.dataset.col;
        const currentVal = cleaner.getCurrentData().rows[rIdx][col] ?? '';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentVal;
        input.className = 'form-input form-input-xs';
        input.style.width = '100%';

        td.innerHTML = '';
        td.appendChild(input);
        input.focus();

        const commit = () => {
          const newVal = input.value.trim();
          cleaner.editCell(rIdx, col, newVal === '' ? null : newVal);
          refreshStudio();
        };

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') renderStudioGrid();
        });
      });
    });
  }

  studioSearch.addEventListener('input', () => {
    currentPage = 1;
    renderStudioGrid();
  });

  chkStudioDiff.addEventListener('change', renderStudioGrid);
  btnStudioPrev.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderStudioGrid(); } });
  btnStudioNext.addEventListener('click', () => { currentPage++; renderStudioGrid(); });

  // 4. View Switching (Grid vs Charts vs ML vs Types)
  function switchStudioView(activeTab, activeContainer) {
    [tabViewGrid, tabViewCharts, tabViewML, tabViewTypes].forEach(t => t?.classList.remove('active'));
    [viewGridContainer, viewChartsContainer, viewMLContainer, viewTypesContainer].forEach(c => c?.classList.remove('active'));
    activeTab?.classList.add('active');
    activeContainer?.classList.add('active');
  }

  tabViewGrid.addEventListener('click', () => switchStudioView(tabViewGrid, viewGridContainer));
  tabViewCharts.addEventListener('click', () => {
    switchStudioView(tabViewCharts, viewChartsContainer);
    renderStudioChart();
  });
  tabViewML.addEventListener('click', () => switchStudioView(tabViewML, viewMLContainer));
  tabViewTypes.addEventListener('click', () => switchStudioView(tabViewTypes, viewTypesContainer));

  // 5. Chart Studio
  function populateChartAxes(columns, colProfiles) {
    const opts = columns.map(c => `<option value="${c}">${c}</option>`).join('');
    studioChartX.innerHTML = opts;
    studioChartY.innerHTML = `<option value="">(Count / None)</option>` + opts;

    const numCols = columns.filter(c => colProfiles[c]?.inferredType === 'numeric');
    const catCols = columns.filter(c => colProfiles[c]?.inferredType !== 'numeric');

    if (catCols.length) studioChartX.value = catCols[0];
    if (numCols.length) studioChartY.value = numCols[0];
  }

  function renderChartSuggestions(columns, colProfiles) {
    const suggestions = Charts.suggestCharts(columns, colProfiles);
    studioChartSuggestions.innerHTML = suggestions.map((s, idx) => `
      <button class="chip-btn" data-idx="${idx}">
        ${s.type.toUpperCase()}: ${s.title}
      </button>
    `).join('');

    studioChartSuggestions.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = suggestions[btn.dataset.idx];
        if (s) {
          studioChartType.value = s.type;
          studioChartX.value = s.xAxis;
          studioChartY.value = s.yAxis || '';
          renderStudioChart();
        }
      });
    });
  }

  function renderStudioChart() {
    if (!cleaner) return;
    const { rows } = cleaner.getCurrentData();
    const type = studioChartType.value;
    const xAxis = studioChartX.value;
    const yAxis = studioChartY.value || null;

    Charts.render(studioChartCanvasContainer, {
      type,
      xAxis,
      yAxis,
      title: `${xAxis} ${yAxis ? 'vs ' + yAxis : 'Breakdown'}`
    }, rows);
  }

  studioChartType.addEventListener('change', renderStudioChart);
  studioChartX.addEventListener('change', renderStudioChart);
  studioChartY.addEventListener('change', renderStudioChart);

  // 6. Cleaning Operations
  btnAutoClean.addEventListener('click', () => {
    if (!cleaner || !currentProfile) return;
    cleaner.autoClean(currentProfile);
    refreshStudio();
    showToast('✨ Auto-cleaned dataset: whitespace, duplicates, numbers & nulls handled!');
  });

  btnUndo.addEventListener('click', () => {
    if (cleaner && cleaner.canUndo()) {
      cleaner.undo();
      refreshStudio();
      showToast('Undone');
    }
  });

  btnRedo.addEventListener('click', () => {
    if (cleaner && cleaner.canRedo()) {
      cleaner.redo();
      refreshStudio();
      showToast('Redone');
    }
  });

  btnReset.addEventListener('click', () => {
    if (cleaner && confirm('Reset dataset back to its original state?')) {
      cleaner.reset();
      refreshStudio();
      showToast('Reset to original');
    }
  });

  btnOpDupe.addEventListener('click', () => {
    const res = cleaner.removeDuplicates();
    refreshStudio();
    showToast(`Removed ${res.removedCount} duplicate rows`);
  });

  btnOpTrim.addEventListener('click', () => {
    cleaner.trimWhitespace();
    refreshStudio();
    showToast('Trimmed all whitespace');
  });

  btnOpNum.addEventListener('click', () => {
    const col = selCleanNumCol.value;
    if (col) {
      cleaner.cleanNumericColumn(col);
      refreshStudio();
      showToast(`Cleaned & converted "${col}" to numeric`);
    }
  });

  btnOpNull.addEventListener('click', () => {
    const col = selCleanNullCol.value;
    const method = selCleanNullMethod.value;
    if (col) {
      cleaner.handleMissingValues(col, method);
      refreshStudio();
      showToast(`Imputed nulls in "${col}" using ${method}`);
    }
  });

  btnOpCat.addEventListener('click', () => {
    const col = selCleanCatCol.value;
    if (col) {
      cleaner.normalizeCategories(col);
      refreshStudio();
      showToast(`Normalized categories in "${col}"`);
    }
  });

  btnOpCalc.addEventListener('click', () => {
    const name = calcColName.value.trim();
    const expr = calcColExpr.value.trim();
    if (!name || !expr) {
      alert('Please specify both Column Name and Expression (e.g., Salary * 0.1)');
      return;
    }
    cleaner.addCalculatedColumn(name, expr);
    refreshStudio();
    showToast(`Added calculated column "${name}"`);
    calcColName.value = '';
    calcColExpr.value = '';
  });

  // 6b. Machine Learning Studio & Type Telling Inspector
  function populateMLStudio(columns, colProfiles) {
    if (!studioMLTargetCol || !studioMLFeatureList) return;

    const opts = columns.map(c => `<option value="${c}">${c} (${colProfiles[c]?.inferredType || 'text'})</option>`).join('');
    studioMLTargetCol.innerHTML = opts;

    const numCols = columns.filter(c => colProfiles[c]?.inferredType === 'numeric');
    if (numCols.length) studioMLTargetCol.value = numCols[0];

    studioMLFeatureList.innerHTML = columns.map((c, i) => `
      <label style="display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-main); cursor: pointer;">
        <input type="checkbox" class="chk-studio-ml-feat" value="${c}" ${i !== 0 ? 'checked' : ''}>
        <span>${c}</span>
      </label>
    `).join('');
  }

  function renderTypeTellingInspector(columns) {
    if (!studioTypeTellingTableBody || !cleaner) return;
    const { rows } = cleaner.getCurrentData();

    studioTypeTellingTableBody.innerHTML = columns.map(col => {
      const vals = rows.map(r => r[col]);
      const info = Validators.tellColumnType(vals);

      const targetOptions = [
        { val: 'numeric', label: 'Numeric (Float)' },
        { val: 'integer', label: 'Integer' },
        { val: 'currency', label: 'Currency to Number' },
        { val: 'date', label: 'Standard Date' },
        { val: 'boolean', label: 'Boolean (true/false)' },
        { val: 'string', label: 'Text String' },
        { val: 'category', label: 'Categorical' }
      ].map(o => `<option value="${o.val}" ${o.val === info.recommendedTarget ? 'selected' : ''}>${o.label}</option>`).join('');

      return `
        <tr>
          <td><strong style="color:#fff;">${col}</strong></td>
          <td><span class="score-pill" style="font-size:10px; padding:2px 8px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);">${info.inferredType.toUpperCase()}</span></td>
          <td>
            <div style="display:flex; align-items:center; gap:6px;">
              <div style="flex:1; height:6px; background:var(--bg-tertiary); border-radius:3px; overflow:hidden;">
                <div style="width:${info.confidence}%; height:100%; background:var(--accent-green);"></div>
              </div>
              <span style="font-size:11px; color:var(--text-muted); width:32px;">${info.confidence}%</span>
            </div>
          </td>
          <td style="font-size:11px; color:var(--text-muted); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${info.sampleValues.slice(0, 3).map(v => `<code style="background:var(--bg-darkest); padding:1px 4px; border-radius:3px;">${v}</code>`).join(' ')}
          </td>
          <td>
            <select class="form-select form-select-xs sel-cast-target" data-col="${col}" style="width: 100%;">
              ${targetOptions}
            </select>
          </td>
          <td style="text-align: center;">
            <button class="btn-xs btn-primary btn-cast-col" data-col="${col}">Cast</button>
          </td>
        </tr>
      `;
    }).join('');

    studioTypeTellingTableBody.querySelectorAll('.btn-cast-col').forEach(btn => {
      btn.addEventListener('click', () => {
        const col = btn.dataset.col;
        const sel = studioTypeTellingTableBody.querySelector(`.sel-cast-target[data-col="${col}"]`);
        const targetType = sel ? sel.value : 'string';
        columnTypeOverrides[col] = targetType;
        const res = cleaner.changeColumnType(col, targetType);
        refreshStudio();
        showToast(`✓ Cast column "${col}" to ${targetType} (${res.convertedCount} cells converted)`);
      });
    });
  }

  // ML Task Switcher
  studioMLTask?.addEventListener('change', () => {
    const task = studioMLTask.value;
    if (task === 'regression') {
      studioMLTargetWrap.style.display = 'block';
      studioMLTargetLabel.innerText = 'Target (Y) - Numeric:';
      studioMLFeaturesWrap.style.display = 'block';
      studioMLExtraWrap.style.display = 'none';
    } else if (task === 'classification') {
      studioMLTargetWrap.style.display = 'block';
      studioMLTargetLabel.innerText = 'Target (Y) - Category / Label:';
      studioMLFeaturesWrap.style.display = 'block';
      studioMLExtraWrap.style.display = 'none';
    } else if (task === 'forecasting') {
      studioMLTargetWrap.style.display = 'block';
      studioMLTargetLabel.innerText = 'Time-Series Column:';
      studioMLFeaturesWrap.style.display = 'none';
      studioMLExtraWrap.style.display = 'block';
      studioMLExtraLabel.innerText = 'Forecast Horizon (Steps):';
      studioMLExtraVal.value = '5';
      studioMLExtraVal.min = '1';
      studioMLExtraVal.max = '50';
    } else if (task === 'clustering') {
      studioMLTargetWrap.style.display = 'none';
      studioMLFeaturesWrap.style.display = 'block';
      studioMLExtraWrap.style.display = 'block';
      studioMLExtraLabel.innerText = 'Cluster Count (k):';
      studioMLExtraVal.value = '3';
      studioMLExtraVal.min = '2';
      studioMLExtraVal.max = '10';
    }
  });

  // Train ML Model in Studio
  btnStudioTrainML?.addEventListener('click', () => {
    if (!cleaner) return;
    const task = studioMLTask.value;
    const { rows } = cleaner.getCurrentData();
    if (!rows.length) {
      showToast('Dataset has no rows to train on!');
      return;
    }

    const checkedBoxes = Array.from(document.querySelectorAll('.chk-studio-ml-feat:checked'));
    const featureCols = checkedBoxes.map(b => b.value);
    const targetCol = studioMLTargetCol.value;

    try {
      if (task === 'regression' || task === 'classification') {
        if (!targetCol) throw new Error(`Target column is required for ${task}`);
        const feats = featureCols.filter(c => c !== targetCol);
        if (!feats.length) throw new Error('Choose at least one predictor feature');

        studioAutoMLResults = MLEngine.trainAutoML(rows, targetCol, feats);
        const best = studioAutoMLResults.bestModel;
        studioTrainedModel = best.modelInstance;
        studioTrainedTask = studioAutoMLResults.task;
        studioTrainedTarget = targetCol;
        studioTrainedFeatures = feats;

        studioMLMetricsCard.style.display = 'block';
        studioMLBadge.innerText = `🏆 ${best.modelName} (Best)`;

        if (studioTrainedTask === 'regression') {
          studioMLMetricsGrid.innerHTML = `
            <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
              <div style="font-size:22px; font-weight:800; color:var(--accent-green);">${best.r2}%</div>
              <div style="font-size:11px; color:var(--text-muted);">R² Goodness of Fit</div>
            </div>
            <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
              <div style="font-size:22px; font-weight:800; color:var(--accent-blue);">${best.rmse}</div>
              <div style="font-size:11px; color:var(--text-muted);">Root Mean Square Error</div>
            </div>
            <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
              <div style="font-size:22px; font-weight:800; color:var(--accent-purple);">${best.mae}</div>
              <div style="font-size:11px; color:var(--text-muted);">Mean Absolute Error</div>
            </div>
            <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
              <div style="font-size:22px; font-weight:800; color:#fff;">${rows.length}</div>
              <div style="font-size:11px; color:var(--text-muted);">Samples Trained</div>
            </div>
          `;
        } else {
          studioMLMetricsGrid.innerHTML = `
            <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
              <div style="font-size:22px; font-weight:800; color:var(--accent-green);">${best.accuracy}%</div>
              <div style="font-size:11px; color:var(--text-muted);">Model Accuracy</div>
            </div>
            <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
              <div style="font-size:22px; font-weight:800; color:var(--accent-blue);">${best.precision}%</div>
              <div style="font-size:11px; color:var(--text-muted);">Precision</div>
            </div>
            <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
              <div style="font-size:22px; font-weight:800; color:var(--accent-purple);">${best.f1}%</div>
              <div style="font-size:11px; color:var(--text-muted);">F1 Score</div>
            </div>
            <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
              <div style="font-size:22px; font-weight:800; color:#fff;">${rows.length}</div>
              <div style="font-size:11px; color:var(--text-muted);">Samples Trained</div>
            </div>
          `;
        }

        studioMLExtraVisual.innerHTML = `
          <div style="font-size:12px; font-weight:600; color:var(--text-main); margin-bottom:6px;">AutoML Leaderboard:</div>
          <div style="display:flex; flex-direction:column; gap:4px; margin-bottom:10px;">
            ${studioAutoMLResults.allModels.map((m, idx) => `
              <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-darkest); padding:6px 10px; border-radius:4px; font-size:11px; border:1px solid var(--border-color);">
                <span>${idx === 0 ? '🏆 ' : ''}<strong>${m.modelName}</strong></span>
                <span style="color:var(--accent-green); font-family:monospace;">${m.primaryMetricLabel}: ${m.primaryMetricVal}</span>
              </div>
            `).join('')}
          </div>
          <div style="font-size:12px; font-weight:600; color:var(--text-main); margin-bottom:6px;">Feature Importance (Explainability):</div>
          ${(studioAutoMLResults.featureImportance || []).map(fi => `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; font-size:11px;">
              <span style="width:110px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${fi.feature}</span>
              <div style="flex:1; height:8px; background:var(--bg-primary); border-radius:4px; overflow:hidden;">
                <div style="width:${fi.pct}%; height:100%; background:var(--accent-green);"></div>
              </div>
              <span style="width:40px; text-align:right; font-family:monospace; color:var(--text-muted);">${fi.pct}%</span>
            </div>
          `).join('')}
        `;

        studioMLExtraVisual.innerHTML = `
          <div style="font-size:12px; font-weight:600; color:var(--text-main); margin-bottom:6px;">Standardized Feature Importance:</div>
          ${studioTrainedModel.featureImportance.map(fi => `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; font-size:12px;">
              <span style="width:120px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; color:var(--text-main);">${fi.feature}</span>
              <div style="flex:1; height:8px; background:var(--bg-tertiary); border-radius:4px; overflow:hidden;">
                <div style="width:${Math.min(100, Math.abs(fi.weight) * 35)}%; height:100%; background:${fi.weight >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};"></div>
              </div>
              <span style="width:50px; text-align:right; font-family:monospace; color:var(--text-muted);">${fi.weight.toFixed(2)}</span>
            </div>
          `).join('')}
        `;

      } else if (task === 'classification') {
        if (!targetCol) throw new Error('Target class label is required for classification');
        const feats = featureCols.filter(c => c !== targetCol);
        if (!feats.length) throw new Error('Choose at least one predictor feature');

        studioTrainedModel = MLEngine.trainClassifier(rows, feats, targetCol);
        studioTrainedTask = 'classification';
        studioTrainedTarget = targetCol;
        studioTrainedFeatures = feats;

        studioMLMetricsCard.style.display = 'block';
        studioMLBadge.innerText = 'Classifier (k-NN / Softmax)';
        studioMLMetricsGrid.innerHTML = `
          <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
            <div style="font-size:22px; font-weight:800; color:var(--accent-green);">${studioTrainedModel.accuracy.toFixed(1)}%</div>
            <div style="font-size:11px; color:var(--text-muted);">Validation Accuracy</div>
          </div>
          <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
            <div style="font-size:22px; font-weight:800; color:var(--accent-blue);">${studioTrainedModel.classes.length}</div>
            <div style="font-size:11px; color:var(--text-muted);">Unique Classes</div>
          </div>
          <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
            <div style="font-size:22px; font-weight:800; color:#fff;">${studioTrainedModel.samples}</div>
            <div style="font-size:11px; color:var(--text-muted);">Training Records</div>
          </div>
        `;

        studioMLExtraVisual.innerHTML = `
          <div style="font-size:12px; font-weight:600; color:var(--text-main); margin-bottom:4px;">Target Class Labels:</div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${studioTrainedModel.classes.map(cl => `
              <span class="score-pill" style="font-size:11px; padding:3px 10px; background:rgba(37,99,235,0.2); color:#60a5fa; border:1px solid #2563eb;">${cl}</span>
            `).join('')}
          </div>
        `;

      } else if (task === 'forecasting') {
        if (!targetCol) throw new Error('Time-series value column is required');
        const horizon = parseInt(studioMLExtraVal.value, 10) || 5;

        studioTrainedModel = MLEngine.forecastTimeSeries(rows, targetCol, horizon);
        studioTrainedTask = 'forecasting';
        studioTrainedTarget = targetCol;
        studioTrainedFeatures = [];

        studioMLMetricsCard.style.display = 'block';
        studioMLBadge.innerText = 'Time-Series Forecaster';
        studioMLMetricsGrid.innerHTML = `
          <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
            <div style="font-size:22px; font-weight:800; color:var(--accent-green);">${horizon} steps</div>
            <div style="font-size:11px; color:var(--text-muted);">Extrapolation Horizon</div>
          </div>
          <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
            <div style="font-size:22px; font-weight:800; color:var(--accent-blue);">${studioTrainedModel.trendSlope >= 0 ? '+' : ''}${studioTrainedModel.trendSlope.toFixed(2)}</div>
            <div style="font-size:11px; color:var(--text-muted);">Trend Velocity / Step</div>
          </div>
          <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
            <div style="font-size:22px; font-weight:800; color:#fff;">${studioTrainedModel.historicalCount}</div>
            <div style="font-size:11px; color:var(--text-muted);">Historical Data Points</div>
          </div>
        `;

        studioMLExtraVisual.innerHTML = `
          <div style="font-size:12px; font-weight:600; color:var(--text-main); margin-bottom:6px;">Next Projected Data Points:</div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${studioTrainedModel.forecast.map(f => `
              <div style="background:var(--bg-darkest); border:1px solid var(--accent-green); border-radius:6px; padding:6px 12px; font-size:12px;">
                <strong style="color:var(--accent-green);">+${f.step}:</strong> <span style="color:#fff;">${f.predicted.toFixed(2)}</span>
                <span style="font-size:10px; color:var(--text-muted); margin-left:4px;">(±${f.marginOfError.toFixed(1)})</span>
              </div>
            `).join('')}
          </div>
        `;

      } else if (task === 'clustering') {
        if (!featureCols.length) throw new Error('Select features for cluster segmentation');
        const k = parseInt(studioMLExtraVal.value, 10) || 3;

        studioTrainedModel = MLEngine.kMeansCluster(rows, featureCols, k);
        studioTrainedTask = 'clustering';
        studioTrainedTarget = null;
        studioTrainedFeatures = featureCols;

        studioMLMetricsCard.style.display = 'block';
        studioMLBadge.innerText = `K-Means (${k} Clusters)`;
        studioMLMetricsGrid.innerHTML = `
          <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
            <div style="font-size:22px; font-weight:800; color:var(--accent-green);">${studioTrainedModel.k}</div>
            <div style="font-size:11px; color:var(--text-muted);">Clusters Created</div>
          </div>
          <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
            <div style="font-size:22px; font-weight:800; color:var(--accent-blue);">${studioTrainedModel.iterations}</div>
            <div style="font-size:11px; color:var(--text-muted);">Iterations to Converge</div>
          </div>
          <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; text-align:center;">
            <div style="font-size:22px; font-weight:800; color:var(--accent-purple);">${studioTrainedModel.inertia.toFixed(1)}</div>
            <div style="font-size:11px; color:var(--text-muted);">Cluster Inertia</div>
          </div>
        `;

        studioMLExtraVisual.innerHTML = `
          <div style="font-size:12px; font-weight:600; color:var(--text-main); margin-bottom:6px;">Cluster Segment Proportions:</div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${studioTrainedModel.clusters.map(cl => `
              <div style="background:var(--bg-darkest); border:1px solid var(--accent-blue); border-radius:6px; padding:6px 12px; font-size:12px;">
                <strong style="color:var(--accent-blue);">Cluster ${cl.id + 1}:</strong> <span style="color:#fff;">${cl.size} rows</span>
                <span style="font-size:10px; color:var(--text-muted); margin-left:4px;">(${((cl.size / rows.length) * 100).toFixed(0)}%)</span>
              </div>
            `).join('')}
          </div>
        `;
      }

      // Populate Simulator inputs
      if (task === 'regression' || task === 'classification') {
        studioMLSimulatorCard.style.display = 'block';
        studioMLSimulatorInputs.innerHTML = studioTrainedFeatures.map(f => {
          const sample = rows[0] ? rows[0][f] : '';
          return `
            <div>
              <label style="font-size:11px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:3px;">${f}:</label>
              <input type="text" class="form-input form-input-xs studio-whatif-input" data-col="${f}" value="${sample ?? ''}" placeholder="Value for ${f}" style="width:100%;">
            </div>
          `;
        }).join('');
      } else {
        studioMLSimulatorCard.style.display = 'none';
      }

      studioMLAppendCard.style.display = 'flex';
      showToast('🚀 In-Browser ML Model trained successfully!');
    } catch (err) {
      alert('ML Training error: ' + err.message);
    }
  });

  // What-If Simulation in Studio
  btnStudioSimulate?.addEventListener('click', () => {
    if (!studioTrainedModel) return;
    try {
      const inputs = {};
      const fields = document.querySelectorAll('.studio-whatif-input');
      fields.forEach(f => {
        inputs[f.dataset.col] = f.value;
      });

      const pred = studioTrainedModel.predict(inputs);
      studioMLSimulationResult.style.display = 'block';

      if (studioTrainedTask === 'regression') {
        studioMLSimulationResult.innerHTML = `
          <div style="font-size:12px; color:var(--text-muted);">Simulated Prediction for <strong>${studioTrainedTarget}</strong>:</div>
          <div style="font-size:24px; font-weight:800; color:var(--accent-green); margin-top:3px;">${pred.predicted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        `;
      } else if (studioTrainedTask === 'classification') {
        studioMLSimulationResult.innerHTML = `
          <div style="font-size:12px; color:var(--text-muted);">Simulated Class for <strong>${studioTrainedTarget}</strong>:</div>
          <div style="font-size:24px; font-weight:800; color:var(--accent-green); margin-top:3px;">${pred.predicted}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Confidence: ${(pred.confidence * 100).toFixed(1)}%</div>
        `;
      }
    } catch (err) {
      alert('Simulation error: ' + err.message);
    }
  });

  // Append Predictions Column to Studio Table
  btnStudioAppendPredictions?.addEventListener('click', () => {
    if (!cleaner || !studioTrainedModel) {
      showToast('Train a model first!');
      return;
    }

    try {
      const { rows } = cleaner.getCurrentData();
      let colName = '';
      let values = [];

      if (studioTrainedTask === 'regression') {
        colName = `pred_${studioTrainedTarget}`;
        values = rows.map(r => studioTrainedModel.predict(r).predicted);
      } else if (studioTrainedTask === 'classification') {
        colName = `pred_${studioTrainedTarget}`;
        values = rows.map(r => studioTrainedModel.predict(r).predicted);
      } else if (studioTrainedTask === 'clustering') {
        colName = 'ml_cluster';
        values = studioTrainedModel.assignments.map(a => `Cluster ${a + 1}`);
      } else if (studioTrainedTask === 'forecasting') {
        colName = `forecast_${studioTrainedTarget}`;
        values = studioTrainedModel.forecast.map(f => f.predicted);
      }

      cleaner.appendPredictions(colName, values);
      refreshStudio();
      showToast(`✓ Added predictive column "${colName}" to grid!`);
      switchStudioView(tabViewGrid, viewGridContainer);
    } catch (err) {
      alert('Error saving prediction column: ' + err.message);
    }
  });

  // 7. AI Diagnostic & Assistant Chat
  btnRunAiDiagnostic.addEventListener('click', async () => {
    if (!currentProfile) return;
    aiDiagnosticContent.innerHTML = '<em>⚡ Contacting Gemini AI agent for deep diagnostic...</em>';

    const { rows } = cleaner.getCurrentData();
    const res = await GeminiAI.analyzeDataset(currentProfile, rows.slice(0, 5));
    aiDiagnosticContent.innerHTML = formatMarkdown(res.text);
  });

  async function sendStudioChat(promptText) {
    const text = promptText || studioChatInput.value.trim();
    if (!text || !cleaner) return;

    studioChatInput.value = '';
    appendStudioChat('user', text);

    // 1. Try AI Copilot deterministic command parser first
    if (typeof AICopilot !== 'undefined') {
      const copilotRes = await AICopilot.parseCommand(text, {
        columns: cleaner.getCurrentData().columns,
        rowCount: cleaner.getCurrentData().rows.length
      });

      if (copilotRes.success && copilotRes.command && copilotRes.command.action && copilotRes.command.action !== 'unknown') {
        const cmd = copilotRes.command;
        let executed = false;

        if (cmd.action === 'clean_missing') {
          if (cmd.column) {
            cleaner.handleMissingValues(cmd.column, cmd.param || 'median');
          } else {
            const nullCols = cleaner.getCurrentData().columns.filter(c => currentProfile.columnProfiles[c]?.nullCount > 0);
            nullCols.forEach(c => cleaner.handleMissingValues(c, 'median'));
          }
          refreshStudio();
          appendStudioChat('ai', `⚡ **Studio Copilot Executed:** ${cmd.explanation}\n\nDataset re-profiled with updated quality score: **${currentProfile.qualityScore}/100**.`);
          executed = true;
        } else if (cmd.action === 'remove_duplicates') {
          const res = cleaner.removeDuplicates();
          refreshStudio();
          appendStudioChat('ai', `⚡ **Studio Copilot Executed:** Removed **${res.removedCount}** duplicate rows.`);
          executed = true;
        } else if (cmd.action === 'trim_whitespace') {
          cleaner.trimWhitespace();
          refreshStudio();
          appendStudioChat('ai', `⚡ **Studio Copilot Executed:** Trimmed whitespace across all text cells.`);
          executed = true;
        } else if (cmd.action === 'show_chart') {
          switchStudioView(tabViewCharts, viewChartsContainer);
          if (cmd.param) studioChartType.value = cmd.param;
          if (cmd.column) studioChartX.value = cmd.column;
          if (cmd.yColumn) studioChartY.value = cmd.yColumn;
          renderStudioChart();
          appendStudioChat('ai', `📊 **Studio Copilot Visualizer:** Switched to **${(cmd.param || 'bar').toUpperCase()}** chart for **${cmd.column || 'axes'}**.`);
          executed = true;
        } else if (cmd.action === 'predict_target') {
          switchStudioView(tabViewML, viewMLContainer);
          if (cmd.column) studioMLTargetCol.value = cmd.column;
          appendStudioChat('ai', `🚀 **Studio Copilot ML:** Selected target **${cmd.column || 'target'}**. Click **Train Model** to run AutoML comparison.`);
          executed = true;
        }

        if (executed) return;
      }
    }

    const loadId = 'studio-ai-load-' + Date.now();
    const loadDiv = document.createElement('div');
    loadDiv.id = loadId;
    loadDiv.className = 'studio-chat-bubble ai';
    loadDiv.innerHTML = 'Thinking...';
    studioChatMessages.appendChild(loadDiv);
    studioChatMessages.scrollTop = studioChatMessages.scrollHeight;

    const { rows } = cleaner.getCurrentData();
    const res = await GeminiAI.askAssistant(text, currentProfile, rows.slice(0, 5));

    const el = document.getElementById(loadId);
    if (el) el.remove();

    appendStudioChat('ai', res.reply);
  }

  function appendStudioChat(role, text) {
    const bubble = document.createElement('div');
    bubble.className = `studio-chat-bubble ${role}`;
    bubble.innerHTML = formatMarkdown(text);
    studioChatMessages.appendChild(bubble);
    studioChatMessages.scrollTop = studioChatMessages.scrollHeight;
  }

  function formatMarkdown(str) {
    return str
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  btnStudioSendChat.addEventListener('click', () => sendStudioChat());
  studioChatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendStudioChat(); });
  promptChips.forEach(chip => {
    chip.addEventListener('click', () => sendStudioChat(chip.dataset.prompt));
  });

  // 8. Export Dropdown & File Handlers
  btnExportMenu.addEventListener('click', () => exportMenuDropdown.classList.toggle('hidden'));
  document.addEventListener('click', e => {
    if (!btnExportMenu.contains(e.target) && !exportMenuDropdown.contains(e.target)) {
      exportMenuDropdown.classList.add('hidden');
    }
  });

  btnExportCSV.addEventListener('click', () => {
    const { rows, columns } = cleaner.getCurrentData();
    Exporter.downloadCSV(rows, columns, `${sanitizeName(currentDataset.name)}_cleaned.csv`);
    exportMenuDropdown.classList.add('hidden');
    showToast('Downloaded CSV');
  });

  btnExportExcel.addEventListener('click', () => {
    const { rows, columns } = cleaner.getCurrentData();
    Exporter.downloadExcel(rows, columns, `${sanitizeName(currentDataset.name)}_cleaned.xls`);
    exportMenuDropdown.classList.add('hidden');
    showToast('Downloaded Excel');
  });

  btnExportJSON.addEventListener('click', () => {
    const { rows } = cleaner.getCurrentData();
    Exporter.downloadJSON(rows, `${sanitizeName(currentDataset.name)}_cleaned.json`);
    exportMenuDropdown.classList.add('hidden');
    showToast('Downloaded JSON');
  });

  btnCopyTSV.addEventListener('click', async () => {
    const { rows, columns } = cleaner.getCurrentData();
    await Exporter.copyTableToClipboard(rows, columns);
    exportMenuDropdown.classList.add('hidden');
    showToast('Copied to clipboard');
  });

  function sanitizeName(name) {
    return (name || 'dataset').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  }

  // 9. Settings Modal & Browser-Only Key Persistence
  btnSettings.addEventListener('click', async () => {
    const s = await GeminiAI.getSettings();
    studioApiKey.value = s.apiKey;
    studioModelSelect.value = s.model;
    studioAiToggle.checked = s.aiEnabled;
    studioSettingsModal.classList.remove('hidden');
  });

  btnCloseStudioSettings.addEventListener('click', () => studioSettingsModal.classList.add('hidden'));

  btnToggleStudioApiKey?.addEventListener('click', () => {
    if (studioApiKey.type === 'password') {
      studioApiKey.type = 'text';
      btnToggleStudioApiKey.innerText = '🔒';
    } else {
      studioApiKey.type = 'password';
      btnToggleStudioApiKey.innerText = '👁️';
    }
  });

  btnClearStudioApiKey?.addEventListener('click', async () => {
    await GeminiAI.clearApiKey();
    studioApiKey.value = '';
    showToast('API key deleted from browser storage');
  });

  btnSaveStudioSettings.addEventListener('click', async () => {
    await GeminiAI.saveSettings(
      studioApiKey.value,
      studioModelSelect.value,
      studioAiToggle.checked
    );
    studioSettingsModal.classList.add('hidden');
    showToast('Settings saved to browser storage only');
  });
});
