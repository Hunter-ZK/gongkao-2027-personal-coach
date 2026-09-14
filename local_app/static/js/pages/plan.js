import { api, main, clear, h, pct, title, panel, tableWrap, criterionCard } from '../runtime.js';

export async function renderPlan() {
  const [weeks, caps, phases] = await Promise.all([
    api('/api/plan/timeline'),
    api('/api/plan/capability'),
    api('/api/plan/phases'),
  ]);
  clear(main).append(title('备考规划', '时间路线、能力目标和阶段门槛分开记录，避免把计划当成绩。'));
  const weekRows = weeks.map((week) => h('tr', {},
    h('td', {}, `W${week.week_no}`),
    h('td', {}, `${week.start_date}—${week.end_date}`),
    h('td', {}, week.theme),
    h('td', {}, week.phase_code),
    h('td', { class: 'num' }, `${week.target_hours}h`),
    h('td', { class: 'num' }, week.target_questions),
  ));
  main.append(panel('13 周时间路线', tableWrap(h('table', {},
    h('thead', {}, h('tr', {}, ...['周', '日期', '主题', '阶段', '目标时长', '题量'].map((label) => h('th', {}, label)))),
    h('tbody', {}, ...weekRows),
  ))));

  const capRows = caps.map((row) => h('tr', {},
    h('td', {}, row.exam_code === 'guangdong' ? '广东' : '国考'),
    h('td', {}, row.name),
    h('td', { class: 'num' }, row.total_score.toFixed(1)),
    h('td', { class: 'num' }, row.estimated_score == null ? '无法估算' : row.estimated_score.toFixed(1)),
    h('td', { class: 'num' }, row.sample_n),
    h('td', { class: 'num' }, pct(row.target_accuracy)),
    h('td', {}, row.training_need),
  ));
  main.append(panel('能力路线', tableWrap(h('table', {},
    h('thead', {}, h('tr', {}, ...['卷型', '模块', '目标分(估)', '当前预估', '样本', '目标正确率', '训练建议'].map((label) => h('th', {}, label)))),
    h('tbody', {}, ...capRows),
  ))));

  const phaseNodes = phases.flatMap((phase) => [
    h('div', { class: 'phase-title' }, h('span', { class: 'phase-num' }, phase.code), h('div', {}, h('h3', {}, phase.name), h('p', {}, phase.goal_md))),
    ...(phase.criteria || []).map(criterionCard),
  ]);
  main.append(panel('阶段与晋级', h('div', { class: 'criterion-list' }, ...phaseNodes)));
}
