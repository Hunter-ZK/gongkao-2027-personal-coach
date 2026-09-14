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


def test_push_checkpoint_uses_isolated_git_remote_and_tracks_local_dirty(tmp_path, monkeypatch):
    seed = tmp_path / 'seed'
    seed.mkdir()
    git(seed, 'init', '-b', 'main')
    git(seed, 'config', 'user.name', 'Workbench Test')
    git(seed, 'config', 'user.email', 'workbench-test@example.invalid')
    (seed / 'gongkao_sync').mkdir()
    (seed / 'gongkao_sync' / 'README.md').write_text('private sync fixture\n', encoding='utf-8')
    git(seed, 'add', '.')
    git(seed, 'commit', '-m', 'init private data branch')

    remote = tmp_path / 'private-remote.git'
    subprocess.run(['git', 'init', '--bare', str(remote)], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    git(seed, 'remote', 'add', 'origin', str(remote))
    git(seed, 'push', '-u', 'origin', 'main')

    data = tmp_path / 'workbench-data'
    images = data / 'images'
    images.mkdir(parents=True)
    db_path = data / 'study.db'
    conn = sqlite3.connect(db_path)
    conn.execute('CREATE TABLE demo(id INTEGER PRIMARY KEY, value TEXT)')
    conn.execute('INSERT INTO demo(value) VALUES (?)', ('office',))
    conn.commit()
    conn.close()
    (images / 'q001.txt').write_text('image-fixture', encoding='utf-8')

    sync_repo = data / 'sync-repo'
    checkpoint = sync_repo / 'gongkao_sync' / 'checkpoint'
    monkeypatch.setattr(device_sync, 'SYNC_REMOTE_URL', str(remote))
    monkeypatch.setattr(device_sync, 'SYNC_BRANCH', 'main')
    monkeypatch.setattr(device_sync, 'SYNC_REPO', sync_repo)
    monkeypatch.setattr(device_sync, 'CHECKPOINT_DIR', checkpoint)
    monkeypatch.setattr(device_sync, 'SNAPSHOT_DB', checkpoint / 'study.db')
    monkeypatch.setattr(device_sync, 'SNAPSHOT_IMAGES', checkpoint / 'images')
    monkeypatch.setattr(device_sync, 'MANIFEST', checkpoint / 'manifest.json')
    monkeypatch.setattr(device_sync, 'DATA', data)
    monkeypatch.setattr(device_sync, 'DB_PATH', db_path)
    monkeypatch.setattr(device_sync, 'LOCAL_STATE', data / 'sync-state.json')
    monkeypatch.setattr(device_sync, 'BACKUPS', data / 'backups')

    pushed = device_sync.push_checkpoint()
    assert pushed['ok'] is True
    assert (checkpoint / 'study.db').exists()
    assert (checkpoint / 'images' / 'q001.txt').exists()
    manifest = json.loads((checkpoint / 'manifest.json').read_text(encoding='utf-8'))
    assert manifest['revision'] == pushed['revision']
    assert manifest['image_count'] == 1
    assert manifest['privacy'] == 'private GitHub backing branch'
    assert device_sync.status()['local_dirty'] is False

    remote_manifest = subprocess.run(
        ['git', '--git-dir', str(remote), 'show', 'main:gongkao_sync/checkpoint/manifest.json'],
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
