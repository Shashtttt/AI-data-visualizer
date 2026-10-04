/**
 * cleaning/profiler.js
 * Automatic Data Quality Profiler and Anomaly Detector
 */

// Safely resolve Validators across browser script tags and module environments
var _Validators = (typeof Validators !== 'undefined' && Validators)
  ? Validators
  : (typeof globalThis !== 'undefined' && globalThis.Validators)
    ? globalThis.Validators
    : (typeof window !== 'undefined' && window.Validators)
      ? window.Validators
      : (typeof require !== 'undefined' ? require('./validators.js') : null);

const DataProfiler = {
  profile(rows, columns, columnTypeOverrides = {}) {
    if (!rows || !rows.length || !columns || !columns.length) {
      return {
        rowCount: 0,
        colCount: 0,
        columns: [],
        totalNulls: 0,
        totalDuplicates: 0,
        numericCount: 0,
        categoricalCount: 0,
        dateCount: 0,
        problems: [],
        columnProfiles: {},
        smartAnalytics: [],
        correlations: {},
        qualityScore: 100
      };
    }

    const rowCount = rows.length;
    const colCount = columns.length;
    const columnProfiles = {};
    let totalNulls = 0;
    let totalWhitespaceIssues = 0;
    let totalMixedTypes = 0;
    let totalOutliers = 0;
    const problems = [];
    const categoryFrequencyMap = {};
    const numericSeriesMap = {};

    let totalNumericCols = 0;
    let totalCategoricalCols = 0;
    let totalDateCols = 0;

    // 1. Column-by-column profiling
    columns.forEach(col => {
      let nullCount = 0;
      let whitespaceCount = 0;
      let currencyCount = 0;
      let percentageCount = 0;
      let numericCount = 0;
      let dateCount = 0;
      let stringCount = 0;
      let booleanCount = 0;
      const typeCounts = {};
      const rawValues = [];
      const numericValues = [];
      const distinctSet = new Set();
      const distinctCaseInsensitive = new Map();
      const valueFreq = {};

      rows.forEach((r) => {
        const val = r[col];
        rawValues.push(val);

        if (val === null || val === undefined || val === '') {
          nullCount++;
          return;
        }

        const str = String(val);
        if (str !== str.trim()) {
          whitespaceCount++;
        }

        const trimmed = str.trim();
        distinctSet.add(trimmed);
        valueFreq[trimmed] = (valueFreq[trimmed] || 0) + 1;

        const lower = trimmed.toLowerCase();
        if (!distinctCaseInsensitive.has(lower)) {
          distinctCaseInsensitive.set(lower, new Set());
        }
        distinctCaseInsensitive.get(lower).add(trimmed);

        const vType = _Validators.inferValueType(val);
        typeCounts[vType] = (typeCounts[vType] || 0) + 1;

        if (vType === 'integer' || vType === 'float') {
          numericCount++;
          numericValues.push(_Validators.parseNumeric(val));
        } else if (vType === 'currency') {
          currencyCount++;
          numericValues.push(_Validators.parseNumeric(val));
        } else if (vType === 'percentage') {
          percentageCount++;
          numericValues.push(_Validators.parseNumeric(val));
        } else if (vType === 'date') {
          dateCount++;
        } else if (vType === 'boolean') {
          booleanCount++;
        } else {
          stringCount++;
        }
      });

      totalNulls += nullCount;
      totalWhitespaceIssues += whitespaceCount;

      const inconsistentCasing = [];
      distinctCaseInsensitive.forEach((variants) => {
        if (variants.size > 1) {
          inconsistentCasing.push(Array.from(variants));
        }
      });

      // Dominant data type determination
      const nonNullCount = rowCount - nullCount;
      let dominantType = 'text';
      let isMixed = false;

      const totalNumericTypes = numericCount + currencyCount + percentageCount;
      if (nonNullCount > 0) {
        if (totalNumericTypes / nonNullCount >= 0.7) {
          dominantType = 'numeric';
          if (currencyCount > 0) dominantType = 'currency';
          if (percentageCount > 0) dominantType = 'percentage';
          if (stringCount > 0 || (currencyCount > 0 && numericCount > 0)) {
            isMixed = true;
          }
        } else if (dateCount / nonNullCount >= 0.7) {
          dominantType = 'date';
          if (stringCount > 0 || numericCount > 0) isMixed = true;
        } else if (booleanCount / nonNullCount >= 0.7) {
          dominantType = 'boolean';
        } else if (distinctSet.size === 2) {
          dominantType = 'binary';
        } else if (distinctSet.size <= Math.min(25, Math.max(2, Math.floor(nonNullCount * 0.25)))) {
          dominantType = 'categorical';
        } else {
          dominantType = 'text';
        }
      }

      // Check if ID column
      if (distinctSet.size > 10 && distinctSet.size === nonNullCount && /(id|key|code|uuid|number|no)$/i.test(col)) {
        dominantType = 'id';
      }

      // Respect manual override if provided by user
      if (columnTypeOverrides && columnTypeOverrides[col]) {
        dominantType = columnTypeOverrides[col];
      }

      if (dominantType === 'numeric' || dominantType === 'currency' || dominantType === 'percentage' || dominantType === 'float' || dominantType === 'integer') {
        totalNumericCols++;
      } else if (dominantType === 'date') {
        totalDateCols++;
      } else if (dominantType !== 'ignore') {
        totalCategoricalCols++;
      }

      if (isMixed) totalMixedTypes++;

      // Top frequent values for categorical / general columns
      const topValues = Object.entries(valueFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([val, freq]) => ({ value: val, count: freq, pct: Math.round((freq / rowCount) * 100) }));
      categoryFrequencyMap[col] = topValues;

      // Numeric stats: min, max, mean, median, std dev, IQR outliers, Z-score outliers
      let outliers = [];
      let minVal = null, maxVal = null, meanVal = null, medianVal = null, stdDevVal = null;

      if (numericValues.length >= 2) {
        numericSeriesMap[col] = numericValues;
        const sorted = [...numericValues].sort((a, b) => a - b);
        minVal = sorted[0];
        maxVal = sorted[sorted.length - 1];
        const sum = sorted.reduce((acc, v) => acc + v, 0);
        meanVal = +(sum / sorted.length).toFixed(2);

        const mid = Math.floor(sorted.length / 2);
        medianVal = sorted.length % 2 !== 0 ? sorted[mid] : +((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2);

        const variance = sorted.reduce((acc, v) => acc + Math.pow(v - meanVal, 2), 0) / sorted.length;
        stdDevVal = +(Math.sqrt(variance)).toFixed(2);

        if (sorted.length >= 4) {
          const q1 = sorted[Math.floor(sorted.length * 0.25)];
          const q3 = sorted[Math.floor(sorted.length * 0.75)];
          const iqr = q3 - q1;
          const lowerBound = q1 - 1.5 * iqr;
          const upperBound = q3 + 1.5 * iqr;
          outliers = sorted.filter(v => v < lowerBound || v > upperBound);
          totalOutliers += outliers.length;
        }
      }

      const hasSuspiciousNegatives = (minVal !== null && minVal < 0 && /(age|salary|price|revenue|cost|quantity|sales|units|count|score)/i.test(col));

      columnProfiles[col] = {
        name: col,
        inferredType: dominantType,
        userOverrideType: columnTypeOverrides ? columnTypeOverrides[col] || null : null,
        nullCount,
        nullPercentage: +((nullCount / rowCount) * 100).toFixed(1),
        emptyCount: nullCount,
        distinctCount: distinctSet.size,
        whitespaceCount,
        currencyCount,
        percentageCount,
        isMixed,
        inconsistentCasing,
        hasSuspiciousNegatives,
        topValues,
        stats: {
          min: minVal,
          max: maxVal,
          mean: meanVal,
          median: medianVal,
          stdDev: stdDevVal,
          outliersCount: outliers.length,
          outlierSamples: outliers.slice(0, 5)
        }
      };

      if (nullCount > 0) {
        problems.push({
          type: 'missing_values',
          severity: nullCount / rowCount > 0.3 ? 'high' : 'medium',
          column: col,
          count: nullCount,
          message: `Column "${col}" has ${nullCount} missing / empty values (${((nullCount / rowCount) * 100).toFixed(0)}%).`
        });
      }

      if (whitespaceCount > 0) {
        problems.push({
          type: 'whitespace',
          severity: 'low',
          column: col,
          count: whitespaceCount,
          message: `Column "${col}" has ${whitespaceCount} values with leading or trailing whitespace.`
        });
      }

      if (currencyCount > 0 && dominantType !== 'text') {
        problems.push({
          type: 'currency_format',
          severity: 'medium',
          column: col,
          count: currencyCount,
          message: `Column "${col}" has ${currencyCount} numeric values formatted with currency symbols/commas.`
        });
      }

      if (inconsistentCasing.length > 0) {
        problems.push({
          type: 'inconsistent_categories',
          severity: 'medium',
          column: col,
          count: inconsistentCasing.length,
          message: `Column "${col}" has ${inconsistentCasing.length} inconsistent categorical casings (e.g., "${inconsistentCasing[0].join('" vs "')}").`
        });
      }

      if (outliers.length > 0) {
        problems.push({
          type: 'outliers',
          severity: 'low',
          column: col,
          count: outliers.length,
          message: `Column "${col}" contains ${outliers.length} statistical outliers outside IQR bounds.`
        });
      }

      if (hasSuspiciousNegatives) {
        problems.push({
          type: 'suspicious_value',
          severity: 'high',
          column: col,
          message: `Column "${col}" contains negative values (min: ${minVal}), which is unusual for this metric.`
        });
      }

      if (nullCount === rowCount) {
        problems.push({
          type: 'empty_column',
          severity: 'high',
          column: col,
          message: `Column "${col}" is completely empty (100% null).`
        });
      }
    });

    // 2. Duplicate rows detection
    const rowHashCounts = new Map();
    const duplicateIndices = [];

    rows.forEach((r, idx) => {
      const rowHash = columns.map(c => String(r[c] !== null && r[c] !== undefined ? r[c] : '').trim()).join('|||');
      if (rowHashCounts.has(rowHash)) {
        duplicateIndices.push(idx);
        rowHashCounts.set(rowHash, rowHashCounts.get(rowHash) + 1);
      } else {
        rowHashCounts.set(rowHash, 1);
      }
    });

    const totalDuplicates = duplicateIndices.length;
    if (totalDuplicates > 0) {
      problems.push({
        type: 'duplicate_rows',
        severity: 'high',
        count: totalDuplicates,
        message: `${totalDuplicates} duplicate rows detected in dataset.`
      });
    }

    // 3. Overall quality score calculation (0 - 100)
    let score = 100;
    score -= Math.min(30, (totalNulls / (rowCount * colCount)) * 80);
    score -= Math.min(25, (totalDuplicates / rowCount) * 60);
    score -= Math.min(15, totalMixedTypes * 5);
    score -= Math.min(10, (totalWhitespaceIssues / (rowCount * colCount)) * 40);
    score -= Math.min(10, Math.min(totalOutliers, 10));
    score = Math.max(10, Math.min(100, Math.round(score)));

    // 4. Compute Smart Analytics & Pearson Correlations deterministically
    const { correlations, smartAnalytics } = this.computeSmartAnalytics(rows, columns, columnProfiles, totalDuplicates, rowCount);

    return {
      rowCount,
      colCount,
      columns,
      totalNulls,
      totalDuplicates,
      duplicateIndices,
      totalWhitespaceIssues,
      totalMixedTypes,
      totalOutliers,
      numericCount: totalNumericCols,
      categoricalCount: totalCategoricalCols,
      dateCount: totalDateCols,
      qualityScore: score,
      problems,
      columnProfiles,
      categoryFrequencyMap,
      correlations,
      smartAnalytics
    };
  },

  // Deterministic Smart Analytics (Correlations, Key Relationships, Hotspots)
  computeSmartAnalytics(rows, columns, columnProfiles, totalDuplicates, rowCount) {
    const smartAnalytics = [];
    const correlations = {};

    const numCols = columns.filter(c => {
      const p = columnProfiles[c];
      return p && (p.inferredType === 'numeric' || p.inferredType === 'currency' || p.inferredType === 'percentage' || p.inferredType === 'float' || p.inferredType === 'integer') && p.stats.min !== null;
    });

    // Pairwise Pearson correlations
    for (let i = 0; i < numCols.length; i++) {
      for (let j = i + 1; j < numCols.length; j++) {
        const c1 = numCols[i];
        const c2 = numCols[j];
        const pairs = [];
        rows.forEach(r => {
          const v1 = _Validators.parseNumeric(r[c1]);
          const v2 = _Validators.parseNumeric(r[c2]);
          if (v1 !== null && v2 !== null && !isNaN(v1) && !isNaN(v2)) {
            pairs.push([v1, v2]);
          }
        });

        if (pairs.length >= 3) {
          const n = pairs.length;
          let sum1 = 0, sum2 = 0;
          pairs.forEach(p => { sum1 += p[0]; sum2 += p[1]; });
          const mean1 = sum1 / n;
          const mean2 = sum2 / n;

          let num = 0, den1 = 0, den2 = 0;
          pairs.forEach(p => {
            const d1 = p[0] - mean1;
            const d2 = p[1] - mean2;
            num += d1 * d2;
            den1 += d1 * d1;
            den2 += d2 * d2;
          });

          const rVal = (den1 > 0 && den2 > 0) ? num / Math.sqrt(den1 * den2) : 0;
          const roundR = Math.round(rVal * 100) / 100;
          correlations[`${c1}__${c2}`] = roundR;

          if (Math.abs(roundR) >= 0.6) {
            const relType = roundR > 0 ? 'strong positive' : 'strong inverse';
            smartAnalytics.push({
              type: 'correlation',
              icon: '🔗',
              title: `${c1} & ${c2} Correlation`,
              text: `"${c1}" has a ${relType} relationship with "${c2}" (Pearson r = ${roundR}).`
            });
          }
        }
      }
    }

    // Outlier hotspot analytics
    numCols.forEach(c => {
      const p = columnProfiles[c];
      if (p.stats.outliersCount > 0) {
        const pct = Math.round((p.stats.outliersCount / rowCount) * 100);
        smartAnalytics.push({
          type: 'outliers',
          icon: '⚠️',
          title: `${c} Outlier Anomaly`,
          text: `"${c}" contains ${p.stats.outliersCount} outlier values (${pct}% of records), ranging up to ${p.stats.max}.`
        });
      }
    });

    // Categorical concentration
    columns.forEach(c => {
      const p = columnProfiles[c];
      if (p.inferredType === 'categorical' || p.inferredType === 'binary') {
        const top = p.topValues?.[0];
        if (top && top.pct >= 50) {
          smartAnalytics.push({
            type: 'distribution',
            icon: '📊',
            title: `Dominant Category in ${c}`,
            text: `Category "${top.value}" accounts for ${top.pct}% (${top.count} rows) in column "${c}".`
          });
        }
      }
    });

    // Duplicate check
    if (totalDuplicates > 0) {
      smartAnalytics.push({
        type: 'duplicates',
        icon: '📋',
        title: 'Redundant Records',
        text: `Identified ${totalDuplicates} duplicate rows (${Math.round((totalDuplicates / rowCount) * 100)}% of dataset) ready for deduplication.`
      });
    }

    return { correlations, smartAnalytics };
  }
};

if (typeof window !== 'undefined') {
  window.DataProfiler = DataProfiler;
}
if (typeof globalThis !== 'undefined') {
  globalThis.DataProfiler = DataProfiler;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataProfiler;
}

