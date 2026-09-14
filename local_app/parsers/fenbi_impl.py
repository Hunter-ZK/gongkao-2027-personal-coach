from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

NUM_COL_X_MAX = 43.5
HEADER_Y = 80.0
FOOTER_Y = 790.0
PAGE_W, PAGE_H = 595.0, 842.0

RE_QNUM = re.compile(r"^\s*(\d{1,3})[\.．]\s*$")
RE_CORRECT = re.compile(r"^\s*正确答案\s*[:：]\s*([A-Z]+)\s*$")
RE_USER = re.compile(r"^\s*你的答案\s*[:：]\s*([A-Z]*)\s*$")
RE_OPTION = re.compile(r"([A-D])[\.．]\s*")
RE_GENERATED_BY = re.compile(r"本试卷由粉笔用户(.*?)生成")


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
    parser_version: str = "2.0"
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

    @property
    def y1(self) -> float:
        return self.bbox[3] if self.bbox else self.y0 + 12


def _is_watermark(info: dict) -> bool:
    x0, y0, x1, y1 = info["bbox"]
    if info.get("xref", 0) == 0:
        return True
    if y1 < HEADER_Y or y0 > FOOTER_Y:
        return True
    area = (x1 - x0) * (y1 - y0)
    return area > PAGE_W * PAGE_H * 0.55


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
                for span in spans:
                    m = RE_QNUM.match(span["text"])
                    if m and span["bbox"][0] < NUM_COL_X_MAX:
                        elems.append(Elem(pno, span["bbox"][1], span["bbox"][0], "qnum", span["text"], m.group(1), tuple(span["bbox"])))
                text = "".join(s["text"] for s in spans).strip()
                if not text or RE_QNUM.match(text):
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
            bbox = tuple(info["bbox"])
            elems.append(Elem(pno, bbox[1], bbox[0], "image", bbox=bbox, xref=info.get("xref", 0)))
    elems.sort(key=lambda e: (e.page, round(e.y0, 1), e.x0, 0 if e.kind == "qnum" else 1))
    return elems


def _split_line_options(text: str) -> list[tuple[str, str]]:
    matches = list(RE_OPTION.finditer(text))
    if not matches:
        return []
    out: list[tuple[str, str]] = []
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        out.append((match.group(1), text[match.end() : end].strip()))
    return out


def _safe_crop(doc: pymupdf.Document, page_no: int, rect: tuple, out: Path | None, dpi: int = 160) -> str:
    if out is None:
        return f"crop:p{page_no + 1}:{','.join(str(round(x, 1)) for x in rect)}"
    out.parent.mkdir(parents=True, exist_ok=True)
    page = doc[page_no]
    clip = pymupdf.Rect(*rect) & page.rect
    page.get_pixmap(clip=clip, dpi=dpi, alpha=False).save(out)
    return str(out)


def _question_crops(doc: pymupdf.Document, seq: int, qstart: Elem, qend: Elem, image_dir: Path | None, next_q: Elem | None, answer_start: Elem | None) -> list[str]:
    refs: list[str] = []
    for pno in range(qstart.page, qend.page + 1):
        y0 = max(HEADER_Y, qstart.y0 - 6) if pno == qstart.page else HEADER_Y
        y1 = min(FOOTER_Y, qend.y0 + 22) if pno == qend.page else FOOTER_Y
        if answer_start is not None and answer_start.page == pno:
            y1 = min(y1, max(y0 + 8, answer_start.y0 - 3))
        if next_q is not None and next_q.page == pno:
            y1 = min(y1, max(y0 + 8, next_q.y0 - 4))
        if y1 - y0 < 8:
            continue
        out = image_dir / f"q{seq:03d}_p{pno + 1}.png" if image_dir else None
        refs.append(_safe_crop(doc, pno, (25, y0, 565, y1), out))
    return refs


def _option_row_crop(doc: pymupdf.Document, seq: int, key: str, anchor: tuple, next_anchor: tuple | None, image_dir: Path | None) -> str:
    page_no, y0, x0 = anchor
    if next_anchor and next_anchor[0] == page_no and next_anchor[1] > y0:
        y1 = min(next_anchor[1] - 2, FOOTER_Y)
    else:
        y1 = min(y0 + 110, FOOTER_Y)
    out = image_dir / f"q{seq:03d}_opt_{key}_p{page_no + 1}.png" if image_dir else None
    return _safe_crop(doc, page_no, (max(25, x0 - 4), max(HEADER_Y, y0 - 3), 565, y1), out)


def _material_crop(doc: pymupdf.Document, mid: int, start_pos: tuple[int, float], end_pos: tuple[int, float], image_dir: Path | None) -> list[str]:
    refs: list[str] = []
    start_page, start_y = start_pos
    end_page, end_y = end_pos
    for pno in range(start_page, end_page + 1):
        y0 = max(HEADER_Y, start_y) if pno == start_page else HEADER_Y
        y1 = min(FOOTER_Y, end_y) if pno == end_page else FOOTER_Y
        if y1 - y0 < 8:
            continue
        out = image_dir / f"material_{mid:02d}_p{pno + 1}.png" if image_dir else None
        refs.append(_safe_crop(doc, pno, (25, y0, 565, y1), out))
    return refs


def _classify(q: ParsedQuestion) -> tuple[str, str]:
    stem = q.stem
    blob = stem + " " + " ".join(q.options.values())
    if q.material_id is not None:
        return "资料分析", "资料分析"
    if len(stem) <= 45 and stem.count("：") >= 1 and q.options and all("：" in v for v in q.options.values() if v):
        return "判断推理", "类比推理"
    if "根据上述定义" in stem:
        return "判断推理", "定义判断"
    if any(k in stem for k in ("最能削弱", "最能支持", "最能加强")):
        return "判断推理", "逻辑判断·加强削弱"
    if any(k in stem for k in ("问号处", "正方体被分解", "图形", "多面体")):
        return "判断推理", "图形推理"
    if any(k in blob for k in ("概率", "排列", "组合", "工程", "行程", "利润", "浓度", "至少", "方程", "速度", "面积", "体积", "半径", "圆曲线", "平方米", "平均产量")):
        return "数量关系", "数量关系"
    if any(k in stem for k in ("这段文字", "意在说明", "主要说明", "依次填入", "语句排序", "最恰当的一项")):
        return "言语理解", "言语理解"
    if any(k in stem for k in ("以下关于", "下列关于", "下列说法", "叙述正确", "叙述错误")):
        return "常识判断", "常识判断"
    return "未分类", ""


def parse(pdf_path: Path, image_dir: Path | None = None) -> ParseResult:
    doc = pymupdf.open(pdf_path)
    image_dir = Path(image_dir) if image_dir else None
    if image_dir:
        image_dir.mkdir(parents=True, exist_ok=True)
    res = ParseResult()
    first_text = doc[0].get_text() if doc.page_count else ""
    generated = RE_GENERATED_BY.search(first_text)
    res.meta = {
        "source": "fenbi",
        "practice_type": "快速智能练习",
        "page_count": doc.page_count,
        "fenbi_user": generated.group(1) if generated else None,
        "has_explanation": False,
        "has_per_question_time": False,
        "trusted_layout": "快速智能练习" in first_text and "粉笔" in first_text,
    }

    elems = extract_elements(doc)
    qnum_idx = [i for i, elem in enumerate(elems) if elem.kind == "qnum"]
    if not qnum_idx:
        res.warnings.append("未找到题号列，版面可能已改版")
        return res

    questions: list[ParsedQuestion] = []
    materials: list[Material] = []
    for k, start in enumerate(qnum_idx):
        end = qnum_idx[k + 1] if k + 1 < len(qnum_idx) else len(elems)
        qstart = elems[start]
        seq = int(qstart.value)
        chunk = elems[start + 1 : end]
        q = ParsedQuestion(seq=seq, page_start=qstart.page)
        stem_lines: list[str] = []
        anchors: list[tuple[str, int, float, float]] = []
        current_opt: str | None = None
        answer_seen = False
        tail_text: list[str] = []
        images: list[Elem] = []
        first_answer: Elem | None = None
        last_answer: Elem | None = None

        for elem in chunk:
            if elem.kind == "correct":
                q.correct_answer = elem.value
                answer_seen = True
                first_answer = first_answer or elem
                last_answer = elem
                continue
            if elem.kind == "user":
                q.user_answer = elem.value
                answer_seen = True
                first_answer = first_answer or elem
                last_answer = elem
                continue
            if elem.kind == "image":
                images.append(elem)
                continue
            parts = _split_line_options(elem.text)
            if parts:
                for key, value in parts:
                    if key not in q.options:
                        q.options[key] = value
                        anchors.append((key, elem.page, elem.y0, elem.x0))
                    elif value:
                        q.options[key] += value
                    current_opt = key
                continue
            if not q.options:
                stem_lines.append(elem.text)
            elif not answer_seen and current_opt:
                q.options[current_opt] += elem.text
            else:
                tail_text.append(elem.text)

        q.stem = "".join(stem_lines).strip()
        q.raw_text = q.stem + "\n" + "\n".join(f"{key}.{value}" for key, value in q.options.items())
        qend = last_answer or next((elem for elem in reversed(chunk) if elem.kind != "image"), qstart)
        next_q = elems[qnum_idx[k + 1]] if k + 1 < len(qnum_idx) else None
        q.stem_images = _question_crops(doc, seq, qstart, qend, image_dir, next_q, first_answer)

        first_anchor = min(anchors, key=lambda item: (item[1], item[2], item[3])) if anchors else None
        material_images: list[Elem] = []
        for image in images:
            if first_anchor:
                first_page, first_y = first_anchor[1], first_anchor[2]
                if image.page < first_page or (image.page == first_page and image.y1 <= first_y - 2):
                    continue
            candidates: list[tuple[int, float, float, int, str]] = []
            for idx, (key, page_no, y0, x0) in enumerate(anchors):
                if image.page != page_no:
                    continue
                iy0, iy1 = image.bbox[1], image.bbox[3]
                overlap = iy0 - 4 <= y0 <= iy1 + 4
                distance = min(abs(iy0 - y0), abs(((iy0 + iy1) / 2) - y0))
                if overlap or distance <= 18:
                    candidates.append((0 if overlap else 1, distance, abs(image.x0 - x0), idx, key))
            if candidates:
                candidates.sort()
                idx = candidates[0][3]
                key = candidates[0][4]
                anchor = anchors[idx][1:]
                next_anchor = anchors[idx + 1][1:] if idx + 1 < len(anchors) else None
                q.option_images[key] = _option_row_crop(doc, seq, key, anchor, next_anchor, image_dir)
            elif last_answer and (image.page, image.y0) > (last_answer.page, last_answer.y0):
                material_images.append(image)

        if tail_text or material_images:
            mid = len(materials) + 1
            payload_positions = [(elem.page, elem.y0) for elem in material_images]
            if tail_text and last_answer:
                payload_positions.append((last_answer.page, min(last_answer.y0 + 18, FOOTER_Y)))
            start_pos = min(payload_positions) if payload_positions else ((last_answer.page, last_answer.y0 + 18) if last_answer else (qstart.page, qstart.y0))
            start_pos = (start_pos[0], max(HEADER_Y, start_pos[1] - 4))
            if next_q is not None:
                end_pos = (next_q.page, max(HEADER_Y, next_q.y0 - 6))
            else:
                end_pos = (start_pos[0], FOOTER_Y)
            materials.append(Material(id=mid, text="".join(tail_text).strip(), images=_material_crop(doc, mid, start_pos, end_pos, image_dir), after_seq=seq))
        questions.append(q)

    materials.sort(key=lambda material: material.after_seq)
    bounds = [material.after_seq for material in materials] + [10**9]
    for i, material in enumerate(materials):
        lo, hi = material.after_seq, bounds[i + 1]
        for q in questions:
            if lo < q.seq <= hi:
                q.material_id = material.id
                material.question_seqs.append(q.seq)

    for q in questions:
        q.module_guess, q.subtype_guess = _classify(q)
        complete = set(q.options) == set("ABCD") and all(q.options.get(key, "").strip() or q.option_images.get(key) for key in "ABCD")
        q.signals = {
            "seq_ok": q.seq > 0,
            "options_complete": complete,
            "correct_found": bool(q.correct_answer),
            "user_found": bool(q.user_answer),
            "module_identified": q.module_guess != "未分类",
            "trusted_layout": bool(res.meta["trusted_layout"]),
        }
        weights = {"seq_ok": 0.10, "options_complete": 0.25, "correct_found": 0.25, "user_found": 0.20, "module_identified": 0.10, "trusted_layout": 0.10}
        q.confidence = round(sum(weights[key] for key, value in q.signals.items() if value), 2)
        if not q.stem:
            q.confidence = min(q.confidence, 0.4)
        q.is_correct = q.user_answer == q.correct_answer if q.user_answer and q.correct_answer else None
        q.is_multi_select = len(q.correct_answer) > 1

    res.questions = questions
    res.materials = materials
    seqs = [q.seq for q in questions]
    if seqs != list(range(1, len(seqs) + 1)):
        res.warnings.append(f"题号不连续: {seqs}")
    missing = [q.seq for q in questions if not q.correct_answer or not q.user_answer]
    if missing:
        res.warnings.append(f"以下题缺少答案字段: {missing}")
    return res
