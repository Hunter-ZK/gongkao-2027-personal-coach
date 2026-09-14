import{page,loadTimer,err,renderTimerPage}from'./runtime.js';
import{renderDashboard,renderToday}from'./pages/dashboard.js';
import{renderTrainings,renderMistakes,renderReview,renderImport,setReviewAnswer}from'./pages/learning.js';
import{renderKnowledge,renderPlan,renderProgress,renderMethods,renderSettings}from'./pages/knowledge.js';
import{renderCoachPage}from'./pages/coach.js';

document.querySelectorAll('.side-nav a[data-path]').forEach(a=>{if(a.dataset.path===page)a.classList.add('active')});
document.querySelector('.today-label').textContent=new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'short'}).format(new Date());
const menu=document.querySelector('.mobile-menu'),sidebar=document.querySelector('.sidebar');if(menu&&sidebar)menu.onclick=()=>sidebar.classList.toggle('mobile-open');

async function boot(){try{await loadTimer();switch(page){case'/':return renderDashboard();case'/today':return renderToday();case'/timer':return renderTimerPage();case'/trainings':return renderTrainings();case'/mistakes':return renderMistakes();case'/review':return renderReview();case'/import':return renderImport();case'/knowledge':return renderKnowledge('xingce');case'/shenlun':return renderKnowledge('shenlun');case'/coach':return renderCoachPage();case'/plan':return renderPlan();case'/progress':return renderProgress();case'/methods':return renderMethods();case'/settings':return renderSettings();default:return renderDashboard()}}catch(e){err(e)}}
let gPending=false;document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.querySelector('#help-dialog')?.showModal();return}if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(e.key==='Escape'){document.querySelectorAll('dialog[open]').forEach(x=>x.close());sidebar?.classList.remove('mobile-open');return}if(e.key.toLowerCase()==='t'){location.href='/timer';return}if(e.key.toLowerCase()==='g'){gPending=true;setTimeout(()=>gPending=false,800);return}if(gPending){const m={d:'/',t:'/today',k:'/knowledge',r:'/review',c:'/coach'};if(m[e.key.toLowerCase()])location.href=m[e.key.toLowerCase()]}if(page==='/review'&&['a','b','c','d'].includes(e.key.toLowerCase()))setReviewAnswer(e.key.toUpperCase())});
boot();
