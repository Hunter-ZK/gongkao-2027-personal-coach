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
function knowledgeTone(row) {
  const level = masteryLevel(row);
  if (level >= 4) return 'is-good';
  if (level === 1) return 'is-risk';
  if (level >= 2) return 'is-warn';
  return 'is-neutral';
}
function compactText(text, max = 150) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
function knowledgeStat(label, value, caption) {
  return h('div', { class: 'study-stat' },
    h('span', { class: 'study-stat-label' }, label),
    h('strong', {}, value),
    caption ? h('small', {}, caption) : null,
  );
}

function methodsForNode(slug) {
  return methodCatalog
    .filter((method) => method.node_slug === slug)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}

function textBlock(name, text, className = '') {
  if (!text) return null;
  return h('section', { class: `source-method-block ${className}`.trim() },
    h('h3', {}, name),
    h('p', {}, text),
  );
}

function listBlock(name, rows, ordered = false) {
  if (!rows?.length) return null;
  const list = h(ordered ? 'ol' : 'ul', {}, ...rows.map((item) => h('li', {}, item)));
  return h('section', { class: 'source-method-block' }, h('h3', {}, name), list);
}

function methodArticle(method, index) {
  const source = method.evidence || method.source_note || '来源见 V2 正文';
  return h('article', { class: 'source-method-card', id: `method-${method.id}` },
    h('header', { class: 'source-method-head' },
      h('div', { class: 'source-method-index' }, String(index + 1).padStart(2, '0')),
      h('div', { class: 'source-method-title' },
        h('div', { class: 'source-method-meta' }, tag(method.id), tag(method.module || '行测')),
        h('h2', {}, method.title),
        method.definition ? h('p', {}, method.definition) : null,
      ),
    ),
    h('div', { class: 'source-method-evidence' },
      h('strong', {}, '来源与证据'),
      h('span', {}, source),
    ),
    listBlock('识别信号', method.signals),
    textBlock('底层原理', method.principle, 'principle'),
    listBlock('标准操作', method.steps, true),
    textBlock('完整例题', method.example, 'example'),
    textBlock('易错点 / 失效边界', method.boundary, 'boundary'),
    textBlock('与相邻方法如何选择', method.comparison),
    method.exam_command ? h('section', { class: 'source-method-command' },
      h('strong', {}, '考场调用指令'),
      h('p', {}, method.exam_command),
    ) : null,
  );
}

function sourceMethodsSection(methods) {
  if (!methods.length) return null;
  return h('section', { class: 'source-methods-section' },
    h('div', { class: 'source-authority-banner' },
      h('div', {},
        h('strong', {}, 'V2 · GitHub Skill 融合方法正文'),
        h('p', {}, '这里直接展示与当前知识点静态映射的方法正文：识别、原理、步骤、例题、边界和考场调用均来自平台已落库的 V2 方法单元，不再由页面关键词猜测归属。'),
      ),
      h('span', { class: 'source-method-count' }, `${methods.length} 个方法`),
    ),
    ...methods.map(methodArticle),
  );
}

function contextMethodsCard(methods) {
  if (!methods.length) {
    return h('div', { class: 'context-card' },
      h('strong', {}, 'V2 方法'),
      h('p', { class: 'subtle' }, '当前节点暂无正式映射方法。'),
    );
  }
  return h('div', { class: 'context-card' },
    h('strong', {}, `V2 方法 · ${methods.length}`),
    ...methods.map((method) => h('a', { href: `#method-${method.id}` }, `${method.id} · ${method.title}`)),
  );
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
  const actions = subject === 'xingce'
    ? [h('a', { class: 'secondary', href: '/coach' }, '问 AI 方法教练')]
    : [];
  clear(main).append(title(
    subject === 'xingce' ? '行测知识与方法体系' : '申论',
    subject === 'xingce'
      ? `30 个知识节点承载正式教材；${mappedCount} 个 V2 方法按固定映射直接进入节点正文。训练证据、错题和历史笔记继续叠加，不替换方法底稿。`
      : '能力节点、写作训练与复盘证据统一呈现。',
    '',
    actions,
  ));

  if (subject === 'xingce') {
    main.append(h('section', { class: 'knowledge-source-strip' },
      h('strong', {}, '内容基线'),
      h('span', {}, '《行测全题型方法与技巧大全 · GitHub 技能融合深化版 V2》 + 30 节点内容规范'),
      h('span', {}, 'GitHub Skill 按 G1/G2/G3 证据等级使用，不冒充老师原话'),
    ));
  }

  const search = h('input', { class: 'study-search-input', placeholder: '搜索知识点或模块', autocomplete: 'off' });
  const status = h('select', { class: 'study-filter-select' },
    h('option', { value: '全部' }, '全部状态'),
    h('option', { value: '已建设' }, '已有扩展讲义'),
    h('option', { value: '有方法' }, '已有 V2 方法'),
    h('option', { value: '有训练' }, '已有训练'),
    h('option', { value: '待建设' }, '扩展讲义待建设'),
  );
  const moduleSelect = h('select', { class: 'study-filter-select' }, h('option', { value: '全部' }, '全部模块'));
  [...new Set(list.map(nodeModule))].filter(Boolean).sort().forEach((name) => {
    moduleSelect.append(h('option', { value: name }, name));
  });
  const resultCount = h('span', { class: 'study-result-count' }, `${list.length} 个节点`);
  main.append(h('div', { class: 'study-toolbar' },
    h('div', { class: 'study-search' }, search),
    h('div', { class: 'study-filter-group' }, moduleSelect, status),
    resultCount,
  ));

  const treeHost = h('div', { class: 'knowledge-catalog', id: 'knowledge-catalog' });
  const reader = h('article', { class: 'knowledge-reader', id: 'knowledge-reader' },
    h('div', { class: 'study-empty-state' }, h('strong', {}, '选择一个知识节点')),
  );
  const context = h('aside', { class: 'knowledge-context', id: 'knowledge-context' });
  main.append(h('div', { class: 'knowledge-shell' }, treeHost, reader, context));

  const drawCatalog = () => {
    const q = search.value.trim().toLowerCase();
    const filtered = list.filter((row) => {
      const methodCount = methodsForNode(row.slug).length;
      if (moduleSelect.value !== '全部' && nodeModule(row) !== moduleSelect.value) return false;
      if (status.value === '已建设' && row.build_status === '未建设') return false;
      if (status.value === '有方法' && methodCount === 0) return false;
      if (status.value === '有训练' && Number(row.sample_n || 0) <= 0) return false;
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
      treeHost.append(h('div', { class: 'catalog-group' },
        h('div', { class: 'catalog-group-head' }, h('strong', {}, moduleName), h('span', {}, `${items.length}`)),
        ...items.map((row) => {
          const methodCount = methodsForNode(row.slug).length;
          const secondary = methodCount
            ? `${methodCount} 方法 · ${masteryLabel(row)} · ${Number(row.sample_n || 0)} 样本`
            : row.build_status === '未建设' ? '扩展讲义待建设' : `${masteryLabel(row)} · ${Number(row.sample_n || 0)} 样本`;
          return h('button', {
            class: `catalog-node ${row.slug === activeKnowledgeSlug ? 'active' : ''}`,
            'data-slug': row.slug,
            onclick: async () => { await showNode(row.slug); drawCatalog(); },
          },
            h('span', { class: `catalog-state-dot ${knowledgeTone(row)}` }),
            h('span', { class: 'catalog-node-copy' }, h('strong', {}, row.title), h('small', {}, secondary)),
            row.accuracy == null ? null : h('span', { class: 'catalog-accuracy' }, accuracyText(row)),
          );
        }),
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
  const context = document.querySelector('#knowledge-context');
  if (!reader || !context) return;
  document.querySelectorAll('.catalog-node[data-slug]').forEach((node) => {
    node.classList.toggle('active', node.dataset.slug === slug);
  });
  clear(reader);
  clear(context);
  const meta = data.meta || {};
  const moduleName = nodeModule(meta);
  const mistakeCount = data.mistakes?.length || 0;
  const noteCount = (data.legacy_excerpts || []).filter((item) => item.text).length;
  const relatedMethods = activeSubject === 'xingce' ? methodsForNode(slug) : [];

  reader.append(h('header', { class: 'knowledge-article-head' },
    h('div', { class: 'knowledge-article-topline' },
      h('div', { class: 'knowledge-chip-row' },
        tag(moduleName),
        relatedMethods.length ? tag(`${relatedMethods.length} 个 V2 方法`, 'correct') : null,
        meta.build_status === '未建设' ? tag('扩展讲义待建设', 'pending') : masteryBadge(meta),
      ),
      h('span', { class: 'knowledge-node-code' }, meta.slug || slug),
    ),
    h('h1', {}, meta.title || slug),
    h('div', { class: 'knowledge-evidence-strip' },
      knowledgeStat('V2 方法', String(relatedMethods.length), '静态映射，不做关键词猜测'),
      knowledgeStat('训练正确率', accuracyText(meta), Number(meta.sample_n || 0) ? `${meta.sample_n} 个样本` : '暂无样本'),
      knowledgeStat('关联错题', String(mistakeCount), '真实错误记录'),
      knowledgeStat('历史笔记', String(noteCount), '可追溯原始内容'),
    ),
    h('div', { class: 'knowledge-actions' },
      relatedMethods.length ? h('a', { class: 'primary', href: `/coach?q=${encodeURIComponent(meta.title || slug)}` }, '用 AI 深挖本节点') : null,
      meta.build_status === '未建设' ? null : h('button', { class: 'secondary', onclick: async () => {
        await jpost(`/api/knowledge/node/${slug}/closed-book`, {});
        await showNode(slug);
      } }, '完成闭卷复述'),
      meta.build_status === '未建设' ? null : h('a', {
        class: 'secondary',
        href: `/api/knowledge/node/${encodeURIComponent(slug)}/export.pdf`,
        target: '_blank',
      }, '打印扩展讲义'),
    ),
  ));

  if (activeSubject === 'xingce') {
    const methodSection = sourceMethodsSection(relatedMethods);
    if (methodSection) {
      reader.append(methodSection);
    } else {
      reader.append(h('div', { class: 'knowledge-method-gap' },
        h('strong', {}, '当前节点尚无 V2 正式方法映射'),
        h('span', {}, '不会用其他节点的方法内容临时填充；后续补充必须回到正式来源与映射表。'),
      ));
    }
  }

  if (meta.build_status !== '未建设' && data.html) {
    reader.append(h('section', { class: 'node-longform-section' },
      h('div', { class: 'section-title-row' },
        h('div', {}, h('h2', {}, '系统化扩展讲义'), h('p', { class: 'section-caption' }, '30 节点正文用于补充真题、替代解法、历史笔记与主动回忆；不得覆盖或改写上方 V2 方法结论。')),
      ),
      h('div', { class: 'study-note-prose', html: data.html }),
    ));
  } else if (activeSubject === 'xingce') {
    reader.append(h('div', { class: 'knowledge-build-note' },
      h('strong', {}, '长篇扩展讲义待建设'),
      h('span', {}, relatedMethods.length
        ? '上方 V2 方法正文已经可以完整学习；这里只是不冒充 20 段长篇节点已经完成。'
        : `当前排在 ${meta.priority_batch || '后续'} 批。`),
    ));
  }

  if (mistakeCount) {
    reader.append(h('section', { class: 'knowledge-related-section' },
      h('div', { class: 'section-title-row' }, h('h2', {}, '关联错题'), h('a', { href: '/mistakes', class: 'text-link' }, '查看错题本')),
      h('div', { class: 'related-mistake-grid' }, ...data.mistakes.slice(0, 6).map((item) => h('article', { class: 'related-mistake-card' },
        h('div', { class: 'related-mistake-meta' },
          tag(item.status, item.status === '已修复' ? 'correct' : 'pending'),
          h('span', {}, item.cause_primary || '错因待诊断'),
        ),
        h('p', {}, compactText(item.stem_md, 120)),
      ))),
    ));
  }

  if (noteCount) {
    reader.append(h('section', { class: 'knowledge-related-section' },
      h('div', { class: 'section-title-row' }, h('h2', {}, '历史笔记原文'), h('span', { class: 'section-caption' }, `${noteCount} 份`)),
      h('div', { class: 'legacy-note-stack' }, ...data.legacy_excerpts.filter((item) => item.text).map((item, index) => h('details', {
        class: 'legacy-note-card',
        open: index === 0,
      },
        h('summary', {}, h('span', {}, item.file_name || `历史笔记 ${index + 1}`), h('small', {}, '展开')),
        h('div', { class: 'legacy-note-body' }, item.text),
      ))),
    ));
  }

  const headings = Array.from(reader.querySelectorAll('.source-method-card h2, .source-method-card h3, .study-note-prose h2, .study-note-prose h3'))
    .slice(0, 36)
    .map((node, index) => {
      node.id = node.id || `sec-${index + 1}`;
      return { id: node.id, text: node.textContent, level: node.tagName === 'H2' ? 2 : 3 };
    });
  context.append(
    h('div', { class: 'context-card' },
      h('strong', {}, '掌握状态'),
      masteryBadge(meta),
      h('p', { class: 'subtle' }, Number(meta.sample_n || 0)
        ? `${meta.sample_n} 个有效样本 · 正确率 ${accuracyText(meta)} · 平均 ${avgTimeText(meta)}`
        : '先建立真实训练样本，再判断掌握。'),
    ),
    contextMethodsCard(relatedMethods),
    headings.length ? h('div', { class: 'context-card' },
      h('strong', {}, '本页目录'),
      ...headings.map((item) => h('a', { href: `#${item.id}`, class: item.level === 3 ? 'toc-sub' : '' }, item.text)),
    ) : null,
  );
}
