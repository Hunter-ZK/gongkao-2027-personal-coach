import { api, main, clear, h, hours } from '../runtime.js';

function icon(id) {
  return h('svg', { class: 'v3-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('use', { href: `/static/img/icons.svg#${id}` }));
}

function pct(value) { return `${Math.round(Math.max(0, Math.min(1, value || 0)) * 100)}%`; }

function progress(value) {
  return h('div', { class: 'v3-progress-track' }, h('span', { style: `width:${Math.max(0, Math.min(100, Number(value) || 0))}%` }));
}

function fmtDay(value) {
  const d = new Date(`${value}T12:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function dayLabel(value) {
  const d = new Date(`${value}T12:00:00`);
  return ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
}

function dateSeries(start, end) {
  const out = [];
  let d = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (d <= last && out.length < 7) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

function weekHero(week, dashboard, weekDetail) {
  const actual = Number(dashboard.week?.actual_seconds || 0) / 3600;
  const target = Number(week.target_hours || 0);
  const doneTasks = (weekDetail.allTasks || []).filter((x) => x.status === 'done').length;
  const allTasks = weekDetail.allTasks?.length || 0;
  return h('section', { class: 'v3-week-hero' },
    h('div', { class: 'v3-week-hero-copy' },
      h('div', { class: 'v3-milestone-tags' }, h('span', { class: 'v3-dark-chip' }, `W${week.week_no}`), h('span', { class: 'v3-dark-chip soft' }, week.phase_code || '当前阶段'), h('span', { class: 'v3-dark-muted' }, `${fmtDay(week.start_date)} – ${fmtDay(week.end_date)}`)),
      h('h1', {}, week.theme || '本周攻坚主题'),
      h('p', {}, week.milestone || '以真实训练和复盘结果完成本周里程碑。'),
    ),
    h('div', { class: 'v3-week-hero-metrics' },
      h('div', {}, h('span', {}, '学习时长'), h('strong', {}, `${actual.toFixed(1)}h`), h('small', {}, `/ ${target ? target.toFixed(1) : '—'}h`), progress(target ? actual / target * 100 : 0)),
      h('div', {}, h('span', {}, '任务完成'), h('strong', {}, `${doneTasks}`), h('small', {}, `/ ${allTasks}`), progress(allTasks ? doneTasks / allTasks * 100 : 0)),
      h('div', {}, h('span', {}, '本周作答'), h('strong', {}, String(dashboard.week?.questions || 0)), h('small', {}, dashboard.week?.accuracy == null ? '尚无有效样本' : `正确 ${Math.round(dashboard.week.accuracy * 100)}%`)),
    ),
  );
}

function dayCard(day, tasks, studyMap) {
  const today = new Date().toISOString().slice(0, 10);
  const study = studyMap.get(day) || { seconds: 0, deep_seconds: 0 };
  const done = tasks.filter((x) => x.status === 'done').length;
  const est = tasks.filter((x) => x.status !== 'done').reduce((sum, x) => sum + Number(x.est_minutes || 0), 0);
  return h('article', { class: `v3-week-day-card ${day === today ? 'today' : ''}` },
    h('header', {},
      h('div', {}, h('span', {}, dayLabel(day)), h('strong', {}, fmtDay(day))),
      day === today ? h('em', {}, 'TODAY') : null,
    ),
    h('div', { class: 'v3-day-focus' },
      h('span', {}, tasks[0]?.module || '综合推进'),
      h('small', {}, `${hours(study.seconds || 0)} 已学习 · ${est}m 待推进`),
    ),
    h('div', { class: 'v3-day-task-chips' }, ...(tasks.length ? tasks.slice(0, 5).map((task) => h('a', { href: '/today', class: task.status === 'done' ? 'done' : '' }, h('b', {}, task.priority), h('span', {}, task.title))) : [h('span', { class: 'v3-muted' }, '暂无任务')])) ,
    h('footer', {}, h('span', {}, `${done}/${tasks.length} 完成`), h('span', {}, study.deep_seconds ? `深度 ${hours(study.deep_seconds)}` : '')),
  );
}

function modulePlan(week) {
  const modules = week.modules || [];
  return h('section', { class: 'v3-card' },
    h('div', { class: 'v3-card-head' }, h('div', {}, h('h2', {}, '本周模块资源配置'), h('p', {}, '目标小时和题量用于控制资源分配，不替代每日动态任务。'))),
    h('div', { class: 'v3-week-module-grid' }, ...(modules.length ? modules.map((row) => h('article', {},
      h('div', {}, h('strong', {}, row.module), h('span', {}, `${row.planned_hours}h`)),
      h('small', {}, `${row.planned_questions || 0} 题目标`),
      progress((Number(row.planned_hours || 0) / Math.max(1, ...modules.map((x) => Number(x.planned_hours || 0)))) * 100),
    )) : [h('div', { class: 'v3-empty' }, '本周还没有模块资源配置。')])) ,
  );
}

function routeSection(timeline) {
  return h('section', { class: 'v3-card' },
    h('div', { class: 'v3-card-head' }, h('div', {}, h('h2', {}, '阶段路线'), h('p', {}, '长期路线用于标定方向；当前周优先级始终由训练证据和复训负荷校准。'))),
    h('div', { class: 'v3-plan-route' }, ...timeline.map((row) => h('div', { class: `v3-plan-route-node ${row.status || ''}` },
      h('span', {}, `W${row.no || row.week_no}`),
      h('strong', {}, row.theme || '阶段推进'),
      h('small', {}, `${(row.start || row.start_date || '').slice(5)} – ${(row.end || row.end_date || '').slice(5)}`),
    ))),
  );
}

export async function renderPlan() {
  const dashboard = await api('/api/dashboard');
  const weekNo = dashboard.timeline?.current_week || 1;
  const week = await api(`/api/plan/week/${weekNo}`);
  const days = dateSeries(week.start_date, week.end_date);
  const [tasksByDay, study] = await Promise.all([
    Promise.all(days.map(async (day) => [day, await api(`/api/tasks?date=${day}`)])),
    api('/api/analytics/study?days=30'),
  ]);
  const taskMap = new Map(tasksByDay);
  const allTasks = tasksByDay.flatMap(([, rows]) => rows);
  const studyMap = new Map((study.daily || []).map((row) => [row.study_date, row]));

  clear(main).append(
    h('div', { class: 'v3-page-heading' },
      h('div', {}, h('span', {}, 'WEEKLY ATTACK PLAN'), h('h1', { class: 'page-title' }, '周度备考攻坚日程与里程碑'), h('p', {}, '从“13 周表格”改成当前周可执行战役：里程碑、日程、投入、任务与模块资源一屏对齐。')),
      h('div', { class: 'v3-heading-actions' }, h('a', { class: 'v3-secondary-button', href: '/today' }, '今日队列'), h('button', { class: 'v3-primary-button', onclick: () => window.startGlobalFocus?.({ module: '综合', activity_type: '复盘整理', task_name: `W${weekNo} 周计划推进` }) }, icon('play'), '开始推进')),
    ),
    weekHero(week, dashboard, { allTasks }),
    h('section', { class: 'v3-week-schedule' },
      h('div', { class: 'v3-card-head bare' }, h('div', {}, h('h2', {}, '7 日攻坚日程'), h('p', {}, '每一天都显示真实学习时长和任务完成，不用静态模板假装执行。'))),
      h('div', { class: 'v3-week-day-grid' }, ...days.map((day) => dayCard(day, taskMap.get(day) || [], studyMap))),
    ),
    h('div', { class: 'v3-dashboard-grid two' }, modulePlan(week), h('section', { class: 'v3-card v3-week-retro' },
      h('div', { class: 'v3-card-head' }, h('div', {}, h('h2', {}, '本周里程碑与复盘'), h('p', {}, '周末只回答“证据是否够、瓶颈是否变、下周资源怎么挪”。'))),
      h('div', { class: 'v3-milestone-callout' }, icon('flag'), h('div', {}, h('span', {}, '里程碑'), h('strong', {}, week.milestone || '等待设置'))),
      h('div', { class: 'v3-retro-box' }, h('span', {}, '已有复盘'), h('p', {}, week.retro_md || '本周尚未形成正式复盘。完成更多真实训练后再写，避免无数据感想。')),
      h('a', { class: 'v3-text-link', href: '/progress' }, '查看作答表现证据 →'),
    )),
    routeSection(dashboard.timeline?.weeks || []),
  );
}
