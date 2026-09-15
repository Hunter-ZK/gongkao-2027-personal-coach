import React from 'react';
import Markdown from 'react-markdown';
import {BookOpen,Brain,Calculator,Lightbulb,Route,ShieldAlert,Sparkles} from 'lucide-react';

export type KnowledgeSection={id:string;title:string;kind:string;level?:number;body:string};

const meta:Record<string,{label:string;eyebrow:string;wrap:string;badge:string;icon:React.ComponentType<{className?:string}>}>={
  recognition:{label:'识别信号',eyebrow:'先判断是不是这类题',wrap:'border-amber-200 bg-amber-50/50',badge:'bg-amber-100 text-amber-900',icon:Lightbulb},
  method:{label:'主方法',eyebrow:'按这套顺序执行',wrap:'border-stone-200 bg-white',badge:'bg-stone-900 text-white',icon:Route},
  speed:{label:'考场提速',eyebrow:'在正确的前提下更快',wrap:'border-blue-200 bg-blue-50/45',badge:'bg-blue-100 text-blue-800',icon:Sparkles},
  example:{label:'例题演示',eyebrow:'把方法落到具体题目',wrap:'border-stone-200 bg-stone-50/80',badge:'bg-stone-200 text-stone-700',icon:Calculator},
  boundary:{label:'边界易错',eyebrow:'这些情况不要机械套用',wrap:'border-rose-200 bg-rose-50/55',badge:'bg-rose-100 text-rose-800',icon:ShieldAlert},
  review:{label:'训练复盘',eyebrow:'做完题只留下下一次规则',wrap:'border-emerald-200 bg-emerald-50/45',badge:'bg-emerald-100 text-emerald-800',icon:Brain},
  deep:{label:'原理解释',eyebrow:'用于理解迁移，不要求考场复述',wrap:'border-violet-200 bg-violet-50/40',badge:'bg-violet-100 text-violet-800',icon:BookOpen},
  other:{label:'讲义',eyebrow:'原始知识内容',wrap:'border-stone-200 bg-white',badge:'bg-stone-100 text-stone-600',icon:BookOpen},
};

const markdownComponents:any={
  h1:({children}:any)=><h3 className="mt-7 mb-3 text-lg font-bold text-stone-950">{children}</h3>,
  h2:({children}:any)=><h3 className="mt-7 mb-3 text-[17px] font-bold text-stone-950">{children}</h3>,
  h3:({children}:any)=><h4 className="mt-6 mb-2 text-[15px] font-bold text-stone-900">{children}</h4>,
  h4:({children}:any)=><h5 className="mt-5 mb-2 text-sm font-semibold text-stone-900">{children}</h5>,
  p:({children}:any)=><p className="my-3 text-[15px] leading-7 text-stone-700">{children}</p>,
  strong:({children}:any)=><strong className="font-semibold text-stone-950 bg-amber-50 px-0.5 rounded-sm">{children}</strong>,
  ul:({children}:any)=><ul className="my-4 space-y-2.5">{children}</ul>,
  ol:({children}:any)=><ol className="my-4 space-y-2.5 [counter-reset:study-step]">{children}</ol>,
  li:({children,ordered}:any)=><li className="relative pl-5 text-[15px] leading-7 text-stone-700 before:absolute before:left-0 before:top-[0.7rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-amber-500">{children}</li>,
  blockquote:({children}:any)=><blockquote className="my-5 border-l-4 border-amber-300 bg-white/80 px-4 py-2 rounded-r-xl text-stone-700">{children}</blockquote>,
  table:({children}:any)=><div className="my-5 overflow-x-auto rounded-xl border border-stone-200 bg-white"><table className="w-full border-collapse text-sm">{children}</table></div>,
  thead:({children}:any)=><thead className="bg-stone-100 text-stone-700">{children}</thead>,
  th:({children}:any)=><th className="border-b border-stone-200 px-3 py-2.5 text-left text-xs font-semibold">{children}</th>,
  td:({children}:any)=><td className="border-b border-stone-100 px-3 py-2.5 align-top text-[13px] leading-6 text-stone-700">{children}</td>,
  code:({children}:any)=><code className="rounded-md bg-stone-900 px-1.5 py-0.5 font-mono text-[0.9em] text-amber-200">{children}</code>,
  hr:()=><div className="my-6 h-px bg-stone-200"/>,
};

export const KnowledgeSectionBlock:React.FC<{section:KnowledgeSection;compact?:boolean}>=({section,compact=false})=>{
  const tone=meta[section.kind]||meta.other;
  const Icon=tone.icon;
  return <section id={`lesson-${section.id}`} className={`scroll-mt-6 overflow-hidden rounded-2xl border ${tone.wrap}`}>
    <div className="flex items-start gap-3 border-b border-black/5 px-4 py-3.5 md:px-5">
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-white/90 text-stone-700 shadow-sm ring-1 ring-black/5"><Icon className="h-4 w-4"/></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.badge}`}>{tone.label}</span><span className="text-[10px] text-stone-400">{tone.eyebrow}</span></div>
        <h2 className="mt-1.5 text-[17px] font-bold leading-6 text-stone-950 md:text-lg">{section.title}</h2>
      </div>
    </div>
    <div className={`study-markdown px-4 py-4 md:px-5 ${compact?'max-h-none':'md:px-6 md:py-5'}`}><Markdown components={markdownComponents}>{section.body}</Markdown></div>
  </section>;
};
