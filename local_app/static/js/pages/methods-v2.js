import { api, main, clear, h, title, metric, tag } from '../runtime.js';

const MODULES = ['全部', '资料分析', '判断推理', '言语理解', '数量关系', '常识判断'];
let catalog = [];
let activeModule = '全部';
let activeId = null;
let query = '';

function list(items = []) {
  return h('ol', { class: 'method-step-list method-step-list-v2' }, ...items.map((x, i) => h('li', {}, h('span', { class: 'step-no' }, String(i + 1).padStart(2, '0')), h('span', {}, x))));
}

function section(icon, name, body, cls = '') {
  if (!body || (Array.isArray(body) && !body.length)) return null;
  return h('section', { class: `method-detail-block method-detail-block-v2 ${cls}` },
    h('div', { class: 'method-block-head' }, h('span', { class: 'method-block-icon' }, icon), h('h3', {}, name)),
    Array.isArray(body) ? list(body) : h('p', {}, body),
  );
}

function matches(x) {
  if (activeModule !== '全部' && x.module !== activeModule) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [x.id, x.title, x.module, x.definition, x.principle, x.exam_command, x.source_note, ...(x.signals || []), ...(x.steps || [])]
    .filter(Boolean).join('\n').toLowerCase().includes(q);
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text || '');
    const old = button.textContent;
    button.textContent = '已复制';
    setTimeout(() => { button.textContent = old; }, 1500);
  } catch {
    alert('复制失败，请手动选择文本。');
  }
}

function renderDetail(method) {
  const host = document.querySelector('#method-detail');
  if (!host) return;
  clear(host);
  if (!method) {
    host.append(h('div', { class: 'study-empty-state large' }, h('strong', {}, '当前筛选没有匹配方法'), h('span', {}, '换一个模块或关键词再试。')));
    return;
  }
  activeId = method.id;
  document.querySelectorAll('.method-list-item').forEach((el) => el.classList.toggle('active', el.dataset.id === activeId));
  const command = method.exam_command || '';
  const copyBtn = h('button', { class: 'secondary compact-btn', onclick: (ev) => copyText(command, ev.currentTarget) }, '复制调用指令');

  host.append(
    h('header', { class: 'method-detail-head method-detail-head-v2' },
      h('div', { class: 'method-head-main' },
        h('div', { class: 'method-kicker method-kicker-v2' },
          h('span', { class: 'method-id method-id-v2' }, method.id),
          tag(method.module),
          tag(method.evidence || '来源待核验', 'pending'),
        ),
        h('h2', {}, method.title),
        h('p', { class: 'method-definition' }, method.definition || ''),
      ),
      h('div', { class: 'method-head-actions' }, h('a', { class: 'primary', href: '/coach' }, '✦ AI 深挖'), copyBtn),
    ),
    command ? h('section', { class: 'method-command-card' },
      h('span', { class: 'study-overline' }, '考场调用指令'),
      h('strong', {}, command),
      h('small', {}, '目标不是背句子，而是把识别信号压缩成可自动触发的动作。'),
    ) : null,
    h('div', { class: 'method-detail-grid' },
      section('⌁', '识别信号', method.signals, 'signals'),
      section('◎', '底层原理', method.principle, 'principle'),
      section('→', '标准操作', method.steps, 'steps'),
      section('✎', '完整例题', method.example, 'example'),
      section('!', '易错点 / 失效边界', method.boundary, 'boundary'),
      section('⇄', '与相邻方法如何选择', method.comparison, 'comparison'),
    ),
    h('section', { class: 'method-source-card method-source-card-v2' },
      h('div', {}, h('span', { class: 'study-overline' }, '来源与证据'), h('h3', {}, method.source_method_label || '方法来源')),
      h('p', {}, method.source_note || '—'),
      h('small', {}, 'GitHub Skill 仅作为二次整理证据；只有本地材料明确标注一手证据时，才按老师本人方法表述。'),
    ),
  );
}

function renderList() {
  const host = document.querySelector('#method-list');
  if (!host) return;
  const rows = catalog.filter(matches);
  clear(host);
  host.append(h('div', { class: 'method-list-head' },
    h('div', {}, h('span', { class: 'study-overline' }, '方法目录'), h('strong', {}, `${rows.length} 个方法`)),
    h('span', {}, activeModule === '全部' ? '全部模块' : activeModule),
  ));
  if (!rows.length) {
    host.append(h('div', { class: 'study-empty-state compact' }, h('strong', {}, '没有匹配方法'), h('span', {}, '调整筛选条件后再试。')));
  }
  rows.forEach((x) => host.append(h('button', {
    class: `method-list-item method-list-item-v2 ${x.id === activeId ? 'active' : ''}`,
    'data-id': x.id,
    onclick: () => renderDetail(x),
  },
  h('span', { class: 'method-list-id method-list-id-v2' }, x.id),
  h('span', { class: 'method-list-copy method-list-copy-v2' },
    h('span', { class: 'method-list-meta' }, x.module, h('i', {}, '·'), x.evidence || '已登记来源'),
    h('strong', {}, x.title),
    h('small', {}, x.definition || '查看完整方法说明'),
  ),
  h('span', { class: 'method-list-arrow' }, '›'),
  )));
  const next = rows.find((x) => x.id === activeId) || rows[0];
  renderDetail(next || null);
}

function filters(summary) {
  return h('div', { class: 'method-toolbar method-toolbar-v2' },
    h('div', { class: 'method-tabs method-tabs-v2' }, ...MODULES.map((name) => h('button', {
      class: name === activeModule ? 'active' : '',
      onclick: () => { activeModule = name; renderFilters(summary); renderList(); },
    }, name === '全部' ? `全部 ${summary.total}` : `${name} ${summary.counts?.[name] || 0}`))),
    h('div', { class: 'method-search-wrap method-search-wrap-v2' },
      h('span', {}, '⌕'),
      h('input', { value: query, placeholder: '搜索方法、公式、识别信号…', oninput: (ev) => { query = ev.target.value; renderList(); } }),
    ),
  );
}

function renderFilters(summary) {
  const host = document.querySelector('#method-toolbar-host');
  if (host) clear(host).append(filters(summary));
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
    '不是技巧清单，而是一套可以检索、理解、演练和调用的方法操作系统。每个方法都保留识别信号、原理、步骤、例题和失效边界。',
    'METHOD OPERATING SYSTEM',
    [h('a', { class: 'secondary', href: '/knowledge?view=nodes' }, '查看知识节点')],
  ));

  main.append(
    h('section', { class: 'method-overview-card' },
      h('div', { class: 'method-overview-main' },
        h('span', { class: 'study-overline' }, '79 个正式方法单元 · 同源给 AI 教练'),
        h('h2', {}, '先识别，再选择方法；先知道边界，再追求速度。'),
        h('p', {}, '这里展示的是可直接用于训练和考场调用的方法正文。来源层级与方法内容分开展示，避免“谁说的”替代“为什么有效”。'),
      ),
      h('div', { class: 'method-overview-metrics' },
        metric('正式方法', String(summary.total), '个', 100, '✦', 'green'),
        metric('资料分析', String(summary.counts?.['资料分析'] || 0), '个', null, 'Σ', 'cyan'),
        metric('判断 + 言语', String((summary.counts?.['判断推理'] || 0) + (summary.counts?.['言语理解'] || 0)), '个', null, '◇'),
        metric('数量 + 常识', String((summary.counts?.['数量关系'] || 0) + (summary.counts?.['常识判断'] || 0)), '个', null, '≡', 'amber'),
      ),
    ),
    h('div', { id: 'method-toolbar-host' }, filters(summary)),
    h('div', { class: 'method-library-shell method-library-shell-v2' },
      h('aside', { class: 'method-list method-list-v2', id: 'method-list' }),
      h('article', { class: 'knowledge-reader method-detail method-detail-v2', id: 'method-detail' }),
    ),
  );
  renderList();
}
