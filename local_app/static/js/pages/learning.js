import {
  api,
  jpost,
  jpatch,
  main,
  clear,
  h,
  pct,
  fmtSec,
  tag,
  title,
  panel,
  tableWrap,
} from '../runtime.js';

const SOURCE_LABELS = {
  fenbi_random: '粉笔随机练习',
  special: '专项练习',
  mock: '模考',
  gd_real: '广东真题',
  national_real: '国考真题',
  full_paper_gd: '广东整卷',
  full_paper_national: '国考整卷',
  other: '其他',
};

function imageSrc(ref) {
  if (!ref) return '';
  const raw = String(ref).replaceAll('\\', '/');
  if (raw.startsWith('/data-images/')) return raw;
  const marker = '/data/images/';
  if (raw.includes(marker)) return `/data-images/${raw.split(marker).pop()}`;
  if (raw.startsWith('data/images/')) return `/data-images/${raw.slice('data/images/'.length)}`;
  return `/data-images/${raw.replace(/^\/+/, '')}`;
}

function imageStack(refs = [], cls = 'proof-image-stack') {
  return h('div', { class: cls }, ...refs.filter(Boolean).map((ref) => h('img', { class: 'proof-image', src: imageSrc(ref), loading: 'lazy' })));
}

function stat(label, value, caption = '') {
  return h('div', { class: 'mini-stat' }, h('small', {}, label), h('strong', {}, String(value ?? '—')), caption ? h('span', {}, caption) : null);
}

function sourceLabel(value) {
  return SOURCE_LABELS[value] || value || '未标注';
}

function trainingTabs(active) {
  return h('nav', { class: 'subview-tabs', 'aria-label': '训练工作区' },
    h('a', { href: '/trainings', class: active === 'records' ? 'active' : '' }, '训练记录'),
    h('a', { href: '/trainings?view=bank', class: active === 'bank' ? 'active' : '' }, '题库'),
  );
}

export async function renderTrainings(initialView = null) {
  const view = initialView || (new URLSearchParams(location.search).get('view') === 'bank' ? 'bank' : 'records');
  clear(main).append(
    title('训练与题库', '一次训练保留整组表现；同一道题在题库中只保留一个规范条目，每次作答单独留痕。'),
    trainingTabs(view),
  );
  if (view === 'bank') return renderQuestionBankBody();
  return renderTrainingRecordsBody();
}

async function renderTrainingRecordsBody() {
  const groups = await api('/api/trainings');
  const rows = Object.entries(groups).flatMap(([source, items]) => items.map((item) => ({ ...item, source: item.source || source })));
  rows.sort((a, b) => `${b.trained_on}-${b.id}`.localeCompare(`${a.trained_on}-${a.id}`));
  const totalQ = rows.reduce((sum, row) => sum + Number(row.total_q || 0), 0);
  const correctQ = rows.reduce((sum, row) => sum + Number(row.correct_q || 0), 0);
  const totalSec = rows.reduce((sum, row) => sum + Number(row.duration_sec || 0), 0);

  main.append(h('div', { class: 'training-summary-strip' },
    stat('训练次数', rows.length, '已确认入库'),
    stat('累计题量', totalQ, '真实作答记录'),
    stat('总体正确率', totalQ ? pct(correctQ / totalQ) : '—', totalQ ? `${correctQ}/${totalQ}` : '暂无训练'),
    stat('累计用时', totalSec ? fmtSec(totalSec) : '—', '仅统计已记录用时'),
  ));

  if (!rows.length) {
    main.append(h('div', { class: 'study-empty-state large' }, h('strong', {}, '还没有训练记录'), h('span', {}, '导入一份真实练习结果后，这里会建立长期训练账本。'), h('a', { class: 'primary', href: '/import' }, '导入训练结果')));
    return;
  }

  const sourceSelect = h('select', {}, h('option', { value: '' }, '全部来源'), ...[...new Set(rows.map((x) => x.source))].map((x) => h('option', { value: x }, sourceLabel(x))));
  const search = h('input', { placeholder: '搜索日期、来源或备注' });
  const host = h('div');
  const draw = () => {
    const query = search.value.trim().toLowerCase();
    const filtered = rows.filter((row) => (!sourceSelect.value || row.source === sourceSelect.value) && (!query || `${row.trained_on} ${sourceLabel(row.source)} ${row.note || ''}`.toLowerCase().includes(query)));
    const body = filtered.map((row) => h('tr', { class: 'training-row' },
      h('td', {}, row.trained_on),
      h('td', {}, sourceLabel(row.source)),
      h('td', { class: 'num' }, row.total_q),
      h('td', { class: 'num' }, row.correct_q),
      h('td', { class: 'num' }, pct(row.total_q ? row.correct_q / row.total_q : null)),
      h('td', { class: 'num' }, row.duration_sec ? fmtSec(row.duration_sec) : '—'),
      h('td', {}, tag(row.data_confidence === 'verified' ? '已核验' : row.data_confidence || '待核验', row.data_confidence === 'verified' ? 'correct' : 'pending')),
      h('td', {}, row.note || '—'),
    ));
    clear(host).append(tableWrap(h('table', {}, h('thead', {}, h('tr', {}, ...['日期','来源','题量','正确','正确率','用时','数据状态','备注'].map((x) => h('th', {}, x)))), h('tbody', {}, ...body))));
  };
  sourceSelect.onchange = draw;
  search.oninput = draw;
  main.append(h('div', { class: 'study-toolbar' }, h('div', { class: 'study-filter-group' }, sourceSelect), h('div', { class: 'study-search' }, search), h('a', { class: 'secondary', href: '/import' }, '导入新训练')), host);
  draw();
}

async function renderQuestionBankBody() {
  const rows = await api('/api/question-bank');
  const attempts = rows.reduce((sum, row) => sum + Number(row.attempt_count || 0), 0);
  const wrong = rows.reduce((sum, row) => sum + Number(row.wrong_count || 0), 0);
  const repeated = rows.filter((row) => Number(row.attempt_count || 0) >= 2).length;
  main.append(h('div', { class: 'training-summary-strip' },
    stat('题库题目', rows.length, '去重后的规范题目'),
    stat('作答记录', attempts, '每次作答独立保存'),
    stat('历史错误', wrong, '含重复做错'),
    stat('重复练习题', repeated, '作答至少 2 次'),
  ));

  if (!rows.length) {
    main.append(h('div', { class: 'study-empty-state large' }, h('strong', {}, '题库还是空的'), h('span', {}, '确认导入训练后，题目会自动去重并进入题库。')));
    return;
  }

  const moduleSelect = h('select', {}, h('option', { value: '' }, '全部模块'), ...[...new Set(rows.map((x) => x.module || '未分类'))].sort().map((x) => h('option', { value: x }, x)));
  const search = h('input', { placeholder: '搜索题干或题型' });
  const listHost = h('div', { class: 'question-bank-list' });
  const detailHost = h('article', { class: 'question-bank-detail' });
  let selectedId = rows[0].id;

  const drawList = async () => {
    const q = search.value.trim().toLowerCase();
    const filtered = rows.filter((row) => (!moduleSelect.value || (row.module || '未分类') === moduleSelect.value) && (!q || `${row.stem_md || ''} ${row.subtype || ''}`.toLowerCase().includes(q)));
    clear(listHost);
    if (!filtered.length) {
      listHost.append(h('div', { class: 'study-empty-state compact' }, h('strong', {}, '没有匹配题目')));
      clear(detailHost);
      return;
    }
    if (!filtered.some((row) => row.id === selectedId)) selectedId = filtered[0].id;
    filtered.forEach((row) => listHost.append(h('button', { class: `question-bank-row ${row.id === selectedId ? 'active' : ''}`, onclick: async () => { selectedId = row.id; await drawList(); await drawDetail(row.id); } },
      h('span', { class: 'question-bank-id' }, `#${row.id}`),
      h('span', { class: 'question-bank-copy' }, h('strong', {}, row.stem_md || '题干以原图为准'), h('small', {}, `${row.module || '未分类'}${row.subtype ? ` · ${row.subtype}` : ''}`)),
      h('span', { class: 'question-bank-performance' }, h('b', {}, row.attempt_count ? pct(row.accuracy) : '—'), h('small', {}, `${row.attempt_count || 0} 次`)),
    )));
  };

  const drawDetail = async (id) => {
    const row = await api(`/api/question-bank/${id}`);
    clear(detailHost);
    const visual = (row.images || []).length ? row.images : row.material_images || [];
    const optionNodes = ['A','B','C','D'].filter((key) => key in (row.options || {}) || row.option_images?.[key]).map((key) => h('div', { class: `bank-option ${key === row.correct_answer ? 'is-correct' : ''}` }, h('span', { class: 'option-letter' }, key), h('div', {}, row.options?.[key] || '', row.option_images?.[key] ? h('img', { src: imageSrc(row.option_images[key]), loading: 'lazy' }) : null)));
    const attemptRows = (row.attempts || []).map((attempt) => h('tr', {}, h('td', {}, attempt.attempted_on || '—'), h('td', {}, sourceLabel(attempt.source)), h('td', { class: 'num' }, attempt.user_answer || '—'), h('td', { class: 'num' }, attempt.correct_answer || row.correct_answer || '—'), h('td', {}, tag(attempt.is_correct ? '正确' : '错误', attempt.is_correct ? 'correct' : 'wrong')), h('td', { class: 'num' }, attempt.duration_sec ? fmtSec(attempt.duration_sec) : '—')));
    detailHost.append(
      h('header', { class: 'question-bank-detail-head' }, h('div', {}, tag(row.module || '未分类'), row.subtype ? tag(row.subtype) : null, h('h2', {}, `题库 #${row.id}`), h('p', { class: 'subtle' }, `首次收录 ${row.first_seen_at || '—'} · 参考答案 ${row.correct_answer || '—'}`))),
      h('section', { class: 'bank-question-sheet' }, h('h3', {}, row.stem_md || '题干以原图为准'), visual.length ? imageStack(visual, 'mistake-image-stack') : null, h('div', { class: 'mistake-options-grid' }, ...optionNodes)),
      h('section', { class: 'bank-attempt-history' }, h('div', { class: 'section-title-row' }, h('h3', {}, '个人作答记录'), h('span', { class: 'subtle' }, `${(row.attempts || []).length} 次`)), attemptRows.length ? tableWrap(h('table', {}, h('thead', {}, h('tr', {}, ...['日期','来源','我的答案','正确答案','结果','用时'].map((x) => h('th', {}, x)))), h('tbody', {}, ...attemptRows))) : h('div', { class: 'empty compact' }, '还没有个人作答记录。')),
    );
  };

  moduleSelect.onchange = drawList;
  search.oninput = drawList;
  main.append(h('div', { class: 'study-toolbar' }, h('div', { class: 'study-filter-group' }, moduleSelect), h('div', { class: 'study-search' }, search)), h('div', { class: 'question-bank-workspace' }, listHost, detailHost));
  await drawList();
  await drawDetail(selectedId);
}

export async function renderQuestionBank() {
  history.replaceState(null, '', '/trainings?view=bank');
  return renderTrainings('bank');
}

export async function renderImport() {
  clear(main).append(title('导入', '针对粉笔“快速智能练习”真实版式解析：题干、选项、图表、正确答案和你的作答一起保存。未知格式仍强制人工复核。'));
  const input = h('input', { type: 'file', accept: '.pdf', id: 'pdf-file' });
  const msg = h('div', { class: 'subtle' });
  const upload = h('button', { class: 'primary', onclick: async () => {
    if (!input.files[0]) return alert('请先选择 PDF');
    const fd = new FormData();
    fd.append('file', input.files[0]);
    msg.textContent = '正在解析 PDF…';
    try {
      const res = await api('/api/import/pdf', { method: 'POST', body: fd });
      msg.textContent = res.message || '解析完成';
      await showProof(res.import_id);
    } catch (e) {
      msg.textContent = e.message;
    }
  } }, '开始解析');
  main.append(h('section', { class: 'import-hero' }, h('h3', {}, '导入真实训练结果'), h('p', {}, '标准粉笔版式可按答案字段自动核验；结构不完整或未知版式必须人工确认后才进入统计。'), h('div', { class: 'actions', style: 'justify-content:center' }, input, upload), msg), h('div', { id: 'proof-host', style: 'margin-top:18px' }));
}

function optionBlocks(q) {
  const options = q.options || {};
  const images = q.option_images || {};
  return h('div', { class: 'proof-options' }, ...['A', 'B', 'C', 'D'].filter((key) => key in options || images[key]).map((key) => h('div', { class: 'proof-option' }, h('strong', {}, `${key}.`), options[key] || '', images[key] ? h('img', { src: imageSrc(images[key]), loading: 'lazy' }) : null)));
}

async function showProof(id) {
  const d = await api(`/api/import/${id}/proof`);
  const host = document.querySelector('#proof-host');
  const dateInput = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10), id: 'proof-date' });
  const dur = h('input', { type: 'number', min: '0', placeholder: '可留空', id: 'proof-dur' });
  const source = h('select', { id: 'proof-source' }, ...[
    ['fenbi_random', '粉笔随机练习'], ['special', '专项练习'], ['mock', '模考'], ['gd_real', '广东真题'], ['national_real', '国考真题'],
  ].map(([value, text]) => h('option', { value }, text)));
  const modules = ['政治理论', '常识判断', '常识应用', '言语理解', '数量关系', '数字推理', '数学运算', '判断推理', '图形推理', '逻辑判断', '科学推理', '资料分析', '未分类'];
  const materialById = new Map(d.materials.map((m) => [m.id, m]));
  const materialFirst = new Set();
  const sourcePane = h('div', { class: 'proof-source-pane' }, h('h3', {}, '原 PDF 版式证据'));

  const questionCards = d.questions.map((q) => {
    const mod = h('select', {}, ...modules.map((x) => h('option', { value: x, selected: (q.module || '未分类') === x }, x)));
    const stem = h('textarea', { rows: '4' }, q.stem_md || '');
    const ua = h('input', { value: q.user_answer || '', placeholder: '作答' });
    const ca = h('input', { value: q.correct_answer || '', placeholder: '正确答案' });
    const autoVerified = Boolean(q.verified && q.signals?.auto_verified);
    const confirmBtn = h('button', { class: 'secondary' }, q.verified ? (autoVerified ? '已由粉笔版式核验' : '已确认') : '保存并确认');
    const card = h('div', { class: 'proof-q-v2', 'data-low': q.parse_confidence < 0.7 ? 'true' : 'false', 'data-wrong': q.is_correct === 0 ? 'true' : 'false' });
    const material = materialById.get(q.material_id);
    if (material && !materialFirst.has(material.id)) {
      materialFirst.add(material.id);
      sourcePane.append(h('div', { class: 'proof-material' }, h('h4', {}, `资料组 · 关联第 ${q.seq} 题起`), material.text_md ? h('p', {}, material.text_md) : null, imageStack(material.images || [])));
    }
    if (q.images?.length) sourcePane.append(h('div', { class: 'proof-material' }, h('h4', {}, `第 ${q.seq} 题原版截图`), imageStack(q.images)));
    if (q.verified) confirmBtn.disabled = true;
    confirmBtn.onclick = async () => {
      await jpatch(`/api/import/${id}/question/${q.seq}`, { module: mod.value, stem_md: stem.value, user_answer: ua.value || null, correct_answer: ca.value || null, verified: true });
      await showProof(id);
    };
    const editToggle = h('button', { class: 'text-btn proof-edit-toggle', onclick: () => card.classList.toggle('editing') }, '编辑解析结果');
    card.append(
      h('div', { class: 'proof-head-v2' }, h('strong', {}, `第 ${q.seq} 题 · ${q.module || '未分类'}`), h('div', {}, q.is_correct === 0 ? tag('本题做错', 'wrong') : tag('本题做对', 'correct'))),
      h('div', { class: 'proof-status-line' }, tag(`解析置信 ${Math.round(q.parse_confidence * 100)}%`), q.verified ? tag(autoVerified ? '版式已核验' : '人工已确认', 'correct') : tag('待复核', 'pending'), h('span', { class: 'subtle' }, `你的答案 ${q.user_answer || '—'} · 正确答案 ${q.correct_answer || '—'}`)),
      h('p', {}, q.stem_md || '题干以原版截图为准'), optionBlocks(q), editToggle,
      h('div', { class: 'proof-edit' }, h('div', { class: 'form-row' }, h('div', { class: 'field' }, h('label', {}, '模块'), mod), h('div', { class: 'field' }, h('label', {}, '作答'), ua), h('div', { class: 'field' }, h('label', {}, '正确答案'), ca)), h('div', { class: 'field' }, h('label', {}, '题干'), stem), confirmBtn),
    );
    return card;
  });

  host.replaceChildren(panel('导入校对与入库',
    h('div', { class: 'import-summary' }, stat('识别题数', d.questions.length), stat('已核验', d.verified_count), stat('做对', d.correct_count), stat('做错', d.wrong_count)),
    h('div', { class: 'form-row' }, h('div', { class: 'field' }, h('label', {}, '训练日期'), dateInput), h('div', { class: 'field' }, h('label', {}, '整组用时（秒，可留空）'), dur), h('div', { class: 'field' }, h('label', {}, '训练来源'), source)),
    h('div', { class: 'proof-layout-v2' }, sourcePane, h('div', {}, ...questionCards)),
    h('div', { class: 'actions' },
      d.all_verified ? null : h('button', { class: 'secondary', onclick: async () => { if (!confirm('仅在你已浏览所有待确认题后使用批量确认。继续？')) return; await jpost(`/api/import/${id}/confirm`, { seq_list: d.questions.filter((q) => !q.verified).map((q) => q.seq) }); await showProof(id); } }, '人工核对后确认剩余题'),
      h('button', { class: 'primary', onclick: async () => {
        try {
          const res = await jpost(`/api/import/${id}/commit`, { trained_on: dateInput.value, duration_sec: Number(dur.value || 0), source: source.value, exam_type: 'na' });
          alert(`已入库：题库 ${res.question_bank_items || d.questions.length} 题，个人作答 ${res.attempts_created || d.questions.length} 条，新增错题 ${res.mistakes_created}`);
          location.href = '/trainings';
        } catch (e) { alert(e.message); }
      } }, d.all_verified ? '直接入库' : '确认并入库'),
    ),
  ));
}
