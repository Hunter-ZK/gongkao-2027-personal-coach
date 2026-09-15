import React,{useMemo,useState} from 'react';
import {Play,Pause,Square,EyeOff,Eye,HelpCircle,Calendar,Sparkles,Menu,Timer,ChevronDown} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {tZen} from '../../utils/zen';

const fmt=(sec:number)=>`${Math.floor(sec/3600).toString().padStart(2,'0')}:${Math.floor((sec%3600)/60).toString().padStart(2,'0')}:${(sec%60).toString().padStart(2,'0')}`;
const localDate=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const durationLabel=(sec:number)=>sec<3600?`${Math.round(sec/60)} 分钟`:`${(sec/3600).toFixed(1)} 小时`;

export const Header:React.FC<{onOpenShortcuts:()=>void;onOpenSidebar?:()=>void}>=({onOpenShortcuts,onOpenSidebar})=>{
  const{exams,timerState,startTimer,pauseTimer,resumeTimer,stopTimer,sessions,setActiveTab,zenMode,toggleZenMode}=useApp();
  const[gd,national]=exams;const[showTimer,setShowTimer]=useState(false);const openAi=()=>window.dispatchEvent(new CustomEvent('gongkao:open-ai'));
  const stats=useMemo(()=>{const now=new Date();const today=localDate(now);const day=(now.getDay()+6)%7;const monday=new Date(now);monday.setDate(now.getDate()-day);const weekStart=localDate(monday);const todaySec=sessions.filter(s=>s.date===today).reduce((a,s)=>a+Number(s.durationSec||0),0);const weekSec=sessions.filter(s=>s.date>=weekStart&&s.date<=today).reduce((a,s)=>a+Number(s.durationSec||0),0);return{todaySec,weekSec}},[sessions]);
  const primary=async()=>{if(timerState.status==='idle')await startTimer();else if(timerState.status==='running')await pauseTimer();else await resumeTimer()};

  return <header id="app-header" className="sticky top-0 z-30 h-14 border-b backdrop-blur-xl" style={{background:'color-mix(in srgb, var(--wb-surface) 92%, transparent)',borderColor:'var(--wb-border)'}}>
    <div className="flex h-full items-center justify-between gap-4 px-3 md:px-4 lg:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        {onOpenSidebar&&<button onClick={onOpenSidebar} className="wb-focus-ring md:hidden rounded-[8px] p-2" style={{color:'var(--wb-text-2)'}}><Menu className="h-4.5 w-4.5"/></button>}
        <button onClick={()=>setActiveTab('dashboard')} className="group flex min-w-0 items-center gap-2.5 text-left">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] text-[12px] font-semibold text-white" style={{background:'var(--wb-accent)',boxShadow:'var(--wb-shadow-sm)'}}>27</span>
          <span className="min-w-0"><span className="block truncate text-[13px] font-semibold tracking-[-0.015em]" style={{color:'var(--wb-text)'}}>{tZen('公考备考工作台',zenMode)}</span><span className="hidden truncate text-[10px] sm:block" style={{color:'var(--wb-text-3)'}}>{zenMode?'Work Notes':'2027 · PERSONAL COACH'}</span></span>
        </button>
        <div className="ml-2 hidden items-center gap-1.5 xl:flex">
          {gd&&<span className="inline-flex items-center gap-1.5 rounded-[7px] px-2 py-1 text-[10px] font-medium" style={{background:'var(--wb-surface-subtle)',color:'var(--wb-text-2)',border:'1px solid var(--wb-border)'}}><Calendar className="h-3 w-3"/>{tZen('广东省考',zenMode)} <b className="font-mono font-semibold" style={{color:'var(--wb-text)'}}>{gd.daysLeft}</b>天</span>}
          {national&&<span className="inline-flex items-center gap-1.5 rounded-[7px] px-2 py-1 text-[10px] font-medium" style={{background:'var(--wb-surface-subtle)',color:'var(--wb-text-2)',border:'1px solid var(--wb-border)'}}><Calendar className="h-3 w-3"/>{tZen('国考副省级',zenMode)} <b className="font-mono font-semibold" style={{color:'var(--wb-text)'}}>{national.daysLeft}</b>天</span>}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="relative">
          <button id="btn-compact-timer" onClick={()=>setShowTimer(v=>!v)} className="wb-focus-ring inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[11px] font-medium" style={{background:timerState.status==='running'?'var(--wb-success-soft)':timerState.status==='paused'?'var(--wb-warning-soft)':'var(--wb-surface-subtle)',color:timerState.status==='running'?'var(--wb-success)':timerState.status==='paused'?'var(--wb-warning)':'var(--wb-text-2)',border:'1px solid var(--wb-border)'}}>
            <Timer className="h-3.5 w-3.5"/><span className="hidden lg:inline">{timerState.status==='idle'?'专注计时':fmt(timerState.elapsedSec)}</span>{timerState.status!=='idle'&&<span className="h-1.5 w-1.5 rounded-full" style={{background:timerState.status==='running'?'var(--wb-success)':'var(--wb-warning)'}}/>}<ChevronDown className="hidden h-3 w-3 opacity-60 lg:block"/>
          </button>
          {showTimer&&<div id="compact-timer-popover" className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-[12px] border" style={{background:'var(--wb-surface)',borderColor:'var(--wb-border)',boxShadow:'var(--wb-shadow-md)'}}>
            <div className="border-b p-4" style={{borderColor:'var(--wb-border)',background:'var(--wb-surface-subtle)'}}><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-semibold tracking-[0.1em]" style={{color:'var(--wb-text-3)'}}>FOCUS TIMER</div><div className="mt-1 font-mono text-3xl font-semibold tracking-[-0.04em]" style={{color:'var(--wb-text)'}}>{fmt(timerState.elapsedSec)}</div><div className="mt-1 text-[10px]" style={{color:'var(--wb-text-2)'}}>{timerState.currentModule} · {timerState.currentActivity}</div></div><span className="rounded-[6px] px-2 py-1 text-[9px] font-semibold" style={{background:timerState.status==='running'?'var(--wb-success-soft)':timerState.status==='paused'?'var(--wb-warning-soft)':'var(--wb-surface-hover)',color:timerState.status==='running'?'var(--wb-success)':timerState.status==='paused'?'var(--wb-warning)':'var(--wb-text-2)'}}>{timerState.status==='running'?'进行中':timerState.status==='paused'?'已暂停':'未开始'}</span></div></div>
            <div className="p-4"><div className="grid grid-cols-2 gap-2"><div className="rounded-[8px] p-3" style={{background:'var(--wb-surface-subtle)'}}><div className="text-[9px]" style={{color:'var(--wb-text-3)'}}>今日累计</div><div className="mt-1 text-sm font-semibold" style={{color:'var(--wb-text)'}}>{durationLabel(stats.todaySec)}</div></div><div className="rounded-[8px] p-3" style={{background:'var(--wb-surface-subtle)'}}><div className="text-[9px]" style={{color:'var(--wb-text-3)'}}>本周累计</div><div className="mt-1 text-sm font-semibold" style={{color:'var(--wb-text)'}}>{durationLabel(stats.weekSec)}</div></div></div><div className="mt-3 flex gap-2"><button onClick={primary} className="flex-1 rounded-[8px] px-3 py-2.5 text-xs font-semibold text-white" style={{background:'var(--wb-accent)'}}>{timerState.status==='running'?<><Pause className="mr-1.5 inline h-3.5 w-3.5"/>暂停</>:<><Play className="mr-1.5 inline h-3.5 w-3.5"/>{timerState.status==='paused'?'继续':'开始'}</>}</button>{timerState.status!=='idle'&&<button onClick={async()=>{await stopTimer();setShowTimer(false)}} className="rounded-[8px] px-3 py-2.5 text-xs font-semibold" style={{background:'var(--wb-danger-soft)',color:'var(--wb-danger)'}}><Square className="mr-1.5 inline h-3.5 w-3.5"/>结束</button>}</div></div>
          </div>}
        </div>
        <button id="btn-zen-mode" onClick={toggleZenMode} className="wb-focus-ring rounded-[8px] border p-2" style={{background:zenMode?'var(--wb-accent-soft)':'transparent',color:zenMode?'var(--wb-accent-text)':'var(--wb-text-2)',borderColor:zenMode?'color-mix(in srgb,var(--wb-accent) 30%,var(--wb-border))':'transparent'}} title="隐藏模式：深色界面 (Alt+Z)">{zenMode?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</button>
        <button id="btn-header-coach" onClick={openAi} className="wb-focus-ring inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold" style={{background:'var(--wb-purple-soft)',color:'var(--wb-purple)',border:'1px solid color-mix(in srgb,var(--wb-purple) 20%,var(--wb-border))'}}><Sparkles className="h-3.5 w-3.5"/><span className="hidden sm:inline">{tZen('AI 助手',zenMode)}</span></button>
        <button id="btn-shortcuts" onClick={onOpenShortcuts} className="wb-focus-ring rounded-[8px] p-2" style={{color:'var(--wb-text-3)'}}><HelpCircle className="h-4 w-4"/></button>
      </div>
    </div>
  </header>;
};
