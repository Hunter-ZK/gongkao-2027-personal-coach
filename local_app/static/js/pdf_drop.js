import { h } from './runtime.js';

let observer = null;

function attach() {
  if (document.body?.dataset?.page !== '/import') return false;
  const input = document.querySelector('#pdf-file');
  const zone = document.querySelector('.import-hero');
  if (!input || !zone || zone.dataset.dropReady === '1') return false;
  zone.dataset.dropReady = '1';
  zone.classList.add('v3-pdf-drop-zone');
  const hint = h('div', { class: 'v3-drop-hint' },
    h('strong', {}, '拖一份 PDF 到这里即可'),
    h('span', {}, '松手后自动开始解析；也可以点击选择文件。'),
  );
  zone.prepend(hint);

  const setActive = (active) => zone.classList.toggle('drag-active', active);
  ['dragenter', 'dragover'].forEach((name) => zone.addEventListener(name, (event) => {
    event.preventDefault();
    event.stopPropagation();
    setActive(true);
  }));
  ['dragleave', 'dragend'].forEach((name) => zone.addEventListener(name, (event) => {
    event.preventDefault();
    event.stopPropagation();
    setActive(false);
  }));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setActive(false);
    const files = [...(event.dataTransfer?.files || [])];
    const pdf = files.find((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (!pdf) {
      alert('请拖入 PDF 文件');
      return;
    }
    const dt = new DataTransfer();
    dt.items.add(pdf);
    input.files = dt.files;
    hint.replaceChildren(h('strong', {}, pdf.name), h('span', {}, `${(pdf.size / 1024 / 1024).toFixed(1)} MB · 正在启动自动解析…`));
    const upload = [...zone.querySelectorAll('button')].find((button) => button.textContent.includes('导入 PDF'));
    upload?.click();
  });
  input.addEventListener('change', () => {
    if (input.files?.[0]) hint.replaceChildren(h('strong', {}, input.files[0].name), h('span', {}, '文件已选择，点击“导入 PDF 并自动归档”开始。'));
  });
  return true;
}

export function initPdfDropZone() {
  if (attach()) return;
  if (document.body?.dataset?.page !== '/import') return;
  observer?.disconnect();
  observer = new MutationObserver(() => {
    if (attach()) observer?.disconnect();
  });
  observer.observe(document.querySelector('#app-main') || document.body, { childList: true, subtree: true });
}
