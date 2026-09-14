import { page, loadTimer, err, renderTimerPage, api, timerState, toggleTimer } from './runtime.js';
import { renderDashboard, renderToday } from './pages/dashboard.js';
import { renderImport } from './pages/learning.js';
import { renderTrainings, renderQuestionBank } from './pages/training.js';
import { renderMistakes, renderReview, setReviewAnswer } from './pages/mistakes.js';
import { renderKnowledge } from './pages/knowledge.js';
import { renderPlan, renderProgress, renderMethods, renderSettings } from './pages/support.js';
import { renderCoachPage } from './pages/coach.js';
import { initZenMode } from './privacy.js';

const sidebar = document.querySelector('.sidebar');
const menu = document.querySelector('.mobile-menu');

function markActiveNavigation() {
  document.querySelectorAll('.side-nav a[data-path]').forEach((anchor) => {
    const isQuestionsCompat = page === '/questions' && anchor.dataset.path === '/trainings';
    anchor.classList.toggle('active', anchor.dataset.path === page || isQuestionsCompat);
  });
}

async function loadKnowledgeProgress() {
  const badge = document.querySelector('#knowledge-progress');
  if (!badge) return;
  try {
    const rows = await api('/api/knowledge/tree');
    const list = rows.filter((row) => row.subject === 'xingce');
    const built = list.filter((row) => row.build_status !== '未建设').length;
    badge.textContent = built ? `${built}/${list.length}` : '';
  } catch (_) {
    badge.textContent = '';
  }
}

function setToday() {
  const label = document.querySelector('.today-label');
  if (!label) return;
  label.textContent = new Intl.DateTimeFormat('zh-CN', { month:'long', day:'numeric', weekday:'short' }).format(new Date());
}

async function boot() {
  try {
    await loadTimer();
    switch (page) {
      case '/': return renderDashboard();
      case '/today': return renderToday();
      case '/timer': return renderTimerPage();
      case '/trainings': return renderTrainings();
      case '/questions': {
        history.replaceState(null, '', '/trainings?tab=bank');
        return renderQuestionBank();
      }
      case '/mistakes': return renderMistakes();
      case '/review': return renderReview();
      case '/import': return renderImport();
      case '/knowledge': return renderKnowledge('xingce');
      case '/shenlun': return renderKnowledge('shenlun');
      case '/coach': return localStorage.getItem('liano.aiCoachEnabled') === '1' ? renderCoachPage() : renderSettings();
      case '/plan': return renderPlan();
      case '/progress': return renderProgress();
      case '/methods': return renderMethods();
      case '/settings': return renderSettings();
      default: return renderDashboard();
    }
  } catch (error) {
    err(error);
  }
}

let gPending = false;
document.addEventListener('keydown', async (event) => {
  if (event.altKey && event.key.toLowerCase() === 'z') return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    document.querySelector('#help-dialog')?.showModal();
    return;
  }
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
  if (event.key === 'Escape') {
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
    sidebar?.classList.remove('mobile-open');
    return;
  }
  if (event.key.toLowerCase() === 't') {
    if (timerState.status === 'running' || timerState.status === 'paused') {
      event.preventDefault();
      await toggleTimer();
    } else {
      location.href = '/timer';
    }
    return;
  }
  if (event.key.toLowerCase() === 'g') {
    gPending = true;
    setTimeout(() => { gPending = false; }, 800);
    return;
  }
  if (gPending) {
    const routes = { d:'/', t:'/today', k:'/knowledge', r:'/review' };
    const target = routes[event.key.toLowerCase()];
    if (target) location.href = target;
  }
  if (page === '/review' && ['a','b','c','d'].includes(event.key.toLowerCase())) setReviewAnswer(event.key.toUpperCase());
});

markActiveNavigation();
setToday();
loadKnowledgeProgress();
if (menu && sidebar) menu.onclick = () => sidebar.classList.toggle('mobile-open');
initZenMode();
boot();
