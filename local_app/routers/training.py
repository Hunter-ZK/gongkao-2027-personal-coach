from __future__ import annotations

import hashlib
from datetime import date, timedelta
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
from pydantic import BaseModel, Field, field_validator

from db import query, query_one, transaction, now_iso, jdump, jload
from parsers.registry import choose
from services.mastery import recompute, degrade_on_error
from services.question_bank import upsert_question_bank, add_attempt
from services.mistake_ai import (
    analyze_many_mistakes,
    configured as mistake_ai_configured,
    mistake_ids_for_training,
)

r = APIRouter(prefix='/api')
BASE = Path(__file__).resolve().parents[1]
UP = BASE / 'data' / 'uploads'
IM = BASE / 'data' / 'images'
UP.mkdir(parents=True, exist_ok=True)
IM.mkdir(parents=True, exist_ok=True)


class ManualTraining(BaseModel):
    trained_on: str
    source: str = 'other'
    exam_type: str = 'na'
    total_q: int
    correct_q: int
    duration_sec: int = 0
    note: str | None = None


class QPatch(BaseModel):
    module: str | None = None
    subtype: str | None = None
    node_slug: str | None = None
    stem_md: str | None = None
    options: dict | None = None
    user_answer: str | None = None
    correct_answer: str | None = None
    verified: bool | None = None


class ConfirmIn(BaseModel):
    seq_list: list[int]


class CommitIn(BaseModel):
    trained_on: str
    duration_sec: int = Field(default=0, ge=0)
    source: str = 'fenbi_random'
    exam_type: str = 'na'
    note: str | None = None

    @field_validator('trained_on')
    @classmethod
    def valid_date(cls, value):
        date.fromisoformat(value)
        return value

    @field_validator('source')
    @classmethod
    def valid_source(cls, value):
        allowed = {'fenbi_random', 'special', 'gd_real', 'national_real', 'mock', 'full_paper_gd', 'full_paper_national', 'other'}
        if value not in allowed:
            raise ValueError('未知训练来源')
        return value


class ImageAssign(BaseModel):
    seq: int
    image_id: str
    option: str | None = None


def _image_ref(value: str | None) -> str | None:
    if not value:
        return value
    raw = str(value).replace('\\', '/')
    marker = '/data/images/'
    if marker in raw:
        return raw.split(marker, 1)[1]
    if raw.startswith('data/images/'):
        return raw[len('data/images/'):]
    try:
        return str(Path(value).resolve().relative_to(IM.resolve())).replace('\\', '/')
    except Exception:
        return raw


def _image_list(values) -> list[str]:
    return [x for x in (_image_ref(v) for v in (values or [])) if x]


def _image_map(values) -> dict[str, str]:
    return {str(k): ref for k, v in (values or {}).items() if (ref := _image_ref(v))}


def _trusted_fenbi_question(question, result) -> bool:
    if result.parser_name != 'fenbi_quick_practice' or not result.meta.get('trusted_layout'):
        return False
    options = question.options or {}
    images = question.option_images or {}
    complete = set(options) == set('ABCD') and all(str(options.get(k) or '').strip() or images.get(k) for k in 'ABCD')
    return bool(
        question.confidence >= 0.95
        and question.correct_answer
        and question.user_answer
        and complete
        and question.stem.strip()
    )


def _schedule_mistake_ai(background_tasks: BackgroundTasks, training_id: int) -> dict:
    mistake_ids = mistake_ids_for_training(training_id)
    if not mistake_ids:
        return {'configured': mistake_ai_configured(), 'scheduled': 0, 'mistake_ids': []}
    if not mistake_ai_configured():
        return {
            'configured': False,
            'scheduled': 0,
            'mistake_ids': mistake_ids,
            'message': '错题已入库；AI 尚未配置，可在设置页配置后重新解析。',
        }
    background_tasks.add_task(analyze_many_mistakes, mistake_ids)
    return {
        'configured': True,
        'scheduled': len(mistake_ids),
        'mistake_ids': mistake_ids,
        'message': f'已自动提交 {len(mistake_ids)} 道错题给 Skill 驱动的 AI 解析。',
    }


@r.get('/trainings')
def trainings(source: str | None = None, exam_type: str | None = None, grouped: bool = True):
    wh = []
    args = []
    if source:
        wh.append('source=?')
        args.append(source)
    if exam_type:
        wh.append('exam_type=?')
        args.append(exam_type)
    rows = query('SELECT * FROM training' + (' WHERE ' + ' AND '.join(wh) if wh else '') + ' ORDER BY trained_on DESC,id DESC', args)
    if not grouped:
        return rows
    out = {}
    for row in rows:
        out.setdefault(row['source'], []).append(row)
    return out


@r.get('/trainings/{tid}')
def training(tid: int):
    row = query_one('SELECT * FROM training WHERE id=?', (tid,))
    if not row:
        raise HTTPException(404, '训练不存在')
    row['modules'] = query('SELECT * FROM training_module_stat WHERE training_id=? ORDER BY module', (tid,))
    return row


@r.get('/trainings/{tid}/questions')
def training_q(tid: int):
    rows = query('SELECT * FROM question WHERE training_id=? ORDER BY seq', (tid,))
    for row in rows:
        row['options'] = jload(row.get('options_json'), {})
        row['images'] = jload(row.get('images_json'), [])
        row['option_images'] = jload(row.get('option_images_json'), {})
    return rows


@r.post('/trainings')
def create_training(x: ManualTraining):
    with transaction() as conn:
        tid = conn.execute(
            "INSERT INTO training(trained_on,source,exam_type,total_q,correct_q,duration_sec,data_confidence,note,created_at) VALUES(?,?,?,?,?,?,'verified',?,?)",
            (x.trained_on, x.source, x.exam_type, x.total_q, x.correct_q, x.duration_sec, x.note, now_iso()),
        ).lastrowid
    return training(tid)


@r.get('/question-bank')
def question_bank(module: str | None = None, q: str | None = None):
    wh = []
    args = []
    if module:
        wh.append('qb.module=?')
        args.append(module)
    if q:
        wh.append('(qb.stem_md LIKE ? OR qb.subtype LIKE ?)')
        args.extend([f'%{q}%', f'%{q}%'])
    sql = """SELECT qb.*,COUNT(qa.id) attempt_count,
        SUM(CASE WHEN qa.is_correct=1 THEN 1 ELSE 0 END) correct_count,
        SUM(CASE WHEN qa.is_correct=0 THEN 1 ELSE 0 END) wrong_count,
        MAX(qa.attempted_on) last_attempted_on
        FROM question_bank qb LEFT JOIN question_attempt qa ON qa.bank_id=qb.id"""
    if wh:
        sql += ' WHERE ' + ' AND '.join(wh)
    sql += ' GROUP BY qb.id ORDER BY COALESCE(last_attempted_on,qb.first_seen_at) DESC,qb.id DESC'
    rows = query(sql, args)
    for row in rows:
        row['options'] = jload(row.get('options_json'), {})
        row['images'] = jload(row.get('images_json'), [])
        row['option_images'] = jload(row.get('option_images_json'), {})
        row['material_images'] = jload(row.get('material_images_json'), [])
        attempts = int(row.get('attempt_count') or 0)
        row['accuracy'] = (int(row.get('correct_count') or 0) / attempts) if attempts else None
    return rows


@r.get('/question-bank/{bank_id}')
def question_bank_item(bank_id: int):
    row = query_one('SELECT * FROM question_bank WHERE id=?', (bank_id,))
    if not row:
        raise HTTPException(404, '题库条目不存在')
    row['options'] = jload(row.get('options_json'), {})
    row['images'] = jload(row.get('images_json'), [])
    row['option_images'] = jload(row.get('option_images_json'), {})
    row['material_images'] = jload(row.get('material_images_json'), [])
    row['attempts'] = query('SELECT * FROM question_attempt WHERE bank_id=? ORDER BY attempted_on DESC,id DESC', (bank_id,))
    return row


@r.post('/import/pdf')
async def import_pdf(file: UploadFile = File(...)):
    raw = await file.read()
    sha = hashlib.sha256(raw).hexdigest()
    old = query_one('SELECT * FROM pdf_import WHERE sha256=?', (sha,))
    if old:
        return {'duplicate': True, 'import_id': old['id'], 'status': old['status'], 'message': '这份文件已经导入过'}

    safe = Path(file.filename or 'upload.pdf').name
    stored = UP / f'{sha[:12]}-{safe}'
    stored.write_bytes(raw)
    imgdir = IM / sha[:12]
    try:
        parser = choose(stored)
        result = parser.parse(stored, imgdir)
    except Exception as exc:
        with transaction() as conn:
            iid = conn.execute(
                "INSERT INTO pdf_import(filename,stored_path,sha256,status,error_message,created_at) VALUES(?,?,?,'failed',?,?)",
                (safe, str(stored.relative_to(BASE)), sha, str(exc), now_iso()),
            ).lastrowid
        raise HTTPException(422, f'解析失败：{exc}') from exc

    high = sum(1 for question in result.questions if question.confidence >= 0.85)
    medium = sum(1 for question in result.questions if 0.70 <= question.confidence < 0.85)
    low = sum(1 for question in result.questions if question.confidence < 0.70)
    trusted_flags = [_trusted_fenbi_question(question, result) for question in result.questions]
    needs = sum(1 for trusted in trusted_flags if not trusted)

    with transaction() as conn:
        iid = conn.execute(
            """INSERT INTO pdf_import(filename,stored_path,sha256,page_count,parser_name,parser_version,status,total_parsed,needs_review_count,created_at)
            VALUES(?,?,?,?,?,?,'parsed',?,?,?)""",
            (safe, str(stored.relative_to(BASE)), sha, result.meta.get('page_count'), result.parser_name, result.parser_version, len(result.questions), needs, now_iso()),
        ).lastrowid
        material_db = {}
        for material in result.materials:
            images = _image_list(material.images)
            mid = conn.execute(
                'INSERT INTO material(pdf_import_id,seq,text_md,images_json,created_at) VALUES(?,?,?,?,?)',
                (iid, material.id, material.text, jdump(images), now_iso()),
            ).lastrowid
            material_db[material.id] = mid

        for question, trusted in zip(result.questions, trusted_flags):
            images = _image_list(question.stem_images)
            option_images = _image_map(question.option_images)
            signals = dict(question.signals or {})
            signals['auto_verified'] = bool(trusted)
            is_correct = int(question.user_answer == question.correct_answer) if question.user_answer and question.correct_answer else None
            conn.execute(
                """INSERT INTO question(pdf_import_id,material_id,seq,module,subtype,stem_md,images_json,options_json,option_images_json,
                is_multi_select,user_answer,correct_answer,is_correct,source_type,parse_confidence,parse_signals_json,raw_block,verified,created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    iid,
                    material_db.get(question.material_id),
                    question.seq,
                    question.module_guess,
                    question.subtype_guess,
                    question.stem,
                    jdump(images),
                    jdump(question.options),
                    jdump(option_images),
                    int(question.is_multi_select),
                    question.user_answer,
                    question.correct_answer,
                    is_correct,
                    'fenbi',
                    question.confidence,
                    jdump(signals),
                    question.raw_text,
                    int(trusted),
                    now_iso(),
                ),
            )

    verified_count = len(result.questions) - needs
    if needs == 0 and result.questions:
        message = f'已正确识别 {len(result.questions)} 题，其中 {verified_count} 题通过粉笔版式自动核验，可直接入库'
    else:
        message = f'共识别 {len(result.questions)} 题，自动核验 {verified_count} 题，仍有 {needs} 题需要人工确认'
    return {
        'duplicate': False,
        'import_id': iid,
        'parser': result.parser_name,
        'parser_version': result.parser_version,
        'total': len(result.questions),
        'verified_count': verified_count,
        'high_confidence': high,
        'medium_confidence': medium,
        'low_confidence': low,
        'needs_review': needs,
        'warnings': result.warnings,
        'message': message,
    }


@r.get('/import/{iid}/proof')
def proof(iid: int):
    imp = query_one('SELECT * FROM pdf_import WHERE id=?', (iid,))
    if not imp:
        raise HTTPException(404, '导入记录不存在')
    questions = query('SELECT * FROM question WHERE pdf_import_id=? ORDER BY seq', (iid,))
    for question in questions:
        question['options'] = jload(question['options_json'], {})
        question['option_images'] = jload(question['option_images_json'], {})
        question['images'] = jload(question['images_json'], [])
        question['signals'] = jload(question['parse_signals_json'], {})
    materials = query('SELECT * FROM material WHERE pdf_import_id=? ORDER BY seq', (iid,))
    for material in materials:
        material['images'] = jload(material['images_json'], [])
    verified_count = sum(int(question['verified'] or 0) for question in questions)
    correct_count = sum(1 for question in questions if question.get('is_correct') == 1)
    wrong_count = sum(1 for question in questions if question.get('is_correct') == 0)
    return {
        'import': imp,
        'questions': questions,
        'materials': materials,
        'required_fields': ['trained_on', 'source'],
        'all_verified': bool(questions) and verified_count == len(questions),
        'verified_count': verified_count,
        'correct_count': correct_count,
        'wrong_count': wrong_count,
        'needs_review': len(questions) - verified_count,
    }


@r.patch('/import/{iid}/question/{seq}')
def patch_q(iid: int, seq: int, x: QPatch):
    question = query_one('SELECT * FROM question WHERE pdf_import_id=? AND seq=?', (iid, seq))
    if not question:
        raise HTTPException(404, '题目不存在')
    vals = x.model_dump(exclude_unset=True)
    if 'options' in vals:
        vals['options_json'] = jdump(vals.pop('options'))
    if 'verified' in vals:
        vals['verified'] = int(vals['verified'])
    if 'user_answer' in vals or 'correct_answer' in vals:
        user_answer = vals.get('user_answer', question['user_answer'])
        correct_answer = vals.get('correct_answer', question['correct_answer'])
        vals['is_correct'] = int(user_answer == correct_answer) if user_answer and correct_answer else None
    if vals:
        cols = ','.join(f'{key}=?' for key in vals)
        args = list(vals.values()) + [question['id']]
        with transaction() as conn:
            conn.execute(f'UPDATE question SET {cols} WHERE id=?', args)
    return proof(iid)


@r.post('/import/{iid}/confirm')
def confirm(iid: int, x: ConfirmIn):
    if not x.seq_list:
        return {'confirmed': 0}
    marks = ','.join('?' * len(x.seq_list))
    with transaction() as conn:
        conn.execute(f'UPDATE question SET verified=1 WHERE pdf_import_id=? AND seq IN ({marks})', [iid, *x.seq_list])
        conn.execute('UPDATE pdf_import SET needs_review_count=(SELECT COUNT(*) FROM question WHERE pdf_import_id=? AND verified=0) WHERE id=?', (iid, iid))
    return {'confirmed': len(x.seq_list)}


@r.post('/import/{iid}/commit')
def commit(iid: int, x: CommitIn, background_tasks: BackgroundTasks):
    imp = query_one('SELECT * FROM pdf_import WHERE id=?', (iid,))
    if not imp:
        raise HTTPException(404, '导入记录不存在')
    if imp['status'] == 'verified':
        existing = query_one('SELECT * FROM training WHERE pdf_import_id=?', (iid,))
        ai = _schedule_mistake_ai(background_tasks, int(existing['id'])) if existing else {'configured': mistake_ai_configured(), 'scheduled': 0, 'mistake_ids': []}
        return {'already_committed': True, 'training': existing, 'ai': ai}

    questions = query('SELECT * FROM question WHERE pdf_import_id=? ORDER BY seq', (iid,))
    if not questions:
        raise HTTPException(409, '没有可入库题目')
    unverified = [question['seq'] for question in questions if not question['verified']]
    if unverified:
        raise HTTPException(409, f'还有 {len(unverified)} 题未确认：{unverified[:10]}')

    total = len(questions)
    correct = sum(int(question['is_correct'] or 0) for question in questions)
    materials = {row['id']: row for row in query('SELECT * FROM material WHERE pdf_import_id=?', (iid,))}
    with transaction() as conn:
        exam_type = x.exam_type
        is_full = int(x.source in {'full_paper_gd', 'full_paper_national'})
        if x.source == 'full_paper_gd':
            exam_type = 'guangdong'
        elif x.source == 'full_paper_national':
            exam_type = 'national'
        tid = conn.execute(
            """INSERT INTO training(trained_on,source,exam_type,is_timed,is_full_paper,total_q,correct_q,duration_sec,data_confidence,pdf_import_id,note,created_at)
            VALUES(?,?,?,?,?,?,?,?,'verified',?,?,?)""",
            (x.trained_on, x.source, exam_type, int(x.duration_sec > 0), is_full, total, correct, x.duration_sec, iid, x.note, now_iso()),
        ).lastrowid
        conn.execute('UPDATE question SET training_id=? WHERE pdf_import_id=?', (tid, iid))
        conn.execute('UPDATE material SET training_id=? WHERE pdf_import_id=?', (tid, iid))

        modules = {}
        estimated_duration = round(x.duration_sec / total) if x.duration_sec > 0 and total else None
        bank_ids = set()
        for question in questions:
            material = materials.get(question.get('material_id'))
            bank_id = upsert_question_bank(conn, question, material, imp.get('filename'))
            bank_ids.add(bank_id)
            conn.execute('UPDATE question SET bank_id=?,duration_sec=?,duration_is_estimated=? WHERE id=?', (bank_id, estimated_duration, int(estimated_duration is not None), question['id']))
            add_attempt(
                conn,
                bank_id=bank_id,
                question=question,
                training_id=tid,
                attempted_on=x.trained_on,
                source=x.source,
                duration_sec=estimated_duration,
                duration_is_estimated=estimated_duration is not None,
            )
            module = question['module'] or '未分类'
            stat = modules.setdefault(module, [0, 0])
            stat[0] += 1
            stat[1] += int(question['is_correct'] or 0)
            if question['is_correct'] == 0:
                conn.execute(
                    "INSERT OR IGNORE INTO mistake(question_id,first_wrong_at,cause_primary,next_review_at,status,updated_at) VALUES(?,?,NULL,?,'待复训',?)",
                    (question['id'], x.trained_on, (date.fromisoformat(x.trained_on) + timedelta(days=1)).isoformat(), now_iso()),
                )
        for module, (count, ok) in modules.items():
            conn.execute(
                'INSERT INTO training_module_stat(training_id,module,total_q,correct_q,duration_sec) VALUES(?,?,?,?,?)',
                (tid, module, count, ok, round(x.duration_sec * count / total) if x.duration_sec else None),
            )
        conn.execute("UPDATE pdf_import SET status='verified',needs_review_count=0 WHERE id=?", (iid,))

    nodes = {question.get('node_slug') for question in questions if question.get('node_slug')}
    wrong_nodes = {question.get('node_slug') for question in questions if question.get('node_slug') and question.get('is_correct') == 0}
    for slug in nodes:
        recompute(slug)
    for slug in wrong_nodes:
        degrade_on_error(slug, '新确认训练中出现同类错误')

    ai = _schedule_mistake_ai(background_tasks, int(tid))
    return {
        'training': training(tid),
        'mistakes_created': total - correct,
        'question_bank_items': len(bank_ids),
        'attempts_created': total,
        'ai': ai,
    }


@r.post('/import/{iid}/image/assign')
def image_assign(iid: int, x: ImageAssign):
    return {'ok': True, 'note': '图片归属由粉笔版式解析器和校对台共同维护；该端点保留兼容契约'}
