// V4 knowledge reader: source-first, then integrated method. Loaded after app.js intentionally.
window.openKnowledge = async function(m,id){
  $$('.page-item').forEach(x=>x.classList.toggle('active',Number(x.dataset.id)===id));
  const d=await fetch('/api/knowledge/'+encodeURIComponent(m)+'/'+id).then(r=>r.json());
  const source = d.source_html
    ? `<section class="note-section source-note"><div class="section-kicker">SOURCE · 你的原始笔记</div><h3>原笔记精华（直接进入学习内容）</h3><div class="markdown-body">${d.source_html}</div></section>`
    : `<section class="note-section source-note missing"><h3>个人旧笔记</h3><p>这个节点在现有旧笔记中没有直接对应内容。本页展示逐页综合方法，后续仍可用真题和高质量公开课程继续补强。</p></section>`;
  const lis=a=>(a||[]).map(x=>`<li>${esc(x)}</li>`).join('');
  const formula=d.formula ? `<section class="note-section formula"><div class="section-kicker">FORMULA / RELATION</div><h3>核心公式 / 关系</h3><div class="formula-text">${esc(d.formula)}</div></section>`:'';
  const memory=d.memory ? `<div class="memory-cue"><b>考场记忆句</b>${esc(d.memory)}</div>`:'';
  const models=(d.classic_models||[]).length
    ? `<section class="note-section models"><div class="section-kicker">CLASSIC MODELS</div><h3>经典模型 / 常见问法</h3><ul>${lis(d.classic_models)}</ul></section>`:'';
  const example=d.worked_example
    ? `<section class="note-section example"><div class="section-kicker">WORKED EXAMPLE · 训练型例子，非真题</div><h3>把方法走一遍</h3><div class="worked-text">${esc(d.worked_example).replace(/\n/g,'<br>')}</div></section>`:'';
  $('#knowledgeReader').innerHTML=`
    <div class="note-title">
      <div><span>${esc(d.module)} · 第 ${d.id}/50 页 · ${esc(d.source_status||'')} · ${esc(d.curated_status||'')}</span><h2>${esc(d.title)}</h2></div>
      <button class="ghost" onclick="showPage('timer');document.querySelector('#timerSubject').value='${esc(d.module)}';document.querySelector('#timerTask').value='复习：${esc(d.title)}'">计时学习本页</button>
    </div>
    <section class="note-section essence"><div class="section-kicker">ESSENCE · 先记这一件事</div><h3>本页核心</h3><p class="lead">${esc(d.definition)}</p>${memory}</section>
    ${source}
    ${formula}
    ${models}
    <section class="note-section"><div class="section-kicker">RECOGNIZE</div><h3>识别信号</h3><ul>${lis(d.signals)}</ul></section>
    <section class="note-section method-main"><div class="section-kicker">MAIN METHOD</div><h3>推荐主方法</h3><ol>${lis(d.main_method)}</ol></section>
    <section class="note-section"><div class="section-kicker">FAST PATH</div><h3>速解与短路径</h3><ul>${lis(d.fast_method)}</ul></section>
    <section class="note-section boundary"><div class="section-kicker">BOUNDARY</div><h3>边界 / 失效条件 / 易错</h3><ul>${lis(d.boundary)}</ul></section>
    ${example}
    <section class="note-section teacher"><div class="section-kicker">SYNTHESIS</div><h3>名师与实战方法综合</h3><div class="quote">${esc(d.teacher_synthesis)}</div></section>
    <section class="note-section"><div class="section-kicker">ACTIVE RECALL</div><h3>闭卷复盘</h3><ol>${lis(d.review)}</ol></section>`;
}

const style=document.createElement('style');style.textContent=`
.knowledge-reader{max-width:none}.note-section{padding:22px 24px!important;margin:0 0 14px!important;border-radius:14px;border:1px solid #e8ebf2;background:#fff}.section-kicker{font-size:10px;font-weight:800;letter-spacing:.12em;color:#7a879b;margin-bottom:5px}.note-section h3{font-size:18px;margin:0 0 12px}.note-section .lead{font-size:16px;line-height:1.85;color:#26334b}.source-note{border-color:#dce4ff;background:linear-gradient(180deg,#fbfcff,#fff)}.source-note .markdown-body{font-size:14px;line-height:1.85;color:#29364d}.markdown-body h1,.markdown-body h2,.markdown-body h3,.markdown-body h4{color:#18243a;margin:22px 0 9px}.markdown-body h1{font-size:22px}.markdown-body h2{font-size:19px}.markdown-body h3{font-size:16px}.markdown-body p{margin:8px 0}.markdown-body li{margin:5px 0}.markdown-body table{border-collapse:collapse;width:100%;margin:12px 0}.markdown-body th,.markdown-body td{border:1px solid #e2e7ef;padding:8px}.markdown-body blockquote{margin:10px 0;padding:9px 13px;border-left:3px solid #315efb;background:#f4f7ff;color:#4b5d80}.markdown-body code{background:#f2f4f8;padding:2px 5px;border-radius:5px}.method-main{border-left:4px solid #315efb}.boundary{border-left:4px solid #e5a12b}.teacher{background:#f8fafc}.essence{background:#172b63;color:#fff;border:0}.essence h3,.essence .lead,.essence .section-kicker{color:#fff}.essence .section-kicker{opacity:.65}.source-note.missing{background:#fff8ee;border-color:#f1dfbf}.models{background:#fbfcff}.example{background:#eef7ff;border-color:#d6e8ff}.example .worked-text{font-size:14px;line-height:1.9;color:#24344d}.models li{margin:6px 0}.formula{background:#f3f6ff;border-color:#dbe3ff}.formula-text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;font-weight:700;color:#213b86;white-space:pre-wrap}.memory-cue{margin-top:14px;padding:10px 12px;border-radius:10px;background:#ffffff16;color:#fff}.memory-cue b{margin-right:8px;font-size:11px;opacity:.7}
`;document.head.appendChild(style);
