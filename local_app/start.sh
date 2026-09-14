#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PYTHON_BIN="${PYTHON_BIN:-python3}"
"$PYTHON_BIN" - <<'PY'
import sys
if sys.version_info < (3,10):
    raise SystemExit('需要 Python 3.10 或更高版本。请先安装后重新运行。')
PY
if [ ! -x .venv/bin/python ]; then "$PYTHON_BIN" -m venv .venv; fi
.venv/bin/python -m pip install -U pip >/dev/null
.venv/bin/python -m pip install -r requirements.txt >/dev/null
.venv/bin/python tools/generate_missing_nodes.py
.venv/bin/python tools/import_legacy.py
.venv/bin/python tools/seed.py
(.venv/bin/python - <<'PY'
import time, webbrowser
time.sleep(2)
webbrowser.open('http://127.0.0.1:8000')
PY
) &
exec .venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
