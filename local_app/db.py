from __future__ import annotations
import json, sqlite3, os
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
DB_PATH = Path(os.environ.get("GONGKAO_DB_PATH", str(DATA / "study.db")))
MIGRATIONS = BASE / "migrations"


def now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _raw_connect(path=None):
    p = Path(path or DB_PATH)
    p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(p)
    conn.row_factory = sqlite3.Row
    return conn


def connect():
    DATA.mkdir(parents=True, exist_ok=True)
    conn = _raw_connect(DB_PATH)
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
        conn.rollback()
        raise
    finally:
        conn.close()


def query(sql, params=()):
    with connect() as c:
        return [dict(r) for r in c.execute(sql, params).fetchall()]


def query_one(sql, params=()):
    with connect() as c:
        row = c.execute(sql, params).fetchone()
        return dict(row) if row else None


def execute(sql, params=()):
    with transaction() as c:
        cur = c.execute(sql, params)
        return cur.lastrowid


def executescript(sql):
    with transaction() as c:
        c.executescript(sql)


def jdump(v):
    return json.dumps(v, ensure_ascii=False)


def jload(v, default=None):
    if v is None:
        return default
    try:
        return json.loads(v)
    except Exception:
        return default


def _table_exists(conn, name):
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone() is not None


def _columns(conn, name):
    if not _table_exists(conn, name):
        return set()
    return {r[1] for r in conn.execute(f'PRAGMA table_info("{name}")')}


def _legacy_v0_detected(conn):
    training = _columns(conn, "training")
    sessions = _columns(conn, "study_session")
    return bool(
        (training and "trained_on" not in training and {"filename", "total", "correct"}.issubset(training))
        or (sessions and "study_date" not in sessions and {"activity", "task", "start_at"}.issubset(sessions))
    )


def _snapshot_legacy_v0():
    """If the pre-rebuild Flask database is present, snapshot it and reset safely.

    The old and new schemas reuse table names with incompatible columns. SQLite
    CREATE TABLE IF NOT EXISTS cannot upgrade those tables in-place. We therefore
    back up the old DB, read the rows, recreate the new schema, and import the
    recoverable records conservatively.
    """
    if not DB_PATH.exists():
        return None

    src = _raw_connect(DB_PATH)
    try:
        if not _legacy_v0_detected(src):
            return None

        snapshot = {}
        for name in ("training", "questions", "study_session", "review_log"):
            snapshot[name] = [dict(r) for r in src.execute(f'SELECT * FROM "{name}"').fetchall()] if _table_exists(src, name) else []

        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_path = DB_PATH.with_name(f"{DB_PATH.stem}.legacy-v0-{stamp}.db")
        dst = sqlite3.connect(backup_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
        snapshot["backup_path"] = str(backup_path)
    finally:
        src.close()

    for p in (DB_PATH, Path(str(DB_PATH) + "-wal"), Path(str(DB_PATH) + "-shm")):
        try:
            if p.exists():
                p.unlink()
        except OSError:
            pass
    return snapshot


def _import_legacy_v0(snapshot):
    if not snapshot:
        return

    trainings = snapshot.get("training", [])
    questions = snapshot.get("questions", [])
    sessions = snapshot.get("study_session", [])

    training_created = {r.get("id"): (r.get("created_at") or now_iso()) for r in trainings}
    with transaction() as c:
        for r in trainings:
            created = r.get("created_at") or now_iso()
            trained_on = str(created)[:10] if created else datetime.now().date().isoformat()
            c.execute(
                """INSERT OR REPLACE INTO training
                (id,trained_on,source,exam_type,is_timed,is_full_paper,total_q,correct_q,duration_sec,data_confidence,note,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    r.get("id"), trained_on, "other", "na", 1 if (r.get("duration_sec") or 0) > 0 else 0, 0,
                    r.get("total") or 0, r.get("correct") or 0, r.get("duration_sec") or 0, "needs_review",
                    f"旧版数据库自动迁移；原文件={r.get('filename') or '—'}；原解析置信度={r.get('parser_conf') if r.get('parser_conf') is not None else '—'}；完整旧库备份={snapshot.get('backup_path','')}",
                    created,
                ),
            )

        for r in questions:
            created = training_created.get(r.get("training_id"), now_iso())
            c.execute(
                """INSERT OR REPLACE INTO question
                (id,training_id,seq,module,subtype,stem_md,options_json,user_answer,correct_answer,explanation_md,is_correct,
                 source_type,parse_confidence,raw_block,verified,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    r.get("id"), r.get("training_id"), r.get("seq"), r.get("module"), r.get("subtype"), r.get("stem"),
                    r.get("options_json") or "{}", r.get("user_answer"), r.get("correct_answer"), r.get("explanation"),
                    r.get("is_correct"), "legacy", r.get("import_conf") or 0, r.get("raw_text"), 0, created,
                ),
            )

        for r in sessions:
            start = r.get("start_at") or now_iso()
            end = r.get("end_at") or start
            duration = r.get("duration_sec") or 0
            old_category = r.get("category") or ""
            if old_category in ("深度学习", "deep") or duration >= 1800:
                category = "deep"
            elif old_category in ("专注学习", "focus") or duration >= 900:
                category = "focus"
            else:
                category = "fragment"
            old_subject = r.get("subject") or ""
            subject = "shenlun" if "申论" in old_subject else "xingce"
            c.execute(
                """INSERT OR REPLACE INTO study_session
                (id,study_date,start_at,end_at,duration_sec,paused_sec,subject,module,activity_type,task_name,category,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    r.get("id"), str(start)[:10], start, end, duration, 0, subject, old_subject or None,
                    r.get("activity") or "旧版学习记录", r.get("task"), category, start,
                ),
            )


def migrate():
    DATA.mkdir(parents=True, exist_ok=True)
    legacy = _snapshot_legacy_v0()

    with connect() as c:
        c.execute("CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)")
        done = {r[0] for r in c.execute("SELECT version FROM schema_version")}
        for path in sorted(MIGRATIONS.glob("*.sql")):
            try:
                ver = int(path.stem.split("_", 1)[0])
            except ValueError:
                continue
            if ver in done:
                continue
            c.executescript(path.read_text(encoding="utf-8"))
            c.execute("INSERT OR IGNORE INTO schema_version VALUES (?,?)", (ver, now_iso()))
        c.commit()

    _import_legacy_v0(legacy)
