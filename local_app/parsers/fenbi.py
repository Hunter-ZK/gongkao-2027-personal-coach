from __future__ import annotations
from pathlib import Path
import pymupdf
from .base import BaseParser, ParseResult, ParsedQuestion, Material
from . import fenbi_impl


class FenbiParser(BaseParser):
    name = "fenbi_quick_practice"
    version = "3.0"

    def detect(self, pdf_path: Path) -> float:
        try:
            with pymupdf.open(pdf_path) as doc:
                text = doc[0].get_text() if len(doc) else ""
            if "快速智能练习" in text and "粉笔" in text:
                return 1.0
            if "快速智能练习" in text:
                return 0.9
            if "粉笔" in text or "正确答案" in text:
                return 0.5
        except Exception:
            pass
        return 0.0

    def parse(self, pdf_path: Path, image_dir: Path | None = None) -> ParseResult:
        image_dir = Path(image_dir) if image_dir is not None else Path(pdf_path).parent / "images"
        result = fenbi_impl.parse(Path(pdf_path), image_dir)
        return ParseResult(
            parser_name=result.parser_name,
            parser_version=result.parser_version,
            questions=[
                ParsedQuestion(
                    seq=q.seq,
                    stem=q.stem,
                    material_id=q.material_id,
                    options=q.options,
                    option_images=q.option_images,
                    stem_images=q.stem_images,
                    user_answer=q.user_answer or None,
                    correct_answer=q.correct_answer or None,
                    is_multi_select=q.is_multi_select,
                    module_guess=q.module_guess or None,
                    subtype_guess=q.subtype_guess or None,
                    confidence=q.confidence,
                    signals=q.signals,
                    raw_text=q.raw_text,
                )
                for q in result.questions
            ],
            materials=[
                Material(id=m.id, text=m.text, images=m.images, question_seqs=m.question_seqs)
                for m in result.materials
            ],
            meta=result.meta,
            warnings=result.warnings,
        )


def parse(pdf_path: Path, image_dir: Path | None = None):
    return FenbiParser().parse(Path(pdf_path), Path(image_dir or Path(pdf_path).parent / "images"))
