import React,{useEffect,useState} from 'react';
import { AppProvider,useApp } from './context/AppContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { QuestionModal } from './components/common/QuestionModal';
import { ShortcutsModal } from './components/common/ShortcutsModal';
import { DashboardView } from './components/views/DashboardView';
import { TodayTasksView } from './components/views/TodayTasksView';
import { TimerView } from './components/views/TimerView';
import { TrainingsView } from './components/views/TrainingsView';
import { MistakesView } from './components/views/MistakesView';
import { ReviewView } from './components/views/ReviewView';
import { ImportView } from './components/views/ImportView';
import { KnowledgeView } from './components/views/KnowledgeView';
import { ShenlunView } from './components/views/ShenlunView';
import { MethodsView } from './components/views/MethodsView';
import { CoachView } from './components/views/CoachView';
import { WeekPlanView } from './components/views/WeekPlanView';

const AppContent:React.FC=()=>{const{activeTab,timerState,pauseTimer,resumeTimer,toggleZenMode,loading,loadError}=useApp();const[sidebarOpen,setSidebarOpen]=useState(false);const[shortcutsOpen,setShortcutsOpen]=useState(false);
useEffect(()=>{const fn=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;if(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)return;if(e.key==='?'||(e.shiftKey&&e.key==='/')){e.preventDefault();setShortcutsOpen(v=>!v)}else if(e.key.toLowerCase()==='z'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();toggleZenMode()}else if(e.key.toLowerCase()==='t'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();if(timerState.status==='running')pauseTimer();else if(timerState.status==='paused')resumeTimer();}};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn)},[timerState.status,pauseTimer,resumeTimer,toggleZenMode]);
if(loading)return <div className="min-h-screen bg-stone-100 flex items-center justify-center text-sm text-stone-600">正在载入个人备考数据...</div>;
if(loadError)return <div className="min-h-screen bg-stone-100 flex items-center justify-center p-8"><div className="bg-white border border-rose-200 rounded-2xl p-6 text-sm text-rose-800">工作台数据载入失败：{loadError}</div></div>;
return <div className="min-h-screen bg-stone-100/70 text-stone-900 font-sans flex flex-col antialiased selection:bg-amber-200 selection:text-stone-900"><Header onOpenSidebar={()=>setSidebarOpen(true)} onOpenShortcuts={()=>setShortcutsOpen(true)}/><div className="flex-1 flex overflow-hidden"><Sidebar isOpen={sidebarOpen} onClose={()=>setSidebarOpen(false)}/><main id="main-content-area" className="flex-1 overflow-y-auto overflow-x-hidden min-h-[calc(100vh-65px)] bg-stone-100/60">{activeTab==='dashboard'&&<DashboardView/>}{activeTab==='today'&&<TodayTasksView/>}{activeTab==='timer'&&<TimerView/>}{activeTab==='trainings'&&<TrainingsView/>}{activeTab==='mistakes'&&<MistakesView/>}{activeTab==='review'&&<ReviewView/>}{activeTab==='import'&&<ImportView/>}{activeTab==='knowledge'&&<KnowledgeView/>}{activeTab==='shenlun'&&<ShenlunView/>}{activeTab==='methods'&&<MethodsView/>}{activeTab==='coach'&&<CoachView/>}{activeTab==='weekplan'&&<WeekPlanView/>}</main></div><QuestionModal/><ShortcutsModal isOpen={shortcutsOpen} onClose={()=>setShortcutsOpen(false)}/></div>};
export default function App(){return <AppProvider><AppContent/></AppProvider>}
