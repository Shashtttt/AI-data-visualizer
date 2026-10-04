/**
 * cleaning/cleaner.js
 * Deterministic Transformation Engine with History Stack (Undo / Redo / Reset)
 */

// Safely resolve Validators across browser script tags and module environments
var _Validators = (typeof Validators !== 'undefined' && Validators)
  ? Validators
  : (typeof globalThis !== 'undefined' && globalThis.Validators)
    ? globalThis.Validators
    : (typeof window !== 'undefined' && window.Validators)
      ? window.Validators
      : (typeof require !== 'undefined' ? require('./validators.js') : null);

class DataCleaner {
  constructor(initialRows = [], initialColumns = []) {
    this.originalRows = JSON.parse(JSON.stringify(initialRows));
    this.originalColumns = [...initialColumns];

    // History stack for Undo / Redo
    this.history = [];
    this.historyIndex = -1;
    this.operationLog = [];

    // Push initial snapshot
    this._pushSnapshot(this.originalRows, this.originalColumns, 'Initial Extracted Dataset');
  }

  _pushSnapshot(rows, columns, description) {
    // Truncate redo tree if we made changes after an undo
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    const snapshot = {
      rows: JSON.parse(JSON.stringify(rows)),
      columns: [...columns],
      description,
      timestamp: new Date().toLocaleTimeString()
    };

    this.history.push(snapshot);
    this.historyIndex++;
    this.operationLog.push(description);
  }

  getCurrentData() {
    if (this.historyIndex < 0 || !this.history[this.historyIndex]) {
      return { rows: [], columns: [] };
    }
    return {
      rows: this.history[this.historyIndex].rows,
      columns: this.history[this.historyIndex].columns
    };
  }

  getOperationLog() {
    return this.operationLog || [];
  }

  canUndo() {
    return this.historyIndex > 0;
  }

  canRedo() {
    return this.historyIndex < this.history.length - 1;
  }

  undo() {
    if (this.canUndo()) {
      this.historyIndex--;
      return this.getCurrentData();
    }
    return null;
  }

  redo() {
    if (this.canRedo()) {
      this.historyIndex++;
      return this.getCurrentData();
    }
    return null;
  }

  reset() {
    this._pushSnapshot(this.originalRows, this.originalColumns, 'Reset to Original Dataset');
    return this.getCurrentData();
  }

  // 1. Remove duplicate rows
  removeDuplicates(columnsToCompare = null) {
    const { rows, columns } = this.getCurrentData();
    const cols = columnsToCompare || columns;
    const seen = new Set();
    const cleanRows = [];
    let removedCount = 0;

    rows.forEach(r => {
      const hash = cols.map(c => String(r[c] !== null && r[c] !== undefined ? r[c] : '').trim().toLowerCase()).join('|||');
      if (seen.has(hash)) {
        removedCount++;
      } else {
        seen.add(hash);
        cleanRows.push({ ...r });
      }
    });

    this._pushSnapshot(cleanRows, columns, `Removed ${removedCount} duplicate rows`);
    return { removedCount, data: this.getCurrentData() };
  }

  // 2. Trim whitespace on all or selected columns
  trimWhitespace(targetColumns = null) {
    const { rows, columns } = this.getCurrentData();
    const cols = targetColumns || columns;
    let trimmedCount = 0;

    const newRows = rows.map(r => {
      const newRow = { ...r };
      cols.forEach(c => {
        if (typeof newRow[c] === 'string') {
          const trimmed = newRow[c].trim();
          if (trimmed !== newRow[c]) {
            trimmedCount++;
            newRow[c] = trimmed;
          }
        }
      });
      return newRow;
    });

    this._pushSnapshot(newRows, columns, `Trimmed whitespace across ${cols.length} columns`);
    return { trimmedCount, data: this.getCurrentData() };
  }

  // 3. Convert numbers, strip currency symbols and commas
  cleanNumericColumn(column) {
    const { rows, columns } = this.getCurrentData();
    let convertedCount = 0;

    const newRows = rows.map(r => {
      const newRow = { ...r };
      const raw = newRow[column];
      if (raw !== null && raw !== undefined && raw !== '') {
        const num = _Validators.parseNumeric(raw);
        if (num !== null) {
          newRow[column] = num;
          convertedCount++;
        }
      }
      return newRow;
    });

    this._pushSnapshot(newRows, columns, `Cleaned & converted "${column}" to numeric format`);
    return { convertedCount, data: this.getCurrentData() };
  }

  // 4. Standardize text casing
  standardizeText(column, casing = 'title') {
    const { rows, columns } = this.getCurrentData();
    const newRows = rows.map(r => {
      const newRow = { ...r };
      const val = newRow[column];
      if (typeof val === 'string' && val.trim() !== '') {
        const str = val.trim();
        if (casing === 'upper') {
          newRow[column] = str.toUpperCase();
        } else if (casing === 'lower') {
          newRow[column] = str.toLowerCase();
        } else if (casing === 'title') {
          newRow[column] = str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        }
      }
      return newRow;
    });

    this._pushSnapshot(newRows, columns, `Standardized text casing in "${column}" (${casing})`);
    return this.getCurrentData();
  }

  // 5. Normalize categories (e.g. "hr", "HR", "Human Resources" -> "HR")
  normalizeCategories(column, mappings = null) {
    const { rows, columns } = this.getCurrentData();
    let mapToUse = mappings;

    if (!mapToUse) {
      // Auto-cluster common abbreviations and casing
      mapToUse = {};
      const counts = {};
      rows.forEach(r => {
        const v = r[column];
        if (v && typeof v === 'string') {
          const trimmed = v.trim();
          counts[trimmed] = (counts[trimmed] || 0) + 1;
        }
      });

      // Group by lowercase
      const lowerGroups = {};
      Object.keys(counts).forEach(k => {
        const l = k.toLowerCase();
        if (!lowerGroups[l]) lowerGroups[l] = [];
        lowerGroups[l].push({ val: k, count: counts[k] });
      });

      Object.entries(lowerGroups).forEach(([lower, list]) => {
        // Pick most frequent
        list.sort((a, b) => b.count - a.count);
        const best = list[0].val;
        list.forEach(item => {
          if (item.val !== best) {
            mapToUse[item.val] = best;
          }
        });
      });

      // Special domain normalization
      if (/department|dept|team/i.test(column)) {
        rows.forEach(r => {
          const v = String(r[column] || '').trim();
          if (/^human\s*resources$/i.test(v) || /^hr$/i.test(v)) {
            mapToUse[v] = 'HR';
          }
          if (/^information\s*technology$/i.test(v) || /^it$/i.test(v)) {
            mapToUse[v] = 'IT';
          }
        });
      }
    }

    const newRows = rows.map(r => {
      const newRow = { ...r };
      const v = newRow[column];
      if (v !== null && v !== undefined && mapToUse[v]) {
        newRow[column] = mapToUse[v];
      }
      return newRow;
    });

    this._pushSnapshot(newRows, columns, `Normalized inconsistent categories in "${column}"`);
    return this.getCurrentData();
  }

  // 6. Handle missing values
  handleMissingValues(column, method = 'median', customValue = '') {
    const { rows, columns } = this.getCurrentData();

    // Calculate replacement value
    let replacement = null;
    const nonNulls = rows.map(r => r[column]).filter(v => v !== null && v !== undefined && v !== '');

    if (method === 'drop_row') {
      const cleanRows = rows.filter(r => r[column] !== null && r[column] !== undefined && r[column] !== '');
      const dropped = rows.length - cleanRows.length;
      this._pushSnapshot(cleanRows, columns, `Dropped ${dropped} rows with missing "${column}"`);
      return this.getCurrentData();
    }

    if (method === 'zero') {
      replacement = 0;
    } else if (method === 'unknown') {
      replacement = 'Unknown';
    } else if (method === 'custom') {
      replacement = customValue;
    } else if (method === 'mean' || method === 'median') {
      const nums = nonNulls.map(v => _Validators.parseNumeric(v)).filter(n => n !== null);
      if (nums.length > 0) {
        if (method === 'mean') {
          const sum = nums.reduce((a, b) => a + b, 0);
          replacement = +(sum / nums.length).toFixed(2);
        } else {
          nums.sort((a, b) => a - b);
          const mid = Math.floor(nums.length / 2);
          replacement = nums.length % 2 !== 0 ? nums[mid] : +((nums[mid - 1] + nums[mid]) / 2).toFixed(2);
        }
      }
    } else if (method === 'mode') {
      const freq = {};
      nonNulls.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
      let maxF = 0;
      Object.keys(freq).forEach(k => {
        if (freq[k] > maxF) {
          maxF = freq[k];
          replacement = k;
        }
      });
    }

    let filledCount = 0;
    let lastValid = null;

    if (method === 'bfill') {
      // Backward fill traverses from the end
      const newRows = [...rows].map(r => ({ ...r }));
      let nextValid = null;
      for (let i = newRows.length - 1; i >= 0; i--) {
        const val = newRows[i][column];
        const isMissing = (val === null || val === undefined || val === '' || String(val).toLowerCase() === 'null' || String(val).toLowerCase() === 'n/a');
        if (isMissing) {
          newRows[i][column] = nextValid !== null ? nextValid : (replacement !== null ? replacement : 'Unknown');
          filledCount++;
        } else {
          nextValid = val;
        }
      }
      this._pushSnapshot(newRows, columns, `Backward filled ${filledCount} missing values in "${column}"`);
      return this.getCurrentData();
    }

    const newRows = rows.map(r => {
      const newRow = { ...r };
      const val = newRow[column];
      const isMissing = (val === null || val === undefined || val === '' || String(val).toLowerCase() === 'null' || String(val).toLowerCase() === 'n/a');

      if (isMissing) {
        if (method === 'ffill') {
          newRow[column] = lastValid !== null ? lastValid : (replacement !== null ? replacement : 'Unknown');
        } else {
          newRow[column] = replacement;
        }
        filledCount++;
      } else {
        lastValid = val;
      }
      return newRow;
    });

    this._pushSnapshot(newRows, columns, `Imputed ${filledCount} missing values in "${column}" using ${method} (${replacement})`);
    return this.getCurrentData();
  }

  // 7. Format dates to ISO (YYYY-MM-DD)
  standardizeDates(column) {
    const { rows, columns } = this.getCurrentData();
    let count = 0;

    const newRows = rows.map(r => {
      const newRow = { ...r };
      const v = newRow[column];
      if (v && _Validators.isValidDate(String(v))) {
        try {
          const d = new Date(v);
          if (!isNaN(d.getTime())) {
            newRow[column] = d.toISOString().split('T')[0];
            count++;
          }
        } catch (e) {}
      }
      return newRow;
    });

    this._pushSnapshot(newRows, columns, `Standardized dates in "${column}" to ISO format (YYYY-MM-DD)`);
    return this.getCurrentData();
  }

  // 8. Handle statistical outliers (IQR or Z-Score Method)
  handleOutliers(column, treatment = 'winsorize', method = 'iqr') {
    const { rows, columns } = this.getCurrentData();
    const nums = rows.map(r => _Validators.parseNumeric(r[column])).filter(n => n !== null).sort((a, b) => a - b);
    if (nums.length < 4) return this.getCurrentData();

    let lower, upper;
    if (method === 'zscore') {
      const sum = nums.reduce((a, b) => a + b, 0);
      const mean = sum / nums.length;
      const variance = nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / nums.length;
      const std = Math.sqrt(variance) || 1;
      lower = mean - 3 * std;
      upper = mean + 3 * std;
    } else {
      const q1 = nums[Math.floor(nums.length * 0.25)];
      const q3 = nums[Math.floor(nums.length * 0.75)];
      const iqr = q3 - q1;
      lower = q1 - 1.5 * iqr;
      upper = q3 + 1.5 * iqr;
    }

    let modifiedCount = 0;
    let cleanRows = [];

    if (treatment === 'drop') {
      cleanRows = rows.filter(r => {
        const num = _Validators.parseNumeric(r[column]);
        return num === null || (num >= lower && num <= upper);
      });
      modifiedCount = rows.length - cleanRows.length;
    } else {
      cleanRows = rows.map(r => {
        const newRow = { ...r };
        const num = _Validators.parseNumeric(newRow[column]);
        if (num !== null) {
          if (num < lower) {
            newRow[column] = treatment === 'winsorize' ? lower : null;
            modifiedCount++;
          } else if (num > upper) {
            newRow[column] = treatment === 'winsorize' ? upper : null;
            modifiedCount++;
          }
        }
        return newRow;
      });
    }

    this._pushSnapshot(cleanRows, columns, `Handled outliers in "${column}" via ${method.toUpperCase()} (${treatment} ${modifiedCount} rows)`);
    return this.getCurrentData();
  }

  // 9. Inline cell edit
  editCell(rowIndex, column, newValue) {
    const { rows, columns } = this.getCurrentData();
    if (rowIndex < 0 || rowIndex >= rows.length || !columns.includes(column)) return null;

    const newRows = rows.map((r, idx) => {
      if (idx === rowIndex) {
        return { ...r, [column]: newValue };
      }
      return { ...r };
    });

    this._pushSnapshot(newRows, columns, `Edited cell [Row ${rowIndex + 1}, Col "${column}"]`);
    return this.getCurrentData();
  }

  // 10. Column operations (Rename, Drop, Reorder, Add calculated)
  renameColumn(oldName, newName) {
    const { rows, columns } = this.getCurrentData();
    if (!columns.includes(oldName) || !newName.trim()) return null;

    const cleanNewName = newName.trim();
    const newCols = columns.map(c => c === oldName ? cleanNewName : c);
    const newRows = rows.map(r => {
      const obj = {};
      Object.keys(r).forEach(k => {
        obj[k === oldName ? cleanNewName : k] = r[k];
      });
      return obj;
    });

    this._pushSnapshot(newRows, newCols, `Renamed column "${oldName}" to "${cleanNewName}"`);
    return this.getCurrentData();
  }

  dropColumn(colName) {
    const { rows, columns } = this.getCurrentData();
    if (!columns.includes(colName)) return null;

    const newCols = columns.filter(c => c !== colName);
    const newRows = rows.map(r => {
      const obj = { ...r };
      delete obj[colName];
      return obj;
    });

    this._pushSnapshot(newRows, newCols, `Dropped column "${colName}"`);
    return this.getCurrentData();
  }

  reorderColumns(orderedColumns) {
    const { rows, columns } = this.getCurrentData();
    if (!Array.isArray(orderedColumns) || orderedColumns.length !== columns.length) return null;

    const newRows = rows.map(r => {
      const obj = {};
      orderedColumns.forEach(c => { obj[c] = r[c]; });
      return obj;
    });

    this._pushSnapshot(newRows, orderedColumns, 'Reordered columns');
    return this.getCurrentData();
  }

  addCalculatedColumn(newColName, expression) {
    const { rows, columns } = this.getCurrentData();
    const name = newColName.trim();
    if (!name || columns.includes(name)) return null;

    const newCols = [...columns, name];
    const newRows = rows.map(r => {
      const newRow = { ...r };
      try {
        const func = new Function(...columns, `try { return (${expression}); } catch(e) { return null; }`);
        const args = columns.map(c => _Validators.parseNumeric(r[c]) ?? r[c]);
        newRow[name] = func(...args);
      } catch (e) {
        newRow[name] = null;
      }
      return newRow;
    });

    this._pushSnapshot(newRows, newCols, `Added calculated column "${name}"`);
    return this.getCurrentData();
  }

  createCalculatedMeasure(name, leftCol, op, isConstant, rightVal) {
    const { rows, columns } = this.getCurrentData();
    const cleanName = (name || `${leftCol}_${op}`).trim();
    if (!cleanName || columns.includes(cleanName)) return null;

    const newCols = [...columns, cleanName];
    const newRows = rows.map(r => {
      const copy = { ...r };
      const left = _Validators.parseNumeric(r[leftCol]) ?? (isNaN(Number(r[leftCol])) ? r[leftCol] : Number(r[leftCol]));
      const right = isConstant 
        ? (_Validators.parseNumeric(rightVal) ?? (isNaN(Number(rightVal)) ? rightVal : Number(rightVal)))
        : (_Validators.parseNumeric(r[rightVal]) ?? (isNaN(Number(r[rightVal])) ? r[rightVal] : Number(r[rightVal])));

      let res = null;
      if (op === '+') res = (typeof left === 'number' && typeof right === 'number') ? left + right : `${left ?? ''}${right ?? ''}`;
      else if (op === '-') res = (typeof left === 'number' && typeof right === 'number') ? left - right : null;
      else if (op === '*') res = (typeof left === 'number' && typeof right === 'number') ? left * right : null;
      else if (op === '/') res = (typeof left === 'number' && typeof right === 'number' && right !== 0) ? +(left / right).toFixed(4) : null;
      else if (op === '%') res = (typeof left === 'number' && typeof right === 'number' && right !== 0) ? left % right : null;
      else if (op === 'CONCAT') res = `${left ?? ''} ${right ?? ''}`.trim();

      copy[cleanName] = res;
      return copy;
    });

    this._pushSnapshot(newRows, newCols, `Created measure "${cleanName}" (${leftCol} ${op} ${isConstant ? rightVal : rightVal})`);
    return this.getCurrentData();
  }

  dropAllNullRows() {
    const { rows, columns } = this.getCurrentData();
    const cleanRows = rows.filter(r => {
      return columns.every(c => r[c] !== null && r[c] !== undefined && String(r[c]).trim() !== '' && String(r[c]).toLowerCase() !== 'null' && String(r[c]).toLowerCase() !== 'n/a');
    });
    const droppedCount = rows.length - cleanRows.length;
    this._pushSnapshot(cleanRows, columns, `Dropped ${droppedCount} rows containing any missing values`);
    return { droppedCount, data: this.getCurrentData() };
  }

  maskPII(targetColumns = null) {
    const { rows, columns } = this.getCurrentData();
    const cols = targetColumns || columns.filter(c => /name|email|phone|ssn|card|address|mobile|contact|user|student/i.test(c));
    let maskedCount = 0;
    const newRows = rows.map(r => {
      const copy = { ...r };
      cols.forEach(c => {
        if (copy[c] !== null && copy[c] !== undefined && copy[c] !== '') {
          const s = String(copy[c]);
          if (s.includes('@')) {
            const parts = s.split('@');
            copy[c] = (parts[0].length > 2 ? parts[0].slice(0, 2) + '***' : '***') + '@' + (parts[1] || 'domain.com');
          } else if (/^\+?\d[\d\s\-()]{6,}$/.test(s)) {
            copy[c] = s.slice(0, 3) + '****' + s.slice(-2);
          } else if (s.length > 4) {
            copy[c] = s.slice(0, 2) + '*'.repeat(Math.min(6, s.length - 4)) + s.slice(-2);
          } else {
            copy[c] = '***';
          }
          maskedCount++;
        }
      });
      return copy;
    });
    this._pushSnapshot(newRows, columns, `Masked PII across ${cols.length || 'detected'} column(s)`);
    return { maskedCount, data: this.getCurrentData() };
  }

  // 11. ONE-CLICK AUTO-CLEAN (Applies best practices automatically)
  autoClean(profile) {
    const { columns } = this.getCurrentData();

    // Step A: Trim whitespace across all columns
    this.trimWhitespace();

    // Step B: Remove duplicate rows
    this.removeDuplicates();

    // Step C: Process each column based on profile
    columns.forEach(col => {
      const cProf = profile.columnProfiles[col];
      if (!cProf) return;

      // Clean numeric / currency columns
      if (cProf.inferredType === 'numeric' || cProf.inferredType === 'currency' || cProf.currencyCount > 0) {
        this.cleanNumericColumn(col);
      }

      // Standardize date format
      if (cProf.inferredType === 'date') {
        this.standardizeDates(col);
      }

      // Standardize categories
      if (cProf.inferredType === 'categorical' || cProf.inconsistentCasing?.length > 0) {
        this.normalizeCategories(col);
      }

      // Impute missing values
      if (cProf.nullCount > 0) {
        if (cProf.inferredType === 'numeric' || cProf.inferredType === 'currency') {
          this.handleMissingValues(col, 'median');
        } else if (cProf.inferredType === 'date') {
          this.handleMissingValues(col, 'ffill');
        } else {
          this.handleMissingValues(col, 'mode');
        }
      }
    });

    return this.getCurrentData();
  }

  // 12. Change / Cast Column Type (Type Telling & Conversion)
  changeColumnType(column, targetType) {
    const { rows, columns } = this.getCurrentData();
    let transformedCount = 0;

    const newRows = rows.map(r => {
      const copy = { ...r };
      const originalVal = copy[column];
      if (originalVal !== null && originalVal !== undefined) {
        copy[column] = _Validators.castValue(originalVal, targetType);
        if (copy[column] !== originalVal) transformedCount++;
      }
      return copy;
    });

    this._pushSnapshot(newRows, columns, `Casted column "${column}" to ${targetType} (${transformedCount} cells transformed)`);
    return { transformedCount, data: this.getCurrentData() };
  }

  // 13. Deep Type Inspection across all columns
  tellAllColumnTypes() {
    const { rows, columns } = this.getCurrentData();
    const typeReport = {};

    columns.forEach(col => {
      const values = rows.map(r => r[col]);
      typeReport[col] = _Validators.tellColumnType(values);
    });

    return typeReport;
  }

  // 14. Filter Rows
  filterRows(column, operator, value) {
    const { rows, columns } = this.getCurrentData();
    const numVal = parseFloat(value);

    const filtered = rows.filter(r => {
      const v = r[column];
      const curNum = _Validators.parseNumeric(v);

      switch (operator) {
        case '>':
          return curNum !== null && !isNaN(numVal) && curNum > numVal;
        case '<':
          return curNum !== null && !isNaN(numVal) && curNum < numVal;
        case '>=':
          return curNum !== null && !isNaN(numVal) && curNum >= numVal;
        case '<=':
          return curNum !== null && !isNaN(numVal) && curNum <= numVal;
        case '==':
        case '=':
          return String(v).trim().toLowerCase() === String(value).trim().toLowerCase();
        case '!=':
          return String(v).trim().toLowerCase() !== String(value).trim().toLowerCase();
        case 'contains':
          return String(v || '').toLowerCase().includes(String(value || '').toLowerCase());
        case 'not_null':
          return v !== null && v !== undefined && String(v).trim() !== '' && String(v).toLowerCase() !== 'null';
        case 'is_null':
          return v === null || v === undefined || String(v).trim() === '' || String(v).toLowerCase() === 'null';
        default:
          return true;
      }
    });

    this._pushSnapshot(filtered, columns, `Filtered ${rows.length - filtered.length} rows where ${column} ${operator} ${value}`);
    return this.getCurrentData();
  }

  // 15. Sort Rows
  sortRows(column, ascending = true) {
    const { rows, columns } = this.getCurrentData();
    const sorted = [...rows].sort((a, b) => {
      const vA = a[column];
      const vB = b[column];
      const numA = _Validators.parseNumeric(vA);
      const numB = _Validators.parseNumeric(vB);

      if (numA !== null && numB !== null) {
        return ascending ? numA - numB : numB - numA;
      }
      return ascending
        ? String(vA || '').localeCompare(String(vB || ''))
        : String(vB || '').localeCompare(String(vA || ''));
    });

    this._pushSnapshot(sorted, columns, `Sorted dataset by ${column} (${ascending ? 'Ascending' : 'Descending'})`);
    return this.getCurrentData();
  }

  // 16. Append Machine Learning Prediction column to dataset
  appendPredictions(predictions = [], columnName = 'Predicted_Value') {
    const { rows, columns } = this.getCurrentData();
    const newCols = columns.includes(columnName) ? [...columns] : [...columns, columnName];

    const newRows = rows.map((r, i) => {
      const pred = i < predictions.length ? predictions[i] : null;
      return {
        ...r,
        [columnName]: pred
      };
    });

    this._pushSnapshot(newRows, newCols, `Appended ML Prediction column "${columnName}"`);
    return this.getCurrentData();
  }

  trimAllWhitespace(targetColumns = null) {
    return this.trimWhitespace(targetColumns);
  }

  fillMissing(column, method = 'median', customValue = '') {
    return this.handleMissingValues(column, method, customValue);
  }

  transformCase(column, casing = 'title') {
    return this.standardizeText(column, casing);
  }

  pushHistory(newRows, desc = 'Remote Clean Operation') {
    const cols = (newRows && newRows[0]) ? Object.keys(newRows[0]) : this.getCurrentData().columns;
    this._pushSnapshot(newRows, cols, desc);
    return this.getCurrentData();
  }
}

if (typeof window !== 'undefined') {
  window.DataCleaner = DataCleaner;
}
if (typeof globalThis !== 'undefined') {
  globalThis.DataCleaner = DataCleaner;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataCleaner;
}

