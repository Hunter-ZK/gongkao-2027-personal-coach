import { api, main, clear, h, pct, fmtSec } from '../runtime.js';

function icon(id) {
  return h('svg', { class: 'v3-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('use', { href: `/static/img/icons.svg#${id}` }));
}

function kpi(label, value, note, iconId, tone = '') {
  return h('article', { class: `v3-kpi-card ${tone}` }, h('div', { class: 'v3-kpi-head' }, h('span', {}, label), h('span', { class: 'v3-kpi-icon' }, icon(iconId))), h('strong', { class: 'v3-kpi-value' }, value), h('small', {}, note));
}

function confidence(row) {
  const n = Number(row.attempts || 0);
  if (n >= 20) return ['样本较稳', 'good'];
  if (n >= 8) return ['可参考', ''];
  return ['薄样本', 'warn'];
}

function moduleCards(rows) {
  return h('section', { class: 'v3-card' },
    h('div', { class: 'v3-card-head' }, h('div', {}, h('h2', {}, '模块表现'), h('p', {}, '同时看正确率、样本量与可靠计时；样本少不下结论。'))),
    h('div', { class: 'v3-performance-module-grid' }, ...(rows.length ? rows.map((row) => {
      const acc = row.accuracy == null ? null : Math.round(row.accuracy * 100);
      const [label, tone] = confidence(row);
      return h('article', { class: 'v3-performance-module-card' },
        h('header', {}, h('strong', {}, row.label), h('span', { class: `v3-status-pill ${tone}` }, label)),
        h('div', { class: 'v3-performance-score' }, h('strong', {}, acc == null ? '—' : `${acc}%`), h('small', {}, `${row.correct || 0}/${row.attempts || 0} 次作答`)),
        h('div', { class: 'v3-progress-track' }, h('span', { style: `width:${acc || 0}%` })),
        h('footer', {}, h('span', {}, `独立题 ${row.unique_questions || 0}`), h('span', {}, row.reliable_timed ? `可靠均速 ${fmtSec(Math.round(row.avg_seconds || 0))}` : '暂无可靠计时')),
      );
    }) : [h('div', { class: 'v3-empty' }, '导入真实训练后自动形成模块表现。')])) ,
  );
}

function weakStrong(data) {
  const list = (title, rows, weak = false) => h('section', { class: 'v3-card' },
    h('div', { class: 'v3-card-head' }, h('div', {}, h('h2', {}, title), h('p', {}, weak ? '只纳入至少 5 次作答的题型，避免单题噪声。' : '至少 8 次作答才进入相对稳定优势列表。'))),
    h('div', { class: 'v3-rank-list' }, ...(rows.length ? rows.map((row, index) => h('div', { class: 'v3-rank-row' },
      h('span', { class: `v3-rank-no ${weak ? 'weak' : 'strong'}` }, String(index + 1).padStart(2, '0')),
      h('div', {}, h('strong', {}, `${row.module} · ${row.label}`), h('small', {}, `${row.attempts} 次 · ${row.unique_questions || 0} 道独立题${row.reliable_timed ? ` · 均速 ${fmtSec(Math.round(row.avg_seconds || 0))}` : ''}`)),
      h('b', {}, row.accuracy == null ? '—' : pct(row.accuracy, 0)),
    )) : [h('div', { class: 'v3-empty' }, weak ? '当前没有达到最小样本量的弱项。' : '当前没有达到最小样本量的稳定优势。')])) ,
  );
  return h('div', { class: 'v3-dashboard-grid two' }, list('优先补强题型', data.weak || [], true), list('相对稳定题型', data.strong || [], false));
}

function subtypeMatrix(rows) {
  const modules = [...new Set(rows.map((row) => row.module))];
  return h('section', { class: 'v3-card v3-subtype-card' },
    h('div', { class: 'v3-card-head' }, h('div', {}, h('h2', {}, '细分题型矩阵'), h('p', {}, '颜色表达正确率区间，右侧始终保留样本量；薄样本只提示不评级。'))),
    h('div', { class: 'v3-subtype-groups' }, ...modules.map((module) => h('div', { class: 'v3-subtype-group' },
      h('h3', {}, module),
      h('div', { class: 'v3-subtype-grid' }, ...rows.filter((row) => row.module === module).map((row) => {
        const acc = row.accuracy == null ? 0 : row.accuracy;
        const sample = row.sample_level || 'thin';
        const tone = sample === 'thin' ? 'thin' : acc >= .85 ? 'high' : acc >= .7 ? 'mid' : 'low';
        return h('article', { class: `v3-subtype-cell ${tone}` },
          h('div', {}, h('strong', {}, row.label), h('small', {}, `${row.attempts} 次作答`)),
          h('b', {}, row.accuracy == null ? '—' : pct(row.accuracy, 0)),
          h('span', {}, row.reliable_timed ? `${Math.round(row.avg_seconds || 0)}s/题` : sample === 'thin' ? '样本不足' : '无可靠计时'),
        );
      })),
    ))),
  );
}

function trendChart(rows) {
  const recent = rows.slice(-30);
  const maxN = Math.max(1, ...recent.map((row) => Number(row.attempts || 0)));
  return h('section', { class: 'v3-card v3-question-trend-card' },
    h('div', { class: 'v3-card-head' }, h('div', {}, h('h2', {}, '近 30 个训练日'), h('p', {}, '柱高是作答量，点位是当天正确率；单日正确率只看趋势，不作能力定论。'))),
    h('div', { class: 'v3-question-trend' }, ...recent.map((row) => h('div', { class: 'v3-question-trend-col', title: `${row.day} · ${row.attempts} 次 · ${pct(row.accuracy || 0, 0)}` },
      h('span', { class: 'v3-question-volume', style: `height:${Math.max(5, Number(row.attempts || 0) / maxN * 100)}%` }),
      h('i', { style: `bottom:${Math.max(2, Math.min(98, Number(row.accuracy || 0) * 100))}%` }),
      h('small', {}, row.day.slice(5)),
    ))),
  );
}

function coverageCard(data) {
  const ai = data.ai || {};
  const mistakes = data.mistakes || {};
  const required = Number(ai.required || 0);
  const pending = Number(ai.required_pending || 0);
  return h('section', { class: 'v3-card v3-coverage-card' },
    h('div', { class: 'v3-card-head' }, h('div', {}, h('h2', {}, '错题与 AI 解析闭环'), h('p', {}, '错题必须有持久化 AI 解析任务；正确题可按需解析并永久保存。'))),
    h('div', { class: 'v3-coverage-grid' },
      h('div', {}, h('span', {}, '错题总量'), h('strong', {}, String(mistakes.total || 0)), h('small', {}, `已修复 ${mistakes.repaired || 0}`)),
      h('div', {}, h('span', {}, 'AI 已解析'), h('strong', {}, String(ai.done || 0)), h('small', {}, `已请求 ${ai.requested || 0}`)),
      h('div', { class: pending ? 'warn' : 'good' }, h('span', {}, '必做解析待处理'), h('strong', {}, String(pending)), h('small', {}, required ? `必做共 ${required}` : '暂无必做任务')),
    ),
    pending ? h('a', { class: 'v3-primary-button compact', href: '/settings' }, '检查 AI 配置 / 重试') : h('span', { class: 'v3-status-pill good' }, '必做解析已闭环'),
  );
}

export async function renderProgress() {
  const data = await api('/api/analytics/questions?days=365');
  const s = data.summary || {};
  clear(main).append(
    h('div', { class: 'v3-page-heading' },
      h('div', {}, h('span', {}, 'QUESTION PERFORMANCE'), h('h1', { class: 'page-title' }, '作答表现看板'), h('p', {}, '回答“每类题现在什么水平、样本够不够、哪里最值得补、速度证据是否可靠”，而不是只画一条总正确率。')),
      h('div', { class: 'v3-heading-actions' }, h('a', { class: 'v3-secondary-button', href: '/trainings?tab=bank' }, '查看题库'), h('a', { class: 'v3-primary-button', href: '/import' }, '导入新训练')),
    ),
    h('div', { class: 'v3-kpi-grid four' },
      kpi('累计有效作答', `${s.attempts || 0}`, `${s.unique_questions || 0} 道独立题`, 'table'),
      kpi('总体正确率', s.accuracy == null ? '—' : pct(s.accuracy, 0), `${s.correct || 0} 对 / ${s.wrong || 0} 错`, 'check-circle', Number(s.accuracy || 0) >= .8 ? 'good' : ''),
      kpi('可靠计时样本', `${s.reliable_timed || 0}`, s.avg_seconds ? `平均 ${fmtSec(Math.round(s.avg_seconds))}` : '均摊用时不进入速度结论', 'stopwatch'),
      kpi('AI 解析覆盖', `${data.ai?.done || 0}`, `${data.ai?.required_pending || 0} 个必做解析待处理`, 'chat', data.ai?.required_pending ? 'warn' : 'good'),
    ),
    h('div', { class: 'v3-data-rule' }, icon('help'), h('span', {}, data.method_note || '样本量和计时可信度会与正确率一起展示。')),
    moduleCards(data.modules || []),
    weakStrong(data),
    h('div', { class: 'v3-dashboard-grid two' }, trendChart(data.daily || []), coverageCard(data)),
    subtypeMatrix(data.subtypes || []),
  );
}
