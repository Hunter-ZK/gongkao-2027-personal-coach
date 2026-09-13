from __future__ import annotations
import re
from pathlib import Path
from pypdf import PdfReader
from .base import BaseParser,ParseResult,ParsedQuestion
class GenericTextParser(BaseParser):
    name='generic_text'; version='1.0'
    def detect(self,pdf_path:Path)->float: return .3
    def parse(self,pdf_path:Path,image_dir:Path)->ParseResult:
        text='\n'.join((p.extract_text() or '') for p in PdfReader(str(pdf_path)).pages)
        hits=list(re.finditer(r'(?m)^\s*(\d{1,3})[\.．、]\s+',text))
        qs=[]
        for i,m in enumerate(hits):
            chunk=text[m.end():(hits[i+1].start() if i+1<len(hits) else len(text))]
            opts={}
            ms=list(re.finditer(r'([A-D])[\.．]\s*',chunk))
            stem=chunk[:ms[0].start()].strip() if ms else chunk.strip()
            for j,o in enumerate(ms): opts[o.group(1)]=chunk[o.end():(ms[j+1].start() if j+1<len(ms) else len(chunk))].strip()[:500]
            qs.append(ParsedQuestion(seq=int(m.group(1)),stem=stem,options=opts,confidence=min(.6,.2+.1*len(opts)),signals={'seq_ok':True,'options_complete':len(opts)>=4},raw_text=chunk))
        return ParseResult(parser_name=self.name,parser_version=self.version,questions=qs,meta={'source':'generic','has_explanation':False,'has_per_question_time':False},warnings=[] if qs else ['未识别到题号'])
