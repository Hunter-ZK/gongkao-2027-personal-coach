import React from 'react';

type Tone='plain'|'blue'|'violet'|'warm'|'green'|'rose'|'ink';
const toneClass:Record<Tone,string>={
  plain:'bg-white text-[#1f2328] border-[#d0d7de]',
  blue:'bg-[#f6f8fa] text-[#1f2328] border-[#d0d7de]',
  violet:'bg-[#f6f8fa] text-[#1f2328] border-[#d0d7de]',
  warm:'bg-[#fff8c5] text-[#1f2328] border-[#d4a72c]/45',
  green:'bg-[#dafbe1] text-[#1f2328] border-[#1a7f37]/20',
  rose:'bg-[#ffebe9] text-[#1f2328] border-[#cf222e]/20',
  ink:'bg-[#24292f] text-white border-[#24292f]',
};

export const WorkspacePage:React.FC<{children:React.ReactNode;className?:string;id?:string}>=({children,className='',id})=><div id={id} className={`workspace-page relative w-full px-[clamp(14px,1.4vw,24px)] py-[clamp(16px,1.6vw,24px)] ${className}`}>{children}</div>;

export const PageHeader:React.FC<{eyebrow?:React.ReactNode;title:React.ReactNode;subtitle?:React.ReactNode;actions?:React.ReactNode;compact?:boolean}>=({eyebrow,title,subtitle,actions,compact=false})=><header className={`workspace-page-header flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between ${compact?'mb-4':'mb-5'}`}><div className="min-w-0"><div className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-[#57606a]">{eyebrow}</div><h1 className={`${compact?'text-[23px]':'text-[27px] md:text-[30px]'} font-semibold leading-tight tracking-[-0.025em] text-[#1f2328]`}>{title}</h1>{subtitle&&<div className="mt-2 max-w-[900px] text-[13px] leading-6 text-[#57606a]">{subtitle}</div>}</div>{actions&&<div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}</header>;

export const Surface:React.FC<{children:React.ReactNode;className?:string;tone?:Tone;pad?:'none'|'sm'|'md'|'lg';as?:'div'|'section'|'article'}>=({children,className='',tone='plain',pad='md',as='section'})=>{const Tag=as as any;const pads={none:'',sm:'p-3 md:p-3.5',md:'p-4 md:p-5',lg:'p-5 md:p-6'};return <Tag className={`workspace-surface rounded-xl border shadow-[0_1px_2px_rgba(31,35,40,0.04)] ${toneClass[tone]} ${pads[pad]} ${className}`}>{children}</Tag>};

export const HeroPanel:React.FC<{children:React.ReactNode;className?:string;tone?:Tone}>=({children,className='',tone='blue'})=><Surface as="section" tone={tone} pad="none" className={`overflow-hidden rounded-2xl ${className}`}><div className="p-5 md:p-6 lg:p-7">{children}</div></Surface>;

export const SectionHeader:React.FC<{title:React.ReactNode;subtitle?:React.ReactNode;action?:React.ReactNode;eyebrow?:React.ReactNode}>=({title,subtitle,action,eyebrow})=><div className="mb-4 flex items-start justify-between gap-4"><div className="min-w-0">{eyebrow&&<div className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-[#6e7781]">{eyebrow}</div>}<h2 className="text-[14px] font-semibold tracking-tight text-[#1f2328]">{title}</h2>{subtitle&&<div className="mt-1 text-[12px] leading-5 text-[#6e7781]">{subtitle}</div>}</div>{action&&<div className="flex-shrink-0">{action}</div>}</div>;

export const Metric:React.FC<{label:React.ReactNode;value:React.ReactNode;note?:React.ReactNode;icon?:React.ReactNode;accent?:string;compact?:boolean}>=({label,value,note,icon,accent='text-[#1f2328]',compact=false})=><div className={`min-w-0 ${compact?'py-1':'py-2'}`}><div className="flex items-center gap-1.5 text-[11px] font-medium text-[#57606a]">{icon}{label}</div><div className={`${compact?'mt-1 text-xl':'mt-1.5 text-2xl'} font-semibold tracking-[-0.025em] ${accent}`}>{value}</div>{note&&<div className="mt-1 text-[11px] leading-4 text-[#6e7781]">{note}</div>}</div>;

export const MetricRail:React.FC<{children:React.ReactNode;className?:string;columns?:string}>=({children,className='',columns='grid-cols-2 lg:grid-cols-4'})=><div className={`grid ${columns} gap-x-5 gap-y-3 divide-y divide-[#d8dee4] sm:divide-y-0 sm:divide-x ${className}`}>{React.Children.map(children,(child,i)=><div className={`${i?'sm:pl-5':''}`}>{child}</div>)}</div>;

export const Segmented:React.FC<{items:Array<{id:string;label:React.ReactNode}>;value:string;onChange:(id:any)=>void;className?:string}>=({items,value,onChange,className=''})=><div className={`inline-flex items-center rounded-lg bg-[#f6f8fa] p-1 border border-[#d0d7de] ${className}`}>{items.map(item=><button key={item.id} onClick={()=>onChange(item.id)} className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${value===item.id?'bg-white text-[#1f2328] shadow-sm border border-[#d0d7de]':'text-[#57606a] hover:text-[#1f2328]'}`}>{item.label}</button>)}</div>;

export const Toolbar:React.FC<{children:React.ReactNode;className?:string}>=({children,className=''})=><div className={`workspace-toolbar flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 border border-[#d0d7de] ${className}`}>{children}</div>;

export const PrimaryButton:React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {soft?:boolean}>=({children,className='',soft=false,...props})=><button {...props} className={`${soft?'bg-[#ddf4ff] text-[#0969da] hover:bg-[#b6e3ff] border border-[#54aeff]/35':'bg-[#1f883d] text-white hover:bg-[#1a7f37] border border-[#1a7f37]'} inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${className}`}>{children}</button>;

export const QuietButton:React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>>=({children,className='',...props})=><button {...props} className={`inline-flex items-center justify-center gap-1.5 rounded-md bg-[#f6f8fa] px-3 py-2 text-[12px] font-semibold text-[#24292f] border border-[#d0d7de] transition-colors hover:bg-[#f3f4f6] ${className}`}>{children}</button>;

export const EmptyState:React.FC<{title:React.ReactNode;detail?:React.ReactNode;action?:React.ReactNode}>=({title,detail,action})=><div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl bg-white px-6 py-10 text-center border border-[#d0d7de]"><div className="text-sm font-semibold text-[#1f2328]">{title}</div>{detail&&<div className="mt-1.5 max-w-lg text-[12px] leading-5 text-[#6e7781]">{detail}</div>}{action&&<div className="mt-4">{action}</div>}</div>;
