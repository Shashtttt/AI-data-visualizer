/**
 * utils/export.js
 * Multi-Format Export Engine
 * Supports: CSV, JSON, Excel (XML spreadsheet), and Clipboard copy
 */

const Exporter = {
  // Download CSV
  downloadCSV(rows, columns, filename = 'cleaned_dataset.csv') {
    if (!rows.length || !columns.length) return false;

    const escapeCSV = val => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerLine = columns.map(escapeCSV).join(',');
    const rowLines = rows.map(r => columns.map(c => escapeCSV(r[c])).join(','));
    const csvContent = '\uFEFF' + [headerLine, ...rowLines].join('\r\n'); // UTF-8 BOM

    this._triggerDownload(csvContent, 'text/csv;charset=utf-8;', filename);
    return true;
  },

  // Download JSON
  downloadJSON(rows, filename = 'cleaned_dataset.json') {
    const jsonContent = JSON.stringify(rows, null, 2);
    this._triggerDownload(jsonContent, 'application/json;charset=utf-8;', filename);
    return true;
  },

  // Download Excel-compatible XML Spreadsheet (.xls)
  downloadExcel(rows, columns, filename = 'cleaned_dataset.xls') {
    let xml = `<?xml version="1.0"?>\n` +
      `<?mso-application progid="Excel.Sheet"?>\n` +
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n` +
      ` xmlns:o="urn:schemas-microsoft-com:office:office"\n` +
      ` xmlns:x="urn:schemas-microsoft-com:office:excel"\n` +
      ` xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n` +
      ` xmlns:html="http://www.w3.org/TR/REC-html40">\n` +
      `<Styles>\n` +
      ` <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2563EB" ss:Pattern="Solid"/></Style>\n` +
      ` <Style ss:ID="Default"><Alignment ss:Vertical="Center"/></Style>\n` +
      `</Styles>\n` +
      `<Worksheet ss:Name="CleanedData">\n` +
      `<Table>\n`;

    // Header row
    xml += `<Row ss:StyleID="Header">\n`;
    columns.forEach(col => {
      xml += `  <Cell><Data ss:Type="String">${this._escapeXml(col)}</Data></Cell>\n`;
    });
    xml += `</Row>\n`;

    // Data rows
    rows.forEach(r => {
      xml += `<Row>\n`;
      columns.forEach(col => {
        const val = r[col];
        if (val === null || val === undefined || val === '') {
          xml += `  <Cell><Data ss:Type="String"></Data></Cell>\n`;
        } else if (typeof val === 'number') {
          xml += `  <Cell><Data ss:Type="Number">${val}</Data></Cell>\n`;
        } else {
          xml += `  <Cell><Data ss:Type="String">${this._escapeXml(val)}</Data></Cell>\n`;
        }
      });
      xml += `</Row>\n`;
    });

    xml += `</Table>\n</Worksheet>\n</Workbook>`;

    this._triggerDownload(xml, 'application/vnd.ms-excel', filename);
    return true;
  },

  // Copy to clipboard as TSV
  async copyTableToClipboard(rows, columns) {
    if (!rows.length || !columns.length) return false;

    const header = columns.join('\t');
    const body = rows.map(r => columns.map(c => {
      const v = r[c];
      return v === null || v === undefined ? '' : String(v).replace(/\t|\n/g, ' ');
    }).join('\t')).join('\n');

    const tsv = `${header}\n${body}`;

    try {
      await navigator.clipboard.writeText(tsv);
      return true;
    } catch (e) {
      console.error('Clipboard copy failed:', e);
      return false;
    }
  },

  _escapeXml(val) {
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  },

  _triggerDownload(content, mimeType, filename) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Exporter;
}
