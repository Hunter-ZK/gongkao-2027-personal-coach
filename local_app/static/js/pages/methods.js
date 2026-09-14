import { api, main, clear, h, tag, title, panel, tableWrap } from '../runtime.js';

let activeMethodId = null;

function methodDetail(method) {
  if (!method) return h('div', { class: 'study-empty-state' }, h('strong', {}, '选择一个正式方法'));
  return h('article', { class: 'method-detail formal-method-detail' },
    h('header', { class: 'method-detail-head' },
      h('div', { class: 'method-detail-meta' }, tag(method.id), tag(method.module), method.node_slug ? tag('已映射知识节点', 'correct') : tag('待映射', 'pending')),
      h('h2', {}, method.title),
      method.definition ? h('p', { class: 'method-detail-lead' }, method.definition) : null,
      method.node_slug ? h('a', { class: 'secondary', href: `/knowledge#method-${method.id}` }, '进入知识体系学习') : null,
    ),
    method.signals?.length ? h('section', { class: 'method-detail-block signals' }, h('h3', {}, '识别信号'), h('ul', {}, ...method.signals.map((x) => h('li', {}, x)))) : null,
    method.principle ? h('section', { class: 'method-detail-block' }, h('h3', {}, '底层原理'), h('p', {}, method.principle)) : null,
    method.steps?.length ? h('section', { class: 'method-detail-block' }, h('h3', {}, '标准操作'), h('ol', { class: 'method-step-list' }, ...method.steps.map((x) => h('li', {}, x)))) : null,
    method.example ? h('section', { class: 'method-detail-block example' }, h('h3', {}, '完整例题'), h('p', {}, method.example)) : null,
    method.boundary ? h('section', { class: 'method-detail-block boundary' }, h('h3', {}, '易错点 / 失效边界'), h('p', {}, method.boundary)) : null,
    method.comparison ? h('section', { class: 'method-detail-block' }, h('h3', {}, '相邻方法如何选择'), h('p', {}, method.comparison)) : null,
    method.exam_command ? h('section', { class: 'method-detail-block command' }, h('h3', {}, '考场调用指令'), h('p', {}, method.exam_command)) : null,
    h('section', { class: 'method-source-card' }, h('strong', {}, '来源与证据'), h('p', {}, method.evidence || method.source_note || '来源见 V2 正文')),
  );
}

async function renderFormalMethods(host) {
  const methods = await api('/api/knowledge/methods');
  const modules = ['资料分析', '判断推理', '言语理解', '数量关系', '常识判断'];
  const query = h('input', { class: 'study-search-input', placeholder: '搜索方法、识别信号、原理或考场指令' });
  const moduleSelect = h('select', { class: 'study-filter-select' }, h('option', { value: '' }, '全部模块'), ...modules.map((name) => h('option', { value: name }, name)));
  const count = h('span', { class: 'study-result-count' }, `${methods.length} 个正式方法`);
  const list = h('div', { class: 'method-list' });
  const detail = h('div', { class: 'panel method-detail-host' });

  const drawDetail = (id) => {
    activeMethodId = id;
    const selected = methods.find((method) => method.id === id) || methods[0];
    clear(detail).append(methodDetail(selected));
    list.querySelectorAll('.method-list-item').forEach((node) => node.classList.toggle('active', node.dataset.id === selected?.id));
  };
  const drawList = () => {
    const needle = query.value.trim().toLowerCase();
    const filtered = methods.filter((method) => {
      if (moduleSelect.value && method.module !== moduleSelect.value) return false;
      if (!needle) return true;
      const hay = [method.id, method.title, method.definition, method.principle, method.exam_command, ...(method.signals || []), ...(method.steps || [])].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
    count.textContent = `${filtered.length} 个正式方法`;
    clear(list);
    filtered.forEach((method) => list.append(h('button', {
      class: `method-list-item ${method.id === activeMethodId ? 'active' : ''}`,
      'data-id': method.id,
      onclick: () => drawDetail(method.id),
    },
      h('span', { class: 'method-list-id' }, method.id),
      h('span', { class: 'method-list-copy' }, h('strong', {}, method.title), h('small', {}, `${method.module} · ${method.node_slug ? '已进入知识节点' : '待映射'}`)),
    )));
    if (!filtered.length) clear(detail).append(h('div', { class: 'study-empty-state compact' }, h('strong', {}, '没有匹配方法')));
    else if (!filtered.some((method) => method.id === activeMethodId)) drawDetail(filtered[0].id);
  };
  query.oninput = drawList;
  moduleSelect.onchange = drawList;
  host.append(
    h('div', { class: 'method-library-intro' },
      h('strong', {}, 'V2 正式方法库'),
      h('p', {}, '79 个正式方法单元来自“六位老师公开方法系统整理 + GitHub Skill 融合深化 V2”。这里保留完整方法正文；知识体系按固定映射把它们组织到 30 个节点。'),
      h('a', { class: 'secondary', href: '/coach' }, '用 DeepSeek 即时提问'),
    ),
    h('div', { class: 'method-toolbar' }, h('div', { class: 'method-search-wrap' }, query), moduleSelect, count),
    h('div', { class: 'method-library-shell' }, list, detail),
  );
  activeMethodId = methods[0]?.id || null;
  drawList();
}

async function renderPersonalMethods(host) {
  const methods = await api('/api/methods');
  if (!methods.length) {
    host.append(panel('个人方法记录', h('div', { class: 'empty' }, '还没有个人方法结论。它应来自你的真实训练与复盘，不与正式 V2 方法正文混在一起。')));
    return;
  }
  const rows = methods.map((method) => h('tr', {},
    h('td', {}, method.name),
    h('td', {}, method.applies_to || '—'),
    h('td', {}, method.source || '—'),
    h('td', {}, tag(method.adoption, method.adoption === '主方法' ? 'correct' : method.adoption === '明确拒绝' ? 'wrong' : 'pending')),
    h('td', {}, method.basis || '—'),
  ));
  host.append(panel('个人方法记录', tableWrap(h('table', {},
    h('thead', {}, h('tr', {}, ...['方法', '适用范围', '来源', '采用级别', '依据'].map((label) => h('th', {}, label)))),
    h('tbody', {}, ...rows),
  ))));
}

export async function renderMethods() {
  clear(main).append(title(
    '方法库与结论',
    '正式 V2 方法和你的个人训练结论分开保存：前者是教材底稿，后者是经过你自己验证后沉淀的规则。',
    '',
    [h('a', { class: 'primary', href: '/coach' }, '打开 AI 方法教练')],
  ));
  const tabs = h('div', { class: 'workspace-tabs' });
  const host = h('section', { class: 'workspace-tab-body' });
  let tab = 'formal';
  const draw = async () => {
    clear(tabs).append(
      h('button', { class: `workspace-tab ${tab === 'formal' ? 'active' : ''}`, onclick: async () => { tab = 'formal'; await draw(); } }, 'V2 正式方法库'),
      h('button', { class: `workspace-tab ${tab === 'personal' ? 'active' : ''}`, onclick: async () => { tab = 'personal'; await draw(); } }, '个人方法与结论'),
    );
    clear(host);
    if (tab === 'formal') await renderFormalMethods(host);
    else await renderPersonalMethods(host);
  };
  main.append(tabs, host);
  await draw();
}
