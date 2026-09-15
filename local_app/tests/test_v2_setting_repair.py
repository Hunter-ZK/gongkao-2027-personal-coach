import sqlite3
from pathlib import Path


BASE = Path(__file__).resolve().parents[1]
MIGRATION = BASE / 'migrations' / '006_repair_v2_setting_shapes.sql'


def test_v2_setting_shape_repair_keeps_valid_and_drops_stale_shapes(tmp_path):
    db = tmp_path / 'shape.db'
    conn = sqlite3.connect(db)
    conn.execute('CREATE TABLE setting(key TEXT PRIMARY KEY,value_json TEXT NOT NULL,updated_at TEXT NOT NULL)')
    rows = [
        ('note_view_history_v1', '[]', 'now'),
        ('method_adoption_v1', '{"node":{}}', 'now'),
        ('method_validation_v1', '"legacy"', 'now'),
        ('background_imports_v2', '{}', 'now'),
        ('note_expansions:node::s01', '{}', 'now'),
        ('note_expansions:node::s02', '[]', 'now'),
        ('unrelated_setting', '[]', 'now'),
    ]
    conn.executemany('INSERT INTO setting VALUES(?,?,?)', rows)
    conn.executescript(MIGRATION.read_text(encoding='utf-8'))
    remaining = {row[0]: row[1] for row in conn.execute('SELECT key,value_json FROM setting')}
    conn.close()

    assert 'note_view_history_v1' not in remaining
    assert 'method_validation_v1' not in remaining
    assert 'note_expansions:node::s01' not in remaining
    assert remaining['method_adoption_v1'].startswith('{')
    assert remaining['background_imports_v2'].startswith('{')
    assert remaining['note_expansions:node::s02'].startswith('[')
    assert remaining['unrelated_setting'] == '[]'
