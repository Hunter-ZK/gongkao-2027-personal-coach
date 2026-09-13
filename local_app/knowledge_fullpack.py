from content_pack_data import PACK as DATA_PACK
from content_pack_judgment import PACK as JUDGMENT_PACK
from content_pack_verbal import PACK as VERBAL_PACK
from content_pack_quantity import PACK as QUANTITY_PACK
from content_pack_politics import PACK as POLITICS_PACK
from content_pack_science import PACK as SCIENCE_PACK

PACKS = {
    '资料分析': DATA_PACK,
    '判断推理': JUDGMENT_PACK,
    '言语理解': VERBAL_PACK,
    '数量关系': QUANTITY_PACK,
    '政治理论与常识': POLITICS_PACK,
    '广东科学推理': SCIENCE_PACK,
}


def get_topic_pack(module, title):
    return PACKS.get(module, {}).get(title)
