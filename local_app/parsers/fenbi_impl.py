from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

HEADER_Y = 80.0
FOOTER_Y = 790.0
PAGE_W = 595.0

RE_QEND = re.compile(r"(?:^|\s)(\d{1,3})[\.．]\s*$")
RE_CORRECT = re.compile(r"^正确答案\s*[:：]\s*([A-D]+)\s*$")
RE_USER = re.compile(r"^你的答案\s*[:：]\s*([A-D]*)\s*$")
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
    parser_version: str = "3.0"
    meta: dict = field(default_factory=dict)
    questions: list[ParsedQuestion] = field(default_factory=list)
    materials: list[Material] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class Block:
    page: int
    x0: float
    y0: float
    x1: float
    y1: float
    text: str


def _clean_text(text: str) -> str:
    return " ".join((text or "").replace("\u00a0", " ").split())


def _is_header_footer(text: str, y0: float, y1: float) -> bool:
    if y1 < HEADER_Y or y0 > FOOTER_Y:
        return True
    if "本试卷由粉笔用户" in text:
        return True
    if re.search(r"第\s*\d+\s*页，共\s*\d+\s*页", text):
        return True
    return text == "快速智能练习"


def _blocks(doc: pymupdf.Document) -> list[Block]:
    rows: list[Block] = []
    for pno, page in enumerate(doc):
        for raw in page.get_text("blocks"):
            x0, y0, x1, y1, text, *_ = raw
            text = _clean_text(text)
            if not text or _is_header_footer(text, y0, y1):
                continue
            rows.append(Block(pno, x0, y0, x1, y1, text))
    rows.sort(key=lambda b: (b.page, round(b.y0, 1), b.x0))
    return rows


def _pos(block: Block) -> tuple[int, float]:
    return block.page, block.y0


def _question_anchors(blocks: list[Block]) -> list[tuple[int, Block]]:
    out: list[tuple[int, Block]] = []
    seen: set[int] = set()
    for block in blocks:
        if RE_CORRECT.fullmatch(block.text) or RE_USER.fullmatch(block.text):
            continue
        if re.match(r"^[A-D][\.．]", block.text):
            continue
        match = RE_QEND.search(block.text)
        if not match:
            continue
        seq = int(match.group(1))
        if not 1 <= seq <= 200 or seq in seen:
            continue
        seen.add(seq)
        out.append((seq, block))
    out.sort(key=lambda item: (item[1].page, item[1].y0, item[1].x0))
    return out


def _answers(blocks: list[Block]) -> list[tuple[str, str, Block]]:
    out = []
    for block in blocks:
        match = RE_CORRECT.fullmatch(block.text)
        if match:
            out.append(("correct", match.group(1), block))
            continue
        match = RE_USER.fullmatch(block.text)
        if match:
            out.append(("user", match.group(1), block))
    return sorted(out, key=lambda item: (item[2].page, item[2].y0, item[2].x0))


def _strip_question_number(text: str, seq: int) -> str:
    match = RE_QEND.search(text)
    if match and int(match.group(1)) == seq:
        return RE_QEND.sub("", text).strip()
    return text


def _split_content(lines: list[tuple[str, Block]]) -> tuple[str, dict[str, str], list[tuple[str, Block]]]:
    stem_lines: list[str] = []
    options: dict[str, str] = {}
    anchors: list[tuple[str, Block]] = []
    current: str | None = None
    for text, block in lines:
        matches = list(RE_OPTION.finditer(text))
        if matches:
            for idx, match in enumerate(matches):
                end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
                key = match.group(1)
                value = text[match.end():end].strip()
                options[key] = (options.get(key, "") + " " + value).strip()
                anchors.append((key, block))
                current = key
            continue
        if current:
            options[current] = (options[current] + " " + text).strip()
        else:
            stem_lines.append(text)
    return "".join(stem_lines).strip(), options, anchors


def _safe_crop(
    doc: pymupdf.Document,
    page_no: int,
    y0: float,
    y1: float,
    output: Path | None,
    dpi: int = 170,
) -> str | None:
    y0 = max(HEADER_Y, y0)
    y1 = min(FOOTER_Y, y1)
    if y1 - y0 < 5:
        return None
    rect = pymupdf.Rect(25, y0, 570, y1) & doc[page_no].rect
    if output is None:
        return f"crop:p{page_no + 1}:25,{round(y0,1)},570,{round(y1,1)}"
    output.parent.mkdir(parents=True, exist_ok=True)
    doc[page_no].get_pixmap(clip=rect, dpi=dpi, alpha=False).save(output)
    return str(output)


def _question_images(
    doc: pymupdf.Document,
    seq: int,
    start: Block,
    answer_pos: tuple[int, float],
    image_dir: Path | None,
) -> list[str]:
    refs: list[str] = []
    for pno in range(start.page, answer_pos[0] + 1):
        y0 = start.y0 - 4 if pno == start.page else HEADER_Y
        y1 = answer_pos[1] - 3 if pno == answer_pos[0] else FOOTER_Y
        output = image_dir / f"q{seq:03d}_p{pno + 1}.png" if image_dir else None
        ref = _safe_crop(doc, pno, y0, y1, output)
        if ref:
            refs.append(ref)
    return refs


def _empty_option_images(
    doc: pymupdf.Document,
    seq: int,
    option_anchors: list[tuple[str, Block]],
    answer_pos: tuple[int, float],
    options: dict[str, str],
    image_dir: Path | None,
) -> dict[str, str]:
    refs: dict[str, str] = {}
    for idx, (key, block) in enumerate(option_anchors):
        if options.get(key):
            continue
        next_anchor = next(
            (
                other
                for _, other in option_anchors[idx + 1:]
                if other.page == block.page and other.y0 > block.y0
            ),
            None,
        )
        if next_anchor:
            y1 = next_anchor.y0 - 2
        elif answer_pos[0] == block.page:
            y1 = answer_pos[1] - 3
        else:
            y1 = min(block.y0 + 120, FOOTER_Y)
        output = image_dir / f"q{seq:03d}_opt_{key}_p{block.page + 1}.png" if image_dir else None
        ref = _safe_crop(doc, block.page, block.y0 - 2, y1, output)
        if ref:
            refs[key] = ref
    return refs


def _classify(question: ParsedQuestion) -> tuple[str, str]:
    stem = question.stem
    blob = stem + " " + " ".join(question.options.values())
    if question.material_id is not None:
        return "资料分析", "资料分析"
    if len(stem) <= 45 and "：" in stem and question.options and all(
        "：" in value for value in question.options.values() if value
    ):
        return "判断推理", "类比推理"
    if "根据上述定义" in stem:
        return "判断推理", "定义判断"
    if any(key in stem for key in ("最能削弱", "最能支持", "最能加强")):
        return "判断推理", "逻辑判断·加强削弱"
    if any(key in stem for key in ("问号处", "正方体被分解", "图形", "多面体")):
        return "判断推理", "图形推理"
    if any(
        key in blob
        for key in (
            "概率", "排列", "组合", "工程", "行程", "利润", "浓度", "至少",
            "方程", "速度", "面积", "体积", "半径", "圆曲线", "平方米", "平均产量",
        )
    ):
        return "数量关系", "数量关系"
    if any(key in stem for key in ("这段文字", "意在说明", "主要说明", "依次填入", "语句排序", "最恰当的一项")):
        return "言语理解", "言语理解"
    if any(key in stem for key in ("以下关于", "下列关于", "下列说法", "叙述正确", "叙述错误")):
        return "常识判断", "常识判断"
    return "未分类", ""


def _detect_shared_material(
    doc: pymupdf.Document,
    anchors: list[tuple[int, Block]],
    questions: list[ParsedQuestion],
    image_dir: Path | None,
) -> list[Material]:
    # 粉笔资料分析套题常把一张图表/表格作为整组题的共同材料。
    # 当前版式中材料紧邻该组第一题之前，跨页题目继续共享该材料。
    data_questions = [q for q in questions if q.seq >= 11]
    if len(data_questions) < 2:
        return []
    first = next((block for seq, block in anchors if seq == data_questions[0].seq), None)
    if first is None:
        return []
    output = image_dir / f"material_01_p{first.page + 1}.png" if image_dir else None
    ref = _safe_crop(doc, first.page, HEADER_Y, first.y0 - 5, output)
    if not ref:
        return []
    material = Material(
        id=1,
        text="",
        images=[ref],
        question_seqs=[q.seq for q in data_questions],
        after_seq=max(0, data_questions[0].seq - 1),
    )
    for q in data_questions:
        q.material_id = material.id
        q.module_guess, q.subtype_guess = "资料分析", "资料分析"
    return [material]


def parse(pdf_path: Path, image_dir: Path | None = None) -> ParseResult:
    doc = pymupdf.open(pdf_path)
    image_dir = Path(image_dir) if image_dir else None
    if image_dir:
        image_dir.mkdir(parents=True, exist_ok=True)

    first_text = doc[0].get_text() if doc.page_count else ""
    generated = RE_GENERATED_BY.search(first_text)
    result = ParseResult()
    result.meta = {
        "source": "fenbi",
        "practice_type": "快速智能练习",
        "page_count": doc.page_count,
        "fenbi_user": generated.group(1) if generated else None,
        "has_explanation": False,
        "has_per_question_time": False,
        "trusted_layout": "快速智能练习" in first_text and "粉笔" in first_text,
        "layout_engine": "geometry-v3",
    }

    blocks = _blocks(doc)
    anchors = _question_anchors(blocks)
    answers = _answers(blocks)
    if not anchors:
        result.warnings.append("未找到题号锚点，版面可能已改版")
        return result

    questions: list[ParsedQuestion] = []
    for idx, (seq, start) in enumerate(anchors):
        next_pos = (
            _pos(anchors[idx + 1][1])
            if idx + 1 < len(anchors)
            else (doc.page_count + 1, FOOTER_Y)
        )
        relevant_answers = [
            item
            for item in answers
            if _pos(item[2]) > (start.page, start.y0 - 0.2) and _pos(item[2]) < next_pos
        ]
        correct = next((value for kind, value, _ in relevant_answers if kind == "correct"), "")
        user = next((value for kind, value, _ in relevant_answers if kind == "user"), "")
        answer_pos = min((_pos(block) for _, _, block in relevant_answers), default=next_pos)

        content_rows: list[tuple[str, Block]] = []
        for block in blocks:
            if _pos(block) < (start.page, start.y0 - 0.2) or _pos(block) >= answer_pos:
                continue
            if RE_CORRECT.fullmatch(block.text) or RE_USER.fullmatch(block.text):
                continue
            text = _strip_question_number(block.text, seq)
            if text:
                content_rows.append((text, block))

        stem, options, option_anchors = _split_content(content_rows)
        question = ParsedQuestion(
            seq=seq,
            stem=stem,
            options=options,
            correct_answer=correct,
            user_answer=user,
            is_correct=(correct == user) if correct and user else None,
            page_start=start.page,
        )
        question.stem_images = _question_images(doc, seq, start, answer_pos, image_dir)
        question.option_images = _empty_option_images(
            doc, seq, option_anchors, answer_pos, options, image_dir
        )
        question.module_guess, question.subtype_guess = _classify(question)

        complete_options = (
            set(question.options) == set("ABCD")
            and all(question.options.get(key) or question.option_images.get(key) for key in "ABCD")
        )
        question.confidence = 0.99 if (
            result.meta["trusted_layout"]
            and question.stem
            and question.correct_answer
            and question.user_answer
            and complete_options
        ) else 0.85
        question.signals = {
            "geometry_segmented": True,
            "answers_bound_by_position": True,
            "visual_fallback": bool(question.stem_images),
            "complete_options": complete_options,
        }
        question.raw_text = question.stem + "\n" + "\n".join(
            f"{key}.{value}" for key, value in question.options.items()
        )
        questions.append(question)

    result.questions = questions
    result.materials = _detect_shared_material(doc, anchors, questions, image_dir)

    # Reclassify after shared material has been attached.
    for question in result.questions:
        question.module_guess, question.subtype_guess = _classify(question)

    expected = list(range(result.questions[0].seq, result.questions[-1].seq + 1)) if result.questions else []
    actual = [q.seq for q in result.questions]
    if expected and actual != expected:
        result.warnings.append(f"题号不连续：识别到 {actual}")
    if any(not q.correct_answer or not q.user_answer for q in result.questions):
        result.warnings.append("存在缺失的正确答案或用户答案，需要人工复核")
    return result
