import { api, main, clear, h, title, panel } from '../runtime.js';
import { jput } from '../lib/api.js';

const STORE = 'gongkao.coach.chat.v1';
let messages = loadHistory();
let config = null;
let sending = false;

function loadHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE) || '[]');
    return Array.isArray(data) ? data.filter(x => ['user', 'assistant'].includes(x.role) && x.content).slice(-20) : [];
  } catch (_) {
    return [];
  }
}
function persist() { localStorage.setItem(STORE, JSON.stringify(messages.slice(-20))); }

function chatBubble(msg) {
  const who = msg.role === 'user' ? '你' : '方法教练';
  return h('article', { class: `coach-msg ${msg.role}` },
    h('div', { class: 'coach-avatar' }, msg.role === 'user' ? '你' : 'AI'),
    h('div', { class: 'coach-msg-main' },
      h('div', { class: 'coach-msg-meta' }, h('strong', {}, who), msg.model ? h('span', {}, msg.model) : null),
      h('div', { class: 'coach-msg-text' }, String(msg.content ?? '')),
      msg.sources?.length ? h('div', { class: 'coach-cites' }, ...msg.sources.slice(0, 5).map(s => h('span', {}, s.title))) : null,
    ),
  );
}

function renderConversation() {
  const box = document.querySelector('#coach-thread');
  if (!box) return;
  clear(box);
  if (!messages.length) {
    box.append(h('div', { class: 'coach-welcome' },
      h('span', { class: 'coach-orb' }, 'AI'),
      h('h2', {}, '直接问你的行测方法问题'),
      h('p', {}, '回答会先检索平台方法库与正式知识节点，再交给 DeepSeek 组织答案。没有本地依据的老师观点不会被编造。'),
    ));
  } else messages.forEach(m => box.append(chatBubble(m)));
  box.scrollTop = box.scrollHeight;
}

function suggestion(text) { return h('button', { class: 'coach-suggestion', onclick: () => submitQuestion(text) }, text); }

function configPanel() {
  const key = h('input', { id: 'coach-key', type: 'password', autocomplete: 'off', placeholder: config.configured ? '已配置；留空则不修改' : '粘贴 DeepSeek API Key' });
  const model = h('select', { id: 'coach-model' }, ...(config.models || []).map(m => h('option', { value: m.id, selected: m.id === config.model }, m.label)));
  const thinking = h('input', { id: 'coach-thinking', type: 'checkbox', checked: !!config.thinking });
  return h('aside', { class: 'coach-side' },
    panel('Skill 状态', h('div', { class: 'coach-status' },
      h('div', {}, h('span', { class: `status-dot ${config.configured ? 'on' : ''}` }), h('strong', {}, config.configured ? 'DeepSeek 已配置' : '等待配置 API Key')),
      h('p', {}, 'Skill：gongkao-method-coach'),
      h('p', {}, `来源：${config.sources?.length || 0} 个已纳入仓库 + 平台正式知识节点`),
    )),
    panel('DeepSeek 配置',
      h('div', { class: 'field' }, h('label', {}, 'API Key'), key),
      h('div', { class: 'field' }, h('label', {}, '默认模型'), model),
      h('label', { class: 'coach-toggle' }, thinking, h('span', {}, '开启深度思考（即时问答默认关闭）')),
      h('div', { class: 'actions coach-config-actions' },
        h('button', { class: 'primary', onclick: async () => {
          await jput('/api/coach/config', { api_key: key.value || null, model: model.value, thinking: thinking.checked });
          config = await api('/api/coach/config'); renderCoach();
        } }, '保存配置'),
        config.key_source === 'local' ? h('button', { class: 'secondary', onclick: async () => {
          if (!confirm('清除本机保存的 DeepSeek API Key？')) return;
          await jput('/api/coach/config', { model: model.value, thinking: thinking.checked, clear_key: true });
          config = await api('/api/coach/config'); renderCoach();
        } }, '清除 Key') : null,
      ),
      h('p', { class: 'subtle' }, config.key_source === 'environment' ? '当前 API Key 来自环境变量 DEEPSEEK_API_KEY；页面不会读取或回显密钥。' : 'API Key 仅写入本机 data/secrets.json，该文件已排除 Git 提交，也不会进入平台数据导出。'),
    ),
    panel('回答边界', h('ul', { class: 'coach-rules' },
      h('li', {}, '优先依据平台方法库和已建设知识节点。'),
      h('li', {}, 'GitHub Skill 只作为二次证据，不冒充老师原话。'),
      h('li', {}, '最新公告、岗位资格等时效事实，本地无依据时会提示外部核验。'),
    )),
  );
}

async function parseSse(response, assistant) {
  if (!response.ok) throw new Error(await response.text());
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n'); buffer = events.pop() || '';
    for (const event of events) {
      const line = event.split('\n').find(x => x.startsWith('data:')); if (!line) continue;
      let payload; try { payload = JSON.parse(line.slice(5).trim()); } catch (_) { continue; }
      if (payload.type === 'meta') { assistant.model = `${payload.model}${payload.thinking ? ' · 深度思考' : ''}`; assistant.sources = payload.sources || []; }
      else if (payload.type === 'delta') assistant.content += payload.text || '';
      else if (payload.type === 'error') throw new Error(payload.message || 'DeepSeek 请求失败');
      renderConversation();
    }
  }
}

async function submitQuestion(prefill = null) {
  if (sending) return;
  const input = document.querySelector('#coach-input');
  const text = (prefill ?? input?.value ?? '').trim(); if (!text) return;
  if (!config?.configured) { alert('请先在右侧配置 DeepSeek API Key。'); return; }
  if (input) input.value = '';
  messages.push({ role: 'user', content: text });
  const assistant = { role: 'assistant', content: '', sources: [], model: config.model };
  messages.push(assistant); persist(); renderConversation(); sending = true;
  const send = document.querySelector('#coach-send'); if (send) send.disabled = true;
  try {
    const response = await fetch('/api/coach/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: messages.slice(0, -1).slice(-16), model: config.model, thinking: config.thinking }) });
    await parseSse(response, assistant);
    if (!assistant.content) assistant.content = '本轮没有收到有效回答，请重试。';
  } catch (e) { assistant.content = `请求失败：${e.message || e}`; }
  finally { sending = false; persist(); renderConversation(); if (send) send.disabled = false; }
}

function renderCoach() {
  clear(main).append(title('AI 方法教练', 'Skill 先检索本地方法体系，再由 DeepSeek 进行即时解答。默认 V4 Flash + 非思考模式，优先响应速度。', 'GONGKAO SKILL · DEEPSEEK', [h('button', { class: 'secondary', onclick: () => { messages = []; persist(); renderConversation(); } }, '清空对话')]));
  const input = h('textarea', { id: 'coach-input', rows: 3, placeholder: '例如：资料分析里，什么时候应该截位直除，什么时候必须精算？' });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitQuestion(); } });
  main.append(h('div', { class: 'coach-layout' },
    h('section', { class: 'coach-chat panel' },
      h('div', { class: 'coach-suggestions' }, suggestion('资料分析什么时候估算、什么时候精算？'), suggestion('加强题里“前提假设”到底怎么判断？'), suggestion('逻辑填空二选一时如何做相对比较？'), suggestion('帮我建立一套错题复盘规则。')),
      h('div', { id: 'coach-thread', class: 'coach-thread' }),
      h('div', { class: 'coach-composer' }, input, h('div', { class: 'coach-composer-foot' }, h('span', {}, 'Enter 发送 · Shift+Enter 换行'), h('button', { id: 'coach-send', class: 'primary', onclick: () => submitQuestion() }, '发送给方法教练'))),
    ),
    configPanel(),
  ));
  renderConversation();
}

export async function renderCoachPage() { config = await api('/api/coach/config'); renderCoach(); }
