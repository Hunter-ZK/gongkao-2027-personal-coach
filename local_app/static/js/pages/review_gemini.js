import { api, jpost, main, clear, h } from '../runtime.js';

let queue = [];
let currentIndex = 0;
let selectedChoice = '';
let submitted = null;
let startedAt = 0;

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

function optionEntries(row) {
  const opts = row.options || {};
  const images = row.option_images || {};
  return ['A', 'B', 'C', 'D'].filter((key) => opts[key] || images[key]).map((key) => [key, opts[key] || '', images[key]]);
}

function masteryLevel(row) {
  if (row.status === '已修复') return 4;
  if (Number(row.consecutive_correct || 0) >= 1) return 3;
  if (Number(row.review_count || 0) >= 2) return 2;
  if (Number(row.review_count || 0) >= 1) return 1;
  return 0;
}

export function setReviewAnswerGemini(answer) {
  if (submitted) return;
  selectedChoice = String(answer || '').toUpperCase();
  document.querySelectorAll('.cg-review-option').forEach((button) => {
    button.classList.toggle('selected', button.dataset.key === selectedChoice);
  });
  const submit = document.querySelector('#cg-review-submit');
  if (submit) submit.disabled = !selectedChoice;
}

async function submitCurrent() {
  if (!selectedChoice || submitted || !queue[currentIndex]) return;
  const row = queue[currentIndex];
  submitted = await jpost(`/api/review/${row.id}/submit`, {
    answer: selectedChoice,
    duration_sec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
  });
  await draw();
}

async function nextQuestion() {
  if (currentIndex + 1 < queue.length) {
    currentIndex += 1;
    selectedChoice = '';
    submitted = null;
    startedAt = Date.now();
    await draw();
    return;
  }
  queue = await api('/api/review/queue?scope=due');
  currentIndex = 0;
  selectedChoice = '';
  submitted = null;
  startedAt = Date.now();
  await draw();
}

function completeView() {
  return h('div', { class: 'cg-review-complete' },
    h('div', { class: 'cg-review-complete-icon' }, icon('check-circle')),
    h('h2', {}, '今日待复训错题队列已清空'),
    h('p', {}, '所有到期错题已经完成本轮复训；系统将依据真实作答结果安排下一次复训。'),
    h('a', { class: 'cg-review-primary', href: '/' }, '返回概览看板'),
  );
}

function optionNode(row, key, value, img) {
  const isSelected = selectedChoice === key;
  const isCorrect = key === row.correct_answer;
  let state = '';
  if (submitted) {
    if (isCorrect) state = 'correct';
    else if (isSelected) state = 'wrong';
    else state = 'muted';
  } else if (isSelected) state = 'selected';

  return h('button', {
    class: `cg-review-option ${state}`.trim(),
    type: 'button',
    'data-key': key,
    disabled: Boolean(submitted),
    onclick: () => setReviewAnswerGemini(key),
  },
    h('span', { class: 'cg-review-option-letter' }, key),
    h('span', { class: 'cg-review-option-copy' },
      value || (img ? '' : '[图片选项]'),
      img ? h('img', { src: imageSrc(img), loading: 'lazy', alt: `${key} 选项配图` }) : null,
    ),
  );
}

async function draw() {
  clear(main);
  if (!queue.length) {
    main.append(completeView());
    return;
  }
  if (currentIndex >= queue.length) currentIndex = 0;
  const row = queue[currentIndex];
  const level = masteryLevel(row);
  const progress = ((currentIndex + 1) / queue.length) * 100;
  const options = optionEntries(row).map(([key, value, img]) => optionNode(row, key, value, img));

  const page = h('div', { class: 'cg-review-view' },
    h('div', { class: 'cg-review-topline' },
      h('div', { class: 'cg-review-title' }, icon('review'), h('h2', {}, '错题智能复训竞技场')),
      h('span', {}, `进度: ${currentIndex + 1} / ${queue.length}`),
    ),
    h('div', { class: 'cg-review-progress' }, h('span', { style: `width:${progress}%` })),
  );

  const card = h('section', { class: 'cg-review-card' },
    h('div', { class: 'cg-review-card-meta' },
      h('div', { class: 'cg-review-tags' },
        h('span', { class: 'cg-review-type' }, `${row.module || '未分类'}${row.subtype ? ` · ${row.subtype}` : ''}`),
        h('span', { class: 'cg-review-pattern' }, row.cause_primary || '待诊断错因'),
      ),
      h('span', { class: 'cg-review-mastery' }, `当前熟练度: M${level}`),
    ),
    h('div', { class: 'cg-review-stem' }, row.stem_md || '题干以原图为准'),
    ...(row.images || []).map((src) => h('img', { class: 'cg-review-stem-image', src: imageSrc(src), loading: 'lazy', alt: '题干配图' })),
    h('div', { class: 'cg-review-options' }, ...options),
  );

  if (!submitted) {
    card.append(h('div', { class: 'cg-review-submit-row' },
      h('span', {}, '支持直接按键盘 A / B / C / D 选定，回车提交'),
      h('button', {
        id: 'cg-review-submit',
        class: 'cg-review-primary',
        type: 'button',
        disabled: !selectedChoice,
        onclick: submitCurrent,
      }, '提交作答 (Enter)'),
    ));
  } else {
    const correct = Boolean(submitted.is_correct);
    card.append(h('div', { class: 'cg-review-feedback-wrap' },
      h('div', { class: `cg-review-result ${correct ? 'correct' : 'wrong'}` },
        h('div', {}, icon(correct ? 'check-circle' : 'x-circle'), h('strong', {}, correct ? '本次答对，错误模式得到有效修复' : '本次仍然答错，需要继续固化正确路径')),
        h('span', {}, `正确答案是: ${submitted.correct_answer || row.correct_answer || '—'}`),
      ),
      h('div', { class: 'cg-review-explanation' },
        h('div', { class: 'cg-callout-title' }, icon('book'), h('strong', {}, '题目解析与秒破点：')),
        h('p', {}, submitted.standard_solution_md || row.standard_solution_md || '尚未记录标准解法。'),
        (submitted.fastest_solution_md || row.fastest_solution_md) ? h('div', { class: 'cg-review-prescription' },
          h('strong', {}, '考场处方：'),
          h('span', {}, submitted.fastest_solution_md || row.fastest_solution_md),
          (submitted.fastest_conditions || row.fastest_conditions) ? h('small', {}, `适用条件：${submitted.fastest_conditions || row.fastest_conditions}`) : null,
        ) : null,
      ),
      h('div', { class: 'cg-review-next-row' },
        h('button', { class: 'cg-review-primary next', type: 'button', onclick: nextQuestion },
          h('span', {}, currentIndex + 1 < queue.length ? '下一题 (Enter)' : '完成本轮'), icon('arrow-right')),
      ),
    ));
  }

  page.append(card);
  main.append(page);
}

export async function renderReviewGemini() {
  queue = await api('/api/review/queue?scope=due');
  currentIndex = 0;
  selectedChoice = '';
  submitted = null;
  startedAt = Date.now();
  await draw();
}

export async function handleReviewEnterGemini() {
  if (!queue.length) return;
  if (!submitted && selectedChoice) await submitCurrent();
  else if (submitted) await nextQuestion();
}
