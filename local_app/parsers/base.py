from __future__ import annotations
from pathlib import Path
from typing import Any
from pydantic import BaseModel, Field

class ParsedQuestion(BaseModel):
    seq:int; stem:str=""; material_id:int|None=None; options:dict[str,str]=Field(default_factory=dict)
    option_images:dict[str,str]=Field(default_factory=dict); stem_images:list[str]=Field(default_factory=list)
    user_answer:str|None=None; correct_answer:str|None=None; explanation_md:str|None=None; duration_sec:int|None=None
    is_multi_select:bool=False; module_guess:str|None=None; subtype_guess:str|None=None; confidence:float=0
    signals:dict[str,bool]=Field(default_factory=dict); raw_text:str=""
class Material(BaseModel):
    id:int; text:str=""; images:list[str]=Field(default_factory=list); question_seqs:list[int]=Field(default_factory=list)
class ParseResult(BaseModel):
    parser_name:str; parser_version:str; questions:list[ParsedQuestion]; materials:list[Material]=Field(default_factory=list); meta:dict[str,Any]=Field(default_factory=dict); warnings:list[str]=Field(default_factory=list)
class BaseParser:
    name="base"; version="1.0"
    def detect(self,pdf_path:Path)->float: return 0.0
    def parse(self,pdf_path:Path,image_dir:Path)->ParseResult: raise NotImplementedError
