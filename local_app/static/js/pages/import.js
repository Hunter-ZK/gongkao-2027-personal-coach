import { api, jpost, jpatch, main, clear, h, tag, title, panel } from '../runtime.js';

function imageSrc(ref) {
  if (!ref) return '';
  const raw = String(ref).replaceAll('\\', '/');
  if (raw.startsWith('/data-images/')) return raw;
  const marker = '/data/images/';
  if (raw.includes(marker)) return `/data-images/${raw.split(marker).pop()}`;
  if (raw.startsWith('data/images/')) return `/data-images/${raw.slice('data/images/'.length)}`;
  return `/data-images/${raw.replace(/^\/+/, '')}`;
}

function imageStack(refs = [], cls = 'proof-image-stack') {
  return h('div', { class: cls }, ...refs.filter(Boolean).map((ref) => h('img', {
    class: 'proof-image',
    src: imageSrc(ref),
    loading: 'lazy',
  })));
}

function stat(label, value) {
  return h('div', { class: 'mini-stat' }, h('small', {}, label), h('strong', {}, String(value ?? '—')));
}

export async function renderImport() {
  clear(main).append(title(
    '导入',
    '粉笔“快速智能练习”会保留题干、选项、图表、正确答案和你的作答；错题入库后可自动交给 DeepSeek 按本地方法体系解析。',
  ));
  const input = h('input', { type: 'file', accept: '.pdf', id: 'pdf-file' });
  const msg = h('div', { class: 'subtle' });
  const upload = h('button', { class: 'primary', onclick: async () => {
    if (!input.files[0]) return alert('请先选择 PDF');
    const fd = new FormData();
    fd.append('file', input.files[0]);
    msg.textContent = '正在解析 PDF…';
    try {
      const res = await api('/api/import/pdf', { method: 'POST', body: fd });
      msg.textContent = res.message || '解析完成';
      await showProof(res.import_id);
    } catch (error) {
      msg.textContent = error.message;
    }
  } }, '开始解析');
  main.append(
    h('section', { class: 'import-hero' },
      h('div', { class: 'import-step-kicker' }, 'PDF → 校对 → 题库 / 作答 / 错题 → DeepSeek 解析'),
      h('h3', {}, '导入真实训练结果'),
      h('p', {}, '标准粉笔版式可自动核验；结构不完整、图片归属不确定或未知版式仍需人工确认后才进入统计。'),
      h('div', { class: 'actions', style: 'justify-content:center' }, input, upload),
      msg,
    ),
    h('div', { id: 'proof-host', style: 'margin-top:18px' }),
  );
}

function optionBlocks(question) {
  const options = question.options || {};
  const images = question.option_images || {};
  const blocks = ['A', 'B', 'C', 'D']
    .filter((key) => key in options || images[key])
    .map((key) => h('div', { class: 'proof-option' },
      h('strong', {}, `${key}.`),
      options[key] || '',
      images[key] ? h('img', { src: imageSrc(images[key]), loading: 'lazy' }) : null,
    ));
  return h('div', { class: 'proof-options' }, ...blocks);
}

async function showProof(id) {
  const data = await api(`/api/import/${id}/proof`);
  const host = document.querySelector('#proof-host');
  const dateInput = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10), id: 'proof-date' });
  const duration = h('input', { type: 'number', min: '0', placeholder: '可留空', id: 'proof-dur' });
  const source = h('select', { id: 'proof-source' }, ...[
    ['fenbi_random', '粉笔随机练习'],
    ['special', '专项练习'],
    ['mock', '模考'],
    ['gd_real', '广东真题'],
    ['national_real', '国考真题'],
  ].map(([value, text]) => h('option', { value }, text)));
  const modules = [
    '政治理论', '常识判断', '常识应用', '言语理解', '数量关系', '数字推理', '数学运算',
    '判断推理', '图形推理', '逻辑判断', '科学推理', '资料分析', '未分类',
  ];
  const materialById = new Map(data.materials.map((item) => [item.id, item]));
  const materialFirst = new Set();
  const sourcePane = h('div', { class: 'proof-source-pane' }, h('h3', {}, '原 PDF 版式证据'));

  const questionCards = data.questions.map((question) => {
    const moduleSelect = h('select', {}, ...modules.map((name) => h('option', {
      value: name,
      selected: (question.module || '未分类') === name,
    }, name)));
    const stem = h('textarea', { rows: '4' }, question.stem_md || '');
    const userAnswer = h('input', { value: question.user_answer || '', placeholder: '作答' });
    const correctAnswer = h('input', { value: question.correct_answer || '', placeholder: '正确答案' });
    const autoVerified = Boolean(question.verified && question.signals?.auto_verified);
    const confirmButton = h('button', { class: 'secondary' }, question.verified
      ? (autoVerified ? '版式已核验' : '已确认')
      : '保存并确认');
    const card = h('div', {
      class: 'proof-q-v2',
      'data-low': question.parse_confidence < 0.7 ? 'true' : 'false',
      'data-wrong': question.is_correct === 0 ? 'true' : 'false',
    });
    const material = materialById.get(question.material_id);
    if (material && !materialFirst.has(material.id)) {
      materialFirst.add(material.id);
      sourcePane.append(h('div', { class: 'proof-material' },
        h('h4', {}, `资料组 · 关联第 ${question.seq} 题起`),
        material.text_md ? h('p', {}, material.text_md) : null,
        imageStack(material.images || []),
      ));
    }
    if (question.images?.length) {
      sourcePane.append(h('div', { class: 'proof-material' },
        h('h4', {}, `第 ${question.seq} 题原版截图`),
        imageStack(question.images),
      ));
    }
    if (question.verified) confirmButton.disabled = true;
    confirmButton.onclick = async () => {
      await jpatch(`/api/import/${id}/question/${question.seq}`, {
        module: moduleSelect.value,
        stem_md: stem.value,
        user_answer: userAnswer.value || null,
        correct_answer: correctAnswer.value || null,
        verified: true,
      });
      await showProof(id);
    };
    const editToggle = h('button', {
      class: 'text-btn proof-edit-toggle',
      onclick: () => card.classList.toggle('editing'),
    }, '编辑解析结果');
    card.append(
      h('div', { class: 'proof-head-v2' },
        h('strong', {}, `第 ${question.seq} 题 · ${question.module || '未分类'}`),
        h('div', {}, question.is_correct === 0 ? tag('本题做错', 'wrong') : tag('本题做对', 'correct')),
      ),
      h('div', { class: 'proof-status-line' },
        tag(`解析置信 ${Math.round(question.parse_confidence * 100)}%`),
        question.verified ? tag(autoVerified ? '版式已核验' : '人工已确认', 'correct') : tag('待复核', 'pending'),
        h('span', { class: 'subtle' }, `你的答案 ${question.user_answer || '—'} · 正确答案 ${question.correct_answer || '—'}`),
      ),
      h('p', {}, question.stem_md || '题干以原版截图为准'),
      optionBlocks(question),
      editToggle,
      h('div', { class: 'proof-edit' },
        h('div', { class: 'form-row' },
          h('div', { class: 'field' }, h('label', {}, '模块'), moduleSelect),
          h('div', { class: 'field' }, h('label', {}, '作答'), userAnswer),
          h('div', { class: 'field' }, h('label', {}, '正确答案'), correctAnswer),
        ),
        h('div', { class: 'field' }, h('label', {}, '题干'), stem),
        confirmButton,
      ),
    );
    return card;
  });

  const commitButton = h('button', { class: 'primary', onclick: async () => {
    try {
      const res = await jpost(`/api/import/${id}/commit`, {
        trained_on: dateInput.value,
        duration_sec: Number(duration.value || 0),
        source: source.value,
        exam_type: 'na',
      });
      let aiMessage = '';
      if (res.mistakes_created > 0 && res.training?.id) {
        try {
          const ai = await jpost(`/api/coach/analyze-training/${res.training.id}`, {});
          aiMessage = ai.configured
            ? `\nDeepSeek：已在后台解析 ${ai.scheduled} 道错题。`
            : '\nDeepSeek：尚未配置，错题已正常入库，可在设置配置后重新解析。';
        } catch (error) {
          aiMessage = `\nDeepSeek 自动解析未启动：${error.message}`;
        }
      }
      alert(`已入库：题库 ${res.question_bank_items || data.questions.length} 题，个人作答 ${res.attempts_created || data.questions.length} 条，新增错题 ${res.mistakes_created}${aiMessage}`);
      location.href = res.mistakes_created > 0 ? '/mistakes' : '/trainings';
    } catch (error) {
      alert(error.message);
    }
  } }, data.all_verified ? '直接入库' : '确认并入库');

  host.replaceChildren(panel('导入校对与入库',
    h('div', { class: 'import-summary' },
      stat('识别题数', data.questions.length),
      stat('已核验', data.verified_count),
      stat('做对', data.correct_count),
      stat('做错', data.wrong_count),
    ),
    h('div', { class: 'import-flow-note' },
      h('strong', {}, '入库后自动形成三份长期数据'),
      h('span', {}, '题库保存标准题目 · 作答记录保存你的历次答案 · 错题本保存错误与复训轨迹。已配置 DeepSeek 时，错题会继续自动生成方法解析。'),
    ),
    h('div', { class: 'form-row' },
      h('div', { class: 'field' }, h('label', {}, '训练日期'), dateInput),
      h('div', { class: 'field' }, h('label', {}, '整组用时（秒，可留空）'), duration),
      h('div', { class: 'field' }, h('label', {}, '训练来源'), source),
    ),
    h('div', { class: 'proof-layout-v2' }, sourcePane, h('div', {}, ...questionCards)),
    h('div', { class: 'actions' },
      data.all_verified ? null : h('button', { class: 'secondary', onclick: async () => {
        if (!confirm('仅在你已经浏览全部待确认题后批量确认。继续？')) return;
        await jpost(`/api/import/${id}/confirm`, {
          seq_list: data.questions.filter((question) => !question.verified).map((question) => question.seq),
        });
        await showProof(id);
      } }, '人工核对后确认剩余题'),
      commitButton,
    ),
  ));
}
