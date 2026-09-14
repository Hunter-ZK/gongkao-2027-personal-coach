import { api, main, clear, h, tag, title, panel, tableWrap } from '../runtime.js';

export async function renderMethods() {
  const methods = await api('/api/methods');
  const aiEnabled = localStorage.getItem('liano.aiCoachEnabled') === '1';
  clear(main).append(title('方法与结论', '这里只保存跨题型的方法论、采用边界和你自己的训练结论；具体题型方法并入行测体系节点。'));
  if (aiEnabled) {
    main.append(h('section', { class: 'notice-strip' },
      h('div', {}, h('strong', {}, '实验性 AI 方法教练已开启'), h('span', {}, '回答会先检索本地方法体系，再调用你配置的 DeepSeek。')),
      h('a', { class: 'secondary', href: '/coach' }, '打开 AI 教练'),
    ));
  }
  if (!methods.length) {
    main.append(panel('方法记录', h('div', { class: 'empty' }, '还没有个人方法结论。优先从真实训练与复盘中沉淀。')));
    return;
  }
  const rows = methods.map((method) => h('tr', {},
    h('td', {}, method.name),
    h('td', {}, method.applies_to || '—'),
    h('td', {}, method.source || '—'),
    h('td', {}, tag(method.adoption, method.adoption === '主方法' ? 'correct' : method.adoption === '明确拒绝' ? 'wrong' : 'pending')),
    h('td', {}, method.basis || '—'),
  ));
  main.append(panel('方法记录', tableWrap(h('table', {},
    h('thead', {}, h('tr', {}, ...['方法', '适用范围', '来源', '采用级别', '依据'].map((label) => h('th', {}, label)))),
    h('tbody', {}, ...rows),
  ))));
}
