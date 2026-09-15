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

  const directoryPanel=<div className="flex h-full min-h-0 flex-col bg-white">
    <div className="border-b border-[#d0d7de] p-4">
      <div className="flex items-center justify-between gap-3"><div><div className="text-[12px] font-semibold text-[#1f2328]">方法索引</div><div className="mt-0.5 text-[11px] text-[#6e7781]">模块 → 题型 → 方法</div></div><button onClick={()=>setDirectoryOpen(false)} className="xl:hidden rounded-md p-1.5 text-[#57606a] hover:bg-[#f6f8fa]"><X className="h-4 w-4"/></button></div>
      <div className="relative mt-3"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8c959f]"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="搜索方法、口诀、识别信号" className="w-full rounded-md border border-[#d0d7de] bg-white py-2 pl-9 pr-3 text-[12px] outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]"/></div>
    </div>
    <div className="border-b border-[#d0d7de] p-3"><div className="flex flex-wrap gap-1.5">{directory.map(group=><button key={group.name} onClick={()=>chooseModule(group.name)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${module===group.name?'bg-[#ddf4ff] text-[#0969da]':'text-[#57606a] hover:bg-[#f6f8fa]'}`}>{tZen(group.name,zenMode)} <span className="ml-1 text-[#8c959f]">{group.count}</span></button>)}</div><div className="mt-2 flex flex-wrap gap-1">{categories.map(cat=><button key={cat.name} onClick={()=>chooseCategory(cat.name)} className={`rounded-md px-2 py-1 text-[11px] ${category===cat.name?'bg-[#f6f8fa] font-semibold text-[#1f2328] border border-[#d0d7de]':'text-[#6e7781] hover:text-[#1f2328]'}`}>{cat.name}</button>)}</div></div>
    <div className="flex items-center gap-1 border-b border-[#d0d7de] p-2">{filters.map(f=><button key={f.id} onClick={()=>setFilter(f.id)} className={`rounded-md px-2 py-1.5 text-[11px] ${filter===f.id?'bg-[#24292f] text-white':'text-[#57606a] hover:bg-[#f6f8fa]'}`}>{f.label}</button>)}</div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2"><div className="mb-2 px-2 text-[11px] text-[#6e7781]">{list.length} 个方法</div>{list.map(m=><button key={m.id} onClick={()=>chooseMethod(m.id)} className={`mb-1 flex w-full items-start gap-2 rounded-md px-3 py-2.5 text-left ${selectedId===m.id?'bg-[#ddf4ff] text-[#0969da]':'text-[#24292f] hover:bg-[#f6f8fa]'}`}><div className="min-w-0 flex-1"><div className="text-[12px] font-semibold leading-5">{m.title}</div><div className="mt-0.5 truncate font-mono text-[10px] text-[#8c959f]">{m.id}</div></div><ChevronRight className="mt-1 h-3.5 w-3.5 flex-none opacity-60"/></button>)}</div>
  </div>;

  if(!current)return <WorkspacePage id="view-methods"><Surface pad="lg" className="text-center text-xs text-[#6e7781]">从方法索引选择一个方法</Surface></WorkspacePage>;
  const detailText=detailTab==='principle'?current.principle:detailTab==='example'?(current.example||'暂无实战例证'):detailTab==='boundary'?(current.boundary||'暂无边界说明'):`来源：${current.source_note||'—'}${current.evidence?`\n\n证据：${current.evidence}`:''}`;

  return <WorkspacePage id="view-methods" className="!p-0">
    {directoryOpen&&<><button aria-label="关闭方法目录" onClick={()=>setDirectoryOpen(false)} className="fixed inset-0 z-40 bg-black/20 xl:hidden"/><aside className="fixed bottom-0 left-0 top-0 z-50 w-[min(340px,88vw)] border-r border-[#d0d7de] shadow-2xl xl:hidden">{directoryPanel}</aside></>}
    <div className="grid min-h-[calc(100vh-65px)] xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 border-r border-[#d0d7de] bg-white xl:block xl:sticky xl:top-0 xl:h-[calc(100vh-65px)]">{directoryPanel}</aside>
      <main className="min-w-0 px-4 py-5 md:px-6 lg:px-8">
        <div className="mx-auto max-w-[1040px]">
          <div className="mb-4 flex items-center justify-between gap-3 xl:hidden"><QuietButton onClick={()=>setDirectoryOpen(true)}><Menu className="h-4 w-4"/>方法索引</QuietButton><span className="text-[11px] text-[#6e7781]">{module} · {category}</span></div>

          <header className="border-b border-[#d0d7de] pb-5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#57606a]"><span className="rounded-md bg-[#f6f8fa] px-2 py-1 font-mono border border-[#d0d7de]">{current.id}</span><span>{current.module}</span><span>·</span><span>{current.category}</span></div>
            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-[#1f2328] md:text-[34px]">{current.title}</h1><p className="mt-2 max-w-[760px] text-[14px] leading-7 text-[#57606a]">{current.definition}</p></div><CopyButton text={copyCurrent} label="复制方法" className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-3 py-2 text-[12px]"/></div>
          </header>

          <section className="mt-5 rounded-xl border border-[#d0d7de] bg-white p-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,.8fr)]">
              <div><div className="text-[12px] font-semibold text-[#57606a]">考场调用口令</div><div className="mt-2 text-[19px] font-semibold leading-8 text-[#1f2328]">{current.exam_command||'暂无固定口令，按识别信号进入执行链。'}</div></div>
              <div className="border-t border-[#d8dee4] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"><div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#57606a]"><Lightbulb className="h-4 w-4"/>什么时候该想到它</div><div className="flex flex-wrap gap-1.5">{current.signals.length?current.signals.map((s,i)=><span key={i} className="rounded-md bg-[#f6f8fa] px-2.5 py-1.5 text-[11px] leading-5 text-[#24292f] border border-[#d8dee4]">{s}</span>):<span className="text-[12px] text-[#6e7781]">暂无识别信号</span>}</div></div>
            </div>
          </section>

          <section className="mt-5 rounded-xl border border-[#d0d7de] bg-white p-5">
            <div className="mb-4 flex items-center gap-2"><Route className="h-4 w-4 text-[#0969da]"/><h2 className="text-[14px] font-semibold text-[#1f2328]">考场执行顺序</h2></div>
            <div className="grid gap-2 md:grid-cols-2">{current.steps.length?current.steps.map((s,i)=><div key={i} className="flex gap-3 rounded-lg border border-[#d8dee4] bg-[#f6f8fa] p-3"><span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#0969da] text-[10px] font-semibold text-white">{i+1}</span><div className="text-[12px] leading-6 text-[#24292f]">{s}</div></div>):<div className="text-[12px] text-[#6e7781]">暂无执行步骤</div>}</div>
          </section>

          <section className="mt-5 overflow-hidden rounded-xl border border-[#d0d7de] bg-white">
            <div className="flex overflow-x-auto border-b border-[#d0d7de] bg-[#f6f8fa] px-2 pt-2">{detailTabs.map(tab=>{const Icon=tab.icon;return <button key={tab.id} onClick={()=>setDetailTab(tab.id)} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-2 text-[12px] font-semibold ${detailTab===tab.id?'border border-b-white border-[#d0d7de] bg-white text-[#1f2328] -mb-px':'text-[#57606a] hover:text-[#1f2328]'}`}><Icon className="h-3.5 w-3.5"/>{tab.label}</button>})}</div>
            <div className="p-5 md:p-6"><div className="whitespace-pre-wrap text-[14px] leading-7 text-[#24292f]">{detailText}</div></div>
          </section>

          <div className="mt-4 flex justify-end"><PrimaryButton onClick={()=>window.dispatchEvent(new CustomEvent('gongkao:start-practice',{detail:{node_slug:current.node_slug||null,title:`${current.title} · 方法验证`,limit:5,estimated_minutes:8,force:false}}))}><Compass className="h-4 w-4"/>练 5 题验证</PrimaryButton></div>
        </div>
      </main>
    </div>
  </WorkspacePage>;
};
