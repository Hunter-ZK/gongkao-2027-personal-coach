from __future__ import annotations

import json
import os
import socket
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

import uvicorn

HOST = '127.0.0.1'
DEFAULT_PORT = 8000
MAX_PORT_ATTEMPTS = 20
BASE = Path(__file__).resolve().parents[1]
RUNTIME_FILE = BASE / 'data' / 'runtime.json'


def _port_is_available(host: str, port: int) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def choose_port(start_port: int = DEFAULT_PORT, attempts: int = MAX_PORT_ATTEMPTS) -> int:
    for port in range(start_port, start_port + max(1, attempts)):
        if _port_is_available(HOST, port):
            return port
    raise RuntimeError(f'本地端口 {start_port}-{start_port + attempts - 1} 均被占用，无法启动工作台。')


def _write_runtime(port: int, health: dict) -> None:
    RUNTIME_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        'pid': os.getpid(),
        'host': HOST,
        'port': port,
        'url': f'http://{HOST}:{port}',
        'version': health.get('version'),
        'started_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
    }
    RUNTIME_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')


def _wait_until_healthy_and_open(port: int, timeout_sec: float = 30.0) -> None:
    health_url = f'http://{HOST}:{port}/health'
    deadline = time.monotonic() + timeout_sec
    last_error = ''
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(health_url, timeout=1.0) as response:
                payload = json.loads(response.read().decode('utf-8'))
            if payload.get('ok') and payload.get('service') == 'gongkao-workbench':
                _write_runtime(port, payload)
                url = f'http://{HOST}:{port}'
                print(f'[workbench] 已启动：{url} · backend {payload.get("version") or "unknown"}', flush=True)
                webbrowser.open(url)
                return
            last_error = f'health payload={payload!r}'
        except (OSError, ValueError, urllib.error.URLError) as exc:
            last_error = str(exc)
        time.sleep(0.25)
    print(f'[workbench] 服务启动后健康检查未通过：{last_error}', flush=True)


def main() -> None:
    requested = int(os.environ.get('WORKBENCH_PORT', DEFAULT_PORT))
    port = choose_port(requested)
    if port != requested:
        print(
            f'[workbench] 端口 {requested} 已被占用。为避免连接到旧版后端，本次自动改用 {port}。',
            flush=True,
        )
    threading.Thread(target=_wait_until_healthy_and_open, args=(port,), daemon=True).start()
    uvicorn.run('main:app', host=HOST, port=port, reload=False)


if __name__ == '__main__':
    main()
