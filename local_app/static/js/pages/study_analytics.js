import { api, main, clear, h, hours, fmtSec } from '../runtime.js';

function icon(id) {
  return h('svg', { class: 'v3-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('use', { href: `/static/img/icons.svg#${id}` }));
}

function kpi(label, value, note, iconId) {
  return h('article', { class: 'v3-kpi-card' }, h('div', { class: 'v3-kpi-head' }, h('span', {}, label), h('span', { class: 'v3-kpi-icon' }, icon(iconId))), h('strong', { class: 'v3-kpi-value' }, value), h('small', {}, note));
}

function distCard(title, rows, unit = 'time') {
  const max = Math.max(1, ...rows.map((row) => Number(row.duration_sec || 0)));
  return h('section', { class: 'v3-card v3-dist-card' },
    h('div', { class: 'v3-card-head' }, h('div', {}, h('h2', {}, title), h('p', {}, '按真实专注记录自动聚合。'))),
    h('div', { class: 'v3-dist-list' }, ...(rows.length ? rows.slice(0, 10).map((row) => h('div', { class: 'v3-dist-row' },
      h('div', { class: 'v3-dist-label' }, h('strong', {}, row.label || '未分类'), h('small', {}, `${row.sessions || 0} 次 · ${Math.round(Number(row.share || 0) * 100)}%`)),
      h('div', { class: 'v3-dist-bar' }, h('span', { style: `width:${Number(row.duration_sec || 0) / max * 100}%` })),
      h('b', {}, unit === 'time' ? hours(row.duration_sec || 0) : String(row.sessions || 0)),
    )) : [h('div', { class: 'v3-empty' }, '暂无数据')])) ,
  );
}

function heatmap(rows) {
  const max = Math.max(1, ...rows.map((row) => Number(row.seconds || 0)));
  return h('section', { class: 'v3-card v3-heatmap-card' },
    h('div', { class: 'v3-card-head' }, h('div', {}, h('h2', {}, '学习活动热力图'), h('p', {}, '颜色深度只代表当天有效学习时长，不代表学习质量。'))),
    h('div', { class: 'v3-study-heatmap' }, ...rows.map((row) => {
      const ratio = Number(row.seconds || 0) / max;
      const level = row.seconds ? Math.max(1, Math.min(5, Math.ceil(ratio * 5))) : 0;
      return h('span', { class: `level-${level}`, title: `${row.date} · ${hours(row.seconds || 0)}`, 'aria-label': `${row.date} ${hours(row.seconds || 0)}` });
    })),
    h('div', { class: 'v3-heatmap-legend' }, h('span', {}, '少'), ...[0,1,2,3,4,5].map((level) => h('i', { class: `level-${level}` })), h('span', {}, '多')),
  );
}

function dailyChart(rows) {
  const recent = rows.slice(-30);
  const max = Math.max(3600, ...recent.map((row) => Number(row.duration_sec || 0)));
  return h('section', { class: 'v3-card v3-study-daily-card' },
    h('div', { class: 'v3-card-head' }, h('div', {}, h('h2', {}, '近 30 天学习时长'), h('p', {}, '深度、常规、碎片三类叠加展示；不要用单日波动判断能力。'))),
    h('div', { class: 'v3-daily-bars' }, ...recent.map((row) => h('div', { class: 'v3-daily-bar-col', title: `${row.study_date} · ${hours(row.duration_sec || 0)}` },
      h('div', { class: 'v3-daily-bar-track' },
        h('span', { class: 'deep', style: `height:${Number(row.deep_sec || 0) / max * 100}%` }),
        h('span', { class: 'focus', style: `height:${Number(row.focus_sec || 0) / max * 100}%` }),
        h('span', { class: 'fragment', style: `height:${Number(row.fragment_sec || 0) / max * 100}%` }),
      ),
      h('small', {}, row.study_date.slice(5)),
    ))),
    h('div', { class: 'v3-chart-legend' }, h('span', {}, h('i', { class: 'deep' }), '深度'), h('span', {}, h('i', { class: 'focus' }), '常规'), h('span', {}, h('i', { class: 'fragment' }), '碎片')),
  );
}

function sessionTable(rows) {
  return h('section', { class: 'v3-card v3-session-card' },
    h('div', { class: 'v3-card-head' }, h('div', {}, h('h2', {}, '每次学习记录'), h('p', {}, '记录“什么时候、学什么、学多久、属于哪种学习”，便于后续检查时间投入结构。')), h('span', { class: 'v3-status-pill' }, `${rows.length} 条`)),
    h('div', { class: 'v3-table-scroll' }, h('table', { class: 'v3-table' },
      h('thead', {}, h('tr', {}, h('th', {}, '日期/时间'), h('th', {}, '学习内容'), h('th', {}, '模块'), h('th', {}, '活动类型'), h('th', {}, '时段'), h('th', {}, '分类'), h('th', { class: 'num' }, '有效时长'))),
      h('tbody', {}, ...rows.map((row) => {
        const started = row.start_at ? new Date(row.start_at) : null;
        const time = started && !Number.isNaN(started.getTime()) ? `${String(started.getHours()).padStart(2,'0')}:${String(started.getMinutes()).padStart(2,'0')}` : '—';
        const labels = { deep: '深度学习', focus: '常规专注', fragment: '碎片学习', morning: '早晨', noon: '午间', work_gap: '工作间隙', evening: '晚间', weekend: '周末' };
        return h('tr', {},
          h('td', {}, h('strong', {}, row.study_date), h('small', {}, time)),
          h('td', {}, row.task_name || '临时专注'),
          h('td', {}, row.module || '综合'),
          h('td', {}, row.activity_type || '学习'),
          h('td', {}, labels[row.time_slot] || row.time_slot || '—'),
          h('td', {}, h('span', { class: `v3-session-category ${row.category || ''}` }, labels[row.category] || row.category || '—')),
          h('td', { class: 'num' }, fmtSec(row.duration_sec || 0)),
        );
      })),
    )),
  );
}

export async function renderStudyAnalytics() {
  const data = await api('/api/analytics/study?days=90');
  const s = data.summary || {};
  clear(main).append(
    h('div', { class: 'v3-page-heading' },
      h('div', {}, h('span', {}, 'STUDY TIME ANALYTICS'), h('h1', { class: 'page-title' }, '学习投入看板'), h('p', {}, '计时入口只保留顶部小按钮；这个页面不负责计时，只负责回答“时间花在哪里、每次多久、什么时段最常学”。')),
      h('div', { class: 'v3-heading-actions' }, h('button', { class: 'v3-primary-button', onclick: () => window.openGlobalFocus?.() }, icon('stopwatch'), '打开小计时器')),
    ),
    h('div', { class: 'v3-kpi-grid four' },
      kpi('近 90 天有效学习', hours(s.total_sec || 0), `${s.active_days || 0} 个有记录学习日`, 'clock'),
      kpi('本周学习', hours(s.week_sec || 0), `今天 ${hours(s.today_sec || 0)}`, 'calendar'),
      kpi('深度学习占比', `${Math.round(Number(s.deep_ratio || 0) * 100)}%`, `深度 ${hours(s.deep_sec || 0)}`, 'focus'),
      kpi('平均单次', fmtSec(s.avg_session_sec || 0), `最长 ${fmtSec(s.longest_session_sec || 0)} · ${s.session_count || 0} 次`, 'trend'),
    ),
    h('div', { class: 'v3-dashboard-grid two' }, dailyChart(data.daily || []), heatmap(data.heatmap || [])),
    h('div', { class: 'v3-dashboard-grid two' }, distCard('按模块分布', data.module || []), distCard('按学习活动分布', data.activity || [])),
    h('div', { class: 'v3-dashboard-grid two' }, distCard('按时间段分布', data.time_slot || []), distCard('按专注类型分布', data.category || [])),
    sessionTable(data.sessions || []),
  );
}
