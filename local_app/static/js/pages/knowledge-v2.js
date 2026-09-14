import { api, jpost, main, clear, h, pct, tag, title } from '../runtime.js';

let activeKnowledgeSlug = null;
let methodCatalog = [];

function nodeModule(row) {
  const value = row?.module_names;
  if (!value) return '综合';
  if (typeof value === 'string') return value || '综合';
  if (Array.isArray(value)) return value.find(Boolean) || '综合';
  if (typeof value === 'object') {
    return value.guangdong || value.national || value.default || Object.values(value).find(Boolean) || '综合';
  }
  return '综合';
}

function masteryLabel(row) {
  return row?.state || '尚无训练证据';
}

function masteryLevel(row) {
  const s = String(row?.state || '');
  if (/掌握|稳定|通过/.test(s)) return 4;
  if (/形成|熟练/.test(s)) return 3;
  if (/学习|训练|观察/.test(s)) return 2;
  if (/薄弱|危险|反复/.test(s)) return 1;
  return 0;
}

function masteryBadge(row) {
  const level = masteryLevel(row);
  return h('span', { class: 'mastery-badge', 'data-level': String(level) }, h('span', { class: 'mastery-dot' }), masteryLabel(row));
}

function accuracyText(row) {
  return row?.accuracy == null ? '—' : pct(row.accuracy);
}

function avgTimeText(row) {
  return row?.avg_seconds == null ? '—' : `${Math.round(row.avg_seconds)}s`;
}

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
  return h('div', { class: 'study-stat' }, h('span', { class: 'study-stat-label' }, label), h('strong', {}, value), caption ? h('small', {}, caption) : null);
}

function methodScore(method, node) {
  const mod = nodeModule(node);
  let score = method.module === mod ? 6 : 0;
  const hay = `${node.title || ''} ${node.slug || ''}`.toLowerCase();
  const fields = [method.title, method.definition, ...(method.signals || [])].filter(Boolean).join(' ').toLowerCase();
  const tokens = hay.split(/[\s·/：:（）()_-]+/).filter((x) => x.length >= 2);
  for (const token of tokens) if (fields.includes(token)) score += 2;
  return score;
}

function methodsForNode(node) {
  return methodCatalog
    .map((method) => ({ method, score: methodScore(method, node) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.method.id.localeCompare(b.method.id))
    .slice(0, 8)
    .map((x) => x.method);
}

function methodDrawer(method) {
  const dialog = h('dialog', { class: 'command-dialog method-drawer' });
  dialog.append(
    h('div', { class: 'dialog-head' }, h('div', {}, h('h2', {}, method.title), h('p', { class: 'subtle' }, `${method.id} · ${method.module}`)), h('button', { class: 'icon-button', onclick: () => dialog.close(), 'aria-label': '关闭' }, '×')),
    h('div', { class: 'method-drawer-body' },
      method.definition ? h('p', {}, method.definition) : null,
      method.signals?.length ? h('section', {}, h('h3', {}, '识别信号'), h('ul', {}, ...method.signals.map((x) => h('li', {}, x)))) : null,
      method.principle ? h('section', {}, h('h3', {}, '底层原理'), h('p', {}, method.principle)) : null,
      method.steps?.length ? h('section', {}, h('h3', {}, '标准操作'), h('ol', {}, ...method.steps.map((x) => h('li', {}, x)))) : null,
      method.example ? h('section', {}, h('h3', {}, '例题'), h('p', {}, method.example)) : null,
      method.boundary ? h('section', {}, h('h3', {}, '边界与易错'), h('p', {}, method.boundary)) : null,
      method.exam_command ? h('section', { class: 'method-command-box' }, h('h3', {}, '考场调用'), h('p', {}, method.exam_command)) : null,
    ),
  );
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
}

export async function renderKnowledge(subject = 'xingce') {
  const [rows, methods] = await Promise.all([
    api('/api/knowledge/tree'),
    subject === 'xingce' ? api('/api/knowledge/methods') : Promise.resolve([]),
  ]);
  methodCatalog = methods;
  const list = rows.filter((x) => x.subject === subject);
  const built = list.filter((x) => x.build_status !== '未建设').length;
  const trained = list.filter((x) => Number(x.sample_n || 0) > 0).length;
  const mastered = list.filter((x) => masteryLevel(x) >= 4).length;

  clear(main).append(title(
    subject === 'xingce' ? '行测体系' : '申论',
    subject === 'xingce'
      ? '知识正文、可调用方法、训练证据、历史笔记和关联错题在同一个节点里查看。'
      : '能力节点、写作训练与复盘证据统一呈现。',
  ));

  const search = h('input', { class: 'study-search-input', placeholder: '搜索知识点或模块', autocomplete: 'off' });
  const status = h('select', { class: 'study-filter-select' },
    h('option', { value: '全部' }, '全部状态'),
    h('option', { value: '已建设' }, '已有正文'),
    h('option', { value: '有训练' }, '已有训练'),
    h('option', { value: '待建设' }, '待建设'),
  );
  const moduleSelect = h('select', { class: 'study-filter-select' }, h('option', { value: '全部' }, '全部模块'));
  [...new Set(list.map(nodeModule))].filter(Boolean).sort().forEach((name) => moduleSelect.append(h('option', { value: name }, name)));

  main.append(
    h('section', { class: 'study-overview-card' },
      h('div', { class: 'study-overview-copy' },
        h('h2', {}, subject === 'xingce' ? '知识与方法合并阅读' : '能力节点与证据'),
        h('p', {}, subject === 'xingce' ? '先理解知识骨架，再调用对应方法，最后用真实错题和训练数据验证是否掌握。' : '正文与训练证据分开记录，在同一页面汇总。'),
      ),
      h('div', { class: 'study-overview-stats' },
        knowledgeStat('已有正文', `${built}/${list.length}`, '真实建设进度'),
        knowledgeStat('已有训练', String(trained), '节点有作答样本'),
        knowledgeStat('稳定掌握', String(mastered), '按状态机判断'),
      ),
    ),
    h('div', { class: 'study-toolbar' },
      h('div', { class: 'study-search' }, search),
      h('div', { class: 'study-filter-group' }, moduleSelect, status),
      h('span', { class: 'study-result-count', id: 'knowledge-result-count' }, `${list.length} 个节点`),
    ),
  );

  const treeHost = h('div', { class: 'knowledge-catalog', id: 'knowledge-catalog' });
  const reader = h('article', { class: 'knowledge-reader knowledge-reader-v2', id: 'knowledge-reader' }, h('div', { class: 'study-empty-state' }, h('strong', {}, '选择一个知识节点')));
  const context = h('aside', { class: 'knowledge-context', id: 'knowledge-context' });
  main.append(h('div', { class: 'knowledge-shell knowledge-shell-v2' }, treeHost, reader, context));

  const drawCatalog = () => {
    const q = search.value.trim().toLowerCase();
    const filtered = list.filter((x) => {
      if (moduleSelect.value !== '全部' && nodeModule(x) !== moduleSelect.value) return false;
      if (status.value === '已建设' && x.build_status === '未建设') return false;
      if (status.value === '有训练' && Number(x.sample_n || 0) <= 0) return false;
      if (status.value === '待建设' && x.build_status !== '未建设') return false;
      if (q && !`${x.title} ${nodeModule(x)} ${x.slug}`.toLowerCase().includes(q)) return false;
      return true;
    });
    document.querySelector('#knowledge-result-count').textContent = `${filtered.length} 个节点`;
    clear(treeHost);
    if (!filtered.length) {
      treeHost.append(h('div', { class: 'study-empty-state compact' }, h('strong', {}, '没有匹配的节点')));
      return;
    }
    const groups = new Map();
    filtered.forEach((x) => {
      const key = nodeModule(x);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(x);
    });
    for (const [moduleName, items] of groups) {
      treeHost.append(h('div', { class: 'catalog-group' },
        h('div', { class: 'catalog-group-head' }, h('strong', {}, moduleName), h('span', {}, `${items.length}`)),
        ...items.map((x) => h('button', {
          class: `catalog-node ${x.slug === activeKnowledgeSlug ? 'active' : ''}`,
          'data-slug': x.slug,
          onclick: async () => { await showNode(x.slug); drawCatalog(); },
        },
          h('span', { class: `catalog-state-dot ${knowledgeTone(x)}` }),
          h('span', { class: 'catalog-node-copy' }, h('strong', {}, x.title), h('small', {}, x.build_status === '未建设' ? '待建设' : `${masteryLabel(x)} · ${Number(x.sample_n || 0)} 样本`)),
          x.accuracy == null ? null : h('span', { class: 'catalog-accuracy' }, accuracyText(x)),
        )),
      ));
    }
  };

  search.oninput = drawCatalog;
  moduleSelect.onchange = drawCatalog;
  status.onchange = drawCatalog;
  drawCatalog();
  const firstBuilt = list.find((x) => x.build_status !== '未建设') || list[0];
  if (firstBuilt) await showNode(firstBuilt.slug);
}

async function showNode(slug) {
  activeKnowledgeSlug = slug;
  const d = await api(`/api/knowledge/node/${slug}`);
  const reader = document.querySelector('#knowledge-reader');
  const context = document.querySelector('#knowledge-context');
  if (!reader || !context) return;
  document.querySelectorAll('.catalog-node[data-slug]').forEach((a) => a.classList.toggle('active', a.dataset.slug === slug));
  clear(reader);
  clear(context);

  const meta = d.meta || {};
  const moduleName = nodeModule(meta);
  const mistakeCount = d.mistakes?.length || 0;
  const noteCount = (d.legacy_excerpts || []).filter((x) => x.text).length;
  const relatedMethods = methodsForNode(meta);

  reader.append(
    h('header', { class: 'knowledge-article-head' },
      h('div', { class: 'knowledge-article-topline' },
        h('div', { class: 'knowledge-chip-row' }, tag(moduleName), meta.build_status === '未建设' ? tag('待建设', 'pending') : masteryBadge(meta)),
        h('span', { class: 'knowledge-node-code' }, meta.slug || slug),
      ),
      h('h1', {}, meta.title || slug),
      h('div', { class: 'knowledge-evidence-strip' },
        knowledgeStat('训练正确率', accuracyText(meta), Number(meta.sample_n || 0) ? `${meta.sample_n} 个样本` : '暂无样本'),
        knowledgeStat('平均用时', avgTimeText(meta), '有计时数据时展示'),
        knowledgeStat('关联错题', String(mistakeCount), '真实错误记录'),
        knowledgeStat('历史笔记', String(noteCount), '可追溯原始内容'),
      ),
      h('div', { class: 'knowledge-actions' },
        meta.build_status === '未建设' ? null : h('button', { class: 'secondary', onclick: async () => { await jpost(`/api/knowledge/node/${slug}/closed-book`, {}); await showNode(slug); } }, '完成闭卷复述'),
        meta.build_status === '未建设' ? null : h('a', { class: 'secondary', href: `/api/knowledge/node/${encodeURIComponent(slug)}/export.pdf`, target: '_blank' }, '打印笔记'),
      ),
    ),
  );

  if (meta.build_status === '未建设') {
    reader.append(h('div', { class: 'study-empty-state large' }, h('strong', {}, '正文尚未建设'), h('span', {}, `当前排在 ${meta.priority_batch || '后续'} 批。`)));
  } else {
    reader.append(h('div', { class: 'study-note-prose', html: d.html }));
  }

  if (mistakeCount) {
    reader.append(h('section', { class: 'knowledge-related-section' },
      h('div', { class: 'section-title-row' }, h('h2', {}, '关联错题'), h('a', { href: '/mistakes', class: 'text-link' }, '查看错题本')),
      h('div', { class: 'related-mistake-grid' }, ...d.mistakes.slice(0, 6).map((x) => h('article', { class: 'related-mistake-card' }, h('div', { class: 'related-mistake-meta' }, tag(x.status, x.status === '已修复' ? 'correct' : 'pending'), h('span', {}, x.cause_primary || '错因待诊断')), h('p', {}, compactText(x.stem_md, 120))))),
    ));
  }

  if (noteCount) {
    reader.append(h('section', { class: 'knowledge-related-section' },
      h('div', { class: 'section-title-row' }, h('h2', {}, '历史笔记'), h('span', { class: 'section-caption' }, `${noteCount} 份`)),
      h('div', { class: 'legacy-note-stack' }, ...d.legacy_excerpts.filter((x) => x.text).map((x, i) => h('details', { class: 'legacy-note-card', open: i === 0 }, h('summary', {}, h('span', {}, x.file_name || `历史笔记 ${i + 1}`), h('small', {}, '展开')), h('div', { class: 'legacy-note-body' }, x.text)))),
    ));
  }

  const headings = Array.from(reader.querySelectorAll('.study-note-prose h2, .study-note-prose h3')).map((x, i) => {
    x.id = x.id || `sec-${i + 1}`;
    return { id: x.id, text: x.textContent, level: x.tagName === 'H2' ? 2 : 3 };
  });

  context.append(
    h('div', { class: 'context-card' }, h('strong', {}, '掌握状态'), masteryBadge(meta), h('p', { class: 'subtle' }, Number(meta.sample_n || 0) ? `${meta.sample_n} 个有效样本 · 正确率 ${accuracyText(meta)}` : '先建立真实训练样本，再判断掌握。')),
    subjectMethodsCard(relatedMethods),
    headings.length ? h('div', { class: 'context-card' }, h('strong', {}, '本页目录'), ...headings.map((x) => h('a', { href: `#${x.id}`, class: x.level === 3 ? 'toc-sub' : '' }, x.text))) : null,
  );
}

function subjectMethodsCard(methods) {
  if (!methods.length) return h('div', { class: 'context-card' }, h('strong', {}, '可调用方法'), h('p', { class: 'subtle' }, '当前节点暂无已映射方法。'));
  return h('div', { class: 'context-card' },
    h('strong', {}, '可调用方法'),
    h('p', { class: 'subtle' }, '点击在抽屉中查看，不离开当前笔记。'),
    ...methods.map((method) => h('button', { class: 'context-method-link', onclick: () => methodDrawer(method) }, h('span', {}, method.title), h('small', {}, method.id))),
  );
}
