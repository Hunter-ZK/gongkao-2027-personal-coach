from __future__ import annotations
import json, sys
from datetime import date, timedelta
from pathlib import Path
import re
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import migrate, transaction, now_iso, jdump

EXAMS=[
("national","2027国家公务员考试（副省级）","2026-11-29",0,"按近年招录节奏估算；2027官方公告尚未发布。预测窗口为11月28—29日。","2026-10-14",120,135,100,70,2,"副省级为第二目标；日期、题量细分均待当年官方公告/实卷确认。"),
("guangdong","2027广东省考","2026-12-13",0,"参照近年广东省考年末安排估算；备选日期12月6日，官方尚未公告。","2026-10-20",90,90,100,90,1,"省直/深圳市直为第一目标。"),
]
MODULES={
"guangdong":[
("政治理论",10,1.0,10,6,.85,"inferred"),("常识应用",10,1.0,10,5,.70,"inferred"),("言语理解",15,.87,13,12,.85,"inferred"),
("数字推理",5,1,5,5,.90,"inferred"),("数学运算",10,1,10,12,.75,"inferred"),("图形推理",5,1.2,6,4,.85,"inferred"),
("逻辑判断",15,1.2,18,18,.88,"inferred"),("科学推理",5,1.2,6,5,.80,"inferred"),("资料分析",15,1.2,18,20,.88,"inferred")],
"national":[
("政治理论",10,.75,7.5,6,.80,"inferred"),("常识判断",10,.75,7.5,5,.70,"inferred"),("言语理解",40,.75,30,32,.80,"inferred"),
("数量关系",15,.75,11.25,15,.65,"inferred"),("判断推理",35,.75,26.25,35,.82,"inferred"),("资料分析",25,.70,17.5,27,.85,"inferred")]
}
PHASES=[("P1","系统恢复",1,1,3,"恢复核心方法，建立真实样本与计时基线。"),("P2","分模块限时",2,4,5,"由知识恢复转向限时稳定输出。"),("P3","国考卷型强化",3,6,9,"副省级结构专项与整卷并行。"),("P4","国考冲刺",4,10,11,"整卷校准、取舍与稳定性。"),("P5","广东切换冲刺",5,12,13,"切换广东90分钟卷型，强化数字/科学/多选策略。")]
WEEK_THEMES=[
"基线与资料/逻辑恢复","言语与数量恢复","核心节点收口与第一次限时诊断","模块限时一：资料/逻辑","模块限时二：言语/数量",
"副省级卷型切换","第一次国考整卷","国考整卷+弱项修复","国考节奏固化","国考冲刺一","国考冲刺二","广东卷型切换","广东整卷与考前收口"]
NODES=[
("data-abrx-base","ABRX 四量与基期量","资料分析",1,3.6,3.0),
("data-two-period-proportion","两期比重与百分点","资料分析",1,3.6,3.0),
("data-truncated-division","截位直除与选项差距定精度","资料分析",1,0,3.0),
("logic-strengthen-premise","加强与前提假设","逻辑判断",1,3.6,2.0),
("logic-analytical-reasoning","分析推理：排序·分组·匹配","逻辑判断",1,2.4,2.0),
("analogy-secondary-discrimination","类比二级辨析与三词复合","逻辑判断",1,2.4,1.5),
("quant-permutation-probability","排列组合与概率","数学运算",1,2.0,1.0),
("logic-translation","翻译推理与逆否等价","逻辑判断",1,3.6,2.0),
("logic-weaken","削弱：论据→缺口→结论","逻辑判断",1,3.6,2.0),
("verbal-central-idea","中心理解与文段结构识别","言语理解",1,3.6,4.0),
("verbal-logical-fill","逻辑填空八步法","言语理解",1,3.5,4.0),
("data-growth-speed-calc","增长量·增长率速算体系","资料分析",1,3.6,3.0),
("quant-number-sequence","数字推理五类规律","数字推理",2,5.0,0),
("quant-value-judgment","数量做题价值判断与必做题池","数学运算",2,2.0,1.0),
("quant-substitution-properties","代入排除与数字特性","数学运算",2,2.0,1.0),
("figure-retrieval-framework","图推检索框架","图形推理",2,3.0,1.0),
("figure-solid-reconstruction","六面体空间重构与多边形拼接","图形推理",2,3.0,1.0),
("definition-key-elements","定义判断硬要件拆解","逻辑判断",2,2.0,2.0),
("verbal-intention-title","意图判断·标题·细节判断","言语理解",2,3.0,4.0),
("verbal-sentence-order","语句排序与语句填空","言语理解",2,2.0,3.0),
("data-average-multiple-mixed","平均数·倍数·混合增长率","资料分析",2,3.6,3.0),
("logic-true-false-set","真假推理与集合推理","逻辑判断",2,2.4,2.0),
("quant-engineering-travel","工程·行程·利润·浓度","数学运算",2,3.0,1.0),
("gd-multiple-choice-strategy","广东多选题应试策略","政治理论",2,2.0,0),
("data-group-rhythm","资料整组节奏与止损","资料分析",3,2.0,2.0),
("verbal-idiom-word","成语与实词高频辨析","言语理解",3,2.0,4.0),
("logic-explain-evaluate","解释型与评价型","逻辑判断",3,2.4,2.0),
("science-force-circuit","科学推理：受力·浮力·电路","科学推理",3,6.0,0),
("politics-core-expressions","政治理论高频表述体系","政治理论",3,5.0,2.0),
("common-sense-rolling","常识与时政的滚动记忆机制","常识应用",3,5.0,2.0),
]
SHENLUN=[("sl-summarize","申论·归纳概括"),("sl-analysis","申论·综合分析"),("sl-solution","申论·提出对策"),("sl-official-doc","申论·公文写作"),("sl-essay","申论·大作文")]

def main():
    migrate(); now=now_iso()
    with transaction() as c:
        for e in EXAMS:
            c.execute("INSERT OR IGNORE INTO exam VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",e)
        for ex,mods in MODULES.items():
            for seq,(name,q,sp,total,mins,acc,conf) in enumerate(mods,1):
                c.execute("INSERT OR IGNORE INTO paper_module(exam_code,name,seq,question_count,score_per_q,score_confidence,total_score,target_minutes,target_accuracy,count_confidence,note) VALUES(?,?,?,?,?,?,?,?,?,?,?)",(ex,name,seq,q,sp,"estimated",total,mins,acc,conf,"分值为规划估算，不代表官方逐题赋分"))
        for ph in PHASES:
            c.execute("INSERT OR IGNORE INTO phase(code,name,seq,start_week,end_week,goal_md,status) VALUES(?,?,?,?,?,?,?)",(*ph,"active" if ph[0]=="P1" else "pending"))
        criteria=[("P1","12个核心节点首轮恢复≥11个","core_nodes_recovered","batch1","gte",11,1),("P1","资料分析有效样本正确率≥85%","accuracy","资料分析","gte",.85,2),("P1","核心训练有效样本≥60题","sample_n","all","gte",60,3),
                  ("P2","资料分析限时正确率≥88%","accuracy","资料分析","gte",.88,1),("P2","逻辑判断限时正确率≥85%","accuracy","逻辑判断","gte",.85,2),("P3","国考整卷至少2套","full_paper_runs","national","gte",2,1),("P4","国考整卷至少4套","full_paper_runs","national","gte",4,1),("P5","广东整卷至少3套","full_paper_runs","guangdong","gte",3,1)]
        for x in criteria:
            exists=c.execute("SELECT 1 FROM phase_exit_criterion WHERE phase_code=? AND seq=?",(x[0],x[6])).fetchone()
            if not exists:
                c.execute("INSERT INTO phase_exit_criterion(phase_code,label,metric,scope,operator,threshold,seq) VALUES(?,?,?,?,?,?,?)",x)
        start=date(2026,9,14)
        for w in range(1,14):
            s=start+timedelta(days=7*(w-1)); e=s+timedelta(days=6)
            phase="P1" if w<=3 else "P2" if w<=5 else "P3" if w<=9 else "P4" if w<=11 else "P5"
            hrs=22 if w<10 else 24
            c.execute("INSERT OR IGNORE INTO week_plan VALUES(?,?,?,?,?,?,?,?,?)",(w,s.isoformat(),e.isoformat(),WEEK_THEMES[w-1],phase,hrs,260 if w<6 else 320,"",None))
            plans={"资料分析":4.0,"判断/逻辑":4.0,"言语理解":3.5,"数量关系":2.5,"申论":5.5,"政治/常识":1.0,"复盘":1.5}
            for m,h in plans.items(): c.execute("INSERT OR IGNORE INTO week_module_plan(week_no,module,planned_hours,planned_questions) VALUES(?,?,?,?)",(w,m,h,50 if m!="申论" else 2))
        for seq,(slug,title,module,batch,gw,nw) in enumerate(NODES,1):
            mods=jdump({"guangdong":module,"national": "判断推理" if module in ["逻辑判断","图形推理"] else "数量关系" if module in ["数学运算","数字推理"] else module})
            node_file=Path(__file__).resolve().parents[1]/"content"/"nodes"/f"{slug}.md"
            path=f"{slug}.md" if node_file.exists() else None
            status="已建设" if node_file.exists() else "未建设"
            char_count=len(re.findall(r"[\u4e00-\u9fff]",node_file.read_text(encoding="utf-8"))) if node_file.exists() else 0
            lint_passed=1 if node_file.exists() and char_count>=3000 else 0
            c.execute("""INSERT INTO knowledge_node(slug,title,subject,module_names,seq,build_status,priority_batch,content_path,char_count,lint_passed,exam_weight_gd,exam_weight_national,target_seconds,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(slug) DO UPDATE SET title=excluded.title,subject=excluded.subject,module_names=excluded.module_names,seq=excluded.seq,build_status=excluded.build_status,priority_batch=excluded.priority_batch,content_path=excluded.content_path,char_count=excluded.char_count,lint_passed=excluded.lint_passed,exam_weight_gd=excluded.exam_weight_gd,exam_weight_national=excluded.exam_weight_national,target_seconds=excluded.target_seconds,updated_at=excluded.updated_at""",
            (slug,title,"xingce",mods,seq,status,batch,path,char_count,lint_passed,gw,nw,75,now))
            c.execute("INSERT OR IGNORE INTO node_mastery(node_slug,updated_at) VALUES(?,?)",(slug,now))
        for i,(slug,title) in enumerate(SHENLUN,31):
            node_file=Path(__file__).resolve().parents[1]/"content"/"nodes"/f"{slug}.md"
            path=f"{slug}.md" if node_file.exists() else None
            status="已建设" if node_file.exists() else "未建设"
            char_count=len(re.findall(r"[\u4e00-\u9fff]",node_file.read_text(encoding="utf-8"))) if node_file.exists() else 0
            lint_passed=1 if node_file.exists() and char_count>=3000 else 0
            c.execute("""INSERT INTO knowledge_node(slug,title,subject,module_names,seq,build_status,priority_batch,content_path,char_count,lint_passed,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(slug) DO UPDATE SET title=excluded.title,subject=excluded.subject,module_names=excluded.module_names,seq=excluded.seq,build_status=excluded.build_status,priority_batch=excluded.priority_batch,content_path=excluded.content_path,char_count=excluded.char_count,lint_passed=excluded.lint_passed,updated_at=excluded.updated_at""",
            (slug,title,"shenlun",jdump({"guangdong":"申论","national":"申论"}),i,status,3,path,char_count,lint_passed,now))
        settings={"deep_threshold_min":30,"focus_threshold_min":15,"review_intervals_days":[1,3,7,15,30],"mastery":{"recovered_min_sample":8,"recovered_min_accuracy":.75,"stable_min_sample":15,"stable_min_accuracy":.85,"exam_stable_min_full_papers":2},"target_score":{"guangdong":{"xingce":90,"shenlun":80},"national":{"xingce":70,"shenlun":70}},"baseline_score":{"guangdong":{"xingce":78,"shenlun":68}},"weekly_target_hours":22,"timezone":"Asia/Shanghai","data_policy":"SQLite运行库 + 可版本化JSON导出；GitHub为跨会话长期事实源"}
        # Static legacy-note -> node links. Existing source files are copied by import_legacy.py.
        mapping_path=Path(__file__).resolve().parents[1]/"content"/"legacy_mapping.json"
        if mapping_path.exists():
            mapping=json.loads(mapping_path.read_text(encoding="utf-8"))
            legacy_dir=Path(__file__).resolve().parents[1]/"content"/"legacy_notes"
            for file_name,slugs in mapping.items():
                src=legacy_dir/file_name
                line_count=len(src.read_text(encoding="utf-8").splitlines()) if src.exists() else None
                for slug in slugs:
                    exists=c.execute("SELECT 1 FROM legacy_excerpt WHERE node_slug=? AND file_name=?",(slug,file_name)).fetchone()
                    if not exists:
                        c.execute("INSERT INTO legacy_excerpt(node_slug,file_name,heading,start_line,end_line,note) VALUES(?,?,?,?,?,?)",(slug,file_name,"整篇历史笔记",1,line_count,"原始历史笔记镜像；仅作恢复与对照，不作为2027规则来源"))
        for k,v in settings.items(): c.execute("INSERT OR IGNORE INTO setting VALUES(?,?,?)",(k,jdump(v),now))
        c.execute("INSERT OR IGNORE INTO timer_state(id,status) VALUES(1,'idle')")
    print('seeded')
if __name__=='__main__': main()
