#!/usr/bin/env python3
"""
知识节点内容质量检查。

用法:
    python tools/content_lint.py content/nodes/xxx.md          # 检查单个节点
    python tools/content_lint.py content/nodes/                # 检查目录下全部
    python tools/content_lint.py content/nodes/ --cross-check  # 附加两两重复度检查
    python tools/content_lint.py content/nodes/ --json         # 机器可读输出

检查项对应 04-内容生产规范与30节点清单.md 第三节 L1–L12。
错误(ERROR)必须全部清零才算节点建设完成；警告(WARN)记录但不阻塞。

退出码: 0 = 无 ERROR, 1 = 有 ERROR, 2 = 用法错误
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from itertools import combinations
from pathlib import Path

MIN_CHARS = 3000
MIN_EXAMPLES = 3
MIN_RECALL_QUESTIONS = 8
MIN_SIGNALS = 6
MAX_TRIGRAM_OVERLAP = 0.15

SECTIONS = [
    "这一节在考场上值多少",
    "题型定义与分类依据",
    "识别信号",
    "常见问法",
    "推荐主方法",
    "标准步骤",
    "考场速解路径",
    "适用条件",
    "失效条件",
    "误差方向与精度控制",
    "易错点",
    "常见陷阱",
    "选项利用方法",
    "考场止损",
    "经典模型",
    "完整例题",
    "替代解法对比",
    "名师方法综合",
    "你2022年的笔记",
    "主动回忆与复训",
]

BANNED_PATTERNS = [
    (r"看到.{0,12}先.{0,12}如果不行再", "无边界的'看到X先Y如果不行再Z'模板句"),
    (r"秒杀(?!.{0,30}(条件|适用|前提|失效|边界))", "'秒杀'未交代适用边界"),
    (r"一定(是|选|为)(?!.{0,20}(除非|但|除了|例外))", "绝对表述未给例外"),
    (r"灵活运用", "空泛结论'灵活运用'"),
    (r"具体问题具体分析", "空泛结论'具体问题具体分析'"),
    (r"因题而异", "空泛结论'因题而异'"),
    (r"根据.{0,8}情况.{0,8}选择(?!.{0,40}[：:])", "'根据情况选择'未给判据"),
    (r"只要.{0,10}就(能|可以)(?!.{0,25}(前提|条件|限于))", "'只要就'未给前提条件"),
    (r"万能(公式|方法|套路)", "宣称万能方法"),
    (r"记住(这|以下)?(几)?(点|条)即可(?!.{0,20}(前提|条件))", "'记住即可'未给边界"),
]

SYNTHESIS_MARKERS = ["共识", "分歧", "采纳"]
CJK = re.compile(r"[\u4e00-\u9fff]")

@dataclass
class Issue:
    code: str
    level: str
    message: str

@dataclass
class NodeReport:
    path: Path
    slug: str = ""
    char_count: int = 0
    issues: list[Issue] = field(default_factory=list)
    trigrams: set[str] = field(default_factory=set)
    @property
    def errors(self) -> list[Issue]: return [i for i in self.issues if i.level == "ERROR"]
    @property
    def warns(self) -> list[Issue]: return [i for i in self.issues if i.level == "WARN"]
    @property
    def passed(self) -> bool: return not self.errors

def split_front_matter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"): return {}, text
    end = text.find("\n---", 3)
    if end == -1: return {}, text
    raw = text[3:end]; body = text[end + 4 :]; meta: dict[str, str] = {}
    for line in raw.splitlines():
        if not line.strip() or line.lstrip().startswith("#"): continue
        if line[0] in " \t-": continue
        if ":" in line:
            k, _, v = line.partition(":"); meta[k.strip()] = v.strip()
    return meta, body

def normalize_heading(s: str) -> str:
    s = re.sub(r"^#+\s*", "", s.strip())
    s = re.sub(r"^[\d一二三四五六七八九十]+[\.．、\s]*", "", s)
    return re.sub(r"[\s·。，、：:（）()\-—]", "", s)

def extract_sections(body: str) -> dict[str, str]:
    parts = re.split(r"(?m)^(##\s+.*)$", body); out: dict[str, str] = {}
    for i in range(1, len(parts) - 1, 2): out[normalize_heading(parts[i])] = parts[i + 1]
    return out

def cjk_chars(text: str) -> int: return len(CJK.findall(text))
def trigrams(text: str) -> set[str]:
    chars = "".join(CJK.findall(text)); return {chars[i : i + 3] for i in range(len(chars) - 2)}
def count_list_items(section: str) -> int: return len(re.findall(r"(?m)^\s*(?:[-*+]|\d+[\.．、])\s+\S", section))

def check_node(path: Path) -> NodeReport:
    text = path.read_text(encoding="utf-8"); meta, body = split_front_matter(text); rep = NodeReport(path=path, slug=meta.get("slug", path.stem))
    if meta.get("build_status") == "未建设": return rep
    rep.char_count = cjk_chars(body); rep.trigrams = trigrams(body); sections = extract_sections(body); normalized = {normalize_heading(s): s for s in SECTIONS}
    def sec(name: str) -> str: return sections.get(normalize_heading(name), "")
    if rep.char_count < MIN_CHARS: rep.issues.append(Issue("L1", "ERROR", f"中文字符 {rep.char_count}，低于下限 {MIN_CHARS}"))
    present = [k for k in sections if k in normalized]; missing = [s for s in SECTIONS if normalize_heading(s) not in sections]
    if missing: rep.issues.append(Issue("L2", "ERROR", f"缺少段落: {'、'.join(missing)}"))
    else:
        expected_order = [normalize_heading(s) for s in SECTIONS]
        if present != expected_order: rep.issues.append(Issue("L2", "ERROR", "段落顺序与模板不一致"))
    for name in ("适用条件", "失效条件"):
        s = sec(name)
        if cjk_chars(s) < 40: rep.issues.append(Issue("L3", "ERROR", f"「{name}」内容过少或为空"))
        elif count_list_items(s) < 4: rep.issues.append(Issue("L3", "ERROR", f"「{name}」少于 4 条"))
    examples = sec("完整例题"); ex_blocks = re.findall(r"(?m)^#{3,4}\s*(?:例题|例)\s*\d+", examples)
    if not ex_blocks: ex_blocks = re.findall(r"(?m)^\*\*例题\s*\d+", examples)
    if len(ex_blocks) < MIN_EXAMPLES: rep.issues.append(Issue("L4", "ERROR", f"例题 {len(ex_blocks)} 道，低于下限 {MIN_EXAMPLES}（需以 '### 例题 N' 标记）"))
    main_solutions = len(re.findall(r"主方法解|主方法解法", examples)); fast_solutions = len(re.findall(r"最快解|速解", examples))
    if ex_blocks and (main_solutions < len(ex_blocks) or fast_solutions < len(ex_blocks)):
        rep.issues.append(Issue("L5", "ERROR", f"例题需各含'主方法解'和'最快解'：主 {main_solutions}/{len(ex_blocks)}，快 {fast_solutions}/{len(ex_blocks)}"))
    recall = sec("主动回忆与复训"); n_recall = count_list_items(recall)
    if n_recall < MIN_RECALL_QUESTIONS: rep.issues.append(Issue("L6", "ERROR", f"回忆问题 {n_recall} 条，低于下限 {MIN_RECALL_QUESTIONS}"))
    n_signals = count_list_items(sec("识别信号"))
    if n_signals < MIN_SIGNALS: rep.issues.append(Issue("L7", "ERROR", f"识别信号 {n_signals} 条，低于下限 {MIN_SIGNALS}"))
    for pattern, desc in BANNED_PATTERNS:
        for m in re.finditer(pattern, body):
            line_no = body[: m.start()].count("\n") + 1; snippet = body[max(0, m.start() - 10) : m.end() + 10].replace("\n", " ")
            rep.issues.append(Issue("L9", "ERROR", f"第 {line_no} 行 {desc}：…{snippet}…"))
    synth = sec("名师方法综合"); missing_markers = [m for m in SYNTHESIS_MARKERS if m not in synth]
    if missing_markers: rep.issues.append(Issue("L10", "WARN", f"「名师方法综合」缺少结构词: {'、'.join(missing_markers)}"))
    sourced = len(re.findall(r"20\d{2}\s*(年)?\s*(国考|广东|省考|国家)", examples))
    if sourced < 2: rep.issues.append(Issue("L11", "WARN", f"仅 {sourced} 道例题标注了来源年份，建议 ≥2"))
    legacy = sec("你2022年的笔记")
    if cjk_chars(legacy) < 30 and "无对应内容" not in legacy: rep.issues.append(Issue("L12", "WARN", "「你2022年的笔记」为空且未说明'本节点在旧笔记中无对应内容'"))
    return rep

def cross_check(reports: list[NodeReport]) -> list[tuple[str, str, float]]:
    hits = []; usable = [r for r in reports if len(r.trigrams) > 200]
    for a, b in combinations(usable, 2):
        inter = len(a.trigrams & b.trigrams); union = len(a.trigrams | b.trigrams)
        if union == 0: continue
        sim = inter / union
        if sim > MAX_TRIGRAM_OVERLAP: hits.append((a.slug, b.slug, sim))
    return sorted(hits, key=lambda x: -x[2])

def print_report(rep: NodeReport) -> None:
    mark = "PASS" if rep.passed else "FAIL"; print(f"\n[{mark}] {rep.slug}  ({rep.char_count} 中文字符)")
    for i in rep.issues:
        tag = "  ERROR" if i.level == "ERROR" else "   WARN"; print(f"{tag} {i.code}  {i.message}")
    if not rep.issues: print("  全部检查通过")

def main() -> int:
    ap = argparse.ArgumentParser(description="知识节点内容质量检查"); ap.add_argument("target", help="md 文件或目录"); ap.add_argument("--cross-check", action="store_true", help="附加节点间重复度检查"); ap.add_argument("--json", action="store_true", help="JSON 输出"); args = ap.parse_args()
    target = Path(args.target)
    if target.is_dir(): files = sorted(target.rglob("*.md"))
    elif target.is_file(): files = [target]
    else: print(f"找不到: {target}", file=sys.stderr); return 2
    if not files: print("没有找到 md 文件", file=sys.stderr); return 2
    reports = [check_node(f) for f in files]; overlaps = cross_check(reports) if args.cross_check else []
    for slug_a, slug_b, sim in overlaps:
        for r in reports:
            if r.slug in (slug_a, slug_b): r.issues.append(Issue("L8", "ERROR", f"与 {slug_b if r.slug == slug_a else slug_a} 的 3-gram 重叠率 {sim:.1%}，超过上限 {MAX_TRIGRAM_OVERLAP:.0%}（疑似套模板）"))
    if args.json:
        print(json.dumps({"nodes":[{"slug":r.slug,"path":str(r.path),"char_count":r.char_count,"passed":r.passed,"issues":[vars(i) for i in r.issues]} for r in reports],"overlaps":[{"a":a,"b":b,"similarity":round(s,4)} for a,b,s in overlaps]},ensure_ascii=False,indent=2))
    else:
        for r in reports: print_report(r)
        n_err=sum(len(r.errors) for r in reports); n_warn=sum(len(r.warns) for r in reports); n_pass=sum(1 for r in reports if r.passed)
        print(f"\n{'=' * 56}"); print(f"节点 {len(reports)} 个，通过 {n_pass} 个；ERROR {n_err}，WARN {n_warn}")
        if overlaps:
            print(f"\n重复度超标的节点对 {len(overlaps)} 组：")
            for a,b,s in overlaps[:10]: print(f"  {s:6.1%}  {a}  ×  {b}")
    return 1 if any(r.errors for r in reports) else 0

if __name__ == "__main__": sys.exit(main())
