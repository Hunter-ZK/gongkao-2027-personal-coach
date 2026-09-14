import { api, main, clear, h, pct, fmtSec, tag, title } from '../runtime.js';

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

function numberStat(label, value, note = '') {
  return h('div', { class: 'study-stat' },
    h('span', { class: 'study-stat-label' }, label),
    h('strong', {}, value),
    note ? h('small', {}, note) : null,
  );
}

function tabButton(label, active, onClick) {
  return h('button', { class: `workspace-tab ${active ? 'active' : ''}`, onclick: onClick }, label);
}

function trainingQuestionPill(q) {
  return h('button', {
    class: `training-question-pill ${q.is_correct ? 'correct' : 'wrong'}`,
    type: 'button',
    onclick: () => showQuestionPreview(q),
  },
    h('div', { class: 'training-pill-top' },
      h('strong', {}, `#${q.seq}`),
      h('span', {}, q.is_correct ? '对' : '错'),
    ),
    h('small', {}, q.subtype || q.module || '未分类'),
    h('div', { class: 'training-pill-answer' }, `${q.user_answer || '—'} → ${q.correct_answer || '—'}`),
  );
}

function optionEntries(q) {
  const options = q.options || {};
  return ['A', 'B', 'C', 'D'].filter((k) => options[k] || q.option_images?.[k]).map((k) => [k, options[k] || '', q.option_images?.[k]]);
}

function showQuestionPreview(q) {
  const dialog = h('dialog', { class: 'command-dialog question-preview-dialog' });
  const options = optionEntries(q);
  dialog.append(
    h('div', { class: 'dialog-head' },
      h('div', {}, h('h2', {}, `${q.module || '未分类'} · 第 ${q.seq} 题`), h('p', { class: 'subtle' }, q.subtype || '')),
      h('button', { class: 'icon-button', onclick: () => dialog.close(), 'aria-label': '关闭' }, '×'),
    ),
    h('div', { class: 'question-preview-body' },
      h('p', { class: 'question-preview-stem' }, q.stem_md || '题干以原图为准'),
      ...(q.images || []).map((src) => h('img', { class: 'question-preview-image', src: imageSrc(src), loading: 'lazy' })),
      h('div', { class: 'question-preview-options' }, ...options.map(([key, value, img]) => h('div', {
        class: `question-preview-option ${key === q.correct_answer ? 'correct' : key === q.user_answer && key !== q.correct_answer ? 'wrong' : ''}`,
      },
        h('span', { class: 'option-letter' }, key),
        h('div', {}, value || '', img ? h('img', { src: imageSrc(img), loading: 'lazy' }) : null),
      ))),
      h('div', { class: 'question-preview-foot' },
        h('span', {}, `你的答案 ${q.user_answer || '—'}`),
        h('span', {}, `正确答案 ${q.correct_answer || '—'}`),
      ),
    ),
  );
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
}

function moduleCard(row) {
  const total = Number(row.total_q || 0);
  const correct = Number(row.correct_q || 0);
  const accuracy = total ? correct / total : 0;
  return h('div', { class: 'training-module-card' },
    h('div', { class: 'training-module-head' },
      h('strong', {}, row.module || '未分类'),
      h('span', {}, `${correct}/${total} (${Math.round(accuracy * 100)}%)`),
    ),
    h('div', { class: 'training-module-track' },
      h('span', { class: accuracy >= .8 ? 'good' : 'warn', style: `width:${Math.round(accuracy * 100)}%` }),
    ),
  );
}

async function trainingCard(row) {
  const card = h('article', { class: 'training-batch-card' });
  const detailHost = h('div', { class: 'training-batch-detail', hidden: true });
  let loaded = false;
  let expanded = false;
  const toggle = h('button', { class: 'secondary training-expand-button', type: 'button' }, '展开作答明细');

  const drawDetail = async () => {
    if (!loaded) {
      clear(detailHost).append(h('div', { class: 'training-detail-loading' }, '正在读取批次题目…'));
      detailHost.hidden = false;
      const [training, questions] = await Promise.all([
        api(`/api/trainings/${row.id}`),
        api(`/api/trainings/${row.id}/questions`),
      ]);
      clear(detailHost).append(
        (training.modules || []).length ? h('div', { class: 'training-module-grid' }, ...(training.modules || []).map(moduleCard)) : null,
        training.note ? h('div', { class: 'training-diagnosis-note' }, h('strong', {}, '训练诊断'), h('span', {}, training.note)) : null,
        h('div', { class: 'training-question-section' },
          h('div', { class: 'training-question-caption' }, '题目作答明细（点击任意题目查看完整内容）'),
          questions.length ? h('div', { class: 'training-question-pills' }, ...questions.map(trainingQuestionPill)) : h('div', { class: 'empty' }, '当前批次没有逐题数据。'),
        ),
      );
      loaded = true;
    }
  };

  toggle.onclick = async () => {
    expanded = !expanded;
    if (expanded) await drawDetail();
    detailHost.hidden = !expanded;
    toggle.textContent = expanded ? '收起作答明细' : '展开作答明细';
  };

  const accuracy = row.total_q ? Number(row.correct_q || 0) / Number(row.total_q) : 0;
  const avg = row.total_q && row.duration_sec ? Math.round(Number(row.duration_sec) / Number(row.total_q)) : null;
  card.append(
    h('div', { class: 'training-batch-head' },
      h('div', { class: 'training-batch-title' },
        h('div', {}, h('strong', {}, sourceLabel(row.source)), h('span', {}, `#${row.id}`)),
        h('p', {}, `训练日期: ${row.trained_on} · 总用时 ${row.duration_sec ? fmtSec(row.duration_sec) : '未记录'}${avg ? ` · 单题均速 ${avg} 秒/题` : ''}`),
      ),
      h('div', { class: 'training-batch-score' },
        h('div', {}, h('span', {}, '综合正确率'), h('strong', {}, row.total_q ? pct(accuracy, 0) : '—')),
        h('div', {}, h('span', {}, '对题 / 总题'), h('strong', {}, `${row.correct_q || 0} / ${row.total_q || 0}`)),
      ),
    ),
    row.note ? h('div', { class: 'training-diagnosis-note compact' }, h('strong', {}, '训练备注'), h('span', {}, row.note)) : null,
    h('div', { class: 'training-batch-footer' },
      h('span', { class: `training-confidence ${row.data_confidence === 'verified' ? 'verified' : ''}` }, row.data_confidence === 'verified' ? '已核验数据' : '待核验数据'),
      toggle,
    ),
    detailHost,
  );
  return card;
}

async function renderRecordTab(host) {
  const groups = await api('/api/trainings');
  const rows = Object.values(groups).flat().sort((a, b) => `${b.trained_on}-${b.id}`.localeCompare(`${a.trained_on}-${a.id}`));
  const totalQ = rows.reduce((sum, x) => sum + Number(x.total_q || 0), 0);
  const correctQ = rows.reduce((sum, x) => sum + Number(x.correct_q || 0), 0);
  const seconds = rows.reduce((sum, x) => sum + Number(x.duration_sec || 0), 0);

  host.append(h('div', { class: 'inline-stat-strip training-stat-strip' },
    numberStat('训练批次', String(rows.length), '真实导入或手工记录'),
    numberStat('累计题量', String(totalQ), '真实入库作答'),
    numberStat('整体正确率', totalQ ? pct(correctQ / totalQ) : '—', '按题量加权'),
    numberStat('记录用时', seconds ? fmtSec(seconds) : '—', '仅统计已记录时长'),
  ));

  if (!rows.length) {
    host.append(h('div', { class: 'empty' }, '还没有训练记录。上传一份训练 PDF 后会自动进入这里。'));
    return;
  }

  const sourceSelect = h('select', { class: 'study-filter-select' },
    h('option', { value: '' }, '全部来源'),
    ...[...new Set(rows.map((x) => x.source))].map((x) => h('option', { value: x }, sourceLabel(x))),
  );
  const count = h('span', { class: 'study-result-count' }, `${rows.length} 个批次`);
  const list = h('div', { class: 'training-batch-list' });

  const draw = async () => {
    const filtered = rows.filter((x) => !sourceSelect.value || x.source === sourceSelect.value);
    count.textContent = `${filtered.length} 个批次`;
    clear(list);
    if (!filtered.length) {
      list.append(h('div', { class: 'empty' }, '当前筛选下没有训练记录。'));
      return;
    }
    const cards = await Promise.all(filtered.map(trainingCard));
    list.append(...cards);
  };
  sourceSelect.onchange = draw;
  host.append(h('div', { class: 'training-filter-row' }, sourceSelect, count), list);
  await draw();
}

async function renderBankTab(host) {
  const rows = await api('/api/question-bank');
  const moduleSelect = h('select', { class: 'study-filter-select' },
    h('option', { value: '' }, '全部模块'),
    ...['资料分析', '判断推理', '言语理解', '数量关系', '常识判断', '未分类'].map((x) => h('option', { value: x }, x)),
  );
  const correctSelect = h('select', { class: 'study-filter-select' },
    h('option', { value: 'all' }, '全部作答'),
    h('option', { value: 'clean' }, '从未答错'),
    h('option', { value: 'wrong' }, '存在错答'),
  );
  const search = h('input', { class: 'study-search-input', placeholder: '搜索题干、题型或模块…' });
  const count = h('span', { class: 'study-result-count' }, `${rows.length} 题`);
  const list = h('div', { class: 'question-bank-list' });

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (moduleSelect.value && row.module !== moduleSelect.value) return false;
      if (correctSelect.value === 'clean' && Number(row.wrong_count || 0) > 0) return false;
      if (correctSelect.value === 'wrong' && Number(row.wrong_count || 0) === 0) return false;
      const text = `${row.stem_md || ''} ${row.subtype || ''} ${row.module || ''}`.toLowerCase();
      return !q || text.includes(q);
    });
    count.textContent = `${filtered.length} 题`;
    clear(list);
    if (!filtered.length) {
      list.append(h('div', { class: 'empty' }, '未找到匹配题目。'));
      return;
    }
    filtered.forEach((row) => {
      const hadWrong = Number(row.wrong_count || 0) > 0;
      const thumb = (row.images || [])[0] || (row.material_images || [])[0];
      list.append(h('article', {
        class: 'question-bank-row',
        onclick: async () => {
          const item = await api(`/api/question-bank/${row.id}`);
          showQuestionPreview({
            ...item,
            seq: item.id,
            user_answer: item.attempts?.[0]?.user_answer,
            is_correct: item.attempts?.[0]?.is_correct,
          });
        },
      },
        h('div', { class: 'question-bank-copy' },
          h('div', { class: 'question-bank-meta' },
            h('span', { class: 'question-bank-module' }, `${row.module || '未分类'}${row.subtype ? ` · ${row.subtype}` : ''}`),
            h('span', { class: 'question-bank-id' }, `#${row.id}`),
            h('span', { class: `question-bank-status ${hadWrong ? 'wrong' : 'correct'}` }, hadWrong ? `存在错答 (${row.wrong_count})` : '暂无错答'),
          ),
          h('p', {}, row.stem_md || '题干以原图为准'),
          thumb ? h('img', { class: 'question-bank-thumb', src: imageSrc(thumb), loading: 'lazy' }) : null,
        ),
        h('div', { class: 'question-bank-side' },
          h('div', {}, h('span', {}, '历史正确率'), h('strong', {}, row.attempt_count ? pct(row.accuracy, 0) : '—')),
          h('div', {}, h('span', {}, '作答次数'), h('strong', {}, String(row.attempt_count || 0))),
          h('div', {}, h('span', {}, '参考答案'), h('strong', {}, row.correct_answer || '—')),
          h('span', { class: 'question-bank-arrow' }, '›'),
        ),
      ));
    });
  };

  moduleSelect.onchange = draw;
  correctSelect.onchange = draw;
  search.oninput = draw;
  host.append(
    h('div', { class: 'question-bank-toolbar' },
      h('div', { class: 'study-search' }, search),
      moduleSelect,
      correctSelect,
      count,
    ),
    list,
  );
  draw();
}

export async function renderTrainingWorkspace(initialTab = null) {
  const params = new URLSearchParams(location.search || '');
  let tab = initialTab || params.get('tab') || 'records';
  const groups = await api('/api/trainings');
  const trainingCount = Object.values(groups).flat().length;
  const bank = await api('/api/question-bank');

  clear(main).append(title(
    '训练记录与真实题库',
    '严谨追溯每一组训练的来源、用时、正确率与逐题表现；题库单独沉淀规范题目和历次作答。',
  ));

  const tabs = h('div', { class: 'workspace-tabs training-tabs' });
  const host = h('section', { class: 'workspace-tab-body' });
  const draw = async () => {
    clear(tabs).append(
      tabButton(`训练批次 (${trainingCount})`, tab === 'records', async () => {
        tab = 'records';
        history.replaceState(null, '', '/trainings?tab=records');
        await draw();
      }),
      tabButton(`全量题库 (${bank.length})`, tab === 'bank', async () => {
        tab = 'bank';
        history.replaceState(null, '', '/trainings?tab=bank');
        await draw();
      }),
    );
    clear(host);
    if (tab === 'bank') await renderBankTab(host);
    else await renderRecordTab(host);
  };
  main.append(tabs, host);
  await draw();
}

export async function renderTrainings() {
  return renderTrainingWorkspace('records');
}

export async function renderQuestionBank() {
  return renderTrainingWorkspace('bank');
}
