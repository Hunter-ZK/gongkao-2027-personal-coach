import { api, main, clear, h, pct, fmtSec } from '../runtime.js';

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

function sourceLabel(source) {
  const labels = {
    fenbi_random: '粉笔随机练习',
    special: '专项练习',
    mock: '模考',
    gd_real: '广东真题',
    national_real: '国考真题',
    full_paper_gd: '广东整卷',
    full_paper_national: '国考整卷',
    other: '其他',
  };
  return labels[source] || source || '未标注';
}

function optionEntries(q) {
  const options = q.options || {};
  const images = q.option_images || {};
  return ['A', 'B', 'C', 'D'].filter((key) => options[key] || images[key]).map((key) => [key, options[key] || '', images[key]]);
}

function closeQuestionModal(overlay, keyHandler) {
  window.removeEventListener('keydown', keyHandler);
  overlay.remove();
}

function showQuestionPreview(q) {
  const options = optionEntries(q);
  const correctAnswer = q.correct_answer || q.correctAnswer || '';
  const userAnswer = q.user_answer || q.userChoice || '';
  const isCorrect = q.is_correct === 1 || q.is_correct === true || (userAnswer && correctAnswer && userAnswer === correctAnswer);
  const explanation = q.explanation_md || q.explanation || '';
  const duration = q.duration_sec || q.durationSec || null;
  const trainingId = q.training_id || q.trainingId || null;
  const module = q.module || '未分类';
  const subtype = q.subtype || q.subType || '';
  const seq = q.seq || q.id || '—';

  const overlay = h('div', { class: 'cg-question-modal-backdrop' });
  const keyHandler = (event) => {
    if (event.key === 'Escape') closeQuestionModal(overlay, keyHandler);
  };
  overlay.onclick = (event) => {
    if (event.target === overlay) closeQuestionModal(overlay, keyHandler);
  };
  window.addEventListener('keydown', keyHandler);

  const card = h('section', { class: 'cg-question-modal-card', role: 'dialog', 'aria-modal': 'true' });
  const closeButton = h('button', {
    class: 'cg-question-modal-close',
    type: 'button',
    'aria-label': '关闭题目详情',
    onclick: () => closeQuestionModal(overlay, keyHandler),
  }, icon('close'));

  const headerMeta = h('div', { class: 'cg-question-modal-meta' },
    h('span', { class: 'cg-question-type-tag' }, `${module}${subtype ? ` · ${subtype}` : ''}`),
    h('span', { class: 'cg-question-seq' }, `题号 #${q.id || seq}${q.id && seq !== q.id ? ` (序号 ${seq})` : ''}`),
  );
  if (userAnswer) {
    headerMeta.append(h('span', { class: `cg-question-result ${isCorrect ? 'correct' : 'wrong'}` },
      icon(isCorrect ? 'check-circle' : 'x-circle'),
      isCorrect ? '正确' : '错误',
    ));
  }

  const stem = h('div', { class: 'cg-question-modal-stem' }, q.stem_md || q.stem || '题干以原图为准');
  const stemImages = h('div', { class: 'cg-question-modal-images' },
    ...(q.images || []).map((src) => h('img', { src: imageSrc(src), loading: 'lazy', alt: '题干配图' })),
  );

  const optionList = h('div', { class: 'cg-question-modal-options' });
  for (const [key, value, img] of options) {
    const isCorrectOpt = key === correctAnswer;
    const isUserOpt = key === userAnswer;
    optionList.append(h('div', {
      class: `cg-question-modal-option ${isCorrectOpt ? 'correct' : isUserOpt && !isCorrectOpt ? 'wrong' : ''}`,
    },
      h('span', { class: `cg-option-letter ${isCorrectOpt ? 'correct' : isUserOpt && !isCorrectOpt ? 'wrong' : ''}` }, key),
      h('div', { class: 'cg-option-copy' },
        value || '',
        img ? h('img', { src: imageSrc(img), loading: 'lazy', alt: `${key} 选项配图` }) : null,
      ),
    ));
  }

  const facts = h('div', { class: 'cg-question-facts' },
    h('div', {}, h('span', {}, '正确答案'), h('strong', { class: 'correct' }, correctAnswer || '—')),
    h('div', {}, h('span', {}, '你的作答'), h('strong', { class: userAnswer && userAnswer !== correctAnswer ? 'wrong' : 'correct' }, userAnswer || '未作答')),
    h('div', {}, h('span', {}, '做题用时'), h('strong', {}, duration ? `${duration}秒` : '未记录')),
    h('div', {}, h('span', {}, '所属训练'), h('strong', {}, trainingId ? `#${trainingId}` : '—')),
  );

  const content = h('div', { class: 'cg-question-modal-content' }, stem, stemImages, optionList, facts);
  if (explanation) {
    content.append(h('div', { class: 'cg-question-explanation' },
      h('div', { class: 'cg-callout-title' }, icon('book'), h('strong', {}, '题解精讲与核心破题点')),
      h('p', {}, explanation),
    ));
  }
  if (!isCorrect && userAnswer) {
    const diagnosisText = q.fastest_solution_md || q.standard_solution_md || q.cause_note || q.trap || '';
    content.append(h('div', { class: 'cg-question-diagnosis' },
      h('div', { class: 'cg-callout-title' }, icon('alert'), h('strong', {}, q.cause_primary ? `错误模式诊断 · ${q.cause_primary}` : '错误模式诊断')),
      diagnosisText ? h('p', {}, diagnosisText) : h('p', {}, '该题已进入错题闭环，可在错题本中查看 DeepSeek 自动解析与后续复训记录。'),
    ));
  }

  card.append(
    h('header', { class: 'cg-question-modal-header' }, headerMeta, closeButton),
    content,
    h('footer', { class: 'cg-question-modal-footer' },
      h('button', { class: 'cg-question-close-button', type: 'button', onclick: () => closeQuestionModal(overlay, keyHandler) }, '关闭详情 (ESC)'),
    ),
  );
  overlay.append(card);
  document.body.append(overlay);
}

async function openBankQuestion(row) {
  const item = await api(`/api/question-bank/${row.id}`);
  const attempt = item.attempts?.[0] || {};
  let latestQuestion = {};
  if (attempt.training_id && attempt.question_id) {
    try {
      const trainingQuestions = await api(`/api/trainings/${attempt.training_id}/questions`);
      latestQuestion = trainingQuestions.find((x) => Number(x.id) === Number(attempt.question_id)) || {};
    } catch (_) {}
  }
  showQuestionPreview({
    ...item,
    ...latestQuestion,
    id: item.id,
    stem_md: item.stem_md || latestQuestion.stem_md,
    options: item.options || latestQuestion.options,
    images: item.images || latestQuestion.images,
    option_images: item.option_images || latestQuestion.option_images,
    correct_answer: attempt.correct_answer || item.correct_answer || latestQuestion.correct_answer,
    user_answer: attempt.user_answer || latestQuestion.user_answer,
    is_correct: attempt.is_correct ?? latestQuestion.is_correct,
    duration_sec: attempt.duration_sec || latestQuestion.duration_sec,
    training_id: attempt.training_id || latestQuestion.training_id,
    explanation_md: latestQuestion.explanation_md,
  });
}

function moduleCard(row) {
  const total = Number(row.total_q || 0);
  const correct = Number(row.correct_q || 0);
  const accuracy = total ? correct / total : 0;
  return h('div', { class: 'cg-training-module-card' },
    h('div', { class: 'cg-training-module-head' },
      h('strong', {}, row.module || '未分类'),
      h('span', {}, `${correct}/${total} (${Math.round(accuracy * 100)}%)`),
    ),
    h('div', { class: 'cg-training-progress' },
      h('span', { class: accuracy >= .8 ? 'good' : 'warn', style: `width:${Math.round(accuracy * 100)}%` }),
    ),
  );
}

function trainingQuestionCard(q) {
  const isCorrect = q.is_correct === 1 || q.is_correct === true;
  return h('button', {
    class: `cg-training-question-card ${isCorrect ? 'correct' : 'wrong'}`,
    type: 'button',
    onclick: () => showQuestionPreview(q),
  },
    h('div', { class: 'cg-training-question-top' },
      h('strong', {}, `#${q.seq}`),
      icon(isCorrect ? 'check-circle' : 'x-circle'),
    ),
    h('div', { class: 'cg-training-question-type' }, q.subtype || q.module || '未分类'),
    h('div', { class: 'cg-training-question-answer' },
      h('span', {}, `${q.user_answer || '—'} → ${q.correct_answer || '—'}`),
      !isCorrect && q.cause_primary ? h('em', {}, q.cause_primary) : null,
    ),
  );
}

async function trainingCard(row) {
  const [training, questions] = await Promise.all([
    api(`/api/trainings/${row.id}`),
    api(`/api/trainings/${row.id}/questions`),
  ]);
  const accuracy = row.total_q ? Number(row.correct_q || 0) / Number(row.total_q) : 0;
  const avg = row.total_q && row.duration_sec ? Math.round(Number(row.duration_sec) / Number(row.total_q)) : null;

  const card = h('article', { class: 'cg-training-batch-card' },
    h('div', { class: 'cg-training-batch-head' },
      h('div', { class: 'cg-training-batch-title' },
        h('div', { class: 'cg-training-title-line' },
          h('strong', {}, sourceLabel(row.source)),
          h('span', {}, `#${row.id}`),
        ),
        h('p', {}, `训练日期: ${row.trained_on} · 总用时 ${row.duration_sec ? fmtSec(row.duration_sec) : '未记录'}${avg ? ` · 单题均速 ${avg} 秒/题` : ''}`),
      ),
      h('div', { class: 'cg-training-batch-score' },
        h('div', {}, h('span', {}, '综合正确率'), h('strong', {}, row.total_q ? pct(accuracy, 0) : '—')),
        h('div', {}, h('span', {}, '对题 / 总题'), h('strong', {}, `${row.correct_q || 0} / ${row.total_q || 0}`)),
      ),
    ),
    (training.modules || []).length ? h('div', { class: 'cg-training-module-grid' }, ...(training.modules || []).map(moduleCard)) : null,
    training.note ? h('div', { class: 'cg-training-diagnosis' },
      icon('alert'),
      h('div', {}, h('strong', {}, '训练诊断：'), training.note),
    ) : null,
    h('div', { class: 'cg-training-question-section' },
      h('span', { class: 'cg-training-question-caption' }, '题目作答明细（点击任意题目卡片查看题干、选项与解析）：'),
      questions.length
        ? h('div', { class: 'cg-training-question-grid' }, ...questions.map(trainingQuestionCard))
        : h('div', { class: 'empty' }, '当前批次没有逐题数据。'),
    ),
  );
  return card;
}

async function renderRecordTab(host) {
  const groups = await api('/api/trainings');
  const rows = Object.values(groups).flat().sort((a, b) => `${b.trained_on}-${b.id}`.localeCompare(`${a.trained_on}-${a.id}`));
  if (!rows.length) {
    host.append(h('div', { class: 'cg-empty-card' }, '还没有训练记录。上传一份训练 PDF 后会自动进入这里。'));
    return;
  }
  const list = h('div', { class: 'cg-training-batch-list' });
  host.append(list);
  const cards = await Promise.all(rows.map(trainingCard));
  list.append(...cards);
}

async function renderBankTab(host, bankRows = null) {
  const rows = bankRows || await api('/api/question-bank');
  const moduleSelect = h('select', { class: 'cg-bank-select' },
    h('option', { value: '' }, '全部模块'),
    ...['资料分析', '判断推理', '言语理解', '数量关系', '常识判断', '申论', '未分类'].map((x) => h('option', { value: x }, x)),
  );
  const correctSelect = h('select', { class: 'cg-bank-select' },
    h('option', { value: 'all' }, '全部作答'),
    h('option', { value: 'clean' }, '仅从未答错'),
    h('option', { value: 'wrong' }, '仅存在错答'),
  );
  const search = h('input', { class: 'cg-bank-search-input', placeholder: '搜索题干、题型、解析或错误模式代码...' });
  const count = h('span', { class: 'cg-bank-count' }, `${rows.length} 题`);
  const list = h('div', { class: 'cg-question-bank-list' });

  const draw = () => {
    const kw = search.value.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (moduleSelect.value && row.module !== moduleSelect.value) return false;
      if (correctSelect.value === 'clean' && Number(row.wrong_count || 0) > 0) return false;
      if (correctSelect.value === 'wrong' && Number(row.wrong_count || 0) === 0) return false;
      const text = `${row.stem_md || ''} ${row.subtype || ''} ${row.module || ''}`.toLowerCase();
      return !kw || text.includes(kw);
    });
    count.textContent = `${filtered.length} 题`;
    clear(list);
    if (!filtered.length) {
      list.append(h('div', { class: 'cg-empty-card' }, '未找到匹配题目'));
      return;
    }

    for (const row of filtered) {
      const hadWrong = Number(row.wrong_count || 0) > 0;
      const attempts = Number(row.attempt_count || 0);
      const thumb = (row.images || [])[0] || (row.material_images || [])[0];
      list.append(h('article', {
        class: 'cg-question-bank-row',
        onclick: () => openBankQuestion(row),
      },
        h('div', { class: 'cg-question-bank-copy' },
          h('div', { class: 'cg-question-bank-meta' },
            h('span', { class: 'cg-question-bank-type' }, `${row.module || '未分类'}${row.subtype ? ` · ${row.subtype}` : ''}`),
            h('span', { class: 'cg-question-bank-id' }, `#${row.id}`),
            attempts
              ? h('span', { class: `cg-question-bank-status ${hadWrong ? 'wrong' : 'correct'}` },
                  icon(hadWrong ? 'x-circle' : 'check-circle'),
                  hadWrong ? `存在错答 (${row.wrong_count})` : '正确',
                )
              : h('span', { class: 'cg-question-bank-status neutral' }, '未作答'),
          ),
          h('p', {}, row.stem_md || '题干以原图为准'),
          thumb ? h('img', { class: 'cg-question-bank-thumb', src: imageSrc(thumb), loading: 'lazy', alt: '题目缩略图' }) : null,
        ),
        h('div', { class: 'cg-question-bank-side' },
          h('div', {}, h('span', {}, '历史正确率'), h('strong', {}, attempts ? pct(row.accuracy, 0) : '—')),
          h('div', {}, h('span', {}, '作答次数'), h('strong', {}, String(attempts))),
          h('div', {}, h('span', {}, '参考答案'), h('strong', {}, row.correct_answer || '—')),
          icon('arrow-right', 'cg-question-row-arrow'),
        ),
      ));
    }
  };

  search.oninput = draw;
  moduleSelect.onchange = draw;
  correctSelect.onchange = draw;

  host.append(
    h('div', { class: 'cg-question-bank-toolbar' },
      h('div', { class: 'cg-question-bank-search' }, icon('search'), search),
      h('div', { class: 'cg-question-bank-filters' }, moduleSelect, correctSelect),
      count,
    ),
    list,
  );
  draw();
}

export async function renderTrainingWorkspace(initialTab = null) {
  const params = new URLSearchParams(location.search || '');
  let tab = initialTab || params.get('tab') || 'records';
  const [groups, bank] = await Promise.all([api('/api/trainings'), api('/api/question-bank')]);
  const trainingCount = Object.values(groups).flat().length;

  const page = h('div', { class: 'cg-trainings-view' });
  const tabs = h('div', { class: 'cg-training-tabs' });
  const host = h('div', { class: 'cg-training-tab-body' });

  const tabButton = (target, label) => h('button', {
    class: `cg-training-tab ${tab === target ? 'active' : ''}`,
    type: 'button',
    onclick: async () => {
      tab = target;
      history.replaceState(null, '', `/trainings?tab=${target}`);
      await draw();
    },
  }, label);

  const drawTabs = () => {
    clear(tabs).append(
      tabButton('records', `训练批次 (${trainingCount})`),
      tabButton('bank', `全量题库 (${bank.length})`),
    );
  };

  const draw = async () => {
    drawTabs();
    clear(host);
    if (tab === 'bank') await renderBankTab(host, bank);
    else await renderRecordTab(host);
  };

  page.append(
    h('div', { class: 'cg-trainings-head' },
      h('div', {},
        h('h2', {}, '训练记录与真实题库'),
        h('p', {}, '严谨追溯每一组真题训练用时、正确率与考场思维诊断'),
      ),
      tabs,
    ),
    host,
  );
  clear(main).append(page);
  await draw();
}

export async function renderTrainings() {
  return renderTrainingWorkspace(null);
}

export async function renderQuestionBank() {
  return renderTrainingWorkspace('bank');
}
