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

const MISTAKE_CAUSES = ['审题错误','主体错误','时间错误','单位错误','题型识别错误','方法选择错误','公式调用错误','推理链遗漏','计算错误','速度问题','取舍问题','知识缺口','方法生疏','偶发失误'];

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

function compact(text, max = 118) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function summaryTile(label, value, caption, tone = '') {
  return h('div', { class: `mistake-summary-tile ${tone}` }, h('span', {}, label), h('strong', {}, value), h('small', {}, caption));
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isDue(row) {
  return !row.next_review_at || String(row.next_review_at).slice(0, 10) <= todayIso();
}

function statusTone(status) {
  if (status === '已修复') return 'correct';
  if (status === '反复错') return 'wrong';
  return 'pending';
}

function optionEntries(row) {
  const opts = typeof row.options === 'object' && row.options ? row.options : JSON.parse(row.options_json || '{}');
  const images = row.option_images || {};
  return ['A','B','C','D'].filter((key) => key in opts || images[key]).map((key) => [key, opts[key] || '', images[key]]);
}

export async function renderMistakes() {
  const rows = await api('/api/mistakes');
  clear(main).append(title('错题本', '不再把错题当表格记录。每一道错题都应该能看见：错在哪里、怎么修、什么时候再练。', 'MISTAKE WORKSPACE'));

  if (!rows.length) {
    main.append(h('div', { class: 'study-empty-state large standalone' }, h('strong', {}, '还没有错题'), h('span', {}, '导入训练 PDF 或完成练习后，真实错题会自动进入这里。'), h('a', { class: 'primary', href: '/import' }, '导入训练结果')));
    return;
  }

  const due = rows.filter(isDue).length;
  const undiagnosed = rows.filter((x) => !x.cause_primary).length;
  const recurring = rows.filter((x) => x.status === '反复错').length;
  const fixed = rows.filter((x) => x.status === '已修复').length;
  const modules = [...new Set(rows.map((x) => x.module || '未分类'))].sort();

  main.append(h('section', { class: 'mistake-summary-grid' },
    summaryTile('全部错题', rows.length, '长期保留真实错误'),
    summaryTile('今日到期', due, '建议优先处理', due ? 'is-amber' : ''),
    summaryTile('待诊断', undiagnosed, '还没有明确错因', undiagnosed ? 'is-indigo' : ''),
    summaryTile('反复错误', recurring, '需要改变策略而非重复刷', recurring ? 'is-red' : ''),
    summaryTile('已修复', fixed, '连续复训通过', fixed ? 'is-green' : ''),
  ));

  const search = h('input', { class: 'study-search-input', placeholder: '搜索题干、题型、错因…' });
  const moduleSelect = h('select', { class: 'study-filter-select' }, h('option', { value: '全部' }, '全部模块'), ...modules.map((x) => h('option', { value: x }, x)));
  const statusSelect = h('select', { class: 'study-filter-select' },
    ...['全部状态','待复训','修复中','反复错','已修复'].map((x) => h('option', { value: x }, x)),
  );
  const dueOnly = h('label', { class: 'filter-check' }, h('input', { type: 'checkbox' }), h('span', {}, '仅看今日到期'));
  const count = h('span', { class: 'study-result-count' }, `${rows.length} 道`);
  main.append(h('div', { class: 'study-toolbar mistake-toolbar' },
    h('div', { class: 'study-search' }, h('span', {}, '⌕'), search),
    h('div', { class: 'study-filter-group' }, moduleSelect, statusSelect, dueOnly),
    count,
  ));

  const listHost = h('aside', { class: 'mistake-list-pane', id: 'mistake-list-pane' });
  const detailHost = h('article', { class: 'mistake-detail-pane', id: 'mistake-detail-pane' });
  main.append(h('div', { class: 'mistake-workspace' }, listHost, detailHost));

  let selectedId = rows[0].id;

  const filteredRows = () => {
    const q = search.value.trim().toLowerCase();
    return rows.filter((x) => {
      if (moduleSelect.value !== '全部' && (x.module || '未分类') !== moduleSelect.value) return false;
      if (statusSelect.value !== '全部状态' && x.status !== statusSelect.value) return false;
      if (dueOnly.querySelector('input').checked && !isDue(x)) return false;
      if (q && !`${x.stem_md || ''} ${x.subtype || ''} ${x.cause_primary || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  };

  const drawList = async () => {
    const filtered = filteredRows();
    count.textContent = `${filtered.length} 道`;
    clear(listHost);
    if (!filtered.length) {
      listHost.append(h('div', { class: 'study-empty-state compact' }, h('strong', {}, '没有匹配错题'), h('span', {}, '调整筛选条件后再试。')));
      clear(detailHost).append(h('div', { class: 'study-empty-state large' }, h('strong', {}, '暂无可查看内容')));
      return;
    }
    if (!filtered.some((x) => x.id === selectedId)) selectedId = filtered[0].id;
    filtered.forEach((x) => listHost.append(h('button', {
      class: `mistake-list-card ${x.id === selectedId ? 'active' : ''}`,
      onclick: async () => { selectedId = x.id; await drawList(); await drawDetail(x.id); },
    },
      h('div', { class: 'mistake-list-top' }, h('div', {}, tag(x.module || '未分类'), x.subtype ? h('span', { class: 'micro-label' }, x.subtype) : null), tag(x.status || '待复训', statusTone(x.status))),
      h('p', { class: 'mistake-list-stem' }, compact(x.stem_md, 105)),
      h('div', { class: 'mistake-list-bottom' },
        h('span', { class: x.cause_primary ? '' : 'needs-diagnosis' }, x.cause_primary || '待诊断错因'),
        h('span', {}, isDue(x) ? '今天复训' : `下次 ${String(x.next_review_at || '待定').slice(0, 10)}`),
      ),
    )));
  };

  const drawDetail = async (id) => {
    const x = await api(`/api/mistakes/${id}`);
    clear(detailHost);
    const cause = h('select', { class: 'study-filter-select mistake-edit-select' },
      h('option', { value: '' }, '请选择主要错因'),
      ...MISTAKE_CAUSES.map((name) => h('option', { value: name, selected: x.cause_primary === name }, name)),
    );
    const causeNote = h('textarea', { rows: '3', placeholder: '记录这次为什么会错：当时看到什么、怎么判断、在哪一步偏离…' }, x.cause_note || '');
    const standard = h('textarea', { rows: '5', placeholder: '记录一套稳定、可复现的标准解法。' }, x.standard_solution_md || '');
    const fastest = h('textarea', { rows: '4', placeholder: '如有更快路径，写在这里。' }, x.fastest_solution_md || '');
    const conditions = h('textarea', { rows: '2', placeholder: '最快解法成立的前提或边界。' }, x.fastest_conditions || '');
    const trap = h('textarea', { rows: '3', placeholder: '这道题最容易把你带偏的命题陷阱是什么？' }, x.trap || '');

    const options = optionEntries(x).map(([key, value, img]) => {
      const cls = ['mistake-option-card'];
      if (key === x.correct_answer) cls.push('is-correct');
      if (key === x.user_answer && x.user_answer !== x.correct_answer) cls.push('is-wrong');
      return h('div', { class: cls.join(' ') },
        h('span', { class: 'option-letter' }, key),
        h('div', { class: 'option-copy' }, value ? h('span', {}, value) : null, img ? h('img', { src: imageSrc(img), loading: 'lazy' }) : null),
        key === x.correct_answer ? h('span', { class: 'option-badge correct' }, '正确') : key === x.user_answer ? h('span', { class: 'option-badge wrong' }, '你的选择') : null,
      );
    });

    detailHost.append(
      h('header', { class: 'mistake-detail-head' },
        h('div', {},
          h('div', { class: 'mistake-detail-kicker' }, tag(x.module || '未分类'), x.subtype ? tag(x.subtype) : null, tag(x.status || '待复训', statusTone(x.status))),
          h('h2', {}, `错题 #${x.id}`),
          h('p', {}, `首次错误 ${String(x.first_wrong_at || '—').slice(0, 10)} · 已复训 ${x.review_count || 0} 次 · 下次 ${String(x.next_review_at || '待定').slice(0, 10)}`),
        ),
        h('div', { class: 'mistake-detail-actions' }, h('a', { class: 'primary', href: '/review' }, '进入复训'), h('a', { class: 'secondary', href: '/coach' }, '✦ AI 诊断')),
      ),
      h('section', { class: 'mistake-question-card' },
        h('span', { class: 'study-overline' }, '原题'),
        h('h3', {}, x.stem_md || '题干以原始图片为准'),
        x.images?.length ? imageStack(x.images, 'mistake-image-stack') : null,
        h('div', { class: 'mistake-options-grid' }, ...options),
        h('div', { class: 'answer-compare' },
          h('div', { class: 'answer-box wrong' }, h('span', {}, '当时作答'), h('strong', {}, x.user_answer || '—')),
          h('div', { class: 'answer-arrow' }, '→'),
          h('div', { class: 'answer-box correct' }, h('span', {}, '正确答案'), h('strong', {}, x.correct_answer || '—')),
        ),
      ),
      h('section', { class: 'mistake-diagnosis-grid' },
        h('article', { class: 'diagnosis-card primary-card' },
          h('span', { class: 'study-overline' }, '错误诊断'),
          h('h3', {}, x.cause_primary || '还没有诊断主要错因'),
          h('p', {}, x.cause_note || '不要急着写“粗心”。优先定位到审题、识别、方法、推理、计算、速度或知识等具体故障。'),
        ),
        h('article', { class: 'diagnosis-card' }, h('span', { class: 'study-overline' }, '标准解法'), h('p', {}, x.standard_solution_md || '尚未记录稳定解法。')),
        h('article', { class: 'diagnosis-card' }, h('span', { class: 'study-overline' }, '最快路径'), h('p', {}, x.fastest_solution_md || '尚未记录更快路径。'), x.fastest_conditions ? h('small', {}, `适用条件：${x.fastest_conditions}`) : null),
        h('article', { class: 'diagnosis-card risk-card' }, h('span', { class: 'study-overline' }, '命题陷阱'), h('p', {}, x.trap || '尚未记录这道题的干扰方式。')),
      ),
      h('details', { class: 'mistake-editor' },
        h('summary', {}, h('div', {}, h('strong', {}, '编辑错因与解法'), h('small', {}, '把“做错了”变成以后可复用的修复规则')), h('span', {}, '展开编辑')),
        h('div', { class: 'mistake-editor-body' },
          h('div', { class: 'form-row' }, h('div', { class: 'field' }, h('label', {}, '主要错因'), cause), h('div', { class: 'field grow2' }, h('label', {}, '错因说明'), causeNote)),
          h('div', { class: 'field' }, h('label', {}, '标准解法'), standard),
          h('div', { class: 'form-row' }, h('div', { class: 'field grow2' }, h('label', {}, '最快解法'), fastest), h('div', { class: 'field' }, h('label', {}, '适用条件'), conditions)),
          h('div', { class: 'field' }, h('label', {}, '命题陷阱 / 下次提醒'), trap),
          h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: async () => {
            if (fastest.value.trim() && !conditions.value.trim()) return alert('填写最快解法时，需要同时写明适用条件。');
            const updated = await jpatch(`/api/mistakes/${x.id}`, {
              cause_primary: cause.value || null,
              cause_note: causeNote.value.trim() || null,
              standard_solution_md: standard.value.trim() || null,
              fastest_solution_md: fastest.value.trim() || null,
              fastest_conditions: conditions.value.trim() || null,
              trap: trap.value.trim() || null,
            });
            Object.assign(x, updated);
            const base = rows.find((r) => r.id === x.id);
            if (base) Object.assign(base, updated);
            await drawList();
            await drawDetail(x.id);
          } }, '保存诊断')),
        ),
      ),
      h('section', { class: 'review-history-section' },
        h('div', { class: 'section-title-row' }, h('div', {}, h('span', { class: 'study-overline' }, '修复轨迹'), h('h3', {}, '历次复训'))),
        x.reviews?.length ? h('div', { class: 'review-history' }, ...x.reviews.map((r) => h('div', { class: `review-history-item ${r.is_correct ? 'is-correct' : 'is-wrong'}` },
          h('span', { class: 'review-history-dot' }),
          h('div', {}, h('strong', {}, `第 ${r.attempt_no} 次复训 · ${r.is_correct ? '答对' : '答错'}`), h('small', {}, `${String(r.created_at || '').slice(0, 16).replace('T', ' ')} · 用时 ${r.duration_sec || 0}s${r.cause_this_time ? ` · ${r.cause_this_time}` : ''}`)),
        ))) : h('div', { class: 'study-empty-state compact' }, h('strong', {}, '还没有复训记录'), h('span', {}, '完成复训后，这里会形成可追踪的修复轨迹。')),
      ),
    );
  };

  search.oninput = drawList;
  moduleSelect.onchange = drawList;
  statusSelect.onchange = drawList;
  dueOnly.querySelector('input').onchange = drawList;
  await drawList();
  await drawDetail(selectedId);
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
  clear(main).append(title('错题复训', '按真实到期队列复训。先独立作答，再看答案与修复规则；不要边看解析边“复习”。', 'REVIEW LOOP'));

  if (!rows.length) {
    main.append(h('div', { class: 'study-empty-state large standalone' }, h('strong', {}, '今天没有到期错题'), h('span', {}, '复训队列已清空。可以回到错题本完善诊断，或开始新的专项训练。'), h('a', { class: 'secondary', href: '/mistakes' }, '查看错题本')));
    return;
  }

  currentReview = currentReview && rows.some((x) => x.id === currentReview.id) ? currentReview : rows[0];
  selectedAnswer = '';
  reviewStart = Date.now();
  const q = currentReview;
  const currentIndex = Math.max(0, rows.findIndex((x) => x.id === q.id));

  const list = h('aside', { class: 'review-queue-pane' },
    h('div', { class: 'review-queue-head' }, h('span', { class: 'study-overline' }, '今日队列'), h('strong', {}, `${rows.length} 道到期`), h('small', {}, `当前 ${currentIndex + 1}/${rows.length}`)),
    h('div', { class: 'review-progress-track' }, h('span', { style: `width:${((currentIndex + 1) / rows.length) * 100}%` })),
    h('div', { class: 'review-queue-list' }, ...rows.map((x, i) => h('button', { class: `review-queue-item ${x.id === q.id ? 'active' : ''}`, onclick: () => { currentReview = x; renderReview(); } },
      h('span', { class: 'queue-no' }, String(i + 1).padStart(2, '0')),
      h('span', { class: 'queue-copy' }, h('strong', {}, x.module || '未分类'), h('small', {}, compact(x.stem_md, 48))),
      h('span', { class: `queue-state ${x.status === '反复错' ? 'risk' : ''}` }, x.status || '待复训'),
    ))),
  );

  const opts = optionEntries(q);
  const options = opts.map(([key, value, img]) => h('button', { class: 'review-option review-option-v2', 'data-key': key, onclick: () => setReviewAnswer(key) },
    h('span', { class: 'review-option-letter' }, key),
    h('span', { class: 'review-option-copy' }, value || (img ? '' : '[图片选项]'), img ? h('img', { src: imageSrc(img), loading: 'lazy' }) : null),
  ));

  const result = h('div', { id: 'review-result', class: 'review-result-host' });
  const middle = h('section', { class: 'review-question-pane' },
    h('div', { class: 'review-question-head' },
      h('div', {}, h('div', { class: 'review-kicker' }, tag(q.module || '未分类'), q.subtype ? tag(q.subtype) : null), h('span', { class: 'study-overline' }, `到期错题 · 第 ${currentIndex + 1} 题`)),
      h('span', { class: 'review-key-hint' }, 'A–D 快捷选择'),
    ),
    h('h2', {}, q.stem_md || '题干缺失'),
    q.images?.length ? imageStack(q.images, 'mistake-image-stack') : null,
    h('div', { id: 'review-options', class: 'review-options-v2' }, ...options),
    h('div', { class: 'review-submit-row' },
      h('span', { class: 'subtle' }, '提交前不会显示正确答案和解析。'),
      h('button', { class: 'primary review-submit', onclick: async () => {
        if (!selectedAnswer) return alert('先选择答案');
        const res = await jpost(`/api/review/${q.id}/submit`, { answer: selectedAnswer, duration_sec: Math.round((Date.now() - reviewStart) / 1000) });
        const next = rows[currentIndex + 1];
        result.replaceChildren(h('section', { class: `review-feedback ${res.is_correct ? 'is-correct' : 'is-wrong'}` },
          h('div', { class: 'review-feedback-head' }, h('div', {}, h('span', {}, res.is_correct ? '✓' : '!'), h('strong', {}, res.is_correct ? '本次修复成功' : '本次仍然答错')), h('div', {}, `你的答案 ${selectedAnswer} · 正确答案 ${res.correct_answer}`)),
          h('div', { class: 'review-feedback-grid' },
            h('article', {}, h('span', { class: 'study-overline' }, '标准解法'), h('p', {}, res.standard_solution_md || '尚未记录标准解法。')),
            h('article', {}, h('span', { class: 'study-overline' }, '最快路径'), h('p', {}, res.fastest_solution_md || '尚未记录最快解法。'), res.fastest_conditions ? h('small', {}, `适用条件：${res.fastest_conditions}`) : null),
          ),
          h('div', { class: 'review-feedback-footer' }, h('span', {}, `下次复训：${res.next_review_at || '—'}`), next ? h('button', { class: 'secondary', onclick: () => { currentReview = next; renderReview(); } }, '下一题 →') : h('a', { class: 'secondary', href: '/mistakes' }, '返回错题本')),
        ));
      } }, '提交答案'),
    ),
    result,
  );

  const side = h('aside', { class: 'review-context-pane' },
    h('div', { class: 'context-card' }, h('span', { class: 'study-overline' }, '这道题的历史'),
      h('div', { class: 'context-mini-grid' },
        h('div', {}, h('small', {}, '状态'), h('b', {}, q.status || '待复训')),
        h('div', {}, h('small', {}, '已复训'), h('b', {}, String(q.review_count || 0))),
        h('div', {}, h('small', {}, '连续正确'), h('b', {}, String(q.consecutive_correct || 0))),
        h('div', {}, h('small', {}, '主要错因'), h('b', {}, q.cause_primary || '待诊断')),
      )),
    h('div', { class: 'context-card context-tip' }, h('span', { class: 'study-overline' }, '复训规则'), h('p', {}, '先独立做完，再核对解法。如果再次答错，优先判断是否与上次是同一种故障，而不是只记答案。')),
    h('div', { class: 'context-card' }, h('span', { class: 'study-overline' }, '快捷键'), h('div', { class: 'shortcut-mini' }, h('span', {}, 'A / B / C / D'), h('small', {}, '选择答案'))),
  );

  main.append(h('div', { class: 'review-layout review-layout-v2' }, list, middle, side));
}
