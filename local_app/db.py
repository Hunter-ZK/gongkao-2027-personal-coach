from __future__ import annotations
import json, sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import os

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
DB_PATH = Path(os.environ.get("GONGKAO_DB_PATH", str(DATA / "study.db")))
MIGRATIONS = BASE / "migrations"

def now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")

def connect():
    DATA.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn

@contextmanager
def transaction():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback(); raise
    finally:
        conn.close()

def query(sql, params=()):
    with connect() as c:
        return [dict(r) for r in c.execute(sql, params).fetchall()]

def query_one(sql, params=()):
    with connect() as c:
        row=c.execute(sql, params).fetchone()
        return dict(row) if row else None

def execute(sql, params=()):
    with transaction() as c:
        cur=c.execute(sql, params)
        return cur.lastrowid

def executescript(sql):
    with transaction() as c: c.executescript(sql)

def jdump(v): return json.dumps(v, ensure_ascii=False)
def jload(v, default=None):
    if v is None: return default
    try: return json.loads(v)
    except Exception: return default

def migrate():
    DATA.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.execute("CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)")
        done={r[0] for r in c.execute("SELECT version FROM schema_version")}
        for path in sorted(MIGRATIONS.glob("*.sql")):
            try: ver=int(path.stem.split("_",1)[0])
            except ValueError: continue
            if ver in done: continue
            c.executescript(path.read_text(encoding="utf-8"))
            c.execute("INSERT OR IGNORE INTO schema_version VALUES (?,?)", (ver, now_iso()))
        c.commit()
