import importlib, os, sqlite3, time
from pathlib import Path
from fastapi.testclient import TestClient


def fresh_app(tmp_path, monkeypatch):
    monkeypatch.setenv('GONGKAO_DB_PATH', str(tmp_path/'study.db'))
    import db
    importlib.reload(db)
    db.migrate()
    import tools.seed as seed
    importlib.reload(seed)
    seed.main()
    import main
    importlib.reload(main)
    return TestClient(main.app), db

def test_health_and_nav(tmp_path, monkeypatch):
    client, db=fresh_app(tmp_path,monkeypatch)
    assert client.get('/health').status_code==200
    for path in ['/','/today','/timer','/trainings','/questions','/mistakes','/review','/import','/knowledge','/shenlun','/plan','/progress','/methods','/settings']:
        assert client.get(path).status_code==200

def test_timer_pause_state(tmp_path, monkeypatch):
    client, db=fresh_app(tmp_path,monkeypatch)
    r=client.post('/api/timer/start',json={'module':'资料分析','activity_type':'刷题训练'})
    assert r.status_code==200
    client.post('/api/timer/heartbeat',json={'elapsed_sec':12,'paused_sec':0})
    r=client.post('/api/timer/pause'); assert r.json()['status']=='paused'
    # simulate 120 seconds paused by moving paused_at back
    with db.transaction() as c:
        c.execute("UPDATE timer_state SET paused_at=datetime('now','-120 seconds') WHERE id=1")
    r=client.post('/api/timer/resume'); assert r.status_code==200
    assert 118 <= r.json()['paused_sec'] <= 122
    client.post('/api/timer/heartbeat',json={'elapsed_sec':20,'paused_sec':r.json()['paused_sec']})
    out=client.post('/api/timer/stop').json()
    assert 118 <= out['paused_sec'] <= 122
    assert out['duration_sec'] >= 20

def test_low_confidence_excluded_from_mastery(tmp_path, monkeypatch):
    client, db=fresh_app(tmp_path,monkeypatch)
    with db.transaction() as c:
        tid=c.execute("INSERT INTO training(trained_on,source,exam_type,total_q,correct_q,data_confidence,created_at) VALUES(date('now'),'other','na',2,2,'needs_review',datetime('now'))").lastrowid
        c.execute("INSERT INTO question(training_id,seq,module,node_slug,stem_md,is_correct,parse_confidence,verified,created_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'))",(tid,1,'资料分析','data-abrx-base','未确认',1,.4,0))
        c.execute("INSERT INTO question(training_id,seq,module,node_slug,stem_md,is_correct,parse_confidence,verified,created_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'))",(tid,2,'资料分析','data-abrx-base','已确认',1,.9,1))
    from services.mastery import recompute
    m=recompute('data-abrx-base')
    assert m['sample_n']==1
    assert m['correct_n']==1

def test_seed_is_idempotent_and_preserves_user_edits(tmp_path, monkeypatch):
    client, db=fresh_app(tmp_path,monkeypatch)
    before=db.query_one('SELECT COUNT(*) n FROM phase_exit_criterion')['n']
    with db.transaction() as c:
        c.execute("UPDATE setting SET value_json='45' WHERE key='deep_threshold_min'")
        c.execute("UPDATE week_plan SET target_hours=99 WHERE week_no=1")
        c.execute("UPDATE exam SET exam_date='2026-12-31',is_official=1 WHERE code='guangdong'")
    import tools.seed as seed
    seed.main()
    assert db.query_one("SELECT value_json FROM setting WHERE key='deep_threshold_min'")['value_json']=='45'
    assert db.query_one('SELECT target_hours FROM week_plan WHERE week_no=1')['target_hours']==99
    ex=db.query_one("SELECT exam_date,is_official FROM exam WHERE code='guangdong'")
    assert ex['exam_date']=='2026-12-31' and ex['is_official']==1
    after=db.query_one('SELECT COUNT(*) n FROM phase_exit_criterion')['n']
    assert after==before


def test_error_pattern_upgrade_rule_or(tmp_path, monkeypatch):
    client, db=fresh_app(tmp_path,monkeypatch)
    from services.error_pattern import refresh_for_mistake
    mids=[]
    for n in range(2):
        with db.transaction() as c:
            tid=c.execute("INSERT INTO training(trained_on,source,exam_type,total_q,correct_q,data_confidence,created_at) VALUES(date('now'),'other','na',1,0,'verified',datetime('now'))").lastrowid
            qid=c.execute("INSERT INTO question(training_id,seq,module,subtype,node_slug,stem_md,is_correct,verified,created_at) VALUES(?,?,?,?,?,?,0,1,datetime('now'))",(tid,1,'逻辑判断','加强论证','logic-strengthen-premise',f'错题{n}')).lastrowid
            mid=c.execute("INSERT INTO mistake(question_id,first_wrong_at,cause_primary,status,updated_at) VALUES(?,date('now'),'推理链遗漏','待复训',datetime('now'))",(qid,)).lastrowid
            mids.append(mid)
        p=refresh_for_mistake(mid)
        if n==0:
            assert p['status']=='候选'
    p=refresh_for_mistake(mids[1]); assert p['occurrences']==2 and p['distinct_trainings']==2
    assert p['status']=='稳定错误模式'
    task=db.query_one("SELECT * FROM task WHERE source_rule LIKE 'error_pattern:%'")
    assert task and task['priority']=='P0'


def test_mastery_requires_closed_book_and_exact_speed(tmp_path, monkeypatch):
    client, db=fresh_app(tmp_path,monkeypatch)
    from services.mastery import recompute
    slug='data-abrx-base'
    # Samples alone cannot move a node out of 未恢复.
    tids=[]
    with db.transaction() as c:
        for ti in range(3):
            tid=c.execute("INSERT INTO training(trained_on,source,exam_type,is_timed,total_q,correct_q,data_confidence,created_at) VALUES(date('now'),'special','na',1,5,5,'verified',datetime('now'))").lastrowid
            tids.append(tid)
            for j in range(5):
                c.execute("INSERT INTO question(training_id,seq,module,node_slug,stem_md,is_correct,duration_sec,duration_is_estimated,verified,created_at) VALUES(?,?,?,?,?,1,100,0,1,datetime('now'))",(tid,j+1,'资料分析',slug,f'题{ti}-{j}'))
    m=recompute(slug); assert m['state']=='未恢复'
    r=client.post(f'/api/knowledge/node/{slug}/closed-book'); assert r.status_code==200
    m=db.query_one('SELECT * FROM node_mastery WHERE node_slug=?',(slug,))
    # Accuracy/sample are enough for 可独立做题, but 100s > target 75s blocks 稳定.
    assert m['state']=='可独立做题'
    with db.transaction() as c:
        c.execute("UPDATE question SET duration_sec=60 WHERE node_slug=?",(slug,))
    m=recompute(slug)
    assert m['state']=='稳定'
    hist=db.query("SELECT * FROM mastery_history WHERE node_slug=?",(slug,))
    assert len(hist)>=2


def test_question_bank_keeps_canonical_question_and_attempt_history(tmp_path, monkeypatch):
    client, db=fresh_app(tmp_path,monkeypatch)
    from services.question_bank import upsert_question_bank, add_attempt
    with db.transaction() as c:
        tid=c.execute("INSERT INTO training(trained_on,source,exam_type,total_q,correct_q,data_confidence,created_at) VALUES('2026-09-14','fenbi_random','na',1,0,'verified',datetime('now'))").lastrowid
        qid=c.execute("INSERT INTO question(training_id,seq,module,subtype,stem_md,options_json,user_answer,correct_answer,is_correct,verified,created_at) VALUES(?,?,?,?,?,?,?,?,0,1,datetime('now'))",(tid,1,'判断推理','逻辑判断·加强削弱','测试题','{\"A\":\"甲\",\"B\":\"乙\",\"C\":\"丙\",\"D\":\"丁\"}','B','A')).lastrowid
        q=dict(c.execute('SELECT * FROM question WHERE id=?',(qid,)).fetchone())
        bank_id=upsert_question_bank(c,q,None,'fixture.pdf')
        c.execute('UPDATE question SET bank_id=? WHERE id=?',(bank_id,qid))
        add_attempt(c,bank_id=bank_id,question=q,training_id=tid,attempted_on='2026-09-14',source='fenbi_random')
        assert upsert_question_bank(c,q,None,'fixture.pdf')==bank_id
    rows=client.get('/api/question-bank').json()
    assert len(rows)==1
    assert rows[0]['attempt_count']==1 and rows[0]['wrong_count']==1
    detail=client.get(f'/api/question-bank/{rows[0]["id"]}').json()
    assert len(detail['attempts'])==1 and detail['attempts'][0]['user_answer']=='B'
