import { api, main, clear, h, pct, hours, title, panel, tableWrap } from '../runtime.js';

export async function renderProgress() {
  const data = await api('/api/progress/charts');
  clear(main).append(title('能力趋势', '只展示真实学习、作答和复训形成的数据，不用空白样本推断成绩。'));
  const study = data.study.length
    ? h('div', { class: 'chart' }, ...data.study.map((row) => h('div', {
        class: 'bar',
        style: `height:${Math.max(3, Math.min(100, (row.seconds / 14400) * 100))}%`,
        title: `${row.study_date} ${hours(row.seconds)}`,
      })))
    : h('div', { class: 'empty' }, '开始学习计时后，这里显示每日有效学习时长。');
  main.append(panel('学习时长', study));
  if (!data.accuracy.length) {
    main.append(panel('训练正确率', h('div', { class: 'empty' }, '导入训练后，这里按训练来源展示趋势。')));
    return;
  }
  const rows = data.accuracy.map((row) => h('tr', {},
    h('td', {}, row.trained_on),
    h('td', {}, row.source),
    h('td', { class: 'num' }, pct(row.correct_q / row.total_q)),
  ));
  main.append(panel('训练正确率', tableWrap(h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, '日期'), h('th', {}, '来源'), h('th', {}, '正确率'))),
    h('tbody', {}, ...rows),
  ))));
}
