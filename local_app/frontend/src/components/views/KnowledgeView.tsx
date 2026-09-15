import React,{useEffect,useMemo,useState} from 'react';
import Markdown from 'react-markdown';
import {BookOpen,Check,ChevronDown,ChevronRight,GraduationCap,ListTree,Play,Plus,Search,Sparkles,Target,Trash2,TriangleAlert} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {tZen} from '../../utils/zen';
import type {MasteryState} from '../../types';

type Lens={label:string;focus:string;source:string;evidence?:string};
type Profile={positioning?:string;priority?:string[];exam_route?:string[];avoid?:string[];training?:string[];lenses?:Lens[];evidence_policy?:string};
type Section={id:string;title:string;kind:string;level?:number;body:string};
type ReadingPack={slug:string;module:string;profile:Profile;sections:Section[];lesson_sections:Section[];toc?:{id:string;title:string;kind:string}[];evidence_policy?:string};
type Rec={slug:string;title:string;reason:string;score:number;module?:string;module_names?:unknown};
type Unit={id:string;title:string;trigger:string;action:string;stop:string};
type Expansion={id:string;type:string;text:string;source:string;status:string;anchor:string};
type Experience={slug:string;module:string;title:string;units:Unit[];sections:Section[];profile:Profile;data_band:{attempts:number;accuracy:number|null;avg_seconds?:number|null;recurrence:number;last_validation?:any;validation_count:number};adoptions:Record<string,{method_label:string;status:string}>;expansions:Record<string,Expansion[]>;degraded?:boolean;warnings?:string[]};
type ReadMode='lesson'|'full';

const kindLabel:Record<string,string>={recognition:'识别',method:'主方法',speed:'考场提速',example:'例题',boundary:'边界易错',review:'训练复盘',deep:'原理',other:'讲义'};
const masteryLabel:Record<MasteryState,{label:string;color:string}>={
  unlearned:{label:'未学习',color:'bg-stone-100 text-stone-600'},
  learning:{label:'学习中',color:'bg-blue-100 text-blue-800'},
  recovered:{label:'已快速恢复',color:'bg-amber-100 text-amber-900'},
  stable:{label:'稳定掌握',color:'bg-emerald-100 text-emerald-900'},
  mastered:{label:'考场熟练',color:'bg-purple-100 text-purple-900 font-bold'},
};
const expansionTypes=['为什么','边界','易混','陷阱','演示'] as const;

async function req<T=any>(url:string,init?:RequestInit):Promise<T>{
  const res=await fetch(url,{...init,headers:{...(init?.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(init?.headers||{})}});
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(body?.error?.message||body?.detail||`HTTP ${res.status}`);
  return body as T;
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

  const filtered=useMemo(()=>knowledgeNodes.filter(n=>!q.trim()||`${n.title}\n${n.module}\n${n.content}`.toLowerCase().includes(q.toLowerCase())),[knowledgeNodes,q]);
  const groups=useMemo(()=>{const map=new Map<string,typeof knowledgeNodes>();for(const node of filtered){if(!map.has(node.module))map.set(node.module,[]);map.get(node.module)!.push(node)}return Array.from(map.entries()).map(([module,nodes])=>({module,nodes}))},[filtered]);
  const current=knowledgeNodes.find(n=>n.slug===activeKnowledgeSlug)||filtered[0]||knowledgeNodes[0];

  useEffect(()=>{
    req<{items:Rec[];degraded:boolean;warning?:string|null}>('/api/v2/knowledge-safe/recommendations')
      .then(p=>{setRecs(Array.isArray(p.items)?p.items:[]);if(p.warning)setAuxWarning(p.warning)})
      .catch(()=>setRecs([]));
  },[]);

  useEffect(()=>{
    if(!current)return;
    setOpenModules(prev=>({...prev,[current.module]:true}));
    setLoading(true);setReadingError('');setAuxWarning('');setExperience(null);setUnitId(null);
    const readingJob=req<ReadingPack>(`/api/knowledge/node/${encodeURIComponent(current.slug)}/reading`)
      .then(setReading)
      .catch((e:any)=>{setReading(null);setReadingError(e?.message||'阅读结构加载失败')});
    const experienceJob=req<Experience>(`/api/v2/knowledge-safe/${encodeURIComponent(current.slug)}/experience`)
      .then(p=>{setExperience(p);setUnitId(p.units?.[0]?.id||null);if(p.warnings?.length)setAuxWarning(p.warnings.join('；'))})
      .catch((e:any)=>setAuxWarning(`个性化增强暂不可用：${e?.message||'读取失败'}`));
    void req(`/api/v2/knowledge/${encodeURIComponent(current.slug)}/view`,{method:'POST'}).catch(()=>{});
    Promise.allSettled([readingJob,experienceJob]).finally(()=>setLoading(false));
  },[current?.slug]);

  const sections=mode==='lesson'?(reading?.lesson_sections||[]):(reading?.sections||[]);
  const currentUnit=experience?.units.find(u=>u.id===unitId)||experience?.units?.[0];
  const expansions=currentUnit?(experience?.expansions?.[currentUnit.id]||[]):[];
  const adopted=currentUnit?experience?.adoptions?.[currentUnit.id]:undefined;
  const lenses=reading?.profile?.lenses||experience?.profile?.lenses||[];

  const scrollTo=(id:string)=>document.getElementById(`lesson-${id}`)?.scrollIntoView({behavior:'smooth',block:'start'});
  const startPractice=()=>{if(!current)return;window.dispatchEvent(new CustomEvent('gongkao:start-practice',{detail:{node_slug:current.slug,title:`${current.title} · 方法验证`,limit:5,estimated_minutes:8,adopted_method:adopted?.method_label||null,force:false}}))};
  const adopt=async(label:string)=>{if(!current||!currentUnit)return;setBusy(`adopt-${label}`);try{const row=await req(`/api/v2/knowledge/${encodeURIComponent(current.slug)}/adoption`,{method:'POST',body:JSON.stringify({unit_id:currentUnit.id,method_label:label,status:adopted?.method_label===label&&adopted?.status==='adopted'?'discarded':'adopted'})});setExperience(p=>p?{...p,adoptions:{...p.adoptions,[currentUnit.id]:row}}:p)}catch(e:any){setAuxWarning(e?.message||'方法状态保存失败')}finally{setBusy('')}};
  const generate=async(type:string,text?:string)=>{if(!current||!currentUnit)return;const key=`expand-${type}`;setBusy(key);try{const row=await req<Expansion>(`/api/v2/knowledge/${encodeURIComponent(current.slug)}/expansion`,{method:'POST',body:JSON.stringify({unit_id:currentUnit.id,anchor:currentUnit.trigger,type,text})});setExperience(p=>p?{...p,expansions:{...p.expansions,[currentUnit.id]:[...(p.expansions[currentUnit.id]||[]).filter(x=>x.type!==type),row]}}:p)}catch(e:any){setAuxWarning(e?.message||'补充生成失败')}finally{setBusy('')}};
  const mutate=async(id:string,action:'adopt'|'delete')=>{if(!currentUnit)return;setBusy(id);try{const rows=await req<Expansion[]>('/api/v2/knowledge/expansion/action',{method:'POST',body:JSON.stringify({unit_id:currentUnit.id,expansion_id:id,action})});setExperience(p=>p?{...p,expansions:{...p.expansions,[currentUnit.id]:rows}}:p)}catch(e:any){setAuxWarning(e?.message||'补充操作失败')}finally{setBusy('')}};

  const fallbackBody=!reading&&current?.content?current.content:'';
  return <div id="view-knowledge" className="p-3 md:p-6 max-w-[1580px] mx-auto">
    <div className="grid grid-cols-1 xl:grid-cols-[270px_minmax(0,1fr)_250px] gap-4 items-start">
      <aside className="bg-white border border-stone-200 rounded-2xl overflow-hidden xl:sticky xl:top-3">
        <div className="px-4 py-4 border-b border-stone-100">
          <div className="text-[10px] font-mono text-amber-700 mb-1">XINGCE KNOWLEDGE</div>
          <h2 className="text-base font-bold text-stone-900">{tZen('行测知识目录',zenMode)}</h2>
          <p className="text-[11px] text-stone-500 mt-1">模块 → 考点，Gemini 教材式阅读路径</p>
          <div className="relative mt-3"><Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="搜索考点..." className="w-full pl-8 pr-3 py-2 rounded-lg border border-stone-200 text-xs outline-none focus:border-stone-400"/></div>
        </div>
        {recs.length>0&&<div className="p-3 border-b border-stone-100 bg-amber-50/35"><div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-900 mb-2"><Sparkles className="w-3.5 h-3.5"/>当前优先</div><div className="space-y-1">{recs.slice(0,3).map((r,i)=><button key={r.slug} onClick={()=>setActiveKnowledgeSlug(r.slug)} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/80 transition-colors"><div className="flex gap-2"><span className="font-mono text-[9px] text-amber-700">0{i+1}</span><div className="min-w-0"><div className="text-[11px] font-semibold text-stone-800 truncate">{r.title}</div><div className="text-[9px] text-stone-500 truncate">{r.reason}</div></div></div></button>)}</div></div>}
        <nav className="p-2 max-h-[calc(100vh-310px)] overflow-y-auto">{groups.map(group=>{const isOpen=!!openModules[group.module];return <div key={group.module} className="mb-1"><button onClick={()=>setOpenModules(p=>({...p,[group.module]:!isOpen}))} className="w-full px-2.5 py-2 rounded-lg flex items-center justify-between text-xs font-semibold text-stone-800 hover:bg-stone-50"><span>{tZen(group.module,zenMode)}</span><span className="flex items-center gap-1 text-[10px] text-stone-400 font-mono">{group.nodes.length}{isOpen?<ChevronDown className="w-3 h-3"/>:<ChevronRight className="w-3 h-3"/>}</span></button>{isOpen&&<div className="ml-2 pl-2 border-l border-stone-200 space-y-0.5">{group.nodes.map(node=>{const active=current?.slug===node.slug;return <button key={node.slug} onClick={()=>setActiveKnowledgeSlug(node.slug)} className={`w-full px-2.5 py-2 rounded-lg text-left ${active?'bg-stone-900 text-white':'text-stone-600 hover:bg-stone-50'}`}><div className="flex items-start gap-2"><span className={`mt-0.5 text-[9px] font-mono px-1 py-0.5 rounded ${active?'bg-stone-800 text-amber-300':'bg-stone-100 text-stone-400'}`}>B{node.priorityBatch||'—'}</span><div className="min-w-0"><div className="text-[11px] font-medium leading-4">{node.title}</div><div className="text-[9px] mt-1 text-stone-400">{masteryLabel[node.mastery]?.label||'未学习'} · {node.sampleN||0}题</div></div></div></button>})}</div>}</div>})}</nav>
      </aside>

      <main className="min-w-0">{current?<article className="bg-[#fffdfa] border border-stone-200 rounded-3xl overflow-hidden shadow-2xs">
        <header className="px-5 py-6 md:px-9 md:py-8 border-b border-stone-200 bg-white"><div className="flex flex-wrap items-center gap-2 mb-3"><span className="px-2.5 py-1 rounded-full bg-stone-100 text-stone-700 text-[10px] font-semibold">{tZen(current.module,zenMode)}</span><span className="px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-mono">B{current.priorityBatch||'—'}</span>{current.targetSeconds&&<span className="text-[10px] text-stone-500 font-mono">目标 {current.targetSeconds}s/题</span>}</div><h1 className="text-2xl md:text-3xl font-bold text-stone-950 leading-tight tracking-tight">{current.title}</h1><div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-stone-500"><span>{current.charCount||current.content.length} 字</span><span>{current.sampleN||0} 题真实样本</span>{current.accuracy!=null&&<span>正确率 {(Number(current.accuracy)*100).toFixed(0)}%</span>}</div><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-1 p-1 rounded-xl bg-stone-100 w-fit"><button onClick={()=>setMode('lesson')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${mode==='lesson'?'bg-white text-stone-900 shadow-sm':'text-stone-500'}`}>精讲模式</button><button onClick={()=>setMode('full')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${mode==='full'?'bg-white text-stone-900 shadow-sm':'text-stone-500'}`}>完整讲义</button></div><button onClick={startPractice} className="px-3 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold inline-flex items-center gap-1.5"><Play className="w-3.5 h-3.5"/>按这个方法练 5 题</button></div></header>

        {auxWarning&&<div className="mx-5 md:mx-9 mt-5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">{auxWarning}。正文阅读仍可继续。</div>}
        {loading&&<div className="p-16 text-center text-sm text-stone-400">正在整理本节阅读结构…</div>}
        {!loading&&reading&&<div className="px-5 py-7 md:px-9 md:py-10"><div className="max-w-[820px] mx-auto">
          {mode==='lesson'&&<><section className="mb-9"><div className="flex items-center gap-2 text-[11px] font-bold text-stone-500 mb-3"><Target className="w-4 h-4"/>本节定位</div><p className="text-lg md:text-xl font-semibold leading-8 text-stone-900">{reading.profile.positioning||'恢复本节的识别入口、主方法和考场调用链。'}</p></section><section className="mb-9 grid grid-cols-1 md:grid-cols-2 gap-5"><div><div className="text-[11px] font-bold text-stone-500 mb-3">这一节真正要抓住的</div><ol className="space-y-3">{(reading.profile.priority||[]).map((x,i)=><li key={i} className="flex gap-3"><span className="w-6 h-6 rounded-full bg-stone-900 text-white text-[10px] font-mono flex items-center justify-center flex-shrink-0">{i+1}</span><span className="text-sm leading-6 text-stone-800">{x}</span></li>)}</ol></div><div><div className="text-[11px] font-bold text-stone-500 mb-3">考场调用链</div><div className="space-y-2">{(reading.profile.exam_route||[]).map((x,i)=><div key={i} className="flex items-center gap-2 text-sm text-stone-800"><span className="text-amber-700 font-mono text-[10px]">{String(i+1).padStart(2,'0')}</span><ChevronRight className="w-3 h-3 text-stone-300"/><span>{x}</span></div>)}</div></div></section>{lenses.length>0&&<section className="mb-10"><div className="flex items-center gap-2 text-[11px] font-bold text-stone-500 mb-3"><Sparkles className="w-4 h-4 text-amber-600"/>Skill 讲法 · 本节侧重</div><div className="space-y-3">{lenses.map((lens,i)=><div key={`${lens.label}-${i}`} className="pl-4 border-l-2 border-amber-300 py-1"><div className="flex flex-wrap items-center justify-between gap-2"><div><span className="text-xs font-bold text-stone-900">{lens.label}</span><span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">二级整理</span></div>{currentUnit&&<button disabled={busy===`adopt-${lens.label}`} onClick={()=>void adopt(lens.label)} className={`px-2 py-1 rounded-lg text-[10px] border ${adopted?.method_label===lens.label&&adopted?.status==='adopted'?'bg-stone-900 text-white border-stone-900':'bg-white border-stone-200 text-stone-600'}`}>{adopted?.method_label===lens.label&&adopted?.status==='adopted'?'已采用':'采用此讲法'}</button>}</div><p className="mt-1.5 text-sm leading-6 text-stone-700">{lens.focus}</p><div className="mt-1 text-[9px] text-stone-400">来源：{lens.source}</div></div>)}</div><p className="mt-3 text-[10px] text-stone-400 leading-5">{reading.evidence_policy}</p></section>}</>}
          <div className="space-y-10">{sections.map(section=><section id={`lesson-${section.id}`} key={section.id} className="scroll-mt-6"><div className="flex items-center gap-2 mb-3"><span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">{kindLabel[section.kind]||'讲义'}</span><h2 className="text-lg font-bold text-stone-950">{section.title}</h2></div><div className="knowledge-reader prose prose-stone max-w-none prose-p:text-[14px] prose-p:leading-7 prose-li:text-[14px] prose-li:leading-7 prose-headings:tracking-tight prose-strong:text-stone-950"><Markdown>{section.body}</Markdown></div></section>)}</div>
          {mode==='lesson'&&<section className="mt-12 pt-8 border-t border-stone-200 grid grid-cols-1 md:grid-cols-2 gap-5"><div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200"><div className="flex items-center gap-2 text-xs font-bold text-rose-950 mb-3"><TriangleAlert className="w-4 h-4"/>不要这样做</div><ul className="space-y-2">{(reading.profile.avoid||[]).map((x,i)=><li key={i} className="text-xs leading-5 text-rose-900">• {x}</li>)}</ul></div><div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200"><div className="flex items-center gap-2 text-xs font-bold text-emerald-950 mb-3"><GraduationCap className="w-4 h-4"/>这节怎么练</div><ul className="space-y-2">{(reading.profile.training||[]).map((x,i)=><li key={i} className="text-xs leading-5 text-emerald-900">• {x}</li>)}</ul></div></section>}
        </div></div>}
        {!loading&&!reading&&fallbackBody&&<div className="px-5 py-8 md:px-9 md:py-10"><div className="max-w-[820px] mx-auto"><div className="mb-4 text-xs text-amber-800">阅读结构暂不可用，已自动回退到原始笔记正文。</div><div className="knowledge-reader prose prose-stone max-w-none"><Markdown>{fallbackBody}</Markdown></div></div></div>}
        {!loading&&!reading&&!fallbackBody&&<div className="p-10 text-center text-sm text-rose-700">知识正文加载失败：{readingError||'暂无可用正文'}</div>}
      </article>:<div className="p-16 bg-white border border-stone-200 rounded-3xl text-center text-sm text-stone-400">请选择一个考点</div>}</main>

      <aside className="space-y-3 xl:sticky xl:top-3">
        {current&&<div className="bg-white border border-stone-200 rounded-2xl p-3"><div className="text-[10px] font-semibold text-stone-500 mb-2">掌握状态</div><div className="space-y-1">{(['unlearned','learning','recovered','stable','mastered'] as MasteryState[]).map(st=>{const active=current.mastery===st;return <button key={st} onClick={()=>void updateNodeMastery(current.slug,st)} className={`w-full px-2.5 py-2 rounded-lg flex items-center justify-between text-[11px] ${active?'bg-stone-900 text-white':'text-stone-600 hover:bg-stone-50'}`}><span>{masteryLabel[st].label}</span>{active&&<Check className="w-3.5 h-3.5 text-emerald-400"/>}</button>})}</div></div>}
        {experience&&currentUnit&&<div className="bg-white border border-stone-200 rounded-2xl p-3"><div className="text-[10px] font-semibold text-stone-500 mb-2">当前情形</div>{experience.units.length>1&&<select value={currentUnit.id} onChange={e=>setUnitId(e.target.value)} className="w-full mb-3 px-2 py-1.5 rounded-lg border border-stone-200 bg-white text-[10px]">{experience.units.map(u=><option key={u.id} value={u.id}>{u.title}</option>)}</select>}<div className="text-[11px] leading-5 text-stone-800"><span className="font-semibold">信号：</span>{currentUnit.trigger}</div><div className="mt-2 text-[11px] leading-5 text-stone-700"><span className="font-semibold">动作：</span>{currentUnit.action}</div>{currentUnit.stop&&<div className="mt-2 text-[10px] leading-5 text-stone-500"><span className="font-semibold">止损：</span>{currentUnit.stop}</div>}<div className="mt-3 pt-3 border-t border-stone-100"><div className="text-[10px] font-semibold text-stone-500 mb-2">补充层</div><div className="flex flex-wrap gap-1.5">{expansionTypes.map(type=><button key={type} disabled={!!busy} onClick={()=>void generate(type)} className="px-2 py-1 rounded-lg border border-stone-200 bg-stone-50 text-[10px] text-stone-600 hover:bg-stone-100">{busy===`expand-${type}`?'生成中…':`+ ${type}`}</button>)}<button disabled={!!busy} onClick={()=>{const text=window.prompt('写下你的批注');if(text)void generate('我的批注',text)}} className="px-2 py-1 rounded-lg border border-stone-200 bg-white text-[10px] text-stone-600"><Plus className="w-3 h-3 inline"/> 批注</button></div>{expansions.length>0&&<div className="mt-3 space-y-2 max-h-64 overflow-y-auto">{expansions.map(row=><div key={row.id} className="p-2 rounded-lg bg-stone-50 border border-stone-100"><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-semibold text-stone-500">{row.type} · {row.source}</span><div className="flex gap-1"><button disabled={busy===row.id||row.status==='adopted'} onClick={()=>void mutate(row.id,'adopt')} className="text-[9px] text-stone-500 hover:text-stone-900">采纳</button><button disabled={busy===row.id} onClick={()=>void mutate(row.id,'delete')} className="text-stone-400 hover:text-rose-700"><Trash2 className="w-3 h-3"/></button></div></div><div className="mt-1 text-[10px] leading-5 text-stone-700 whitespace-pre-wrap">{row.text}</div></div>)}</div>}</div></div>}
        {reading&&<div className="bg-white border border-stone-200 rounded-2xl p-3"><div className="flex items-center gap-1.5 text-[10px] font-semibold text-stone-500 mb-2"><ListTree className="w-3.5 h-3.5"/>本节目录</div><div className="max-h-[38vh] overflow-y-auto space-y-0.5">{sections.map((s,i)=><button key={s.id} onClick={()=>scrollTo(s.id)} className="w-full px-2 py-1.5 rounded-lg text-left text-[10px] text-stone-600 hover:bg-stone-50 hover:text-stone-900"><span className="font-mono text-stone-300 mr-1.5">{String(i+1).padStart(2,'0')}</span>{s.title}</button>)}</div></div>}
        {experience&&<div className="bg-white border border-stone-200 rounded-2xl p-3"><div className="text-[10px] font-semibold text-stone-500 mb-2">真实训练证据</div><div className="grid grid-cols-2 gap-2 text-center"><div className="rounded-xl bg-stone-50 p-2"><div className="text-sm font-bold text-stone-900">{experience.data_band.attempts}</div><div className="text-[9px] text-stone-500">已做题</div></div><div className="rounded-xl bg-stone-50 p-2"><div className="text-sm font-bold text-stone-900">{experience.data_band.accuracy==null?'—':`${Math.round(experience.data_band.accuracy*100)}%`}</div><div className="text-[9px] text-stone-500">正确率</div></div></div><button onClick={startPractice} className="mt-2 w-full px-3 py-2 rounded-xl bg-stone-900 text-white text-[10px] font-semibold inline-flex items-center justify-center gap-1"><Play className="w-3 h-3"/>立即练 5 题验证</button></div>}
        <div className="p-3 rounded-2xl bg-stone-900 text-stone-200"><div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-300"><BookOpen className="w-3.5 h-3.5"/>阅读原则</div><p className="mt-2 text-[10px] leading-5 text-stone-400">正文始终优先可读；推荐、个人统计、AI 扩写都是增强层，任何增强层异常都不再阻断知识库。</p></div>
      </aside>
    </div>
  </div>;
};
