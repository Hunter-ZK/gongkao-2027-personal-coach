import React,{useEffect,useMemo,useState} from 'react';
import {BookOpen,ChevronRight,Compass,Search,Route,ShieldAlert,Lightbulb,Menu,X,FileText,Play} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {CopyButton} from '../common/CopyButton';
import {formatMethodText} from '../../utils/copy';
import {tZen} from '../../utils/zen';
import {WorkspacePage,Surface,PrimaryButton,QuietButton} from '../common/WorkspaceUi';

type FilterMode='all'|'call'|'boundary'|'example';
type DetailTab='principle'|'example'|'boundary'|'source';
type MethodRow={id:string;title:string;module:string;category:string;definition:string;principle:string;signals:string[];steps:string[];example:string;boundary:string;exam_command:string;source_note?:string;evidence?:string;node_slug?:string|null};

export const MethodsView:React.FC=()=>{
  const{methods,zenMode}=useApp();
  const[rows,setRows]=useState<MethodRow[]>([]);const[q,setQ]=useState('');const[filter,setFilter]=useState<FilterMode>('all');const[module,setModule]=useState('');const[category,setCategory]=useState('');const[selectedId,setSelectedId]=useState('');const[directoryOpen,setDirectoryOpen]=useState(false);const[detailTab,setDetailTab]=useState<DetailTab>('principle');
  useEffect(()=>{let alive=true;fetch('/api/knowledge/methods').then(async r=>r.ok?r.json():Promise.reject()).then((data:MethodRow[])=>{if(!alive)return;setRows(data);if(data[0]){setModule(data[0].module);setCategory(data[0].category);setSelectedId(data[0].id)}}).catch(()=>{const fallback=methods.map(m=>({id:m.id,title:m.title,module:m.module,category:m.category||'未分类',definition:m.definition,principle:m.principle,signals:m.signals,steps:m.steps,example:m.example,boundary:m.boundary,exam_command:m.callCommand}));if(alive){setRows(fallback);if(fallback[0]){setModule(fallback[0].module);setCategory(fallback[0].category);setSelectedId(fallback[0].id)}}});return()=>{alive=false}},[methods]);
  const directory=useMemo(()=>{const map=new Map<string,Map<string,number>>();for(const row of rows){if(!map.has(row.module))map.set(row.module,new Map());const cats=map.get(row.module)!;cats.set(row.category,(cats.get(row.category)||0)+1)}return Array.from(map.entries()).map(([name,cats])=>({name,count:Array.from(cats.values()).reduce((a,b)=>a+b,0),children:Array.from(cats.entries()).map(([name,count])=>({name,count}))}))},[rows]);
  const categories=directory.find(x=>x.name===module)?.children||directory[0]?.children||[];
  const list=useMemo(()=>rows.filter(m=>(!module||m.module===module)&&(!category||m.category===category)&&(filter==='all'||(filter==='call'&&!!m.exam_command)||(filter==='boundary'&&!!m.boundary)||(filter==='example'&&!!m.example))&&(!q.trim()||`${m.id}\n${m.title}\n${m.definition}\n${m.principle}\n${m.signals.join('\n')}`.toLowerCase().includes(q.toLowerCase()))),[rows,module,category,filter,q]);
  useEffect(()=>{if(!list.length){setSelectedId('');return}if(!list.some(x=>x.id===selectedId))setSelectedId(list[0].id)},[list,selectedId]);
  const current=rows.find(x=>x.id===selectedId)||list[0];
  const filters:{id:FilterMode;label:string}[]=[{id:'all',label:'全部'},{id:'call',label:'有口令'},{id:'boundary',label:'有边界'},{id:'example',label:'有例证'}];
  const detailTabs:{id:DetailTab;label:string;icon:React.ComponentType<{className?:string}>}[]=[{id:'principle',label:'原理',icon:BookOpen},{id:'example',label:'例题',icon:Play},{id:'boundary',label:'边界',icon:ShieldAlert},{id:'source',label:'来源',icon:FileText}];
  const chooseModule=(m:string)=>{setModule(m);setQ('');const firstCategory=directory.find(x=>x.name===m)?.children[0]?.name||'';setCategory(firstCategory);const hit=rows.find(x=>x.module===m&&(!firstCategory||x.category===firstCategory));if(hit)setSelectedId(hit.id)};
  const chooseCategory=(c:string)=>{setCategory(c);setQ('');const hit=rows.find(x=>x.module===module&&x.category===c);if(hit)setSelectedId(hit.id)};
  const chooseMethod=(id:string)=>{setSelectedId(id);setDirectoryOpen(false);setDetailTab('principle')};
  const copyCurrent=current?formatMethodText(current):'';

  const directoryPanel=<div className="flex h-full min-h-0 flex-col bg-[#f3f5f7]">
    <div className="border-b border-[#a8b3bf] p-4">
      <div className="flex items-center justify-between gap-3"><div><div className="text-[12px] font-bold text-[#111820]">方法索引</div><div className="mt-0.5 text-[11px] text-[#49515a]">模块 → 题型 → 方法</div></div><button onClick={()=>setDirectoryOpen(false)} className="xl:hidden rounded-md p-1.5 text-[#49515a] hover:bg-[#dfe4ea]"><X className="h-4 w-4"/></button></div>
      <div className="relative mt-3"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[#59636e]"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="搜索方法、口诀、识别信号" className="w-full rounded-md border border-[#a8b3bf] bg-white py-2 pl-9 pr-3 text-[12px] text-[#111820] outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]"/></div>
    </div>
    <div className="border-b border-[#a8b3bf] p-3"><div className="flex flex-wrap gap-1.5">{directory.map(group=><button key={group.name} onClick={()=>chooseModule(group.name)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${module===group.name?'bg-[#0969da] text-white':'text-[#37404a] hover:bg-[#dfe4ea]'}`}>{tZen(group.name,zenMode)} <span className={`ml-1 ${module===group.name?'text-white/75':'text-[#59636e]'}`}>{group.count}</span></button>)}</div><div className="mt-2 flex flex-wrap gap-1">{categories.map(cat=><button key={cat.name} onClick={()=>chooseCategory(cat.name)} className={`rounded-md px-2 py-1 text-[11px] ${category===cat.name?'bg-[#24292f] font-semibold text-white':'text-[#49515a] hover:bg-[#dfe4ea] hover:text-[#111820]'}`}>{cat.name}</button>)}</div></div>
    <div className="flex items-center gap-1 border-b border-[#a8b3bf] p-2">{filters.map(f=><button key={f.id} onClick={()=>setFilter(f.id)} className={`rounded-md px-2 py-1.5 text-[11px] ${filter===f.id?'bg-[#24292f] text-white':'text-[#37404a] hover:bg-[#dfe4ea]'}`}>{f.label}</button>)}</div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2"><div className="mb-2 px-2 text-[11px] font-medium text-[#49515a]">{list.length} 个方法</div>{list.map(m=><button key={m.id} onClick={()=>chooseMethod(m.id)} className={`mb-1 flex w-full items-start gap-2 rounded-md px-3 py-2.5 text-left ${selectedId===m.id?'bg-[#0969da] text-white shadow-sm':'text-[#242b33] hover:bg-[#dfe4ea]'}`}><div className="min-w-0 flex-1"><div className="text-[12px] font-semibold leading-5">{m.title}</div><div className={`mt-0.5 truncate font-mono text-[10px] ${selectedId===m.id?'text-white/70':'text-[#59636e]'}`}>{m.id}</div></div><ChevronRight className="mt-1 h-3.5 w-3.5 flex-none opacity-70"/></button>)}</div>
  </div>;

  if(!current)return <WorkspacePage id="view-methods"><Surface pad="lg" className="text-center text-xs text-[#49515a]">从方法索引选择一个方法</Surface></WorkspacePage>;
  const detailText=detailTab==='principle'?current.principle:detailTab==='example'?(current.example||'暂无实战例证'):detailTab==='boundary'?(current.boundary||'暂无边界说明'):`来源：${current.source_note||'—'}${current.evidence?`\n\n证据：${current.evidence}`:''}`;

  return <WorkspacePage id="view-methods" className="methods-one-screen !p-0 h-[calc(100vh-65px)] overflow-hidden">
    {directoryOpen&&<><button aria-label="关闭方法目录" onClick={()=>setDirectoryOpen(false)} className="fixed inset-0 z-40 bg-black/45 xl:hidden"/><aside className="fixed bottom-0 left-0 top-0 z-50 w-[min(340px,88vw)] border-r border-[#a8b3bf] shadow-2xl xl:hidden">{directoryPanel}</aside></>}
    <div className="grid h-full xl:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 border-r border-[#a8b3bf] bg-[#f3f5f7] xl:block xl:h-full">{directoryPanel}</aside>
      <main className="h-full min-w-0 overflow-y-auto bg-[#e7ebef] lg:overflow-hidden">
        <div className="mx-auto flex min-h-full max-w-[1220px] flex-col p-4 md:p-5 lg:h-full lg:min-h-0 lg:p-6">
          <div className="mb-3 flex items-center justify-between gap-3 xl:hidden"><QuietButton onClick={()=>setDirectoryOpen(true)}><Menu className="h-4 w-4"/>方法索引</QuietButton><span className="text-[11px] font-medium text-[#49515a]">{module} · {category}</span></div>

          <header className="shrink-0 rounded-xl border border-[#a8b3bf] bg-white p-4 shadow-[0_3px_12px_rgba(31,35,40,0.08)] md:p-5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-[#49515a]"><span className="rounded-md bg-[#24292f] px-2 py-1 font-mono text-white">{current.id}</span><span>{current.module}</span><span>·</span><span>{current.category}</span></div>
            <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-[#111820] md:text-[30px]">{current.title}</h1><p className="mt-1.5 line-clamp-2 max-w-[820px] text-[13px] leading-6 text-[#49515a]">{current.definition}</p></div><CopyButton text={copyCurrent} label="复制方法" className="rounded-md border border-[#a8b3bf] bg-white px-3 py-2 text-[12px]"/></div>
          </header>

          <div className="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,.92fr)_minmax(0,1.08fr)]">
            <section className="min-h-0 overflow-y-auto rounded-xl border border-[#a8b3bf] bg-white p-5 shadow-[0_3px_12px_rgba(31,35,40,0.08)]">
              <div className="rounded-lg border border-[#79a8d8] bg-[#e2efff] p-4"><div className="text-[12px] font-bold text-[#0758b7]">考场调用口令</div><div className="mt-2 text-[18px] font-semibold leading-8 text-[#111820]">{current.exam_command||'暂无固定口令，按识别信号进入执行链。'}</div></div>
              <div className="mt-4"><div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-[#37404a]"><Lightbulb className="h-4 w-4 text-[#0969da]"/>什么时候该想到它</div><div className="flex flex-wrap gap-1.5">{current.signals.length?current.signals.map((s,i)=><span key={i} className="rounded-md bg-[#e9edf1] px-2.5 py-1.5 text-[11px] leading-5 text-[#242b33] border border-[#a8b3bf]">{s}</span>):<span className="text-[12px] text-[#49515a]">暂无识别信号</span>}</div></div>
              <div className="mt-5 border-t border-[#a8b3bf] pt-4"><div className="mb-3 flex items-center gap-2"><Route className="h-4 w-4 text-[#0969da]"/><h2 className="text-[14px] font-bold text-[#111820]">考场执行顺序</h2></div><div className="space-y-2">{current.steps.length?current.steps.map((s,i)=><div key={i} className="flex gap-3 rounded-lg border border-[#a8b3bf] bg-[#f3f5f7] p-3"><span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#0969da] text-[10px] font-semibold text-white">{i+1}</span><div className="text-[12px] leading-6 text-[#242b33]">{s}</div></div>):<div className="text-[12px] text-[#49515a]">暂无执行步骤</div>}</div></div>
            </section>

            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#a8b3bf] bg-white shadow-[0_3px_12px_rgba(31,35,40,0.08)]">
              <div className="flex shrink-0 overflow-x-auto border-b border-[#a8b3bf] bg-[#dfe4ea] px-2 pt-2">{detailTabs.map(tab=>{const Icon=tab.icon;return <button key={tab.id} onClick={()=>setDetailTab(tab.id)} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-2 text-[12px] font-semibold ${detailTab===tab.id?'border border-b-white border-[#a8b3bf] bg-white text-[#111820] -mb-px':'text-[#37404a] hover:text-[#111820]'}`}><Icon className="h-3.5 w-3.5"/>{tab.label}</button>})}</div>
              <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-6"><div className="whitespace-pre-wrap text-[14px] leading-7 text-[#242b33]">{detailText}</div></div>
              <div className="shrink-0 border-t border-[#a8b3bf] bg-[#f3f5f7] p-3.5"><div className="flex items-center justify-between gap-3"><span className="text-[11px] font-medium text-[#49515a]">详情区独立滚动，页面本身不再向下拖。</span><PrimaryButton onClick={()=>window.dispatchEvent(new CustomEvent('gongkao:start-practice',{detail:{node_slug:current.node_slug||null,title:`${current.title} · 方法验证`,limit:5,estimated_minutes:8,force:false}}))}><Compass className="h-4 w-4"/>练 5 题验证</PrimaryButton></div></div>
            </section>
          </div>
        </div>
      </main>
    </div>
  </WorkspacePage>;
};