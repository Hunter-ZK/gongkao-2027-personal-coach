from pathlib import Path

BASE = Path(__file__).resolve().parents[1]


def text(path: str) -> str:
    return (BASE / path).read_text(encoding='utf-8')


def test_ai_compat_router_is_mounted_before_spa_fallback():
    main = text('main.py')
    compat = text('routers/coach_compat.py')
    assert 'coach_compat.r' in main
    assert "@r.post('/config'" in compat
    assert "@r.put('/config/test'" in compat
    assert "@app.get('/{path:path}'" in main
