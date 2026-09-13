@echo off
setlocal
cd /d %~dp0
if not exist .venv (
  py -3 -m venv .venv 2>nul || python -m venv .venv
)
call .venv\Scripts\activate
python -m pip install -q --upgrade pip
pip install -q -r requirements.txt
python app.py
