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
  title,
  panel,
} from '../runtime.js';

function emptyDashboard(d) {
  clear(main).append(
    title('总览', '本地数据库尚未初始化。初始化后，这里只展示真实学习、训练和复训数据。'),
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

export async function renderDashboard() {
  const d = await api('/api/dashboard');
  if (d.initialized === false) {
    emptyDashboard(d);
    return;
  }

  clear(main).append(title('总览', '把学习投入、训练证据、错题修复和阶段进度放在同一张长期账本里。'));

  const criteria = d.phase.criteria || [];
  const phasePct = criteria.length ? Math.round((criteria.filter((x) => x.passed).length / criteria.length) * 100) : 0;
  const weekPct = d.week.target_hours ? Math.min(100, (d.week.actual_seconds / 3600 / d.week.target_hours) * 100) : 0;
  const exG = d.exams.find((x) => x.code === 'guangdong') || d.exams[0];
  const exN = d.exams.find((x) => x.code === 'national') || d.exams[1];

  main.append(
    h('section', { class: 'study-overview-card dashboard-overview' },
      h('div', { class: 'study-overview-copy' },
        h('h2', {}, `W${d.timeline.current_week || '—'} · ${d.phase.name || '当前阶段'}`),
        h('p', {}, d.phase.goal_md || '当前阶段以恢复核心方法、建立真实样本、修复稳定错误模式为主。'),
        h('div', { class: 'actions', style: 'margin-top:12px' },
          h('a', { class: 'primary', href: '/today' }, '查看今日任务'),
          h('a', { class: 'secondary', href: '/timer' }, '开始学习计时'),
        ),
      ),
      h('div', { class: 'hero-exams' }, exG ? examHero(exG) : null, exN ? examHero(exN) : null),
    ),
    h('div', { class: 'kpi-grid' },
      metric('本周有效学习', hours(d.week.actual_seconds), `目标 ${d.week.target_hours}h`, weekPct, ''),
      metric('深度学习占比', pct(d.week.deep_ratio, 0), '按真实会话归类', d.week.deep_ratio * 100, ''),
      metric('本周有效训练', String(d.week.questions), '题', null, ''),
      metric('今日到期复训', String(d.week.reviews_due), '题', null, ''),
    ),
  );

  const weekCard = h('section', { class: 'panel' },
    sectionHead('本周投入', '只使用真实计时，不用计划时长冒充学习投入'),
    h('div', { class: 'section-title-row' }, h('strong', { class: 'num' }, hours(d.week.actual_seconds)), h('span', { class: 'subtle' }, `/ ${d.week.target_hours}h 周目标`)),
    dayBars(d),
  );

  const phaseCard = h('section', { class: 'panel' },
    sectionHead('阶段出口', `完成度 ${phasePct}%`),
    h('div', { class: 'criterion-list' }, ...criteria.map(criterionCard)),
    criteria.length ? null : h('div', { class: 'empty' }, '当前阶段没有配置晋级条件。'),
  );
  main.append(h('div', { class: 'grid dashboard-two-col' }, h('div', { class: 'span-7' }, weekCard), h('div', { class: 'span-5' }, phaseCard)));

  const taskNodes = d.tasks.length ? d.tasks.slice(0, 5).map((t) => taskCard(t, renderDashboard)) : [h('div', { class: 'empty' }, '今天暂时没有任务。')];
  main.append(h('section', { class: 'panel' }, sectionHead('今日优先任务', '按阶段、到期复训和错误模式排序'), h('div', { class: 'task-list' }, ...taskNodes)));

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
  const tasks = await api('/api/tasks');
  clear(main).append(title('今日任务', '只保留对当前阶段有直接收益的任务。'));
  const nodes = tasks.length ? tasks.map((x) => {
    x.steps = JSON.parse(x.steps_json || '[]');
    x.node_slugs_list = JSON.parse(x.node_slugs || '[]');
    return taskCard(x, renderToday);
  }) : [h('div', { class: 'empty' }, '今天没有任务。系统会根据到期错题和核心节点自动生成。')];
  main.append(panel('优先队列', h('div', { class: 'task-list' }, ...nodes)));
}
