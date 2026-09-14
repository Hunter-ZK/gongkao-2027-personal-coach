import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import confetti from 'canvas-confetti';
import type { Exam, PaperModule, Phase, WeekPlan, KnowledgeNode, MethodItem, Question, TrainingRecord, MistakeItem, TaskItem, StudySession, UserSettings, MasteryState } from '../types';

export interface TimerState {
  status: 'idle' | 'running' | 'paused';
  mode: 'stopwatch' | 'pomodoro';
  elapsedSec: number;
  targetSec: number;
  currentModule: string;
  currentActivity: string;
  note: string;
  startTime: number | null;
}

type Bootstrap = {
  exams: Exam[]; modules: PaperModule[]; phases: Phase[]; weekPlans: WeekPlan[];
  knowledgeNodes: KnowledgeNode[]; methods: MethodItem[]; questions: Question[];
  trainings: TrainingRecord[]; mistakes: MistakeItem[]; tasks: TaskItem[];
  sessions: StudySession[]; settings: UserSettings;
};

interface AppContextType extends Bootstrap {
  activeTab:string; setActiveTab:(tab:string)=>void;
  activeKnowledgeSlug:string|null; setActiveKnowledgeSlug:(slug:string|null)=>void;
  selectedQuestionId:number|null; setSelectedQuestionId:(id:number|null)=>void;
  weekPlan:WeekPlan|any; zenMode:boolean; loading:boolean; loadError:string|null; refresh:()=>Promise<void>;
  timerState:TimerState;
  startTimer:(module?:string,activity?:string,mode?:'stopwatch'|'pomodoro',targetSec?:number)=>Promise<void>;
  pauseTimer:()=>Promise<void>; resumeTimer:()=>Promise<void>; stopTimer:(note?:string)=>Promise<void>; resetTimer:()=>Promise<void>;
  setTimerModule:(m:string)=>void; setTimerActivity:(a:string)=>void;
  toggleTask:(id:string)=>Promise<void>; addTask:(task:Omit<TaskItem,'id'|'date'|'status'>)=>Promise<void>;
  updateNodeMastery:(slug:string,mastery:MasteryState)=>Promise<void>;
  answerReviewQuestion:(mistakeId:number,userChoice:string,isCorrect:boolean)=>Promise<void>;
  recordTraining:(training:Omit<TrainingRecord,'id'>,questions:Question[],mistakes:Omit<MistakeItem,'id'>[])=>void;
  toggleZenMode:()=>void; updateSettings:(s:Partial<UserSettings>)=>void; resetToDefaults:()=>void;
  exportDataJson:()=>string; importDataJson:(s:string)=>boolean;
}

const emptySettings: UserSettings = { deepThresholdMin:30, focusThresholdMin:15, weeklyTargetHours:22, targetScores:{guangdong:{xingce:90,shenlun:80},national:{xingce:70,shenlun:70}}, reviewIntervalsDays:[1,3,7,15,30], zenMode:false };
const empty: Bootstrap = { exams:[],modules:[],phases:[],weekPlans:[],knowledgeNodes:[],methods:[],questions:[],trainings:[],mistakes:[],tasks:[],sessions:[],settings:emptySettings };
const TAB_PATH:Record<string,string>={dashboard:'/',today:'/today',timer:'/timer',trainings:'/trainings',mistakes:'/mistakes',review:'/review',import:'/import',knowledge:'/knowledge',shenlun:'/shenlun',methods:'/methods',coach:'/coach',weekplan:'/plan'};
const PATH_TAB:Record<string,string>=Object.fromEntries(Object.entries(TAB_PATH).map(([k,v])=>[v,k]));
const activityToApi=(v:string)=>({真题训练:'刷题训练',专项任务:'限时专项',模考测试:'整卷',总结复盘:'复盘整理'} as Record<string,string>)[v]||v;
const activityFromApi=(v:string)=>({刷题训练:'真题训练',限时专项:'真题训练',整卷:'模考测试',复盘整理:'总结复盘'} as Record<string,string>)[v]||v;

async function jsonFetch<T=any>(url:string, init?:RequestInit):Promise<T>{
  const res=await fetch(url,{...init,headers:{...(init?.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(init?.headers||{})}});
  if(!res.ok){let msg=`HTTP ${res.status}`;try{const p=await res.json();msg=p?.error?.message||p?.detail||msg;}catch{}throw new Error(msg)}
  return res.json();
}

const AppContext=createContext<AppContextType|undefined>(undefined);

export const AppProvider:React.FC<{children:ReactNode}>=({children})=>{
  const [data,setData]=useState<Bootstrap>(empty); const [loading,setLoading]=useState(true); const [loadError,setLoadError]=useState<string|null>(null);
  const path=window.location.pathname; const [activeTabState,setActiveTabState]=useState(PATH_TAB[path]||'dashboard');
  const [activeKnowledgeSlug,setActiveKnowledgeSlug]=useState<string|null>(null); const [selectedQuestionId,setSelectedQuestionId]=useState<number|null>(null);
  const [zenMode,setZenMode]=useState(()=>localStorage.getItem('gongkao_zen')==='1');
  const [timerState,setTimerState]=useState<TimerState>({status:'idle',mode:'stopwatch',elapsedSec:0,targetSec:1500,currentModule:'资料分析',currentActivity:'真题训练',note:'',startTime:null});
  const heartbeat=useRef<number|null>(null);

  const refresh=useCallback(async()=>{try{setLoadError(null);const p=await jsonFetch<Bootstrap>('/api/ui/bootstrap');setData(p);setActiveKnowledgeSlug(prev=>prev||(p.knowledgeNodes[0]?.slug??null));}catch(e:any){setLoadError(e?.message||'加载失败');}finally{setLoading(false)}},[]);

  const loadTimer=useCallback(async()=>{try{const s:any=await jsonFetch('/api/timer/state'); const now=Date.now(); let elapsed=Number(s.elapsed_sec||0); if(s.status==='running'&&s.started_at){const start=Date.parse(s.started_at);if(Number.isFinite(start)) elapsed=Math.max(elapsed,Math.floor((now-start)/1000)-Number(s.paused_sec||0));}
    setTimerState(prev=>({...prev,status:s.status||'idle',elapsedSec:elapsed,currentModule:s.module||prev.currentModule,currentActivity:activityFromApi(s.activity_type||prev.currentActivity),startTime:s.started_at?Date.parse(s.started_at):null}));}catch{}},[]);

  useEffect(()=>{refresh();loadTimer();},[refresh,loadTimer]);
  useEffect(()=>{const pop=()=>setActiveTabState(PATH_TAB[window.location.pathname]||'dashboard');window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop)},[]);
  const setActiveTab=useCallback((tab:string)=>{const safe=TAB_PATH[tab]?tab:'dashboard';setActiveTabState(safe);const target=TAB_PATH[safe];if(window.location.pathname!==target)history.pushState({},'',target);},[]);

  useEffect(()=>{document.documentElement.toggleAttribute('data-zen',zenMode);document.title=zenMode?'Work Notes · Workspace':'2027 公考备考工作台';localStorage.setItem('gongkao_zen',zenMode?'1':'0')},[zenMode]);
  useEffect(()=>{if(timerState.status!=='running')return;const id=window.setInterval(()=>setTimerState(p=>({...p,elapsedSec:p.elapsedSec+1})),1000);return()=>clearInterval(id)},[timerState.status]);
  useEffect(()=>{if(timerState.status==='idle'){if(heartbeat.current)clearInterval(heartbeat.current);heartbeat.current=null;return;} heartbeat.current=window.setInterval(()=>{jsonFetch('/api/timer/heartbeat',{method:'POST',body:JSON.stringify({elapsed_sec:timerState.elapsedSec,paused_sec:0})}).catch(()=>{})},15000);return()=>{if(heartbeat.current)clearInterval(heartbeat.current)}},[timerState.status,timerState.elapsedSec]);

  const startTimer=useCallback(async(module=timerState.currentModule,activity=timerState.currentActivity,mode:TimerState['mode']='stopwatch',targetSec=1500)=>{await jsonFetch('/api/timer/start',{method:'POST',body:JSON.stringify({module,activity_type:activityToApi(activity)})});setTimerState({status:'running',mode,elapsedSec:0,targetSec,currentModule:module,currentActivity:activity,note:'',startTime:Date.now()});},[timerState.currentModule,timerState.currentActivity]);
  const pauseTimer=useCallback(async()=>{await jsonFetch('/api/timer/pause',{method:'POST'});setTimerState(p=>({...p,status:'paused'}));},[]);
  const resumeTimer=useCallback(async()=>{await jsonFetch('/api/timer/resume',{method:'POST'});setTimerState(p=>({...p,status:'running'}));},[]);
  const stopTimer=useCallback(async(note='')=>{try{await jsonFetch('/api/timer/heartbeat',{method:'POST',body:JSON.stringify({elapsed_sec:timerState.elapsedSec,paused_sec:0})});const session:any=await jsonFetch('/api/timer/stop',{method:'POST'});if(note.trim()&&session?.id)await jsonFetch(`/api/ui/session/${session.id}/note`,{method:'PATCH',body:JSON.stringify({note})});}finally{setTimerState(p=>({...p,status:'idle',elapsedSec:0,note:'',startTime:null}));await refresh();}},[refresh,timerState.elapsedSec]);
  const resetTimer=useCallback(async()=>{await jsonFetch('/api/timer/discard',{method:'POST'});setTimerState(p=>({...p,status:'idle',elapsedSec:0,note:'',startTime:null}));},[]);

  const toggleTask=useCallback(async(id:string)=>{const task=data.tasks.find(t=>t.id===id);if(!task)return;await jsonFetch(`/api/tasks/${id}`,{method:'PATCH',body:JSON.stringify({status:task.status==='done'?'todo':'done'})});if(task.status!=='done'){try{confetti({particleCount:35,spread:50,origin:{y:.7}})}catch{}}await refresh();},[data.tasks,refresh]);
  const addTask=useCallback(async(task:Omit<TaskItem,'id'|'date'|'status'>)=>{await jsonFetch('/api/tasks',{method:'POST',body:JSON.stringify({task_date:new Date().toISOString().slice(0,10),priority:task.priority,title:task.title,module:task.module,reason_md:task.reason,est_minutes:task.estMinutes,steps:task.steps,done_criteria_md:task.doneCriteria,node_slugs:task.nodeSlugs})});await refresh();},[refresh]);
  const updateNodeMastery=useCallback(async(slug:string,mastery:MasteryState)=>{await jsonFetch(`/api/ui/mastery/${encodeURIComponent(slug)}`,{method:'PATCH',body:JSON.stringify({mastery})});setData(p=>({...p,knowledgeNodes:p.knowledgeNodes.map(n=>n.slug===slug?{...n,mastery}:n)}));},[]);
  const answerReviewQuestion=useCallback(async(mid:number,choice:string,_correct:boolean)=>{await jsonFetch(`/api/review/${mid}/submit`,{method:'POST',body:JSON.stringify({answer:choice,duration_sec:0})});await refresh();},[refresh]);
  const recordTraining=useCallback(()=>{refresh();},[refresh]);
  const updateSettings=useCallback((s:Partial<UserSettings>)=>setData(p=>({...p,settings:{...p.settings,...s}})),[]);
  const resetToDefaults=useCallback(()=>{localStorage.removeItem('gongkao_zen');setZenMode(false);refresh();},[refresh]);
  const exportDataJson=useCallback(()=>JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2),[data]);
  const importDataJson=useCallback((_s:string)=>false,[]);

  const value=useMemo<AppContextType>(()=>({...data,activeTab:activeTabState,setActiveTab,activeKnowledgeSlug,setActiveKnowledgeSlug,selectedQuestionId,setSelectedQuestionId,weekPlan:data.weekPlans[0]||null,zenMode,loading,loadError,refresh,timerState,startTimer,pauseTimer,resumeTimer,stopTimer,resetTimer,setTimerModule:m=>setTimerState(p=>({...p,currentModule:m})),setTimerActivity:a=>setTimerState(p=>({...p,currentActivity:a})),toggleTask,addTask,updateNodeMastery,answerReviewQuestion,recordTraining,toggleZenMode:()=>setZenMode(v=>!v),updateSettings,resetToDefaults,exportDataJson,importDataJson}),[data,activeTabState,setActiveTab,activeKnowledgeSlug,selectedQuestionId,zenMode,loading,loadError,refresh,timerState,startTimer,pauseTimer,resumeTimer,stopTimer,resetTimer,toggleTask,addTask,updateNodeMastery,answerReviewQuestion,recordTraining,updateSettings,resetToDefaults,exportDataJson,importDataJson]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp=()=>{const ctx=useContext(AppContext);if(!ctx)throw new Error('useApp must be used within AppProvider');return ctx;};
