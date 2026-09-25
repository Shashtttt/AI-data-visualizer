# Data Analyzer & Predictive BI Platform (AetherBI)

> A modern, browser-native Business Intelligence, Data Cleaning, and AutoML Platform with an interactive glassmorphic UI.

---

## 🌟 Key Features

- **⚡ Fast In-Memory Processing:** Ingest and profile datasets (`.csv`, `.xlsx`, `.xls`, `.json`, `.tsv`, `.parquet`) in milliseconds with automatic schema inference and missing value detection.
- **🧹 Interactive Data Cleaner:** Visual transformation pipeline supporting missing value imputation (Mean/Median/Mode/Forward/Backward fill), outlier handling (IQR, Z-score), deduplication, categorical encoding, scaling, and full Undo/Redo version history.
- **📊 Smart Analytics Suite:** Automated statistical summaries, Pearson/Spearman correlation heatmaps, anomaly detection, and time-series forecasting.
- **📈 18+ Interactive Chart Archetypes:** Powered by Chart.js (Bar, Stacked Bar, Line, Area, Scatter, Bubble, Pie, Doughnut, Polar Area, Radar, Boxplot, Violin, Treemap, Waterfall, Funnel, Gauge).
- **📋 Executive Dashboard Report Builder:** Dynamic multi-tile KPI grid, AI-powered narrative summary generator, drag-and-drop tile arrangement, and direct export to PDF, PNG, and shareable web links.
- **🤖 7-Step Guided Predictive AI (AutoML) Wizard:**
  1. *Problem Formulation:* Classification vs. Regression task definition.
  2. *Auto-Profiling & Industry Detection:* Automated domain classification (Finance, Healthcare, Retail, Education, HR).
  3. *AutoML Multi-Model Training:* Benchmark Random Forest, Logistic/Linear Regression, Gradient Boosting, and XGBoost with automated leaderboards.
  4. *Explainable AI (XAI):* Feature importance rankings and SHAP interpretability charts.
  5. *Interactive What-If Scenario Simulator:* Real-time parameter sliders with instant prediction updates.
  6. *Prescriptive Business Recommendations:* Rule-driven and AI action plans.
  7. *Executive ML Dossier Export:* Standalone PDF/HTML report generation.
- **🎨 Glassmorphic Multi-Theme UI:** 8 dynamic runtime themes (*Cosmic Neon, OLED Pure Black, Cyber Slate, Dracula Amethyst, Midnight Ocean, Ember Sunset, Aurora Green, Clean Light Mode*) with smooth ambient glow animations.

---

## 🏗️ Architecture & Technology Stack

- **Backend:** Python 3.10+, Flask, Pandas, NumPy, Scikit-learn, XGBoost, SHAP, SciPy, ReportLab.
- **Frontend:** Vanilla HTML5, Modern CSS3 (Glassmorphism, CSS Custom Properties, Grid/Flexbox), ES6+ JavaScript, Chart.js.
- **Storage & Auth:** Local SQLite database, optional Firebase Auth & Cloud Storage integration.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.10 or higher
- Git installed on your system

### 2. Clone the Repository
```bash
git clone https://github.com/<your-username>/data-analyzer-bi-platform.git
cd data-analyzer-bi-platform
```

### 3. Create & Activate Virtual Environment
```bash
# Windows
python -m venv .venv
.venv\Scripts\activate

# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

### 4. Install Dependencies
```bash
pip install -r requirements.txt
```

### 5. Setup Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(Optional)* Add your Firebase credentials or leave default for local SQLite operation.

### 6. Run the Application
```bash
python backend/app.py
```
Open your browser and navigate to: **`http://127.0.0.1:5000`**

*(On Windows, you can also simply double-click `run.bat` to launch automatically).*

---

## 📂 Project Structure

```
├── backend/
│   ├── app.py                  # Flask REST API endpoints & route handling
│   ├── cleaner.py              # In-memory Pandas transformation pipeline
│   ├── predictor.py            # AutoML training, evaluation & SHAP explainability
│   ├── report_generator.py     # PDF & HTML report rendering service
│   ├── db.py                   # Local SQLite authentication & metadata store
│   ├── firebase_config.py      # Optional Firebase client configuration
│   ├── firebase_storage_helper.py # Cloud storage integration
│   └── share_manager.py        # Tokenized public dashboard links
├── templates/
│   ├── index.html              # Main SPA interface template
│   └── share.html              # Read-only public dashboard view
├── static/
│   ├── css/
│   │   ├── style.css           # Core glassmorphic design system & themes
│   │   └── predict.css         # 7-Step Predictive AI wizard styling
│   └── js/
│       ├── app.js              # SPA controller, API integration & state store
│       ├── charts.js           # Chart.js archetype renderer & configurations
│       └── predict.js          # Interactive AutoML wizard & simulation controller
├── datasets/                   # Sample & active user datasets (git-ignored)
├── requirements.txt            # Python dependencies
├── run.bat                     # Windows 1-click startup script
└── README.md                   # Project documentation
```

---

## 🔒 Security & Privacy

- All sensitive keys (`.env`, `serviceAccountKey.json`), local databases (`users.db`), and user-uploaded datasets (`datasets/`) are explicitly excluded from version control via `.gitignore`.
- Data cleaning and machine learning inference run entirely in-memory on the local server without transferring proprietary data to external servers by default.

---

## 📄 License
This project is developed as an academic dissertation project.
