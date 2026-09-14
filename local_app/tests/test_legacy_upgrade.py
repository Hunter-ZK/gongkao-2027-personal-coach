import importlib
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient


def test_legacy_flask_database_upgrades_and_dashboard_loads(tmp_path, monkeypatch):
    db_path = tmp_path / 'study.db'
    c = sqlite3.connect(db_path)
    c.executescript('''
    CREATE TABLE training(id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, filename TEXT, created_at TEXT, total INTEGER, correct INTEGER, duration_sec INTEGER DEFAULT 0, parser_conf REAL DEFAULT 0);
    CREATE TABLE questions(id INTEGER PRIMARY KEY AUTOINCREMENT, training_id INTEGER, seq INTEGER, module TEXT, subtype TEXT, stem TEXT, options_json TEXT, user_answer TEXT, correct_answer TEXT, explanation TEXT, is_correct INTEGER, raw_text TEXT, import_conf REAL DEFAULT 0);
    CREATE TABLE review_log(id INTEGER PRIMARY KEY AUTOINCREMENT, question_id INTEGER, answer TEXT, is_correct INTEGER, duration_sec INTEGER, created_at TEXT);
    CREATE TABLE study_session(id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT, activity TEXT, task TEXT, start_at TEXT, end_at TEXT, duration_sec INTEGER, category TEXT);
    ''')
    c.execute("INSERT INTO training(id,source,filename,created_at,total,correct,duration_sec,parser_conf) VALUES(1,'PDF导入','old.pdf','2026-09-10T20:00:00',2,1,120,0.8)")
    c.execute("INSERT INTO questions(id,training_id,seq,module,subtype,stem,options_json,user_answer,correct_answer,explanation,is_correct,raw_text,import_conf) VALUES(1,1,1,'资料分析','增长率','旧题','{\"A\":\"1\",\"B\":\"2\"}','A','B','旧解析',0,'raw',0.7)")
    c.execute("INSERT INTO study_session(id,subject,activity,task,start_at,end_at,duration_sec,category) VALUES(1,'资料分析','刷题','旧任务','2026-09-10T20:00:00','2026-09-10T20:35:00',2100,'深度学习')")
    c.commit(); c.close()

    monkeypatch.setenv('GONGKAO_DB_PATH', str(db_path))
    import db
    importlib.reload(db)
    db.migrate()

    training_cols = {r['name'] for r in db.query('PRAGMA table_info(training)')}
    session_cols = {r['name'] for r in db.query('PRAGMA table_info(study_session)')}
    assert 'trained_on' in training_cols and 'total_q' in training_cols
    assert 'study_date' in session_cols and 'activity_type' in session_cols

    tr = db.query_one('SELECT * FROM training WHERE id=1')
    q = db.query_one('SELECT * FROM question WHERE id=1')
    ss = db.query_one('SELECT * FROM study_session WHERE id=1')
    assert tr['total_q'] == 2 and tr['correct_q'] == 1 and tr['data_confidence'] == 'needs_review'
    assert q['stem_md'] == '旧题' and q['verified'] == 0
    assert ss['study_date'] == '2026-09-10' and ss['category'] == 'deep'
    assert list(tmp_path.glob('study.legacy-v0-*.db'))

    import tools.seed as seed
    importlib.reload(seed)
    seed.main()
    import main
    importlib.reload(main)
    client = TestClient(main.app)
    assert client.get('/health').status_code == 200
    assert client.get('/api/dashboard').status_code == 200
    assert client.get('/').status_code == 200
