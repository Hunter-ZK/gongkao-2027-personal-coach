import { api, jpost, main, clear, h, pct, tag, title } from '../runtime.js';

let activeKnowledgeSlug = null;
let activeSubject = 'xingce';
let methodCatalog = [];

function nodeModule(row) {
  const value = row?.module_names;
  if (!value) return '综合';
  if (typeof value === 'string') return value || '综合';
  if (Array.isArray(value)) return value.find(Boolean) || '综合';
  if (typeof value === 'object') return value.guangdong || value.national || value.default || Object.values(value).find(Boolean) || '综合';
  return '综合';
}

function masteryLabel(row) { return row?.state || '尚无训练证据'; }
function masteryLevel(row) {
  const value = String(row?.state || '');
  if (/掌握|稳定|通过/.test(value)) return 4;
  if (/形成|熟练/.test(value)) return 3;
  if (/学习|训练|观察/.test(value)) return 2;
  if (/薄弱|危险|反复/.test(value)) return 1;
  return 0;
}
function masteryBadge(row) {
  return h('span', { class: 'mastery-badge', 'data-level': String(masteryLevel(row)) },
    h('span', { class: 'mastery-dot' }), masteryLabel(row));
}
function accuracyText(row) { return row?.accuracy == null ? '—' : pct(row.accuracy); }
function avgTimeText(row) { return row?.avg_seconds == null ? '—' : `${Math.round(row.avg_seconds)}s`; }
function compactText(text, max = 120) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
function knowledgeTone(row) {
  const level = masteryLevel(row);
  if (level >= 4) return 'is-good';
  if (level === 1) return 'is-risk';
  if (level >= 2) return 'is-warn';
  return 'is-neutral';
}
function methodsForNode(slug) {
  return methodCatalog
    .filter((method) => method.node_slug === slug)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}

function signalChip(text, contextHost = null) {
  const button = h('button', { class: 'knowledge-signal-chip', type: 'button' }, text);
  button.onclick = () => {
    document.querySelectorAll('.knowledge-signal-chip.active').forEach((node) => {
      if (node !== button) node.classList.remove('active');
    });
    button.classList.toggle('active');
    if (contextHost) {
      contextHost.textContent = button.classList.contains('active')
        ? `识别提示：题目出现“${text}”时，优先检查当前方法是否满足适用条件；不要只凭关键词直接套公式。`
        : '点击任一信号词，快速加载它在考场中的作用。';
    }
  };
  return button;
}

function methodMiniCard(method, index) {
  return h('a', { class: 'knowledge-method-mini', href: `#method-${method.id}` },
    h('span', { class: 'method-mini-index' }, String(index + 1).padStart(2, '0')),
    h('div', {},
      h('strong', {}, method.title),
      h('small', {}, compactText(method.exam_command || method.definition || '点击展开完整方法', 72)),
    ),
  );
}

function methodLearningCard(method, index) {
  const signalHint = h('div', { class: 'signal-hint' }, '点击任一信号词，快速加载它在考场中的作用。');
  const source = method.evidence || method.source_note || '来源见 V2 正文';
  const card = h('details', { class: 'knowledge-method-card', id: `method-${method.id}`, open: index === 0 },
    h('summary', { class: 'knowledge-method-summary' },
      h('span', { class: 'knowledge-method-index' }, String(index + 1).padStart(2, '0')),
      h('div', { class: 'knowledge-method-summary-copy' },
        h('div', { class: 'knowledge-method-kicker' }, `${method.id} · ${method.module || '行测'}`),
        h('strong', {}, method.title),
        h('small', {}, compactText(method.exam_command || method.definition, 100)),
      ),
      h('span', { class: 'knowledge-expand-label' }, '展开学习'),
    ),
    h('div', { class: 'knowledge-method-body' },
      h('div', { class: 'knowledge-card-grid two' },
        h('section', { class: 'knowledge-micro-card definition' },
          h('span', { class: 'knowledge-card-label' }, '先理解它是什么'),
          h('p', {}, method.definition || '—'),
        ),
        h('section', { class: 'knowledge-micro-card principle' },
          h('span', { class: 'knowledge-card-label' }, '底层原理'),
          h('p', {}, method.principle || '—'),
        ),
      ),
      h('section', { class: 'knowledge-vocab-card' },
        h('div', { class: 'knowledge-card-title-row' },
          h('div', {}, h('span', { class: 'knowledge-card-label' }, '识别信号词库'), h('strong', {}, '看到这些特征，先想到这个方法')),
          h('small', {}, `${(method.signals || []).length} 个信号`),
        ),
        h('div', { class: 'knowledge-signal-cloud' }, ...(method.signals || []).map((item) => signalChip(item, signalHint))),
        signalHint,
      ),
      h('section', { class: 'knowledge-steps-card' },
        h('div', { class: 'knowledge-card-title-row' },
          h('div', {}, h('span', { class: 'knowledge-card-label' }, '标准操作'), h('strong', {}, '考场按顺序执行')),
          h('small', {}, `${(method.steps || []).length} 步`),
        ),
        h('div', { class: 'knowledge-step-list' }, ...(method.steps || []).map((step, stepIndex) => h('div', { class: 'knowledge-step' },
          h('span', {}, String(stepIndex + 1).padStart(2, '0')),
          h('p', {}, step),
        ))),
      ),
      method.exam_command ? h('section', { class: 'knowledge-command-card' },
        h('span', {}, '考场调用指令'),
        h('strong', {}, method.exam_command),
      ) : null,
      h('div', { class: 'knowledge-card-grid two' },
        method.boundary ? h('section', { class: 'knowledge-micro-card boundary' },
          h('span', { class: 'knowledge-card-label' }, '陷阱 / 边界 / 止损'),
          h('p', {}, method.boundary),
        ) : null,
        method.comparison ? h('section', { class: 'knowledge-micro-card compare' },
          h('span', { class: 'knowledge-card-label' }, '与相邻方法怎么选'),
          h('p', {}, method.comparison),
        ) : null,
      ),
      method.example ? h('details', { class: 'knowledge-example-card' },
        h('summary', {}, '展开完整例题与示范路径'),
        h('div', { class: 'knowledge-example-body' }, method.example),
      ) : null,
      h('div', { class: 'knowledge-source-foot' }, h('strong', {}, '来源与证据'), h('span', {}, source)),
    ),
  );
  return card;
}

function quickRecoverySection(meta, methods, mistakeCount) {
  const first = methods[0];
  const allSignals = [...new Set(methods.flatMap((method) => method.signals || []))].slice(0, 10);
  const hint = h('div', { class: 'signal-hint' }, '点击信号词查看考场提示。');
  return h('section', { class: 'knowledge-mode-section' },
    h('div', { class: 'knowledge-section-head' },
      h('div', {}, h('span', {}, '30 秒快速恢复'), h('h2', {}, '先把“识别 → 动作 → 止损”加载回来')),
      h('small', {}, '适合工作间隙 / 训练前快速复习'),
    ),
    h('div', { class: 'knowledge-recovery-grid' },
      h('article', { class: 'knowledge-recovery-card signal' },
        h('span', {}, '① 看到什么'),
        h('strong', {}, allSignals.length ? '识别信号' : '先看题型结构'),
        allSignals.length
          ? h('div', { class: 'knowledge-signal-cloud compact' }, ...allSignals.map((item) => signalChip(item, hint)))
          : h('p', {}, '当前节点尚未映射正式方法，先通过扩展讲义恢复题型框架。'),
        hint,
      ),
      h('article', { class: 'knowledge-recovery-card action' },
        h('span', {}, '② 第一动作'),
        h('strong', {}, first?.title || '读取主方法'),
        h('p', {}, first?.exam_command || first?.steps?.[0] || '先识别题型，再按标准方法执行。'),
      ),
      h('article', { class: 'knowledge-recovery-card stop' },
        h('span', {}, '③ 什么时候停'),
        h('strong', {}, '边界 / 止损'),
        h('p', {}, first?.boundary || '当前暂无明确止损规则，深度学习时补齐。'),
      ),
      h('article', { class: 'knowledge-recovery-card evidence' },
        h('span', {}, '④ 我的真实证据'),
        h('strong', {}, meta.accuracy == null ? '暂无有效样本' : `${accuracyText(meta)} 正确率`),
        h('p', {}, Number(meta.sample_n || 0)
          ? `${meta.sample_n} 个有效样本 · 平均 ${avgTimeText(meta)} · ${mistakeCount} 道关联错题`
          : `先做真实题再判断掌握；当前关联错题 ${mistakeCount} 道。`),
      ),
    ),
    methods.length ? h('section', { class: 'knowledge-method-map-card' },
      h('div', { class: 'knowledge-card-title-row' },
        h('div', {}, h('span', { class: 'knowledge-card-label' }, '本节点方法地图'), h('strong', {}, '先选入口，再深入一张方法卡')),
        h('small', {}, `${methods.length} 个正式方法`),
      ),
      h('div', { class: 'knowledge-method-mini-grid' }, ...methods.map(methodMiniCard)),
    ) : h('div', { class: 'knowledge-gap-card' },
      h('strong', {}, '当前节点暂无 V2 正式方法映射'),
      h('span', {}, '系统不会从其他节点临时拼接方法；可先阅读标准学习中的扩展讲义。'),
    ),
  );
}

function relatedMistakesSection(data) {
  if (!data.mistakes?.length) return h('div', { class: 'knowledge-empty-card' }, '当前没有真实关联错题。');
  return h('section', { class: 'knowledge-related-section-v2' },
    h('div', { class: 'knowledge-card-title-row' },
      h('div', {}, h('span', { class: 'knowledge-card-label' }, '我的真实错题'), h('strong', {}, '只看和当前节点直接相关的问题')),
      h('a', { class: 'text-link', href: '/mistakes' }, '打开错题本'),
    ),
    h('div', { class: 'knowledge-mistake-grid' }, ...data.mistakes.slice(0, 6).map((item) => h('article', { class: 'knowledge-mistake-card' },
      h('div', { class: 'knowledge-mistake-meta' }, tag(item.status, item.status === '已修复' ? 'correct' : 'pending'), h('span', {}, item.cause_primary || '错因待诊断')),
      h('p', {}, compactText(item.stem_md, 140)),
    ))),
  );
}

function standardLearningSection(data, methods) {
  return h('section', { class: 'knowledge-mode-section' },
    h('div', { class: 'knowledge-section-head' },
      h('div', {}, h('span', {}, '标准学习'), h('h2', {}, '方法拆成卡片，逐块吸收而不是连续读长文')),
      h('small', {}, '5–15 分钟专题学习'),
    ),
    methods.length
      ? h('div', { class: 'knowledge-method-stack' }, ...methods.map(methodLearningCard))
      : h('div', { class: 'knowledge-empty-card' }, '当前节点暂无正式 V2 方法；下方扩展讲义仍可学习。'),
    relatedMistakesSection(data),
    data.meta?.build_status !== '未建设' && data.html
      ? h('details', { class: 'knowledge-longform-gate' },
          h('summary', {},
            h('div', {}, h('strong', {}, '系统化扩展讲义'), h('small', {}, '需要完整原理、补充题型和主动回忆时再展开')),
            h('span', {}, '展开'),
          ),
          h('div', { class: 'study-note-prose knowledge-longform-body', html: data.html }),
        )
      : null,
  );
}

function deepLearningSection(data, methods) {
  const notes = (data.legacy_excerpts || []).filter((item) => item.text);
  return h('section', { class: 'knowledge-mode-section' },
    h('div', { class: 'knowledge-section-head' },
      h('div', {}, h('span', {}, '深度理解'), h('h2', {}, '来源、历史笔记与完整正文只在需要时打开')),
      h('small', {}, '周末 / 卡点专项'),
    ),
    h('div', { class: 'knowledge-deep-grid' },
      h('section', { class: 'knowledge-deep-card' },
        h('span', { class: 'knowledge-card-label' }, '正式方法来源'),
        h('strong', {}, `${methods.length} 个 V2 方法`),
        h('div', { class: 'knowledge-source-list' }, ...methods.map((method) => h('div', {},
          h('b', {}, `${method.id} · ${method.title}`),
          h('span', {}, method.evidence || method.source_note || '来源见 V2 正文'),
        ))),
      ),
      h('section', { class: 'knowledge-deep-card' },
        h('span', { class: 'knowledge-card-label' }, '个人证据'),
        h('strong', {}, `${Number(data.meta?.sample_n || 0)} 个有效训练样本`),
        h('p', {}, `正确率 ${accuracyText(data.meta)} · 平均 ${avgTimeText(data.meta)} · 关联错题 ${data.mistakes?.length || 0} 道。`),
      ),
    ),
    data.html ? h('details', { class: 'knowledge-longform-gate' },
      h('summary', {}, h('div', {}, h('strong', {}, '完整扩展讲义原文'), h('small', {}, '保留全部内容，不再默认铺满页面')), h('span', {}, '展开')),
      h('div', { class: 'study-note-prose knowledge-longform-body', html: data.html }),
    ) : null,
    notes.length ? h('section', { class: 'knowledge-history-section' },
      h('div', { class: 'knowledge-card-title-row' },
        h('div', {}, h('span', { class: 'knowledge-card-label' }, '四年前历史笔记'), h('strong', {}, '用于对照，不自动覆盖当前方法')),
        h('small', {}, `${notes.length} 份`),
      ),
      h('div', { class: 'knowledge-history-stack' }, ...notes.map((item, index) => h('details', { class: 'knowledge-history-card', open: false },
        h('summary', {}, h('span', {}, item.file_name || `历史笔记 ${index + 1}`), h('small', {}, '展开原文')),
        h('div', { class: 'knowledge-history-body' }, item.text),
      ))),
    ) : null,
  );
}

function modeTabs(sections) {
  let active = 'quick';
  const tabs = h('div', { class: 'knowledge-mode-tabs' });
  const host = h('div', { class: 'knowledge-mode-host' });
  const defs = [
    ['quick', '快速恢复', '30秒'],
    ['standard', '标准学习', '5–15分钟'],
    ['deep', '深度理解', '按需'],
  ];
  const draw = () => {
    clear(tabs);
    defs.forEach(([id, label, caption]) => tabs.append(h('button', {
      class: `knowledge-mode-tab ${active === id ? 'active' : ''}`,
      onclick: () => { active = id; draw(); },
    }, h('strong', {}, label), h('small', {}, caption))));
    clear(host).append(sections[active]);
  };
  draw();
  return h('div', {}, tabs, host);
}

export async function renderKnowledge(subject = 'xingce') {
  activeSubject = subject;
  const [rows, methods] = await Promise.all([
    api('/api/knowledge/tree'),
    subject === 'xingce' ? api('/api/knowledge/methods') : Promise.resolve([]),
  ]);
  methodCatalog = methods;
  const list = rows.filter((row) => row.subject === subject);
  const mappedCount = subject === 'xingce' ? methods.filter((method) => method.node_slug).length : 0;
  clear(main).append(title(
    subject === 'xingce' ? '行测知识与方法体系' : '申论知识与表达体系',
    subject === 'xingce'
      ? `用“快速恢复 → 标准学习 → 深度理解”三层阅读承载 ${list.length} 个知识节点与 ${mappedCount} 个正式方法；默认不再把长篇文字一次铺满。`
      : '申论能力节点、写作训练与复盘证据按卡片渐进展开。',
    '',
    subject === 'xingce' ? [h('a', { class: 'secondary', href: '/coach' }, '问 AI 方法教练')] : [],
  ));

  if (subject === 'xingce') {
    main.append(h('section', { class: 'knowledge-design-banner' },
      h('div', {}, h('span', {}, '新的学习方式'), h('strong', {}, '先识别，再调用；先卡片，再长文')),
      h('div', { class: 'knowledge-design-steps' },
        h('span', {}, '① 30秒恢复'), h('b', {}, '→'), h('span', {}, '② 信号词库'), h('b', {}, '→'), h('span', {}, '③ 方法卡'), h('b', {}, '→'), h('span', {}, '④ 真实错题验证'),
      ),
    ));
  }

  const search = h('input', { class: 'study-search-input', placeholder: '搜索考点、模块或关键词', autocomplete: 'off' });
  const status = h('select', { class: 'study-filter-select' },
    h('option', { value: '全部' }, '全部状态'),
    h('option', { value: '有方法' }, '已有正式方法'),
    h('option', { value: '有训练' }, '已有训练样本'),
    h('option', { value: '薄弱' }, '薄弱 / 复发'),
    h('option', { value: '待建设' }, '讲义待建设'),
  );
  const moduleSelect = h('select', { class: 'study-filter-select' }, h('option', { value: '全部' }, '全部模块'));
  [...new Set(list.map(nodeModule))].filter(Boolean).sort().forEach((name) => moduleSelect.append(h('option', { value: name }, name)));
  const resultCount = h('span', { class: 'study-result-count' }, `${list.length} 个节点`);
  main.append(h('div', { class: 'study-toolbar knowledge-toolbar-v2' },
    h('div', { class: 'study-search' }, search),
    h('div', { class: 'study-filter-group' }, moduleSelect, status),
    resultCount,
  ));

  const treeHost = h('aside', { class: 'knowledge-catalog-v2', id: 'knowledge-catalog' });
  const reader = h('article', { class: 'knowledge-reader-v2', id: 'knowledge-reader' },
    h('div', { class: 'study-empty-state' }, h('strong', {}, '选择一个知识节点开始学习')),
  );
  main.append(h('div', { class: 'knowledge-shell-v2' }, treeHost, reader));

  const drawCatalog = () => {
    const q = search.value.trim().toLowerCase();
    const filtered = list.filter((row) => {
      const methodCount = methodsForNode(row.slug).length;
      if (moduleSelect.value !== '全部' && nodeModule(row) !== moduleSelect.value) return false;
      if (status.value === '有方法' && methodCount === 0) return false;
      if (status.value === '有训练' && Number(row.sample_n || 0) <= 0) return false;
      if (status.value === '薄弱' && !/薄弱|危险|复发/.test(String(row.state || ''))) return false;
      if (status.value === '待建设' && row.build_status !== '未建设') return false;
      if (q && !`${row.title} ${nodeModule(row)} ${row.slug}`.toLowerCase().includes(q)) return false;
      return true;
    });
    resultCount.textContent = `${filtered.length} 个节点`;
    clear(treeHost);
    if (!filtered.length) {
      treeHost.append(h('div', { class: 'study-empty-state compact' }, h('strong', {}, '没有匹配的节点')));
      return;
    }
    const groups = new Map();
    filtered.forEach((row) => {
      const key = nodeModule(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    for (const [moduleName, items] of groups) {
      treeHost.append(h('section', { class: 'catalog-group-v2' },
        h('div', { class: 'catalog-group-head-v2' }, h('strong', {}, moduleName), h('span', {}, `${items.length}`)),
        h('div', { class: 'catalog-node-list-v2' }, ...items.map((row) => {
          const methodCount = methodsForNode(row.slug).length;
          return h('button', {
            class: `catalog-node-v2 ${row.slug === activeKnowledgeSlug ? 'active' : ''}`,
            'data-slug': row.slug,
            onclick: async () => { await showNode(row.slug); drawCatalog(); },
          },
            h('span', { class: `catalog-state-dot ${knowledgeTone(row)}` }),
            h('span', { class: 'catalog-node-copy-v2' },
              h('strong', {}, row.title),
              h('small', {}, `${methodCount ? `${methodCount} 方法 · ` : ''}${masteryLabel(row)}${Number(row.sample_n || 0) ? ` · ${row.sample_n} 样本` : ''}`),
            ),
            row.accuracy == null ? null : h('span', { class: 'catalog-accuracy-v2' }, accuracyText(row)),
          );
        })),
      ));
    }
  };

  search.oninput = drawCatalog;
  moduleSelect.onchange = drawCatalog;
  status.onchange = drawCatalog;
  drawCatalog();
  const first = list.find((row) => methodsForNode(row.slug).length) || list.find((row) => row.build_status !== '未建设') || list[0];
  if (first) await showNode(first.slug);
}

async function showNode(slug) {
  activeKnowledgeSlug = slug;
  const data = await api(`/api/knowledge/node/${slug}`);
  const reader = document.querySelector('#knowledge-reader');
  if (!reader) return;
  document.querySelectorAll('.catalog-node-v2[data-slug]').forEach((node) => node.classList.toggle('active', node.dataset.slug === slug));
  clear(reader);

  const meta = data.meta || {};
  const moduleName = nodeModule(meta);
  const mistakeCount = data.mistakes?.length || 0;
  const noteCount = (data.legacy_excerpts || []).filter((item) => item.text).length;
  const methods = activeSubject === 'xingce' ? methodsForNode(slug) : [];

  const head = h('header', { class: 'knowledge-node-hero-v2' },
    h('div', { class: 'knowledge-node-kicker' },
      tag(moduleName),
      methods.length ? tag(`${methods.length} 个正式方法`, 'correct') : null,
      masteryBadge(meta),
    ),
    h('div', { class: 'knowledge-node-title-row' },
      h('div', {}, h('h1', {}, meta.title || slug), h('p', {}, `节点 ${meta.slug || slug} · ${meta.build_status || '状态未知'}`)),
      h('div', { class: 'knowledge-node-actions' },
        activeSubject === 'xingce' ? h('a', { class: 'primary', href: `/coach?q=${encodeURIComponent(meta.title || slug)}` }, '问 AI 本节点') : null,
        meta.build_status === '未建设' ? null : h('button', { class: 'secondary', onclick: async () => {
          await jpost(`/api/knowledge/node/${slug}/closed-book`, {});
          await showNode(slug);
        } }, '完成闭卷复述'),
      ),
    ),
    h('div', { class: 'knowledge-evidence-cards' },
      h('article', {}, h('span', {}, '训练正确率'), h('strong', {}, accuracyText(meta)), h('small', {}, Number(meta.sample_n || 0) ? `${meta.sample_n} 个有效样本` : '暂无样本')),
      h('article', {}, h('span', {}, '平均速度'), h('strong', {}, avgTimeText(meta)), h('small', {}, '只采用可靠计时样本')),
      h('article', {}, h('span', {}, '关联错题'), h('strong', {}, String(mistakeCount)), h('small', {}, '真实错误记录')),
      h('article', {}, h('span', {}, '历史笔记'), h('strong', {}, String(noteCount)), h('small', {}, '原始内容可追溯')),
    ),
  );

  const sections = {
    quick: quickRecoverySection(meta, methods, mistakeCount),
    standard: standardLearningSection(data, methods),
    deep: deepLearningSection(data, methods),
  };
  reader.append(head, modeTabs(sections));
}
