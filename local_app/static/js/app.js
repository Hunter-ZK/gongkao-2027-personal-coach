import { page, loadTimer, err, renderTimerPage, api } from './runtime.js';
import { renderDashboard, renderToday } from './pages/dashboard.js';
import { renderTrainings, renderQuestionBank, renderImport } from './pages/learning.js';
import { renderMistakes, renderReview, setReviewAnswer } from './pages/mistakes-v2.js';
import { renderPlan, renderProgress, renderMethods, renderSettings } from './pages/knowledge.js';
import { renderKnowledge } from './pages/knowledge-v2.js';
import { renderXingceMethodSystem } from './pages/methods-v2.js';
import { renderCoachPage } from './pages/coach.js';
import { initZenMode } from './privacy.js';

document.querySelectorAll('.side-nav a[data-path]').forEach((a) => {
  if (a.dataset.path === page) a.classList.add('active');
});

const knowledgeBadge = document.querySelector('.side-nav a[data-path="/knowledge"] em');
if (knowledgeBadge) {
  api('/api/knowledge/method-summary')
    .then((x) => { knowledgeBadge.textContent = String(x.total ?? '方法'); })
    .catch(() => { knowledgeBadge.textContent = '方法'; });
}

document.querySelector('.today-label').textContent = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
}).format(new Date());

const menu = document.querySelector('.mobile-menu');
const sidebar = document.querySelector('.sidebar');
if (menu && sidebar) menu.onclick = () => sidebar.classList.toggle('mobile-open');
initZenMode();

async function boot() {
  try {
    await loadTimer();
    switch (page) {
      case '/': return renderDashboard();
      case '/today': return renderToday();
      case '/timer': return renderTimerPage();
      case '/trainings': return renderTrainings();
      case '/questions': return renderQuestionBank();
      case '/mistakes': return renderMistakes();
      case '/review': return renderReview();
      case '/import': return renderImport();
      case '/knowledge': return new URLSearchParams(location.search).get('view') === 'nodes' ? renderKnowledge('xingce') : renderXingceMethodSystem();
      case '/shenlun': return renderKnowledge('shenlun');
      case '/coach': return renderCoachPage();
      case '/plan': return renderPlan();
      case '/progress': return renderProgress();
      case '/methods': return renderMethods();
      case '/settings': return renderSettings();
      default: return renderDashboard();
    }
  } catch (e) {
    err(e);
  }
}

let gPending = false;
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key.toLowerCase() === 'z') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    document.querySelector('#help-dialog')?.showModal();
    return;
  }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (e.key === 'Escape') {
    document.querySelectorAll('dialog[open]').forEach((x) => x.close());
    sidebar?.classList.remove('mobile-open');
    return;
  }
  if (e.key.toLowerCase() === 't') {
    location.href = '/timer';
    return;
  }
  if (e.key.toLowerCase() === 'g') {
    gPending = true;
    setTimeout(() => { gPending = false; }, 800);
    return;
  }
  if (gPending) {
    const map = { d: '/', t: '/today', k: '/knowledge', q: '/questions', r: '/review', c: '/coach' };
    if (map[e.key.toLowerCase()]) location.href = map[e.key.toLowerCase()];
  }
  if (page === '/review' && ['a', 'b', 'c', 'd'].includes(e.key.toLowerCase())) setReviewAnswer(e.key.toUpperCase());
});

boot();
