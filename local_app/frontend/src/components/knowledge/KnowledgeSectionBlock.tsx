import React,{useMemo} from 'react';
import Markdown from 'react-markdown';
import {BookOpen,Brain,Calculator,Lightbulb,Route,ShieldAlert,Sparkles} from 'lucide-react';
import {CopyButton} from '../common/CopyButton';
import {formatKnowledgeText} from '../../utils/copy';

export type KnowledgeSection={id:string;title:string;kind:string;level?:number;body:string};
type Chunk={title?:string;body:string};
type Tone={label:string;eyebrow:string;accent:string;wash:string;line:string;badge:string;iconWrap:string;icon:React.ComponentType<{className?:string}>};

const meta:Record<string,Tone>={
  recognition:{label:'识别信号',eyebrow:'先判断是不是这类题',accent:'text-[#916a0b]',wash:'bg-[#fffaf0]',line:'bg-[#dcae45]',badge:'bg-[#fff0bd] text-[#765100]',iconWrap:'bg-[#fff0bd]',icon:Lightbulb},
  method:{label:'主方法',eyebrow:'按这套顺序执行',accent:'text-[#4f62b4]',wash:'bg-[#f6f8ff]',line:'bg-[#7180d0]',badge:'bg-[#e8efff] text-[#3157c8]',iconWrap:'bg-[#e8efff]',icon:Route},
  speed:{label:'考场提速',eyebrow:'正确之后再提速',accent:'text-[#3569a9]',wash:'bg-[#f3f9ff]',line:'bg-[#72a8d4]',badge:'bg-[#dff0ff] text-[#315f9d]',iconWrap:'bg-[#dff0ff]',icon:Sparkles},
  example:{label:'例题演示',eyebrow:'把动作落到真题',accent:'text-[#6d58ad]',wash:'bg-[#faf7ff]',line:'bg-[#9a83d1]',badge:'bg-[#eee6ff] text-[#6547a9]',iconWrap:'bg-[#eee6ff]',icon:Calculator},
  boundary:{label:'边界易错',eyebrow:'这些情况别机械套',accent:'text-[#9a4d66]',wash:'bg-[#fff7f9]',line:'bg-[#d27b98]',badge:'bg-[#ffe2eb] text-[#94445e]',iconWrap:'bg-[#ffe2eb]',icon:ShieldAlert},
  review:{label:'训练复盘',eyebrow:'只留下下一次规则',accent:'text-[#34765b]',wash:'bg-[#f4fbf7]',line:'bg-[#65aa88]',badge:'bg-[#dff5eb] text-[#27684f]',iconWrap:'bg-[#dff5eb]',icon:Brain},
  deep:{label:'原理解释',eyebrow:'用于理解和迁移',accent:'text-[#6754a2]',wash:'bg-[#faf8ff]',line:'bg-[#8d79c8]',badge:'bg-[#ebe5fb] text-[#5d4797]',iconWrap:'bg-[#ebe5fb]',icon:BookOpen},
  other:{label:'讲义',eyebrow:'原始知识内容',accent:'text-[#656a70]',wash:'bg-[#fafbfc]',line:'bg-[#aeb3b9]',badge:'bg-[#f1f0ed] text-stone-700',iconWrap:'bg-[#f1f0ed]',icon:BookOpen},
};

const markdownComponents:any={
  h1:({children}:any)=><h3 className="mb-3 mt-7 text-xl font-bold tracking-tight text-[#202124]">{children}</h3>,
  h2:({children}:any)=><h3 className="mb-3 mt-7 text-[18px] font-bold tracking-tight text-[#202124]">{children}</h3>,
  h3:({children}:any)=><h4 className="mb-2 mt-6 text-[16px] font-bold text-[#303134]">{children}</h4>,
  h4:({children}:any)=><h5 className="mb-2 mt-5 text-[15px] font-semibold text-[#303134]">{children}</h5>,
  p:({children}:any)=><p className="my-3 text-[16px] leading-[1.82] text-[#45494d]">{children}</p>,
  strong:({children}:any)=><strong className="font-semibold text-[#202124] decoration-[#e4c56b] decoration-2 underline-offset-2">{children}</strong>,
  ul:({children}:any)=><ul className="my-4 space-y-2">{children}</ul>,
  ol:({children}:any)=><ol className="my-4 space-y-2">{children}</ol>,
  li:({children}:any)=><li className="relative pl-5 text-[15px] leading-7 text-[#4b5055] before:absolute before:left-0 before:top-[0.72rem] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#7883c6]">{children}</li>,
  blockquote:({children}:any)=><blockquote className="my-5 border-l-2 border-[#8290d3] bg-[#f5f7ff] px-4 py-2 text-[#4c535a]">{children}</blockquote>,
  table:({children}:any)=><div className="my-5 overflow-x-auto rounded-[16px] ring-1 ring-black/[0.055]"><table className="w-full border-collapse bg-white text-sm">{children}</table></div>,
  thead:({children}:any)=><thead className="bg-[#f3f5f8] text-[#5d6268]">{children}</thead>,
  th:({children}:any)=><th className="border-b border-black/[0.055] px-4 py-3 text-left text-xs font-semibold">{children}</th>,
  td:({children}:any)=><td className="border-b border-black/[0.04] px-4 py-3 align-top text-[13px] leading-6 text-[#5b6066]">{children}</td>,
  code:({children}:any)=><code className="rounded-md bg-[#edf0f5] px-1.5 py-0.5 font-mono text-[0.9em] text-[#4e5f9f]">{children}</code>,
  hr:()=><div className="my-7 h-px bg-black/[0.055]"/>,
};

function packParagraphs(body:string,max=850):Chunk[]{const parts=body.split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);if(parts.length<=1)return[{body:body.trim()}];const out:Chunk[]=[];let current='';for(const part of parts){if(current&&current.length+part.length+2>max){out.push({body:current});current=part}else current=current?`${current}\n\n${part}`:part}if(current)out.push({body:current});return out}
export function splitKnowledgeMarkdown(body:string):Chunk[]{const lines=String(body||'').replace(/\r\n?/g,'\n').split('\n');const out:Chunk[]=[];let title:string|undefined;let buffer:string[]=[];const push=()=>{const text=buffer.join('\n').trim();if(text)out.push({title,body:text});buffer=[]};for(const line of lines){const hit=line.match(/^#{2,4}\s+(.+?)\s*$/);if(hit){push();title=hit[1].trim()}else buffer.push(line)}push();if(out.length>1)return out;const only=out[0]||{body:String(body||'').trim()};if(only.body.length<=950)return[only];return packParagraphs(only.body).map((x,i)=>({...x,title:i===0?only.title:undefined}))}

export const KnowledgeSectionBlock:React.FC<{section:KnowledgeSection;compact?:boolean;module?:string}>=({section,module})=>{const tone=meta[section.kind]||meta.other;const Icon=tone.icon;const chunks=useMemo(()=>splitKnowledgeMarkdown(section.body),[section.body]);const canGrid=['recognition','speed','example','boundary','review'].includes(section.kind)&&chunks.length>1;const whole=formatKnowledgeText({title:section.title,module,kind:tone.label,body:section.body});
return <section id={`lesson-${section.id}`} className="scroll-mt-24 py-3"><div className="grid gap-4 lg:grid-cols-[176px_minmax(0,1fr)]"><header className="lg:sticky lg:top-24 lg:self-start"><div className="flex items-start gap-2.5 lg:block"><span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[14px] ${tone.iconWrap} ${tone.accent}`}><Icon className="h-4 w-4"/></span><div className="min-w-0 lg:mt-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-semibold ${tone.badge}`}>{tone.label}</span><h2 className="mt-2 text-[17px] font-bold leading-6 tracking-tight text-[#303134]">{section.title}</h2><p className="mt-1 text-[9px] leading-4 text-[#969ba1]">{tone.eyebrow}</p><CopyButton text={whole} label="复制本节" className="mt-3 hidden text-[9px] lg:inline-flex"/></div></div></header><div className={`relative border-l-2 pl-4 md:pl-6 ${tone.line.replace('bg-','border-')}`}><div className={`absolute inset-y-0 left-0 -z-10 w-full rounded-r-[24px] ${tone.wash} opacity-65`}/><div className={`${canGrid?'grid grid-cols-1 gap-3 md:grid-cols-2':'space-y-3'}`}>{chunks.map((chunk,i)=>{const copied=formatKnowledgeText({title:chunk.title||section.title,module,kind:tone.label,body:chunk.body});return <article key={`${section.id}-${i}`} className="group relative px-1 py-3 md:px-3"><div className="absolute right-1 top-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"><CopyButton text={copied} label="复制" className="rounded-full bg-white/85 px-2.5 py-1.5 text-[9px] shadow-sm ring-1 ring-black/[0.045]"/></div>{chunk.title&&<h3 className="mb-2.5 pr-14 text-[15px] font-bold leading-6 text-[#303134]">{chunk.title}</h3>}<div className="study-markdown"><Markdown components={markdownComponents}>{chunk.body}</Markdown></div></article>})}</div></div></div></section>}
