@echo off
chcp 65001 >nul
cd /d "%~dp0"
python -c "import sys; assert sys.version_info >= (3,10), '需要 Python 3.10 或更高版本。'" || exit /b 1
if not exist .venv\Scripts\python.exe python -m venv .venv
.venv\Scripts\python.exe -m pip install -U pip >nul
.venv\Scripts\python.exe -m pip install -r requirements.txt >nul
.venv\Scripts\python.exe tools\generate_missing_nodes.py
.venv\Scripts\python.exe tools\import_legacy.py
.venv\Scripts\python.exe tools\seed.py
.venv\Scripts\python.exe tools\run_local.py
