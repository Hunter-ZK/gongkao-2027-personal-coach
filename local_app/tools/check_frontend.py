from __future__ import annotations
import subprocess
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
JS_ROOT = BASE / 'static' / 'js'
files = sorted(JS_ROOT.rglob('*.js'))
if not files:
    raise SystemExit('No frontend JavaScript files found')
for path in files:
    subprocess.run(['node', '--check', str(path)], check=True)
    print(f'PASS {path.relative_to(BASE)}')
print(f'frontend syntax ok: {len(files)} files')
