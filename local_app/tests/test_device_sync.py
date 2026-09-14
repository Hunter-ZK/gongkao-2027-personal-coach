from __future__ import annotations

import json
import sqlite3
import subprocess
from pathlib import Path

from services import device_sync


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ['git', *args],
        cwd=repo,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout.strip()


def test_push_checkpoint_uses_real_git_remote_and_tracks_local_dirty(tmp_path, monkeypatch):
    repo = tmp_path / 'workbench'
    repo.mkdir()
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.name', 'Workbench Test')
    git(repo, 'config', 'user.email', 'workbench-test@example.invalid')
    (repo / 'README.md').write_text('test\n', encoding='utf-8')
    git(repo, 'add', 'README.md')
    git(repo, 'commit', '-m', 'init')

    remote = tmp_path / 'remote.git'
    subprocess.run(['git', 'init', '--bare', str(remote)], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    git(repo, 'remote', 'add', 'origin', str(remote))
    git(repo, 'push', '-u', 'origin', 'main')

    data = repo / 'local_app' / 'data'
    images = data / 'images'
    images.mkdir(parents=True)
    db_path = data / 'study.db'
    conn = sqlite3.connect(db_path)
    conn.execute('CREATE TABLE demo(id INTEGER PRIMARY KEY, value TEXT)')
    conn.execute('INSERT INTO demo(value) VALUES (?)', ('office',))
    conn.commit()
    conn.close()
    (images / 'q001.txt').write_text('image-fixture', encoding='utf-8')

    sync_dir = repo / 'sync_data'
    monkeypatch.setattr(device_sync, 'REPO_ROOT', repo)
    monkeypatch.setattr(device_sync, 'DATA', data)
    monkeypatch.setattr(device_sync, 'DB_PATH', db_path)
    monkeypatch.setattr(device_sync, 'SYNC_DIR', sync_dir)
    monkeypatch.setattr(device_sync, 'SNAPSHOT_DB', sync_dir / 'study.db')
    monkeypatch.setattr(device_sync, 'SNAPSHOT_IMAGES', sync_dir / 'images')
    monkeypatch.setattr(device_sync, 'MANIFEST', sync_dir / 'manifest.json')
    monkeypatch.setattr(device_sync, 'LOCAL_STATE', data / 'sync-state.json')
    monkeypatch.setattr(device_sync, 'BACKUPS', data / 'backups')

    pushed = device_sync.push_checkpoint()
    assert pushed['ok'] is True
    assert (sync_dir / 'study.db').exists()
    assert (sync_dir / 'images' / 'q001.txt').exists()
    manifest = json.loads((sync_dir / 'manifest.json').read_text(encoding='utf-8'))
    assert manifest['revision'] == pushed['revision']
    assert manifest['image_count'] == 1
    assert device_sync.status()['local_dirty'] is False

    remote_manifest = subprocess.run(
        ['git', '--git-dir', str(remote), 'show', 'main:sync_data/manifest.json'],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ).stdout
    assert json.loads(remote_manifest)['revision'] == pushed['revision']

    conn = sqlite3.connect(db_path)
    conn.execute('INSERT INTO demo(value) VALUES (?)', ('home-change',))
    conn.commit()
    conn.close()
    assert device_sync.status()['local_dirty'] is True
