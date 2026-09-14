import {
  api,
  main,
  clear,
  h,
  hours,
  pct,
  metric,
  examHero,
  criterionCard,
  dayBars,
  taskCard,
  moduleBoard,
  sectionHead,
} from '../runtime.js';

export async function renderDashboard() {
  const d = await api('/api/dashboard');
  clear(main);

  const exG = d.exams.find((x) => x.code === 'guangdong') || d.exams[0];
  const exN = d.exams.find((x) => x.code === 'national') || d.exams[1];
  const criteria = d.phase.criteria || [];
  const phasePct = criteria.length ? Math.round((criteria.filter((x) => x.passed).length / criteria.length) * 100) : 0;
  const weekPct = d.week.target_hours ? Math.min(100, (d.week.actual_seconds / 3600 / d.week.target_hours) * 100) : 0;

  const hero = h(
    'section',
    { class: 'hero' },
    h(
      'div',
      { class: 'hero-inner' },
      h(
        'div',
        {},
        h('span', { class: 'hero-badge' }, h('i'), `当前 W${d.timeline.current_week} · ${d.phase.name || '系统恢复'}`),
        h('h1', {}, '把每一次训练，都变成可追踪的提分。'),
        h('p', {}, '主攻广东省直 / 深圳市直，国考副省级同步校准。今天只处理最有价值的任务：恢复核心方法、清理稳定错误模式、建立可验证的限时能力。'),
        h(
          'div',
          { class: 'hero-actions' },
          h('button', { class: 'btn-primary', onclick: () => { location.href = '/today'; } }, '进入今日作战'),
          h('button', { class: 'btn-ghost', onclick: () => { location.href = '/timer'; } }, '开启深度专注'),
        ),
      ),
      h(
        'div',
        { class: 'hero-side' },
        h('div', { class: 'hero-exams' }, exG ? examHero(exG) : null, exN ? examHero(exN) : null),
        h(
          'div',
          { class: 'stage-strip' },
          h('div', { class: 'stage-strip-head' }, h('span', {}, '阶段出口完成度'), h('strong', {}, `${phasePct}%`)),
          h('div', { class: 'stage-progress' }, h('span', { style: `width:${phasePct}%` })),
        ),
      ),
    ),
  );

  const kpis = h(
    'div',
    { class: 'kpi-grid' },
    metric('本周有效学习', hours(d.week.actual_seconds), '累计时长', weekPct, '◷'),
    metric('深度学习占比', pct(d.week.deep_ratio, 0), '≥30min 计入深度', d.week.deep_ratio * 100, '◆', 'green'),
    metric('本周有效训练', String(d.week.questions), '题', null, '▤', 'cyan'),
    metric('今日到期复训', String(d.week.reviews_due), '题待清理', null, '↻', 'amber'),
  );

  main.append(hero, kpis);

  const weekCard = h(
    'section',
    { class: 'panel week-visual' },
    sectionHead('本周投入', '真实计时数据，不用“计划时长”冒充投入'),
    h('div', { class: 'week-summary' }, h('strong', {}, hours(d.week.actual_seconds)), h('span', {}, `/ ${d.week.target_hours}h 周目标`)),
    dayBars(d),
    h('div', { class: 'week-legend' }, h('span', {}, h('i'), '每日有效学习'), h('span', { class: 'deep' }, h('i'), '深度学习按实际会话归类')),
  );

  const phaseCard = h(
    'section',
    { class: 'panel phase-card' },
    sectionHead('阶段出口', `W${d.timeline.current_week} · ${d.phase.name || '当前阶段'}`),
    h(
      'div',
      { class: 'phase-title' },
      h('span', { class: 'phase-num' }, d.phase.code || 'P1'),
      h('div', {}, h('h3', {}, d.phase.name || '系统恢复'), h('p', {}, d.phase.can_advance ? '已达晋级条件，等待你手动确认。' : `仍有 ${d.phase.blocking_count} 项未达门槛`)),
    ),
    h('div', { class: 'criterion-list' }, ...criteria.map(criterionCard)),
  );

  main.append(h('div', { class: 'grid' }, h('div', { class: 'span-7' }, weekCard), h('div', { class: 'span-5' }, phaseCard)));

  const taskNodes = d.tasks.length
    ? d.tasks.slice(0, 5).map((t) => taskCard(t, renderDashboard))
    : [h('div', { class: 'empty' }, '今天暂时没有任务。完成训练或到期复训后，系统会自动生成新的优先项。')];

  main.append(
    h(
      'section',
      { class: 'panel' },
      sectionHead('今日优先任务', '系统根据阶段、到期复训和错误模式自动排序', '只显示值得做的事'),
      h('div', { class: 'task-list' }, ...taskNodes),
    ),
  );

  main.append(
    h(
      'div',
      { class: 'grid' },
      h('div', { class: 'span-6' }, moduleBoard('广东卷能力面板', d.modules.guangdong || [])),
      h('div', { class: 'span-6' }, moduleBoard('国考副省级能力面板', d.modules.national || [])),
    ),
  );

  const timeline = h(
    'section',
    { class: 'panel' },
    sectionHead('13 周双考路线', '不是日历装饰，而是阶段切换与验收路线'),
    h(
      'div',
      { class: 'timeline-wrap' },
      h(
        'div',
        { class: 'timeline' },
        ...d.timeline.weeks.map((w) => h(
          'div',
          { class: 'week-cell', 'data-status': w.status, title: `${w.start}—${w.end}` },
          h('strong', {}, `W${w.no}`),
          h('span', {}, w.theme),
        )),
      ),
    ),
  );

  const issueNodes = d.issues.length
    ? d.issues.slice(0, 5).map((x) => h('div', { class: 'issue' }, h('strong', {}, x.title), h('span', {}, x.detail)))
    : [h('div', { class: 'empty' }, '暂时没有稳定错误模式。继续积累有效训练样本。')];

  const issues = h(
    'section',
    { class: 'panel' },
    sectionHead('当前最重要的问题', '来自真实数据，不生成静态鸡汤'),
    h('div', { class: 'issue-list' }, ...issueNodes),
  );

  main.append(h('div', { class: 'grid' }, h('div', { class: 'span-8' }, timeline), h('div', { class: 'span-4' }, issues)));
}

export async function renderToday() {
  const tasks = await api('/api/tasks');
  clear(main);

  const nodes = tasks.length
    ? tasks.map((x) => {
      x.steps = JSON.parse(x.steps_json || '[]');
      x.node_slugs_list = JSON.parse(x.node_slugs || '[]');
      return taskCard(x, renderToday);
    })
    : [h('div', { class: 'empty' }, '今天没有任务。系统会根据到期错题和核心节点自动生成。')];

  main.append(
    h(
      'header',
      { class: 'page-head' },
      h('div', { class: 'page-head-main' }, h('span', { class: 'eyebrow' }, 'TODAY'), h('h1', { class: 'page-title' }, '今日作战清单'), h('p', { class: 'page-subtitle' }, '只保留对当前阶段有直接收益的任务。')),
    ),
    h('section', { class: 'panel' }, sectionHead('优先队列', 'P0 优先处理稳定错误模式，P1 处理阶段核心任务'), h('div', { class: 'task-list' }, ...nodes)),
  );
}
