from flask import Flask, render_template, request, jsonify
from pathlib import Path
from datetime import datetime
import sqlite3, json, re, webbrowser, threading
from pypdf import PdfReader
from knowledge_seed import get_catalog, get_pages, build_page, MODULES

BASE = Path(__file__).resolve().parent
DB = BASE / 'data' / 'study.db'
UPLOADS = BASE / 'data' / 'uploads'
DB.parent.mkdir(parents=True, exist_ok=True)
UPLOADS.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 40 * 1024 * 1024

SCHEMA = '''
CREATE TABLE IF NOT EXISTS training(id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, filename TEXT, created_at TEXT, total INTEGER, correct INTEGER, duration_sec INTEGER DEFAULT 0, parser_conf REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY AUTOINCREMENT, training_id INTEGER, seq INTEGER, module TEXT, subtype TEXT, stem TEXT, options_json TEXT, user_answer TEXT, correct_answer TEXT, explanation TEXT, is_correct INTEGER, raw_text TEXT, import_conf REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS review_log(id INTEGER PRIMARY KEY AUTOINCREMENT, question_id INTEGER, answer TEXT, is_correct INTEGER, duration_sec INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS study_session(id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT, activity TEXT, task TEXT, start_at TEXT, end_at TEXT, duration_sec INTEGER, category TEXT);
'''

def conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c

def init_db():
    with conn() as c: c.executescript(SCHEMA)

init_db()

MODULE_RULES = [
 ('资料分析', ['同比','环比','增长率','增长量','比重','百分点','平均每','占比','基期','现期']),
 ('数量关系', ['概率','排列','组合','工程','行程','利润','浓度','方程','几何','面积','体积','至少有']),
 ('判断推理', ['定义判断','类比','削弱','加强','前提','以下哪项','最能支持','最能削弱','图形','排序']),
 ('言语理解', ['文段','填入','依次填入','主旨','意在说明','最恰当','语句排序']),
 ('政治理论与常识', ['总书记','宪法','法律','历史','地理','经济','科技','文化']),
]

def classify(text):
    scores={m:sum(text.count(k) for k in ks) for m,ks in MODULE_RULES}
    m=max(scores,key=scores.get)
    return m if scores[m] else '未分类'

def split_options(block):
    opts={}
    pat=re.compile(r'(?:^|\n)\s*([A-D])(?:[\.．、:：]|\s{1,3})(.*?)(?=(?:\n\s*[A-D](?:[\.．、:：]|\s{1,3}))|\Z)',re.S)
    for k,v in pat.findall(block): opts[k]=re.sub(r'\s+',' ',v).strip()
    return opts

def parse_pdf(path):
    reader=PdfReader(str(path))
    text='\n'.join((p.extract_text() or '') for p in reader.pages)
    text=text.replace('\r','\n')
    # Common Fenbi-like exports use numbered question blocks. Keep parser conservative.
    marks=list(re.finditer(r'(?m)(?<!\d)(\d{1,3})[\.．、]\s*',text))
    blocks=[]
    if marks:
        for i,m in enumerate(marks):
            end=marks[i+1].start() if i+1<len(marks) else len(text)
            block=text[m.start():end].strip()
            if len(block)>25: blocks.append((int(m.group(1)),block))
    if not blocks:
        chunks=[x.strip() for x in re.split(r'(?m)(?=\n\s*\d{1,3}\s*[\.．、])',text) if len(x.strip())>30]
        blocks=[(i+1,b) for i,b in enumerate(chunks[:200])]
    parsed=[]
    for seq,b in blocks:
        ca=re.search(r'(?:正确答案|参考答案|答案)\s*[:：]?\s*([A-D])',b,re.I)
        ua=re.search(r'(?:你的答案|我的答案|用户答案)\s*[:：]?\s*([A-D])',b,re.I)
        opts=split_options(b)
        stem=re.split(r'(?m)\n\s*A(?:[\.．、:：]|\s{1,3})',b,maxsplit=1)[0]
        stem=re.sub(r'^\s*\d{1,3}[\.．、]\s*','',stem).strip()
        stem=re.sub(r'(?:正确答案|参考答案|答案|你的答案|我的答案).*','',stem,flags=re.S).strip()
        confidence=0.25 + (0.3 if len(opts)>=2 else 0) + (0.25 if ca else 0) + (0.15 if ua else 0)
        parsed.append({'seq':seq,'stem':stem[:5000],'options':opts,'correct':ca.group(1) if ca else '', 'user':ua.group(1) if ua else '', 'module':classify(b),'subtype':'自动识别待复核','raw':b[:12000],'confidence':min(confidence,0.95)})
    return text, parsed

@app.get('/')
def index(): return render_template('index.html')

@app.get('/api/dashboard')
def dashboard():
    with conn() as c:
        tr=[dict(x) for x in c.execute('SELECT * FROM training ORDER BY id DESC LIMIT 30')]
        q=[dict(x) for x in c.execute('SELECT module, COUNT(*) n, SUM(CASE WHEN is_correct=1 THEN 1 ELSE 0 END) c FROM questions GROUP BY module')]
        today=datetime.now().strftime('%Y-%m-%d')
        ss=[dict(x) for x in c.execute("SELECT * FROM study_session WHERE substr(start_at,1,10)=? ORDER BY id DESC",(today,))]
    return jsonify({'trainings':tr,'modules':q,'today_sessions':ss})

@app.get('/api/knowledge/catalog')
def knowledge_catalog(): return jsonify(get_catalog())

@app.get('/api/knowledge/<module>')
def knowledge_pages(module):
    if module not in MODULES: return jsonify({'error':'module not found'}),404
    return jsonify(get_pages(module))

@app.get('/api/knowledge/<module>/<int:page_id>')
def knowledge_page(module,page_id):
    if module not in MODULES or page_id<1 or page_id>len(MODULES[module]): return jsonify({'error':'page not found'}),404
    return jsonify(build_page(module,page_id))

@app.post('/api/pdf/import')
def import_pdf():
    f=request.files.get('file')
    if not f or not f.filename.lower().endswith('.pdf'): return jsonify({'error':'请上传PDF'}),400
    name=datetime.now().strftime('%Y%m%d_%H%M%S_')+Path(f.filename).name
    path=UPLOADS/name; f.save(path)
    try: raw, parsed=parse_pdf(path)
    except Exception as e: return jsonify({'error':f'PDF解析失败：{e}'}),400
    with conn() as c:
        cur=c.execute('INSERT INTO training(source,filename,created_at,total,correct,parser_conf) VALUES(?,?,?,?,?,?)',('PDF导入',f.filename,datetime.now().isoformat(timespec='seconds'),len(parsed),sum(1 for x in parsed if x['correct'] and x['user'] and x['correct']==x['user']),sum(x['confidence'] for x in parsed)/max(1,len(parsed))))
        tid=cur.lastrowid
        for x in parsed:
            ok=1 if x['correct'] and x['user'] and x['correct']==x['user'] else (0 if x['correct'] and x['user'] else None)
            c.execute('INSERT INTO questions(training_id,seq,module,subtype,stem,options_json,user_answer,correct_answer,explanation,is_correct,raw_text,import_conf) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',(tid,x['seq'],x['module'],x['subtype'],x['stem'],json.dumps(x['options'],ensure_ascii=False),x['user'],x['correct'],'',ok,x['raw'],x['confidence']))
    return jsonify({'training_id':tid,'questions':len(parsed),'correct':sum(1 for x in parsed if x['correct'] and x['user'] and x['correct']==x['user']),'needs_review':sum(1 for x in parsed if x['confidence']<0.7),'preview':parsed[:8]})

@app.get('/api/questions')
def questions():
    mistakes=request.args.get('mistakes')=='1'
    with conn() as c:
        sql='SELECT q.*, t.filename FROM questions q LEFT JOIN training t ON t.id=q.training_id'
        if mistakes: sql+=' WHERE q.is_correct=0'
        sql+=' ORDER BY q.id DESC LIMIT 500'
        rows=[]
        for r in c.execute(sql):
            d=dict(r); d['options']=json.loads(d.pop('options_json') or '{}'); rows.append(d)
    return jsonify(rows)

@app.patch('/api/questions/<int:qid>')
def update_question(qid):
    d=request.get_json(force=True)
    allowed=['module','subtype','stem','user_answer','correct_answer','explanation','is_correct']
    parts=[]; vals=[]
    for k in allowed:
        if k in d: parts.append(k+'=?'); vals.append(d[k])
    if 'options' in d: parts.append('options_json=?'); vals.append(json.dumps(d['options'],ensure_ascii=False))
    if not parts:return jsonify({'ok':True})
    vals.append(qid)
    with conn() as c:c.execute('UPDATE questions SET '+','.join(parts)+' WHERE id=?',vals)
    return jsonify({'ok':True})

@app.post('/api/review/<int:qid>/answer')
def review_answer(qid):
    d=request.get_json(force=True); ans=str(d.get('answer','')).upper(); dur=int(d.get('duration_sec',0))
    with conn() as c:
        q=c.execute('SELECT * FROM questions WHERE id=?',(qid,)).fetchone()
        if not q:return jsonify({'error':'not found'}),404
        ok=1 if q['correct_answer'] and ans==q['correct_answer'] else 0
        c.execute('INSERT INTO review_log(question_id,answer,is_correct,duration_sec,created_at) VALUES(?,?,?,?,?)',(qid,ans,ok,dur,datetime.now().isoformat(timespec='seconds')))
    return jsonify({'is_correct':bool(ok),'correct_answer':q['correct_answer'],'explanation':q['explanation']})

@app.post('/api/study-session')
def study_session():
    d=request.get_json(force=True); dur=int(d.get('duration_sec',0)); cat='深度学习' if dur>=1800 else ('专注学习' if dur>=900 else '碎片学习')
    with conn() as c:
        cur=c.execute('INSERT INTO study_session(subject,activity,task,start_at,end_at,duration_sec,category) VALUES(?,?,?,?,?,?,?)',(d.get('subject',''),d.get('activity',''),d.get('task',''),d.get('start_at',''),d.get('end_at',''),dur,cat))
    return jsonify({'id':cur.lastrowid,'category':cat})

@app.get('/api/study-session/daily')
def study_daily():
    with conn() as c:
        rows=[dict(x) for x in c.execute("SELECT substr(start_at,1,10) day, SUM(duration_sec) total, SUM(CASE WHEN duration_sec>=1800 THEN duration_sec ELSE 0 END) deep, SUM(CASE WHEN duration_sec>=900 AND duration_sec<1800 THEN duration_sec ELSE 0 END) focus, SUM(CASE WHEN duration_sec<900 THEN duration_sec ELSE 0 END) fragment, COUNT(*) sessions FROM study_session GROUP BY substr(start_at,1,10) ORDER BY day DESC")]
    return jsonify(rows)

@app.get('/health')
def health(): return jsonify({'ok':True,'db':str(DB)})

def open_browser():
    try:webbrowser.open('http://127.0.0.1:8765')
    except:pass

if __name__=='__main__':
    threading.Timer(1.1,open_browser).start()
    app.run(host='127.0.0.1',port=8765,debug=False)
