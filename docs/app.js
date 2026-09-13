const D=window.WORKBENCH_DATA;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

const titles={overview:['备考总览','进度、知识、训练、错题、规划统一工作台'],knowledge:['行测知识库','方法卡、适用边界、来源可信度与个人验证'],training:['训练记录','题量、正确率、速度、模块趋势'],mistakes:['错题本','一次错误只是候选模式，复测后才升级'],plan:['备考规划','从系统恢复到广东/国考整卷的阶段路线'],research:['研究中心','公开名师、机构、学员复盘与 GitHub Skill 的来源治理']};

$$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{
  $$('.nav-item').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
  $$('.view').forEach(v=>v.classList.remove('active'));$('#'+btn.dataset.view).classList.add('active');
  const [t,s]=titles[btn.dataset.view];$('#page-title').textContent=t;$('#page-subtitle').textContent=s;
}));

function renderModules(){
  $('#module-bars').innerHTML=D.modules.map(m=>`<div class="bar-row"><span>${esc(m.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${m.score??4}%"></div></div><b>${m.score==null?'待采样':m.detail}</b></div>`).join('');
}

let activeModule='全部',activeConfidence='all',query='';
function renderFilters(){
  const mods=['全部',...new Set(D.methods.map(x=>x.module))];
  $('#module-filter').innerHTML=mods.map((m,i)=>`<button class="chip ${i===0?'active':''}" data-module="${esc(m)}">${esc(m)}</button>`).join('');
  $$('#module-filter .chip').forEach(b=>b.addEventListener('click',()=>{ $$('#module-filter .chip').forEach(x=>x.classList.remove('active')); b.classList.add('active'); activeModule=b.dataset.module; renderMethods(); }));
  $('#confidence-filter').addEventListener('change',e=>{activeConfidence=e.target.value;renderMethods();});
}

function confidenceLabel(c){return c==='high'?'高可信':c==='medium'?'中可信':'候选技巧';}
function renderMethods(){
  const list=D.methods.filter(m=>(activeModule==='全部'||m.module===activeModule)&&(activeConfidence==='all'||m.confidence===activeConfidence)&&(!query||`${m.title} ${m.module} ${m.summary} ${m.trigger}`.toLowerCase().includes(query)));
  $('#method-count').textContent=`${list.length} 张`;
  $('#method-list').innerHTML=list.map(m=>`<article class="method-card" data-id="${m.id}"><div class="method-top"><h4>${esc(m.title)}</h4><span class="tag ${m.confidence}">${confidenceLabel(m.confidence)}</span></div><p>${esc(m.summary)}</p><div class="tags"><span class="tag">${esc(m.module)}</span><span class="tag">${m.id}</span></div></article>`).join('') || '<div class="detail-empty">没有匹配的方法卡。</div>';
  $$('.method-card').forEach(c=>c.addEventListener('click',()=>showMethod(c.dataset.id,c)));
}
function showMethod(id,el){
  $$('.method-card').forEach(x=>x.classList.remove('active')); if(el)el.classList.add('active');
  const m=D.methods.find(x=>x.id===id); if(!m)return;
  $('#method-detail').innerHTML=`<div class="detail"><div class="tags"><span class="tag">${m.id}</span><span class="tag">${esc(m.module)}</span><span class="tag ${m.confidence}">${confidenceLabel(m.confidence)}</span></div><h2>${esc(m.title)}</h2><p>${esc(m.summary)}</p><h4>触发场景</h4><div class="callout">${esc(m.trigger)}</div><h4>操作步骤</h4><ol>${m.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol><h4>适用边界</h4><p>${esc(m.boundary)}</p><h4>常见误用</h4><p>${esc(m.pitfall)}</p><h4>个人验证状态</h4><div class="callout">${esc(m.personal)}</div></div>`;
}

function renderTraining(){
  const totalQ=D.trainings.reduce((a,x)=>a+x.questions,0), totalC=D.trainings.reduce((a,x)=>a+x.correct,0);
  $('#training-stats').innerHTML=[['累计题量',totalQ],['累计正确',totalC],['累计正确率',(totalC/totalQ*100).toFixed(1)+'%'],['累计用时','约41m']].map(([a,b])=>`<div class="stat"><b>${b}</b><span>${a}</span></div>`).join('');
  $('#training-table').innerHTML=D.trainings.map(x=>`<tr><td><b>${x.id}</b></td><td>${x.questions}</td><td>${x.correct}</td><td>${x.accuracy}</td><td>${x.time}</td><td>${x.judgment}</td><td>${x.quant}</td><td>${x.data}</td><td>${esc(x.conclusion)}</td></tr>`).join('');
}

function statusBadge(s){return s==='改善'?'recovered':s==='观察'?'observed':'open';}
function renderMistakes(){
  $('#mistake-list').innerHTML=D.mistakes.map(x=>`<article class="mistake-card"><div class="method-top"><h4>${x.id} · ${esc(x.type)}</h4><span class="badge ${statusBadge(x.status)}">${esc(x.status)}</span></div><div class="tags"><span class="tag">${esc(x.module)}</span></div><p><b>问题：</b>${esc(x.issue)}</p><p><b>下一动作：</b>${esc(x.action)}</p></article>`).join('');
}

function renderPlan(){
  $('#phase-timeline').innerHTML=D.phases.map(x=>`<div class="phase ${x.state}"><span class="phase-dot"></span><div><b>${esc(x.name)}</b><div class="muted">${esc(x.desc)}</div></div></div>`).join('');
  $('#recovery-progress').innerHTML=D.recovery.map(x=>`<div class="recovery-row"><div class="recovery-head"><span>${esc(x.name)}</span><b>${x.progress}%</b></div><div class="mini-progress"><i style="width:${x.progress}%"></i></div></div>`).join('');
}

function renderResearch(){
  $('#research-list').innerHTML=D.research.map(x=>`<article class="research-item"><div class="tags"><span class="tag">${esc(x.topic)}</span></div><h4>${esc(x.source)}</h4><p>${esc(x.take)}</p></article>`).join('');
}

$('#global-search').addEventListener('input',e=>{
  query=e.target.value.trim().toLowerCase();
  if(query){
    $$('.nav-item').forEach(x=>x.classList.remove('active'));$('.nav-item[data-view="knowledge"]').classList.add('active');
    $$('.view').forEach(v=>v.classList.remove('active'));$('#knowledge').classList.add('active');
    $('#page-title').textContent='行测知识库';$('#page-subtitle').textContent='正在搜索方法卡';
  }
  renderMethods();
});

renderModules();renderFilters();renderMethods();renderTraining();renderMistakes();renderPlan();renderResearch();
