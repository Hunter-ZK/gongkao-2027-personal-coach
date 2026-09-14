import { api, main, clear, h, title, metric, tag } from '../runtime.js';

const MODULES = ['全部', '资料分析', '判断推理', '言语理解', '数量关系', '常识判断'];
let catalog = [];
let activeModule = '全部';
let activeId = null;
let query = '';

function textList(items = []) {
  return h('ol', { class: 'method-step-list' }, ...items.map((x) => h('li', {}, x)));
}

function block(name, body, cls = '') {
  if (!body || (Array.isArray(body) && !body.length)) return null;
  return h(
    'section',
    { class: `method-detail-block ${cls}` },
    h('h3', {}, name),
    Array.isArray(body) ? textList(body) : h('p', {}, body),
  );
}

function methodMatches(x) {
  if (activeModule !== '全部' && x.module !== activeModule) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [x.id, x.title, x.module, x.definition, x.principle, x.exam_command, x.source_note, ...(x.signals || []), ...(x.steps || [])]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
    .includes(q);
}

function renderDetail(method) {
  const host = document.querySelector('#method-detail');
  if (!host) return;
  clear(host);
  if (!method) {
    host.append(h('div', { class: 'empty method-empty' }, '当前筛选下没有匹配方法。'));
    return;
  }
  activeId = method.id;
  document.querySelectorAll('.method-list-item').forEach((el) => el.classList.toggle('active', el.dataset.id === activeId));
  host.append(
    h('div', { class: 'method-detail-head' },
      h('div', {},
        h('div', { class: 'method-kicker' }, h('span', { class: 'method-id' }, method.id), tag(method.module), tag(method.evidence || '来源待核验', 'pending')),
        h('h2', {}, method.title),
        h('p', {}, method.definition || ''),
      ),
      h('a', { class: 'primary', href: '/coach' }, '打开 AI 教练'),
    ),
    block('识别信号', method.signals, 'signals'),
    block('底层原理', method.principle),
    block('标准操作', method.steps, 'steps'),
    block('完整例题', method.example, 'example'),
    block('易错点 / 失效边界', method.boundary, 'boundary'),
    block('与相邻方法如何选择', method.comparison),
    block('考场调用指令', method.exam_command, 'command'),
    h('section', { class: 'method-source-card' },
      h('h3', {}, '来源与证据'),
      h('p', {}, method.source_note || '—'),
      h('small', {}, '说明：GitHub Skill 属于二次整理证据；只有本地材料明确标注一手证据时，才按老师本人方法表述。'),
    ),
  );
}

function renderList() {
  const host = document.querySelector('#method-list');
  if (!host) return;
  const rows = catalog.filter(methodMatches);
  clear(host);
  host.append(h('div', { class: 'method-list-count' }, `${rows.length} 个方法`));
  rows.forEach((x) => host.append(h(
    'button',
    { class: `method-list-item ${x.id === activeId ? 'active' : ''}`, 'data-id': x.id, onclick: () => renderDetail(x) },
    h('span', { class: 'method-list-id' }, x.id),
    h('span', { class: 'method-list-copy' }, h('strong', {}, x.title), h('small', {}, `${x.module} · ${x.evidence || '已登记来源'}`)),
  )));
  const next = rows.find((x) => x.id === activeId) || rows[0];
  renderDetail(next || null);
}

function renderFilters(summary) {
  return h(
    'div',
    { class: 'method-toolbar' },
    h('div', { class: 'method-tabs' }, ...MODULES.map((name) => h(
      'button',
      { class: name === activeModule ? 'active' : '', onclick: () => { activeModule = name; renderFiltersInto(summary); renderList(); } },
      name === '全部' ? `全部 ${summary.total}` : `${name} ${summary.counts?.[name] || 0}`,
    ))),
    h('div', { class: 'method-search-wrap' },
      h('span', {}, '⌕'),
      h('input', { id: 'method-search', value: query, placeholder: '搜索：415、削弱、逻辑填空、工程…', oninput: (ev) => { query = ev.target.value; renderList(); } }),
    ),
  );
}

function renderFiltersInto(summary) {
  const old = document.querySelector('#method-toolbar-host');
  if (!old) return;
  clear(old).append(renderFilters(summary));
}

export async function renderXingceMethodSystem() {
  const [summary, methods] = await Promise.all([
    api('/api/knowledge/method-summary'),
    api('/api/knowledge/methods'),
  ]);
  catalog = methods;
  activeId = catalog[0]?.id || null;

  clear(main).append(title(
    '行测方法体系',
    '80 个可独立学习、可被 AI 教练检索调用的方法。每个方法都必须回答：怎么识别、为什么有效、具体怎么做、什么时候失效。',
    'METHOD OPERATING SYSTEM',
    [h('a', { class: 'secondary', href: '/knowledge?view=nodes' }, '查看 30 个知识节点')],
  ));

  main.append(h(
    'div',
    { class: 'kpi-grid' },
    metric('可调用方法', String(summary.total), '个', 100, '✦', 'green'),
    metric('资料分析', String(summary.counts?.['资料分析'] || 0), '个', null, 'Σ', 'cyan'),
    metric('判断 + 言语', String((summary.counts?.['判断推理'] || 0) + (summary.counts?.['言语理解'] || 0)), '个', null, '◇'),
    metric('数量 + 常识', String((summary.counts?.['数量关系'] || 0) + (summary.counts?.['常识判断'] || 0)), '个', null, '≡', 'amber'),
  ));

  main.append(
    h('div', { id: 'method-toolbar-host' }, renderFilters(summary)),
    h('div', { class: 'method-library-shell' },
      h('aside', { class: 'panel method-list', id: 'method-list' }),
      h('article', { class: 'knowledge-reader method-detail', id: 'method-detail' }),
    ),
  );
  renderList();
}
