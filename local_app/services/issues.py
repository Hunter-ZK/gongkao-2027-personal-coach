from __future__ import annotations
from db import query, query_one

def top_issues(limit=5):
    out=[]
    patterns=query("SELECT * FROM error_pattern WHERE status IN ('稳定错误模式','修复中') ORDER BY occurrences DESC LIMIT 3")
    for p in patterns: out.append({'severity':'high','title':f"{p['module']}·{p['cause_primary']}反复出现",'detail':f"已出现 {p['occurrences']} 次，覆盖 {p['distinct_trainings']} 次训练",'href':'/mistakes'})
    zeros=query("SELECT title,json_extract(module_names,'$.guangdong') module FROM knowledge_node k LEFT JOIN node_mastery n ON n.node_slug=k.slug WHERE k.subject='xingce' AND k.priority_batch<=2 AND COALESCE(n.sample_n,0)=0 LIMIT 2")
    for x in zeros: out.append({'severity':'medium','title':f"{x['title']}尚无有效样本",'detail':'不能据此判断是否掌握，建议安排真实题验证。','href':'/knowledge'})
    sh=query_one("SELECT COALESCE(SUM(duration_sec),0) s FROM study_session WHERE subject='shenlun' AND date(study_date)>=date('now','-6 day')")
    if sh and sh['s']<3*3600: out.append({'severity':'medium','title':'申论本周投入偏低','detail':f"近7天有效申论时长 {sh['s']/3600:.1f}h，路线基线约5.5h/周。",'href':'/shenlun'})
    return out[:limit]
