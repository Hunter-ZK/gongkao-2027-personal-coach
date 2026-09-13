from pathlib import Path
import pytest
from parsers.fenbi import FenbiParser

FIX=Path(__file__).parent/'fixtures'/'快速智能练习.pdf'

def test_real_fixture_contract():
    if not FIX.exists():
        pytest.skip('真实快速智能练习.pdf fixture 未随本次附件提供，禁止用合成 PDF 冒充该验收。')
    p=FenbiParser()
    assert p.detect(FIX) > 0
    result=p.parse(FIX)
    assert len(result.questions)==15
    correct=sum(1 for q in result.questions if q.user_answer and q.correct_answer and q.user_answer==q.correct_answer)
    assert correct==10
    assert max(q.confidence for q in result.questions)<=0.65
