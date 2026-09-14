import { api, main, clear, h, tag, title, panel, tableWrap } from '../runtime.js';

function methodBlock(label, body, cls = '') {
  if (!body) return null;
  return h('section', { class: `method-accordion-block ${cls}`.trim() },
    h('strong', {}, label),
    typeof body === 'string' ? h('p', {}, body) : body,
  );
}

function methodCard(method, expanded, onToggle) {
  const signals = method.signals || [];
  const steps = method.steps || [];
  return h('article', { class: `method-accordion-card ${expanded ? 'expanded' : ''}` },
    h('button', { class: 'method-accordion-head', type: 'button', onclick: onToggle },
      h('div', { class: 'method-accordion-title' },
        h('div', { class: 'method-accordion-meta' },
          h('span', { class: 'method-id-badge' }, method.id),
          h('span', { class: 'method-module-badge' }, method.module || '综合'),
        ),
        h('h3', {}, method.title),
      ),
      h('div', { class: 'method-accordion-side' },
        method.exam_command ? h('span', { class: 'method-call-pill' }, method.exam_command) : null,
        h('span', { class: 'method-chevron', 'aria-hidden': 'true' }, expanded ? '−' : '+'),
      ),
    ),
    expanded ? h('div', { class: 'method-accordion-body' },
      h('div', { class: 'method-definition-grid' },
        methodBlock('方法定义', method.definition, 'definition'),
        methodBlock('核心破题机理', method.principle, 'principle'),
      ),
      signals.length ? methodBlock('考场触发特征', h('div', { class: 'method-signal-list' }, ...signals.map((x) => h('span', {}, x))), 'signals') : null,
      steps.length ? methodBlock('操作步骤与执行路径', h('ol', { class: 'method-execution-list' }, ...steps.map((x) => h('li', {}, x))), 'steps') : null,
      h('div', { class: 'method-example-boundary-grid' },
        methodBlock('实战例证', method.example, 'example'),
        methodBlock('适用边界与避坑', method.boundary, 'boundary'),
      ),
      method.comparison ? methodBlock('相邻方法如何选择', method.comparison, 'comparison') : null,
      h('div', { class: 'method-accordion-foot' },
        h('span', {}, method.evidence || method.source_note || '来源见 V2 正文'),
        method.node_slug ? h('a', { href: `/knowledge#method-${method.id}` }, '进入对应知识点') : h('span', {}, '暂未映射知识节点'),
      ),
    ) : null,
  );
}

async function renderFormalMethods(host) {
  const methods = await api('/api/knowledge/methods');
  const modules = [...new Set(methods.map((x) => x.module).filter(Boolean))];
  let expandedId = methods[0]?.id || null;
  const search = h('input', { class: 'study-search-input method-search-input', placeholder: '搜索方法名称、识别特征、核心口诀或关键词…' });
  const moduleSelect = h('select', { class: 'study-filter-select' },
    h('option', { value: '' }, `全部模块 (${methods.length})`),
    ...modules.map((name) => h('option', { value: name }, name)),
  );
  const count = h('span', { class: 'study-result-count' }, `${methods.length} 种`);
  const list = h('div', { class: 'method-accordion-list' });

  const draw = () => {
    const needle = search.value.trim().toLowerCase();
    const filtered = methods.filter((method) => {
      if (moduleSelect.value && method.module !== moduleSelect.value) return false;
      if (!needle) return true;
      const hay = [
        method.id,
        method.title,
        method.definition,
        method.principle,
        method.exam_command,
        method.boundary,
        ...(method.signals || []),
        ...(method.steps || []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
    count.textContent = `${filtered.length} 种`;
    clear(list);
    if (!filtered.length) {
      list.append(h('div', { class: 'empty' }, '暂无匹配的方法。'));
      return;
    }
    if (!filtered.some((m) => m.id === expandedId)) expandedId = filtered[0].id;
    filtered.forEach((method) => list.append(methodCard(method, method.id === expandedId, () => {
      expandedId = expandedId === method.id ? null : method.id;
      draw();
    })));
  };

  search.oninput = draw;
  moduleSelect.onchange = draw;
  host.append(
    h('div', { class: 'method-source-note' },
      h('div', {},
        h('strong', {}, 'V2 正式方法正文'),
        h('p', {}, '79 个正式方法按原始方法单元完整展示，保留识别信号、原理、步骤、例题、边界和考场调用指令。'),
      ),
      h('button', { class: 'secondary', type: 'button', onclick: () => window.openGlobalCoach?.('请根据我当前打开的方法，帮我判断识别信号、执行步骤和失效边界。') }, '问 AI 教练'),
    ),
    h('div', { class: 'method-filter-bar' },
      h('div', { class: 'method-search-wrap' }, search),
      moduleSelect,
      count,
    ),
    list,
  );
  draw();
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
    '79 项考场实战核心方法库',
    '正式 V2 方法与个人训练结论分开保存。正式方法直接按 Gemini 版本的方法卡片布局展开，但内容仍读取当前平台的 79 个真实方法单元。',
  ));
  const tabs = h('div', { class: 'workspace-tabs method-tabs' });
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
