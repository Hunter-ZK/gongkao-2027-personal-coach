import { api, jpost, main, clear, h, pct, tag, title } from '../runtime.js';

let activeKnowledgeSlug = null;

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
  if (!row?.state) return '尚无训练证据';
  return row.state;
}

function accuracyText(row) {
  return row?.accuracy == null ? '—' : pct(row.accuracy);
}

function avgTimeText(row) {
  if (row?.avg_seconds == null) return '—';
  return `${Math.round(row.avg_seconds)}s`;
}

function knowledgeTone(row) {
  const s = String(row?.state || '');
  if (/掌握|稳定|通过/.test(s)) return 'is-good';
  if (/薄弱|危险|反复/.test(s)) return 'is-risk';
  if (/学习|训练|观察|形成/.test(s)) return 'is-warn';
  return 'is-neutral';
}

function compactText(text, max = 150) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function knowledgeStat(label, value, caption, tone = '') {
  return h('div', { class: `study-stat ${tone}` },
    h('span', { class: 'study-stat-label' }, label),
    h('strong', {}, value),
    caption ? h('small', {}, caption) : null,
  );
}

export async function renderKnowledge(subject = 'xingce') {
  const rows = await api('/api/knowledge/tree');
  const list = rows.filter((x) => x.subject === subject);
  const built = list.filter((x) => x.build_status !== '未建设').length;
  const trained = list.filter((x) => Number(x.sample_n || 0) > 0).length;
  const mastered = list.filter((x) => /掌握|稳定|通过/.test(String(x.state || ''))).length;

  clear(main).append(title(
    subject === 'xingce' ? '行测知识体系' : '申论能力体系',
    subject === 'xingce'
      ? '把知识正文、训练证据、历史笔记和关联错题放到同一阅读上下文里。先理解，再训练，再复盘。'
      : '五类申论能力节点独立建设；正文、训练证据与复盘记录统一呈现。',
    subject === 'xingce' ? 'KNOWLEDGE WORKSPACE' : 'SHENLUN WORKSPACE',
  ));

  const search = h('input', { class: 'study-search-input', placeholder: '搜索知识点、模块或关键词…', autocomplete: 'off' });
  const status = h('select', { class: 'study-filter-select' },
    h('option', { value: '全部' }, '全部状态'),
    h('option', { value: '已建设' }, '已有正式正文'),
    h('option', { value: '有训练' }, '已有训练证据'),
    h('option', { value: '待建设' }, '待建设'),
  );
  const moduleSelect = h('select', { class: 'study-filter-select' }, h('option', { value: '全部' }, '全部模块'));
  [...new Set(list.map(nodeModule))].filter(Boolean).sort().forEach((name) => moduleSelect.append(h('option', { value: name }, name)));

  main.append(
    h('section', { class: 'study-overview-card' },
      h('div', { class: 'study-overview-copy' },
        h('span', { class: 'study-overline' }, subject === 'xingce' ? '学习笔记 · 知识图谱 · 训练证据' : '能力节点 · 写作训练 · 复盘证据'),
        h('h2', {}, subject === 'xingce' ? '把“看过”变成“会用”' : '让每个能力节点都有证据'),
        h('p', {}, subject === 'xingce'
          ? '每个节点不只是文章：你可以看到掌握状态、训练样本、关联错题和历史笔记，并从同一页面进入 AI 深挖或闭卷复述。'
          : '正文与训练证据分开记录，但在同一页面汇总，避免只看内容、不看能力变化。'),
      ),
      h('div', { class: 'study-overview-stats' },
        knowledgeStat('正式节点', String(list.length), `${built} 个已有正文`),
        knowledgeStat('已有训练', String(trained), '节点有真实作答样本', trained ? 'is-indigo' : ''),
        knowledgeStat('稳定掌握', String(mastered), '以系统掌握状态为准', mastered ? 'is-green' : ''),
      ),
    ),
    h('div', { class: 'study-toolbar' },
      h('div', { class: 'study-search' }, h('span', {}, '⌕'), search),
      h('div', { class: 'study-filter-group' }, moduleSelect, status),
      h('span', { class: 'study-result-count', id: 'knowledge-result-count' }, `${list.length} 个节点`),
    ),
  );

  const treeHost = h('div', { class: 'knowledge-catalog', id: 'knowledge-catalog' });
  const reader = h('article', { class: 'knowledge-reader knowledge-reader-v2', id: 'knowledge-reader' },
    h('div', { class: 'study-empty-state' }, h('strong', {}, '选择一个知识节点开始阅读'), h('span', {}, '正文、训练证据、错题与历史笔记会在这里汇总。')),
  );
  const context = h('aside', { class: 'knowledge-context', id: 'knowledge-context' },
    h('div', { class: 'context-card' }, h('span', { class: 'study-overline' }, '本页目录'), h('p', { class: 'subtle' }, '选择节点后自动生成。')),
  );
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
      treeHost.append(h('div', { class: 'study-empty-state compact' }, h('strong', {}, '没有匹配的知识节点'), h('span', {}, '调整关键词或筛选条件后再试。')));
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
        h('span', { class: 'catalog-node-copy' },
          h('strong', {}, x.title),
          h('small', {}, x.build_status === '未建设' ? `待建设 · ${x.priority_batch || '后续批次'}` : `${masteryLabel(x)} · ${Number(x.sample_n || 0)} 个样本`),
        ),
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

  const meta = d.meta || {};
  const moduleName = nodeModule(meta);
  const mistakeCount = d.mistakes?.length || 0;
  const noteCount = (d.legacy_excerpts || []).filter((x) => x.text).length;

  reader.append(
    h('header', { class: 'knowledge-article-head' },
      h('div', { class: 'knowledge-article-topline' },
        h('div', { class: 'knowledge-chip-row' }, tag(moduleName), tag(meta.build_status || '—', meta.build_status === '未建设' ? 'pending' : 'correct'), meta.state ? tag(meta.state) : null),
        h('span', { class: 'knowledge-node-code' }, meta.slug || slug),
      ),
      h('h1', {}, meta.title || slug),
      h('p', { class: 'knowledge-article-lead' }, meta.build_status === '未建设'
        ? '这个节点还没有形成正式正文。平台会保留真实建设状态，不用模板内容冒充已完成笔记。'
        : '正文与训练数据来自不同证据层：先读方法，再用真实训练和错题检验是否掌握。'),
      h('div', { class: 'knowledge-evidence-strip' },
        knowledgeStat('掌握状态', masteryLabel(meta), Number(meta.sample_n || 0) ? `${meta.sample_n} 个真实样本` : '暂无训练样本', knowledgeTone(meta)),
        knowledgeStat('训练正确率', accuracyText(meta), '仅统计已核验训练'),
        knowledgeStat('平均用时', avgTimeText(meta), '存在计时数据时展示'),
        knowledgeStat('关联内容', `${mistakeCount} 错题 · ${noteCount} 笔记`, '同一节点上下文'),
      ),
      h('div', { class: 'knowledge-actions' },
        h('a', { class: 'primary', href: '/coach' }, '✦ 让 AI 深挖'),
        meta.build_status === '未建设' ? null : h('button', { class: 'secondary', onclick: async () => {
          await jpost(`/api/knowledge/node/${slug}/closed-book`, {});
          await showNode(slug);
        } }, '✓ 完成闭卷复述'),
        meta.build_status === '未建设' ? null : h('a', { class: 'secondary', href: `/api/knowledge/node/${encodeURIComponent(slug)}/export.pdf`, target: '_blank' }, '↗ 打印笔记'),
      ),
    ),
  );

  if (meta.build_status === '未建设') {
    reader.append(h('div', { class: 'study-empty-state large' },
      h('strong', {}, '正文尚未建设'),
      h('span', {}, `当前排在 ${meta.priority_batch || '后续'} 批。可先通过相关方法库和 AI 教练学习，不把占位文字当知识正文。`),
      h('a', { class: 'secondary', href: '/knowledge' }, '返回正式方法体系'),
    ));
  } else {
    reader.append(h('div', { class: 'study-note-prose', html: d.html }));
  }

  if (mistakeCount) {
    reader.append(h('section', { class: 'knowledge-related-section' },
      h('div', { class: 'section-title-row' }, h('div', {}, h('span', { class: 'study-overline' }, '训练反馈'), h('h2', {}, '与这个知识点相关的错题')), h('a', { href: '/mistakes', class: 'text-link' }, '查看错题本 →')),
      h('div', { class: 'related-mistake-grid' }, ...d.mistakes.slice(0, 6).map((x) => h('article', { class: 'related-mistake-card' },
        h('div', { class: 'related-mistake-meta' }, tag(x.status, x.status === '已修复' ? 'correct' : 'pending'), x.cause_primary ? h('span', {}, x.cause_primary) : h('span', {}, '错因待诊断')),
        h('p', {}, compactText(x.stem_md, 120)),
      ))),
    ));
  }

  if (noteCount) {
    reader.append(h('section', { class: 'knowledge-related-section' },
      h('div', { class: 'section-title-row' }, h('div', {}, h('span', { class: 'study-overline' }, '历史沉淀'), h('h2', {}, '学习笔记与原始摘录')), h('span', { class: 'section-caption' }, `${noteCount} 份可追溯笔记`)),
      h('div', { class: 'legacy-note-stack' }, ...d.legacy_excerpts.filter((x) => x.text).map((x, i) => h('details', { class: 'legacy-note-card', open: i === 0 },
        h('summary', {}, h('span', {}, x.file_name || `历史笔记 ${i + 1}`), h('small', {}, '展开原始内容')),
        h('div', { class: 'legacy-note-body' }, x.text),
      ))),
    ));
  }

  const headings = Array.from(reader.querySelectorAll('.study-note-prose h2, .study-note-prose h3')).map((x, i) => {
    x.id = x.id || `sec-${i + 1}`;
    return { id: x.id, text: x.textContent, level: x.tagName === 'H3' ? 3 : 2 };
  });
  clear(context).append(
    h('div', { class: 'context-card' },
      h('span', { class: 'study-overline' }, '学习状态'),
      h('strong', { class: 'context-state' }, masteryLabel(meta)),
      h('div', { class: 'context-mini-grid' },
        h('div', {}, h('small', {}, '样本'), h('b', {}, String(meta.sample_n || 0))),
        h('div', {}, h('small', {}, '正确率'), h('b', {}, accuracyText(meta))),
        h('div', {}, h('small', {}, '错题'), h('b', {}, String(mistakeCount))),
        h('div', {}, h('small', {}, '历史笔记'), h('b', {}, String(noteCount))),
      ),
    ),
    h('div', { class: 'context-card toc-card' },
      h('span', { class: 'study-overline' }, '本页目录'),
      headings.length ? h('nav', { class: 'article-toc' }, ...headings.map((x) => h('a', { href: `#${x.id}`, class: x.level === 3 ? 'level-3' : '' }, x.text))) : h('p', { class: 'subtle' }, '当前节点暂无可生成目录的正文。'),
    ),
    h('div', { class: 'context-card context-tip' },
      h('span', { class: 'study-overline' }, '建议动作'),
      h('p', {}, mistakeCount ? '先看关联错题，再闭卷复述本页方法；能解释错因比重复阅读更重要。' : '读完后做一次闭卷复述；没有真实训练样本时，不要把“看懂”当成“掌握”。'),
    ),
  );
}
