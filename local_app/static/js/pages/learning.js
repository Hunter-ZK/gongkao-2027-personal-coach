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

function stat(label, value) {
  return h('div', { class: 'mini-stat' }, h('small', {}, label), h('strong', {}, String(value ?? '—')));
}

export async function renderTrainings() {
  const groups = await api('/api/trainings');
  clear(main).append(title('训练记录', '按训练来源拆分看正确率、用时和数据可信度；随机练习不等同于整卷成绩。', 'TRAINING LOG'));

  for (const [source, rows] of Object.entries(groups)) {
    const body = rows.map((x) => h(
      'tr',
      {},
      h('td', {}, x.trained_on),
      h('td', { class: 'num' }, x.total_q),
      h('td', { class: 'num' }, x.correct_q),
      h('td', { class: 'num' }, pct(x.total_q ? x.correct_q / x.total_q : null)),
      h('td', { class: 'num' }, x.duration_sec ? fmtSec(x.duration_sec) : '—'),
      h('td', {}, tag(x.data_confidence, x.data_confidence === 'verified' ? 'correct' : 'pending')),
    ));

    main.append(panel(
      source,
      tableWrap(h(
        'table',
        {},
        h('thead', {}, h('tr', {}, ...['日期', '题量', '正确', '正确率', '用时', '可信度'].map((x) => h('th', {}, x)))),
        h('tbody', {}, ...body),
      )),
    ));
  }

  if (!Object.keys(groups).length) {
    main.append(h('div', { class: 'empty' }, '还没有训练记录。可以上传 PDF，也可以手工录入。'));
  }
}

export async function renderQuestionBank() {
  const rows = await api('/api/question-bank');
  clear(main).append(title('题库', '同一道题只保留一个规范题目条目；每次实际作答单独记录，因此可以长期追踪重复练习表现。', 'QUESTION LIBRARY'));

  const moduleSelect = h('select', {}, h('option', { value: '' }, '全部模块'), ...['资料分析', '判断推理', '言语理解', '数量关系', '常识判断', '未分类'].map((x) => h('option', { value: x }, x)));
  const search = h('input', { placeholder: '搜索题干或题型' });
  const host = h('div', { class: 'bank-grid' });

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const filtered = rows.filter((row) => (!moduleSelect.value || row.module === moduleSelect.value) && (!q || `${row.stem_md || ''} ${row.subtype || ''}`.toLowerCase().includes(q)));
    clear(host);
    if (!filtered.length) {
      host.append(h('div', { class: 'empty' }, '当前筛选下没有题目。'));
      return;
    }
    filtered.forEach((row) => {
      const thumb = (row.images || [])[0] || (row.material_images || [])[0];
      host.append(h(
        'article',
        { class: 'bank-card' },
        h('div', { class: 'bank-meta' }, tag(row.module || '未分类'), row.subtype ? tag(row.subtype) : null, h('span', {}, `作答 ${row.attempt_count || 0} 次`), h('span', {}, `正确率 ${row.attempt_count ? pct(row.accuracy) : '—'}`)),
        h('h3', {}, row.stem_md || '题干以原图为准'),
        thumb ? h('img', { class: 'bank-thumb', src: imageSrc(thumb), loading: 'lazy' }) : null,
        h('div', { class: 'bank-answer' }, `参考答案：${row.correct_answer || '—'} · 最近作答：${row.last_attempted_on || '—'}`),
      ));
    });
  };
  moduleSelect.onchange = draw;
  search.oninput = draw;
  main.append(h('div', { class: 'bank-toolbar' }, moduleSelect, search), host);
  draw();
}

export async function renderMistakes() {
  const rows = await api('/api/mistakes');
  clear(main).append(title('错题矩阵', '先诊断错因，再做复训；新错题不会被系统随意编造原因。', 'MISTAKE SYSTEM'));

  if (!rows.length) {
    main.append(panel('错题列表', h('div', { class: 'empty' }, '还没有错题。上传一份训练 PDF，错题会在确认入库后进入这里。')));
    return;
  }

  const body = rows.map((x) => h(
    'tr',
    {},
    h('td', {}, x.module || '—'),
    h('td', {}, (x.stem_md || '').slice(0, 74)),
    h('td', {}, x.cause_primary || tag('待诊断', 'pending')),
    h('td', {}, tag(x.status, x.status === '已修复' ? 'correct' : 'pending')),
    h('td', {}, x.next_review_at || '—'),
    h('td', {}, x.standard_solution_md ? '已记录' : '待补充'),
  ));

  main.append(panel(
    '错题列表',
    tableWrap(h(
      'table',
      {},
      h('thead', {}, h('tr', {}, ...['模块', '题干', '错因', '状态', '下次复训', '解法'].map((x) => h('th', {}, x)))),
      h('tbody', {}, ...body),
    )),
  ));
}

let currentReview = null;
let reviewStart = 0;
let selectedAnswer = '';

export function setReviewAnswer(answer) {
  selectedAnswer = answer;
  document.querySelectorAll('.review-option').forEach((b) => b.classList.toggle('selected', b.dataset.key === selectedAnswer));
}

export async function renderReview() {
  const rows = await api('/api/review/queue?scope=due');
  clear(main).append(title('错题复训', '真实作答、独立计时，提交后才展开答案和标准解法。', 'REVIEW LOOP'));

  if (!rows.length) {
    main.append(h('div', { class: 'empty' }, '今天没有到期错题。'));
    return;
  }

  currentReview = currentReview && rows.some((x) => x.id === currentReview.id) ? currentReview : rows[0];
  selectedAnswer = '';
  reviewStart = Date.now();

  const list = h(
    'div',
    { class: 'panel review-list' },
    ...rows.map((x) => h('button', { class: 'text-btn', onclick: () => { currentReview = x; renderReview(); } }, `${x.module || '未分类'} · #${x.id}`)),
  );

  const q = currentReview;
  const opts = typeof q.options === 'object' ? q.options : JSON.parse(q.options_json || '{}');
  const optionImages = q.option_images || {};
  const options = Object.entries(opts).map(([key, value]) => h(
    'button',
    { class: 'review-option', 'data-key': key, onclick: () => setReviewAnswer(key) },
    h('span', {}, `${key}. ${value || (optionImages[key] ? '' : '[图片选项]')}`),
    optionImages[key] ? h('img', { src: imageSrc(optionImages[key]), loading: 'lazy', style: 'display:block;max-width:100%;margin-top:8px' }) : null,
  ));

  const result = h('div', { id: 'review-result' });
  const middle = h(
    'div',
    { class: 'panel' },
    h('span', { class: 'eyebrow' }, q.module || '未分类'),
    h('h2', {}, q.stem_md || '题干缺失'),
    q.images?.length ? imageStack(q.images) : null,
    h('div', { id: 'review-options' }, ...options),
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'primary', onclick: async () => {
        if (!selectedAnswer) return alert('先选择答案');
        const res = await jpost(`/api/review/${q.id}/submit`, {
          answer: selectedAnswer,
          duration_sec: Math.round((Date.now() - reviewStart) / 1000),
        });
        result.replaceChildren(
          h('h3', {}, res.is_correct ? '本次答对' : '本次答错'),
          h('p', {}, `你的答案 ${selectedAnswer} · 正确答案 ${res.correct_answer}`),
          h('p', {}, res.standard_solution_md || ''),
          h('p', { class: 'subtle' }, `下次复训：${res.next_review_at || '—'}`),
        );
      } }, '提交答案'),
    ),
    result,
  );

  const right = h(
    'div',
    { class: 'panel' },
    h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, '答题卡')),
    h('div', { class: 'answer-grid' }, ...rows.map((_, i) => h('div', { class: 'bubble' }, i + 1))),
    h('p', { class: 'subtle' }, `今日到期 ${rows.length} 题`),
  );

  main.append(h('div', { class: 'review-layout' }, list, middle, right));
}

export async function renderImport() {
  clear(main).append(title('真题智能导入', '已针对粉笔“快速智能练习”真实版式解析：题干、选项、图表、正确答案和你的作答会一起保存。未知格式仍强制人工复核。', 'PDF IMPORT'));

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

  main.append(
    h(
      'section',
      { class: 'import-hero' },
      h('div', { class: 'import-icon' }, '⇧'),
      h('h3', {}, '导入真实训练结果'),
      h('p', {}, '已识别的粉笔标准版式可按答案字段自动核验；任何结构不完整或未知版式仍需人工确认后才进入统计。'),
      h('div', { class: 'actions', style: 'justify-content:center' }, input, upload),
      msg,
    ),
    h('div', { id: 'proof-host', style: 'margin-top:18px' }),
  );
}

function optionBlocks(q) {
  const options = q.options || {};
  const images = q.option_images || {};
  return h('div', { class: 'proof-options' }, ...['A', 'B', 'C', 'D'].filter((key) => key in options || images[key]).map((key) => h(
    'div',
    { class: 'proof-option' },
    h('strong', {}, `${key}.`),
    options[key] || '',
    images[key] ? h('img', { src: imageSrc(images[key]), loading: 'lazy' }) : null,
  )));
}

async function showProof(id) {
  const d = await api(`/api/import/${id}/proof`);
  const host = document.querySelector('#proof-host');

  const dateInput = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10), id: 'proof-date' });
  const dur = h('input', { type: 'number', min: '0', placeholder: '可留空', id: 'proof-dur' });
  const source = h(
    'select',
    { id: 'proof-source' },
    ...[
      ['fenbi_random', '粉笔随机练习'],
      ['special', '专项练习'],
      ['mock', '模考'],
      ['gd_real', '广东真题'],
      ['national_real', '国考真题'],
    ].map(([value, text]) => h('option', { value }, text)),
  );

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
    if (q.images?.length) {
      sourcePane.append(h('div', { class: 'proof-material' }, h('h4', {}, `第 ${q.seq} 题原版截图`), imageStack(q.images)));
    }

    if (q.verified) confirmBtn.disabled = true;
    confirmBtn.onclick = async () => {
      await jpatch(`/api/import/${id}/question/${q.seq}`, {
        module: mod.value,
        stem_md: stem.value,
        user_answer: ua.value || null,
        correct_answer: ca.value || null,
        verified: true,
      });
      await showProof(id);
    };
    const editToggle = h('button', { class: 'text-btn proof-edit-toggle', onclick: () => card.classList.toggle('editing') }, '编辑解析结果');

    card.append(
      h('div', { class: 'proof-head-v2' }, h('strong', {}, `第 ${q.seq} 题 · ${q.module || '未分类'}`), h('div', {}, q.is_correct === 0 ? tag('本题做错', 'wrong') : tag('本题做对', 'correct'))),
      h('div', { class: 'proof-status-line' }, tag(`解析置信 ${Math.round(q.parse_confidence * 100)}%`), q.verified ? tag(autoVerified ? '版式已核验' : '人工已确认', 'correct') : tag('待复核', 'pending'), h('span', { class: 'subtle' }, `你的答案 ${q.user_answer || '—'} · 正确答案 ${q.correct_answer || '—'}`)),
      h('p', {}, q.stem_md || '题干以原版截图为准'),
      optionBlocks(q),
      editToggle,
      h('div', { class: 'proof-edit' },
        h('div', { class: 'form-row' },
          h('div', { class: 'field' }, h('label', {}, '模块'), mod),
          h('div', { class: 'field' }, h('label', {}, '作答'), ua),
          h('div', { class: 'field' }, h('label', {}, '正确答案'), ca),
        ),
        h('div', { class: 'field' }, h('label', {}, '题干'), stem),
        confirmBtn,
      ),
    );
    return card;
  });

  host.replaceChildren(panel(
    '导入校对与入库',
    h('div', { class: 'import-summary' }, stat('识别题数', d.questions.length), stat('已核验', d.verified_count), stat('做对', d.correct_count), stat('做错', d.wrong_count)),
    h(
      'div',
      { class: 'form-row' },
      h('div', { class: 'field' }, h('label', {}, '训练日期'), dateInput),
      h('div', { class: 'field' }, h('label', {}, '整组用时（秒，可留空；PDF 未提供用时时保持未知）'), dur),
      h('div', { class: 'field' }, h('label', {}, '训练来源'), source),
    ),
    h('div', { class: 'proof-layout-v2' }, sourcePane, h('div', {}, ...questionCards)),
    h(
      'div',
      { class: 'actions' },
      d.all_verified ? null : h('button', { class: 'secondary', onclick: async () => {
        if (!confirm('仅在你已浏览所有待确认题后使用批量确认。继续？')) return;
        await jpost(`/api/import/${id}/confirm`, { seq_list: d.questions.filter((q) => !q.verified).map((q) => q.seq) });
        await showProof(id);
      } }, '人工核对后确认剩余题'),
      h('button', { class: 'primary', onclick: async () => {
        try {
          const res = await jpost(`/api/import/${id}/commit`, {
            trained_on: dateInput.value,
            duration_sec: Number(dur.value || 0),
            source: source.value,
            exam_type: 'na',
          });
          alert(`已入库：题库 ${res.question_bank_items || d.questions.length} 题，个人作答 ${res.attempts_created || d.questions.length} 条，新增错题 ${res.mistakes_created}`);
          location.href = '/trainings';
        } catch (e) {
          alert(e.message);
        }
      } }, d.all_verified ? '直接入库' : '确认并入库'),
    ),
  ));
}
