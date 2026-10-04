/**
 * cleaning/validators.js
 * Comprehensive Data Validation, Type Inference, Type Telling, Casting & Diff Engine
 */

const Validators = {
  // Common format matchers
  PATTERNS: {
    email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    url: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i,
    phone: /^(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}$/,
    currency: /^[\$€£₹¥]\s?-?\d+([,\.]\d+)*(\.\d+)?$|^-?\d+([,\.]\d+)*(\.\d+)?\s?[\$€£₹¥]$/,
    percentage: /^-?\d+(\.\d+)?%$/,
    integer: /^-?\d{1,3}(,\d{3})*$|^-?\d+$/,
    float: /^-?\d+(\.\d+)$|^-?\d{1,3}(,\d{3})*\.\d+$/,
    boolean: /^(true|false|yes|no|1|0)$/i,
    dateIso: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/
  },

  // Infer single value type
  inferValueType(val) {
    if (val === null || val === undefined || val === '') return 'null';
    if (typeof val === 'boolean') return 'boolean';
    if (typeof val === 'number') {
      return Number.isInteger(val) ? 'integer' : 'float';
    }

    const str = String(val).trim();
    if (str === '' || /^(null|none|nan|n\/a|-)$/i.test(str)) return 'null';

    // Boolean string
    if (/^(true|false|yes|no)$/i.test(str)) return 'boolean';

    // Email
    if (this.PATTERNS.email.test(str)) return 'email';

    // URL
    if (this.PATTERNS.url.test(str)) return 'url';

    // Phone
    if (this.PATTERNS.phone.test(str)) return 'phone';

    // Currency pattern: e.g. $1,200.50, €50, ₹10,000
    if (this.PATTERNS.currency.test(str)) return 'currency';

    // Percentage: e.g. 85%, -12.4%
    if (this.PATTERNS.percentage.test(str)) return 'percentage';

    // Integer with optional commas
    if (this.PATTERNS.integer.test(str)) return 'integer';

    // Float
    if (this.PATTERNS.float.test(str)) return 'float';

    // Date
    if (this.isValidDate(str)) return 'date';

    return 'string';
  },

  isValidDate(str) {
    if (typeof str !== 'string') return false;
    const trimmed = str.trim();
    if (trimmed.length < 6 || /^\d+$/.test(trimmed)) return false;
    const dateRegex = /^(\d{4}[-\/\.]\d{1,2}[-\/\.]\d{1,2})|(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4})|([A-Za-z]{3,9}\s\d{1,2},?\s\d{4})$/;
    if (!dateRegex.test(trimmed)) return false;
    const parsed = Date.parse(trimmed);
    return !isNaN(parsed);
  },

  // Parse numeric value removing currencies and commas
  parseNumeric(val) {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    let s = String(val).trim();
    s = s.replace(/[\$€£₹¥\s]/g, '').replace(/,/g, '');
    if (s.endsWith('%')) {
      s = s.replace('%', '');
      const num = parseFloat(s);
      return isNaN(num) ? null : num / 100;
    }
    const num = parseFloat(s);
    return isNaN(num) ? null : num;
  },

  // Deep Column Type Telling & Inspection
  tellColumnType(values = []) {
    const counts = {
      integer: 0,
      float: 0,
      currency: 0,
      percentage: 0,
      date: 0,
      boolean: 0,
      email: 0,
      url: 0,
      phone: 0,
      string: 0,
      null: 0
    };

    const uniqueSet = new Set();
    let totalNonEmpty = 0;

    values.forEach(v => {
      const type = this.inferValueType(v);
      counts[type] = (counts[type] || 0) + 1;
      if (type !== 'null') {
        totalNonEmpty++;
        uniqueSet.add(String(v).trim().toLowerCase());
      }
    });

    if (totalNonEmpty === 0) {
      return {
        primaryType: 'empty',
        category: 'empty',
        displayLabel: 'Empty / All Nulls',
        confidence: 100,
        distinctCount: 0,
        uniqueRatio: 0,
        canConvertTo: ['numeric', 'text', 'date', 'boolean']
      };
    }

    const numericTotal = counts.integer + counts.float + counts.currency + counts.percentage;
    const numericConfidence = Math.round((numericTotal / totalNonEmpty) * 100);

    let primaryType = 'string';
    let category = 'text';
    let displayLabel = 'Text / String';
    let confidence = Math.round((counts.string / totalNonEmpty) * 100);

    if (numericConfidence >= 60) {
      category = 'numeric';
      if (counts.currency > counts.integer && counts.currency > counts.float) {
        primaryType = 'currency';
        displayLabel = 'Currency ($/€/₹)';
      } else if (counts.percentage > counts.integer && counts.percentage > counts.float) {
        primaryType = 'percentage';
        displayLabel = 'Percentage (%)';
      } else if (counts.integer >= counts.float) {
        primaryType = 'integer';
        displayLabel = 'Integer Number';
      } else {
        primaryType = 'float';
        displayLabel = 'Decimal Number';
      }
      confidence = numericConfidence;
    } else if ((counts.date / totalNonEmpty) >= 0.6) {
      primaryType = 'date';
      category = 'date';
      displayLabel = 'Date / Timestamp';
      confidence = Math.round((counts.date / totalNonEmpty) * 100);
    } else if ((counts.boolean / totalNonEmpty) >= 0.7) {
      primaryType = 'boolean';
      category = 'boolean';
      displayLabel = 'Boolean (Yes/No)';
      confidence = Math.round((counts.boolean / totalNonEmpty) * 100);
    } else if ((counts.email / totalNonEmpty) >= 0.5) {
      primaryType = 'email';
      category = 'contact';
      displayLabel = 'Email Address';
      confidence = Math.round((counts.email / totalNonEmpty) * 100);
    } else if ((counts.url / totalNonEmpty) >= 0.5) {
      primaryType = 'url';
      category = 'web';
      displayLabel = 'Web URL';
      confidence = Math.round((counts.url / totalNonEmpty) * 100);
    } else if ((counts.phone / totalNonEmpty) >= 0.5) {
      primaryType = 'phone';
      category = 'contact';
      displayLabel = 'Phone Number';
      confidence = Math.round((counts.phone / totalNonEmpty) * 100);
    } else if (uniqueSet.size === 2 && totalNonEmpty >= 2) {
      primaryType = 'binary';
      category = 'binary';
      displayLabel = `Binary (${Array.from(uniqueSet).join(' / ')})`;
      confidence = 95;
    } else if (uniqueSet.size <= 15 && uniqueSet.size < totalNonEmpty * 0.5) {
      primaryType = 'categorical';
      category = 'category';
      displayLabel = `Categorical (${uniqueSet.size} classes)`;
      confidence = 90;
    }

    const uniqueRatio = Math.round((uniqueSet.size / (totalNonEmpty || 1)) * 100);

    // Check if column looks like an ID column (100% unique or name contains id/uuid/key/code)
    if (uniqueRatio > 95 && totalNonEmpty > 10) {
      if (primaryType === 'string' || primaryType === 'integer') {
        primaryType = 'id';
        category = 'id';
        displayLabel = 'Identifier (ID)';
        confidence = 92;
      }
    }

    const canConvertTo = ['numeric', 'categorical', 'date', 'text', 'boolean', 'binary', 'id', 'target', 'ignore'];
    const inferredType = category === 'category' ? 'categorical' : (category === 'numeric' ? 'numeric' : (primaryType === 'string' ? 'text' : primaryType));
    const sampleValues = values.filter(v => v !== null && v !== undefined && v !== '').slice(0, 5);

    return {
      primaryType,
      category,
      inferredType,
      recommendedTarget: inferredType,
      sampleValues,
      displayLabel,
      confidence,
      distinctCount: uniqueSet.size,
      uniqueRatio,
      typeCounts: counts,
      canConvertTo
    };
  },

  // Cast value to target type
  castValue(val, targetType) {
    if (val === null || val === undefined || val === '') return null;
    const str = String(val).trim();

    switch (targetType.toLowerCase()) {
      case 'numeric':
      case 'float': {
        const num = this.parseNumeric(val);
        return num !== null ? num : val;
      }
      case 'integer': {
        const num = this.parseNumeric(val);
        return num !== null ? Math.round(num) : val;
      }
      case 'date': {
        if (!str) return null;
        const parsed = Date.parse(str);
        if (!isNaN(parsed)) {
          const d = new Date(parsed);
          return d.toISOString().split('T')[0]; // Standard YYYY-MM-DD
        }
        return str;
      }
      case 'boolean':
      case 'binary': {
        if (/^(true|yes|1|y|t)$/i.test(str)) return 1;
        if (/^(false|no|0|n|f)$/i.test(str)) return 0;
        return val ? 1 : 0;
      }
      case 'text':
      case 'string':
      case 'id':
      case 'target':
        return String(val).trim();
      case 'categorical':
      case 'category':
        return String(val).trim();
      case 'uppercase':
        return String(val).trim().toUpperCase();
      case 'lowercase':
        return String(val).trim().toLowerCase();
      case 'titlecase':
        return String(val).trim().replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
      default:
        return val;
    }
  },

  // Compute exact diff between original and cleaned dataset
  computeDatasetDiff(originalRows, cleanedRows, columns) {
    let cellsChanged = 0;
    let rowsChanged = 0;
    let nullsHandled = 0;
    const diffList = [];

    const minLen = Math.min(originalRows.length, cleanedRows.length);
    const duplicatesRemoved = Math.max(0, originalRows.length - cleanedRows.length);

    for (let r = 0; r < minLen; r++) {
      const orig = originalRows[r];
      const clean = cleanedRows[r];
      let rowHasChange = false;

      columns.forEach(col => {
        const oVal = orig ? orig[col] : undefined;
        const cVal = clean ? clean[col] : undefined;

        if (oVal !== cVal) {
          cellsChanged++;
          rowHasChange = true;
          if ((oVal === null || oVal === '' || String(oVal).toLowerCase() === 'null') && cVal !== null) {
            nullsHandled++;
          }
          if (diffList.length < 20) {
            diffList.push({
              row: r + 1,
              column: col,
              before: oVal,
              after: cVal
            });
          }
        }
      });

      if (rowHasChange) rowsChanged++;
    }

    return {
      originalRowCount: originalRows.length,
      cleanedRowCount: cleanedRows.length,
      rowsChanged,
      cellsChanged,
      duplicatesRemoved,
      nullsHandled,
      sampleDiffs: diffList
    };
  }
};

if (typeof window !== 'undefined') {
  window.Validators = Validators;
}
if (typeof globalThis !== 'undefined') {
  globalThis.Validators = Validators;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Validators;
}

