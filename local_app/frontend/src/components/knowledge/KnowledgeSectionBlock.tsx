import React,{useMemo} from 'react';
import Markdown from 'react-markdown';
import {BookOpen,Brain,Calculator,Lightbulb,Route,ShieldAlert,Sparkles} from 'lucide-react';
import {CopyButton} from '../common/CopyButton';
import {formatKnowledgeText} from '../../utils/copy';

export type KnowledgeSection={id:string;title:string;kind:string;level?:number;body:string};
type Chunk={title?:string;body:string};
type Tone={label:string;color:string;soft:string;icon:React.ComponentType<{className?:string}>};

const meta:Record<string,Tone>={
  recognition:{label:'识别信号',color:'var(--wb-warning)',soft:'var(--wb-warning-soft)',icon:Lightbulb},
  method:{label:'主方法',color:'var(--wb-accent-text)',soft:'var(--wb-accent-soft)',icon:Route},
  speed:{label:'考场提速',color:'var(--wb-accent-text)',soft:'var(--wb-accent-soft)',icon:Sparkles},
  example:{label:'例题演示',color:'var(--wb-text-2)',soft:'var(--wb-surface-subtle)',icon:Calculator},
  boundary:{label:'边界易错',color:'var(--wb-danger)',soft:'var(--wb-danger-soft)',icon:ShieldAlert},
  review:{label:'训练复盘',color:'var(--wb-success)',soft:'var(--wb-success-soft)',icon:Brain},
  deep:{label:'原理解释',color:'var(--wb-text-2)',soft:'var(--wb-surface-subtle)',icon:BookOpen},
  other:{label:'讲义',color:'var(--wb-text-2)',soft:'var(--wb-surface-subtle)',icon:BookOpen},
};

const markdownComponents:any={
  h1:({children}:any)=><h3 className="mb-3 mt-7 text-xl font-semibold tracking-[-0.02em]" style={{color:'var(--wb-text)'}}>{children}</h3>,
  h2:({children}:any)=><h3 className="mb-3 mt-7 text-[18px] font-semibold tracking-[-0.02em]" style={{color:'var(--wb-text)'}}>{children}</h3>,
  h3:({children}:any)=><h4 className="mb-2 mt-6 text-[16px] font-semibold" style={{color:'var(--wb-text)'}}>{children}</h4>,
  h4:({children}:any)=><h5 className="mb-2 mt-5 text-[14px] font-semibold" style={{color:'var(--wb-text)'}}>{children}</h5>,
  p:({children}:any)=><p className="my-3 text-[14px] leading-[1.85]" style={{color:'var(--wb-text)'}}>{children}</p>,
  strong:({children}:any)=><strong className="font-semibold" style={{color:'var(--wb-text)'}}>{children}</strong>,
  ul:({children}:any)=><ul className="my-4 space-y-1.5">{children}</ul>,
  ol:({children}:any)=><ol className="my-4 space-y-1.5">{children}</ol>,
  li:({children}:any)=><li className="relative pl-5 text-[13px] leading-7 before:absolute before:left-0 before:top-[0.72rem] before:h-1.5 before:w-1.5 before:rounded-full" style={{color:'var(--wb-text-2)'}}>{children}</li>,
  blockquote:({children}:any)=><blockquote className="my-5 rounded-r-[8px] border-l-[3px] px-4 py-2" style={{borderColor:'var(--wb-accent)',background:'var(--wb-surface-subtle)',color:'var(--wb-text-2)'}}>{children}</blockquote>,
  table:({children}:any)=><div className="my-5 overflow-x-auto rounded-[8px] border" style={{borderColor:'var(--wb-border)'}}><table className="w-full border-collapse text-sm" style={{background:'var(--wb-surface)'}}>{children}</table></div>,
  thead:({children}:any)=><thead style={{background:'var(--wb-surface-subtle)',color:'var(--wb-text-2)'}}>{children}</thead>,
  th:({children}:any)=><th className="border-b px-4 py-3 text-left text-xs font-semibold" style={{borderColor:'var(--wb-border)'}}>{children}</th>,
  td:({children}:any)=><td className="border-b px-4 py-3 align-top text-[13px] leading-6" style={{borderColor:'var(--wb-border)',color:'var(--wb-text)'}}>{children}</td>,
  code:({children}:any)=><code className="rounded px-1.5 py-0.5 font-mono text-[0.9em]" style={{background:'var(--wb-surface-hover)',color:'var(--wb-accent-text)'}}>{children}</code>,
  hr:()=><div className="my-7 h-px" style={{background:'var(--wb-border)'}}/>,
};

function packParagraphs(body:string,max=850):Chunk[]{const parts=body.split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);if(parts.length<=1)return[{body:body.trim()}];const out:Chunk[]=[];let current='';for(const part of parts){if(current&&current.length+part.length+2>max){out.push({body:current});current=part}else current=current?`${current}\n\n${part}`:part}if(current)out.push({body:current});return out}
export function splitKnowledgeMarkdown(body:string):Chunk[]{const lines=String(body||'').replace(/\r\n?/g,'\n').split('\n');const out:Chunk[]=[];let title:string|undefined;let buffer:string[]=[];const push=()=>{const text=buffer.join('\n').trim();if(text)out.push({title,body:text});buffer=[]};for(const line of lines){const hit=line.match(/^#{2,4}\s+(.+?)\s*$/);if(hit){push();title=hit[1].trim()}else buffer.push(line)}push();if(out.length>1)return out;const only=out[0]||{body:String(body||'').trim()};if(only.body.length<=950)return[only];return packParagraphs(only.body).map((x,i)=>({...x,title:i===0?only.title:undefined}))}

export const KnowledgeSectionBlock:React.FC<{section:KnowledgeSection;compact?:boolean;module?:string}>=({section,module})=>{const tone=meta[section.kind]||meta.other;const Icon=tone.icon;const chunks=useMemo(()=>splitKnowledgeMarkdown(section.body),[section.body]);const whole=formatKnowledgeText({title:section.title,module,kind:tone.label,body:section.body});
return <section id={`lesson-${section.id}`} className="py-1"><header className="mb-5 flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-[8px] border" style={{background:tone.soft,borderColor:'var(--wb-border)',color:tone.color}}><Icon className="h-4 w-4"/></span><div className="min-w-0"><span className="inline-flex rounded-[6px] px-2 py-0.5 text-[9px] font-semibold" style={{background:tone.soft,color:tone.color}}>{tone.label}</span><h2 className="mt-1.5 text-[19px] font-semibold leading-7 tracking-[-0.025em]" style={{color:'var(--wb-text)'}}>{section.title}</h2></div></div><CopyButton text={whole} label="复制本节" className="flex-none"/></header><div className="space-y-5">{chunks.map((chunk,i)=>{const copied=formatKnowledgeText({title:chunk.title||section.title,module,kind:tone.label,body:chunk.body});return <article key={`${section.id}-${i}`} className="group relative"><div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"><CopyButton text={copied} label="复制"/></div>{chunk.title&&<h3 className="mb-2.5 pr-14 text-[15px] font-semibold leading-6" style={{color:'var(--wb-text)'}}>{chunk.title}</h3>}<div className="study-markdown"><Markdown components={markdownComponents}>{chunk.body}</Markdown></div></article>})}</div></section>}
