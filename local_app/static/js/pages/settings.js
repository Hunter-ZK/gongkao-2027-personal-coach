import { api, jpost, main, clear, h, title, panel } from '../runtime.js';
import { jput } from '../lib/api.js';
import { setZenMode, zenModeEnabled } from '../privacy.js';

function row(label, value, hint = '') {
  return h('div', { class: 'setting-row' },
    h('div', {}, h('strong', {}, label), hint ? h('small', {}, hint) : null),
    value,
  );
}

function syncBadge(sync) {
  if (!sync?.available) return h('span', { class: 'tag pending' }, '当前不可用');
  if (sync.behind > 0 || (sync.remote_revision && sync.remote_revision !== sync.last_sync_revision)) return h('span', { class: 'tag pending' }, '云端有更新');
  if (sync.local_dirty) return h('span', { class: 'tag pending' }, '本机有新进度');
  return h('span', { class: 'tag correct' }, sync.last_sync_at ? '已同步' : '可使用');
}

export async function renderSettings() {
  const [settings, coach, sync] = await Promise.all([
    api('/api/settings'),
    api('/api/coach/config').catch(() => ({
      configured: false,
      model: 'deepseek-v4-flash',
      thinking: false,
      models: [],
    })),
    api('/api/sync/status').catch((error) => ({ available: false, error: error.message })),
  ]);
  clear(main).append(title('设置', '学习阈值、双设备同步、禅模式、AI 方法教练和本地数据维护统一放在这里。'));

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

  const syncStatusText = sync.available
    ? `分支 ${sync.branch || '—'} · 最近同步 ${sync.last_sync_at || '尚未同步'}${sync.remote_device ? ` · 云端设备 ${sync.remote_device}` : ''}`
    : (sync.error || '暂时无法访问私有同步仓库');
  main.append(panel('公司 / 家里双设备同步',
    h('div', { class: `integration-status ${sync.available ? 'is-ready' : ''}` },
      h('strong', {}, 'Git Checkpoint Sync'),
      syncBadge(sync),
      h('span', {}, '不要求实时在线：公司电脑提交一次，回家电脑拉取一次即可接着学习。'),
    ),
    h('div', { class: 'settings-list' },
      row('当前状态', h('span', {}, syncStatusText), '系统同步学习数据库与题目图片；拉取前会自动备份本机数据库。'),
      row('私有同步仓库', h('code', {}, sync.origin || '—'), '默认使用 Civil_gemini2 的 gongkao-personal-data 私有分支作为数据交换区；公开公考代码仓库不会保存你的学习数据库、题目图片或 API Key。'),
      row('首次使用', h('span', {}, sync.initialized ? '本机同步缓存已建立' : '点击提交/拉取时自动初始化'), '若本机 Git 尚未登录 GitHub，只需完成一次 GitHub 身份认证。'),
      row('冲突保护', h('span', { class: 'tag correct' }, '已启用'), '本机和云端同时存在新数据时不会静默覆盖，会先阻止操作并提示。'),
    ),
    h('div', { class: 'actions' },
      h('button', { class: 'primary', disabled: !sync.available, onclick: async () => {
        try {
          const result = await jpost('/api/sync/push', {});
          alert(`提交完成：${result.revision || '最新版本'}。回家后点击“拉取云端进度”即可。`);
          location.reload();
        } catch (error) {
          alert(error.message);
        }
      } }, '提交本机进度'),
      h('button', { class: 'secondary', disabled: !sync.available, onclick: async () => {
        try {
          const result = await jpost('/api/sync/pull', { force: false });
          alert(`拉取完成：${result.revision || '最新版本'}。现在可直接继续学习。`);
          location.reload();
        } catch (error) {
          if (/未提交学习数据|本机有未提交/.test(error.message) && confirm(`${error.message}\n\n是否强制使用云端版本？系统会先备份本机数据库。`)) {
            try {
              await jpost('/api/sync/pull', { force: true });
              location.reload();
            } catch (forcedError) {
              alert(forcedError.message);
            }
          } else {
            alert(error.message);
          }
        }
      } }, '拉取云端进度'),
    ),
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
      row('错题自动解析', h('span', { class: 'tag correct' }, coach.configured ? '自动启用' : '等待配置'), 'PDF 入库后由后端自动提交错题，优先调用你提供的 Skill / V2 方法库，生成标准解、快解边界、命题陷阱、建议错因与知识节点关联。'),
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
    h('p', { class: 'subtle' }, settings.data_policy || '运行时数据保存在本机 SQLite；跨设备通过私有 Git Checkpoint 同步。'),
    h('div', { class: 'actions' }, h('button', { class: 'secondary', onclick: async () => {
      const exportResult = await jpost('/api/export');
      location.href = `/api/export/${exportResult.export_id}/download`;
    } }, '导出数据备份')),
  ));
}
