#!/usr/bin/env python3
"""
粉笔「快速智能练习」PDF 解析器 —— 已在真实样本上验证的参考实现。

对应文档 02-数据模型与API规格.md 第六节。
执行 AI 请直接以本文件为基础实现 parsers/fenbi.py，不要重写算法。

依赖: PyMuPDF

用法:
    python tools/fenbi_parser.py 快速智能练习.pdf
    python tools/fenbi_parser.py 快速智能练习.pdf --json out.json --images ./imgs
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, field, asdict
from pathlib import Path

import pymupdf

NUM_COL_X_MAX = 43.0
HEADER_Y = 80.0
FOOTER_Y = 790.0
PAGE_W, PAGE_H = 595.0, 842.0

RE_QNUM = re.compile(r"^\s*(\d{1,3})[\.．]\s*$")
RE_CORRECT = re.compile(r"^\s*正确答案\s*[:：]\s*([A-Z]+)\s*$")
RE_USER = re.compile(r"^\s*你的答案\s*[:：]\s*([A-Z]*)\s*$")
RE_OPTION = re.compile(r"([A-Z])[\.．]\s*")
RE_GENERATED_BY = re.compile(r"本试卷由粉笔用户(.*?)生成")

MODULE_RULES = [
    ("资料分析", ["同比", "环比", "增长率", "增长量", "比重", "百分点", "基期",
                  "平均每", "占比", "万平方米", "人次", "较上年"]),
    ("数量关系", ["概率", "排列", "组合", "工程", "行程", "利润", "浓度",
                  "共有多少种", "至少", "方程", "速度", "面积", "体积"]),
    ("判断推理", ["根据上述定义", "可以得知", "以下判断", "必需补充的前提",
                  "最能削弱", "最能支持", "对于", "相当于", "由此可以推出"]),
    ("言语理解", ["依次填入", "画横线", "这段文字", "意在说明", "主要说明",
                  "语句排序", "最恰当的一项"]),
    ("常识判断", ["下列说法正确的是", "下列关于", "以下说法错误的是"]),
]

SUBTYPE_RULES = [
    ("类比推理", lambda s, o: _is_analogy(s, o)),
    ("定义判断", lambda s, o: "根据上述定义" in s),
    ("逻辑判断·分析推理", lambda s, o: "可以得知" in s or "判断错误的是" in s or "以下判断" in s),
    ("逻辑判断·前提假设", lambda s, o: "前提" in s and ("必需补充" in s or "必须补充" in s)),
    ("逻辑判断·加强削弱", lambda s, o: "削弱" in s or "支持" in s or "加强" in s),
    ("数量关系·概率", lambda s, o: "概率" in s),
    ("数量关系·排列组合", lambda s, o: "多少种" in s or "排列" in s or "组合" in s),
]


def _is_analogy(stem: str, options: dict) -> bool:
    if "相当于" in stem and "对于" in stem:
        return True
    if len(stem) <= 30 and stem.count("：") >= 1:
        opt_vals = list(options.values())
        if opt_vals and all("：" in v for v in opt_vals):
            return True
    return False


@dataclass
class ParsedQuestion:
    seq: int
    stem: str = ""
    material_id: int | None = None
    options: dict[str, str] = field(default_factory=dict)
    option_images: dict[str, str] = field(default_factory=dict)
    stem_images: list[str] = field(default_factory=list)
    correct_answer: str = ""
    user_answer: str = ""
    is_correct: bool | None = None
    is_multi_select: bool = False
    module_guess: str = ""
    subtype_guess: str = ""
    confidence: float = 0.0
    signals: dict[str, bool] = field(default_factory=dict)
    page_start: int = 0
    raw_text: str = ""


@dataclass
class Material:
    id: int
    text: str = ""
    images: list[str] = field(default_factory=list)
    question_seqs: list[int] = field(default_factory=list)
    after_seq: int = 0


@dataclass
class ParseResult:
    parser_name: str = "fenbi_quick_practice"
    parser_version: str = "1.0"
    meta: dict = field(default_factory=dict)
    questions: list[ParsedQuestion] = field(default_factory=list)
    materials: list[Material] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class Elem:
    page: int
    y0: float
    x0: float
    kind: str
    text: str = ""
    value: str = ""
    bbox: tuple = ()
    xref: int = 0


def _is_watermark(info: dict) -> bool:
    x0, y0, x1, y1 = info["bbox"]
    if info.get("xref", 0) == 0:
        return True
    if y1 < HEADER_Y or y0 > FOOTER_Y:
        return True
    area = (x1 - x0) * (y1 - y0)
    if area > PAGE_W * PAGE_H * 0.55:
        return True
    if y0 < -1 or y1 > PAGE_H + 1:
        return True
    return False


def extract_elements(doc: pymupdf.Document) -> list[Elem]:
    elems: list[Elem] = []
    for pno, page in enumerate(doc):
        for block in page.get_text("dict")["blocks"]:
            if block["type"] != 0:
                continue
            for line in block["lines"]:
                spans = line["spans"]
                if not spans:
                    continue
                y0 = min(s["bbox"][1] for s in spans)
                x0 = min(s["bbox"][0] for s in spans)
                if y0 < HEADER_Y or y0 > FOOTER_Y:
                    continue
                for s in spans:
                    t = s["text"]
                    sx0, sy0 = s["bbox"][0], s["bbox"][1]
                    m = RE_QNUM.match(t)
                    if m and sx0 < NUM_COL_X_MAX:
                        elems.append(Elem(pno, sy0, sx0, "qnum", t, m.group(1)))
                text = "".join(s["text"] for s in spans).strip()
                if not text:
                    continue
                if RE_QNUM.match(text):
                    continue
                mc = RE_CORRECT.match(text)
                if mc:
                    elems.append(Elem(pno, y0, x0, "correct", text, mc.group(1)))
                    continue
                mu = RE_USER.match(text)
                if mu:
                    elems.append(Elem(pno, y0, x0, "user", text, mu.group(1)))
                    continue
                elems.append(Elem(pno, y0, x0, "text", text))
        for info in page.get_image_info(xrefs=True):
            if _is_watermark(info):
                continue
            b = info["bbox"]
            elems.append(Elem(pno, b[1], b[0], "image", bbox=tuple(b), xref=info.get("xref", 0)))
    elems.sort(key=lambda e: (e.page, round(e.y0, 1), e.x0))
    return elems


def parse(pdf_path: Path, image_dir: Path | None = None) -> ParseResult:
    doc = pymupdf.open(pdf_path)
    res = ParseResult()
    raw_first = doc[0].get_text()
    m = RE_GENERATED_BY.search(raw_first)
    res.meta = {
        "source": "fenbi",
        "practice_type": "快速智能练习",
        "page_count": doc.page_count,
        "fenbi_user": m.group(1) if m else None,
        "has_explanation": False,
        "has_per_question_time": False,
    }
    elems = extract_elements(doc)
    qnum_idx = [i for i, e in enumerate(elems) if e.kind == "qnum"]
    if not qnum_idx:
        res.warnings.append("未找到题号列，版面可能已改版")
        return res
    materials: list[Material] = []
    questions: list[ParsedQuestion] = []
    for k, start in enumerate(qnum_idx):
        end = qnum_idx[k + 1] if k + 1 < len(qnum_idx) else len(elems)
        seq = int(elems[start].value)
        q = ParsedQuestion(seq=seq, page_start=elems[start].page)
        chunk = elems[start + 1 : end]
        stem_lines: list[str] = []
        opt_marks: list[tuple[float, int, str]] = []
        imgs: list[Elem] = []
        tail_texts: list[tuple[float, int, str]] = []
        first_opt_y: tuple[int, float] | None = None
        for e in chunk:
            if e.kind == "correct":
                q.correct_answer = e.value
                continue
            if e.kind == "user":
                q.user_answer = e.value
                continue
            if e.kind == "image":
                imgs.append(e)
                continue
            if RE_OPTION.match(e.text):
                if first_opt_y is None:
                    first_opt_y = (e.page, e.y0)
                opt_marks.append((e.y0, e.page, e.text))
            elif first_opt_y is None:
                stem_lines.append(e.text)
            else:
                tail_texts.append((e.y0, e.page, e.text))
        q.stem = "".join(stem_lines).strip()
        q.options = _split_options([t for _, _, t in opt_marks])
        q.raw_text = q.stem + "\n" + "\n".join(t for _, _, t in opt_marks)
        empty_opts = sorted(k2 for k2, v in q.options.items() if not v.strip())
        label_pos = {}
        for y0, pg, txt in opt_marks:
            m2 = RE_OPTION.match(txt)
            if m2 and m2.group(1) not in label_pos:
                label_pos[m2.group(1)] = (pg, y0)
        leftover: list[Elem] = []
        used: set[int] = set()
        for key in empty_opts:
            if key not in label_pos:
                continue
            pg, ly = label_pos[key]
            best, best_d = None, 1e9
            for i, e in enumerate(imgs):
                if i in used or e.page != pg:
                    continue
                d2 = abs(e.y0 - ly)
                if d2 < best_d and d2 < 40:
                    best, best_d = i, d2
            if best is not None:
                used.add(best)
                q.option_images[key] = _save_image(doc, imgs[best], image_dir)
        for i, e in enumerate(imgs):
            if i in used:
                continue
            if first_opt_y is None or (e.page, e.y0) < first_opt_y:
                q.stem_images.append(_save_image(doc, e, image_dir))
            else:
                leftover.append(e)
        mat_text = "".join(t for _, _, t in tail_texts).strip()
        if mat_text or leftover:
            mat = Material(id=len(materials) + 1, text=mat_text)
            mat.images = [_save_image(doc, e, image_dir) for e in leftover]
            mat.after_seq = seq
            materials.append(mat)
        questions.append(q)
    for q in questions:
        _classify(q)
    _attach_materials(questions, materials)
    for q in questions:
        if q.material_id is not None:
            q.module_guess = "资料分析"
        _score(q)
        if q.correct_answer and q.user_answer:
            q.is_correct = q.correct_answer == q.user_answer
        q.is_multi_select = len(q.correct_answer) > 1
    res.questions = questions
    res.materials = materials
    seqs = [q.seq for q in questions]
    if seqs != list(range(1, len(seqs) + 1)):
        res.warnings.append(f"题号不连续: {seqs}")
    missing = [q.seq for q in questions if not q.correct_answer]
    if missing:
        res.warnings.append(f"以下题未识别到正确答案: {missing}")
    return res


def _split_options(lines: list[str]) -> dict[str, str]:
    joined = "\n".join(lines)
    parts = list(RE_OPTION.finditer(joined))
    out: dict[str, str] = {}
    for i, m in enumerate(parts):
        end = parts[i + 1].start() if i + 1 < len(parts) else len(joined)
        key = m.group(1)
        val = joined[m.end() : end].strip().replace("\n", "")
        if key in out:
            continue
        out[key] = val
    return out


def _attach_materials(questions: list[ParsedQuestion], materials: list[Material]) -> None:
    if not materials:
        return
    materials.sort(key=lambda m: m.after_seq)
    bounds = [m.after_seq for m in materials] + [10 ** 9]
    by_seq = {q.seq: q for q in questions}
    for i, mat in enumerate(materials):
        lo, hi = mat.after_seq, bounds[i + 1]
        for seq in sorted(by_seq):
            if lo < seq <= hi:
                by_seq[seq].material_id = mat.id
                mat.question_seqs.append(seq)


def _save_image(doc: pymupdf.Document, e: Elem, image_dir: Path | None) -> str:
    if image_dir is None:
        return f"xref:{e.xref}"
    image_dir.mkdir(parents=True, exist_ok=True)
    name = f"p{e.page + 1}_x{e.xref}.png"
    out = image_dir / name
    if not out.exists():
        try:
            pix = pymupdf.Pixmap(doc, e.xref)
            if pix.n - pix.alpha >= 4:
                pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            pix.save(out)
        except Exception:
            page = doc[e.page]
            clip = pymupdf.Rect(*e.bbox)
            page.get_pixmap(clip=clip, dpi=200).save(out)
    return str(out)


def _classify(q: ParsedQuestion) -> None:
    blob = q.stem + " " + " ".join(q.options.values())
    scores = {}
    for mod, kws in MODULE_RULES:
        scores[mod] = sum(blob.count(k) for k in kws)
    best = max(scores, key=scores.get)
    q.module_guess = best if scores[best] else "未分类"
    if q.material_id is not None:
        q.module_guess = "资料分析"
    for name, fn in SUBTYPE_RULES:
        try:
            if fn(q.stem, q.options):
                q.subtype_guess = name
                if name.startswith("类比"):
                    q.module_guess = "判断推理"
                elif name.startswith("定义") or name.startswith("逻辑"):
                    q.module_guess = "判断推理"
                elif name.startswith("数量"):
                    q.module_guess = "数量关系"
                break
        except Exception:
            continue


def _score(q: ParsedQuestion) -> None:
    s = {
        "seq_ok": q.seq > 0,
        "options_complete": len(q.options) >= 4,
        "correct_found": bool(q.correct_answer),
        "user_found": bool(q.user_answer),
        "module_identified": q.module_guess != "未分类",
    }
    w = {"seq_ok": 0.20, "options_complete": 0.25, "correct_found": 0.25,
         "user_found": 0.15, "module_identified": 0.15}
    conf = sum(w[k] for k, v in s.items() if v)
    if any(not v.strip() for v in q.options.values()):
        conf = min(conf, 0.65)
        s["has_image_options"] = True
    if not q.stem.strip():
        conf = min(conf, 0.4)
    q.signals = s
    q.confidence = round(conf, 2)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--json", help="输出 JSON 路径")
    ap.add_argument("--images", help="图片导出目录")
    args = ap.parse_args()
    res = parse(Path(args.pdf), Path(args.images) if args.images else None)
    total = len(res.questions)
    correct = sum(1 for q in res.questions if q.is_correct)
    high = sum(1 for q in res.questions if q.confidence >= 0.85)
    low = sum(1 for q in res.questions if q.confidence < 0.70)
    print(f"解析器 {res.parser_name} v{res.parser_version}")
    print(f"题数 {total}  做对 {correct}  正确率 {correct / total:.1%}" if total else "无题目")
    print(f"高置信 {high}  需确认 {low}  材料 {len(res.materials)} 组")
    if res.meta.get("has_explanation") is False:
        print("注意: 本类型 PDF 不含解析，也不含题级用时")
    for w in res.warnings:
        print(f"  警告: {w}")
    print()
    print(f"{'题':>3} {'模块':<10} {'子题型':<18} {'正确':<5} {'你的':<5} {'判定':<4} {'选项':<4} {'置信':<5}")
    for q in res.questions:
        mark = "✓" if q.is_correct else ("✗" if q.is_correct is False else "?")
        nopt = f"{len(q.options)}"
        if q.option_images:
            nopt += "图"
        print(f"{q.seq:>3} {q.module_guess:<10} {(q.subtype_guess or '-'):<18} "
              f"{q.correct_answer:<5} {q.user_answer:<5} {mark:<4} {nopt:<4} {q.confidence:<5}")
    if args.json:
        payload = {
            "meta": res.meta,
            "warnings": res.warnings,
            "materials": [asdict(m) for m in res.materials],
            "questions": [asdict(q) for q in res.questions],
        }
        Path(args.json).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n已写出 {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
