import{api,jpost,jpatch,main,clear,h,pct,fmtSec,tag,title,panel,tableWrap}from'../runtime.js';

export async function renderTrainings(){
  const g=await api('/api/trainings');clear(main).append(title('训练记录','按训练来源拆分看正确率、用时和数据可信度；随机练习不等同于整卷成绩。','TRAINING LOG'));
  for(const[s,rows]of Object.entries(g))main.append(panel(s,tableWrap(h('table',{},h('thead',{},h('tr',{},...['日期','题量','正确','正确率','用时','可信度'].map(x=>h('th',{},x)))),h('tbody',{},...rows.map(x=>h('tr',{},h('td',{},x.trained_on),h('td',{class:'num'},x.total_q),h('td',{class:'num'},x.correct_q),h('td',{class:'num'},pct(x.total_q?x.correct_q/x.total_q:null)),h('td',{class:'num'},x.duration_sec?fmtSec(x.duration_sec):'—'),h('td',{},tag(x.data_confidence,x.data_confidence==='verified'?'correct':'pending'))))))));
  if(!Object.keys(g).length)main.append(h('div',{class:'empty'},'还没有训练记录。可以上传 PDF，也可以手工录入。'));
}

export async function renderMistakes(){
  const rows=await api('/api/mistakes');clear(main).append(title('错题矩阵','先诊断错因，再做复训；新错题不会被系统随意编造原因。','MISTAKE SYSTEM'));
  main.append(panel('错题列表',rows.length?tableWrap(h('table',{},h('thead',{},h('tr',{},...['模块','题干','错因','状态','下次复训','解法'].map(x=>h('th',{},x)))),h('tbody',{},...rows.map(x=>h('tr',{},h('td',{},x.module||'—'),h('td',{},(x.stem_md||'').slice(0,74)),h('td',{},x.cause_primary||tag('待诊断','pending')),h('td',{},tag(x.status,x.status==='已修复'?'correct':'pending')),h('td',{},x.next_review_at||'—'),h('td',{},x.standard_solution_md?'已记录':'待补充')))))):h('div',{class:'empty'},'还没有错题。上传一份训练 PDF，错题会在人工确认后进入这里。')));
}

let currentReview=null,reviewStart=0,selectedAnswer='';
export function setReviewAnswer(answer){selectedAnswer=answer;document.querySelectorAll('.review-option').forEach(b=>b.classList.toggle('selected',b.dataset.key===selectedAnswer))}
export async function renderReview(){
  const rows=await api('/api/review/queue?scope=due');clear(main).append(title('错题复训','真实作答、独立计时，提交后才展开答案和标准解法。','REVIEW LOOP'));
  if(!rows.length){main.append(h('div',{class:'empty'},'今天没有到期错题。'));return}
  currentReview=currentReview&&rows.some(x=>x.id===currentReview.id)?currentReview:rows[0];selectedAnswer='';reviewStart=Date.now();
  const list=h('div',{class:'panel review-list'},...rows.map(x=>h('button',{class:'text-btn',onclick:()=>{currentReview=x;renderReview()}},`${x.module||'未分类'} · #${x.id}`)));
  const q=currentReview,opts=typeof q.options==='object'?q.options:JSON.parse(q.options_json||'{}');
  const mid=h('div',{class:'panel'},h('span',{class:'eyebrow'},q.module||'未分类'),h('h2',{},q.stem_md||'题干缺失'),h('div',{id:'review-options'},...Object.entries(opts).map(([k,v])=>h('button',{class:'review-option','data-key':k,onclick:()=>setReviewAnswer(k)},`${k}. ${v||'[图片选项]'}`))),h('div',{class:'actions'},h('button',{class:'primary',onclick:async()=>{if(!selectedAnswer)return alert('先选择答案');const res=await jpost('/api/review/'+q.id+'/submit',{answer:selectedAnswer,duration_sec:Math.round((Date.now()-reviewStart)/1000)});document.querySelector('#review-result').replaceChildren(h('h3',{},res.is_correct?'本次答对':'本次答错'),h('p',{},`你的答案 ${selectedAnswer} · 正确答案 ${res.correct_answer}`),h('p',{},res.standard_solution_md),h('p',{class:'subtle'},`下次复训：${res.next_review_at}`))}},'提交答案')),h('div',{id:'review-result'}));
  const right=h('div',{class:'panel'},h('div',{class:'section-head'},h('h2',{class:'section-title'},'答题卡')),h('div',{class:'answer-grid'},...rows.map((x,i)=>h('div',{class:'bubble'},i+1))),h('p',{class:'subtle'},`今日到期 ${rows.length} 题`));
  main.append(h('div',{class:'review-layout'},list,mid,right));
}

export async function renderImport(){
  clear(main).append(title('真题智能导入','粉笔快速智能练习按真实版式解析；未知格式会进入通用解析并强制人工复核。','PDF IMPORT'));
  const input=h('input',{type:'file',accept:'.pdf',id:'pdf-file'}),msg=h('div',{class:'subtle'});
  const upload=h('button',{class:'primary',onclick:async()=>{if(!input.files[0])return alert('请先选择 PDF');const fd=new FormData();fd.append('file',input.files[0]);msg.textContent='正在解析 PDF…';try{const res=await api('/api/import/pdf',{method:'POST',body:fd});msg.textContent=res.message||'解析完成';await showProof(res.import_id)}catch(e){msg.textContent=e.message}}},'开始解析');
  main.append(h('section',{class:'import-hero'},h('div',{class:'import-icon'},'⇧'),h('h3',{},'导入你的真实训练结果'),h('p',{},'未人工确认的题目不会进入能力统计。高置信只决定复核优先级，不代表系统可以替你确认。'),h('div',{class:'actions',style:'justify-content:center'},input,upload),msg),h('div',{id:'proof-host',style:'margin-top:18px'}));
}

async function showProof(id){
  const d=await api('/api/import/'+id+'/proof'),host=document.querySelector('#proof-host');
  const dateInput=h('input',{type:'date',value:new Date().toISOString().slice(0,10),id:'proof-date'}),dur=h('input',{type:'number',min:'0',placeholder:'整组用时（秒）',id:'proof-dur'}),source=h('select',{id:'proof-source'},...[['fenbi_random','粉笔随机练习'],['special','专项练习'],['mock','模考'],['gd_real','广东真题'],['national_real','国考真题']].map(([v,t])=>h('option',{value:v},t)));
  const modules=['政治理论','常识判断','常识应用','言语理解','数量关系','数字推理','数学运算','判断推理','图形推理','逻辑判断','科学推理','资料分析','未分类'];
  const qs=h('div',{},...d.questions.map(q=>{const mod=h('select',{},...modules.map(x=>h('option',{value:x,selected:(q.module||'未分类')===x},x))),stem=h('textarea',{rows:'4'},q.stem_md||''),ua=h('input',{value:q.user_answer||'',placeholder:'作答'}),ca=h('input',{value:q.correct_answer||'',placeholder:'正确答案'}),btn=h('button',{class:'secondary'},q.verified?'已确认':'保存并确认');if(q.verified)btn.disabled=true;btn.onclick=async()=>{await jpatch(`/api/import/${id}/question/${q.seq}`,{module:mod.value,stem_md:stem.value,user_answer:ua.value||null,correct_answer:ca.value||null,verified:true});btn.textContent='已确认';btn.disabled=true};return h('div',{class:'proof-q','data-low':q.parse_confidence<.7?'true':'false'},h('div',{class:'proof-head'},h('strong',{},`第 ${q.seq} 题 · 解析置信 ${Math.round(q.parse_confidence*100)}%`),q.parse_confidence<.7?tag('优先复核','pending'):tag('高置信')),h('div',{class:'form-row'},h('div',{class:'field'},h('label',{},'模块'),mod),h('div',{class:'field'},h('label',{},'作答'),ua),h('div',{class:'field'},h('label',{},'正确答案'),ca)),h('div',{class:'field'},h('label',{},'题干'),stem),btn)}));
  host.replaceChildren(panel('人工校对台',h('div',{class:'form-row'},h('div',{class:'field'},h('label',{},'训练日期'),dateInput),h('div',{class:'field'},h('label',{},'整组用时（秒，作为估算均时）'),dur),h('div',{class:'field'},h('label',{},'训练来源'),source)),h('div',{class:'proof-layout'},h('div',{class:'pdf-placeholder'},`原 PDF：${d.import.filename}\n\n校对时以原文件为准。\n高置信也必须确认后才进入统计。`),qs),h('div',{class:'actions'},h('button',{class:'secondary',onclick:async()=>{if(!confirm('仅在你已人工浏览全部题目后使用批量确认。继续？'))return;await jpost(`/api/import/${id}/confirm`,{seq_list:d.questions.map(q=>q.seq)});await showProof(id)}},'人工核对后批量确认'),h('button',{class:'primary',onclick:async()=>{try{const res=await jpost(`/api/import/${id}/commit`,{trained_on:dateInput.value,duration_sec:Number(dur.value||0),source:source.value,exam_type:'na'});alert(`已入库，生成 ${res.mistakes_created} 道错题`);location.href='/trainings'}catch(e){alert(e.message)}}},'确认并入库'))));
}
