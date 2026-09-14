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
    api('/api/coach/config').catch(() => ({
      configured: false,
      model: 'deepseek-v4-flash',
      thinking: false,
      models: [],
    })),
  ]);
  clear(main).append(title('设置', '学习阈值、禅模式、DeepSeek 方法教练和本地数据维护统一放在这里。'));

  const deep = h('input', { type: 'number', value: settings.deep_threshold_min || 30, min: '1' });
  const focus = h('input', { type: 'number', value: settings.focus_threshold_min || 15, min: '1' });
  main.append(panel('学习计时',
    h('div', { class: 'settings-list' },
      row('深度学习阈值', h('div', { class: 'inline-number' }, deep, h('span', {}, '分钟')), '用于统计深度学习时长。'),
      row('专注学习阈值', h('div', { class: 'inline-number' }, focus, h('span', {}, '分钟')), '低于该时长的碎片记录不计入专注统计。'),
    ),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: async () => {
      await jput('/api/settings', {
        values: {
          deep_threshold_min: Number(deep.value),
          focus_threshold_min: Number(focus.value),
        },
      });
      alert('学习设置已保存');
    } }, '保存学习设置')),
  ));

  const zen = h('input', { type: 'checkbox', checked: zenModeEnabled() });
  const zenLabel = h('span', {}, zen.checked ? '已开启' : '已关闭');
  zen.onchange = () => {
    setZenMode(zen.checked);
    zenLabel.textContent = zen.checked ? '已开启' : '已关闭';
  };
  main.append(panel('界面模式',
    h('div', { class: 'settings-list' },
      row(
        '禅模式',
        h('label', { class: 'switch-field' }, zen, zenLabel),
        '工作场景下一键隐藏“公考、行测、申论、错题、老师姓名、考试倒计时”等显眼信息；顶部按钮或 Alt+Z 可随时切换。',
      ),
    ),
  ));

  const key = h('input', {
    type: 'password',
    placeholder: coach.configured ? '已配置；留空保持不变' : '输入 DeepSeek API Key',
    autocomplete: 'off',
  });
  const modelOptions = coach.models?.length
    ? coach.models
    : [
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
    ];
  const model = h('select', {}, ...modelOptions.map((item) => h(
    'option',
    { value: item.id, selected: item.id === coach.model },
    item.label,
  )));
  const thinking = h('input', { type: 'checkbox', checked: Boolean(coach.thinking) });
  const status = coach.configured ? 'DeepSeek 已配置' : '尚未配置 API Key';
  main.append(panel('DeepSeek 方法教练',
    h('div', { class: `integration-status ${coach.configured ? 'is-ready' : ''}` },
      h('strong', {}, status),
      h('span', {}, '正式功能 · 回答前先检索本地 V2 方法库与知识节点'),
    ),
    h('div', { class: 'settings-list' },
      row('API Key', key, coach.configured ? '本机已有密钥；页面不会回显。' : '仅保存在本机，不提交到 GitHub。'),
      row('默认模型', model, '即时问答可用 Flash；复杂错题与复盘可切深度模型。'),
      row('深度思考', h('label', { class: 'switch-field' }, thinking, h('span', {}, thinking.checked ? '开启' : '关闭')), '开启后响应更慢，但可用于复杂推理。'),
      row('错题自动解析', h('span', { class: 'tag correct' }, coach.configured ? '自动启用' : '等待配置'), 'PDF/训练结果确认入库后，错题自动生成标准解、最快路径、适用边界、命题陷阱和建议错因；正式错因仍由你确认。'),
    ),
    h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: async () => {
        await jput('/api/coach/config', {
          api_key: key.value.trim() || null,
          model: model.value,
          thinking: thinking.checked,
          clear_key: false,
        });
        alert('DeepSeek 配置已保存');
        location.reload();
      } }, '保存 DeepSeek 配置'),
      h('a', { class: 'secondary', href: '/coach' }, '打开 AI 方法教练'),
    ),
  ));

  main.append(panel('本地数据',
    h('p', { class: 'subtle' }, settings.data_policy || '数据保存在本机 SQLite。'),
    h('div', { class: 'actions' }, h('button', { class: 'secondary', onclick: async () => {
      const exportResult = await jpost('/api/export');
      location.href = `/api/export/${exportResult.export_id}/download`;
    } }, '导出数据备份')),
  ));
}
