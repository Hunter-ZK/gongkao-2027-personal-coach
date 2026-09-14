import{api,jpost,jput,main,clear,h,pct,hours,tag,title,panel,tableWrap,metric,criterionCard}from'../runtime.js';

export async function renderKnowledge(subject='xingce'){
  const rows=await api('/api/knowledge/tree'),list=rows.filter(x=>x.subject===subject);clear(main).append(title(subject==='xingce'?'行测方法体系':'申论能力体系',subject==='xingce'?'按“识别 → 主方法 → 快速路径 → 失效条件 → 真题调用”组织，不用模板填充未建设节点。':'五类申论能力节点独立建设，训练记录与方法正文分开。',subject==='xingce'?'KNOWLEDGE SYSTEM':'SHENLUN LAB'));
  const built=list.filter(x=>x.build_status!=='未建设').length;
  main.append(h('div',{class:'kpi-grid'},metric('正式节点',String(list.length),'个',null,'◇'),metric('已建设正文',String(built),'个',list.length?built/list.length*100:0,'✓','green'),metric('待建设',String(list.length-built),'个',null,'…','amber'),metric('内容原则','真实可用','不是技巧堆砌',null,'✦','cyan')));
  const tree=h('div',{class:'panel knowledge-tree'},h('div',{class:'tree-head'},h('strong',{},subject==='xingce'?'行测知识目录':'申论知识目录'),h('span',{},`${built}/${list.length} 节点已形成正式正文`)),...list.map(x=>h('a',{href:'#','data-slug':x.slug,onclick:async ev=>{ev.preventDefault();await showNode(x.slug)}},`${x.title}${x.build_status==='未建设'?' · 待建设':''}`)));
  const reader=h('article',{class:'knowledge-reader',id:'knowledge-reader'},h('div',{class:'empty'},'从左侧选择一个知识节点。'));
  const toc=h('aside',{class:'mini-toc panel'},h('strong',{},'本页目录'),h('p',{class:'subtle'},'选择节点后自动生成。'));
  main.append(h('div',{class:'knowledge-shell'},tree,reader,toc));if(list[0])showNode(list[0].slug);
}
async function showNode(slug){
  const d=await api('/api/knowledge/node/'+slug),reader=document.querySelector('#knowledge-reader');document.querySelectorAll('.knowledge-tree a[data-slug]').forEach(a=>a.classList.toggle('active',a.dataset.slug===slug));clear(reader);reader.append(h('h1',{},d.meta.title));
  if(d.meta.build_status==='未建设'){reader.append(h('div',{class:'empty'},`此节点尚未建设。当前排在第 ${d.meta.priority_batch||'后续'} 批。`));return}
  reader.append(h('div',{html:d.html}));const toc=document.querySelector('.mini-toc');clear(toc).append(h('strong',{},'本页目录'),...Array.from(reader.querySelectorAll('h2')).map((x,i)=>{x.id=x.id||`sec-${i+1}`;return h('a',{href:'#'+x.id},x.textContent)}));
}

export async function renderPlan(){
  const weeks=await api('/api/plan/timeline'),caps=await api('/api/plan/capability'),ph=await api('/api/plan/phases');clear(main).append(title('13 周双考路线','时间路线与能力路线分开看；阶段晋级由系统判断、你手动确认。','ROADMAP'));
  main.append(panel('13 周时间路线',tableWrap(h('table',{},h('thead',{},h('tr',{},...['周','日期','主题','阶段','目标时长','题量'].map(x=>h('th',{},x)))),h('tbody',{},...weeks.map(w=>h('tr',{},h('td',{},'W'+w.week_no),h('td',{},`${w.start_date}—${w.end_date}`),h('td',{},w.theme),h('td',{},tag(w.phase_code)),h('td',{class:'num'},w.target_hours+'h'),h('td',{class:'num'},w.target_questions)))))));
  main.append(panel('能力路线',tableWrap(h('table',{},h('thead',{},h('tr',{},...['卷型','模块','目标分(估)','当前预估','样本','目标正确率','训练建议'].map(x=>h('th',{},x)))),h('tbody',{},...caps.map(x=>h('tr',{},h('td',{},x.exam_code==='guangdong'?'广东':'国考'),h('td',{},x.name),h('td',{class:'num'},x.total_score.toFixed(1)),h('td',{class:'num'},x.estimated_score==null?'无法估算':x.estimated_score.toFixed(1)),h('td',{class:'num'},x.sample_n),h('td',{class:'num'},pct(x.target_accuracy)),h('td',{},x.training_need)))))));
  main.append(panel('阶段与晋级',h('div',{class:'criterion-list'},...ph.flatMap(p=>[h('div',{class:'phase-title'},h('span',{class:'phase-num'},p.code),h('div',{},h('h3',{},p.name),h('p',{},p.goal_md))),...(p.criteria||[]).map(criterionCard)])));
}

export async function renderProgress(){const d=await api('/api/progress/charts');clear(main).append(title('能力趋势','只展示真实学习与训练形成的数据。','PROGRESS'),panel('学习时长',d.study.length?h('div',{class:'chart'},...d.study.map(x=>h('div',{class:'bar',style:`height:${Math.max(3,Math.min(100,x.seconds/14400*100))}%`,title:`${x.study_date} ${hours(x.seconds)}`}))):h('div',{class:'empty'},'开始计时后，这里显示每日有效学习时长。')),panel('训练正确率',d.accuracy.length?tableWrap(h('table',{},h('thead',{},h('tr',{},h('th',{},'日期'),h('th',{},'来源'),h('th',{},'正确率'))),h('tbody',{},...d.accuracy.map(x=>h('tr',{},h('td',{},x.trained_on),h('td',{},x.source),h('td',{class:'num'},pct(x.correct_q/x.total_q))))))):h('div',{class:'empty'},'导入训练后，这里按来源展示趋势。')))}

export async function renderMethods(){const d=await api('/api/methods');clear(main).append(title('方法与结论','主方法、限制采用、明确拒绝三档；限制采用必须写清边界。','METHOD LIBRARY'),panel('方法库',d.length?tableWrap(h('table',{},h('thead',{},h('tr',{},...['方法','适用','来源','采用级别','依据'].map(x=>h('th',{},x)))),h('tbody',{},...d.map(x=>h('tr',{},h('td',{},x.name),h('td',{},x.applies_to||'—'),h('td',{},x.source||'—'),h('td',{},tag(x.adoption,x.adoption==='主方法'?'correct':x.adoption==='明确拒绝'?'wrong':'pending')),h('td',{},x.basis||'—')))))):h('div',{class:'empty'},'还没有方法记录。优先从真实训练中沉淀，而不是堆技巧。')))}

export async function renderSettings(){const d=await api('/api/settings');clear(main).append(title('偏好设置','调整学习阈值并维护本地数据备份。','SETTINGS'),panel('学习阈值',h('div',{class:'form-row'},h('div',{class:'field'},h('label',{},'深度学习阈值（分钟）'),h('input',{id:'set-deep',type:'number',value:d.deep_threshold_min||30})),h('div',{class:'field'},h('label',{},'专注学习阈值（分钟）'),h('input',{id:'set-focus',type:'number',value:d.focus_threshold_min||15}))),h('div',{class:'actions',style:'margin-top:14px'},h('button',{class:'primary',onclick:async()=>{await jput('/api/settings',{values:{deep_threshold_min:Number(document.querySelector('#set-deep').value),focus_threshold_min:Number(document.querySelector('#set-focus').value)}});alert('已保存')}},'保存设置'),h('button',{class:'secondary',onclick:async()=>{const x=await jpost('/api/export');location.href='/api/export/'+x.export_id+'/download'}},'导出本地数据备份')),h('p',{class:'subtle'},d.data_policy||'')))}
