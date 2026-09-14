import { api, main, clear, h, pct, fmtSec, tag, title, panel, tableWrap } from '../runtime.js';

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
    fenbi_random: '粉笔随机练习', special: '专项练习', mock: '模考', gd_real: '广东真题',
    national_real: '国考真题', full_paper_gd: '广东整卷', full_paper_national: '国考整卷', other: '其他',
  };
  return labels[source] || source || '未标注';
}

function numberStat(label, value, note = '') {
  return h('div', { class: 'study-stat' }, h('span', { class: 'study-stat-label' }, label), h('strong', {}, value), note ? h('small', {}, note) : null);
}

function tabButton(label, active, onClick) {
  return h('button', { class: `workspace-tab ${active ? 'active' : ''}`, onclick: onClick }, label);
}

async function showTrainingDetail(id) {
  const [training, questions] = await Promise.all([
    api(`/api/trainings/${id}`),
    api(`/api/trainings/${id}/questions`),
  ]);
  const dialog = h('dialog', { class: 'command-dialog training-detail-dialog' });
  const moduleRows = (training.modules || []).map((x) => h('tr', {},
    h('td', {}, x.module || '未分类'),
    h('td', { class: 'num' }, x.total_q || 0),
    h('td', { class: 'num' }, x.correct_q || 0),
    h('td', { class: 'num' }, x.total_q ? pct(x.correct_q / x.total_q) : '—'),
    h('td', { class: 'num' }, x.duration_sec ? fmtSec(x.duration_sec) : '—'),
  ));
  dialog.append(
    h('div', { class: 'dialog-head' },
      h('div', {}, h('h2', {}, `${training.trained_on} · ${sourceLabel(training.source)}`), h('p', { class: 'subtle' }, `${training.total_q} 题 · ${training.correct_q} 对 · ${training.total_q ? pct(training.correct_q / training.total_q) : '—'}`)),
      h('button', { class: 'icon-button', onclick: () => dialog.close(), 'aria-label': '关闭' }, '×'),
    ),
    h('div', { class: 'method-drawer-body' },
      moduleRows.length ? tableWrap(h('table', {}, h('thead', {}, h('tr', {}, ...['模块', '题量', '正确', '正确率', '用时'].map((x) => h('th', {}, x)))), h('tbody', {}, ...moduleRows))) : null,
      h('section', {}, h('h3', {}, `本次题目 · ${questions.length}`), h('div', { class: 'training-question-list' }, ...questions.slice(0, 80).map((q) => h('div', { class: 'training-question-row' }, h('span', { class: `answer-mark ${q.is_correct ? 'correct' : 'wrong'}` }, q.is_correct ? '对' : '错'), h('div', {}, h('strong', {}, `${q.seq}. ${q.stem_md || '题干以图片为准'}`), h('small', {}, `${q.module || '未分类'} · 你的答案 ${q.user_answer || '—'} · 正确答案 ${q.correct_answer || '—'}`))))),
    ),
  );
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
}

async function renderRecordTab(host) {
  const groups = await api('/api/trainings');
  const rows = Object.values(groups).flat();
  const totalQ = rows.reduce((sum, x) => sum + Number(x.total_q || 0), 0);
  const correctQ = rows.reduce((sum, x) => sum + Number(x.correct_q || 0), 0);
  const seconds = rows.reduce((sum, x) => sum + Number(x.duration_sec || 0), 0);
  host.append(h('div', { class: 'inline-stat-strip' },
    numberStat('训练次数', String(rows.length), '按一次导入或一次手工训练计'),
    numberStat('累计题量', String(totalQ), '真实入库作答'),
    numberStat('整体正确率', totalQ ? pct(correctQ / totalQ) : '—', '按题量加权'),
    numberStat('记录用时', seconds ? fmtSec(seconds) : '—', '仅统计有计时数据的训练'),
  ));
  if (!rows.length) {
    host.append(h('div', { class: 'empty' }, '还没有训练记录。上传一份训练 PDF 后会自动进入这里。'));
    return;
  }
  const source = h('select', { class: 'study-filter-select' }, h('option', { value: '' }, '全部来源'), ...[...new Set(rows.map((x) => x.source))].map((x) => h('option', { value: x }, sourceLabel(x))));
  const body = h('tbody', {});
  const draw = () => {
    clear(body);
    rows.filter((x) => !source.value || x.source === source.value).sort((a, b) => `${b.trained_on}-${b.id}`.localeCompare(`${a.trained_on}-${a.id}`)).forEach((x) => body.append(h('tr', {},
      h('td', {}, x.trained_on),
      h('td', {}, sourceLabel(x.source)),
      h('td', { class: 'num' }, x.total_q),
      h('td', { class: 'num' }, x.correct_q),
      h('td', { class: 'num' }, x.total_q ? pct(x.correct_q / x.total_q) : '—'),
      h('td', { class: 'num' }, x.duration_sec ? fmtSec(x.duration_sec) : '—'),
      h('td', {}, tag(x.data_confidence === 'verified' ? '已核验' : '待核验', x.data_confidence === 'verified' ? 'correct' : 'pending')),
      h('td', {}, h('button', { class: 'text-btn', onclick: () => showTrainingDetail(x.id) }, '查看')),
    )));
  };
  source.onchange = draw;
  host.append(h('div', { class: 'study-toolbar' }, source), tableWrap(h('table', {},
    h('thead', {}, h('tr', {}, ...['日期', '来源', '题量', '正确', '正确率', '用时', '数据状态', ''].map((x) => h('th', {}, x)))), body,
  )));
  draw();
}

async function renderBankTab(host) {
  const rows = await api('/api/question-bank');
  const moduleSelect = h('select', { class: 'study-filter-select' }, h('option', { value: '' }, '全部模块'), ...['资料分析', '判断推理', '言语理解', '数量关系', '常识判断', '未分类'].map((x) => h('option', { value: x }, x)));
  const search = h('input', { class: 'study-search-input', placeholder: '搜索题干或题型' });
  const count = h('span', { class: 'study-result-count' }, `${rows.length} 题`);
  const list = h('div', { class: 'bank-grid' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const filtered = rows.filter((row) => (!moduleSelect.value || row.module === moduleSelect.value) && (!q || `${row.stem_md || ''} ${row.subtype || ''}`.toLowerCase().includes(q)));
    count.textContent = `${filtered.length} 题`;
    clear(list);
    if (!filtered.length) {
      list.append(h('div', { class: 'empty' }, '当前筛选下没有题目。'));
      return;
    }
    filtered.forEach((row) => {
      const thumb = (row.images || [])[0] || (row.material_images || [])[0];
      list.append(h('article', { class: 'bank-card' },
        h('div', { class: 'bank-meta' }, tag(row.module || '未分类'), row.subtype ? h('span', {}, row.subtype) : null, h('span', {}, `作答 ${row.attempt_count || 0} 次`), h('span', {}, `正确率 ${row.attempt_count ? pct(row.accuracy) : '—'}`)),
        h('h3', {}, row.stem_md || '题干以原图为准'),
        thumb ? h('img', { class: 'bank-thumb', src: imageSrc(thumb), loading: 'lazy' }) : null,
        h('div', { class: 'bank-answer' }, `参考答案 ${row.correct_answer || '—'} · 最近作答 ${row.last_attempted_on || '—'}`),
      ));
    });
  };
  moduleSelect.onchange = draw;
  search.oninput = draw;
  host.append(h('div', { class: 'study-toolbar' }, h('div', { class: 'study-search' }, search), moduleSelect, count), list);
  draw();
}

export async function renderTrainingWorkspace(initialTab = null) {
  const params = new URLSearchParams(location.search || '');
  let tab = initialTab || params.get('tab') || 'records';
  clear(main).append(title('训练记录', '一次训练保留完整来源与成绩；题库保存规范题目，历次作答单独累积。'));
  const tabs = h('div', { class: 'workspace-tabs' });
  const host = h('section', { class: 'workspace-tab-body' });
  const draw = async () => {
    clear(tabs).append(
      tabButton('训练记录', tab === 'records', async () => { tab = 'records'; history.replaceState(null, '', '/trainings?tab=records'); await draw(); }),
      tabButton('题库', tab === 'bank', async () => { tab = 'bank'; history.replaceState(null, '', '/trainings?tab=bank'); await draw(); }),
    );
    clear(host);
    if (tab === 'bank') await renderBankTab(host);
    else await renderRecordTab(host);
  };
  main.append(tabs, host);
  await draw();
}

export async function renderTrainings() { return renderTrainingWorkspace('records'); }
export async function renderQuestionBank() { return renderTrainingWorkspace('bank'); }
