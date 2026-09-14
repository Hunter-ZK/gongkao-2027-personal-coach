from __future__ import annotations

import hashlib
import json
import os
import shutil
import socket
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from db import DB_PATH, DATA, migrate

BASE = Path(__file__).resolve().parents[1]
REPO_ROOT = BASE.parent
SYNC_DIR = REPO_ROOT / os.environ.get("GONGKAO_SYNC_DIR", "sync_data")
SNAPSHOT_DB = SYNC_DIR / "study.db"
SNAPSHOT_IMAGES = SYNC_DIR / "images"
MANIFEST = SYNC_DIR / "manifest.json"
LOCAL_STATE = DATA / "sync-state.json"
BACKUPS = DATA / "backups"


class SyncError(RuntimeError):
    pass


class SyncConflict(SyncError):
    pass


def _run(*args: str, check: bool = True, timeout: int = 120) -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as exc:
        raise SyncError("未找到 Git。请先安装 Git，并使用 git clone 获取本项目。") from exc
    except subprocess.TimeoutExpired as exc:
        raise SyncError("Git 同步超时，请检查网络后重试。") from exc
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout or "Git 命令执行失败").strip()
        raise SyncError(detail[:1000])
    return result.stdout.strip()


def _ensure_repo() -> None:
    if not (REPO_ROOT / ".git").exists():
        raise SyncError("当前目录不是 Git 克隆仓库，无法使用双设备同步。请通过 git clone 获取项目后再使用。")


def _sha256(path: Path) -> str | None:
    if not path.exists():
        return None
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _local_state() -> dict[str, Any]:
    return _read_json(LOCAL_STATE, {})


def _upstream() -> str | None:
    value = _run("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}", check=False)
    return value or None


def _ahead_behind() -> tuple[int, int]:
    if not _upstream():
        return 0, 0
    raw = _run("rev-list", "--left-right", "--count", "HEAD...@{u}", check=False)
    try:
        ahead, behind = raw.split()
        return int(ahead), int(behind)
    except Exception:
        return 0, 0


def _remote_manifest() -> dict[str, Any] | None:
    upstream = _upstream()
    if not upstream:
        return None
    rel = MANIFEST.relative_to(REPO_ROOT).as_posix()
    raw = _run("show", f"{upstream}:{rel}", check=False)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _image_count(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(1 for item in path.rglob("*") if item.is_file())


def _backup_sqlite(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".tmp")
    if tmp.exists():
        tmp.unlink()
    src = sqlite3.connect(source)
    dst = sqlite3.connect(tmp)
    try:
        src.execute("PRAGMA wal_checkpoint(FULL)")
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    tmp.replace(target)


def _copy_images(source: Path, target: Path) -> None:
    if not source.exists():
        return
    target.mkdir(parents=True, exist_ok=True)
    for item in source.rglob("*"):
        if not item.is_file():
            continue
        dest = target / item.relative_to(source)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, dest)


def _current_db_dirty() -> bool:
    state = _local_state()
    known = state.get("db_sha256")
    current = _sha256(DB_PATH)
    return bool(known and current and known != current)


def status(*, refresh_remote: bool = False) -> dict[str, Any]:
    try:
        _ensure_repo()
        if refresh_remote:
            _run("fetch", "--quiet", check=False, timeout=60)
        branch = _run("branch", "--show-current", check=False) or "detached"
        upstream = _upstream()
        ahead, behind = _ahead_behind()
        local_manifest = _read_json(MANIFEST, {}) if MANIFEST.exists() else None
        remote_manifest = _remote_manifest()
        state = _local_state()
        return {
            "available": True,
            "branch": branch,
            "upstream": upstream,
            "origin": _run("remote", "get-url", "origin", check=False) or None,
            "ahead": ahead,
            "behind": behind,
            "local_dirty": _current_db_dirty(),
            "last_sync_revision": state.get("revision"),
            "last_sync_at": state.get("synced_at"),
            "checkpoint_revision": (local_manifest or {}).get("revision"),
            "remote_revision": (remote_manifest or {}).get("revision"),
            "remote_device": (remote_manifest or {}).get("device"),
            "remote_created_at": (remote_manifest or {}).get("created_at"),
            "snapshot_exists": SNAPSHOT_DB.exists(),
            "note": "同步只上传学习数据库与题目图片；DeepSeek API Key、密钥配置和本机临时文件不会进入同步快照。",
        }
    except SyncError as exc:
        return {"available": False, "error": str(exc)}


def push_checkpoint() -> dict[str, Any]:
    _ensure_repo()
    _run("fetch", "--quiet", check=False, timeout=60)
    upstream = _upstream()
    _, behind = _ahead_behind()
    if upstream and behind > 0:
        raise SyncConflict(f"云端已有 {behind} 个新提交。请先点击“拉取云端”再提交本机进度。")
    if not DB_PATH.exists():
        raise SyncError("本机学习数据库尚不存在，暂无可同步数据。")

    SYNC_DIR.mkdir(parents=True, exist_ok=True)
    _backup_sqlite(DB_PATH, SNAPSHOT_DB)
    _copy_images(DATA / "images", SNAPSHOT_IMAGES)
    now = datetime.now(timezone.utc).astimezone()
    db_sha = _sha256(SNAPSHOT_DB)
    revision = now.strftime("%Y%m%dT%H%M%S%z")
    manifest = {
        "format": 1,
        "revision": revision,
        "created_at": now.isoformat(timespec="seconds"),
        "device": socket.gethostname(),
        "db_sha256": db_sha,
        "image_count": _image_count(SNAPSHOT_IMAGES),
        "policy": "personal study checkpoint; excludes API keys and secret config",
    }
    _write_json(MANIFEST, manifest)

    rel = SYNC_DIR.relative_to(REPO_ROOT).as_posix()
    _run("add", "--", rel)
    changed = subprocess.run(
        ["git", "diff", "--cached", "--quiet", "--", rel],
        cwd=REPO_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    ).returncode != 0
    if changed:
        _run("commit", "-m", f"sync(workbench): checkpoint {revision}")
    if upstream:
        _run("push", timeout=120)
    else:
        branch = _run("branch", "--show-current")
        _run("push", "-u", "origin", branch, timeout=120)

    current_sha = _sha256(DB_PATH)
    _write_json(LOCAL_STATE, {
        "revision": revision,
        "synced_at": now.isoformat(timespec="seconds"),
        "db_sha256": current_sha,
        "device": socket.gethostname(),
    })
    return {"ok": True, "action": "push", "revision": revision, "status": status(refresh_remote=False)}


def pull_checkpoint(*, force: bool = False) -> dict[str, Any]:
    _ensure_repo()
    _run("fetch", "--quiet", timeout=60)
    remote = _remote_manifest()
    if not remote:
        raise SyncError("云端还没有工作台数据快照。请先在另一台设备点击“提交同步”。")

    state = _local_state()
    remote_revision = remote.get("revision")
    has_unsynced_local = _current_db_dirty()
    if has_unsynced_local and remote_revision != state.get("revision") and not force:
        raise SyncConflict("本机有未提交学习数据，同时云端也有新版本。为避免覆盖，请先提交本机进度；如确定丢弃本机变更，可使用强制拉取。")

    BACKUPS.mkdir(parents=True, exist_ok=True)
    backup = None
    if DB_PATH.exists():
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = BACKUPS / f"study-before-sync-{stamp}.db"
        _backup_sqlite(DB_PATH, backup)

    head_before = _run("rev-parse", "HEAD", check=False)
    _run("pull", "--rebase", "--autostash", timeout=120)
    if not SNAPSHOT_DB.exists():
        raise SyncError("已拉取仓库，但同步快照缺少 study.db。")

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    for suffix in ("-wal", "-shm"):
        extra = Path(str(DB_PATH) + suffix)
        if extra.exists():
            extra.unlink()
    tmp = DB_PATH.with_suffix(DB_PATH.suffix + ".sync-tmp")
    shutil.copy2(SNAPSHOT_DB, tmp)
    tmp.replace(DB_PATH)
    _copy_images(SNAPSHOT_IMAGES, DATA / "images")
    migrate()

    manifest = _read_json(MANIFEST, remote)
    now = datetime.now(timezone.utc).astimezone()
    _write_json(LOCAL_STATE, {
        "revision": manifest.get("revision"),
        "synced_at": now.isoformat(timespec="seconds"),
        "db_sha256": _sha256(DB_PATH),
        "device": socket.gethostname(),
    })
    head_after = _run("rev-parse", "HEAD", check=False)
    return {
        "ok": True,
        "action": "pull",
        "revision": manifest.get("revision"),
        "backup": str(backup) if backup else None,
        "restart_recommended": bool(head_before and head_after and head_before != head_after),
        "status": status(refresh_remote=False),
    }
