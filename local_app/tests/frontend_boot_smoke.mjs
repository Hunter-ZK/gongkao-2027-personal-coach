class ClassList {
  constructor() { this.values = new Set(); }
  add(x) { this.values.add(x); }
  remove(x) { this.values.delete(x); }
  toggle(x, on) { if (on === undefined) on = !this.values.has(x); if (on) this.values.add(x); else this.values.delete(x); }
}
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.nodeType = 1; this.children = []; this.attrs = {}; this.dataset = {};
    this.classList = new ClassList(); this.className = ''; this.textContent = ''; this.innerHTML = ''; this.value = ''; this.files = [];
  }
  append(...xs) { this.children.push(...xs); }
  replaceChildren(...xs) { this.children = [...xs]; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.className = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v); if (k === 'value') this.value = String(v); }
  addEventListener() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
}
class TextNode { constructor(text) { this.nodeType = 3; this.textContent = String(text); } }

const main = new Element('main');
const mini = new Element('div');
const today = new Element('span');
const menu = new Element('button');
const sidebar = new Element('aside');
const help = new Element('dialog'); help.showModal = () => {}; help.close = () => {};
const nav = new Element('a'); nav.dataset.path = '/';

globalThis.document = {
  body: { dataset: { page: '/' } }, activeElement: { tagName: 'BODY' },
  createElement: (tag) => new Element(tag), createTextNode: (text) => new TextNode(text), addEventListener() {},
  querySelector(sel) { return { '#app-main': main, '#mini-timer': mini, '.today-label': today, '.mobile-menu': menu, '.sidebar': sidebar, '#help-dialog': help }[sel] ?? null; },
  querySelectorAll(sel) { return sel === '.side-nav a[data-path]' ? [nav] : []; },
};
globalThis.location = { href: '', search: '' };
globalThis.localStorage = { data: new Map(), getItem(k) { return this.data.get(k) ?? null; }, setItem(k, v) { this.data.set(k, String(v)); }, removeItem(k) { this.data.delete(k); } };
globalThis.confirm = () => true;
globalThis.alert = () => {};

const dashboard = {
  exams: [
    { code: 'guangdong', days_left: 90, date: '2026-12-13', is_official: false },
    { code: 'national', days_left: 75, date: '2026-11-29', is_official: false },
  ],
  timeline: { current_week: 1, weeks: [{ no: 1, start: '2026-09-14', end: '2026-09-20', theme: '恢复', status: 'current' }] },
  phase: { name: '系统恢复', code: 'P1', criteria: [], can_advance: false, blocking_count: 0 },
  week: { target_hours: 22, actual_seconds: 0, deep_ratio: 0, questions: 0, reviews_due: 0, by_day: [] },
  tasks: [], modules: { guangdong: [], national: [] }, issues: [],
};
globalThis.fetch = async (url) => {
  const u = String(url);
  let data = {};
  if (u.includes('/api/timer/state')) data = { id: 1, status: 'idle', elapsed_sec: 0, paused_sec: 0, paused_sec_live: 0 };
  else if (u.includes('/api/dashboard')) data = dashboard;
  else if (u.includes('/api/tasks')) data = [];
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

await import('../static/js/app.js');
await new Promise((resolve) => setTimeout(resolve, 100));
if (!main.children.length) throw new Error('app boot did not replace loading shell');
if (main.children[0]?.className !== 'hero') throw new Error(`unexpected first dashboard node: ${main.children[0]?.className}`);
console.log('frontend boot smoke ok');
