import React,{useEffect,useMemo,useState} from 'react';
import {BookOpen,Check,ChevronDown,ChevronRight,GraduationCap,ListTree,Menu,Play,Plus,Search,Sparkles,Target,Trash2,TriangleAlert,X} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {KnowledgeSectionBlock,type KnowledgeSection} from '../knowledge/KnowledgeSectionBlock';
import {CopyButton} from '../common/CopyButton';
import {formatKnowledgeText} from '../../utils/copy';
import {tZen} from '../../utils/zen';
import type {MasteryState} from '../../types';

type Lens={label:string;focus:string;source:string;evidence?:string};
type Profile={positioning?:string;priority?:string[];exam_route?:string[];avoid?:string[];training?:string[];lenses?:Lens[];evidence_policy?:string};
type Section=KnowledgeSection;
type ReadingPack={slug:string;module:string;profile:Profile;sections:Section[];lesson_sections:Section[];toc?:{id:string;title:string;kind:string}[];evidence_policy?:string};
type Rec={slug:string;title:string;reason:string;score:number;module?:string;module_names?:unknown};
type Unit={id:string;title:string;trigger:string;action:string;stop:string};
type Expansion={id:string;type:string;text:string;source:string;status:string;anchor:string};
type Experience={slug:string;module:string;title:string;units:Unit[];sections:Section[];profile:Profile;data_band:{attempts:number;accuracy:number|null;avg_seconds?:number|null;recurrence:number;last_validation?:any;validation_count:number};adoptions:Record<string,{method_label:string;status:string}>;expansions:Record<string,Expansion[]>;degraded?:boolean;warnings?:string[]};
type ReadMode='lesson'|'full';

const kindLabel:Record<string,string>={recognition:'识别',method:'主方法',speed:'提速',example:'例题',boundary:'边界',review:'复盘',deep:'原理',other:'讲义'};
const masteryLabel:Record<MasteryState,{label:string;color:string}>={
  unlearned:{label:'未学习',color:'bg-[#eef0f4] text-[#5f6368]'},
  learning:{label:'学习中',color:'bg-[#e8f0fe] text-[#3157c8]'},
  recovered:{label:'已恢复',color:'bg-[#fff2c7] text-[#7d5b00]'},
  stable:{label:'稳定掌握',color:'bg-[#dff5ea] text-[#28684f]'},
  mastered:{label:'考场熟练',color:'bg-[#eee7ff] text-[#6547a9] font-bold'},
};
const expansionTypes=['为什么','边界','易混','陷阱','演示'] as const;

async function req<T=any>(url:string,init?:RequestInit):Promise<T>{
  const res=await fetch(url,{...init,headers:{...(init?.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(init?.headers||{})}});
  const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body?.error?.message||body?.detail||`HTTP ${res.status}`);return body as T;
}

export const KnowledgeView:React.FC=()=>{
  const{knowledgeNodes,activeKnowledgeSlug,setActiveKnowledgeSlug,updateNodeMastery,zenMode}=useApp();
  const[q,setQ]=useState('');
  const[openModules,setOpenModules]=useState<Record<string,boolean>>({});
  const[mode,setMode]=useState<ReadMode>('lesson');
  const[reading,setReading]=useState<ReadingPack|null>(null);
  const[experience,setExperience]=useState<Experience|null>(null);
  const[unitId,setUnitId]=useState<string|null>(null);
  const[recs,setRecs]=useState<Rec[]>([]);
  const[loading,setLoading]=useState(false);
  const[readingError,setReadingError]=useState('');
  const[auxWarning,setAuxWarning]=useState('');
  const[busy,setBusy]=useState('');
  const[navOpen,setNavOpen]=useState(false);
  const[toolsOpen,setToolsOpen]=useState(false);

  const filtered=useMemo(()=>knowledgeNodes.filter(n=>!q.trim()||`${n.title}\n${n.module}\n${n.content}`.toLowerCase().includes(q.toLowerCase())),[knowledgeNodes,q]);
  const groups=useMemo(()=>{const map=new Map<string,typeof knowledgeNodes>();for(const node of filtered){if(!map.has(node.module))map.set(node.module,[]);map.get(node.module)!.push(node)}return Array.from(map.entries()).map(([module,nodes])=>({module,nodes}))},[filtered]);
  const current=knowledgeNodes.find(n=>n.slug===activeKnowledgeSlug)||filtered[0]||knowledgeNodes[0];

  useEffect(()=>{req<{items:Rec[];degraded:boolean;warning?:string|null}>('/api/v2/knowledge-safe/recommendations').then(p=>{setRecs(Array.isArray(p.items)?p.items:[]);if(p.warning)setAuxWarning(p.warning)}).catch(()=>setRecs([]))},[]);
  useEffect(()=>{
    if(!current)return;
    setOpenModules(prev=>({...prev,[current.module]:true}));setLoading(true);setReadingError('');setAuxWarning('');setExperience(null);setUnitId(null);
    const readingJob=req<ReadingPack>(`/api/knowledge/node/${encodeURIComponent(current.slug)}/reading`).then(setReading).catch((e:any)=>{setReading(null);setReadingError(e?.message||'阅读结构加载失败')});
    const experienceJob=req<Experience>(`/api/v2/knowledge-safe/${encodeURIComponent(current.slug)}/experience`).then(p=>{setExperience(p);setUnitId(p.units?.[0]?.id||null);if(p.warnings?.length)setAuxWarning(p.warnings.join('；'))}).catch((e:any)=>setAuxWarning(`个性化增强暂不可用：${e?.message||'读取失败'}`));
    void req(`/api/v2/knowledge/${encodeURIComponent(current.slug)}/view`,{method:'POST'}).catch(()=>{});
    Promise.allSettled([readingJob,experienceJob]).finally(()=>setLoading(false));
  },[current?.slug]);

  const sections=mode==='lesson'?(reading?.lesson_sections||[]):(reading?.sections||[]);
  const currentUnit=experience?.units.find(u=>u.id===unitId)||experience?.units?.[0];
  const expansions=currentUnit?(experience?.expansions?.[currentUnit.id]||[]):[];
  const adopted=currentUnit?experience?.adoptions?.[currentUnit.id]:undefined;
  const lenses=reading?.profile?.lenses||experience?.profile?.lenses||[];
  const scrollTo=(id:string)=>{document.getElementById(`lesson-${id}`)?.scrollIntoView({behavior:'smooth',block:'start'});setToolsOpen(false)};
  const selectNode=(slug:string)=>{setActiveKnowledgeSlug(slug);setNavOpen(false)};
  const startPractice=()=>{if(!current)return;window.dispatchEvent(new CustomEvent('gongkao:start-practice',{detail:{node_slug:current.slug,title:`${current.title} · 方法验证`,limit:5,estimated_minutes:8,adopted_method:adopted?.method_label||null,force:false}}))};
  const adopt=async(label:string)=>{if(!current||!currentUnit)return;setBusy(`adopt-${label}`);try{const row=await req(`/api/v2/knowledge/${encodeURIComponent(current.slug)}/adoption`,{method:'POST',body:JSON.stringify({unit_id:currentUnit.id,method_label:label,status:adopted?.method_label===label&&adopted?.status==='adopted'?'discarded':'adopted'})});setExperience(p=>p?{...p,adoptions:{...p.adoptions,[currentUnit.id]:row}}:p)}catch(e:any){setAuxWarning(e?.message||'方法状态保存失败')}finally{setBusy('')}};
  const generate=async(type:string,text?:string)=>{if(!current||!currentUnit)return;const key=`expand-${type}`;setBusy(key);try{const row=await req<Expansion>(`/api/v2/knowledge/${encodeURIComponent(current.slug)}/expansion`,{method:'POST',body:JSON.stringify({unit_id:currentUnit.id,anchor:currentUnit.trigger,type,text})});setExperience(p=>p?{...p,expansions:{...p.expansions,[currentUnit.id]:[...(p.expansions[currentUnit.id]||[]).filter(x=>x.type!==type),row]}}:p)}catch(e:any){setAuxWarning(e?.message||'补充生成失败')}finally{setBusy('')}};
  const mutate=async(id:string,action:'adopt'|'delete')=>{if(!currentUnit)return;setBusy(id);try{const rows=await req<Expansion[]>('/api/v2/knowledge/expansion/action',{method:'POST',body:JSON.stringify({unit_id:currentUnit.id,expansion_id:id,action})});setExperience(p=>p?{...p,expansions:{...p.expansions,[currentUnit.id]:rows}}:p)}catch(e:any){setAuxWarning(e?.message||'补充操作失败')}finally{setBusy('')}};

  const fallbackBody=!reading&&current?.content?current.content:'';
  const copyBody=sections.length?sections.map(s=>`## ${s.title}\n\n${s.body}`).join('\n\n'):current?.content||'';
  const copyWhole=current?formatKnowledgeText({title:current.title,module:current.module,body:copyBody}):'';
  const hasHints=!!reading&&Boolean(reading.profile.positioning||reading.profile.priority?.length||reading.profile.exam_route?.length||reading.profile.avoid?.length||reading.profile.training?.length||lenses.length);

  const directory=<>
    <div className="relative overflow-hidden px-5 pb-4 pt-5">
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-br from-[#e8f0fe] via-[#f3ecff] to-[#fce8f1] opacity-75"/>
      <div className="relative flex items-start justify-between gap-3">
        <div><div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] text-[#5f6368]"><Sparkles className="h-3 w-3 text-[#7b61d1]"/>KNOWLEDGE MAP</div><h2 className="text-lg font-bold tracking-tight text-[#202124]">{tZen('知识目录',zenMode)}</h2><p className="mt-1 text-[11px] text-[#6f7378]">快速跳转，不占正文空间</p></div>
        <button onClick={()=>setNavOpen(false)} className="rounded-full bg-white/70 p-2 text-[#5f6368] ring-1 ring-black/[0.05] backdrop-blur hover:bg-white"><X className="h-4 w-4"/></button>
      </div>
      <div className="relative mt-4"><Search className="absolute left-3.5 top-3 h-3.5 w-3.5 text-[#6f7378]"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="搜索考点、公式、关键词" className="w-full rounded-full bg-white/82 py-2.5 pl-9 pr-4 text-xs text-[#202124] shadow-sm ring-1 ring-black/[0.055] outline-none placeholder:text-[#9aa0a6] focus:ring-[#8ab4f8]"/></div>
    </div>
    {recs.length>0&&<div className="px-3 pb-3"><div className="px-2 pb-2 text-[10px] font-semibold text-[#6f7378]">当前优先</div><div className="space-y-1.5">{recs.slice(0,4).map((r,i)=><button key={r.slug} onClick={()=>selectNode(r.slug)} className="group w-full rounded-2xl bg-white/68 p-3 text-left ring-1 ring-black/[0.045] transition-all hover:bg-white hover:shadow-md"><div className="flex items-start gap-2.5"><span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#d7e6ff] to-[#eadfff] text-[10px] font-bold text-[#5366b3]">{i+1}</span><div className="min-w-0"><div className="truncate text-[12px] font-semibold text-[#303134]">{r.title}</div><div className="mt-0.5 truncate text-[10px] text-[#7a7f85]">{r.reason}</div></div></div></button>)}</div></div>}
    <nav className="max-h-[calc(78vh-205px)] overflow-y-auto px-3 pb-4">{groups.map(group=>{const isOpen=!!openModules[group.module];return <div key={group.module} className="mb-1.5"><button onClick={()=>setOpenModules(p=>({...p,[group.module]:!isOpen}))} className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-xs font-semibold text-[#3c4043] transition-colors hover:bg-white/70"><span>{tZen(group.module,zenMode)}</span><span className="flex items-center gap-1.5 text-[10px] font-normal text-[#8a9096]">{group.nodes.length}{isOpen?<ChevronDown className="h-3.5 w-3.5"/>:<ChevronRight className="h-3.5 w-3.5"/>}</span></button>{isOpen&&<div className="mt-1 space-y-1 pl-2">{group.nodes.map(node=><button key={node.slug} onClick={()=>selectNode(node.slug)} className={`w-full rounded-2xl px-3 py-2.5 text-left transition-all ${current?.slug===node.slug?'bg-gradient-to-r from-[#4f6bdc] to-[#765bc3] text-white shadow-md':'text-[#5f6368] hover:bg-white/75'}`}><div className="text-[11px] font-semibold leading-4">{node.title}</div><div className={`mt-1 flex items-center gap-1.5 text-[9px] ${current?.slug===node.slug?'text-white/75':'text-[#9aa0a6]'}`}><span>{masteryLabel[node.mastery]?.label||'未学习'}</span><span>·</span><span>{node.sampleN||0}题</span></div></button>)}</div>}</div>})}</nav>
  </>;

  const tools=<>
    <div className="relative overflow-hidden px-5 pb-4 pt-5"><div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-br from-[#eef5ff] via-[#f8f5ff] to-[#fff4f8] opacity-80"/><div className="relative flex items-start justify-between"><div><div className="mb-1 text-[10px] font-semibold tracking-[0.14em] text-[#6f7378]">STUDY TOOLS</div><div className="text-lg font-bold tracking-tight text-[#202124]">本节导航与工具</div></div><button onClick={()=>setToolsOpen(false)} className="rounded-full bg-white/70 p-2 text-[#5f6368] ring-1 ring-black/[0.05] backdrop-blur hover:bg-white"><X className="h-4 w-4"/></button></div></div>
    <div className="max-h-[calc(80vh-72px)] space-y-5 overflow-y-auto px-4 pb-5">
      {current&&<section className="rounded-[22px] bg-white/72 p-4 ring-1 ring-black/[0.045]"><div className="mb-2.5 text-[10px] font-semibold text-[#6f7378]">掌握状态</div><div className="flex flex-wrap gap-1.5">{(['unlearned','learning','recovered','stable','mastered'] as MasteryState[]).map(st=><button key={st} onClick={()=>void updateNodeMastery(current.slug,st)} className={`rounded-full px-2.5 py-1.5 text-[10px] transition-all ${current.mastery===st?'bg-[#202124] text-white shadow-sm':masteryLabel[st].color}`}>{current.mastery===st&&<Check className="mr-1 inline h-3 w-3"/>}{masteryLabel[st].label}</button>)}</div></section>}
      {reading&&<section className="rounded-[22px] bg-white/72 p-4 ring-1 ring-black/[0.045]"><div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold text-[#6f7378]"><ListTree className="h-3.5 w-3.5 text-[#5366b3]"/>本节目录</div><div className="space-y-0.5">{sections.map((s,i)=><button key={s.id} onClick={()=>scrollTo(s.id)} className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left text-[10px] text-[#5f6368] transition-colors hover:bg-[#f1f4f9] hover:text-[#202124]"><span className="mt-0.5 font-mono text-[#a2a7ad]">{String(i+1).padStart(2,'0')}</span><span><b className="font-medium text-[#7b8086]">{kindLabel[s.kind]||'讲义'}</b> · {s.title}</span></button>)}</div></section>}
      {experience&&currentUnit&&<section className="rounded-[22px] bg-white/72 p-4 ring-1 ring-black/[0.045]"><div className="mb-2.5 text-[10px] font-semibold text-[#6f7378]">情形与扩写</div>{experience.units.length>1&&<select value={currentUnit.id} onChange={e=>setUnitId(e.target.value)} className="mb-3 w-full rounded-xl bg-[#f3f6fb] px-3 py-2 text-[10px] outline-none ring-1 ring-black/[0.05]">{experience.units.map(u=><option key={u.id} value={u.id}>{u.title}</option>)}</select>}<div className="rounded-2xl bg-gradient-to-br from-[#edf4ff] to-[#f7f3ff] p-3.5 text-[11px] leading-5 text-[#444746]"><b>信号：</b>{currentUnit.trigger}<br/><b>动作：</b>{currentUnit.action}{currentUnit.stop&&<><br/><b>止损：</b>{currentUnit.stop}</>}</div><div className="mt-3 flex flex-wrap gap-1.5">{expansionTypes.map(type=><button key={type} disabled={!!busy} onClick={()=>void generate(type)} className="rounded-full bg-[#eef1f6] px-2.5 py-1.5 text-[10px] text-[#555a60] hover:bg-[#e5e9f0]">{busy===`expand-${type}`?'生成中…':`+ ${type}`}</button>)}<button disabled={!!busy} onClick={()=>{const text=window.prompt('写下你的批注');if(text)void generate('我的批注',text)}} className="rounded-full bg-white px-2.5 py-1.5 text-[10px] text-[#555a60] ring-1 ring-black/[0.06]"><Plus className="mr-1 inline h-3 w-3"/>批注</button></div>{expansions.length>0&&<div className="mt-3 space-y-2">{expansions.map(row=><div key={row.id} className="rounded-2xl bg-[#f7f8fb] p-3 ring-1 ring-black/[0.045]"><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-semibold text-[#7a7f85]">{row.type} · {row.source}</span><div className="flex items-center gap-2"><CopyButton text={row.text} label="复制"/><button disabled={busy===row.id||row.status==='adopted'} onClick={()=>void mutate(row.id,'adopt')} className="text-[9px] text-[#5f6368]">采纳</button><button disabled={busy===row.id} onClick={()=>void mutate(row.id,'delete')} className="text-[#9aa0a6] hover:text-rose-700"><Trash2 className="h-3 w-3"/></button></div></div><div className="mt-1.5 whitespace-pre-wrap text-[11px] leading-5 text-[#4b4e50]">{row.text}</div></div>)}</div>}</section>}
      {experience&&<section className="rounded-[22px] bg-gradient-to-br from-[#edf5ff] to-[#f4efff] p-4 ring-1 ring-[#dfe7fa]"><div className="mb-2 text-[10px] font-semibold text-[#5366b3]">真实训练证据</div><div className="text-xs text-[#404348]">做过 {experience.data_band.attempts} 题 · 正确率 {experience.data_band.accuracy==null?'—':`${Math.round(experience.data_band.accuracy*100)}%`} · 复发 {experience.data_band.recurrence} 次</div><button onClick={startPractice} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#496bd8] to-[#7655c5] px-3 py-2.5 text-[10px] font-semibold text-white shadow-sm"><Play className="h-3 w-3"/>练 5 题验证</button></section>}
    </div>
  </>;

  return <div id="view-knowledge" className="relative mx-auto max-w-[1280px] px-3 py-5 md:px-6 md:py-7">
    <div className="pointer-events-none fixed left-[18%] top-28 -z-10 h-64 w-64 rounded-full bg-[#dce8ff]/45 blur-[90px]"/>
    <div className="pointer-events-none fixed right-[12%] top-52 -z-10 h-72 w-72 rounded-full bg-[#eadfff]/35 blur-[100px]"/>

    {(navOpen||toolsOpen)&&<button aria-label="关闭浮层" onClick={()=>{setNavOpen(false);setToolsOpen(false)}} className="fixed inset-0 z-30 bg-[#202124]/10 backdrop-blur-[2px]"/>}
    {navOpen&&<aside className="fixed z-40 top-20 left-4 w-[min(390px,calc(100vw-32px))] max-h-[80vh] overflow-hidden rounded-[30px] bg-[#f5f7fb]/95 shadow-[0_24px_80px_rgba(32,33,36,0.22)] ring-1 ring-white/80 backdrop-blur-2xl"><div className="absolute -top-1 left-8 h-3 w-3 rotate-45 bg-[#eef3ff] ring-1 ring-white/70"/>{directory}</aside>}
    {toolsOpen&&<aside className="fixed z-40 top-20 right-4 w-[min(385px,calc(100vw-32px))] max-h-[82vh] overflow-hidden rounded-[30px] bg-[#f5f7fb]/95 shadow-[0_24px_80px_rgba(32,33,36,0.22)] ring-1 ring-white/80 backdrop-blur-2xl"><div className="absolute -top-1 right-8 h-3 w-3 rotate-45 bg-[#eef3ff] ring-1 ring-white/70"/>{tools}</aside>}

    <div className="sticky top-3 z-20 mb-4 flex items-center justify-between gap-3 pointer-events-none">
      <button onClick={()=>{setNavOpen(v=>!v);setToolsOpen(false)}} className={`pointer-events-auto inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 text-xs font-semibold shadow-[0_6px_24px_rgba(32,33,36,0.10)] ring-1 backdrop-blur-xl transition-all ${navOpen?'bg-[#202124] text-white ring-[#202124]':'bg-white/82 text-[#4a4d50] ring-black/[0.06] hover:bg-white hover:shadow-lg'}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full ${navOpen?'bg-white/15':'bg-gradient-to-br from-[#e2ecff] to-[#eee4ff] text-[#5366b3]'}`}><Menu className="h-3.5 w-3.5"/></span>目录</button>
      <button onClick={()=>{setToolsOpen(v=>!v);setNavOpen(false)}} className={`pointer-events-auto inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 text-xs font-semibold shadow-[0_6px_24px_rgba(32,33,36,0.10)] ring-1 backdrop-blur-xl transition-all ${toolsOpen?'bg-[#202124] text-white ring-[#202124]':'bg-white/82 text-[#4a4d50] ring-black/[0.06] hover:bg-white hover:shadow-lg'}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full ${toolsOpen?'bg-white/15':'bg-gradient-to-br from-[#e2ecff] to-[#f5e5f0] text-[#6e5bb7]'}`}><ListTree className="h-3.5 w-3.5"/></span>本节工具</button>
    </div>

    {current?<article className="overflow-hidden rounded-[34px] bg-[#f8fafd] shadow-[0_14px_50px_rgba(32,33,36,0.07)] ring-1 ring-[#e5e9f0]">
      <header className="relative overflow-hidden px-5 py-6 md:px-10 md:py-9">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#eef4ff_0%,#f8f8ff_48%,#fff5f9_100%)]"/>
        <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[#d7e5ff]/70 blur-3xl"/><div className="absolute right-24 top-8 h-36 w-36 rounded-full bg-[#eadfff]/55 blur-3xl"/>
        <div className="relative">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]"><span className="rounded-full bg-white/72 px-3 py-1 font-medium text-[#4f5965] shadow-sm ring-1 ring-black/[0.04]">{tZen(current.module,zenMode)}</span>{current.targetSeconds?<span className="rounded-full bg-[#e9efff]/80 px-3 py-1 font-medium text-[#5064ad]">目标 {current.targetSeconds}s/题</span>:null}{current.mastery?<span className={`rounded-full px-3 py-1 ${masteryLabel[current.mastery].color}`}>{masteryLabel[current.mastery].label}</span>:null}</div>
              <h1 className="max-w-[860px] text-3xl font-bold leading-[1.18] tracking-[-0.035em] text-[#202124] md:text-[38px]">{current.title}</h1>
              {experience&&<div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[#6f7378]"><span className="rounded-full bg-white/62 px-3 py-1.5">做过 <b className="text-[#303134]">{experience.data_band.attempts}</b> 题</span><span className="rounded-full bg-white/62 px-3 py-1.5">正确率 <b className="text-[#303134]">{experience.data_band.accuracy==null?'—':`${Math.round(experience.data_band.accuracy*100)}%`}</b></span><span className="rounded-full bg-white/62 px-3 py-1.5">关联复发 <b className="text-[#303134]">{experience.data_band.recurrence}</b> 次</span></div>}
            </div>
            <CopyButton text={copyWhole} label="复制整节" className="mt-1 flex-shrink-0 rounded-full bg-white/72 px-3 py-2 ring-1 ring-black/[0.05] shadow-sm backdrop-blur"/>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center rounded-full bg-white/72 p-1 shadow-sm ring-1 ring-black/[0.05] backdrop-blur"><button onClick={()=>setMode('lesson')} className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${mode==='lesson'?'bg-[#202124] text-white shadow-sm':'text-[#6f7378] hover:text-[#202124]'}`}>精讲</button><button onClick={()=>setMode('full')} className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${mode==='full'?'bg-[#202124] text-white shadow-sm':'text-[#6f7378] hover:text-[#202124]'}`}>完整讲义</button></div>
            <button onClick={startPractice} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#496bd8] via-[#5f63cf] to-[#7655c5] px-5 py-2.5 text-xs font-semibold text-white shadow-[0_8px_22px_rgba(83,91,196,0.24)] transition-transform hover:-translate-y-0.5"><Play className="h-3.5 w-3.5"/>按这个方法练 5 题</button>
          </div>
        </div>
      </header>

      {auxWarning&&<div className="mx-5 mt-4 rounded-2xl bg-[#fff7da] px-4 py-3 text-[11px] text-[#795900] ring-1 ring-[#f1dfa7] md:mx-10">{auxWarning}。正文阅读不受影响。</div>}
      {loading&&<div className="p-16 text-center text-sm text-[#8a9096]">正在整理本节内容…</div>}

      {!loading&&reading&&<div className="px-4 pb-7 pt-5 md:px-9 md:pb-10 md:pt-7"><div className="mx-auto max-w-[980px]">
        {mode==='lesson'&&currentUnit&&<section className="mb-6 overflow-hidden rounded-[28px] bg-gradient-to-br from-[#fff6d7] via-[#fffaf0] to-[#f6f1ff] shadow-[0_8px_28px_rgba(102,84,42,0.055)] ring-1 ring-[#f0dfab]"><div className="flex items-center gap-2 px-5 py-3 text-[11px] font-bold text-[#765100]"><Sparkles className="h-4 w-4 text-[#9a6700]"/>30 秒考场唤醒</div><div className="grid grid-cols-1 gap-2 px-3 pb-3 md:grid-cols-3"><div className="rounded-[20px] bg-white/78 p-4 ring-1 ring-black/[0.04]"><div className="mb-1.5 text-[10px] font-semibold text-[#9a6700]">看到</div><div className="text-sm font-semibold leading-6 text-[#303134]">{currentUnit.trigger}</div></div><div className="rounded-[20px] bg-white/78 p-4 ring-1 ring-black/[0.04]"><div className="mb-1.5 text-[10px] font-semibold text-[#5366b3]">就做</div><div className="text-sm font-semibold leading-6 text-[#303134]">{currentUnit.action}</div></div><div className="rounded-[20px] bg-white/78 p-4 ring-1 ring-black/[0.04]"><div className="mb-1.5 text-[10px] font-semibold text-[#9b5470]">切换 / 止损</div><div className="text-sm leading-6 text-[#4f5357]">{currentUnit.stop||'出现不适用信号时切回基础方法。'}</div></div></div></section>}

        {mode==='lesson'&&hasHints&&<details className="group mb-7 overflow-hidden rounded-[26px] bg-white/72 shadow-[0_4px_20px_rgba(32,33,36,0.035)] ring-1 ring-black/[0.05]"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#e5eeff] to-[#eee5ff] text-[#6658b5]"><BookOpen className="h-4 w-4"/></span><div><div className="text-xs font-bold text-[#303134]">学习提示与讲法</div>{reading.profile.positioning&&<div className="mt-0.5 truncate text-[11px] text-[#7a7f85]">{reading.profile.positioning}</div>}</div></div><ChevronDown className="h-4 w-4 flex-shrink-0 text-[#8a9096] transition-transform group-open:rotate-180"/></summary><div className="grid grid-cols-1 gap-3 border-t border-black/[0.045] bg-[#fbfcff] p-4 lg:grid-cols-2">
          {reading.profile.priority?.length?<div className="rounded-[20px] bg-white p-4 ring-1 ring-black/[0.045]"><div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-[#5366b3]"><Target className="h-3.5 w-3.5"/>学习重点</div><ol className="space-y-1.5 text-xs leading-5 text-[#55595d]">{reading.profile.priority.map((x,i)=><li key={i}>{i+1}. {x}</li>)}</ol></div>:null}
          {reading.profile.exam_route?.length?<div className="rounded-[20px] bg-white p-4 ring-1 ring-black/[0.045]"><div className="mb-2 text-[10px] font-bold text-[#6658b5]">考场调用链</div><ol className="space-y-1.5 text-xs leading-5 text-[#55595d]">{reading.profile.exam_route.map((x,i)=><li key={i}>{i+1}. {x}</li>)}</ol></div>:null}
          {reading.profile.avoid?.length?<div className="rounded-[20px] bg-[#fff7f9] p-4 ring-1 ring-[#f4e1e8]"><div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-[#a64b68]"><TriangleAlert className="h-3.5 w-3.5"/>不要这样做</div><ul className="space-y-1.5 text-xs leading-5 text-[#5b5558]">{reading.profile.avoid.map((x,i)=><li key={i}>• {x}</li>)}</ul></div>:null}
          {reading.profile.training?.length?<div className="rounded-[20px] bg-[#f3fbf7] p-4 ring-1 ring-[#dfeee7]"><div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-[#2f765d]"><GraduationCap className="h-3.5 w-3.5"/>怎么练</div><ul className="space-y-1.5 text-xs leading-5 text-[#505b56]">{reading.profile.training.map((x,i)=><li key={i}>• {x}</li>)}</ul></div>:null}
          {lenses.length>0&&<div className="lg:col-span-2 rounded-[22px] bg-gradient-to-r from-[#f2f6ff] to-[#faf5ff] p-4 ring-1 ring-[#e4e5f5]"><div className="mb-3 flex items-center gap-1.5 text-[10px] font-bold text-[#6658b5]"><Sparkles className="h-3.5 w-3.5"/>不同讲法</div><div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">{lenses.map((lens,i)=><div key={`${lens.label}-${i}`} className="rounded-[18px] bg-white/85 p-3.5 ring-1 ring-black/[0.045]"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-[#303134]">{lens.label}</span><div className="flex items-center gap-2"><CopyButton text={`${lens.label}\n${lens.focus}\n来源：${lens.source}`} label="复制"/><button disabled={busy===`adopt-${lens.label}`} onClick={()=>void adopt(lens.label)} className={`rounded-full px-2.5 py-1 text-[10px] ${adopted?.method_label===lens.label&&adopted?.status==='adopted'?'bg-[#202124] text-white':'bg-[#eef1f6] text-[#5f6368]'}`}>{adopted?.method_label===lens.label&&adopted?.status==='adopted'?'已采用':'采用'}</button></div></div><p className="mt-2 text-xs leading-5 text-[#55595d]">{lens.focus}</p><div className="mt-1.5 text-[9px] text-[#9aa0a6]">来源：{lens.source}</div></div>)}</div></div>}
        </div></details>}

        <div className="space-y-5">{sections.map(section=><KnowledgeSectionBlock key={section.id} section={section} module={current.module}/>)}</div>
      </div></div>}

      {!loading&&!reading&&fallbackBody&&<div className="px-4 pb-8 pt-5 md:px-9"><div className="mx-auto max-w-[980px]"><div className="mb-4 rounded-2xl bg-[#fff7da] px-4 py-3 text-xs text-[#795900] ring-1 ring-[#f1dfa7]">阅读结构暂不可用，已回退到原始笔记。</div><KnowledgeSectionBlock section={{id:'raw-note',title:'原始笔记正文',kind:'other',body:fallbackBody}} module={current.module}/></div></div>}
      {!loading&&!reading&&!fallbackBody&&<div className="p-10 text-center text-sm text-rose-700">知识正文加载失败：{readingError||'暂无可用正文'}</div>}
    </article>:<div className="rounded-[30px] bg-white p-16 text-center text-sm text-[#8a9096] shadow-sm ring-1 ring-black/[0.05]">请选择一个考点</div>}
  </div>;
};
