import {
  api,
  jpost,
  h,
  clear,
  fmtSec,
  hours,
  timerState,
  calcElapsed,
  toggleTimer,
  stopTimer,
  discardTimerLocal,
  adoptTimer,
  startTick,
  title,
} from './runtime.js';

let root = null;
let opened = false;
let tickHandle = null;

const PAGE_ACTIVITY = {
  '/': '知识恢复',
  '/today': '知识恢复',
  '/timer': '复盘整理',
  '/trainings': '刷题训练',
  '/questions': '刷题训练',
  '/mistakes': '错题复训',
  '/review': '错题复训',
  '/import': '复盘整理',
  '/knowledge': '知识恢复',
  '/shenlun': '申论写作',
  '/methods': '知识恢复',
  '/plan': '复盘整理',
  '/progress': '复盘整理',
  '/coach': '知识恢复',
  '/settings': '复盘整理',
};

function icon(id, cls = 'nav-icon') {
  return h('svg', { class: cls, viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    h('use', { href: `/static/img/icons.svg#${id}` }),
  );
}

function currentPath() {
  return document.body?.dataset?.page || location.pathname || '/';
}

function currentTaskName() {
  return document.querySelector('.page-title')?.textContent?.trim()
    || document.querySelector('.knowledge-article-head h1,.knowledge-article-head h2')?.textContent?.trim()
    || '临时专注';
}

function currentModule() {
  const visible = document.querySelector('.knowledge-article-head .tag,.catalog-node.active small,.method-list-item.active small')?.textContent?.trim();
  if (visible) return visible.slice(0, 40);
  const path = currentPath();
  if (path === '/shenlun') return '申论';
  if (['/mistakes', '/review', '/trainings', '/questions', '/knowledge', '/methods'].includes(path)) return '行测';
  return '综合';
}

function statusText() {
  if (timerState.status === 'running') return '专注中';
  if (timerState.status === 'paused') return '已暂停';
  return '未开始';
}

async function startWith(payload = {}) {
  if (timerState.status !== 'idle') {
    opened = true;
    render();
    return timerState;
  }
  const st = await jpost('/api/timer/start', {
    module: payload.module || currentModule(),
    activity_type: payload.activity_type || PAGE_ACTIVITY[currentPath()] || '知识恢复',
    task_id: payload.task_id == null ? null : Number(payload.task_id),
    task_name: payload.task_name || currentTaskName(),
  });
  adoptTimer(st, { base: 0, paused: 0 });
  startTick();
  opened = true;
  render();
  return st;
}

async function startNow() {
  return startWith();
}

async function pauseOrResume() {
  await toggleTimer();
  render();
}

async function discardNow() {
  if (!confirm('终止本次专注且不写入记录？')) return;
  await jpost('/api/timer/discard');
  discardTimerLocal();
  render();
}

async function recordNow() {
  await stopTimer();
  render();
}

function controlButton(label, iconId, cls, onClick, disabled = false) {
  return h('button', {
    type: 'button',
    class: `focus-action ${cls}`,
    onclick: onClick,
    disabled,
  }, icon(iconId, 'focus-action-icon'), h('span', {}, label));
}

function renderTrigger() {
  const active = timerState.status !== 'idle';
  const btn = h('button', {
    id: 'global-focus-toggle',
    class: `focus-mini-button ${active ? 'active' : ''}`,
    type: 'button',
    title: '专注器（T）',
    onclick: () => {
      opened = !opened;
      render();
    },
  }, icon(timerState.status === 'running' ? 'pause' : 'stopwatch', 'focus-mini-icon'));
  if (active) btn.append(h('span', { id: 'focus-mini-read', class: 'focus-mini-read' }, fmtSec(calcElapsed())));
  return btn;
}

function renderPopover() {
  const elapsed = fmtSec(calcElapsed());
  return h('div', { class: 'focus-popover', role: 'dialog', 'aria-label': '全局专注器' },
    h('div', { class: 'focus-popover-head' },
      h('div', {},
        h('strong', {}, '专注器'),
        h('small', {}, '全局快速计时 · 记录后进入专注日志'),
      ),
      h('button', { class: 'focus-close', type: 'button', onclick: () => { opened = false; render(); }, 'aria-label': '关闭' }, '×'),
    ),
    h('div', { class: 'focus-clock' },
      h('span', { id: 'focus-popover-read' }, elapsed),
      h('small', {}, statusText()),
    ),
    timerState.status === 'idle'
      ? h('div', { class: 'focus-context' },
          h('span', {}, '当前记录'),
          h('strong', {}, currentTaskName()),
          h('small', {}, `${currentModule()} · ${PAGE_ACTIVITY[currentPath()] || '知识恢复'}`),
        )
      : h('div', { class: 'focus-context' },
          h('span', {}, '当前记录'),
          h('strong', {}, timerState.task_name || '临时专注'),
          h('small', {}, `${timerState.module || '综合'} · ${timerState.activity_type || '知识恢复'}`),
        ),
    h('div', { class: 'focus-actions' },
      timerState.status === 'idle'
        ? controlButton('开始', 'play', 'primary', startNow)
        : controlButton(timerState.status === 'running' ? '暂停' : '继续', timerState.status === 'running' ? 'pause' : 'play', 'primary', pauseOrResume),
      controlButton('终止', 'close', 'danger', discardNow, timerState.status === 'idle'),
      controlButton('记录', 'tasks', 'record', recordNow, timerState.status === 'idle'),
    ),
    h('a', { class: 'focus-history-link', href: '/timer' }, '查看全部专注记录'),
  );
}

function render() {
  if (!root) return;
  clear(root).append(renderTrigger());
  if (opened) root.append(renderPopover());
  clearInterval(tickHandle);
  tickHandle = setInterval(() => {
    if (timerState.status === 'idle') return;
    const text = fmtSec(calcElapsed());
    const mini = document.querySelector('#focus-mini-read');
    const pop = document.querySelector('#focus-popover-read');
    if (mini) mini.textContent = text;
    if (pop) pop.textContent = text;
  }, 1000);
}

export function initFocusWidget() {
  root = document.querySelector('#global-focus-root');
  if (!root) return;
  render();
  document.addEventListener('click', (event) => {
    if (!opened || root.contains(event.target)) return;
    opened = false;
    render();
  });
  window.openGlobalFocus = () => {
    opened = true;
    render();
  };
  window.startGlobalFocus = (payload = {}) => startWith(payload);
}

function statCard(label, value, note = '') {
  return h('div', { class: 'focus-log-stat' },
    h('span', {}, label),
    h('strong', {}, value),
    note ? h('small', {}, note) : null,
  );
}

async function startFromQueryIfNeeded() {
  const params = new URLSearchParams(location.search || '');
  const module = params.get('module');
  const activityType = params.get('type');
  const taskName = params.get('task_name');
  const taskId = params.get('task_id');
  if (!module && !activityType && !taskName && !taskId) return;
  if (timerState.status === 'idle') {
    await startWith({
      module: module || '综合',
      activity_type: activityType || '知识恢复',
      task_id: taskId ? Number(taskId) : null,
      task_name: taskName || '临时专注',
    });
  }
  history.replaceState(null, '', '/timer');
}

export async function renderFocusHistoryPage() {
  const main = document.querySelector('#app-main');
  await startFromQueryIfNeeded();
  const [daily, sessions] = await Promise.all([
    api('/api/study/daily?days=30'),
    api('/api/study/sessions?limit=100'),
  ]);
  const total = daily.reduce((sum, row) => sum + Number(row.seconds || 0), 0);
  const deep = daily.reduce((sum, row) => sum + Number(row.deep_seconds || 0), 0);
  const count = daily.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const localToday = new Date();
  const todayKey = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, '0')}-${String(localToday.getDate()).padStart(2, '0')}`;
  const today = daily.find((row) => row.date === todayKey);

  clear(main).append(
    title('专注记录', '专注器固定在所有界面顶部。这里只保留统计与历史记录，不再单独维护复杂计时页面。'),
    h('div', { class: 'focus-log-stats' },
      statCard('近 30 天有效专注', hours(total), `${count} 次记录`),
      statCard('深度专注', hours(deep), total ? `${Math.round((deep / total) * 100)}%` : '暂无数据'),
      statCard('今日专注', hours(today?.seconds || 0), `${today?.count || 0} 次`),
      statCard('平均单次', count ? hours(Math.round(total / count)) : '—', '记录后自动归档'),
    ),
  );

  const list = h('div', { class: 'focus-session-list' });
  if (!sessions.length) {
    list.append(h('div', { class: 'empty' }, '还没有专注记录。点击页面顶部的小计时图标即可开始。'));
  } else {
    sessions.forEach((row) => {
      const started = row.start_at ? new Date(row.start_at) : null;
      list.append(h('article', { class: 'focus-session-row' },
        h('div', { class: 'focus-session-main' },
          h('div', { class: 'focus-session-title' },
            h('strong', {}, row.task_name || row.module || '临时专注'),
            h('span', { class: `focus-session-kind ${row.category || 'fragment'}` }, row.category === 'deep' ? '深度专注' : row.category === 'focus' ? '常规专注' : '碎片记录'),
          ),
          h('p', {}, `${row.module || '综合'} · ${row.activity_type || '知识恢复'}`),
        ),
        h('div', { class: 'focus-session-meta' },
          h('strong', {}, `${Math.max(1, Math.round((row.duration_sec || 0) / 60))} 分钟`),
          h('span', {}, `${row.study_date || '—'}${started ? ` · ${String(started.getHours()).padStart(2, '0')}:${String(started.getMinutes()).padStart(2, '0')}` : ''}`),
        ),
      ));
    });
  }
  main.append(h('section', { class: 'focus-history-card' },
    h('div', { class: 'focus-history-head' },
      h('div', {}, h('h2', {}, '专注研习记录日志'), h('p', {}, '按记录时间倒序展示，所有统计只来自真实保存的专注会话。')),
      h('span', {}, `${sessions.length} 条`),
    ),
    list,
  ));
}
