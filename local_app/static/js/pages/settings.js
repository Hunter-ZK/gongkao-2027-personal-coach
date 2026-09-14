import { api, jpost, main, clear, h, title, panel } from '../runtime.js';
import { jput } from '../lib/api.js';
import { setZenMode, zenModeEnabled } from '../privacy.js';

function row(label, value, hint = '') {
  return h('div', { class: 'setting-row' },
    h('div', {}, h('strong', {}, label), hint ? h('small', {}, hint) : null),
    value,
  );
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
  const aiHost = h('div', {});

  const renderExperiments = () => {
    clear(experimentHost).append(
      row('禅模式', h('label', { class: 'switch-field' }, zen, h('span', {}, zen.checked ? '已开启' : '已关闭')), '工作场景下隐藏考试相关措辞；Alt+Z 仍可随时切换。'),
      row('AI 方法教练', h('label', { class: 'switch-field' }, ai, h('span', {}, ai.checked ? '已开启' : '已关闭')), '实验性外部能力，默认关闭；开启后才在“方法与结论”出现入口。'),
    );
  };

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
          await jput('/api/coach/config', {
            api_key: key.value.trim() || null,
            model: model.value,
            thinking: thinking.checked,
            clear_key: false,
          });
          alert('AI 配置已保存');
        } }, '保存 AI 配置'),
        h('a', { class: 'secondary', href: '/coach' }, '打开 AI 教练'),
      ),
    ));
  };

  zen.onchange = () => {
    setZenMode(zen.checked);
    renderExperiments();
  };
  ai.onchange = () => {
    localStorage.setItem('liano.aiCoachEnabled', ai.checked ? '1' : '0');
    renderExperiments();
    renderAiConfig();
  };
  renderExperiments();
  renderAiConfig();
  main.append(panel('实验性功能', experimentHost), aiHost);

  main.append(panel('本地数据',
    h('p', { class: 'subtle' }, settings.data_policy || '数据保存在本机 SQLite。'),
    h('div', { class: 'actions' }, h('button', { class: 'secondary', onclick: async () => {
      const exportResult = await jpost('/api/export');
      location.href = `/api/export/${exportResult.export_id}/download`;
    } }, '导出数据备份')),
  ));
}
