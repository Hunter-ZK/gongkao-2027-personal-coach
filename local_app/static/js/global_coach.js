import { api, h, clear } from './runtime.js';

const STORE = 'gongkao.coach.chat.v1';
const OPEN_STORE = 'gongkao.globalCoach.open.v1';
const CONTEXT_STORE = 'gongkao.globalCoach.context.v1';

let root = null;
let config = null;
let messages = loadMessages();
let opened = false;
let sending = false;
let thinking = false;
let useContext = true;

const PAGE_META = {
  '/': { label: '工作台概览', prompts: ['根据当前数据告诉我今天最该补什么', '分析当前阶段最主要的提分瓶颈', '把今天任务按收益重新排序'] },
  '/today': { label: '今日任务', prompts: ['解释今天任务为什么这样排', '给我一套今天训练的执行顺序', '哪些任务可以降级或延后'] },
  '/timer': { label: '专注记录', prompts: ['根据最近专注记录判断我的时间利用问题', '这周哪些学习时段质量最高', '帮我安排下一次专注内容'] },
  '/trainings': { label: '训练记录与题库', prompts: ['分析当前训练表现暴露的问题', '从这些训练里找最值得复盘的模式', '下一组题应该练什么'] },
  '/questions': { label: '训练记录与题库', prompts: ['分析当前题库结构', '按当前数据推荐下一组训练', '找出最值得优先复训的题型'] },
  '/mistakes': { label: '错题本', prompts: ['分析当前选中的错题', '这道错题对应的标准方法是什么', '把当前错误转成下一次可执行规则'] },
  '/review': { label: '错题复训', prompts: ['只提示当前题的识别信号，不要直接给答案', '这题最容易重复犯什么错', '复训后我应该记录哪条规则'] },
  '/import': { label: '智能练习导入', prompts: ['导入后哪些错题最值得先处理', '解释错题自动解析会生成什么', '这批训练应该怎么复盘'] },
  '/knowledge': { label: '行测考点知识库', prompts: ['用当前知识点给我做一次闭卷自测', '当前方法什么时候会失效', '把当前知识点压缩成考场调用指令'] },
  '/shenlun': { label: '申论体系', prompts: ['根据当前内容给我一个练习题', '检查我对当前能力点的理解', '把当前知识压成答题步骤'] },
  '/methods': { label: '79 项方法库', prompts: ['当前方法适用于什么识别信号', '比较当前方法和相邻方法', '给我一个能真正掌握这个方法的例题'] },
  '/plan': { label: '备考规划', prompts: ['检查当前计划有没有不现实的地方', '根据现有数据调整本周优先级', '哪些规划指标现在缺少证据'] },
  '/progress': { label: '能力趋势', prompts: ['解释当前能力趋势', '哪些变化可能只是样本波动', '基于趋势推荐下一步训练'] },
  '/coach': { label: 'AI 方法教练', prompts: ['继续刚才的方法讨论', '根据我的训练情况给出下一步', '帮我做一次方法复盘'] },
  '/settings': { label: '设置', prompts: ['解释 DeepSeek 配置项', '检查当前 AI 使用边界', '告诉我错题自动解析的工作流'] },
};

function loadMessages() {
  try {
    const rows = JSON.parse(localStorage.getItem(STORE) || '[]');
    return Array.isArray(rows)
      ? rows.filter((row) => ['user', 'assistant'].includes(row.role) && row.content).slice(-24)
      : [];
  } catch (_) {
    return [];
  }
}

function saveMessages() {
  try { localStorage.setItem(STORE, JSON.stringify(messages.slice(-24))); } catch (_) {}
}

function pagePath() {
  return document.body?.dataset?.page || location.pathname || '/';
}

function pageMeta() {
  return PAGE_META[pagePath()] || {
    label: document.querySelector('.page-title')?.textContent || '当前页面',
    prompts: ['分析当前页面', '告诉我下一步怎么做', '检查我当前理解有什么问题'],
  };
}

function pageContext() {
  const main = document.querySelector('#app-main');
  if (!main) return '';
  const title = document.querySelector('.page-title')?.textContent?.trim() || pageMeta().label;
  const raw = String(main.innerText || '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return `当前界面：${title}\n页面路径：${pagePath()}\n\n当前页面可见内容：\n${raw.slice(0, 6500)}`;
}

function sourceTitle(source) {
  return source?.title || source?.source || '本地方法库';
}

function inlineNodes(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const match of String(text || '').matchAll(re)) {
    if (match.index > last) out.push(document.createTextNode(text.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith('**')) out.push(h('strong', {}, token.slice(2, -2)));
    else out.push(h('code', {}, token.slice(1, -1)));
    last = match.index + token.length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

function richText(text) {
  const box = h('div', { class: 'global-coach-richtext' });
  const lines = String(text || '').split('\n');
  let list = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^[-*]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      if (!list || list.tagName !== (numbered ? 'OL' : 'UL')) {
        list = h(numbered ? 'ol' : 'ul', {});
        box.append(list);
      }
      list.append(h('li', {}, ...inlineNodes((bullet || numbered)[1])));
      continue;
    }
    list = null;
    if (!line.trim()) {
      box.append(h('div', { class: 'global-coach-spacer' }));
      continue;
    }
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) box.append(h('strong', { class: 'global-coach-heading' }, ...inlineNodes(heading[1])));
    else box.append(h('p', {}, ...inlineNodes(line)));
  }
  return box;
}

function messageNode(message) {
  const assistant = message.role === 'assistant';
  return h('div', { class: `global-coach-message ${assistant ? 'assistant' : 'user'}` },
    h('div', { class: `global-coach-avatar ${assistant ? 'assistant' : 'user'}` }, assistant ? 'AI' : '你'),
    h('div', { class: 'global-coach-bubble-wrap' },
      h('div', { class: `global-coach-bubble ${assistant ? 'assistant' : 'user'}` },
        assistant ? richText(message.content) : h('p', { class: 'global-coach-user-text' }, String(message.content || '')),
      ),
      h('div', { class: `global-coach-message-meta ${assistant ? '' : 'user'}` },
        h('span', {}, assistant ? (message.model || 'DeepSeek') : '你'),
      ),
      assistant && message.sources?.length
        ? h('div', { class: 'global-coach-cites' }, ...message.sources.slice(0, 5).map((source) => h('span', {}, sourceTitle(source))))
        : null,
    ),
  );
}

function loadingNode() {
  return h('div', { class: 'global-coach-message assistant global-coach-loading' },
    h('div', { class: 'global-coach-avatar assistant' }, 'AI'),
    h('div', { class: 'global-coach-bubble assistant' },
      h('span', { class: 'global-coach-loading-dot' }),
      h('span', {}, '正在调取当前页面、方法库和知识节点…'),
    ),
  );
}

function renderThread() {
  const thread = document.querySelector('#global-coach-thread');
  if (!thread) return;
  clear(thread);
  if (!messages.length) {
    const meta = pageMeta();
    thread.append(h('div', { class: 'global-coach-welcome' },
      h('div', { class: 'global-coach-welcome-orb' }, 'AI'),
      h('h3', {}, '直接问当前页面'),
      h('p', {}, '助手会读取当前页面可见内容，并结合 V2 方法库、知识节点和你的真实训练数据回答。'),
      h('div', { class: 'global-coach-suggestions' }, ...meta.prompts.map((prompt) => h('button', { onclick: () => submit(prompt) }, prompt))),
    ));
  } else {
    messages.forEach((message) => thread.append(messageNode(message)));
    if (sending && messages.at(-1)?.role === 'assistant' && !messages.at(-1)?.content) thread.append(loadingNode());
  }
  thread.scrollTop = thread.scrollHeight;
}

function renderClosed() {
  clear(root).append(h('button', {
    class: 'global-coach-float-trigger',
    type: 'button',
    title: '打开 AI 训练助手（Alt+A）',
    onclick: () => openCoach(),
    'aria-label': '打开 AI 训练助手',
  }, 'AI'));
  document.body.classList.remove('global-coach-open');
}

function renderOpen() {
  const meta = pageMeta();
  const contextCheck = h('input', { type: 'checkbox', checked: useContext });
  const thinkingCheck = h('input', { type: 'checkbox', checked: thinking });
  contextCheck.onchange = () => {
    useContext = contextCheck.checked;
    try { localStorage.setItem(CONTEXT_STORE, useContext ? '1' : '0'); } catch (_) {}
  };
  thinkingCheck.onchange = () => { thinking = thinkingCheck.checked; };

  const textarea = h('textarea', {
    id: 'global-coach-input',
    rows: 2,
    placeholder: `向 AI 教练提问…当前上下文：${meta.label}`,
  });
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });

  const send = h('button', {
    id: 'global-coach-send',
    class: 'global-coach-send',
    type: 'button',
    'aria-label': '发送',
    onclick: () => submit(),
  }, '发送');

  const configNote = config?.configured
    ? null
    : h('div', { class: 'global-coach-config-warning' },
        h('strong', {}, 'DeepSeek 尚未配置。'),
        h('a', { href: '/settings' }, '去设置'),
      );

  const suggestionRow = h('div', { class: 'global-coach-prompt-row' },
    ...meta.prompts.map((prompt) => h('button', { type: 'button', onclick: () => submit(prompt) }, prompt)),
  );

  clear(root).append(h('aside', { class: 'global-coach-drawer', 'aria-label': 'AI 训练助手' },
    h('div', { class: 'global-coach-head' },
      h('div', { class: 'global-coach-title' },
        h('span', { class: 'global-coach-mark' }, 'AI'),
        h('div', {},
          h('strong', {}, 'AI 备考教练与思维诊室'),
          h('small', {}, `${meta.label} · ${config?.model || 'DeepSeek'}`),
        ),
      ),
      h('div', { class: 'global-coach-head-actions' },
        h('button', { class: 'global-coach-reset', type: 'button', onclick: () => {
          messages = [];
          saveMessages();
          renderThread();
        } }, '重置'),
        h('button', { class: 'global-coach-close', type: 'button', 'aria-label': '关闭 AI 训练助手', onclick: closeCoach }, '×'),
      ),
    ),
    h('div', { class: 'global-coach-toolbar' },
      h('span', { class: 'global-coach-context-chip' }, `当前：${meta.label}`),
      h('label', { class: 'global-coach-switch' }, contextCheck, h('span', {}, '读取当前页')),
      h('label', { class: 'global-coach-switch' }, thinkingCheck, h('span', {}, '深度思考')),
    ),
    h('div', { id: 'global-coach-thread', class: 'global-coach-thread' }),
    h('div', { class: 'global-coach-bottom' },
      suggestionRow,
      configNote,
      h('div', { class: 'global-coach-composer' },
        textarea,
        send,
      ),
      h('div', { class: 'global-coach-input-hint' }, 'Enter 发送 · Shift + Enter 换行'),
    ),
  ));
  document.body.classList.add('global-coach-open');
  if (!config?.configured) send.disabled = true;
  renderThread();
  setTimeout(() => textarea.focus(), 0);
}

function openCoach(prefill = '') {
  opened = true;
  try { localStorage.setItem(OPEN_STORE, '1'); } catch (_) {}
  renderOpen();
  if (prefill) {
    const input = document.querySelector('#global-coach-input');
    if (input) {
      input.value = prefill;
      input.focus();
    }
  }
}

function closeCoach() {
  opened = false;
  try { localStorage.removeItem(OPEN_STORE); } catch (_) {}
  renderClosed();
}

function parseEvent(event) {
  const line = event.split('\n').find((part) => part.startsWith('data:'));
  if (!line) return null;
  try { return JSON.parse(line.slice(5).trim()); } catch (_) { return null; }
}

async function parseStream(response, assistant) {
  if (!response.ok) throw new Error(await response.text());
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const event of events) {
      const payload = parseEvent(event);
      if (!payload) continue;
      if (payload.type === 'meta') {
        assistant.model = `${payload.model}${payload.thinking ? ' · 深度思考' : ''}`;
        assistant.sources = payload.sources || [];
      } else if (payload.type === 'delta') {
        assistant.content += payload.text || '';
      } else if (payload.type === 'error') {
        throw new Error(payload.message || 'DeepSeek 请求失败');
      }
      renderThread();
    }
  }
}

async function submit(prefill = null) {
  if (sending || !opened) return;
  const input = document.querySelector('#global-coach-input');
  const text = String(prefill ?? input?.value ?? '').trim();
  if (!text) return;
  if (!config?.configured) {
    alert('请先在设置页配置 DeepSeek API Key。');
    return;
  }
  if (input) input.value = '';
  messages.push({ role: 'user', content: text });
  const assistant = { role: 'assistant', content: '', sources: [], model: config.model };
  messages.push(assistant);
  saveMessages();
  sending = true;
  renderThread();
  const send = document.querySelector('#global-coach-send');
  if (send) send.disabled = true;
  try {
    const response = await fetch('/api/coach/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.slice(0, -1).slice(-16),
        model: config.model,
        thinking,
        context: useContext ? pageContext() : null,
      }),
    });
    await parseStream(response, assistant);
    if (!assistant.content) assistant.content = '本轮没有收到有效回答，请重试。';
  } catch (error) {
    assistant.content = `请求失败：${error?.message || error}`;
  } finally {
    sending = false;
    saveMessages();
    renderThread();
    if (send) send.disabled = false;
  }
}

export async function initGlobalCoach() {
  root = document.querySelector('#global-coach-root');
  if (!root) return;
  try {
    config = await api('/api/coach/config');
  } catch (_) {
    config = { configured: false, model: 'deepseek-v4-flash', thinking: false };
  }
  thinking = Boolean(config.thinking);
  try {
    opened = localStorage.getItem(OPEN_STORE) === '1';
    const savedContext = localStorage.getItem(CONTEXT_STORE);
    useContext = savedContext == null ? true : savedContext === '1';
  } catch (_) {}

  const headerButton = document.querySelector('#global-coach-toggle');
  if (headerButton) headerButton.onclick = () => opened ? closeCoach() : openCoach();
  document.addEventListener('keydown', (event) => {
    if (event.altKey && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      opened ? closeCoach() : openCoach();
    }
    if (event.key === 'Escape' && opened && !document.querySelector('dialog[open]')) closeCoach();
  });
  window.openGlobalCoach = (prompt = '') => openCoach(prompt);
  if (opened) renderOpen();
  else renderClosed();
}
