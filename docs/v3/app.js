const D=window.APP_DATA;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fmtDate=d=>new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',weekday:'short'}).format(d);
const ymd=d=>{const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
const hm=d=>new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(d));
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmtDur=ms=>{const m=Math.floor(ms/60000),h=Math.floor(m/60),r=m%60;return h?`${h}h ${String(r).padStart(2,'0')}m`:`${r}m`};
const fmtClock=ms=>{let s=Math.floor(ms/1000),h=Math.floor(s/3600);s%=3600;let m=Math.floor(s/60);s%=60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`};

// Navigation
const titles={home:'学习总览',timer:'学习计时',plan:'备考规划',knowledge:'行测体系',mistakes:'错题复训',training:'训练记录'};
function go(view){$$('.view').forEach(v=>v.classList.remove('active'));$('#'+view).classList.add('active');$$('.nav').forEach(n=>n.classList.toggle('active',n.dataset.view===view));$('#view-title').textContent=titles[view]||'个人备考中枢';window.scrollTo({top:0,behavior:'smooth'});}
$$('.nav').forEach(n=>n.addEventListener('click',()=>go(n.dataset.view)));
$$('[data-jump]').forEach(n=>n.addEventListener('click',()=>go(n.dataset.jump)));
$('#today-label').textContent=fmtDate(new Date());

// Home
function renderHome(){
  $('#roadmap').innerHTML=D.roadmap.map(x=>`<div class="roadmap-item ${x.current?'current':''}"><b>${esc(x.name)}</b><span>${esc(x.desc)}</span><div class="mini-track"><i style="width:${x.progress}%"></i></div></div>`).join('');
  $('#module-grid').innerHTML=D.modules.map(m=>`<article class="module-card"><div class="top"><strong>${esc(m.name)}</strong><small>${esc(m.mastery)}</small></div><div class="module-score">${m.score==null?'—':m.score+'%'} <span>${esc(m.sample)}</span></div><div class="mini-track"><i style="width:${m.progress}%"></i></div><p>${esc(m.risk)}</p></article>`).join('');
  $('#today-tasks').innerHTML=D.todayTasks.map(t=>`<div class="task-row"><div class="task-priority">${t.p}</div><div><b>${esc(t.title)}</b><span>${esc(t.detail)}</span></div><div class="time">${esc(t.time)}</div></div>`).join('');
  $('#home-mistakes').innerHTML=D.mistakes.slice(-3).reverse().map(m=>`<div class="compact-item"><b>${esc(m.type)} · ${esc(m.training)}</b><span>${esc(m.diagnosis)}</span></div>`).join('');
}

// Plan
function renderPlan(){
  $('#phase-path').innerHTML=D.phases.map((p,i)=>`<div class="phase-row"><div class="phase-no">${i+1}</div><div><b>${esc(p.name)}</b><span>${esc(p.desc)}</span></div><small>${esc(p.time)}</small></div>`).join('');
  $('#week-plan').innerHTML=D.weekPlan.map(p=>`<div class="day-plan ${p.today?'today':''}"><b>${esc(p.day)} · ${esc(p.title)}</b><span>${esc(p.detail)}</span></div>`).join('');
}

// Training
function renderTraining(){
  $('#training-table').innerHTML=D.trainings.map(t=>`<tr><td><b>${esc(t.id)}</b></td><td>${esc(t.source)}</td><td>${t.q}</td><td>${t.acc}</td><td>${t.time}</td><td>${t.judge}</td><td>${t.quant}</td><td>${t.data}</td><td>${esc(t.note)}</td></tr>`).join('');
}

// Mistakes
function renderMistakes(){
  $('#mistake-grid').innerHTML=D.mistakes.map(m=>`<article class="mistake-card"><div class="head"><div><h3>${esc(m.type)}</h3><div class="meta">${esc(m.training)} · ${esc(m.module)}</div></div><span class="pill ${m.status==='改善'?'deep':'focus'}">${esc(m.status)}</span></div><div class="question-preview">${esc(m.question)}</div><div class="answer-row"><span class="wrong">你的答案：${esc(m.user)}</span><span class="right">正确答案：${esc(m.answer)}</span></div><div class="mistake-actions"><span class="muted">${esc(m.diagnosis)}</span><button class="review-btn" data-mistake="${m.id}">查看解析 / 复训</button></div></article>`).join('');
  $$('[data-mistake]').forEach(b=>b.addEventListener('click',()=>openMistake(b.dataset.mistake)));
}
function openMistake(id){const m=D.mistakes.find(x=>x.id===id);if(!m)return;$('#drawer-content').innerHTML=`<span class="eyebrow dark">${esc(m.training)} · ${esc(m.module)}</span><h2>${esc(m.type)}</h2><div class="question-full">${esc(m.question)}</div><div class="options">${m.options.map(o=>{const l=o.trim()[0];return `<div class="option ${l===m.user?'user-wrong':''} ${l===m.answer?'correct':''}">${esc(o)}</div>`}).join('')}</div><div class="drawer-section"><h4>你的答案 / 正确答案</h4><p><b style="color:#b34747">${esc(m.user)}</b> → <b style="color:#167d58">${esc(m.answer)}</b></p></div><div class="drawer-section"><h4>错因诊断</h4><p>${esc(m.diagnosis)}</p></div><div class="drawer-section"><h4>本题解题技巧</h4><p>${esc(m.skill)}</p></div><div class="drawer-section"><h4>复训要求</h4><p>${esc(m.review)}</p></div><button class="primary" style="background:#315efb;color:#fff;margin-top:10px" id="drawer-timer">用计时器开始复训</button>`;$('#mistake-drawer').classList.add('open');$('#drawer-backdrop').classList.add('open');setTimeout(()=>{const b=$('#drawer-timer');if(b)b.onclick=()=>{closeDrawer();go('timer');$('#timer-subject').value='错题复训';$('#timer-type').value='错题复盘';$('#timer-task').value=`${m.id} · ${m.type}`;}},0)}
function closeDrawer(){$('#mistake-drawer').classList.remove('open');$('#drawer-backdrop').classList.remove('open')}
$('#drawer-close').addEventListener('click',closeDrawer);$('#drawer-backdrop').addEventListener('click',closeDrawer);

// Knowledge
let activeKnowledge='资料分析';
function renderKnowledgeNav(){
  $('#knowledge-nav').innerHTML=Object.entries(D.knowledge).map(([mod,groups])=>`<div><button class="knowledge-module ${mod===activeKnowledge?'active':''}" data-kmod="${esc(mod)}">${esc(mod)}</button>${mod===activeKnowledge?groups.map((g,i)=>`<div class="knowledge-sub" data-scroll="topic-${i}">${esc(g.group)}</div>`).join(''):''}</div>`).join('');
  $$('[data-kmod]').forEach(b=>b.addEventListener('click',()=>{activeKnowledge=b.dataset.kmod;renderKnowledgeNav();renderKnowledge()}));
  $$('[data-scroll]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'})));
}
function renderKnowledge(filter=''){
  const groups=D.knowledge[activeKnowledge]||[];let count=0;const q=filter.trim().toLowerCase();
  $('#knowledge-content').innerHTML=groups.map((g,gi)=>{const topics=g.topics.filter(t=>!q||JSON.stringify(t).toLowerCase().includes(q));count+=topics.length;if(!topics.length)return'';return `<section class="topic-section" id="topic-${gi}"><h3>${esc(g.group)}</h3>${topics.map(t=>`<article class="topic-card"><h4>${esc(t.name)}</h4><div class="topic-tags">${t.models.map(x=>`<span>${esc(x)}</span>`).join('')}</div><div class="topic-grid"><div class="topic-box"><b>识别信号</b><p>${esc(t.trigger)}</p></div><div class="topic-box"><b>推荐主方法</b><p>${esc(t.main)}</p></div><div class="topic-box"><b>标准步骤</b><ol>${t.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div><div class="topic-box"><b>速解 / 高收益技巧</b><p>${esc(t.fast)}</p></div><div class="topic-box"><b>适用边界</b><p>${esc(t.limit)}</p></div><div class="topic-box"><b>常见误用</b><p>${esc(t.trap)}</p></div><div class="topic-box" style="grid-column:1/-1"><b>名师与综合判断</b><p>${esc(t.teacher)}</p></div></div></article>`).join('')}</section>`}).join('')||'<article class="panel">没有匹配的知识点。</article>';
  $('#knowledge-count').textContent=`${count} 个知识节点`;
}
$('#knowledge-search').addEventListener('input',e=>renderKnowledge(e.target.value));

// Timer & local data
const SESSION_KEY='gongkao-v3-study-sessions';
const TIMER_KEY='gongkao-v3-live-timer';
const TARGET_KEY='gongkao-v3-week-target';
let sessions=JSON.parse(localStorage.getItem(SESSION_KEY)||'[]');
let timer=JSON.parse(localStorage.getItem(TIMER_KEY)||'{"mode":"idle","startedAt":null,"sessionStart":null,"accumulated":0,"subject":"资料分析","type":"知识恢复","task":""}');
let weekTarget=Number(localStorage.getItem(TARGET_KEY)||26);
$('#week-target-hours').textContent=weekTarget;

function saveTimer(){localStorage.setItem(TIMER_KEY,JSON.stringify(timer))}
function saveSessions(){localStorage.setItem(SESSION_KEY,JSON.stringify(sessions))}
function elapsed(){return timer.accumulated+(timer.mode==='running'&&timer.startedAt?Date.now()-timer.startedAt:0)}
function category(ms){const m=ms/60000;return m>=30?'deep':m>=15?'focus':'fragment'}
function categoryLabel(c){return c==='deep'?'深度学习':c==='focus'?'专注学习':'碎片学习'}
function syncTimerControls(){
  $('#timer-clock').textContent=fmtClock(elapsed());
  $('#timer-start').textContent=timer.mode==='paused'?'继续':'开始';
  $('#timer-start').disabled=timer.mode==='running';
  $('#timer-pause').disabled=timer.mode!=='running';
  $('#timer-end').disabled=timer.mode==='idle';
  $('#timer-state').textContent=timer.mode==='running'?`计时中 · ${timer.subject} · ${timer.type}`:timer.mode==='paused'?'已暂停，暂停时间不计入学习':'尚未开始';
  if(timer.mode!=='idle'){$('#timer-subject').value=timer.subject;$('#timer-type').value=timer.type;$('#timer-task').value=timer.task||''}
}
$('#timer-start').addEventListener('click',()=>{
  if(timer.mode==='idle'){
    timer={mode:'running',startedAt:Date.now(),sessionStart:Date.now(),accumulated:0,subject:$('#timer-subject').value,type:$('#timer-type').value,task:$('#timer-task').value.trim()};
  }else if(timer.mode==='paused'){timer.mode='running';timer.startedAt=Date.now()}
  saveTimer();syncTimerControls();
});
$('#timer-pause').addEventListener('click',()=>{if(timer.mode!=='running')return;timer.accumulated=elapsed();timer.mode='paused';timer.startedAt=null;saveTimer();syncTimerControls()});
$('#timer-end').addEventListener('click',()=>{
  if(timer.mode==='idle')return;const duration=elapsed(),end=Date.now();const rec={id:'S'+end,date:ymd(timer.sessionStart||end),start:timer.sessionStart||end,end,duration,category:category(duration),subject:timer.subject,type:timer.type,task:timer.task||''};sessions.unshift(rec);saveSessions();timer={mode:'idle',startedAt:null,sessionStart:null,accumulated:0,subject:$('#timer-subject').value,type:$('#timer-type').value,task:''};saveTimer();$('#timer-task').value='';syncTimerControls();renderTimeData();
});

function aggregate(){
  const map={};sessions.forEach(s=>{const d=s.date||(ymd(s.start));if(!map[d])map[d]={date:d,total:0,deep:0,focus:0,fragment:0,deepN:0,focusN:0,fragmentN:0};const a=map[d];a.total+=s.duration;a[s.category]+=s.duration;a[s.category+'N']++});return Object.values(map).sort((a,b)=>b.date.localeCompare(a.date));
}
function todayAgg(){return aggregate().find(x=>x.date===ymd(new Date()))||{total:0,deep:0,focus:0,fragment:0,deepN:0,focusN:0,fragmentN:0}}
function last7(){const out=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const key=ymd(d),a=aggregate().find(x=>x.date===key)||{date:key,total:0,deep:0,focus:0,fragment:0};out.push({...a,label:['日','一','二','三','四','五','六'][d.getDay()]})}return out}
function renderTimeData(){
  const a=todayAgg(),todaySessions=sessions.filter(s=>(s.date||ymd(s.start))===ymd(new Date()));
  $('#stat-total').textContent=fmtDur(a.total);$('#stat-deep').textContent=fmtDur(a.deep);$('#stat-focus').textContent=fmtDur(a.focus);$('#stat-fragment').textContent=fmtDur(a.fragment);$('#stat-session-count').textContent=`${todaySessions.length} 次记录`;$('#stat-deep-count').textContent=`${a.deepN} 次`;$('#stat-focus-count').textContent=`${a.focusN} 次`;$('#stat-fragment-count').textContent=`${a.fragmentN} 次`;$('#stat-deep-share').textContent=a.total?`${Math.round(a.deep/a.total*100)}%`:'0%';
  $('#home-deep').textContent=fmtDur(a.deep);$('#home-total').textContent=fmtDur(a.total);$('#home-fragment').textContent=fmtDur(a.fragment);
  const seven=last7(),max=Math.max(...seven.map(x=>x.total),1);$('#week-bars').innerHTML=seven.map(d=>{const h=d.total/max*120,deepH=d.deep/max*120,focusH=d.focus/max*120,fragH=d.fragment/max*120;return `<div class="day-bar"><div class="bar-stack" title="${d.date} ${fmtDur(d.total)}"><i class="deep" style="height:${deepH}px"></i><i class="focus" style="height:${focusH}px"></i><i class="fragment" style="height:${fragH}px"></i></div><b>周${d.label}</b><span>${fmtDur(d.total)}</span></div>`}).join('');
  const weekTotal=seven.reduce((n,x)=>n+x.total,0),weekDeep=seven.reduce((n,x)=>n+x.deep,0),weekFrag=seven.reduce((n,x)=>n+x.fragment,0),targetMs=weekTarget*3600000;$('#week-target-bar').style.width=Math.min(100,weekTotal/targetMs*100)+'%';$('#week-target-caption').textContent=`近7天 ${fmtDur(weekTotal)} / 目标 ${weekTarget}h`;
  $('#time-analysis').innerHTML=`<div class="analysis-line"><b>近7天有效学习</b><span>${fmtDur(weekTotal)}，完成目标 ${Math.round(weekTotal/targetMs*100)}%</span></div><div class="analysis-line"><b>深度学习占比</b><span>${weekTotal?Math.round(weekDeep/weekTotal*100):0}% · ${fmtDur(weekDeep)}</span></div><div class="analysis-line"><b>碎片学习占比</b><span>${weekTotal?Math.round(weekFrag/weekTotal*100):0}% · ${fmtDur(weekFrag)}</span></div><div class="analysis-line"><b>当前解释</b><span>${sessions.length<5?'样本还少，先持续记录，不急于调整计划。':'已有初步时间结构，可结合工作日/周末重新估算学习产能。'}</span></div>`;
  $('#session-table').innerHTML=sessions.length?sessions.map(s=>`<tr><td>${s.date}</td><td>${hm(s.start)}</td><td>${hm(s.end)}</td><td>${esc(s.subject)}</td><td>${esc(s.type)}</td><td>${esc(s.task||'—')}</td><td><b>${fmtDur(s.duration)}</b></td><td><span class="pill ${s.category}">${categoryLabel(s.category)}</span></td><td><button class="delete-btn" data-del="${s.id}">删除</button></td></tr>`).join(''):'<tr><td colspan="9" class="muted">还没有学习记录。现在点击“开始”即可。</td></tr>';
  $$('[data-del]').forEach(b=>b.onclick=()=>{if(confirm('删除这条学习记录？')){sessions=sessions.filter(s=>s.id!==b.dataset.del);saveSessions();renderTimeData()}});
  const daily=aggregate();$('#daily-table').innerHTML=daily.length?daily.map(d=>`<tr><td>${d.date}</td><td><b>${fmtDur(d.total)}</b></td><td>${fmtDur(d.deep)}</td><td>${fmtDur(d.focus)}</td><td>${fmtDur(d.fragment)}</td><td>${d.deepN}</td><td>${d.fragmentN}</td><td>${d.total?Math.round(d.deep/d.total*100):0}%</td></tr>`).join(''):'<tr><td colspan="8" class="muted">记录一天后，这里会自动形成每日统计表。</td></tr>';
}

$('#export-csv').addEventListener('click',()=>{const rows=[['日期','开始','结束','模块','类型','任务','分钟','分类'],...sessions.map(s=>[s.date,hm(s.start),hm(s.end),s.subject,s.type,s.task,Math.round(s.duration/60000),categoryLabel(s.category)])];const csv='\ufeff'+rows.map(r=>r.map(x=>`"${String(x??'').replace(/"/g,'""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='公考学习时间记录.csv';a.click();URL.revokeObjectURL(a.href)});
$('#copy-summary').addEventListener('click',async()=>{const a=todayAgg(),text=`${ymd(new Date())} 学习时间汇总\n总有效：${fmtDur(a.total)}\n深度学习：${fmtDur(a.deep)}（${a.deepN}次）\n专注学习：${fmtDur(a.focus)}（${a.focusN}次）\n碎片学习：${fmtDur(a.fragment)}（${a.fragmentN}次）\n深度占比：${a.total?Math.round(a.deep/a.total*100):0}%`;try{await navigator.clipboard.writeText(text);alert('今日汇总已复制，可直接发给 AI。')}catch(e){prompt('复制以下内容：',text)}});

setInterval(()=>{if(timer.mode==='running')syncTimerControls()},1000);

// Init
renderHome();renderPlan();renderTraining();renderMistakes();renderKnowledgeNav();renderKnowledge();syncTimerControls();renderTimeData();
