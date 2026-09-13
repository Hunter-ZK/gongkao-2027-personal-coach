const D=window.OS_DATA;
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));

function navTo(id){
  $$(".view").forEach(v=>v.classList.toggle("active",v.id===id));
  $$(".nav").forEach(b=>b.classList.toggle("active",b.dataset.view===id));
  const titles={home:"今日工作台",atlas:"题型知识树",mistakes:"错题复训",practice:"训练记录",plan:"备考进度",sources:"名师笔记"};
  $("#title").textContent=titles[id]||"公考工作台";window.scrollTo({top:0,behavior:"smooth"});
}
$$(".nav").forEach(b=>b.onclick=()=>navTo(b.dataset.view));
$$('[data-jump]').forEach(b=>b.onclick=()=>navTo(b.dataset.jump));

function renderHome(){
  $("#today-path").innerHTML=D.today.map((t,i)=>`<div class="task ${t.state==="done"?"done":""}"><div class="task-index">${t.state==="done"?"✓":i+1}</div><div><b>${esc(t.title)}</b><small>${esc(t.desc)}</small></div><span class="state">${t.state==="done"?"已完成":t.state==="active"?"进行中":"待开始"}</span></div>`).join("");
  $("#mastery").innerHTML=D.mastery.map(m=>`<div class="mastery-row"><div class="line"><b>${m.name}</b><small>${m.value}% · ${m.note}</small></div><div class="track"><i style="width:${m.value}%"></i></div></div>`).join("");
  $("#priority-mistakes").innerHTML=D.mistakes.filter(x=>x.status!=="改善").slice(0,3).map(m=>`<div class="priority-item"><div class="row"><b>${m.type}</b><span class="status watch">${m.status}</span></div><p>${m.diagnosis}</p></div>`).join("");
  $("#recent-trainings").innerHTML=D.trainings.map(t=>`<div class="training-mini"><h4>${t.id}</h4><strong>${t.accuracy}%</strong><span>${t.correct}/${t.questions} · ${t.time}</span><p>${t.summary}</p></div>`).join("");
}

let currentModule=Object.keys(D.atlas)[0];
function renderModuleTabs(){
  $("#module-tabs").innerHTML=Object.keys(D.atlas).map(n=>`<button class="${n===currentModule?"active":""}" data-module="${n}">${n}</button>`).join("");
  $$("#module-tabs button").forEach(b=>b.onclick=()=>{currentModule=b.dataset.module;renderModuleTabs();renderTree();});
}
function renderTree(){
  const groups=D.atlas[currentModule];
  $("#tree").innerHTML=groups.map((g,gi)=>`<div class="tree-group"><h4>${g.group}</h4>${g.topics.map((t,ti)=>`<button class="topic-btn" data-gi="${gi}" data-ti="${ti}"><span>${t.name}</span><span>${t.mastery}</span></button>`).join("")}</div>`).join("");
  $$(".topic-btn").forEach(b=>b.onclick=()=>selectTopic(+b.dataset.gi,+b.dataset.ti,b));
  const first=$(".topic-btn");if(first)first.click();
}
function selectTopic(gi,ti,btn){
  $$(".topic-btn").forEach(x=>x.classList.remove("active"));btn.classList.add("active");
  const t=D.atlas[currentModule][gi].topics[ti];
  $("#topic-detail").innerHTML=`<div class="topic-title"><div><span class="eyebrow">${esc(currentModule)} · ${esc(D.atlas[currentModule][gi].group)}</span><h2>${esc(t.name)}</h2><p>${esc(t.classic)}</p></div><span class="mastery-badge">${esc(t.mastery)}</span></div><div class="topic-section"><h3>经典模型</h3><div class="model-tags">${t.models.map(x=>`<span class="model-tag">${esc(x)}</span>`).join("")}</div></div><div class="topic-section"><h3>考场解题流程</h3><div class="method-box"><ol>${t.steps.map(x=>`<li>${esc(x)}</li>`).join("")}</ol></div></div><div class="topic-section"><h3>多来源笔记 · 已综合</h3><div class="teacher-stack">${t.teachers.map(x=>`<div class="teacher-note"><b>${esc(x[0])}</b><p>${esc(x[1])}</p></div>`).join("")}</div></div><div class="topic-section"><h3>关联训练</h3><div class="method-box"><strong>训练原则</strong><p>先识别题型，再应用流程。做错、明显超时或纠结题才进入错题复训；答对但方法低效也记录为“效率问题”。</p></div></div>`;
}

function renderMistakes(filter="all"){
  const list=D.mistakes.filter(x=>filter==="all"||x.status===filter);
  $("#mistake-cards").innerHTML=list.map(m=>`<article class="mistake-card"><div class="mistake-head"><div><span class="eyebrow">${m.training}</span><h3>${m.type}</h3></div><span class="status ${m.status==="改善"?"better":"watch"}">${m.status}</span></div><div class="mistake-meta"><span class="pill">${m.module}</span><span class="pill">${m.id}</span></div><div class="question"><p>${esc(m.question)}</p><div class="answer-row"><div class="answer wrong">你的答案：${m.user}</div><div class="answer right">正确答案：${m.correct}</div></div></div><p style="color:#697386;margin:0">${esc(m.diagnosis)}</p><div class="mistake-actions"><button class="btn" data-review="${m.id}">查看解析与技巧</button><button class="btn primary2" data-retrain="${m.id}">重新训练</button></div></article>`).join("");
  $$('[data-review]').forEach(b=>b.onclick=()=>openMistake(b.dataset.review,false));
  $$('[data-retrain]').forEach(b=>b.onclick=()=>openMistake(b.dataset.retrain,true));
}
$("#mistake-filter").onclick=e=>{const b=e.target.closest("button");if(!b)return;$$("#mistake-filter button").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderMistakes(b.dataset.filter);};

function openMistake(id,retrain){
  const m=D.mistakes.find(x=>x.id===id);if(!m)return;
  $("#modal-content").innerHTML=`<span class="eyebrow">${esc(m.training)} · ${esc(m.module)}</span><h2>${retrain?"重新训练｜":""}${esc(m.type)}</h2><div class="modal-section"><h3>原题</h3><div class="analysis-box">${esc(m.question)}</div><div class="options">${m.options.map(o=>`<div class="option ${o.startsWith(m.correct+".")?"correct":o.startsWith(m.user+".")&&m.user!==m.correct?"user-wrong":""}">${esc(o)}</div>`).join("")}</div></div>${retrain?`<div class="modal-section"><h3>复训方式</h3><div class="analysis-box"><p>${esc(m.retrain)}</p><p><b>规则：</b>先自己重做，再展开下面的解题技巧。当前静态版不会自动判题，做完后把答案发给我，我会写回复训结果。</p></div></div>`:""}<div class="modal-section"><h3>错因诊断</h3><div class="analysis-box">${esc(m.diagnosis)}</div></div><div class="modal-section"><h3>这类题的稳定技巧</h3><div class="analysis-box">${esc(m.skill)}</div></div><div class="modal-section"><h3>本题解析</h3><div class="analysis-box">${esc(m.solution)}</div></div><div class="modal-section"><h3>下一次怎么练</h3><div class="analysis-box">${esc(m.retrain)}</div></div>`;
  $("#modal").classList.add("open");
}
$$('[data-close]').forEach(x=>x.onclick=()=>$("#modal").classList.remove("open"));

function renderPractice(){
  $("#practice-summary").innerHTML=[["30","累计题量"],["80.0%","累计正确率"],["≈41m","累计用时"]].map(x=>`<div class="metric"><b>${x[0]}</b><span>${x[1]}</span></div>`).join("");
  $("#practice-list").innerHTML=D.trainings.map(t=>`<div class="practice-card"><div><span class="eyebrow">${t.date}</span><div class="practice-score">${t.accuracy}% <small>${t.correct}/${t.questions}</small></div><span>${t.time}</span></div><div class="practice-main"><h3>${t.id}</h3><p>${t.summary}</p></div><div class="mini-bars">${t.modules.map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join("")}</div></div>`).join("");
}
function renderPlan(){
  $("#roadmap").innerHTML=D.roadmap.map((r,i)=>`<div class="milestone ${r.state}"><span class="eyebrow">M${i+1}</span><h3>${r.name}</h3><small>${r.done}</small><p>${r.desc}</p></div>`).join("");
  $("#week-board").innerHTML=D.week.map(x=>`<div class="day-col ${x.today?"today":""}"><b>${x.day}</b><ul>${x.tasks.map(t=>`<li>${t}</li>`).join("")}</ul></div>`).join("");
}
function renderSources(){
  $("#source-list").innerHTML=D.sources.map(s=>`<div class="source-card"><span class="eyebrow">${s.kind}</span><h3>${s.name}</h3><span class="pill">${s.module}</span><span class="pill">价值 ${s.value}</span><div class="use"><b>综合后采用</b><p>${s.adopt}</p></div></div>`).join("");
}
$("#search").addEventListener("keydown",e=>{if(e.key!=="Enter")return;const q=e.target.value.trim();if(!q)return;const hits=[];Object.entries(D.atlas).forEach(([m,gs])=>gs.forEach((g,gi)=>g.topics.forEach((t,ti)=>{if((m+g.group+t.name+t.models.join("")+t.steps.join("")).includes(q))hits.push([m,gi,ti,t.name]);})));const ms=D.mistakes.filter(x=>(x.type+x.question+x.diagnosis+x.skill).includes(q));navTo("atlas");if(hits[0]){currentModule=hits[0][0];renderModuleTabs();renderTree();const btn=$(`.topic-btn[data-gi="${hits[0][1]}"][data-ti="${hits[0][2]}"]`);if(btn)btn.click();}if(!hits.length&&ms.length){navTo("mistakes");renderMistakes();openMistake(ms[0].id,false);}});
renderHome();renderModuleTabs();renderTree();renderMistakes();renderPractice();renderPlan();renderSources();