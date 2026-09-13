from __future__ import annotations
from datetime import date, timedelta
from db import query, query_one, transaction, jload, jdump, now_iso

def next_review_date(review_count:int, correct:bool):
    intervals=jload((query_one("SELECT value_json FROM setting WHERE key='review_intervals_days'") or {'value_json':'[1,3,7,15,30]'})['value_json'],[1,3,7,15,30])
    idx=max(0, min(review_count, len(intervals)-1)) if correct else 0
    return (date.today()+timedelta(days=intervals[idx])).isoformat()

def generate_daily(target_date:str|None=None):
    target_date=target_date or date.today().isoformat()
    existing=query("SELECT * FROM task WHERE task_date=?",(target_date,))
    if existing: return existing
    due=query("SELECT m.id,q.module,q.node_slug FROM mistake m JOIN question q ON q.id=m.question_id WHERE m.status!='已修复' AND (m.next_review_at IS NULL OR date(m.next_review_at)<=date(?)) ORDER BY m.next_review_at LIMIT 20",(target_date,))
    tasks=[]
    if due:
        tasks.append(('P0',f"错题复训 · {len(due)}题",'错题复训',f"今天有 {len(due)} 道错题到期。",35,["进入复训台","逐题限时作答","对仍错题重新诊断错因"],"到期错题全部完成复训",[]))
    weak=query("""SELECT k.slug,k.title,json_extract(k.module_names,'$.guangdong') module,n.accuracy,n.sample_n FROM knowledge_node k LEFT JOIN node_mastery n ON n.node_slug=k.slug WHERE k.priority_batch=1 ORDER BY COALESCE(n.sample_n,0),COALESCE(n.accuracy,0) LIMIT 2""")
    for x in weak:
        tasks.append(('P0' if not due else 'P1',x['title'],x['module'],f"核心节点首轮恢复/验证；当前有效样本 {x.get('sample_n') or 0} 题。",60,["阅读知识节点并闭卷回忆","做10–15题真实专项","导入结果并复盘错题"],"形成有效样本并能复述主方法与失效条件",[x['slug']]))
    with transaction() as c:
        for pr,title,mod,reason,mins,steps,crit,nodes in tasks:
            c.execute("INSERT INTO task(task_date,priority,title,module,reason_md,est_minutes,steps_json,done_criteria_md,node_slugs,status,generated_by,source_rule,created_at) VALUES(?,?,?,?,?,?,?,?,?,'todo','auto','daily',?)",(target_date,pr,title,mod,reason,mins,jdump(steps),crit,jdump(nodes),now_iso()))
    return query("SELECT * FROM task WHERE task_date=? ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END,id",(target_date,))
