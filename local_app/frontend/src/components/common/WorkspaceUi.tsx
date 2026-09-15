import React from 'react';

type Tone='plain'|'blue'|'violet'|'warm'|'green'|'rose'|'ink';
const toneClass:Record<Tone,string>={
  plain:'bg-white/88 text-[#202124] ring-black/[0.055]',
  blue:'bg-[linear-gradient(135deg,#edf4ff_0%,#f8faff_62%,#ffffff_100%)] text-[#202124] ring-[#dce7fb]',
  violet:'bg-[linear-gradient(135deg,#f3efff_0%,#fbf9ff_62%,#ffffff_100%)] text-[#202124] ring-[#e4dcf8]',
  warm:'bg-[linear-gradient(135deg,#fff8e8_0%,#fffdf7_62%,#ffffff_100%)] text-[#202124] ring-[#f0e3bd]',
  green:'bg-[linear-gradient(135deg,#eefaf5_0%,#f8fcfa_62%,#ffffff_100%)] text-[#202124] ring-[#dceee5]',
  rose:'bg-[linear-gradient(135deg,#fff1f5_0%,#fff9fb_62%,#ffffff_100%)] text-[#202124] ring-[#f0dfe6]',
  ink:'bg-[linear-gradient(135deg,#202124_0%,#2c2f36_55%,#393d49_100%)] text-white ring-black/10',
};

export const WorkspacePage:React.FC<{children:React.ReactNode;className?:string;id?:string}>=({children,className='',id})=><div id={id} className={`workspace-page relative w-full px-[clamp(14px,1.65vw,30px)] py-[clamp(18px,2vw,30px)] ${className}`}>{children}</div>;

export const PageHeader:React.FC<{eyebrow?:React.ReactNode;title:React.ReactNode;subtitle?:React.ReactNode;actions?:React.ReactNode;compact?:boolean}>=({eyebrow,title,subtitle,actions,compact=false})=><header className={`workspace-page-header flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between ${compact?'mb-4':'mb-6'}`}><div className="min-w-0"><div className="mb-1.5 text-[10px] font-semibold tracking-[0.16em] text-[#7a8190]">{eyebrow}</div><h1 className={`${compact?'text-[24px]':'text-[28px] md:text-[32px]'} font-bold leading-tight tracking-[-0.035em] text-[#202124]`}>{title}</h1>{subtitle&&<div className="mt-2 max-w-[900px] text-xs leading-6 text-[#72777f]">{subtitle}</div>}</div>{actions&&<div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}</header>;

export const Surface:React.FC<{children:React.ReactNode;className?:string;tone?:Tone;pad?:'none'|'sm'|'md'|'lg';as?:'div'|'section'|'article'}>=({children,className='',tone='plain',pad='md',as='section'})=>{const Tag=as as any;const pads={none:'',sm:'p-3.5 md:p-4',md:'p-4 md:p-5',lg:'p-5 md:p-7'};return <Tag className={`workspace-surface rounded-[24px] ring-1 shadow-[0_8px_30px_rgba(31,35,41,0.035)] ${toneClass[tone]} ${pads[pad]} ${className}`}>{children}</Tag>};

export const HeroPanel:React.FC<{children:React.ReactNode;className?:string;tone?:Tone}>=({children,className='',tone='blue'})=><Surface as="section" tone={tone} pad="none" className={`relative overflow-hidden rounded-[30px] ${className}`}><div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/55 blur-3xl"/><div className="pointer-events-none absolute bottom-[-4rem] left-[24%] h-44 w-44 rounded-full bg-[#cfdcff]/35 blur-3xl"/><div className="relative p-5 md:p-7 lg:p-8">{children}</div></Surface>;

export const SectionHeader:React.FC<{title:React.ReactNode;subtitle?:React.ReactNode;action?:React.ReactNode;eyebrow?:React.ReactNode}>=({title,subtitle,action,eyebrow})=><div className="mb-4 flex items-start justify-between gap-4"><div className="min-w-0">{eyebrow&&<div className="mb-1 text-[9px] font-semibold tracking-[0.14em] text-[#858b94]">{eyebrow}</div>}<h2 className="text-sm font-bold tracking-tight text-[#303134]">{title}</h2>{subtitle&&<div className="mt-1 text-[11px] leading-5 text-[#858a90]">{subtitle}</div>}</div>{action&&<div className="flex-shrink-0">{action}</div>}</div>;

export const Metric:React.FC<{label:React.ReactNode;value:React.ReactNode;note?:React.ReactNode;icon?:React.ReactNode;accent?:string;compact?:boolean}>=({label,value,note,icon,accent='text-[#202124]',compact=false})=><div className={`min-w-0 ${compact?'py-1':'py-2'}`}><div className="flex items-center gap-1.5 text-[10px] font-medium text-[#7b8087]">{icon}{label}</div><div className={`${compact?'mt-1 text-xl':'mt-1.5 text-2xl'} font-bold tracking-[-0.03em] ${accent}`}>{value}</div>{note&&<div className="mt-1 text-[10px] leading-4 text-[#92979d]">{note}</div>}</div>;

export const MetricRail:React.FC<{children:React.ReactNode;className?:string;columns?:string}>=({children,className='',columns='grid-cols-2 lg:grid-cols-4'})=><div className={`grid ${columns} gap-x-5 gap-y-3 divide-y divide-black/[0.045] sm:divide-y-0 sm:divide-x sm:divide-black/[0.055] ${className}`}>{React.Children.map(children,(child,i)=><div className={`${i?'sm:pl-5':''}`}>{child}</div>)}</div>;

export const Segmented:React.FC<{items:Array<{id:string;label:React.ReactNode}>;value:string;onChange:(id:any)=>void;className?:string}>=({items,value,onChange,className=''})=><div className={`inline-flex items-center rounded-full bg-[#eef1f6] p-1 ring-1 ring-black/[0.035] ${className}`}>{items.map(item=><button key={item.id} onClick={()=>onChange(item.id)} className={`rounded-full px-3.5 py-2 text-[11px] font-semibold transition-all ${value===item.id?'bg-white text-[#202124] shadow-sm ring-1 ring-black/[0.04]':'text-[#6f747b] hover:text-[#303134]'}`}>{item.label}</button>)}</div>;

export const Toolbar:React.FC<{children:React.ReactNode;className?:string}>=({children,className=''})=><div className={`workspace-toolbar flex flex-wrap items-center gap-2 rounded-[22px] bg-white/82 p-2.5 shadow-[0_6px_20px_rgba(31,35,41,0.028)] ring-1 ring-black/[0.05] backdrop-blur ${className}`}>{children}</div>;

export const PrimaryButton:React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {soft?:boolean}>=({children,className='',soft=false,...props})=><button {...props} className={`${soft?'bg-[#eef2ff] text-[#4b5fb4] hover:bg-[#e5ebff]':'bg-[#202124] text-white hover:bg-[#303238]'} inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-45 ${className}`}>{children}</button>;

export const QuietButton:React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>>=({children,className='',...props})=><button {...props} className={`inline-flex items-center justify-center gap-1.5 rounded-full bg-white/82 px-3.5 py-2 text-[11px] font-semibold text-[#5f646b] ring-1 ring-black/[0.055] transition-all hover:bg-white hover:text-[#202124] ${className}`}>{children}</button>;

export const EmptyState:React.FC<{title:React.ReactNode;detail?:React.ReactNode;action?:React.ReactNode}>=({title,detail,action})=><div className="flex min-h-[180px] flex-col items-center justify-center rounded-[24px] bg-white/65 px-6 py-10 text-center ring-1 ring-black/[0.045]"><div className="text-sm font-semibold text-[#3c4043]">{title}</div>{detail&&<div className="mt-1.5 max-w-lg text-xs leading-5 text-[#8a9096]">{detail}</div>}{action&&<div className="mt-4">{action}</div>}</div>;
