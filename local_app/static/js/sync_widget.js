import { api, jpost, h } from './runtime.js';

let dialog = null;
let currentStatus = null;

function shortTime(value) {
  if (!value) return '尚未同步';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(value));
  } catch (_) {
    return value;
  }
}

function statusTone(status) {
  if (!status?.available) return 'is-offline';
  if (status.behind > 0 || (status.remote_revision && status.remote_revision !== status.last_sync_revision)) return 'has-remote';
  if (status.local_dirty) return 'has-local';
  return 'is-synced';
}

function statusLabel(status) {
  if (!status?.available) return '同步不可用';
  if (status.behind > 0 || (status.remote_revision && status.remote_revision !== status.last_sync_revision)) return '云端有更新';
  if (status.local_dirty) return '本机有新进度';
  if (status.last_sync_at) return '已同步';
  return '设置同步';
}

async function loadStatus(refresh = false) {
  currentStatus = await api(`/api/sync/status${refresh ? '?refresh=true' : ''}`);
  paintTopButton();
  return currentStatus;
}

function paintTopButton() {
  const root = document.querySelector('#global-sync-root');
  if (!root || !currentStatus) return;
  const button = root.querySelector('button');
  if (!button) return;
  button.dataset.state = statusTone(currentStatus);
  const label = button.querySelector('.sync-label');
  const meta = button.querySelector('.sync-meta');
  if (label) label.textContent = statusLabel(currentStatus);
  if (meta) meta.textContent = currentStatus.last_sync_at ? shortTime(currentStatus.last_sync_at) : '公司 / 家里接续';
}

function row(label, value, tone = '') {
  return h('div', { class: `sync-status-row ${tone}`.trim() }, h('span', {}, label), h('strong', {}, value || '—'));
}

function ensureDialog() {
  if (dialog) return dialog;
  dialog = h('dialog', { class: 'sync-dialog' });
  document.body.append(dialog);
  return dialog;
}

async function openDialog() {
  const host = ensureDialog();
  host.replaceChildren(h('div', { class: 'sync-loading' }, '正在检查同步状态…'));
  host.showModal();
  try {
    const status = await loadStatus(true);
    renderDialog(status);
  } catch (error) {
    host.replaceChildren(
      h('div', { class: 'sync-dialog-head' }, h('h2', {}, '双设备学习同步'), h('button', { class: 'icon-button', onclick: () => host.close() }, '×')),
      h('div', { class: 'sync-error' }, error.message),
    );
  }
}

function renderDialog(status) {
  const host = ensureDialog();
  const available = Boolean(status?.available);
  const remoteNew = available && Boolean(status.remote_revision && status.remote_revision !== status.last_sync_revision);
  const localNew = available && Boolean(status.local_dirty);
  const note = h('div', { class: 'sync-note' },
    h('strong', {}, '工作流'),
    h('p', {}, '公司电脑学习后点“提交本机进度”；回家打开项目后点“拉取云端进度”。系统会在拉取前自动备份本机数据库。'),
    h('p', {}, status?.note || 'API Key 与密钥文件不会被同步。'),
  );

  const pushButton = h('button', { class: 'primary', disabled: !available }, '提交本机进度');
  const pullButton = h('button', { class: remoteNew ? 'primary' : 'secondary', disabled: !available }, remoteNew ? '拉取云端新进度' : '检查并拉取');
  const result = h('div', { class: 'sync-result subtle' });

  pushButton.onclick = async () => {
    pushButton.disabled = true;
    result.textContent = '正在创建学习快照并推送 GitHub…';
    try {
      const data = await jpost('/api/sync/push', {});
      result.textContent = `提交完成：${data.revision || '最新版本'}。另一台设备现在可以拉取。`;
      currentStatus = data.status || await loadStatus(true);
      renderDialog(currentStatus);
    } catch (error) {
      result.textContent = error.message;
      pushButton.disabled = false;
    }
  };

  pullButton.onclick = async () => {
    pullButton.disabled = true;
    result.textContent = '正在拉取 GitHub 学习快照…';
    try {
      const data = await jpost('/api/sync/pull', { force: false });
      result.textContent = `拉取完成：${data.revision || '最新版本'}。${data.restart_recommended ? '检测到代码也有更新，建议重启工作台。' : '可直接继续学习。'}`;
      currentStatus = data.status || await loadStatus(false);
      renderDialog(currentStatus);
    } catch (error) {
      if (/未提交学习数据|本机有未提交/.test(error.message) && confirm(`${error.message}\n\n是否放弃本机未同步改动，使用云端版本覆盖？系统会先自动备份。`)) {
        try {
          const data = await jpost('/api/sync/pull', { force: true });
          currentStatus = data.status || await loadStatus(false);
          renderDialog(currentStatus);
          return;
        } catch (forcedError) {
          result.textContent = forcedError.message;
        }
      } else {
        result.textContent = error.message;
      }
      pullButton.disabled = false;
    }
  };

  host.replaceChildren(
    h('div', { class: 'sync-dialog-head' },
      h('div', {}, h('h2', {}, '双设备学习同步'), h('p', {}, 'Git Checkpoint · 不要求实时在线')),
      h('button', { class: 'icon-button', onclick: () => host.close(), 'aria-label': '关闭' }, '×'),
    ),
    available
      ? h('div', { class: 'sync-status-grid' },
          row('当前分支', status.branch),
          row('本机状态', localNew ? '有未提交学习进度' : '与最近同步一致', localNew ? 'warn' : 'good'),
          row('云端状态', remoteNew ? `新版本 · ${shortTime(status.remote_created_at)}` : '无待拉取版本', remoteNew ? 'warn' : 'good'),
          row('最近同步', shortTime(status.last_sync_at)),
          row('云端设备', status.remote_device || '—'),
          row('远端', status.origin || 'origin'),
        )
      : h('div', { class: 'sync-error' }, status?.error || '当前环境无法使用 Git 同步。'),
    note,
    h('div', { class: 'sync-actions' }, pushButton, pullButton),
    result,
  );
}

export async function initSyncWidget() {
  const root = document.querySelector('#global-sync-root');
  if (!root) return;
  const button = h('button', { class: 'sync-top-button', type: 'button', onclick: openDialog },
    h('span', { class: 'sync-dot' }),
    h('span', { class: 'sync-copy' },
      h('strong', { class: 'sync-label' }, '同步'),
      h('small', { class: 'sync-meta' }, '检查中…'),
    ),
  );
  root.replaceChildren(button);
  try {
    await loadStatus(false);
  } catch (_) {
    currentStatus = { available: false };
    paintTopButton();
  }
}
