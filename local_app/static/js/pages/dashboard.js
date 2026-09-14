import {
  api,
  jpatch,
  main,
  clear,
  h,
  hours,
  pct,
  metric,
  examHero,
  criterionCard,
  dayBars,
  moduleBoard,
  sectionHead,
  title,
  panel,
} from '../runtime.js';

function emptyDashboard(d) {
  clear(main).append(
    title('工作台概览', '本地数据库尚未初始化。初始化后，这里只展示真实学习、训练和复训数据。'),
    h('section', { class: 'panel' },
      sectionHead('尚未初始化'),
      h('p', {}, d.initialization_message || '请先运行 seed 建立基础数据。'),
      h('p', { class: 'subtle' }, '系统不会用示例成绩或虚构训练记录填充空白状态。'),
    ),
  );
}

function weekTimeline(d) {
  return h(
    'div',
    { class: 'week-timeline' },
    ...(d.timeline.weeks || []).map((w) => h(
      'div',
      { 'data-status': w.status, title: `${w.start}—${w.end} · ${w.theme}` },
      h('strong', {}, `W${w.no}`),
      h('span', {}, w.theme),
    )),
  );
}

function parseTask(task) {
  return {
    ...task,
    steps: Array.isArray(task.steps) ? task.steps : (() => {
      try { return JSON.parse(task.steps_json || '[]'); } catch (_) { return []; }
    })(),
    node_slugs_list: Array.isArray(task.node_slugs_list) ? task.node_slugs_list : (() => {
      try { return JSON.parse(task.node_slugs || '[]'); } catch (_) { return []; }
    })(),
  };
}

function startTaskFocus(task) {
  window.startGlobalFocus?.({
    module: task.module || '综合',
    activity_type: task.module === '申论' ? '申论写作' : '知识恢复',
    task_id: task.id,
    task_name: task.title,
  });
}

function taskCard(task, rerender, compact = false) {
  const t = parseTask(task);
  const done = t.status === 'done';
  const checkbox = h('input', { type: 'checkbox', checked: done });
  checkbox.onchange = async () => {
    await jpatch(`/api/tasks/${t.id}`, { status: done ? 'todo' : 'done' });
    await rerender?.();
  };

  const card = h('article', { class: `task-card gemini-task-card ${done ? 'done' : ''}` },
    h('div', { class: 'gemini-task-main' },
      checkbox,
      h('div', { class: 'gemini-task-copy' },
        h('div', { class: 'gemini-task-meta' },
          h('span', { class: `task-priority ${t.priority || 'P2'}` }, t.priority || 'P2'),
          h('span', { class: 'task-module-chip' }, t.module || '综合'),
          h('span', { class: 'task-minute-chip' }, `约 ${t.est_minutes || 0} 分钟`),
        ),
        h('h3', {}, t.title),
      ),
    ),
    h('div', { class: 'gemini-task-actions' },
      h('button', { class: 'secondary', onclick: () => startTaskFocus(t) }, '计时推进'),
      t.action_url ? h('a', { class: 'primary', href: t.action_url }, '前往执行') : null,
    ),
  );

  if (!compact) {
    card.append(h('div', { class: 'gemini-task-detail' },
      h('div', {}, h('strong', {}, '为什么做：'), h('span', {}, t.reason_md || '由今日计划规则生成。')),
      t.steps?.length ? h('div', {}, h('strong', {}, '执行步骤：'), h('ol', {}, ...t.steps.slice(0, 4).map((x) => h('li', {}, x)))) : null,
      t.done_criteria ? h('div', {}, h('strong', {}, '完成标准：'), h('span', { class: 'task-done-rule' }, t.done_criteria)) : null,
    ));
  }
  return card;
}

export async function renderDashboard() {
  const d = await api('/api/dashboard');
  if (d.initialized === false) {
    emptyDashboard(d);
    return;
  }

  clear(main);
  const criteria = d.phase.criteria || [];
  const phasePct = criteria.length ? Math.round((criteria.filter((x) => x.passed).length / criteria.length) * 100) : 0;
  const weekPct = d.week.target_hours ? Math.min(100, (d.week.actual_seconds / 3600 / d.week.target_hours) * 100) : 0;
  const exG = d.exams.find((x) => x.code === 'guangdong') || d.exams[0];
  const exN = d.exams.find((x) => x.code === 'national') || d.exams[1];

  main.append(
    h('section', { class: 'study-overview-card dashboard-overview' },
      h('div', { class: 'study-overview-copy' },
        h('div', { class: 'dashboard-phase-meta' },
          h('span', {}, `第 ${d.timeline.current_week || '—'} 周 · ${d.phase.code || 'P1'} 阶段`),
          h('small', {}, d.timeline.current_range || '当前周'),
        ),
        h('h2', {}, d.phase.name || '当前阶段'),
        h('p', {}, d.phase.goal_md || '当前阶段以恢复核心方法、建立真实样本、修复稳定错误模式为主。'),
        h('div', { class: 'actions', style: 'margin-top:14px' },
          h('a', { class: 'primary', href: '/review' }, `今日到期错题复训 (${d.week.reviews_due || 0})`),
          h('button', { class: 'secondary', onclick: () => window.openGlobalFocus?.() }, '开启专注器'),
        ),
      ),
      h('div', { class: 'hero-exams' }, exG ? examHero(exG) : null, exN ? examHero(exN) : null),
    ),
    h('div', { class: 'kpi-grid' },
      metric('本周有效时长', hours(d.week.actual_seconds), `目标 ${d.week.target_hours}h`, weekPct, ''),
      metric('深度专注比例', pct(d.week.deep_ratio, 0), '单次达到深度阈值', d.week.deep_ratio * 100, ''),
      metric('本周有效训练', String(d.week.questions), '题', null, ''),
      metric('今日到期复训', String(d.week.reviews_due), '题', null, ''),
    ),
  );

  const weekCard = h('section', { class: 'panel' },
    sectionHead('每日学习时长分布 · 本周', '有效学时与深度专注统计'),
    dayBars(d),
  );

  const phaseCard = h('section', { class: 'panel' },
    sectionHead('阶段出口', `完成度 ${phasePct}%`),
    h('div', { class: 'criterion-list' }, ...criteria.map(criterionCard)),
    criteria.length ? null : h('div', { class: 'empty' }, '当前阶段没有配置晋级条件。'),
  );
  main.append(h('div', { class: 'grid dashboard-two-col' }, h('div', { class: 'span-7' }, weekCard), h('div', { class: 'span-5' }, phaseCard)));

  const taskNodes = d.tasks.length
    ? d.tasks.slice(0, 5).map((t) => taskCard(t, renderDashboard, true))
    : [h('div', { class: 'empty' }, '今天暂时没有任务。')];
  main.append(h('section', { class: 'dashboard-task-section' }, sectionHead('今日优先任务', '按阶段、到期复训和错误模式排序'), h('div', { class: 'task-list' }, ...taskNodes)));

  main.append(h('div', { class: 'grid dashboard-two-col' },
    h('div', { class: 'span-6' }, moduleBoard('广东卷能力', d.modules.guangdong || [])),
    h('div', { class: 'span-6' }, moduleBoard('国考副省级能力', d.modules.national || [])),
  ));

  const issueNodes = d.issues.length ? d.issues.slice(0, 5).map((x) => h(
    'a',
    { class: 'issue', href: x.action_url || x.href || '#' },
    h('strong', {}, x.text || x.title),
    h('span', {}, x.evidence || x.detail),
  )) : [h('div', { class: 'empty' }, '暂时没有可追踪的问题。')];

  main.append(
    h('section', { class: 'panel' }, sectionHead('13 周路线', '阶段切换与验收路线'), weekTimeline(d)),
    h('section', { class: 'panel' }, sectionHead('当前最重要的问题', '每条都能追溯到真实数据依据'), h('div', { class: 'issue-list' }, ...issueNodes)),
  );
}

export async function renderToday() {
  const raw = await api('/api/tasks');
  const tasks = raw.map(parseTask);
  let filter = 'all';

  const pending = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done');
  const totalMinutes = pending.reduce((sum, t) => sum + Number(t.est_minutes || 0), 0);

  clear(main).append(title('今日任务推进队列', '动态调度到期错题与当前阶段关键任务，只保留今天真正需要执行的事项。'));
  main.append(h('div', { class: 'today-stat-grid' },
    h('div', { class: 'today-stat-card' }, h('span', {}, '待办任务数'), h('strong', {}, pending.length), h('small', {}, '项')),
    h('div', { class: 'today-stat-card' }, h('span', {}, '预计总用时'), h('strong', {}, totalMinutes), h('small', {}, '分钟')),
    h('div', { class: 'today-stat-card success' }, h('span', {}, '今日已完成'), h('strong', {}, done.length), h('small', {}, '项')),
  ));

  const tabs = h('div', { class: 'today-filter-tabs' });
  const list = h('div', { class: 'task-list today-task-list' });
  const defs = [
    ['all', '全部待办'],
    ['P0', 'P0 极高优先级'],
    ['P1', 'P1 核心恢复'],
    ['P2', 'P2 滚动积累'],
    ['done', `已完成 (${done.length})`],
  ];

  const draw = () => {
    clear(tabs);
    defs.forEach(([id, label]) => tabs.append(h('button', {
      class: `today-filter-tab ${filter === id ? 'active' : ''}`,
      onclick: () => { filter = id; draw(); },
    }, label)));

    const rows = tasks.filter((t) => {
      if (filter === 'all') return t.status !== 'done';
      if (filter === 'done') return t.status === 'done';
      return t.status !== 'done' && t.priority === filter;
    });
    clear(list);
    if (!rows.length) {
      list.append(h('div', { class: 'empty today-empty' },
        h('strong', {}, '当前分类下暂无任务'),
        h('p', {}, '任务完成或暂无匹配优先级时会自动保持为空。'),
      ));
      return;
    }
    rows.forEach((task) => list.append(taskCard(task, renderToday, false)));
  };

  main.append(tabs, list);
  draw();
}
