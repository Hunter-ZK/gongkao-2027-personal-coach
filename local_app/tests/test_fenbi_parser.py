from pathlib import Path
import pytest
from parsers.fenbi import FenbiParser

FIX=Path(__file__).parent/'fixtures'/'快速智能练习.pdf'


def test_real_fixture_contract(tmp_path):
    if not FIX.exists():
        pytest.skip('真实快速智能练习.pdf fixture 未随仓库提供；禁止用合成 PDF 冒充真实版式验收。')
    parser=FenbiParser()
    assert parser.detect(FIX) == 1.0
    result=parser.parse(FIX,tmp_path/'images')
    assert result.parser_version=='3.0'
    assert result.meta.get('layout_engine')=='geometry-v3'
    assert len(result.questions)==15
    correct=sum(1 for q in result.questions if q.user_answer and q.correct_answer and q.user_answer==q.correct_answer)
    assert correct==14
    q10=next(q for q in result.questions if q.seq==10)
    assert q10.correct_answer=='A' and q10.user_answer=='B'
    assert all(q.confidence>=.95 for q in result.questions)
    assert result.questions[2].material_id is None
    assert len(result.materials)==1
    assert result.materials[0].question_seqs==[11,12,13,14,15]
    q6=next(q for q in result.questions if q.seq==6)
    q14=next(q for q in result.questions if q.seq==14)
    assert set(q6.option_images)==set('ABCD')
    assert set(q14.option_images)==set('ABCD')
    assert all(q.stem_images for q in result.questions)
