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
SYNC_REMOTE_URL = os.environ.get(
    "GONGKAO_SYNC_REMOTE",
    "https://github.com/Hunter-ZK/Civil_gemini2.git",
)
SYNC_BRANCH = os.environ.get("GONGKAO_SYNC_BRANCH", "gongkao-personal-data")
SYNC_REPO = DATA / "sync-repo"
CHECKPOINT_DIR = SYNC_REPO / "gongkao_sync" / "checkpoint"
SNAPSHOT_DB = CHECKPOINT_DIR / "study.db"
SNAPSHOT_IMAGES = CHECKPOINT_DIR / "images"
MANIFEST = CHECKPOINT_DIR / "manifest.json"
LOCAL_STATE = DATA / "sync-state.json"
BACKUPS = DATA / "backups"


class SyncError(RuntimeError):
    pass


class SyncConflict(SyncError):
    pass


def _git(cwd: Path, *args: str, check: bool = True, timeout: int = 120) -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=cwd,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as exc:
        raise SyncError("未找到 Git。请先安装 Git 后再使用双设备同步。") from exc
    except subprocess.TimeoutExpired as exc:
        raise SyncError("Git 同步超时，请检查网络后重试。") from exc
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout or "Git 命令执行失败").strip()
        if "Authentication failed" in detail or "could not read Username" in detail or "Repository not found" in detail:
            raise SyncError(
                "无法访问私有同步仓库。请先在本机 Git 登录你的 GitHub 账号（能访问 Hunter-ZK/Civil_gemini2），再重试。"
            )
        raise SyncError(detail[:1000])
    return result.stdout.strip()


def _ensure_sync_repo(*, fetch: bool = False) -> None:
    git_dir = SYNC_REPO / ".git"
    if not git_dir.exists():
        if SYNC_REPO.exists():
            shutil.rmtree(SYNC_REPO, ignore_errors=True)
        SYNC_REPO.parent.mkdir(parents=True, exist_ok=True)
        _git(
            SYNC_REPO.parent,
            "clone",
            "--branch",
            SYNC_BRANCH,
            "--single-branch",
            SYNC_REMOTE_URL,
            str(SYNC_REPO),
            timeout=120,
        )
        _git(SYNC_REPO, "config", "user.name", "Gongkao Workbench")
        _git(SYNC_REPO, "config", "user.email", "gongkao-workbench@users.noreply.github.com")
    if fetch:
        _git(SYNC_REPO, "fetch", "origin", SYNC_BRANCH, "--quiet", timeout=60)


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


def _remote_ref() -> str:
    return f"origin/{SYNC_BRANCH}"


def _ahead_behind() -> tuple[int, int]:
    if not (SYNC_REPO / ".git").exists():
        return 0, 0
    raw = _git(SYNC_REPO, "rev-list", "--left-right", "--count", f"HEAD...{_remote_ref()}", check=False)
    try:
        ahead, behind = raw.split()
        return int(ahead), int(behind)
    except Exception:
        return 0, 0


def _remote_manifest() -> dict[str, Any] | None:
    if not (SYNC_REPO / ".git").exists():
        return None
    rel = MANIFEST.relative_to(SYNC_REPO).as_posix()
    raw = _git(SYNC_REPO, "show", f"{_remote_ref()}:{rel}", check=False)
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


def _replace_images(source: Path, target: Path) -> None:
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)
    if not source.exists():
        target.mkdir(parents=True, exist_ok=True)
        return
    target.mkdir(parents=True, exist_ok=True)
    for item in source.rglob("*"):
        if not item.is_file():
            continue
        dest = target / item.relative_to(source)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, dest)


def _current_db_dirty() -> bool:
    current = _sha256(DB_PATH)
    if current is None:
        return False
    state = _local_state()
    known = state.get("db_sha256")
    return known != current


def status(*, refresh_remote: bool = False) -> dict[str, Any]:
    state = _local_state()
    initialized = (SYNC_REPO / ".git").exists()
    try:
        if refresh_remote:
            _ensure_sync_repo(fetch=True)
            initialized = True
        remote_manifest = _remote_manifest() if initialized else None
        ahead, behind = _ahead_behind() if initialized else (0, 0)
        return {
            "available": True,
            "configured": True,
            "initialized": initialized,
            "branch": SYNC_BRANCH,
            "origin": SYNC_REMOTE_URL,
            "private_backing": "Hunter-ZK/Civil_gemini2",
            "ahead": ahead,
            "behind": behind,
            "local_dirty": _current_db_dirty(),
            "last_sync_revision": state.get("revision"),
            "last_sync_at": state.get("synced_at"),
            "checkpoint_revision": (_read_json(MANIFEST, {}) or {}).get("revision") if initialized else None,
            "remote_revision": (remote_manifest or {}).get("revision"),
            "remote_device": (remote_manifest or {}).get("device"),
            "remote_created_at": (remote_manifest or {}).get("created_at"),
            "snapshot_exists": SNAPSHOT_DB.exists() if initialized else False,
            "note": "个人学习快照写入私有 Civil_gemini2 的 gongkao-personal-data 分支；公开公考代码仓库不会保存 SQLite、题目图片、API Key 或密钥配置。",
        }
    except SyncError as exc:
        return {
            "available": False,
            "configured": True,
            "initialized": initialized,
            "branch": SYNC_BRANCH,
            "origin": SYNC_REMOTE_URL,
            "error": str(exc),
        }


def push_checkpoint() -> dict[str, Any]:
    if not DB_PATH.exists():
        raise SyncError("本机学习数据库尚不存在，暂无可同步数据。")
    _ensure_sync_repo(fetch=True)
    _, behind = _ahead_behind()
    if behind > 0:
        raise SyncConflict(f"私有云端已有 {behind} 个新提交。请先点击“拉取云端”再提交本机进度。")

    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    _backup_sqlite(DB_PATH, SNAPSHOT_DB)
    _replace_images(DATA / "images", SNAPSHOT_IMAGES)
    now = datetime.now(timezone.utc).astimezone()
    revision = now.strftime("%Y%m%dT%H%M%S%z")
    manifest = {
        "format": 2,
        "revision": revision,
        "created_at": now.isoformat(timespec="seconds"),
        "device": socket.gethostname(),
        "db_sha256": _sha256(SNAPSHOT_DB),
        "image_count": _image_count(SNAPSHOT_IMAGES),
        "privacy": "private GitHub backing branch",
        "policy": "personal study checkpoint; excludes API keys and secret config",
    }
    _write_json(MANIFEST, manifest)

    rel = CHECKPOINT_DIR.relative_to(SYNC_REPO).as_posix()
    _git(SYNC_REPO, "add", "--", rel)
    changed = subprocess.run(
        ["git", "diff", "--cached", "--quiet", "--", rel],
        cwd=SYNC_REPO,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    ).returncode != 0
    if changed:
        _git(SYNC_REPO, "commit", "-m", f"sync(workbench): checkpoint {revision}")
        _git(SYNC_REPO, "push", "origin", f"HEAD:{SYNC_BRANCH}", timeout=120)

    _write_json(LOCAL_STATE, {
        "revision": revision,
        "synced_at": now.isoformat(timespec="seconds"),
        "db_sha256": _sha256(DB_PATH),
        "device": socket.gethostname(),
    })
    return {"ok": True, "action": "push", "revision": revision, "status": status(refresh_remote=True)}


def pull_checkpoint(*, force: bool = False) -> dict[str, Any]:
    _ensure_sync_repo(fetch=True)
    remote = _remote_manifest()
    if not remote:
        raise SyncError("私有云端还没有工作台数据快照。请先在另一台设备点击“提交本机进度”。")

    state = _local_state()
    remote_revision = remote.get("revision")
    has_unsynced_local = _current_db_dirty()
    if has_unsynced_local and remote_revision != state.get("revision") and not force:
        raise SyncConflict("本机有未提交学习数据，同时私有云端也有新版本。为避免覆盖，请先提交本机进度；如确定丢弃本机变更，可使用强制拉取。")

    BACKUPS.mkdir(parents=True, exist_ok=True)
    backup = None
    if DB_PATH.exists():
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = BACKUPS / f"study-before-sync-{stamp}.db"
        _backup_sqlite(DB_PATH, backup)

    ahead, behind = _ahead_behind()
    if ahead and behind:
        raise SyncConflict("同步缓存分支出现分叉，系统已停止自动覆盖。请先保留本机备份并检查两台设备的同步顺序。")
    if behind:
        _git(SYNC_REPO, "pull", "--ff-only", "origin", SYNC_BRANCH, timeout=120)
    elif ahead:
        raise SyncConflict("本机存在尚未推送的同步提交。请先点击“提交本机进度”，不要直接拉取覆盖。")

    if not SNAPSHOT_DB.exists():
        raise SyncError("已读取私有同步仓库，但快照缺少 study.db。")

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    for suffix in ("-wal", "-shm"):
        extra = Path(str(DB_PATH) + suffix)
        if extra.exists():
            extra.unlink()
    tmp = DB_PATH.with_suffix(DB_PATH.suffix + ".sync-tmp")
    shutil.copy2(SNAPSHOT_DB, tmp)
    tmp.replace(DB_PATH)
    _replace_images(SNAPSHOT_IMAGES, DATA / "images")
    migrate()

    manifest = _read_json(MANIFEST, remote)
    now = datetime.now(timezone.utc).astimezone()
    _write_json(LOCAL_STATE, {
        "revision": manifest.get("revision"),
        "synced_at": now.isoformat(timespec="seconds"),
        "db_sha256": _sha256(DB_PATH),
        "device": socket.gethostname(),
    })
    return {
        "ok": True,
        "action": "pull",
        "revision": manifest.get("revision"),
        "backup": str(backup) if backup else None,
        "restart_recommended": False,
        "status": status(refresh_remote=False),
    }
