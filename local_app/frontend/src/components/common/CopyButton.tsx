import React,{useState} from 'react';
import {Check,Copy} from 'lucide-react';
import {copyText} from '../../utils/copy';

export const CopyButton:React.FC<{text:string;label?:string;className?:string;title?:string}>=({text,label='复制',className='',title})=>{
  const[copied,setCopied]=useState(false);
  const run=async(e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation();if(await copyText(text)){setCopied(true);window.setTimeout(()=>setCopied(false),1400)}};
  return <button type="button" disabled={!text} onClick={run} title={title||label} aria-label={title||label} className={`inline-flex select-none items-center gap-1 text-[11px] text-stone-500 hover:text-stone-950 disabled:opacity-40 transition-colors ${className}`}>
    {copied?<Check className="w-3.5 h-3.5 text-emerald-700"/>:<Copy className="w-3.5 h-3.5"/>}<span>{copied?'已复制':label}</span>
  </button>;
};
