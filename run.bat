@echo off
title Data Analyzer - Launching Environment
echo ===================================================
echo           DATA ANALYZER LAUNCHER SYSTEM
echo ===================================================
echo.

:: Check if virtual environment exists
if not exist .venv (
    echo [INFO] Creating Python Virtual Environment ^(.venv^)...
    py -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment. Ensure Python is installed.
        pause
        exit /b 1
    )
    echo [INFO] Virtual environment created successfully.
    echo.
)

:: Install dependencies
echo [INFO] Activating virtual environment and installing dependencies...
call .venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
:: Fallback in case requirements pinning has issues on Python 3.14
if errorlevel 1 (
    echo [WARNING] requirements.txt failed. Installing latest Flask, Pandas and openpyxl...
    python -m pip install flask pandas openpyxl
)
echo.

:: Create datasets directory if missing
if not exist datasets (
    mkdir datasets
    echo [INFO] Created datasets directory.
)

:: Create sample datasets if they don't exist
echo [INFO] Generating sample datasets for testing...
python generate_datasets.py

echo.
echo ===================================================
echo [SUCCESS] Data Analyzer Environment is Ready!
echo [INFO] Starting Flask Server on http://127.0.0.1:5000
echo ===================================================
echo.
python backend/app.py
pause
