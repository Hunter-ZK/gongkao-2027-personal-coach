import { api, jpatch, jpost, main, clear, h } from '../runtime.js';

const MISTAKE_CAUSES = [
  '审题错误', '主体错误', '时间错误', '单位错误', '题型识别错误', '方法选择错误',
  '公式调用错误', '推理链遗漏', '计算错误', '速度问题', '取舍问题', '知识缺口',
  '方法生疏', '偶发失误',
];

function icon(id, cls = '') {
  return h('svg', { class: `cg-icon ${cls}`.trim(), viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    h('use', { href: `/static/img/icons.svg#${id}` }),
  );
}

function imageSrc(ref) {
  if (!ref) return '';
  const raw = String(ref).replaceAll('\\', '/');
  if (raw.startsWith('/data-images/')) return raw;
  const marker = '/data/images/';
  if (raw.includes(marker)) return `/data-images/${raw.split(marker).pop()}`;
  if (raw.startsWith('data/images/')) return `/data-images/${raw.slice('data/images/'.length)}`;
  return `/data-images/${raw.replace(/^\/+/, '')}`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isDue(row) {
  return !row.next_review_at || String(row.next_review_at).slice(0, 10) <= todayIso();
}

function masteryLevel(row) {
  if (row.status === '已修复') return 4;
  if (Number(row.consecutive_correct || 0) >= 1) return 3;
  if (Number(row.review_count || 0) >= 2) return 2;
  if (Number(row.review_count || 0) >= 1) return 1;
  return 0;
}

function optionEntries(row) {
  const opts = row.options || {};
  const images = row.option_images || {};
  return ['A', 'B', 'C', 'D'].filter((key) => opts[key] || images[key]).map((key) => [key, opts[key] || '', images[key]]);
}

function aiPrescription(row) {
  const parts = [];
  if (row.fastest_solution_md) parts.push(`最快路径：${row.fastest_solution_md}`);
  else if (row.standard_solution_md) parts.push(`标准解法：${row.standard_solution_md}`);
  if (row.fastest_conditions) parts.push(`适用条件：${row.fastest_conditions}`);
  if (row.trap) parts.push(`避坑：${row.trap}`);
  return parts.join('；') || 'DeepSeek 解析尚未形成完整处方，可在卡片详情中重新触发 AI 解析。';
}

function metric(label, value, tone = '') {
  return h('div', { class: `cg-mistake-metric ${tone}`.trim() },
    h('span', {}, label),
    h('strong', {}, String(value)),
    h('small', {}, '道'),
  );
}

function detailOption(row, key, value, img) {
  const correct = key === row.correct_answer;
  const wrong = key === row.user_answer && key !== row.correct_answer;
  return h('div', { class: `cg-mistake-detail-option ${correct ? 'correct' : wrong ? 'wrong' : ''}` },
    h('span', { class: `cg-option-letter ${correct ? 'correct' : wrong ? 'wrong' : ''}` }, key),
    h('div', {}, value || '', img ? h('img', { src: imageSrc(img), loading: 'lazy', alt: `${key} 选项配图` }) : null),
    correct ? h('em', { class: 'correct' }, '正确') : wrong ? h('em', { class: 'wrong' }, '你的选择') : null,
  );
}

function editor(row, rows, redraw) {
  const cause = h('select', {},
    h('option', { value: '' }, '请选择主要错因'),
    ...MISTAKE_CAUSES.map((name) => h('option', { value: name, selected: row.cause_primary === name }, name)),
  );
  const causeNote = h('textarea', { rows: '3', placeholder: '记录真正导致失分的过程故障。' }, row.cause_note || '');
  const standard = h('textarea', { rows: '4', placeholder: '稳定、可复现的标准解法。' }, row.standard_solution_md || '');
  const fastest = h('textarea', { rows: '3', placeholder: '考场更快路径。' }, row.fastest_solution_md || '');
  const conditions = h('textarea', { rows: '2', placeholder: '最快路径适用条件。' }, row.fastest_conditions || '');
  const trap = h('textarea', { rows: '3', placeholder: '命题陷阱 / 下次提醒。' }, row.trap || '');
  const save = h('button', { class: 'cg-mistake-save', type: 'button', onclick: async () => {
    if (fastest.value.trim() && !conditions.value.trim()) {
      alert('填写最快解法时，需要同时写明适用条件。');
      return;
    }
    const updated = await jpatch(`/api/mistakes/${row.id}`, {
      cause_primary: cause.value || null,
      cause_note: causeNote.value.trim() || null,
      standard_solution_md: standard.value.trim() || null,
      fastest_solution_md: fastest.value.trim() || null,
      fastest_conditions: conditions.value.trim() || null,
      trap: trap.value.trim() || null,
    });
    const base = rows.find((item) => item.id === row.id);
    if (base) Object.assign(base, updated);
    await redraw();
  } }, '保存诊断');

  const reanalyze = h('button', { class: 'cg-mistake-ai-button', type: 'button', onclick: async () => {
    reanalyze.disabled = true;
    reanalyze.textContent = 'AI 解析中…';
    try {
      await jpost(`/api/coach/analyze-mistake/${row.id}`, {});
      const fresh = await api(`/api/mistakes/${row.id}`);
      const base = rows.find((item) => item.id === row.id);
      if (base) Object.assign(base, fresh);
      await redraw();
    } catch (error) {
      alert(error?.message || String(error));
      reanalyze.disabled = false;
      reanalyze.textContent = 'AI 重新解析';
    }
  } }, 'AI 重新解析');

  return h('div', { class: 'cg-mistake-editor' },
    h('div', { class: 'cg-mistake-editor-grid two' },
      h('label', {}, h('span', {}, '主要错因'), cause),
      h('label', {}, h('span', {}, '错因说明'), causeNote),
    ),
    h('label', {}, h('span', {}, '标准解法'), standard),
    h('div', { class: 'cg-mistake-editor-grid two' },
      h('label', {}, h('span', {}, '最快解法'), fastest),
      h('label', {}, h('span', {}, '适用条件'), conditions),
    ),
    h('label', {}, h('span', {}, '命题陷阱 / 下次提醒'), trap),
    h('div', { class: 'cg-mistake-editor-actions' }, reanalyze, save),
  );
}

function mistakeCard(row, rows, redraw) {
  const level = masteryLevel(row);
  const due = isDue(row);
  const details = h('div', { class: 'cg-mistake-full-detail', hidden: true });
  const detailButton = h('button', { class: 'cg-mistake-text-button', type: 'button' },
    icon('eye'), h('span', {}, '查看完整题干与解析'),
  );
  detailButton.onclick = () => {
    details.hidden = !details.hidden;
    detailButton.querySelector('span').textContent = details.hidden ? '查看完整题干与解析' : '收起完整题干与解析';
  };

  const optionNodes = optionEntries(row).map(([key, value, img]) => detailOption(row, key, value, img));
  details.append(
    h('div', { class: 'cg-mistake-detail-question' },
      h('h4', {}, row.stem_md || '题干以原图为准'),
      ...(row.images || []).map((src) => h('img', { class: 'cg-mistake-detail-image', src: imageSrc(src), loading: 'lazy', alt: '题干配图' })),
      optionNodes.length ? h('div', { class: 'cg-mistake-detail-options' }, ...optionNodes) : null,
    ),
    h('details', { class: 'cg-mistake-edit-details' },
      h('summary', {}, '编辑错因与解法'),
      editor(row, rows, redraw),
    ),
  );

  return h('article', { class: 'cg-mistake-card' },
    h('div', { class: 'cg-mistake-card-top' },
      h('div', { class: 'cg-mistake-card-tags' },
        h('span', { class: 'cg-error-pattern' }, row.cause_primary || '待诊断'),
        h('strong', {}, row.cause_primary ? `${row.cause_primary} · ${row.subtype || '错题模式'}` : (row.subtype || '待确认错误模式')),
        h('span', { class: 'cg-module-chip' }, row.module || '未分类'),
      ),
      h('div', { class: 'cg-mistake-card-state' },
        h('div', { class: 'cg-mastery-inline' },
          h('span', {}, '熟练度:'),
          h('div', { class: 'cg-mastery-dots' }, ...[0, 1, 2, 3, 4].map((n) => h('i', { class: n <= level ? 'active' : '' }))),
          h('strong', {}, `M${level}`),
        ),
        h('span', { class: `cg-review-due ${due ? 'due' : ''}` }, due ? '今日到期复训' : `下次: ${String(row.next_review_at || '待定').slice(0, 10)}`),
      ),
    ),
    h('div', { class: 'cg-mistake-stem' }, row.stem_md || '题干以原图为准'),
    h('div', { class: 'cg-mistake-answer-strip' },
      h('div', {}, h('span', {}, '考场误选：'), h('strong', { class: 'wrong' }, row.user_answer || '—')),
      h('div', {}, h('span', {}, '正确答案：'), h('strong', { class: 'correct' }, row.correct_answer || '—')),
      h('div', {}, h('span', {}, '已复训次数：'), h('strong', {}, `${row.review_count || 0} 次`)),
    ),
    h('div', { class: 'cg-mistake-diagnosis-grid' },
      h('div', { class: 'cg-mistake-diagnosis root' },
        h('div', { class: 'cg-mistake-diagnosis-title' }, icon('alert'), h('strong', {}, '思维缺陷诊断 (Root Cause)')),
        h('p', {}, row.cause_note || (row.cause_primary ? `当前归因为“${row.cause_primary}”，建议补充当时的真实判断过程。` : '尚未确认主要错因。AI 建议只能作为候选，最终错因应由复盘确认。')),
      ),
      h('div', { class: 'cg-mistake-diagnosis ai' },
        h('div', { class: 'cg-mistake-diagnosis-title' }, icon('sparkles'), h('strong', {}, 'AI 考场提分处方 (Prescription)')),
        h('p', {}, aiPrescription(row)),
      ),
    ),
    h('div', { class: 'cg-mistake-card-footer' },
      detailButton,
      h('a', { class: 'cg-mistake-review-button', href: '/review' }, h('span', {}, '即刻复训这道题'), icon('arrow-right')),
    ),
    details,
  );
}

export async function renderMistakesGemini() {
  const rows = await api('/api/mistakes');
  clear(main);
  const view = h('div', { class: 'cg-mistakes-view' });
  main.append(view);

  const pendingCount = rows.filter((row) => row.status !== '已修复').length;
  const fixedCount = rows.filter((row) => row.status === '已修复').length;

  const moduleFilter = h('select', {}, h('option', { value: 'all' }, '全部模块'));
  [...new Set(rows.map((row) => row.module || '未分类'))].sort().forEach((name) => moduleFilter.append(h('option', { value: name }, name)));
  const patternFilter = h('select', {}, h('option', { value: 'all' }, '全部错因'));
  [...new Set(rows.map((row) => row.cause_primary).filter(Boolean))].sort().forEach((name) => patternFilter.append(h('option', { value: name }, name)));
  const statusFilter = h('select', {},
    h('option', { value: 'all' }, '全部状态'),
    h('option', { value: 'pending' }, '待复训'),
    h('option', { value: 'fixed' }, '已掌握'),
  );
  const list = h('div', { class: 'cg-mistake-list' });

  const redraw = async () => {
    clear(list);
    const filtered = rows.filter((row) => {
      if (moduleFilter.value !== 'all' && row.module !== moduleFilter.value) return false;
      if (patternFilter.value !== 'all' && row.cause_primary !== patternFilter.value) return false;
      if (statusFilter.value === 'pending' && row.status === '已修复') return false;
      if (statusFilter.value === 'fixed' && row.status !== '已修复') return false;
      return true;
    });
    if (!filtered.length) {
      list.append(h('div', { class: 'cg-empty-card' }, '当前筛选条件下无错题'));
      return;
    }
    filtered.forEach((row) => list.append(mistakeCard(row, rows, redraw)));
  };

  moduleFilter.onchange = redraw;
  patternFilter.onchange = redraw;
  statusFilter.onchange = redraw;

  view.append(
    h('div', { class: 'cg-mistakes-head' },
      h('div', {},
        h('h2', {}, '错题本与错误模式库'),
        h('p', {}, '不盲目题海战术，将错题归类为可复盘的错误模式，并通过周期复训逐步清零'),
      ),
      h('a', { class: 'cg-mistakes-review-entry', href: '/review' }, icon('review'), h('span', {}, `进入错题复训赛场 (${pendingCount})`)),
    ),
    h('div', { class: 'cg-mistake-metrics' },
      metric('累计收录错题', rows.length),
      metric('待复训与复验中', pendingCount, 'wrong'),
      metric('已固化掌握', fixedCount, 'correct'),
    ),
    h('div', { class: 'cg-mistake-filter-bar' },
      h('label', {}, h('span', {}, '错误模式:'), patternFilter),
      h('label', {}, h('span', {}, '模块:'), moduleFilter),
      h('label', {}, h('span', {}, '状态:'), statusFilter),
    ),
    list,
  );
  await redraw();
}
