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

function autoStat(label, value) {
  return h('div', {}, h('span', {}, label), h('strong', {}, String(value ?? '—')));
}

async function autoCommit(importId, parsed) {
  const host = document.querySelector('#proof-host');
  if (host) host.replaceChildren(h('div', { class: 'import-auto-success' },
    h('h3', {}, '固定版式核验通过，正在自动入库…'),
    h('p', {}, '系统正在写入题库、个人作答和错题；错题会继续自动交给 Skill 驱动的 AI 分析。'),
  ));
  const committed = await jpost(`/api/import/${importId}/commit`, {
    trained_on: new Date().toISOString().slice(0, 10),
    duration_sec: 0,
    source: 'fenbi_random',
    exam_type: 'na',
    note: '固定粉笔版式自动核验并入库',
  });
  const ai = committed.ai || {};
  if (!host) return committed;
  host.replaceChildren(h('section', { class: 'import-auto-success' },
    h('div', {},
      h('h3', {}, 'PDF 已完成自动归档'),
      h('p', {}, '可信固定版式无需逐题人工确认：训练、题库、个人作答与错题已形成长期记录。'),
    ),
    h('div', { class: 'import-auto-stats' },
      autoStat('识别题数', parsed.total),
      autoStat('题库条目', committed.question_bank_items ?? parsed.total),
      autoStat('新增错题', committed.mistakes_created ?? 0),
      autoStat('AI 自动分析', ai.configured ? `${ai.scheduled || 0} 道` : '待配置'),
    ),
    h('p', {}, ai.configured
      ? `AI 已在后台分析 ${ai.scheduled || 0} 道错题：会优先调用你提供的 gongkao-method-coach Skill 与 V2 方法库，生成标准解、考场快解、陷阱、建议错因和关联知识节点。`
      : '错题已正常入库。当前尚未配置 AI API Key，配置后可在错题页批量重新解析，不影响题库和复训。'),
    h('div', { class: 'actions' },
      h('a', { class: 'primary', href: committed.mistakes_created > 0 ? '/mistakes' : '/trainings' }, committed.mistakes_created > 0 ? '查看 AI 错题分析' : '查看训练记录'),
      h('a', { class: 'secondary', href: '/knowledge' }, '进入行测知识体系'),
      h('button', { class: 'secondary', onclick: () => renderImport() }, '继续导入 PDF'),
    ),
  ));
  return committed;
}

export async function renderImport() {
  clear(main).append(title(
    '智能练习导入',
    '把统一版式的粉笔 PDF 直接拖进来：可信模板自动核验并入库，只有结构异常题才进入人工校对；错题随后自动交给 Skill 驱动的 AI 分析。',
  ));
  const input = h('input', { type: 'file', accept: '.pdf', id: 'pdf-file' });
  const msg = h('div', { class: 'subtle' });
  const upload = h('button', { class: 'primary', onclick: async () => {
    if (!input.files[0]) return alert('请先选择 PDF');
    const fd = new FormData();
    fd.append('file', input.files[0]);
    msg.textContent = '正在按固定版式解析题目、选项、答案与图片…';
    upload.disabled = true;
    try {
      const res = await api('/api/import/pdf', { method: 'POST', body: fd });
      msg.textContent = res.message || '解析完成';
      if (res.duplicate) {
        const proof = await api(`/api/import/${res.import_id}/proof`);
        if (proof.import?.status === 'verified') {
          document.querySelector('#proof-host')?.replaceChildren(h('section', { class: 'import-auto-success' },
            h('h3', {}, '这份 PDF 已经入库'),
            h('p', {}, '系统按文件哈希识别到重复导入，为避免重复训练记录，本次不会再次写入。'),
            h('div', { class: 'actions' }, h('a', { class: 'primary', href: '/trainings' }, '查看已有训练')),
          ));
        } else {
          await showProof(res.import_id);
        }
        return;
      }
      if (res.needs_review === 0 && res.total > 0) {
        msg.textContent = `已自动核验 ${res.total} 题，正在写入题库和错题…`;
        await autoCommit(res.import_id, res);
        msg.textContent = '自动入库完成';
      } else {
        msg.textContent = `${res.message}。只需检查异常题，其余题目已经自动核验。`;
        await showProof(res.import_id);
      }
    } catch (error) {
      msg.textContent = error.message;
    } finally {
      upload.disabled = false;
    }
  } }, '导入 PDF 并自动归档');
  main.append(
    h('section', { class: 'import-hero' },
      h('div', { class: 'import-step-kicker' }, 'PDF → 固定版式解析 → 题库 / 作答 / 错题 → Skill AI 诊断'),
      h('h3', {}, '把练习结果直接变成长期学习数据'),
      h('p', {}, '正常的统一粉笔版式不再要求逐题确认。只有答案缺失、选项不完整、题号断裂或版面变化等异常才会停下来让你校对。'),
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
      const ai = res.ai || {};
      const aiMessage = res.mistakes_created > 0
        ? (ai.configured ? `\nAI：已自动提交 ${ai.scheduled || 0} 道错题解析。` : '\nAI：尚未配置，错题已正常入库，可稍后重新解析。')
        : '';
      alert(`已入库：题库 ${res.question_bank_items || data.questions.length} 题，个人作答 ${res.attempts_created || data.questions.length} 条，新增错题 ${res.mistakes_created || 0}${aiMessage}`);
      location.href = res.mistakes_created > 0 ? '/mistakes' : '/trainings';
    } catch (error) {
      alert(error.message);
    }
  } }, data.all_verified ? '直接入库' : '确认并入库');

  host.replaceChildren(panel('仅校对异常题',
    h('div', { class: 'import-summary' },
      stat('识别题数', data.questions.length),
      stat('已核验', data.verified_count),
      stat('做对', data.correct_count),
      stat('做错', data.wrong_count),
    ),
    h('div', { class: 'import-flow-note' },
      h('strong', {}, '可信题已经自动核验，不需要重复操作'),
      h('span', {}, '只修改真正异常的题。入库后题库保存标准题目，作答记录保存历次答案，错题本保存错误与复训轨迹；AI 自动解析错题。'),
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
      } }, '确认剩余异常题'),
      commitButton,
    ),
  ));
}
