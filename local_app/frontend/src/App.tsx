import React,{useEffect,useState} from 'react';
import {AppProvider,useApp} from './context/AppContext';
import {Header} from './components/layout/Header';
import {Sidebar} from './components/layout/Sidebar';
import {QuestionModal} from './components/common/QuestionModal';
import {ShortcutsModal} from './components/common/ShortcutsModal';
import {GlobalAiDrawer} from './components/common/GlobalAiDrawer';
import {PracticeRunner} from './components/common/PracticeRunner';
import {BackgroundStatusBadge} from './components/common/BackgroundStatusBadge';
import {DashboardView} from './components/views/DashboardView';
import {TodayTasksView} from './components/views/TodayTasksView';
import {TrainingsView} from './components/views/TrainingsView';
import {MistakesView} from './components/views/MistakesView';
import {ReviewView} from './components/views/ReviewView';
import {ImportView} from './components/views/ImportView';
import {KnowledgeView} from './components/views/KnowledgeView';
import {ShenlunView} from './components/views/ShenlunView';
import {MethodsView} from './components/views/MethodsView';
import {CoachView} from './components/views/CoachView';
import {WeekPlanView} from './components/views/WeekPlanView';
import {StudyAnalyticsView} from './components/views/StudyAnalyticsView';
import {ProgressView} from './components/views/ProgressView';

const AppContent:React.FC=()=>{const{activeTab,timerState,pauseTimer,resumeTimer,toggleZenMode,loading,loadError,warnings}=useApp();const[sidebarOpen,setSidebarOpen]=useState(false);const[shortcutsOpen,setShortcutsOpen]=useState(false);
useEffect(()=>{const fn=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;if(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)return;if(e.altKey&&e.key.toLowerCase()==='a'){e.preventDefault();window.dispatchEvent(new CustomEvent('gongkao:open-ai'))}else if(e.key==='?'||(e.shiftKey&&e.key==='/')){e.preventDefault();setShortcutsOpen(v=>!v)}else if(e.key.toLowerCase()==='z'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();toggleZenMode()}else if(e.key.toLowerCase()==='t'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();if(timerState.status==='running')void pauseTimer();else if(timerState.status==='paused')void resumeTimer();}};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn)},[timerState.status,pauseTimer,resumeTimer,toggleZenMode]);
if(loading)return <div className="min-h-screen bg-[#e7ebef] flex items-center justify-center text-sm font-medium text-[#37404a]">正在载入个人备考数据...</div>;
if(loadError)return <div className="min-h-screen bg-[#e7ebef] flex items-center justify-center p-8"><div className="max-w-xl rounded-xl bg-white p-6 text-sm text-[#b4232c] border border-[#d27a7f] shadow-lg"><div className="font-semibold mb-2">工作台核心数据载入失败</div><div>{loadError}</div><button onClick={()=>location.reload()} className="mt-4 rounded-md bg-[#24292f] px-4 py-2 text-xs font-semibold text-white">重新载入</button></div></div>;
return <div id="workbench-shell" className="min-h-screen bg-[#e7ebef] text-[#111820] font-sans flex flex-col antialiased selection:bg-[#0969da] selection:text-white"><Header onOpenSidebar={()=>setSidebarOpen(true)} onOpenShortcuts={()=>setShortcutsOpen(true)}/><BackgroundStatusBadge/>{warnings&&warnings.length>0&&<div className="px-4 md:px-6 py-2 bg-[#fff0b8] border-b border-[#d4a72c] text-[12px] font-medium text-[#523f00]"><strong>部分辅助数据暂未加载：</strong>{warnings.slice(0,3).join('；')}{warnings.length>3?`；另有 ${warnings.length-3} 项`:''}。核心页面仍可继续使用。</div>}<div className="flex-1 flex min-h-0 overflow-hidden"><Sidebar isOpen={sidebarOpen} onClose={()=>setSidebarOpen(false)}/><main id="main-content-area" className="relative flex-1 min-w-0 overflow-y-auto overflow-x-hidden min-h-[calc(100vh-65px)] bg-[#e7ebef]">{activeTab==='dashboard'&&<DashboardView/>}{activeTab==='today'&&<TodayTasksView/>}{activeTab==='trainings'&&<TrainingsView/>}{activeTab==='mistakes'&&<MistakesView/>}{activeTab==='review'&&<ReviewView/>}{activeTab==='import'&&<ImportView/>}{activeTab==='knowledge'&&<KnowledgeView/>}{activeTab==='shenlun'&&<ShenlunView/>}{activeTab==='methods'&&<MethodsView/>}{activeTab==='coach'&&<CoachView/>}{activeTab==='weekplan'&&<WeekPlanView/>}{activeTab==='study'&&<StudyAnalyticsView/>}{activeTab==='progress'&&<ProgressView/>}</main></div><QuestionModal/><ShortcutsModal isOpen={shortcutsOpen} onClose={()=>setShortcutsOpen(false)}/><GlobalAiDrawer/><PracticeRunner/></div>};
export default function App(){return <AppProvider><AppContent/></AppProvider>}