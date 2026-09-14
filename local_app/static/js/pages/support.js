import { api, jpost, main, clear, h, pct, hours, tag, title, panel, tableWrap, criterionCard } from '../runtime.js';
import { jput } from '../lib/api.js';
import { setZenMode, zenModeEnabled } from '../privacy.js';

function row(label, value, hint = '') {
  return h('div', { class: 'setting-row' },
    h('div', {}, h('strong', {}, label), hint ? h('small', {}, hint) : null),
    value,
  );
}

export async function renderPlan() {
  const [weeks, caps, phases] = await Promise.all([
    api('/api/plan/timeline'),
    api('/api/plan/capability'),
    api('/api/plan/phases'),
  ]);
  clear(main).append(title('备考规划', '时间路线、能力目标和阶段门槛分开记录，避免把计划当成绩。'));
  const weekRows = weeks.map((w) => h('tr', {},
    h('td', {}, `W${w.week_no}`),
    h('td', {}, `${w.start_date}—${w.end_date}`),
    h('td', {}, w.theme),
    h('td', {}, w.phase_code),
    h('td', { class: 'num' }, `${w.target_hours}h`),
    h('td', { class: 'num' }, w.target_questions),
  ));
  main.append(panel('13 周时间路线', tableWrap(h('table', {},
    h('thead', {}, h('tr', {}, ...['周', '日期', '主题', '阶段', '目标时长', '题量'].map((x) => h('th', {}, x)))),
    h('tbody', {}, ...weekRows),
  ))));
  const capRows = caps.map((x) => h('tr', {},
    h('td', {}, x.exam_code === 'guangdong' ? '广东' : '国考'),
    h('td', {}, x.name),
    h('td', { class: 'num' }, x.total_score.toFixed(1)),
    h('td', { class: 'num' }, x.estimated_score == null ? '无法估算' : x.estimated_score.toFixed(1)),
    h('td', { class: 'num' }, x.sample_n),
    h('td', { class: 'num' }, pct(x.target_accuracy)),
    h('td', {}, x.training_need),
  ));
  main.append(panel('能力路线', tableWrap(h('table', {},
    h('thead', {}, h('tr', {}, ...['卷型', '模块', '目标分(估)', '当前预估', '样本', '目标正确率', '训练建议'].map((x) => h('th', {}, x)))),
    h('tbody', {}, ...capRows),
  ))));
  const phaseNodes = phases.flatMap((p) => [
    h('div', { class: 'phase-title' }, h('span', { class: 'phase-num' }, p.code), h('div', {}, h('h3', {}, p.name), h('p', {}, p.goal_md))),
    ...(p.criteria || []).map(criterionCard),
  ]);
  main.append(panel('阶段与晋级', h('div', { class: 'criterion-list' }, ...phaseNodes)));
}

export async function renderProgress() {
  const d = await api('/api/progress/charts');
  clear(main).append(title('能力趋势', '只展示真实学习、作答和复训形成的数据，不用空白样本推断成绩。'));
  const study = d.study.length
    ? h('div', { class: 'chart' }, ...d.study.map((x) => h('div', { class: 'bar', style: `height:${Math.max(3, Math.min(100, (x.seconds / 14400) * 100))}%`, title: `${x.study_date} ${hours(x.seconds)}` })))
    : h('div', { class: 'empty' }, '开始学习计时后，这里显示每日有效学习时长。');
  main.append(panel('学习时长', study));
  if (!d.accuracy.length) {
    main.append(panel('训练正确率', h('div', { class: 'empty' }, '导入训练后，这里按训练来源展示趋势。')));
    return;
  }
  const rows = d.accuracy.map((x) => h('tr', {},
    h('td', {}, x.trained_on),
    h('td', {}, x.source),
    h('td', { class: 'num' }, pct(x.correct_q / x.total_q)),
  ));
  main.append(panel('训练正确率', tableWrap(h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, '日期'), h('th', {}, '来源'), h('th', {}, '正确率'))),
    h('tbody', {}, ...rows),
  ))));
}

export async function renderMethods() {
  const methods = await api('/api/methods');
  const aiEnabled = localStorage.getItem('liano.aiCoachEnabled') === '1';
  clear(main).append(title('方法与结论', '这里保存跨题型的方法论、采用边界和你自己的训练结论。具体题型方法已并入行测体系节点。'));
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
  const rows = methods.map((x) => h('tr', {},
    h('td', {}, x.name),
    h('td', {}, x.applies_to || '—'),
    h('td', {}, x.source || '—'),
    h('td', {}, tag(x.adoption, x.adoption === '主方法' ? 'correct' : x.adoption === '明确拒绝' ? 'wrong' : 'pending')),
    h('td', {}, x.basis || '—'),
  ));
  main.append(panel('方法记录', tableWrap(h('table', {},
    h('thead', {}, h('tr', {}, ...['方法', '适用范围', '来源', '采用级别', '依据'].map((x) => h('th', {}, x)))),
    h('tbody', {}, ...rows),
  ))));
}

export async function renderSettings() {
  const [settings, coach] = await Promise.all([
    api('/api/settings'),
    api('/api/coach/config').catch(() => ({ configured: false, model: 'deepseek-v4-flash', thinking: false })),
  ]);
  clear(main).append(title('设置', '学习阈值、实验性功能和本地数据维护统一放在这里。'));

  const deep = h('input', { type: 'number', value: settings.deep_threshold_min || 30, min: '1' });
  const focus = h('input', { type: 'number', value: settings.focus_threshold_min || 15, min: '1' });
  main.append(panel('学习计时',
    h('div', { class: 'settings-list' },
      row('深度学习阈值', h('div', { class: 'inline-number' }, deep, h('span', {}, '分钟')), '用于统计深度学习时长。'),
      row('专注学习阈值', h('div', { class: 'inline-number' }, focus, h('span', {}, '分钟')), '低于该时长的碎片记录不计入专注统计。'),
    ),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: async () => {
      await jput('/api/settings', { values: { deep_threshold_min: Number(deep.value), focus_threshold_min: Number(focus.value) } });
      alert('学习设置已保存');
    } }, '保存学习设置')),
  ));

  const zen = h('input', { type: 'checkbox', checked: zenModeEnabled() });
  const ai = h('input', { type: 'checkbox', checked: localStorage.getItem('liano.aiCoachEnabled') === '1' });
  const experimentHost = h('div', { class: 'settings-list' });
  const renderExperiments = () => {
    clear(experimentHost).append(
      row('禅模式', h('label', { class: 'switch-field' }, zen, h('span', {}, zen.checked ? '已开启' : '已关闭')), '工作场景下隐藏考试相关措辞；Alt+Z 仍可随时切换。'),
      row('AI 方法教练', h('label', { class: 'switch-field' }, ai, h('span', {}, ai.checked ? '已开启' : '已关闭')), '实验性外部能力，默认关闭；开启后才在“方法与结论”出现入口。'),
    );
  };
  zen.onchange = () => { setZenMode(zen.checked); renderExperiments(); };
  ai.onchange = () => { localStorage.setItem('liano.aiCoachEnabled', ai.checked ? '1' : '0'); renderExperiments(); renderAiConfig(); };
  renderExperiments();

  const aiHost = h('div', {});
  const renderAiConfig = () => {
    clear(aiHost);
    if (!ai.checked) return;
    const key = h('input', { type: 'password', placeholder: coach.configured ? '已配置；留空保持不变' : '输入 DeepSeek API Key', autocomplete: 'off' });
    const model = h('select', {},
      h('option', { value: 'deepseek-v4-flash', selected: coach.model === 'deepseek-v4-flash' }, 'DeepSeek V4 Flash'),
      h('option', { value: 'deepseek-v4-pro', selected: coach.model === 'deepseek-v4-pro' }, 'DeepSeek V4 Pro'),
    );
    const thinking = h('input', { type: 'checkbox', checked: Boolean(coach.thinking) });
    aiHost.append(panel('AI 方法教练配置',
      h('div', { class: 'settings-list' },
        row('API Key', key, coach.configured ? '本机已有密钥；页面不会回显。' : '仅保存在本机，不提交到 GitHub。'),
        row('模型', model, '即时问答优先使用 Flash；复杂复盘可切 Pro。'),
        row('深度思考', h('label', { class: 'switch-field' }, thinking, h('span', {}, '按需开启')), '开启后响应更慢，适合复杂诊断。'),
      ),
      h('div', { class: 'actions' },
        h('button', { class: 'primary', onclick: async () => {
          await jput('/api/coach/config', { api_key: key.value.trim() || null, model: model.value, thinking: thinking.checked, clear_key: false });
          alert('AI 配置已保存');
        } }, '保存 AI 配置'),
        h('a', { class: 'secondary', href: '/coach' }, '打开 AI 教练'),
      ),
    ));
  };
  renderAiConfig();
  main.append(panel('实验性功能', experimentHost), aiHost);

  main.append(panel('本地数据',
    h('p', { class: 'subtle' }, settings.data_policy || '数据保存在本机 SQLite。'),
    h('div', { class: 'actions' }, h('button', { class: 'secondary', onclick: async () => {
      const x = await jpost('/api/export');
      location.href = `/api/export/${x.export_id}/download`;
    } }, '导出数据备份')),
  ));
}
