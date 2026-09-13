from pathlib import Path
from .fenbi import FenbiParser
from .generic_text import GenericTextParser
PARSERS=[FenbiParser(),GenericTextParser()]
def choose(pdf_path:Path):
    scored=sorted(((p.detect(pdf_path),p) for p in PARSERS),key=lambda x:x[0],reverse=True)
    return scored[0][1] if scored and scored[0][0]>=.3 else GenericTextParser()
