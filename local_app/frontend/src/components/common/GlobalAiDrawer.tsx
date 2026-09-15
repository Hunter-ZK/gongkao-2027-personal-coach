import React,{useEffect,useMemo,useRef,useState} from 'react';
import Markdown from 'react-markdown';
import {Bot,BookMarked,Check,History,KeyRound,MessageSquareText,PanelRightClose,Plus,Save,Send,Settings2,Sparkles,Trash2} from 'lucide-react';
import {useApp} from '../../context/AppContext';

const OPEN_EVENT='gongkao:open-ai';
const PAGE_TITLES:Record<string,string>={dashboard:'工作台概览',today:'今日任务推进',trainings:'训练记录与题库',mistakes:'错题本与缺陷库',review:'错题智能复训',import:'智能练习导入',knowledge:'行测考点知识库',shenlun:'申论规范与语料',methods:'考场方法库',coach:'AI 工作区',weekplan:'周度攻坚日程',study:'学习投入看板',progress:'作答表现看板'};
const CATEGORY_BY_PAGE:Record<string,string>={mistakes:'错题复盘',review:'错题复盘',knowledge:'解题方法',methods:'解题方法',shenlun:'申论表达',today:'训练策略',weekplan:'训练策略',dashboard:'训练策略',trainings:'训练分析',import:'训练分析',study:'训练分析',progress:'训练分析'};

type SourceRef={title:string;source?:string;kind?:string};
type Msg={id:string;sender:'user'|'assistant';text:string;time:string;query?:string;pageKey?:string;pageTitle?:string;contextSnapshot?:string;sources?:SourceRef[];savedId?:number};
type Formula={id:number;title:string;category:string;page_key?:string;page_title?:string;user_query:string;response_md:string;context_snapshot?:string;tags:string[];created_at:string};
type Conversation={id:number;title:string;page_key?:string;page_title?:string;message_count:number;preview?:string;created_at:string;updated_at:string};
type StoredMessage={id:number;role:'user'|'assistant';content:string;page_key?:string;page_title?:string;context_snapshot?:string;sources:SourceRef[];created_at:string};
type ModelOption={id:string;label:string;note?:string};
type AiConfig={configured:boolean;model:string;thinking:boolean;key_source:string;models:ModelOption[];model_notice?:string};

const timeNow=()=>new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const timeOf=(value?:string)=>{if(!value)return timeNow();const d=new Date(value);return Number.isNaN(d.getTime())?timeNow():d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};
const dateOf=(value?:string)=>{if(!value)return'';const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString([],{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})};
const cleanTitle=(query:string,pageTitle:string)=>`${pageTitle} · ${query.replace(/\s+/g,' ').slice(0,32)}${query.length>32?'…':''}`;

async function jsonRequest<T=any>(url:string,init?:RequestInit):Promise<T>{
  const res=await fetch(url,{...init,headers:{'Content-Type':'application/json',...(init?.headers||{})}});
  if(!res.ok){let msg=`HTTP ${res.status}`;try{const p=await res.json();msg=p?.error?.message||p?.detail||msg}catch{}throw new Error(msg)}
  return res.json();
}

export const GlobalAiDrawer:React.FC=()=>{
  const{activeTab,mistakes,knowledgeNodes,methods,trainings,tasks,sessions,activeKnowledgeSlug}=useApp();
  const[open,setOpen]=useState(false);
  const[tab,setTab]=useState<'chat'|'history'|'settings'|'saved'>('chat');
  const[includePage,setIncludePage]=useState(true);
  const[input,setInput]=useState('');
  const[loading,setLoading]=useState(false);
  const[formulas,setFormulas]=useState<Formula[]>([]);
  const[saving,setSaving]=useState<string|null>(null);
  const[conversations,setConversations]=useState<Conversation[]>([]);
  const[conversationId,setConversationId]=useState<number|null>(null);
  const[messages,setMessages]=useState<Msg[]>([]);
  const[error,setError]=useState('');
  const[persistenceWarning,setPersistenceWarning]=useState('');
  const[transportNote,setTransportNote]=useState('');
  const[config,setConfig]=useState<AiConfig|null>(null);
  const[draftKey,setDraftKey]=useState('');
  const[draftModel,setDraftModel]=useState('deepseek-v4-flash');
  const[draftThinking,setDraftThinking]=useState(false);
  const[configBusy,setConfigBusy]=useState(false);
  const[testResult,setTestResult]=useState('');
  const endRef=useRef<HTMLDivElement>(null);

  const pageTitle=PAGE_TITLES[activeTab]||'当前页面';
  const currentCategory=CATEGORY_BY_PAGE[activeTab]||'综合定式';
  const currentNode=knowledgeNodes.find(n=>n.slug===activeKnowledgeSlug);
  const globalSummary=useMemo(()=>`工作台事实：待修复错题 ${mistakes.filter(m=>m.status!=='fixed').length} 道；知识节点 ${knowledgeNodes.length} 个；正式方法 ${methods.length} 种；训练 ${trainings.length} 次；待办 ${tasks.filter(t=>t.status!=='done').length} 项；学习记录 ${sessions.length} 条。`,[mistakes,knowledgeNodes,methods,trainings,tasks,sessions]);
  const pageSnapshot=useMemo(()=>{const parts=[`当前页面：${pageTitle}`,globalSummary];if(activeTab==='knowledge'&&currentNode)parts.push(`正在阅读考点：${currentNode.module} / ${currentNode.title}；掌握状态=${currentNode.mastery}；样本=${currentNode.sampleN||0}；正确率=${currentNode.accuracy==null?'无样本':`${Math.round(Number(currentNode.accuracy)*100)}%`}`);if(activeTab==='methods')parts.push('当前页面为考场方法库；回答具体方法时优先检索正式方法与对应 Skill 讲法。');return parts.join('\n')},[activeTab,pageTitle,globalSummary,currentNode]);

  const loadHistory=async()=>{try{setConversations(await jsonRequest('/api/ai-conversations'));setPersistenceWarning('')}catch(e:any){setConversations([]);setPersistenceWarning(`历史记录暂不可用：${e?.message||'读取失败'}。不影响继续对话。`)}};
  const loadFormulas=async()=>{try{setFormulas(await jsonRequest('/api/ai-formulas'))}catch{setFormulas([])}};
  const loadConfig=async()=>{try{const p:AiConfig=await jsonRequest('/api/coach/config');setConfig(p);setDraftModel(p.model||'deepseek-v4-flash');setDraftThinking(Boolean(p.thinking))}catch(e:any){setError(e?.message||'AI 配置读取失败')}};

  useEffect(()=>{const fn=()=>{setOpen(true);setTab('chat')};window.addEventListener(OPEN_EVENT,fn);return()=>window.removeEventListener(OPEN_EVENT,fn)},[]);
  useEffect(()=>{if(open){void loadHistory();void loadFormulas();void loadConfig()}},[open]);
  useEffect(()=>{if(open&&tab==='chat')endRef.current?.scrollIntoView({behavior:'smooth'})},[messages,open,tab,loading]);

  const newConversation=async()=>{setError('');setPersistenceWarning('');setConversationId(null);setMessages([]);setTab('chat');try{const p:Conversation=await jsonRequest('/api/ai-conversations',{method:'POST',body:JSON.stringify({page_key:activeTab,page_title:pageTitle})});setConversationId(p.id);void loadHistory()}catch(e:any){setPersistenceWarning(`历史记录暂不可写入：${e?.message||'创建失败'}。本次对话仍可正常使用。`)}};
  const openConversation=async(c:Conversation)=>{setError('');try{const rows:StoredMessage[]=await jsonRequest(`/api/ai-conversations/${c.id}/messages`);setConversationId(c.id);setMessages(rows.map(x=>({id:String(x.id),sender:x.role,text:x.content,time:timeOf(x.created_at),pageKey:x.page_key,pageTitle:x.page_title,contextSnapshot:x.context_snapshot,sources:x.sources})));setTab('chat')}catch(e:any){setError(e?.message||'读取历史失败')}};
  const deleteConversation=async(id:number)=>{try{await jsonRequest(`/api/ai-conversations/${id}`,{method:'DELETE'});if(conversationId===id){setConversationId(null);setMessages([])}await loadHistory()}catch(e:any){setError(e?.message||'删除失败')}};
  const ensureConversation=async():Promise<number|null>=>{if(conversationId)return conversationId;try{const p:Conversation=await jsonRequest('/api/ai-conversations',{method:'POST',body:JSON.stringify({page_key:activeTab,page_title:pageTitle})});setConversationId(p.id);return p.id}catch(e:any){setPersistenceWarning(`历史记录暂不可写入：${e?.message||'创建失败'}。AI 回答不受影响。`);return null}};
  const persistMessage=async(cid:number|null,p:{role:'user'|'assistant';content:string;page_key?:string;page_title?:string;context_snapshot?:string;sources?:SourceRef[]})=>{if(!cid)return null;try{return await jsonRequest<StoredMessage>(`/api/ai-conversations/${cid}/messages`,{method:'POST',body:JSON.stringify({...p,sources:p.sources||[]})})}catch(e:any){setPersistenceWarning(`对话已完成，但历史记录保存失败：${e?.message||'写入失败'}`);return null}};

  const callOnce=async(historyMessages:{role:'user'|'assistant';content:string}[],contextSnapshot?:string)=>{
    const p=await jsonRequest<{text:string;sources:SourceRef[];model:string}>('/api/coach/chat-once',{method:'POST',body:JSON.stringify({messages:historyMessages,context:contextSnapshot,response_mode:'structured',model:draftModel,thinking:draftThinking})});
    if(!p.text?.trim())throw new Error('DeepSeek 未返回有效正文');
    setTransportNote('流式通道不可用，已自动切换稳定模式。');
    return{text:p.text,sources:Array.isArray(p.sources)?p.sources:[]};
  };

  const callAi=async(historyMessages:{role:'user'|'assistant';content:string}[],contextSnapshot?:string)=>{
    setTransportNote('');
    try{
      const res=await fetch('/api/coach/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:historyMessages,context:contextSnapshot,response_mode:'structured',model:draftModel,thinking:draftThinking})});
      if(!res.ok)throw new Error(`流式请求 HTTP ${res.status}`);
      if(!res.body)throw new Error('浏览器无法读取流式响应');
      const reader=res.body.getReader();const decoder=new TextDecoder();let buffer='';let answer='';let sources:SourceRef[]=[];let streamError='';
      while(true){const{value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const blocks=buffer.split('\n\n');buffer=blocks.pop()||'';for(const block of blocks){for(const line of block.split('\n')){if(!line.startsWith('data:'))continue;let event:any;try{event=JSON.parse(line.slice(5).trim())}catch{continue}if(event.type==='meta')sources=Array.isArray(event.sources)?event.sources:[];if(event.type==='delta'&&event.text)answer+=event.text;if(event.type==='error')streamError=event.message||event.detail||'DeepSeek 返回错误'}}}
      if(answer.trim())return{text:answer,sources};
      if(streamError)throw new Error(streamError);
      throw new Error('流式响应没有最终正文');
    }catch(streamErr:any){
      try{return await callOnce(historyMessages,contextSnapshot)}catch(onceErr:any){throw new Error(`${onceErr?.message||'AI 请求失败'}${streamErr?.message?`（流式通道：${streamErr.message}）`:''}`)}
    }
  };

  const send=async()=>{
    const query=input.trim();if(!query||loading)return;
    setError('');setInput('');setLoading(true);setTransportNote('');
    const contextSnapshot=includePage?pageSnapshot:undefined;
    const userMsg:Msg={id:`u-${Date.now()}`,sender:'user',text:query,time:timeNow(),pageKey:activeTab,pageTitle,contextSnapshot};
    const prior=[...messages];setMessages(p=>[...p,userMsg]);
    try{
      const cid=await ensureConversation();
      void persistMessage(cid,{role:'user',content:query,page_key:activeTab,page_title:pageTitle,context_snapshot:contextSnapshot,sources:[]});
      const historyMessages=[...prior,userMsg].slice(-20).map(m=>({role:m.sender,content:m.text}));
      const result=await callAi(historyMessages,contextSnapshot);
      const assistant:Msg={id:`a-${Date.now()}`,sender:'assistant',text:result.text,time:timeNow(),query,pageKey:activeTab,pageTitle,contextSnapshot,sources:result.sources};
      setMessages(p=>[...p,assistant]);
      const saved=await persistMessage(cid,{role:'assistant',content:result.text,page_key:activeTab,page_title:pageTitle,context_snapshot:contextSnapshot,sources:result.sources});
      if(saved)setMessages(p=>p.map(m=>m.id===assistant.id?{...m,id:String(saved.id)}:m));
      if(cid)void loadHistory();
    }catch(e:any){setError(e?.message||'AI 请求失败')}finally{setLoading(false)}
  };

  const saveFormula=async(msg:Msg)=>{if(msg.sender!=='assistant'||!msg.text.trim())return;setSaving(msg.id);setError('');try{const created:Formula=await jsonRequest('/api/ai-formulas',{method:'POST',body:JSON.stringify({title:cleanTitle(msg.query||'AI定式',msg.pageTitle||pageTitle),category:CATEGORY_BY_PAGE[msg.pageKey||activeTab]||currentCategory,page_key:msg.pageKey||activeTab,page_title:msg.pageTitle||pageTitle,user_query:msg.query||'历史对话',response_md:msg.text,context_snapshot:msg.contextSnapshot||null,tags:(msg.sources||[]).slice(0,4).map(x=>x.title)})});setMessages(p=>p.map(m=>m.id===msg.id?{...m,savedId:created.id}:m));await loadFormulas()}catch(e:any){setError(e?.message||'保存定式失败')}finally{setSaving(null)}};
  const deleteFormula=async(id:number)=>{try{await jsonRequest(`/api/ai-formulas/${id}`,{method:'DELETE'});await loadFormulas()}catch(e:any){setError(e?.message||'删除失败')}};
  const saveConfig=async(clear=false)=>{setConfigBusy(true);setTestResult('');setError('');try{const body:any={model:draftModel,thinking:draftThinking,clear_key:clear};if(!clear&&draftKey.trim())body.api_key=draftKey.trim();const p:AiConfig=await jsonRequest('/api/coach/config',{method:'PUT',body:JSON.stringify(body)});setConfig(p);setDraftModel(p.model);setDraftThinking(p.thinking);setDraftKey('');setTestResult(clear?'本地 API Key 已清除。':'配置已保存。')}catch(e:any){setError(e?.message||'保存配置失败')}finally{setConfigBusy(false)}};
  const testConfig=async()=>{setConfigBusy(true);setTestResult('');setError('');try{const p=await jsonRequest('/api/coach/config/test',{method:'POST',body:JSON.stringify({api_key:draftKey.trim()||null,model:draftModel,thinking:draftThinking})});setTestResult(`${p.message} · ${p.model} · ${p.latency_ms}ms`)}catch(e:any){setError(e?.message||'连接测试失败')}finally{setConfigBusy(false)}};

  if(!open)return null;
  const tabs=[{id:'chat',label:'对话',icon:MessageSquareText},{id:'history',label:'历史',icon:History},{id:'settings',label:'设置',icon:Settings2},{id:'saved',label:'定式',icon:BookMarked}] as const;
  return <div className="fixed inset-0 z-[70] flex justify-end"><div className="absolute inset-0 bg-stone-950/25" onClick={()=>setOpen(false)}/><aside id="global-ai-drawer" className="relative w-full sm:w-[520px] max-w-full h-full bg-stone-50 border-l border-stone-200 shadow-2xl flex flex-col">
    <header className="px-4 py-3 border-b border-stone-200 bg-white"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-stone-900 text-amber-300 flex items-center justify-center"><Bot className="w-4 h-4"/></div><div><div className="text-sm font-bold text-stone-900">AI 全局助手</div><div className="text-[10px] text-stone-500">{config?.configured?'DeepSeek 已配置':'未配置 API Key'} · {config?.model||draftModel}</div></div></div><div className="flex items-center gap-1"><button onClick={()=>void newConversation()} className="p-2 rounded-lg text-stone-500 hover:bg-stone-100" title="新对话"><Plus className="w-4 h-4"/></button><button onClick={()=>setOpen(false)} className="p-2 rounded-lg text-stone-500 hover:bg-stone-100" title="关闭"><PanelRightClose className="w-4 h-4"/></button></div></div><div className="flex gap-1 mt-3">{tabs.map(x=>{const Icon=x.icon;return <button key={x.id} onClick={()=>setTab(x.id)} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 ${tab===x.id?'bg-stone-900 text-white':'text-stone-500 hover:bg-stone-100'}`}><Icon className="w-3.5 h-3.5"/>{x.label}</button>})}</div></header>

    {error&&<div className="mx-4 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start justify-between gap-3"><span className="leading-5">{error}</span><button onClick={()=>setTab('settings')} className="whitespace-nowrap font-semibold underline">检查设置</button></div>}
    {persistenceWarning&&<div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[10px] leading-5 text-amber-900">{persistenceWarning}</div>}
    {transportNote&&<div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 text-[10px] text-blue-800">{transportNote}</div>}

    {tab==='chat'&&<><div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">{messages.length===0&&<div className="max-w-sm mx-auto mt-14 text-center"><div className="w-10 h-10 rounded-xl bg-stone-900 text-amber-300 flex items-center justify-center mx-auto"><Sparkles className="w-5 h-5"/></div><h3 className="mt-3 text-sm font-bold text-stone-900">直接问当前学习问题</h3><p className="mt-2 text-xs leading-5 text-stone-500">知识库、方法库、训练与错题会作为本地证据。历史记录异常时也不会阻断回答。</p></div>}{messages.map(msg=><div key={msg.id} className={msg.sender==='user'?'flex justify-end':'flex justify-start'}><div className={`max-w-[88%] ${msg.sender==='user'?'bg-stone-900 text-white rounded-2xl rounded-br-md px-3.5 py-2.5':'bg-white border border-stone-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-2xs'}`}><div className={`text-[10px] mb-1.5 ${msg.sender==='user'?'text-stone-400':'text-stone-400'}`}>{msg.sender==='user'?'我':'AI'} · {msg.time}</div>{msg.sender==='assistant'?<div className="knowledge-reader prose prose-stone prose-sm max-w-none text-[13px] leading-6"><Markdown>{msg.text}</Markdown></div>:<div className="text-[13px] leading-6 whitespace-pre-wrap">{msg.text}</div>}{msg.sender==='assistant'&&msg.sources?.length?<div className="mt-3 pt-2 border-t border-stone-100"><div className="text-[9px] font-semibold text-stone-400 mb-1">Skill / 方法依据</div><div className="flex flex-wrap gap-1">{msg.sources.slice(0,5).map((s,i)=><span key={`${s.title}-${i}`} className="px-1.5 py-0.5 rounded bg-stone-100 text-[9px] text-stone-500">{s.title}</span>)}</div></div>:null}{msg.sender==='assistant'&&<div className="mt-2 flex justify-end"><button disabled={saving===msg.id||!!msg.savedId} onClick={()=>void saveFormula(msg)} className="text-[10px] text-stone-400 hover:text-stone-900 inline-flex items-center gap-1">{msg.savedId?<><Check className="w-3 h-3"/>已保存</>:<><Save className="w-3 h-3"/>{saving===msg.id?'保存中…':'保存定式'}</>}</button></div>}</div></div>)}{loading&&<div className="flex justify-start"><div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white border border-stone-200 text-xs text-stone-500">DeepSeek 正在处理…</div></div>}<div ref={endRef}/></div><div className="p-3 border-t border-stone-200 bg-white"><label className="flex items-center gap-2 text-[10px] text-stone-500 mb-2"><input type="checkbox" checked={includePage} onChange={e=>setIncludePage(e.target.checked)}/><span>附带当前页面上下文：{pageTitle}</span></label><div className="flex items-end gap-2"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}} rows={3} placeholder="输入问题；Enter 发送，Shift+Enter 换行" className="flex-1 resize-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs leading-5 outline-none focus:border-stone-400"/><button disabled={loading||!input.trim()} onClick={()=>void send()} className="w-10 h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center disabled:opacity-40"><Send className="w-4 h-4"/></button></div></div></>}

    {tab==='history'&&<div className="flex-1 overflow-y-auto p-4"><div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-stone-900">历史对话</h3><button onClick={()=>void loadHistory()} className="text-[10px] text-stone-500">刷新</button></div>{conversations.length===0?<div className="p-8 text-center text-xs text-stone-400">暂无可读取的历史记录。即使这里不可用，对话本身仍可继续。</div>:<div className="space-y-2">{conversations.map(c=><div key={c.id} className="group rounded-xl border border-stone-200 bg-white p-3 flex items-start gap-2"><button onClick={()=>void openConversation(c)} className="min-w-0 flex-1 text-left"><div className="text-xs font-semibold text-stone-800 truncate">{c.title}</div><div className="mt-1 text-[10px] text-stone-400">{dateOf(c.updated_at)} · {c.message_count} 条</div><div className="mt-1 text-[10px] text-stone-500 truncate">{c.preview||'—'}</div></button><button onClick={()=>void deleteConversation(c.id)} className="p-1 text-stone-300 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5"/></button></div>)}</div>}</div>}

    {tab==='settings'&&<div className="flex-1 overflow-y-auto p-4"><div className="max-w-md mx-auto space-y-4"><div><h3 className="text-sm font-bold text-stone-900">DeepSeek 配置</h3><p className="mt-1 text-[10px] leading-5 text-stone-500">API Key 仅保存在本机后端，不进入浏览器 localStorage、Git 或对话历史。</p></div><div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-4"><label className="block"><span className="text-[10px] font-semibold text-stone-500 inline-flex items-center gap-1"><KeyRound className="w-3 h-3"/>API Key</span><input type="password" value={draftKey} onChange={e=>setDraftKey(e.target.value)} placeholder={config?.configured?'已配置；留空表示不修改':'sk-...'} className="mt-1.5 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-xs outline-none focus:border-stone-400"/></label><label className="block"><span className="text-[10px] font-semibold text-stone-500">模型</span><select value={draftModel} onChange={e=>setDraftModel(e.target.value)} className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs">{(config?.models||[{id:'deepseek-v4-flash',label:'DeepSeek V4 Flash'}]).map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label><label className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2.5"><div><div className="text-xs font-semibold text-stone-800">深度思考</div><div className="text-[10px] text-stone-500">难题可打开；普通问答建议关闭以提高稳定性。</div></div><input type="checkbox" checked={draftThinking} onChange={e=>setDraftThinking(e.target.checked)}/></label><div className="flex flex-wrap gap-2"><button disabled={configBusy} onClick={()=>void saveConfig(false)} className="px-3 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold">保存配置</button><button disabled={configBusy} onClick={()=>void testConfig()} className="px-3 py-2 rounded-xl border border-stone-200 bg-white text-xs font-semibold">测试连接</button>{config?.configured&&<button disabled={configBusy} onClick={()=>void saveConfig(true)} className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs">清除 Key</button>}</div>{testResult&&<div className="text-[10px] text-emerald-700">{testResult}</div>}{config?.model_notice&&<div className="text-[10px] leading-5 text-stone-400">{config.model_notice}</div>}</div></div></div>}

    {tab==='saved'&&<div className="flex-1 overflow-y-auto p-4"><div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-stone-900">已保存定式</h3><span className="text-[10px] text-stone-400">{formulas.length} 条</span></div>{formulas.length===0?<div className="p-8 text-center text-xs text-stone-400">还没有保存的定式。</div>:<div className="space-y-3">{formulas.map(f=><article key={f.id} className="rounded-2xl border border-stone-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold text-stone-900">{f.title}</div><div className="mt-1 text-[9px] text-stone-400">{f.category} · {dateOf(f.created_at)}</div></div><button onClick={()=>void deleteFormula(f.id)} className="p-1 text-stone-300 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5"/></button></div><div className="mt-3 knowledge-reader prose prose-stone prose-sm max-w-none text-[12px]"><Markdown>{f.response_md}</Markdown></div></article>)}</div>}</div>}
  </aside></div>;
};
