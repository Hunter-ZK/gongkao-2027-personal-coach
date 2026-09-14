import { api, jpost, jpatch } from './lib/api.js';
import { h, clear, fmtSec, pct, hours, tag } from './lib/dom.js';
import { sparkline } from './lib/charts.js';

export { api, jpost, jpatch, h, clear, fmtSec, pct, hours, tag, sparkline };

export const main = document.querySelector('#app-main');
export const page = document.body.dataset.page;
export let timerState = { status: 'idle' };
export let timerBase = 0;
export let timerPaused = 0;

let tickHandle = null;
let heartbeatHandle = null;
let pageTimerHandle = null;
const mini = document.querySelector('#mini-timer');

export async function loadTimer() {
  let local = null;
  try {
    local = JSON.parse(localStorage.getItem('gongkao.timer') || 'null');
  } catch (_) {
    localStorage.removeItem('gongkao.timer');
  }

  timerState = await api('/api/timer/state');
  timerBase = timerState.elapsed_sec || 0;
  timerPaused = timerState.paused_sec_live ?? timerState.paused_sec ?? 0;
  if (local && local.status !== 'idle' && timerState.status !== 'idle') {
    timerState.recovered = true;
  }
  persistTimer();
  renderMini();
  if (timerState.status === 'running') startTick();
}

export function persistTimer() {
  try {
    localStorage.setItem('gongkao.timer', JSON.stringify({
      status: timerState.status,
      started_at: timerState.started_at,
      module: timerState.module,
      activity_type: timerState.activity_type,
      elapsed_sec: calcElapsed(),
      paused_sec: timerState.paused_sec_live ?? timerPaused,
      last_seen_at: new Date().toISOString(),
    }));
  } catch (_) {}
}

export function calcElapsed() {
  if (timerState.status !== 'running' || !timerState.started_at) return timerBase;
  const elapsed = Math.floor((Date.now() - new Date(timerState.started_at).getTime()) / 1000) - timerPaused;
  return Math.max(timerBase, elapsed);
}

export function renderMini() {
  clear(mini);
  mini.className = `mini-timer ${timerState.status}`;
  if (timerState.status === 'idle') {
    mini.append(h('button', { class: 'timer-quick', onclick: () => { location.href = '/timer'; } }, '◷  开始专注'));
    return;
  }

  mini.append(
    h('span', { class: 'num', id: 'mini-read' }, `${fmtSec(calcElapsed())} · ${timerState.module || timerState.activity_type || '学习'}`),
    h('button', { class: 'text-btn', onclick: toggleTimer }, timerState.status === 'running' ? '暂停' : '继续'),
    h('button', { class: 'text-btn', onclick: stopTimer }, '结束'),
  );
}

export async function toggleTimer() {
  if (timerState.status === 'running') {
    await jpost('/api/timer/heartbeat', { elapsed_sec: calcElapsed(), paused_sec: timerPaused });
  }
  timerState = await jpost(timerState.status === 'running' ? '/api/timer/pause' : '/api/timer/resume');
  timerBase = timerState.elapsed_sec || calcElapsed();
  timerPaused = timerState.paused_sec_live ?? timerState.paused_sec ?? timerPaused;
  persistTimer();
  renderMini();
  return timerState;
}

export async function stopTimer() {
  await jpost('/api/timer/heartbeat', { elapsed_sec: calcElapsed(), paused_sec: timerPaused });
  await jpost('/api/timer/stop');
  timerState = { status: 'idle' };
  timerBase = 0;
  timerPaused = 0;
  localStorage.removeItem('gongkao.timer');
  renderMini();
  return timerState;
}

export function startTick() {
  clearInterval(tickHandle);
  clearInterval(heartbeatHandle);

  tickHandle = setInterval(() => {
    const e = document.querySelector('#mini-read');
    if (e) e.textContent = `${fmtSec(calcElapsed())} · ${timerState.module || timerState.activity_type || '学习'}`;
    persistTimer();
  }, 1000);

  heartbeatHandle = setInterval(() => {
    if (timerState.status !== 'running') return;
    jpost('/api/timer/heartbeat', { elapsed_sec: calcElapsed(), paused_sec: timerPaused })
      .then((st) => {
        timerState = st;
        timerPaused = st.paused_sec_live ?? st.paused_sec ?? timerPaused;
        persistTimer();
      })
      .catch(() => {});
  }, 15000);
}

export function adoptTimer(st, { base = null, paused = null } = {}) {
  timerState = st;
  if (base != null) timerBase = base;
  if (paused != null) timerPaused = paused;
  persistTimer();
  renderMini();
}

export function discardTimerLocal() {
  timerState = { status: 'idle' };
  timerBase = 0;
  timerPaused = 0;
  localStorage.removeItem('gongkao.timer');
  renderMini();
}

export function title(t, sub = '', eyebrow = 'PERSONAL EXAM OS', actions = []) {
  return h(
    'header',
    { class: 'page-head' },
    h(
      'div',
      { class: 'page-head-main' },
      h('span', { class: 'eyebrow' }, eyebrow),
      h('h1', { class: 'page-title' }, t),
      sub ? h('p', { class: 'page-subtitle' }, sub) : null,
    ),
    actions.length ? h('div', { class: 'page-head-actions' }, ...actions) : null,
  );
}

export function sectionHead(name, caption = '', action = '') {
  return h(
    'div',
    { class: 'section-head' },
    h(
      'div',
      { class: 'section-head-copy' },
      h('h2', { class: 'section-title' }, name),
      caption ? h('p', { class: 'section-caption' }, caption) : null,
    ),
    action ? h('span', { class: 'section-action' }, action) : null,
  );
}

export function panel(name, ...kids) {
  return h('section', { class: 'panel' }, name ? sectionHead(name) : null, ...kids);
}

export function tableWrap(tbl) {
  return h('div', { class: 'table-shell' }, tbl);
}

export function err(e) {
  clear(main).append(
    title('页面无法加载', '本地工作台没有读取到预期数据。', 'SYSTEM ERROR'),
    panel('', h('p', { class: 'tag wrong' }, String(e?.message || e))),
  );
}

export function progressBar(value, cls = '') {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return h('div', { class: `mini-progress ${cls}` }, h('span', { style: `width:${v}%` }));
}

export function metric(label, value, sub, progress = null, icon = '◇', tone = '') {
  return h(
    'article',
    { class: 'metric-card' },
    h('div', { class: 'metric-top' }, h('span', {}, label), h('span', { class: `metric-icon ${tone}` }, icon)),
    h('div', { class: 'metric-value' }, h('strong', {}, value), sub ? h('span', {}, sub) : null),
    progress == null ? null : progressBar(progress, tone === 'green' ? 'green' : ''),
    h('div', { class: 'metric-foot' }, h('span', {}, progress == null ? '基于真实记录计算' : `完成度 ${Math.round(progress)}%`), h('span', {}, '实时')),
  );
}

export function examHero(ex) {
  return h(
    'div',
    { class: 'hero-exam' },
    h('span', {}, ex.code === 'guangdong' ? '广东省考' : '国考副省级'),
    h('strong', {}, String(ex.days_left ?? '—'), h('small', {}, ' 天')),
    h('small', {}, `${ex.date}${ex.is_official ? '' : ' · 预估'}`),
  );
}

export function criterionCard(c) {
  const curr = typeof c.current === 'number' ? (c.current < 2 ? c.current.toFixed(2) : c.current.toFixed(0)) : c.current;
  return h(
    'div',
    { class: `criterion ${c.passed ? 'passed' : ''}` },
    h('span', { class: 'criterion-status' }, c.passed ? '✓' : '○'),
    h('div', { class: 'criterion-main' }, h('strong', {}, c.label), h('span', {}, c.passed ? '已达到当前阶段门槛' : '仍需训练或补充有效样本')),
    h('span', { class: 'criterion-value' }, `${curr ?? '—'} / ${c.threshold}`),
  );
}

export function dayBars(d) {
  const current = d.timeline.weeks.find((x) => x.no === d.timeline.current_week) || d.timeline.weeks[0];
  const map = new Map((d.week.by_day || []).map((x) => [x.date, x]));
  const days = [];

  if (current) {
    let dt = new Date(`${current.start}T00:00:00`);
    for (let i = 0; i < 7; i += 1) {
      const k = dt.toISOString().slice(0, 10);
      days.push(map.get(k) || { date: k, seconds: 0, deep_seconds: 0 });
      dt = new Date(dt.getTime() + 86400000);
    }
  }

  const max = Math.max(3600, ...days.map((x) => x.seconds || 0));
  const labels = ['一', '二', '三', '四', '五', '六', '日'];
  return h(
    'div',
    { class: 'study-bars' },
    ...days.map((x, i) => h(
      'div',
      { class: 'study-day', title: `${x.date} · ${hours(x.seconds || 0)}` },
      h('div', { class: 'study-bar-track' }, h('div', { class: 'study-bar-fill', style: `height:${Math.max(5, ((x.seconds || 0) / max) * 100)}%` })),
      h('small', {}, labels[i]),
    )),
  );
}

export function taskCard(t, rerender) {
  const p = t.priority || 'P2';
  return h(
    'article',
    { class: 'task-card', 'data-priority': p },
    h(
      'div',
      { class: 'task-head' },
      h(
        'div',
        {},
        h('h3', {}, t.title),
        h('div', { class: 'task-meta' }, h('span', {}, p), h('span', {}, t.module || '综合'), h('span', {}, `预计 ${t.est_minutes} min`)),
      ),
      tag(t.status === 'done' ? '已完成' : p, t.status === 'done' ? 'correct' : p === 'P0' ? 'wrong' : p === 'P1' ? 'pending' : ''),
    ),
    h(
      'div',
      { class: 'task-sections' },
      h('div', {}, h('h4', {}, '为什么今天做'), h('p', {}, t.reason_md || '由今日计划规则生成。')),
      h('div', {}, h('h4', {}, '执行步骤'), h('ol', {}, ...(t.steps || []).slice(0, 3).map((x) => h('li', {}, x)))),
    ),
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'primary', onclick: () => {
        const q = new URLSearchParams({ module: t.module || '', type: '知识恢复', task_id: t.id, task_name: t.title });
        location.href = `/timer?${q}`;
      } }, '开始专注'),
      h('button', { class: 'secondary', onclick: async () => {
        await jpatch(`/api/tasks/${t.id}`, { status: 'done' });
        if (rerender) rerender();
      } }, '标记完成'),
      h('button', { class: 'secondary', onclick: async () => {
        await jpatch(`/api/tasks/${t.id}`, { postpone: true });
        if (rerender) rerender();
      } }, '推迟'),
    ),
  );
}

export function moduleBoard(titleText, rows) {
  const body = rows.map((m) => {
    const acc = m.sample_sufficient && m.accuracy != null ? m.accuracy : null;
    const meets = acc != null && m.target_accuracy != null && acc >= m.target_accuracy;
    return h(
      'div',
      { class: 'module-row' },
      h('div', { class: 'module-name' }, m.name, h('small', {}, m.gap_text || '等待有效样本')),
      h('div', { class: `module-track ${meets ? 'good' : ''}` }, h('span', { style: `width:${acc == null ? 8 : Math.max(8, acc * 100)}%` })),
      h('div', { class: 'module-acc' }, acc == null ? '—' : pct(acc, 0)),
      h('div', { class: 'num muted' }, `${m.sample_n || 0}题`),
      sparkline(m.trend || [], 82, 25),
    );
  });
  return panel(titleText, h('div', { class: 'module-board' }, ...body));
}

export async function renderTimerPage() {
  clearInterval(pageTimerHandle);
  const q = new URLSearchParams(location.search);
  const daily = await api('/api/study/daily?days=7');
  timerState = await api('/api/timer/state');

  clear(main).append(title('深度学习计时', '刷新或浏览器异常关闭后可在同一台电脑恢复；当前版本不声称跨设备同步。', 'FOCUS TIMER'));

  const form = h(
    'div',
    { class: 'form-row' },
    h('div', { class: 'field' }, h('label', {}, '模块'), h('input', { id: 'tm-module', value: q.get('module') || timerState.module || '', placeholder: '例如：资料分析' })),
    h(
      'div',
      { class: 'field' },
      h('label', {}, '学习类型'),
      h(
        'select',
        { id: 'tm-type' },
        ...['知识恢复', '刷题训练', '限时专项', '整卷', '错题复训', '申论写作', '申论批改复盘', '背诵记忆', '复盘整理'].map((x) => h('option', { value: x, selected: (q.get('type') || timerState.activity_type) === x }, x)),
      ),
    ),
    h('div', { class: 'field' }, h('label', {}, '任务名'), h('input', { id: 'tm-task', value: q.get('task_name') || timerState.task_name || '', placeholder: '这次专注要完成什么' })),
  );

  const disp = h('div', { class: 'timer-display', id: 'timer-big' }, fmtSec(calcElapsed()));
  const acts = h('div', { class: 'actions timer-controls' });

  if (timerState.status === 'idle') {
    acts.append(h('button', { class: 'primary', onclick: async () => {
      const st = await jpost('/api/timer/start', {
        module: document.querySelector('#tm-module').value,
        activity_type: document.querySelector('#tm-type').value,
        task_id: q.get('task_id') ? Number(q.get('task_id')) : null,
        task_name: document.querySelector('#tm-task').value,
      });
      timerState = st;
      timerBase = 0;
      timerPaused = 0;
      startTick();
      renderMini();
      renderTimerPage();
    } }, '开始专注'));
  } else {
    acts.append(
      h('button', { class: 'primary', onclick: async () => {
        await toggleTimer();
        renderTimerPage();
      } }, timerState.status === 'running' ? '暂停' : '继续'),
      h('button', { class: 'secondary', onclick: async () => {
        await stopTimer();
        renderTimerPage();
      } }, '结束并保存'),
      h('button', { class: 'danger', onclick: async () => {
        if (!confirm('放弃本次计时且不保存？')) return;
        await jpost('/api/timer/discard');
        discardTimerLocal();
        renderTimerPage();
      } }, '放弃'),
    );
  }

  main.append(
    h(
      'section',
      { class: 'panel timer-card' },
      sectionHead('当前专注', '只有真实计时才进入有效学习统计'),
      form,
      disp,
      h('div', { class: 'timer-state-line' }, timerState.status === 'running' ? '专注进行中 · 请保持单任务' : timerState.status === 'paused' ? '已暂停 · 恢复后继续累计' : '尚未开始'),
      acts,
    ),
  );

  const rows = daily.map((d) => h(
    'tr',
    {},
    h('td', {}, d.date),
    h('td', { class: 'num' }, hours(d.seconds)),
    h('td', { class: 'num' }, hours(d.deep_seconds)),
    h('td', { class: 'num' }, hours(d.focus_seconds)),
    h('td', { class: 'num' }, hours(d.fragment_seconds)),
    h('td', { class: 'num' }, d.count),
  ));

  main.append(panel(
    '近 7 天',
    tableWrap(h(
      'table',
      {},
      h('thead', {}, h('tr', {}, ...['日期', '有效时长', '深度', '专注', '碎片', '次数'].map((x) => h('th', {}, x)))),
      h('tbody', {}, ...rows),
    )),
  ));

  pageTimerHandle = setInterval(() => {
    const e = document.querySelector('#timer-big');
    if (e && timerState.status === 'running') e.textContent = fmtSec(calcElapsed());
  }, 1000);
}
