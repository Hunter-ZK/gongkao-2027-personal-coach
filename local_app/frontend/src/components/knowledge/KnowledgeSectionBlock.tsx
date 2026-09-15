import React,{useMemo} from 'react';
import Markdown from 'react-markdown';
import {BookOpen,Brain,Calculator,Lightbulb,Route,ShieldAlert,Sparkles} from 'lucide-react';
import {CopyButton} from '../common/CopyButton';
import {formatKnowledgeText} from '../../utils/copy';

export type KnowledgeSection={id:string;title:string;kind:string;level?:number;body:string};
type Chunk={title?:string;body:string};

const meta:Record<string,{label:string;eyebrow:string;accent:string;block:string;badge:string;icon:React.ComponentType<{className?:string}>}>={
  recognition:{label:'识别信号',eyebrow:'先判断是不是这类题',accent:'text-amber-800',block:'border-amber-200 bg-amber-50/45',badge:'bg-amber-100 text-amber-900',icon:Lightbulb},
  method:{label:'主方法',eyebrow:'按这套顺序执行',accent:'text-stone-800',block:'border-stone-200 bg-white',badge:'bg-stone-900 text-white',icon:Route},
  speed:{label:'考场提速',eyebrow:'在正确的前提下更快',accent:'text-blue-800',block:'border-blue-200 bg-blue-50/35',badge:'bg-blue-100 text-blue-800',icon:Sparkles},
  example:{label:'例题演示',eyebrow:'把方法落到具体题目',accent:'text-stone-700',block:'border-stone-200 bg-stone-50/70',badge:'bg-stone-200 text-stone-700',icon:Calculator},
  boundary:{label:'边界易错',eyebrow:'这些情况不要机械套用',accent:'text-rose-800',block:'border-rose-200 bg-rose-50/45',badge:'bg-rose-100 text-rose-800',icon:ShieldAlert},
  review:{label:'训练复盘',eyebrow:'只留下下一次规则',accent:'text-emerald-800',block:'border-emerald-200 bg-emerald-50/35',badge:'bg-emerald-100 text-emerald-800',icon:Brain},
  deep:{label:'原理解释',eyebrow:'用于理解迁移',accent:'text-violet-800',block:'border-violet-200 bg-violet-50/30',badge:'bg-violet-100 text-violet-800',icon:BookOpen},
  other:{label:'讲义',eyebrow:'原始知识内容',accent:'text-stone-700',block:'border-stone-200 bg-white',badge:'bg-stone-100 text-stone-600',icon:BookOpen},
};

const markdownComponents:any={
  h1:({children}:any)=><h3 className="mt-5 mb-2 text-lg font-bold text-stone-950">{children}</h3>,
  h2:({children}:any)=><h3 className="mt-5 mb-2 text-[17px] font-bold text-stone-950">{children}</h3>,
  h3:({children}:any)=><h4 className="mt-4 mb-2 text-[15px] font-bold text-stone-900">{children}</h4>,
  h4:({children}:any)=><h5 className="mt-4 mb-2 text-sm font-semibold text-stone-900">{children}</h5>,
  p:({children}:any)=><p className="my-2.5 text-[16px] leading-[1.8] text-stone-700">{children}</p>,
  strong:({children}:any)=><strong className="font-semibold text-stone-950 bg-amber-50 px-0.5">{children}</strong>,
  ul:({children}:any)=><ul className="my-3 space-y-2">{children}</ul>,
  ol:({children}:any)=><ol className="my-3 space-y-2">{children}</ol>,
  li:({children}:any)=><li className="relative pl-5 text-[15px] leading-7 text-stone-700 before:absolute before:left-0 before:top-[0.7rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-amber-500">{children}</li>,
  blockquote:({children}:any)=><blockquote className="my-4 border-l-3 border-amber-300 bg-white/80 px-4 py-2 text-stone-700">{children}</blockquote>,
  table:({children}:any)=><div className="my-4 overflow-x-auto border-y border-stone-200 bg-white"><table className="w-full border-collapse text-sm">{children}</table></div>,
  thead:({children}:any)=><thead className="bg-stone-100 text-stone-700">{children}</thead>,
  th:({children}:any)=><th className="border-b border-stone-200 px-3 py-2.5 text-left text-xs font-semibold">{children}</th>,
  td:({children}:any)=><td className="border-b border-stone-100 px-3 py-2.5 align-top text-[13px] leading-6 text-stone-700">{children}</td>,
  code:({children}:any)=><code className="rounded bg-stone-900 px-1.5 py-0.5 font-mono text-[0.9em] text-amber-200">{children}</code>,
  hr:()=><div className="my-5 h-px bg-stone-200"/>,
};

function packParagraphs(body:string,max=850):Chunk[]{
  const parts=body.split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);
  if(parts.length<=1)return[{body:body.trim()}];
  const out:Chunk[]=[];let current='';
  for(const part of parts){
    if(current&&current.length+part.length+2>max){out.push({body:current});current=part}else current=current?`${current}\n\n${part}`:part;
  }
  if(current)out.push({body:current});
  return out;
}

export function splitKnowledgeMarkdown(body:string):Chunk[]{
  const lines=String(body||'').replace(/\r\n?/g,'\n').split('\n');
  const out:Chunk[]=[];let title:string|undefined;let buffer:string[]=[];
  const push=()=>{const text=buffer.join('\n').trim();if(text)out.push({title,body:text});buffer=[]};
  for(const line of lines){
    const hit=line.match(/^#{2,4}\s+(.+?)\s*$/);
    if(hit){push();title=hit[1].trim()}else buffer.push(line);
  }
  push();
  if(out.length>1)return out;
  const only=out[0]||{body:String(body||'').trim()};
  if(only.body.length<=950)return[only];
  return packParagraphs(only.body).map((x,i)=>({...x,title:i===0?only.title:undefined}));
}

export const KnowledgeSectionBlock:React.FC<{section:KnowledgeSection;compact?:boolean;module?:string}>=({section,module})=>{
  const tone=meta[section.kind]||meta.other;const Icon=tone.icon;
  const chunks=useMemo(()=>splitKnowledgeMarkdown(section.body),[section.body]);
  const canGrid=['recognition','speed','example','boundary','review'].includes(section.kind)&&chunks.length>1;
  const whole=formatKnowledgeText({title:section.title,module,kind:tone.label,body:section.body});
  return <section id={`lesson-${section.id}`} className="scroll-mt-20 py-1">
    <div className="mb-3 flex items-start justify-between gap-3 border-b border-stone-200 pb-3">
      <div className="flex min-w-0 items-start gap-3"><div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-stone-50 ${tone.accent}`}><Icon className="h-4 w-4"/></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.badge}`}>{tone.label}</span><span className="text-[10px] text-stone-400">{tone.eyebrow}</span></div><h2 className="mt-1 text-[18px] font-bold leading-7 text-stone-950">{section.title}</h2></div></div>
      <CopyButton text={whole} label="复制本节" className="mt-1 flex-shrink-0"/>
    </div>
    <div className={canGrid?'grid grid-cols-1 md:grid-cols-2 gap-3':'space-y-3'}>{chunks.map((chunk,i)=>{
      const copied=formatKnowledgeText({title:chunk.title||section.title,module,kind:tone.label,body:chunk.body});
      return <div key={`${section.id}-${i}`} className={`group relative border ${tone.block} px-4 py-4 md:px-5`}>
        <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"><CopyButton text={copied} label="复制" className="bg-white/90 px-2 py-1 border border-stone-200"/></div>
        {chunk.title&&<h3 className="mb-3 pr-16 text-[15px] font-bold leading-6 text-stone-950">{chunk.title}</h3>}
        <div className="study-markdown"><Markdown components={markdownComponents}>{chunk.body}</Markdown></div>
      </div>})}</div>
  </section>;
};
