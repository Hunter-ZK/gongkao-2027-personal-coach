export type CopyQuestion={
  id?:number|string;
  module?:string;
  subtype?:string;
  subType?:string;
  stem:string;
  options?:Array<{label:string;text:string}>;
  correctAnswer?:string|null;
  userChoice?:string|null;
  durationSec?:number|null;
};

export async function copyText(text:string):Promise<boolean>{
  const value=String(text||'').trim();
  if(!value)return false;
  try{
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return true}
  }catch{}
  try{
    const ta=document.createElement('textarea');
    ta.value=value;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';ta.style.pointerEvents='none';
    document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');document.body.removeChild(ta);return ok;
  }catch{return false}
}

export function plainFromMarkdown(markdown:string):string{
  return String(markdown||'')
    .replace(/\r\n?/g,'\n')
    .replace(/^\s*#{1,6}\s+/gm,'')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1（$2）')
    .replace(/\*\*([^*]+)\*\*/g,'$1')
    .replace(/__([^_]+)__/g,'$1')
    .replace(/~~([^~]+)~~/g,'$1')
    .replace(/`([^`]+)`/g,'$1')
    .replace(/^\s*>\s?/gm,'')
    .replace(/^\s*[-*+]\s+/gm,'• ')
    .replace(/^\s*\|(.+)\|\s*$/gm,(_m,row)=>row.split('|').map((x:string)=>x.trim()).filter(Boolean).join(' ｜ '))
    .replace(/^\s*[-:| ]{3,}\s*$/gm,'')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

export function formatKnowledgeText(input:{title:string;module?:string;kind?:string;body:string}):string{
  const head=[`【知识】${input.title}`,input.module?`模块：${input.module}`:'',input.kind?`类型：${input.kind}`:''].filter(Boolean).join('\n');
  return `${head}\n\n${plainFromMarkdown(input.body)}`.trim();
}

export function formatQuestionText(q:CopyQuestion,includeAnswer=false):string{
  const type=[q.module,q.subtype||q.subType].filter(Boolean).join('｜');
  const lines=[type?`【${type}】`:'【题目】',q.id!=null?`题目 #${q.id}`:'','',String(q.stem||'').trim(),''];
  for(const opt of q.options||[])lines.push(`${opt.label}. ${opt.text}`);
  if(includeAnswer){
    lines.push('');
    if(q.correctAnswer)lines.push(`正确答案：${q.correctAnswer}`);
    if(q.userChoice)lines.push(`我的作答：${q.userChoice}`);
    if(q.durationSec)lines.push(`用时：${q.durationSec}s`);
  }
  return lines.filter((x,i,a)=>!(x===''&&i>0&&a[i-1]==='')).join('\n').trim();
}

export function formatMethodText(m:{title:string;id?:string;module?:string;category?:string;definition?:string;principle?:string;signals?:string[];steps?:string[];example?:string;boundary?:string;exam_command?:string;source_note?:string;evidence?:string}):string{
  const out=[`【方法】${m.title}`];
  if(m.id)out.push(`编号：${m.id}`);if(m.module)out.push(`模块：${m.module}`);if(m.category)out.push(`场景：${m.category}`);
  if(m.exam_command)out.push('',`考场口令：${m.exam_command}`);
  if(m.definition)out.push('',`定义：${m.definition}`);
  if(m.principle)out.push('',`为什么这样做：\n${m.principle}`);
  if(m.signals?.length)out.push('',`识别信号：\n${m.signals.map(x=>`• ${x}`).join('\n')}`);
  if(m.steps?.length)out.push('',`执行顺序：\n${m.steps.map((x,i)=>`${i+1}. ${x}`).join('\n')}`);
  if(m.example)out.push('',`实战例证：\n${m.example}`);
  if(m.boundary)out.push('',`边界：\n${m.boundary}`);
  if(m.source_note)out.push('',`来源：${m.source_note}`);if(m.evidence)out.push(`证据：${m.evidence}`);
  return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}

export function formatGuideText(title:string,steps:string[],formula:string):string{
  return [`【申论方法】${title}`,'',...steps.map((x,i)=>`${i+1}. ${x}`),'',`推荐答题结构：${formula}`].join('\n');
}
