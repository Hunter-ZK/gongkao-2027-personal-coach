import React,{useMemo} from 'react';
import Markdown from 'react-markdown';
import {BookOpen,Brain,Calculator,Lightbulb,Route,ShieldAlert,Sparkles} from 'lucide-react';
import {CopyButton} from '../common/CopyButton';
import {formatKnowledgeText} from '../../utils/copy';

export type KnowledgeSection={id:string;title:string;kind:string;level?:number;body:string};
type Chunk={title?:string;body:string};
type Tone={label:string;eyebrow:string;accent:string;surface:string;badge:string;iconWrap:string;icon:React.ComponentType<{className?:string}>};

const meta:Record<string,Tone>={
  recognition:{label:'识别信号',eyebrow:'先判断是不是这类题',accent:'text-[#9a6700]',surface:'bg-gradient-to-br from-[#fff9e8] via-white to-[#fffdf7] ring-[#f4df9b]',badge:'bg-[#fff0bd] text-[#765100]',iconWrap:'bg-[#fff0bd]',icon:Lightbulb},
  method:{label:'主方法',eyebrow:'按这套顺序执行',accent:'text-[#3157c8]',surface:'bg-gradient-to-br from-[#f2f6ff] via-white to-[#f8f5ff] ring-[#dbe4ff]',badge:'bg-[#e8efff] text-[#3157c8]',iconWrap:'bg-[#e8efff]',icon:Route},
  speed:{label:'考场提速',eyebrow:'在正确的前提下更快',accent:'text-[#3569b8]',surface:'bg-gradient-to-br from-[#eef8ff] via-white to-[#f5f9ff] ring-[#d6eaff]',badge:'bg-[#dff0ff] text-[#315f9d]',iconWrap:'bg-[#dff0ff]',icon:Sparkles},
  example:{label:'例题演示',eyebrow:'把方法落到具体题目',accent:'text-[#7255b5]',surface:'bg-gradient-to-br from-[#f7f3ff] via-white to-[#fbf9ff] ring-[#e7ddff]',badge:'bg-[#eee6ff] text-[#6547a9]',iconWrap:'bg-[#eee6ff]',icon:Calculator},
  boundary:{label:'边界易错',eyebrow:'这些情况不要机械套用',accent:'text-[#a64b68]',surface:'bg-gradient-to-br from-[#fff2f6] via-white to-[#fff9fb] ring-[#f5dbe4]',badge:'bg-[#ffe2eb] text-[#94445e]',iconWrap:'bg-[#ffe2eb]',icon:ShieldAlert},
  review:{label:'训练复盘',eyebrow:'只留下下一次规则',accent:'text-[#2f765d]',surface:'bg-gradient-to-br from-[#eefbf6] via-white to-[#f7fcfa] ring-[#d5efe4]',badge:'bg-[#dff5eb] text-[#27684f]',iconWrap:'bg-[#dff5eb]',icon:Brain},
  deep:{label:'原理解释',eyebrow:'用于理解迁移',accent:'text-[#6c55aa]',surface:'bg-gradient-to-br from-[#f5f2ff] via-white to-[#faf8ff] ring-[#e5def8]',badge:'bg-[#ebe5fb] text-[#5d4797]',iconWrap:'bg-[#ebe5fb]',icon:BookOpen},
  other:{label:'讲义',eyebrow:'原始知识内容',accent:'text-stone-700',surface:'bg-white ring-[#e8e5df]',badge:'bg-[#f1f0ed] text-stone-700',iconWrap:'bg-[#f1f0ed]',icon:BookOpen},
};

const markdownComponents:any={
  h1:({children}:any)=><h3 className="mt-6 mb-2.5 text-xl font-bold tracking-tight text-stone-950">{children}</h3>,
  h2:({children}:any)=><h3 className="mt-6 mb-2.5 text-[18px] font-bold tracking-tight text-stone-950">{children}</h3>,
  h3:({children}:any)=><h4 className="mt-5 mb-2 text-[16px] font-bold text-stone-900">{children}</h4>,
  h4:({children}:any)=><h5 className="mt-4 mb-2 text-[15px] font-semibold text-stone-900">{children}</h5>,
  p:({children}:any)=><p className="my-3 text-[15.5px] leading-[1.9] text-[#454746]">{children}</p>,
  strong:({children}:any)=><strong className="font-semibold text-stone-950 bg-[#fff4c7]/80 px-1 py-0.5 rounded">{children}</strong>,
  ul:({children}:any)=><ul className="my-4 space-y-2.5">{children}</ul>,
  ol:({children}:any)=><ol className="my-4 space-y-2.5">{children}</ol>,
  li:({children}:any)=><li className="relative pl-5 text-[15px] leading-7 text-[#4b4d4c] before:absolute before:left-0 before:top-[0.72rem] before:w-1.5 before:h-1.5 before:rounded-full before:bg-[#8a7cf0]">{children}</li>,
  blockquote:({children}:any)=><blockquote className="my-5 rounded-r-2xl border-l-4 border-[#8ab4f8] bg-[#eef5ff]/80 px-5 py-3 text-[#41484f]">{children}</blockquote>,
  table:({children}:any)=><div className="my-5 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/[0.06]"><table className="w-full border-collapse text-sm">{children}</table></div>,
  thead:({children}:any)=><thead className="bg-[#f2f4f8] text-stone-700">{children}</thead>,
  th:({children}:any)=><th className="border-b border-black/[0.06] px-4 py-3 text-left text-xs font-semibold">{children}</th>,
  td:({children}:any)=><td className="border-b border-black/[0.05] px-4 py-3 align-top text-[13px] leading-6 text-stone-700">{children}</td>,
  code:({children}:any)=><code className="rounded-lg bg-[#202124] px-1.5 py-1 font-mono text-[0.9em] text-[#c4d7ff]">{children}</code>,
  hr:()=><div className="my-6 h-px bg-gradient-to-r from-transparent via-stone-200 to-transparent"/>,
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

  return <section id={`lesson-${section.id}`} className="scroll-mt-24 py-2">
    <div className={`relative overflow-hidden rounded-[26px] ring-1 shadow-[0_8px_30px_rgba(31,35,41,0.045)] ${tone.surface}`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"/>
      <div className="flex items-start justify-between gap-4 px-5 pt-5 md:px-7 md:pt-6">
        <div className="flex min-w-0 items-start gap-3.5">
          <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${tone.iconWrap} ${tone.accent}`}><Icon className="h-[18px] w-[18px]"/></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide ${tone.badge}`}>{tone.label}</span>
              <span className="text-[10px] text-stone-400">{tone.eyebrow}</span>
            </div>
            <h2 className="mt-2 text-[19px] font-bold leading-7 tracking-tight text-[#202124] md:text-[21px]">{section.title}</h2>
          </div>
        </div>
        <CopyButton text={whole} label="复制本节" className="mt-1 flex-shrink-0 rounded-full bg-white/75 px-2.5 py-1.5 ring-1 ring-black/[0.05] shadow-sm backdrop-blur"/>
      </div>

      <div className={`px-4 pb-4 pt-5 md:px-6 md:pb-6 ${canGrid?'grid grid-cols-1 md:grid-cols-2 gap-3.5':'space-y-3.5'}`}>
        {chunks.map((chunk,i)=>{
          const copied=formatKnowledgeText({title:chunk.title||section.title,module,kind:tone.label,body:chunk.body});
          return <div key={`${section.id}-${i}`} className="group relative rounded-[22px] bg-white/78 px-5 py-5 ring-1 ring-black/[0.055] shadow-[0_2px_12px_rgba(31,35,41,0.025)] backdrop-blur-sm transition-all hover:-translate-y-[1px] hover:bg-white hover:shadow-[0_10px_28px_rgba(31,35,41,0.065)] md:px-6">
            <div className="absolute right-3.5 top-3.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"><CopyButton text={copied} label="复制" className="rounded-full bg-[#f6f8fc]/95 px-2.5 py-1.5 ring-1 ring-black/[0.05] shadow-sm"/></div>
            {chunk.title&&<h3 className="mb-3.5 pr-16 text-[16px] font-bold leading-6 tracking-tight text-[#202124]">{chunk.title}</h3>}
            <div className="study-markdown"><Markdown components={markdownComponents}>{chunk.body}</Markdown></div>
          </div>;
        })}
      </div>
    </div>
  </section>;
};
