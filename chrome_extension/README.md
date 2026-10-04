# 🚀 AI Data Cleaner — Universal Browser Extension (Manifest V3)
### Autonomous In-Browser Tabular Data Detection, Profiling, Cleaning & Visualization Suite
**Officially Compatible with:** Google Chrome • Microsoft Edge • Mozilla Firefox • Brave • Opera

---

## 🌟 Overview
**AI Data Cleaner** is a production-ready, browser-native extension built for data analysts, researchers, and engineers. It allows you to extract structured datasets from **any webpage**, analyze data quality, detect anomalies, execute reversible cleaning transformations, generate visualizations, and interact with a **Gemini AI data assistant**—**without downloading CSVs, starting Flask/Python servers, or opening Jupyter Notebooks.**

---

## 🔒 Security & Privacy: Browser-Only AI Key Storage

The AI API key and all data operations adhere to strict browser-isolated privacy principles:
- **Client-Side Storage**: The AI API key is stored **strictly in your local browser sandbox** (`chrome.storage.local` / `browser.storage.local`).
- **Zero Cloud Account Sync**: `storage.sync` is purposefully omitted so your key is never synced across Google, Microsoft, or Mozilla cloud accounts.
- **Zero Remote Backend Transmission**: The API key is never transmitted to, logged on, or saved in any intermediate backend server or database.
- **Direct Client-to-API Communication**: When AI features are invoked, queries are dispatched directly via HTTPS from the browser to Google's official Gemini API endpoint (`generativelanguage.googleapis.com`).
- **Purge Anytime**: A one-click **"Clear"** button in both the extension popup and the studio settings lets you instantly erase the key from browser memory.
- **Offline Heuristic Mode**: If no API key is provided, the extension seamlessly falls back to a deterministic, offline heuristic diagnostic advisor.

---

## 🏗️ Architecture (Manifest V3)

```text
chrome_extension/
├── manifest.json                 # Manifest V3 (Chrome, Edge & Firefox Gecko support)
├── background/
│   └── service-worker.js         # Unified Service Worker / Background Event Script
├── content/
│   └── content.js                # In-page table, ARIA grid & JSON scraper + highlighter
├── popup/
│   ├── popup.html                # 600×560 quick-action browser extension popup
│   ├── popup.css                 # DevTools / PowerBI dark-mode design system
│   └── popup.js                  # Popup event controller & data synchronizer
├── dashboard/
│   ├── dashboard.html            # Full-screen widescreen Data Studio workspace
│   ├── dashboard.css             # 3-column layout styling (Quality, Grid, AI Chat)
│   └── dashboard.js              # Spreadsheet sorting, inline cell editor & chart engine
├── ai/
│   └── gemini.js                 # Gemini REST API client + privacy filter & offline heuristic
├── cleaning/
│   ├── cleaner.js                # Deterministic transformation engine with Undo/Redo stack
│   ├── profiler.js               # Anomaly detector (nulls, dupes, outliers, casing, types)
│   └── validators.js             # Type inference & before/after diff calculator
├── visualization/
│   └── charts.js                 # Zero-dependency SVG/Canvas charts (Bar, Line, Donut, Scatter, Box)
├── utils/
│   ├── compat.js                 # Universal cross-browser compatibility layer (Edge/Firefox/Chrome)
│   ├── export.js                 # CSV, Excel (.xls), JSON & Clipboard TSV exporter
│   └── xlsx.mini.min.js          # In-browser Excel (.xlsx) file parser
├── icons/                        # High-resolution PNG extension icons (16, 48, 128)
└── test_webpage.html             # Ready-to-use testing playground with dirty test data
```

---

## ⚡ Key Features

### 1. 🔍 Instant Webpage Data Detection
- Automatically inspects the current DOM for HTML `<table>` elements, ARIA grids (`role="grid"` / `role="table"`), and embedded JSON datasets.
- Interactive glowing highlight on the webpage when hovering over a table in the extension list.
- Multi-table selector allowing you to pick exactly which table to clean.
- Direct CSV / JSON paste fallback for instant analysis of copied data.

### 2. 📊 Automatic Data Profiling & Quality Scoring
- **0–100 Data Quality Score** with color-coded health indicators.
- Detects:
  - Missing / null values per column and total
  - Duplicate rows (exact & whitespace-variants)
  - Mixed data types (e.g. numeric columns formatted as text like `"$50,000"`)
  - Inconsistent categorical casing (`"hr"`, `"HR"`, `"Human Resources"`)
  - Statistical outliers using the Interquartile Range (IQR) rule
  - Leading & trailing whitespace issues
  - Completely empty columns and suspicious negative values

### 3. ✨ 1-Click "Clean Automatically" & Granular Operations
- **One-Click Auto Clean**: In a single click, purges duplicates, trims phantom whitespace, standardizes text casing, converts currency/text numbers to math floats, and imputes missing values.
- **Granular Controls**:
  - Impute nulls with Median, Mean, Mode, Zero, "Unknown", or Forward Fill (`ffill`).
  - Cap or remove outliers with Winsorization.
  - Normalize inconsistent categories into uniform labels.
  - Add custom calculated columns (e.g. `Salary * 1.1`).
- **Full History Stack**: Unlimited **Undo (`Ctrl+Z`)**, **Redo (`Ctrl+Y`)**, and **Reset to Original**.

### 4. 📝 Interactive Spreadsheet & Diff Highlighter
- Search, filter, and sort columns ascending/descending.
- Double-click any cell to edit its value directly.
- **"Highlight Cleaned Changes"** mode: visually highlights in emerald green every cell modified from the original scraped webpage table.

### 5. 🤖 100% In-Browser Machine Learning & Predictions Suite
- **Runs entirely in JavaScript within your browser**—zero Python, Flask, or backend servers needed:
  - **Multi-Variable Linear Regression (OLS with Ridge Regularization)**: Predict continuous targets with $R^2$ goodness-of-fit, RMSE, MAE, and standardized feature importance weights.
  - **k-NN & Softmax Classification**: Multi-class and binary prediction with accuracy validation %, class distribution metrics, and confusion matrix indicators.
  - **Time-Series Forecasting**: Trend extrapolation using Holt-Winters & linear slope modeling with upper and lower 95% confidence bands.
  - **K-Means Clustering**: Unsupervised segmentation with k-means++ initialization, convergence iteration metrics, inertia scoring, and cluster distribution.
- **Interactive "What-If" Prediction Simulator**: Tweak individual feature inputs dynamically to calculate instant simulated predictions.
- **Append Predictions to Dataset**: Save predictions directly as a new column (`pred_<target>` or `ml_cluster`) with one click, visible in Preview and exportable to CSV/Excel.

### 6. 🏷️ Column "Type Telling" & 1-Click Type Casting
- **Deep Regex Pattern Inference**: Inspects raw values across every column to identify Numeric, Integer, Currency, Standard Date, Boolean, Email, URL, Phone, Text, and Categorical types.
- **Confidence Scoring & Diagnostics**: Shows exact percentage confidence for the detected type along with sanitized sample values.
- **1-Click Clean Casting**: Instantly convert any column to Numeric (Float), Integer, Currency-to-Float, Standard Date (YYYY-MM-DD), Boolean, Clean Text, or Categorical with full undo/redo support.

### 7. 📈 Complete Diagnostic & Test Chart Suite
- Built directly on native SVG and Canvas elements (zero external CDN or library dependencies):
  - **Bar Chart & Horizontal Bar Chart**: Categorical frequency and aggregations.
  - **Line Chart**: Continuous trend analysis.
  - **Donut / Pie Chart**: Segment proportions.
  - **Scatter Plot & Scatter with ML Trendline**: Bivariate relationships with automated least-squares regression line and equation overlay.
  - **Time-Series Forecast Chart**: Historical data points plotted alongside future extrapolations and upper/lower confidence intervals.
  - **Histogram**: Frequency distribution with automated binning.
  - **Box Plot**: Five-number summary (Min, Q1, Median, Q3, Max) with outlier identification dots.
  - **Correlation Heatmap**: Pearson correlation coefficient matrix between numeric variables.

### 8. 💬 Gemini AI Assistant & Heuristic Diagnostics
- Configure your **Google Gemini API Key** directly in Extension Settings.
- Ask questions in natural language:
  - *"Which columns have null values?"*
  - *"What is the average salary across departments?"*
  - *"Are there any duplicate records or outliers?"*
  - *"Explain data quality issues and suggest a cleaning plan."*
- **Offline Heuristic Fallback**: Works completely offline with rule-based heuristics if no API key is provided!
- **Privacy First**: The full dataset is NEVER transmitted to external servers. Only high-level statistical summaries and 3 sanitized sample rows are sent to the AI.

### 9. 💾 Multi-Format Export
- **Download CSV** (with UTF-8 BOM for Excel)
- **Download Excel (.xls)** (native XML spreadsheet format)
- **Download JSON**
- **Copy to Clipboard** (TSV format—paste directly into Google Sheets or Excel)

---

## 🛠️ Multi-Browser Installation Instructions

### 🌐 Microsoft Edge
1. Open Microsoft Edge.
2. In the address bar, navigate to:
   ```text
   edge://extensions/
   ```
3. In the left navigation sidebar, toggle **"Developer mode"** to **ON**.
4. Click the **"Load unpacked"** button at the top.
5. In the file dialog, choose the `chrome_extension` folder:
   ```text
   c:\Users\SHASHVAT RAI\OneDrive\Desktop\SHASHVAT (MCA)\dessertation project\chrome_extension
   ```
6. The extension will appear in your Edge toolbar. Click the puzzle icon to pin it!

### 🦊 Mozilla Firefox
1. Open Mozilla Firefox.
2. In the address bar, navigate to:
   ```text
   about:debugging#/runtime/this-firefox
   ```
3. Click the **"Load Temporary Add-on..."** button.
4. Navigate inside the `chrome_extension` folder and select the `manifest.json` file.
5. The extension will load with its Gecko extension ID (`aetherbi-cleaner@shashvat.ai`) and will appear in your Firefox toolbar!

### 🟢 Google Chrome / Brave / Opera
1. Open Google Chrome.
2. In the address bar, navigate to:
   ```text
   chrome://extensions/
   ```
3. In the top-right corner, toggle **Developer mode** to **ON**.
4. Click the **"Load unpacked"** button in the top-left toolbar.
5. Select the `chrome_extension` folder:
   ```text
   c:\Users\SHASHVAT RAI\OneDrive\Desktop\SHASHVAT (MCA)\dessertation project\chrome_extension
   ```
6. The extension will now appear in your browser toolbar!

---

## 🧪 Testing with the Included Playground

1. Double-click or open `chrome_extension/test_webpage.html` in your browser (Edge, Firefox, or Chrome):
   ```text
   file:///c:/Users/SHASHVAT%20RAI/OneDrive/Desktop/SHASHVAT%20(MCA)/dessertation%20project/chrome_extension/test_webpage.html
   ```
2. Click the **AI Data Cleaner** extension icon in your browser toolbar.
3. You will immediately see:
   - **Table #1**: Employee Records (4 rows × 4 columns, 2 nulls, 1 duplicate, inconsistent `"hr"` casing).
   - Click **"Analyze Table"**.
   - Check the **Quality** tab (Score: ~56/100, warnings for nulls, casing, duplicates).
   - Click **"✨ Clean Automatically"**.
   - Review the **Preview** tab with **"Highlight Changes"** checked to see the before vs. after diff!
   - Try the **Charts** tab to view distributions and the **AI Chat** tab to ask questions.
   - Click **"Full Studio"** in the top right to open the widescreen multi-pane dashboard!
