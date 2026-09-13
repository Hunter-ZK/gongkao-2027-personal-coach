from __future__ import annotations
from collections import defaultdict
from datetime import date, timedelta
from statistics import median
from db import query, query_one, jload

def evaluate(days=14):
    rows=query("SELECT study_date,duration_sec,time_slot FROM study_session WHERE date(study_date)>=date('now',?)",(f'-{days-1} day',))
    by=defaultdict(int); slots=defaultdict(int)
    for r in rows: by[r['study_date']]+=r['duration_sec']; slots[r.get('time_slot') or 'unknown']+=r['duration_sec']
    weekday=[]; weekend=[]
    for ds,sec in by.items():
        d=date.fromisoformat(ds); (weekend if d.weekday()>=5 else weekday).append(sec)
    wd=median(weekday)/3600 if weekday else 0; we=median(weekend)/3600 if weekend else 0
    weekly=wd*5+we*2
    future=query("SELECT COALESCE(SUM(target_hours),0) h FROM week_plan WHERE date(end_date)>=date('now')")[0]['h']
    left=max(1,(date(2026,12,13)-date.today()).days/7)
    capacity=weekly*left
    gap=max(0,float(future)-capacity)
    cuts=[]
    if gap>0:
        for label,h in [("常识精学转为碎片滚动",min(gap,8)),("图形推理低频专项",min(max(gap-8,0),6)),("国考非核心数量难题",min(max(gap-14,0),8))]:
            if h>0: cuts.append({'item':label,'hours':round(h,1)})
    return {'days_with_data':len(by),'weekday_median_hours':round(wd,2),'weekend_median_hours':round(we,2),'weekly_capacity_hours':round(weekly,1),'time_slots_hours':{k:round(v/3600,1) for k,v in slots.items()},'remaining_plan_hours':round(float(future),1),'estimated_capacity_hours':round(capacity,1),'gap_hours':round(gap,1),'cut_suggestions':cuts}
