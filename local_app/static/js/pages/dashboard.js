import { api, jpatch, jpost, main, clear, h, pct, hours, fmtSec } from '../runtime.js';

const PRIORITY_LABEL = { P0: '必须完成', P1: '核心推进', P2: '弹性任务' };

function icon(id, cls = 'v3-icon') {
  return h('svg', { class: cls, viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('use', { href: `/static/img/icons.svg#${id}` }));
}

function progress(value) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return h('div', { class: 'v3-progress-track' }, h('span', { style: `width:${safe}%` }));
}

function statCard(label, value, note, iconId, tone = '') {
  return h('article', { class: `v3-kpi-card ${tone}` },
    h('div', { class: 'v3-kpi-head' }, h('span', {}, label), h('span', { class: 'v3-kpi-icon' }, icon(iconId))),
    h('strong', { class: 'v3-kpi-value' }, value),
    h('small', {}, note),
  );
}

function currentWeek(data) {
  return data.timeline?.weeks?.find((row) => row.no === data.timeline?.current_week) || data.timeline?.weeks?.[0] || null;
}

function dateRange(week) {
  if (!week) return '尚未建立周计划';
  const fmt = (value) => value ? `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}` : '—';
  return `${fmt(week.start)} – ${fmt(week.end)}`;
}

function milestoneHero(data) {
  const week = currentWeek(data);
  const phase = data.phase || {};
  const actualH = Number(data.week?.actual_seconds || 0) / 3600;
  const targetH = Number(data.week?.target_hours || 0);
  const completion = targetH ? Math.min(100, actualH / targetH * 100) : 0;
  const focusPayload = JSON.stringify({ module: '综合', activity_type: '知识恢复', task_name: '25 分钟快速推进' });
  return h('section', { class: 'v3-milestone-hero' },
    h('div', { class: 'v3-milestone-main' },
      h('div', { class: 'v3-milestone-tags' },
        h('span', { class: 'v3-dark-chip' }, `W${data.timeline?.current_week || '—'}`),
        h('span', { class: 'v3-dark-chip soft' }, phase.code || '当前阶段'),
        h('span', { class: 'v3-dark-muted' }, dateRange(week)),
      ),
      h('h1', {}, phase.name || week?.theme || '当前备考阶段'),
      h('p', {}, phase.goal_md || week?.theme || '以真实训练、时间和复训数据推进本周目标。'),
      h('div', { class: 'v3-hero-progress' },
        h('div', {}, h('span', {}, '本周有效学习'), h('strong', {}, `${actualH.toFixed(1)}h / ${targetH ? `${targetH.toFixed(1)}h` : '—'}`)),
        progress(completion),
      ),
    ),
    h('div', { class: 'v3-milestone-actions' },
      h('a', { href: '/review', class: 'v3-hero-action' }, icon('review'), h('span', {}, '待复训'), h('strong', {}, String(data.week?.reviews_due || 0)), h('small', {}, '道')),
      h('button', {
        class: 'v3-hero-action primary',
        type: 'button',
        onclick: () => window.startGlobalFocus?.(JSON.parse(focusPayload)),
      }, icon('stopwatch'), h('span', {}, '快速专注'), h('strong', {}, '25'), h('small', {}, 'min')),
    ),
  );
}

function dailyDistribution(data) {
  const week = currentWeek(data);
  const map = new Map((data.week?.by_day || []).map((row) => [row.date, row]));
  const rows = [];
  if (week) {
    let d = new Date(`${week.start}T12:00:00`);
    for (let i = 0; i < 7; i += 1) {
      const key = d.toISOString().slice(0, 10);
      rows.push(map.get(key) || { date: key, seconds: 0, deep_seconds: 0 });
      d = new Date(d.getTime() + 86400000);
    }
  }
  const max = Math.max(3600, ...rows.map((row) => Number(row.seconds || 0)));
  const labels = ['一', '二', '三', '四', '五', '六', '日'];
  return h('section', { class: 'v3-card v3-study-chart-card' },
    h('div', { class: 'v3-card-head' },
      h('div', {}, h('h2', {}, '本周学习时长分布'), h('p', {}, '深色为深度学习，浅色为其他有效学习；只统计真实计时记录。')),
      h('a', { href: '/timer', class: 'v3-text-link' }, '查看时间看板 →'),
    ),
    h('div', { class: 'v3-week-bars' }, ...rows.map((row, index) => {
      const total = Number(row.seconds || 0);
      const deep = Math.min(total, Number(row.deep_seconds || 0));
      const other = Math.max(0, total - deep);
      const totalH = total / 3600;
      return h('div', { class: 'v3-week-bar-col', title: `${row.date} · ${hours(total)}` },
        h('strong', {}, total ? `${totalH.toFixed(1)}h` : '—'),
        h('div', { class: 'v3-week-bar-track' },
          h('span', { class: 'v3-week-bar deep', style: `height:${(deep / max) * 100}%` }),
          h('span', { class: 'v3-week-bar normal', style: `height:${(other / max) * 100}%` }),
        ),
        h('small', {}, `周${labels[index]}`),
      );
    })),
    h('div', { class: 'v3-chart-legend' }, h('span', {}, h('i', { class: 'deep' }), '深度学习'), h('span', {}, h('i', { class: 'normal' }), '常规/碎片')),
  );
}

function criteriaCard(data) {
  const rows = data.phase?.criteria || [];
  return h('section', { class: 'v3-card v3-criteria-card' },
    h('div', { class: 'v3-card-head' },
      h('div', {}, h('h2', {}, `${data.phase?.code || ''} 阶段晋级条件`), h('p', {}, `${data.phase?.blocking_count || 0} 项尚未达成；不以主观感觉代替晋级证据。`)),
      h('span', { class: `v3-status-pill ${data.phase?.can_advance ? 'good' : 'warn'}` }, data.phase?.can_advance ? '可晋级' : '推进中'),
    ),
    h('div', { class: 'v3-criteria-list' }, ...rows.map((row) => {
      const current = Number(row.current || 0);
      const threshold = Number(row.threshold || 0);
      const ratio = threshold > 0 ? Math.min(100, current / threshold * 100) : (row.passed ? 100 : 0);
      return h('div', { class: `v3-criterion-row ${row.passed ? 'passed' : ''}` },
        h('span', { class: 'v3-criterion-state' }, icon(row.passed ? 'check-circle' : 'clock')),
        h('div', { class: 'v3-criterion-copy' }, h('strong', {}, row.label), progress(ratio)),
        h('span', { class: 'v3-criterion-value' }, `${current < 2 ? current.toFixed(2) : Math.round(current)} / ${threshold}`),
      );
    })),
  );
}

function taskPreview(task) {
  const done = task.status === 'done';
  return h('article', { class: `v3-task-preview ${done ? 'done' : ''}` },
    h('span', { class: `v3-priority ${task.priority || 'P2'}` }, task.priority || 'P2'),
    h('div', { class: 'v3-task-preview-copy' },
      h('strong', {}, task.title),
      h('small', {}, `${task.module || '综合'} · ${task.est_minutes || 0} 分钟${task.reason_md ? ` · ${task.reason_md}` : ''}`),
    ),
    h('button', {
      type: 'button',
      class: 'v3-icon-button',
      disabled: done,
      title: done ? '已完成' : '计时推进',
      onclick: () => window.startGlobalFocus?.({ module: task.module || '综合', activity_type: '知识恢复', task_id: task.id, task_name: task.title }),
    }, icon(done ? 'check-circle' : 'play')),
  );
}

function todayPreview(data) {
  const tasks = (data.tasks || []).slice(0, 5);
  return h('section', { class: 'v3-card v3-today-preview' },
    h('div', { class: 'v3-card-head' },
      h('div', {}, h('h2', {}, '今日推进队列'), h('p', {}, tasks.length ? `优先处理 ${tasks.filter((x) => x.status !== 'done').length} 项未完成任务。` : '今天尚未生成任务。')),
      h('a', { href: '/today', class: 'v3-text-link' }, '展开全部 →'),
    ),
    h('div', { class: 'v3-task-preview-list' }, ...tasks.map(taskPreview)),
  );
}

function moduleStrip(titleText, rows = []) {
  const useful = rows.filter((row) => Number(row.sample_n || 0) > 0).sort((a, b) => (a.accuracy ?? 2) - (b.accuracy ?? 2)).slice(0, 6);
  return h('section', { class: 'v3-card v3-module-strip-card' },
    h('div', { class: 'v3-card-head' }, h('div', {}, h('h2', {}, titleText), h('p', {}, '正确率必须和样本量一起看；样本不足不生成能力结论。')), h('a', { href: '/progress', class: 'v3-text-link' }, '作答看板 →')),
    useful.length ? h('div', { class: 'v3-module-strip' }, ...useful.map((row) => {
      const acc = row.accuracy == null ? null : Math.round(row.accuracy * 100);
      return h('div', { class: 'v3-module-chip-card' },
        h('div', {}, h('strong', {}, row.name), h('small', {}, `${row.sample_n} 题`)),
        h('b', { class: acc != null && acc >= Math.round((row.target_accuracy || 0) * 100) ? 'good' : 'warn' }, acc == null ? '—' : `${acc}%`),
        h('span', {}, row.gap_text || '样本不足'),
      );
    })) : h('div', { class: 'v3-empty' }, '还没有足够的真实训练数据。'),
  );
}

export async function renderDashboard() {
  const data = await api('/api/dashboard');
  const week = data.week || {};
  const actualH = Number(week.actual_seconds || 0) / 3600;
  const targetH = Number(week.target_hours || 0);
  const completion = targetH ? actualH / targetH * 100 : 0;
  clear(main).append(
    h('div', { class: 'v3-page-heading' },
      h('div', {}, h('span', {}, 'PERSONAL STUDY OS'), h('h1', { class: 'page-title' }, '备考工作台概览'), h('p', {}, '只展示真正影响今天决策的数据：进度、学习投入、训练表现、复训负荷和阶段门槛。')),
      h('div', { class: 'v3-heading-actions' }, h('a', { href: '/import', class: 'v3-primary-button' }, icon('import'), '导入最新练习'), h('a', { href: '/today', class: 'v3-secondary-button' }, '今日任务')),
    ),
    milestoneHero(data),
    h('div', { class: 'v3-kpi-grid' },
      statCard('本周有效学习', `${actualH.toFixed(1)}h`, targetH ? `目标 ${targetH.toFixed(1)}h · ${Math.round(completion)}%` : '等待周目标', 'clock'),
      statCard('深度学习占比', `${Math.round(Number(week.deep_ratio || 0) * 100)}%`, '按真实计时分类', 'focus', Number(week.deep_ratio || 0) >= .5 ? 'good' : ''),
      statCard('本周有效作答', `${week.questions || 0}`, week.accuracy == null ? '尚无有效样本' : `正确率 ${pct(week.accuracy, 0)} · ${week.accuracy_note || ''}`, 'table'),
      statCard('到期复训', `${week.reviews_due || 0}`, week.reviews_due ? '优先清掉高价值到期错题' : '当前无到期复训', 'review', week.reviews_due ? 'warn' : 'good'),
    ),
    h('div', { class: 'v3-dashboard-grid two' }, dailyDistribution(data), criteriaCard(data)),
    h('div', { class: 'v3-dashboard-grid two' }, todayPreview(data), moduleStrip('广东省考 · 当前模块证据', data.modules?.guangdong || [])),
    h('section', { class: 'v3-card v3-roadmap-card' },
      h('div', { class: 'v3-card-head' }, h('div', {}, h('h2', {}, '13 周备考路线'), h('p', {}, '当前周突出显示；长期路线只负责方向，日常动作由真实表现动态调整。')), h('a', { href: '/plan', class: 'v3-text-link' }, '周计划 →')),
      h('div', { class: 'v3-roadmap' }, ...(data.timeline?.weeks || []).map((row) => h('div', { class: `v3-roadmap-node ${row.status}` }, h('strong', {}, `W${row.no}`), h('span', {}, row.theme || ''), h('small', {}, `${row.start.slice(5)} ~ ${row.end.slice(5)}`)))),
    ),
  );
}

function todayStats(tasks) {
  const pending = tasks.filter((x) => x.status !== 'done');
  const done = tasks.filter((x) => x.status === 'done');
  return h('div', { class: 'v3-kpi-grid three' },
    statCard('待推进', `${pending.length}`, '按 P0 → P1 → P2 排序', 'tasks'),
    statCard('预计投入', `${pending.reduce((s, x) => s + Number(x.est_minutes || 0), 0)}m`, '未完成任务预计时长', 'clock'),
    statCard('已完成', `${done.length}`, tasks.length ? `完成 ${Math.round(done.length / tasks.length * 100)}%` : '暂无任务', 'check-circle', done.length ? 'good' : ''),
  );
}

function todayTaskCard(task, rerender) {
  const done = task.status === 'done';
  const steps = Array.isArray(task.steps) ? task.steps : [];
  const nodes = Array.isArray(task.node_slugs_list) ? task.node_slugs_list : [];
  const check = h('button', { class: `v3-task-check ${done ? 'done' : ''}`, type: 'button', title: done ? '设为未完成' : '标记完成' }, icon(done ? 'check' : 'circle'));
  check.onclick = async () => {
    await jpatch(`/api/tasks/${task.id}`, { status: done ? 'todo' : 'done' });
    await rerender();
  };
  return h('article', { class: `v3-today-task ${done ? 'done' : ''}`, 'data-priority': task.priority || 'P2' },
    h('div', { class: 'v3-today-task-top' },
      check,
      h('div', { class: 'v3-today-task-title' },
        h('div', { class: 'v3-task-chips' },
          h('span', { class: `v3-priority ${task.priority || 'P2'}` }, task.priority || 'P2'),
          h('span', {}, PRIORITY_LABEL[task.priority] || '弹性任务'),
          h('span', {}, task.module || '综合'),
          h('span', {}, `${task.est_minutes || 0} min`),
        ),
        h('h3', {}, task.title),
        task.reason_md ? h('p', {}, task.reason_md) : null,
      ),
      h('div', { class: 'v3-today-task-actions' },
        h('button', { class: 'v3-primary-button compact', disabled: done, onclick: () => window.startGlobalFocus?.({ module: task.module || '综合', activity_type: '知识恢复', task_id: task.id, task_name: task.title }) }, icon('play'), '计时推进'),
        h('button', { class: 'v3-secondary-button compact', disabled: done, onclick: async () => { await jpatch(`/api/tasks/${task.id}`, { postpone: true }); await rerender(); } }, '推迟'),
      ),
    ),
    h('div', { class: 'v3-task-body' },
      h('div', {}, h('span', { class: 'v3-section-label' }, '执行步骤'), steps.length ? h('ol', {}, ...steps.map((step) => h('li', {}, step))) : h('p', { class: 'v3-muted' }, '按任务描述直接执行。')),
      h('div', {}, h('span', { class: 'v3-section-label' }, '完成标准'), h('p', {}, task.done_criteria_md || '完成任务并记录真实训练/学习结果。')),
      nodes.length ? h('div', { class: 'v3-task-node-row' }, h('span', { class: 'v3-section-label' }, '关联知识'), ...nodes.map((slug) => h('a', { href: `/knowledge?node=${encodeURIComponent(slug)}` }, slug))) : null,
    ),
  );
}

function addTaskDialog(rerender) {
  const dialog = h('dialog', { class: 'v3-dialog' });
  const titleInput = h('input', { placeholder: '任务名称' });
  const moduleInput = h('input', { placeholder: '模块，例如：资料分析' });
  const minutesInput = h('input', { type: 'number', min: '5', value: '30' });
  const priority = h('select', {}, h('option', { value: 'P0' }, 'P0 必须完成'), h('option', { value: 'P1', selected: true }, 'P1 核心推进'), h('option', { value: 'P2' }, 'P2 弹性任务'));
  const reason = h('textarea', { rows: 3, placeholder: '为什么今天做（可选）' });
  dialog.append(
    h('div', { class: 'v3-dialog-head' }, h('div', {}, h('h2', {}, '新增今日任务'), h('p', {}, '手动任务与系统生成任务使用同一推进队列。')), h('button', { class: 'v3-icon-button', onclick: () => dialog.close() }, '×')),
    h('div', { class: 'v3-form-grid' },
      h('label', {}, '任务名称', titleInput), h('label', {}, '模块', moduleInput), h('label', {}, '优先级', priority), h('label', {}, '预计分钟', minutesInput), h('label', { class: 'span-2' }, '原因', reason),
    ),
    h('div', { class: 'v3-dialog-actions' }, h('button', { class: 'v3-secondary-button', onclick: () => dialog.close() }, '取消'), h('button', { class: 'v3-primary-button', onclick: async () => {
      if (!titleInput.value.trim()) return alert('请填写任务名称');
      await jpost('/api/tasks', {
        task_date: new Date().toISOString().slice(0, 10), priority: priority.value, title: titleInput.value.trim(), module: moduleInput.value.trim() || null,
        reason_md: reason.value.trim() || null, est_minutes: Number(minutesInput.value || 0), steps: [], done_criteria_md: '完成任务并形成真实记录', node_slugs: [],
      });
      dialog.close();
      await rerender();
    } }, '加入队列')),
  );
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
}

export async function renderToday(activeFilter = 'all') {
  const tasks = await api(`/api/tasks?date=${new Date().toISOString().slice(0, 10)}`);
  const rerender = async () => renderToday(activeFilter);
  const counts = {
    all: tasks.length,
    P0: tasks.filter((x) => x.priority === 'P0' && x.status !== 'done').length,
    P1: tasks.filter((x) => x.priority === 'P1' && x.status !== 'done').length,
    P2: tasks.filter((x) => x.priority === 'P2' && x.status !== 'done').length,
    done: tasks.filter((x) => x.status === 'done').length,
  };
  const filtered = tasks.filter((task) => activeFilter === 'all' ? true : activeFilter === 'done' ? task.status === 'done' : task.priority === activeFilter && task.status !== 'done');
  clear(main).append(
    h('div', { class: 'v3-page-heading' },
      h('div', {}, h('span', {}, 'DAILY EXECUTION'), h('h1', { class: 'page-title' }, '今日任务推进队列'), h('p', {}, '任务不是清单展示，而是“为什么做 → 怎么做 → 完成标准 → 计时记录”的执行入口。')),
      h('div', { class: 'v3-heading-actions' }, h('button', { class: 'v3-secondary-button', onclick: async () => { await jpost('/api/tasks/generate', {}); await rerender(); } }, '重新校准'), h('button', { class: 'v3-primary-button', onclick: () => addTaskDialog(rerender) }, '+ 新增任务')),
    ),
    todayStats(tasks),
    h('div', { class: 'v3-filter-tabs' }, ...[
      ['all', `全部 ${counts.all}`], ['P0', `P0 ${counts.P0}`], ['P1', `P1 ${counts.P1}`], ['P2', `P2 ${counts.P2}`], ['done', `已完成 ${counts.done}`],
    ].map(([key, label]) => h('button', { class: activeFilter === key ? 'active' : '', onclick: () => renderToday(key) }, label))),
    h('section', { class: 'v3-today-list' }, ...(filtered.length ? filtered.map((task) => todayTaskCard(task, rerender)) : [h('div', { class: 'v3-card v3-empty' }, '当前筛选下没有任务。')]))
  );
}
