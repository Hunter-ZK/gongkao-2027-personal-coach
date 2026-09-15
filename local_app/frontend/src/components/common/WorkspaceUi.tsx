import React from 'react';

type Tone='plain'|'blue'|'violet'|'warm'|'green'|'rose'|'ink';
const toneClass:Record<Tone,string>={
  plain:'bg-white text-[#111820] border-[#a8b3bf]',
  blue:'bg-[#e2efff] text-[#111820] border-[#79a8d8]',
  violet:'bg-[#eee8ff] text-[#111820] border-[#aa97d8]',
  warm:'bg-[#fff0b8] text-[#3d2f00] border-[#d4a72c]',
  green:'bg-[#ccebd5] text-[#123d20] border-[#4f9d65]',
  rose:'bg-[#ffd9d6] text-[#5d1b20] border-[#d27a7f]',
  ink:'bg-[#24292f] text-white border-[#111820]',
};

export const WorkspacePage:React.FC<{children:React.ReactNode;className?:string;id?:string}>=({children,className='',id})=><div id={id} className={`workspace-page relative w-full px-[clamp(14px,1.4vw,24px)] py-[clamp(16px,1.6vw,24px)] ${className}`}>{children}</div>;

export const PageHeader:React.FC<{eyebrow?:React.ReactNode;title:React.ReactNode;subtitle?:React.ReactNode;actions?:React.ReactNode;compact?:boolean}>=({eyebrow,title,subtitle,actions,compact=false})=><header className={`workspace-page-header flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between ${compact?'mb-4':'mb-5'}`}><div className="min-w-0"><div className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-[#49515a]">{eyebrow}</div><h1 className={`${compact?'text-[23px]':'text-[27px] md:text-[30px]'} font-semibold leading-tight tracking-[-0.025em] text-[#111820]`}>{title}</h1>{subtitle&&<div className="mt-2 max-w-[900px] text-[13px] leading-6 text-[#49515a]">{subtitle}</div>}</div>{actions&&<div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}</header>;

export const Surface:React.FC<{children:React.ReactNode;className?:string;tone?:Tone;pad?:'none'|'sm'|'md'|'lg';as?:'div'|'section'|'article'}>=({children,className='',tone='plain',pad='md',as='section'})=>{const Tag=as as any;const pads={none:'',sm:'p-3 md:p-3.5',md:'p-4 md:p-5',lg:'p-5 md:p-6'};return <Tag className={`workspace-surface rounded-xl border shadow-[0_3px_10px_rgba(31,35,40,0.08)] ${toneClass[tone]} ${pads[pad]} ${className}`}>{children}</Tag>};

export const HeroPanel:React.FC<{children:React.ReactNode;className?:string;tone?:Tone}>=({children,className='',tone='blue'})=><Surface as="section" tone={tone} pad="none" className={`overflow-hidden rounded-2xl ${className}`}><div className="p-5 md:p-6 lg:p-7">{children}</div></Surface>;

export const SectionHeader:React.FC<{title:React.ReactNode;subtitle?:React.ReactNode;action?:React.ReactNode;eyebrow?:React.ReactNode}>=({title,subtitle,action,eyebrow})=><div className="mb-4 flex items-start justify-between gap-4"><div className="min-w-0">{eyebrow&&<div className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-[#59636e]">{eyebrow}</div>}<h2 className="text-[14px] font-semibold tracking-tight text-[#111820]">{title}</h2>{subtitle&&<div className="mt-1 text-[12px] leading-5 text-[#59636e]">{subtitle}</div>}</div>{action&&<div className="flex-shrink-0">{action}</div>}</div>;

export const Metric:React.FC<{label:React.ReactNode;value:React.ReactNode;note?:React.ReactNode;icon?:React.ReactNode;accent?:string;compact?:boolean}>=({label,value,note,icon,accent='text-[#111820]',compact=false})=><div className={`min-w-0 ${compact?'py-1':'py-2'}`}><div className="flex items-center gap-1.5 text-[11px] font-medium text-[#49515a]">{icon}{label}</div><div className={`${compact?'mt-1 text-xl':'mt-1.5 text-2xl'} font-semibold tracking-[-0.025em] ${accent}`}>{value}</div>{note&&<div className="mt-1 text-[11px] leading-4 text-[#59636e]">{note}</div>}</div>;

export const MetricRail:React.FC<{children:React.ReactNode;className?:string;columns?:string}>=({children,className='',columns='grid-cols-2 lg:grid-cols-4'})=><div className={`grid ${columns} gap-x-5 gap-y-3 divide-y divide-[#b7c0c9] sm:divide-y-0 sm:divide-x ${className}`}>{React.Children.map(children,(child,i)=><div className={`${i?'sm:pl-5':''}`}>{child}</div>)}</div>;

export const Segmented:React.FC<{items:Array<{id:string;label:React.ReactNode}>;value:string;onChange:(id:any)=>void;className?:string}>=({items,value,onChange,className=''})=><div className={`inline-flex items-center rounded-lg bg-[#dfe4ea] p-1 border border-[#a8b3bf] ${className}`}>{items.map(item=><button key={item.id} onClick={()=>onChange(item.id)} className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${value===item.id?'bg-[#0969da] text-white shadow-sm border border-[#0758b7]':'text-[#37404a] hover:bg-white hover:text-[#111820]'}`}>{item.label}</button>)}</div>;

export const Toolbar:React.FC<{children:React.ReactNode;className?:string}>=({children,className=''})=><div className={`workspace-toolbar flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 border border-[#a8b3bf] shadow-[0_2px_8px_rgba(31,35,40,0.06)] ${className}`}>{children}</div>;

export const PrimaryButton:React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {soft?:boolean}>=({children,className='',soft=false,...props})=><button {...props} className={`${soft?'bg-[#d7e9ff] text-[#0758b7] hover:bg-[#bedcff] border border-[#79a8d8]':'bg-[#0969da] text-white hover:bg-[#0758b7] border border-[#0758b7]'} inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${className}`}>{children}</button>;

export const QuietButton:React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>>=({children,className='',...props})=><button {...props} className={`inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-3 py-2 text-[12px] font-semibold text-[#242b33] border border-[#a8b3bf] transition-colors hover:bg-[#e9edf1] ${className}`}>{children}</button>;

export const EmptyState:React.FC<{title:React.ReactNode;detail?:React.ReactNode;action?:React.ReactNode}>=({title,detail,action})=><div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl bg-white px-6 py-10 text-center border border-[#a8b3bf] shadow-[0_3px_10px_rgba(31,35,40,0.06)]"><div className="text-sm font-semibold text-[#111820]">{title}</div>{detail&&<div className="mt-1.5 max-w-lg text-[12px] leading-5 text-[#59636e]">{detail}</div>}{action&&<div className="mt-4">{action}</div>}</div>;