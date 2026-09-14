import { page, loadTimer, err, api } from './runtime.js';
import { renderDashboard, renderToday } from './pages/dashboard.js';
import { renderImport } from './pages/import.js';
import { renderTrainings, renderQuestionBank } from './pages/training.js';
import { renderMistakesGemini } from './pages/mistakes_gemini.js';
import { renderReviewGemini, setReviewAnswerGemini, handleReviewEnterGemini } from './pages/review_gemini.js';
import { renderKnowledge } from './pages/knowledge.js';
import { renderPlan } from './pages/plan.js';
import { renderProgress } from './pages/progress.js';
import { renderMethods } from './pages/methods.js';
import { renderSettings } from './pages/settings.js';
import { renderCoachPage } from './pages/coach.js';
import { renderStudyAnalytics } from './pages/study_analytics.js';
import { initGlobalCoach } from './global_coach.js';
import { initFocusWidget } from './focus_widget.js';
import { initSyncWidget } from './sync_widget.js';
import { initPdfDropZone } from './pdf_drop.js';
import { initZenMode, toggleZenMode, zenModeEnabled } from './privacy.js';

const sidebar = document.querySelector('.sidebar');
const menu = document.querySelector('.mobile-menu');
const zenButton = document.querySelector('#zen-toggle');

function markActiveNavigation() {
  document.querySelectorAll('.side-nav a[data-path]').forEach((anchor) => {
    const isQuestionsCompat = page === '/questions' && anchor.dataset.path === '/trainings';
    anchor.classList.toggle('active', anchor.dataset.path === page || isQuestionsCompat);
  });
}

function syncZenButton() {
  if (!zenButton) return;
  const active = zenModeEnabled();
  zenButton.classList.toggle('active', active);
  zenButton.setAttribute('aria-pressed', active ? 'true' : 'false');
  const label = zenButton.querySelector('span');
  if (label) label.textContent = active ? '标准模式' : '禅模式';
  zenButton.title = active ? '退出禅模式，恢复备考名称' : '隐藏备考、公考、错题等显眼字样（Alt+Z）';
}

async function loadKnowledgeProgress() {
  const badge = document.querySelector('#knowledge-progress');
  if (!badge) return;
  try {
    const rows = await api('/api/knowledge/tree');
    const list = rows.filter((row) => row.subject === 'xingce');
    const built = list.filter((row) => row.build_status !== '未建设').length;
    badge.textContent = list.length ? `${built}/${list.length}` : '';
  } catch (_) { badge.textContent = ''; }
}

async function loadSidebarStage() {
  const name = document.querySelector('#sidebar-stage-name');
  const progress = document.querySelector('#sidebar-week-progress');
  const fill = document.querySelector('#sidebar-progress-fill');
  if (!name || !progress || !fill) return;
  try {
    const data = await api('/api/dashboard');
    const phaseName = data?.phase?.name || '当前阶段';
    const phaseCode = data?.phase?.code || data?.timeline?.phase || '';
    name.textContent = `${phaseCode ? `${phaseCode} ` : ''}${phaseName}`.trim();
    const actual = Number(data?.week?.actual_seconds || 0) / 3600;
    const target = Number(data?.week?.target_hours || 0);
    progress.textContent = target ? `${actual.toFixed(1)}h / ${target.toFixed(1)}h` : `${actual.toFixed(1)}h`;
    fill.style.width = `${target ? Math.min(100, Math.round((actual / target) * 100)) : 0}%`;
  } catch (_) {
    name.textContent = '当前阶段'; progress.textContent = '—'; fill.style.width = '0%';
  }
}

function setToday() {
  const label = document.querySelector('.today-label');
  if (!label) return;
  label.textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
}

async function boot() {
  try {
    await loadTimer();
    initFocusWidget();
    let result;
    switch (page) {
      case '/': result = await renderDashboard(); break;
      case '/today': result = await renderToday(); break;
      case '/timer': result = await renderStudyAnalytics(); break;
      case '/trainings': result = await renderTrainings(); break;
      case '/questions': history.replaceState(null, '', '/trainings?tab=bank'); result = await renderQuestionBank(); break;
      case '/mistakes': result = await renderMistakesGemini(); break;
      case '/review': result = await renderReviewGemini(); break;
      case '/import': result = await renderImport(); initPdfDropZone(); break;
      case '/knowledge': result = await renderKnowledge('xingce'); break;
      case '/shenlun': result = await renderKnowledge('shenlun'); break;
      case '/coach': result = await renderCoachPage(); break;
      case '/plan': result = await renderPlan(); break;
      case '/progress': result = await renderProgress(); break;
      case '/methods': result = await renderMethods(); break;
      case '/settings': result = await renderSettings(); break;
      default: result = await renderDashboard();
    }
    return result;
  } catch (error) { err(error); }
}

let gPending = false;
document.addEventListener('keydown', async (event) => {
  if (event.altKey && event.key.toLowerCase() === 'z') { setTimeout(syncZenButton, 0); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('#help-dialog')?.showModal(); return; }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (event.key === 'Escape') { document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close()); sidebar?.classList.remove('mobile-open'); return; }
  if (event.key.toLowerCase() === 't' && !event.altKey && !event.ctrlKey && !event.metaKey) { event.preventDefault(); window.openGlobalFocus?.(); return; }
  if (event.key.toLowerCase() === 'g') { gPending = true; setTimeout(() => { gPending = false; }, 800); return; }
  if (gPending) {
    const routes = { d: '/', t: '/today', k: '/knowledge', r: '/review', p: '/progress' };
    const target = routes[event.key.toLowerCase()]; if (target) location.href = target;
  }
  if (page === '/review' && !event.altKey && !event.ctrlKey && !event.metaKey && ['a','b','c','d'].includes(event.key.toLowerCase())) { setReviewAnswerGemini(event.key.toUpperCase()); return; }
  if (page === '/review' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); await handleReviewEnterGemini(); }
});

markActiveNavigation(); setToday(); loadKnowledgeProgress(); loadSidebarStage();
if (menu && sidebar) menu.onclick = () => sidebar.classList.toggle('mobile-open');
initZenMode(); syncZenButton();
if (zenButton) zenButton.onclick = () => { toggleZenMode(); syncZenButton(); };
initGlobalCoach(); initSyncWidget(); boot();
