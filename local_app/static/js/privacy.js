const ZEN_KEY = 'liano.zen';
const replacements = [
  ['2027 公考私教', '个人工作台'], ['2027 公考备考工作台', '个人工作台'], ['个人学习与训练记录', '个人工作记录'],
  ['战略主攻', '当前重点'], ['广东省直 / 深圳市直', 'Q4 工作计划'],
  ['今日作战', '今日工作'], ['学习驾驶舱', '工作概览'], ['训练闭环', '任务记录'], ['训练记录', '记录'],
  ['错题矩阵', '问题清单'], ['错题本', '问题清单'], ['错题复训', '问题复盘'], ['真题智能导入', '资料导入'], ['真题导入', '资料导入'],
  ['能力体系', '知识体系'], ['AI 方法教练', 'AI 助手'], ['AI方法教练', 'AI助手'], ['行测方法体系', '方法库'], ['行测体系', '方法库'],
  ['申论工坊', '写作区'], ['备考路线', '阶段计划'], ['备考规划', '阶段计划'],
  ['国家公务员考试', '项目A'], ['公务员考试', '职业项目'], ['国考副省级', '项目A'], ['广东省考', '项目B'], ['国考', '项目A'], ['省考', '项目B'],
  ['网友红领巾', '来源A'], ['花生十三', '来源B'], ['张弓', '来源C'], ['薛睿', '来源D'], ['小P', '来源E'],
  ['正确答案', '参考结果'], ['你的答案', '当前结果'], ['正确率', '命中率'], ['题库', '资料库'], ['错题', '问题'], ['复训', '复盘'],
  ['答题', '处理'], ['做题', '处理'], ['题目', '条目'], ['题型', '类型'], ['作答', '记录'], ['真题', '历史样本'], ['模考', '模拟任务'], ['刷题', '批量处理'],
  ['练习', '记录'], ['答案', '结果'], ['得分', '指标'], ['分数', '指标'], ['上岸', '达成目标'], ['公务员', '岗位'], ['考公', '工作计划'], ['粉笔', '来源A'],
  ['训练', '记录'], ['考试', '项目'], ['备考', '工作'], ['公考', '个人'], ['行测', '方法'], ['申论', '写作'],
];
const originals = new Map();
let active = false;
let observer = null;
let applying = false;
let originalTitle = globalThis.__lianoNormalTitle || document.title;

function sanitize(text) {
  let out = String(text ?? '');
  for (const [from, to] of replacements) out = out.split(from).join(to);
  return out;
}
function eligible(node) {
  const p = node.parentElement;
  return p && !['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION'].includes(p.tagName) && !p.closest?.('[data-zen-ignore]');
}
function applyTextNode(node) {
  if (!active || !eligible(node)) return;
  if (!originals.has(node)) originals.set(node, node.nodeValue);
  const next = sanitize(originals.get(node));
  if (node.nodeValue !== next) node.nodeValue = next;
}
function walk(root = document.body) {
  if (!document.createTreeWalker || !globalThis.NodeFilter) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) applyTextNode(node);
}
function startObserver() {
  if (!globalThis.MutationObserver) return;
  observer?.disconnect();
  observer = new MutationObserver((records) => {
    if (!active || applying) return;
    applying = true;
    try {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 3) applyTextNode(node);
          else if (node.nodeType === 1) walk(node);
        }
      }
    } finally {
      applying = false;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
function enable() {
  if (active) return;
  active = true;
  if (document.documentElement) document.documentElement.dataset.zen = '1';
  document.body?.classList?.add?.('zen-mode');
  try { localStorage.setItem(ZEN_KEY, '1'); } catch {}
  if (document.title !== 'Work Notes · Workspace') originalTitle = document.title;
  document.title = 'Work Notes · Workspace';
  walk();
  startObserver();
}
function disable() {
  if (!active) return;
  active = false;
  observer?.disconnect();
  observer = null;
  for (const [node, text] of originals) if (node.isConnected) node.nodeValue = text;
  originals.clear();
  document.body?.classList?.remove?.('zen-mode');
  if (document.documentElement) delete document.documentElement.dataset.zen;
  try { localStorage.removeItem(ZEN_KEY); } catch {}
  document.title = originalTitle;
}
export function zenModeEnabled() {
  if (active) return true;
  try { return localStorage.getItem(ZEN_KEY) === '1'; } catch { return false; }
}
export function setZenMode(on) {
  if (on) enable();
  else disable();
}
export function toggleZenMode() {
  setZenMode(!active);
}
export function initZenMode() {
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      toggleZenMode();
    }
  });
  if (zenModeEnabled()) enable();
  else if (document.documentElement) delete document.documentElement.dataset.zen;
}
export { sanitize as sanitizeZenText };
