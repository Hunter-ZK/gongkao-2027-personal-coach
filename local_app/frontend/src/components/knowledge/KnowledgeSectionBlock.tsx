import React,{useMemo} from 'react';
import Markdown from 'react-markdown';
import {BookOpen,Brain,Calculator,Lightbulb,Route,ShieldAlert,Sparkles} from 'lucide-react';
import {CopyButton} from '../common/CopyButton';
import {formatKnowledgeText} from '../../utils/copy';

export type KnowledgeSection={id:string;title:string;kind:string;level?:number;body:string};
type Chunk={title?:string;body:string};
type Tone={label:string;accent:string;badge:string;icon:React.ComponentType<{className?:string}>};

const meta:Record<string,Tone>={
  recognition:{label:'识别信号',accent:'text-[#9a6700]',badge:'bg-[#fff8c5] text-[#633c01] border-[#d4a72c]/45',icon:Lightbulb},
  method:{label:'主方法',accent:'text-[#0969da]',badge:'bg-[#ddf4ff] text-[#0969da] border-[#54aeff]/35',icon:Route},
  speed:{label:'考场提速',accent:'text-[#0969da]',badge:'bg-[#ddf4ff] text-[#0969da] border-[#54aeff]/35',icon:Sparkles},
  example:{label:'例题演示',accent:'text-[#57606a]',badge:'bg-[#f6f8fa] text-[#57606a] border-[#d0d7de]',icon:Calculator},
  boundary:{label:'边界易错',accent:'text-[#cf222e]',badge:'bg-[#ffebe9] text-[#cf222e] border-[#ff8182]/35',icon:ShieldAlert},
  review:{label:'训练复盘',accent:'text-[#1a7f37]',badge:'bg-[#dafbe1] text-[#1a7f37] border-[#4ac26b]/35',icon:Brain},
  deep:{label:'原理解释',accent:'text-[#57606a]',badge:'bg-[#f6f8fa] text-[#57606a] border-[#d0d7de]',icon:BookOpen},
  other:{label:'讲义',accent:'text-[#57606a]',badge:'bg-[#f6f8fa] text-[#57606a] border-[#d0d7de]',icon:BookOpen},
};

const markdownComponents:any={
  h1:({children}:any)=><h3 className="mb-3 mt-7 text-xl font-semibold tracking-tight text-[#1f2328]">{children}</h3>,
  h2:({children}:any)=><h3 className="mb-3 mt-7 text-[18px] font-semibold tracking-tight text-[#1f2328]">{children}</h3>,
  h3:({children}:any)=><h4 className="mb-2 mt-6 text-[16px] font-semibold text-[#24292f]">{children}</h4>,
  h4:({children}:any)=><h5 className="mb-2 mt-5 text-[15px] font-semibold text-[#24292f]">{children}</h5>,
  p:({children}:any)=><p className="my-3 text-[15px] leading-[1.82] text-[#24292f]">{children}</p>,
  strong:({children}:any)=><strong className="font-semibold text-[#1f2328]">{children}</strong>,
  ul:({children}:any)=><ul className="my-4 space-y-2">{children}</ul>,
  ol:({children}:any)=><ol className="my-4 space-y-2">{children}</ol>,
  li:({children}:any)=><li className="relative pl-5 text-[14px] leading-7 text-[#24292f] before:absolute before:left-0 before:top-[0.72rem] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#8c959f]">{children}</li>,
  blockquote:({children}:any)=><blockquote className="my-5 border-l-4 border-[#d0d7de] bg-[#f6f8fa] px-4 py-2 text-[#57606a]">{children}</blockquote>,
  table:({children}:any)=><div className="my-5 overflow-x-auto rounded-md border border-[#d0d7de]"><table className="w-full border-collapse bg-white text-sm">{children}</table></div>,
  thead:({children}:any)=><thead className="bg-[#f6f8fa] text-[#57606a]">{children}</thead>,
  th:({children}:any)=><th className="border-b border-[#d0d7de] px-4 py-3 text-left text-xs font-semibold">{children}</th>,
  td:({children}:any)=><td className="border-b border-[#d8dee4] px-4 py-3 align-top text-[13px] leading-6 text-[#24292f]">{children}</td>,
  code:({children}:any)=><code className="rounded bg-[#eff1f3] px-1.5 py-0.5 font-mono text-[0.9em] text-[#0550ae]">{children}</code>,
  hr:()=><div className="my-7 h-px bg-[#d8dee4]"/>,
};

function packParagraphs(body:string,max=850):Chunk[]{const parts=body.split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);if(parts.length<=1)return[{body:body.trim()}];const out:Chunk[]=[];let current='';for(const part of parts){if(current&&current.length+part.length+2>max){out.push({body:current});current=part}else current=current?`${current}\n\n${part}`:part}if(current)out.push({body:current});return out}
export function splitKnowledgeMarkdown(body:string):Chunk[]{const lines=String(body||'').replace(/\r\n?/g,'\n').split('\n');const out:Chunk[]=[];let title:string|undefined;let buffer:string[]=[];const push=()=>{const text=buffer.join('\n').trim();if(text)out.push({title,body:text});buffer=[]};for(const line of lines){const hit=line.match(/^#{2,4}\s+(.+?)\s*$/);if(hit){push();title=hit[1].trim()}else buffer.push(line)}push();if(out.length>1)return out;const only=out[0]||{body:String(body||'').trim()};if(only.body.length<=950)return[only];return packParagraphs(only.body).map((x,i)=>({...x,title:i===0?only.title:undefined}))}

export const KnowledgeSectionBlock:React.FC<{section:KnowledgeSection;compact?:boolean;module?:string}>=({section,module})=>{const tone=meta[section.kind]||meta.other;const Icon=tone.icon;const chunks=useMemo(()=>splitKnowledgeMarkdown(section.body),[section.body]);const whole=formatKnowledgeText({title:section.title,module,kind:tone.label,body:section.body});
return <section id={`lesson-${section.id}`} className="scroll-mt-20 border-t border-[#d8dee4] py-6 first:border-t-0 first:pt-2"><header className="mb-4 flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-md bg-[#f6f8fa] border border-[#d0d7de] ${tone.accent}`}><Icon className="h-4 w-4"/></span><div className="min-w-0"><span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold ${tone.badge}`}>{tone.label}</span><h2 className="mt-1.5 text-[18px] font-semibold leading-7 tracking-tight text-[#1f2328]">{section.title}</h2></div></div><CopyButton text={whole} label="复制本节" className="flex-none rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1.5 text-[10px]"/></header><div className="space-y-4">{chunks.map((chunk,i)=>{const copied=formatKnowledgeText({title:chunk.title||section.title,module,kind:tone.label,body:chunk.body});return <article key={`${section.id}-${i}`} className="group relative rounded-lg bg-white"><div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"><CopyButton text={copied} label="复制" className="rounded-md border border-[#d0d7de] bg-white px-2 py-1 text-[10px]"/></div>{chunk.title&&<h3 className="mb-2.5 pr-14 text-[15px] font-semibold leading-6 text-[#24292f]">{chunk.title}</h3>}<div className="study-markdown"><Markdown components={markdownComponents}>{chunk.body}</Markdown></div></article>})}</div></section>}
