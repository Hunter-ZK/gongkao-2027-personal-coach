from pathlib import Path
import json, re, shutil

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT.parent/'references'/'legacy_notes'
DST=ROOT/'content'/'legacy_notes'
DST.mkdir(parents=True,exist_ok=True)
EXPECTED=['图形推理','定义判断','类比推理','翻译推理','逻辑论证','言语理解','词语积累','数量关系笔记','资料分析笔记']
ALIASES={
 '类比推理':['类比推理.md'], '数量关系笔记':['数量关系笔记.md','数量关系.md'], '资料分析笔记':['资料分析笔记.md','资料分析.md'],
 '图形推理':['图形推理.md'],'定义判断':['定义判断.md'],'翻译推理':['翻译推理.md'],'逻辑论证':['逻辑论证.md'],
 '言语理解':['言语理解.md','言语理解笔记.md'],'词语积累':['词语积累.md']}

def clean_missing_images(text:str)->str:
    # 原文件图片资源若不存在，仅替换引用，不改正文文字。
    return re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', lambda m: m.group(0) if (SRC/m.group(2)).exists() else f'> [历史图片缺失：{m.group(1) or m.group(2)}]', text)

def main():
    found={}; missing=[]
    for label in EXPECTED:
        src=next((SRC/n for n in ALIASES[label] if (SRC/n).exists()),None)
        if not src:
            missing.append(label); continue
        out=DST/src.name
        out.write_text(clean_missing_images(src.read_text(encoding='utf-8')),encoding='utf-8')
        found[label]=out.name
    (DST/'legacy_missing_assets.md').write_text('# 历史笔记缺失清单\n\n当前缺失的是原始文件，不使用 AI 摘要冒充原文。\n\n'+''.join(f'- {x}：未提供原始文件\n' for x in missing),encoding='utf-8')
    mapping={
      '资料分析笔记.md':['data-abrx-base','data-two-period-proportion','data-truncated-division','data-growth-speed-calc'],
      '数量关系笔记.md':['quant-permutation-probability'],
      '类比推理.md':['analogy-secondary-discrimination']}
    (ROOT/'content'/'legacy_mapping.json').write_text(json.dumps(mapping,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'found':found,'missing':missing},ensure_ascii=False))
if __name__=='__main__': main()
