from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parents[1]
METHOD_DIR = BASE / 'content' / 'methods'
SOURCE_DIR = METHOD_DIR / 'source'
MANIFEST_PATH = METHOD_DIR / 'source_manifest.json'
MAPPING_PATH = BASE / 'content' / 'method_mapping.json'
MODULE_ORDER = {'资料分析': 0, '判断推理': 1, '言语理解': 2, '数量关系': 3, '常识判断': 4}
CORE_FIELDS = ('definition', 'principle', 'signals', 'steps', 'example', 'boundary')

CATEGORY_ORDER: dict[str, list[str]] = {
    '资料分析': ['读题定位与ABRX', '速算与估算', '增长体系', '比重·平均数·倍数', '比较与综合策略'],
    '判断推理': ['图形推理', '定义判断', '类比推理', '翻译·真假·分析推理', '加强削弱与论证'],
    '言语理解': ['逻辑填空', '中心理解', '意图·标题·细节', '语句排序与衔接', '词语与语境'],
    '数量关系': ['方法入口与取舍', '工程·行程', '利润·浓度·比例', '排列组合·概率', '方程·代入·数字特性', '几何·最值·其他母题'],
    '常识判断': ['常识排除与滚动积累'],
}


def _method_sort_key(method_id: str) -> tuple[str, int]:
    match = re.match(r'([A-Z]+)(\d+)$', method_id)
    return (match.group(1), int(match.group(2))) if match else (method_id, 999)


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return default


@lru_cache(maxsize=1)
def load_mapping() -> dict[str, str]:
    payload = _read_json(MAPPING_PATH, {})
    mapping = payload.get('method_to_node', {}) if isinstance(payload, dict) else {}
    return {str(key).upper(): str(value) for key, value in mapping.items() if key and value}


def _infer_category(row: dict[str, Any]) -> str:
    module = str(row.get('module') or '')
    text = ' '.join(str(row.get(k) or '') for k in ('title', 'definition', 'source_method_label', 'node_slug')).lower()

    if module == '资料分析':
        # A method may mention ABRX as its theoretical parent while actually being a speed-calculation technique.
        # Classify concrete speed cues first so 415份数法/截位直除等不会被 the generic ABRX token swallowed.
        if any(k in text for k in ('截位', '直除', '415', '份数', '假设', '分数', '估算', '首数', '差分', '化除为乘')):
            return '速算与估算'
        if any(k in text for k in ('abrx', '读题', '对象', '时期', '问法', '定位')):
            return '读题定位与ABRX'
        if any(k in text for k in ('增长率', '增长量', '基期', '现期', '年均')):
            return '增长体系'
        if any(k in text for k in ('比重', '平均', '倍数', '混合')):
            return '比重·平均数·倍数'
        return '比较与综合策略'

    if module == '判断推理':
        if any(k in text for k in ('图形', '图推', '六面体', '立体', '空间', '对称', '旋转')):
            return '图形推理'
        if '定义' in text:
            return '定义判断'
        if '类比' in text:
            return '类比推理'
        if any(k in text for k in ('翻译', '真假', '集合', '分析推理', '排列', '分组', '匹配')):
            return '翻译·真假·分析推理'
        return '加强削弱与论证'

    if module == '言语理解':
        if any(k in text for k in ('逻辑填空', '填空', '成语', '实词')):
            return '逻辑填空'
        if any(k in text for k in ('中心', '主旨', '主题')):
            return '中心理解'
        if any(k in text for k in ('意图', '标题', '细节', '下文')):
            return '意图·标题·细节'
        if any(k in text for k in ('排序', '衔接', '语句', '首句')):
            return '语句排序与衔接'
        return '词语与语境'

    if module == '数量关系':
        if any(k in text for k in ('价值', '取舍', '必做', '蒙题', '优先级', '题池')):
            return '方法入口与取舍'
        if any(k in text for k in ('工程', '行程', '相遇', '追及', '流水')):
            return '工程·行程'
        if any(k in text for k in ('利润', '浓度', '比例', '溶液', '牛吃草')):
            return '利润·浓度·比例'
        if any(k in text for k in ('排列', '组合', '概率', '容斥')):
            return '排列组合·概率'
        if any(k in text for k in ('方程', '代入', '整除', '奇偶', '尾数', '数字特性')):
            return '方程·代入·数字特性'
        return '几何·最值·其他母题'

    return '常识排除与滚动积累'


def _normalize(item: dict[str, Any]) -> dict[str, Any]:
    row = dict(item)
    comparison = str(row.get('comparison') or '')
    marker = '考场调用指令'
    if not row.get('exam_command') and marker in comparison:
        before, _, after = comparison.partition(marker)
        row['comparison'] = before.strip()
        row['exam_command'] = after.strip(' ：:\n')
    if not row.get('source_note'):
        row['source_note'] = str(row.get('evidence') or row.get('source_method_label') or '来源见V2正文')
    return row


def _load_source_catalog() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not SOURCE_DIR.exists():
        return rows
    for path in sorted(SOURCE_DIR.glob('*.json')):
        payload = _read_json(path, {})
        if not isinstance(payload, dict):
            continue
        for item in payload.get('items', []):
            if isinstance(item, dict):
                rows.append(_normalize(item))
    return rows


@lru_cache(maxsize=1)
def load_catalog() -> list[dict[str, Any]]:
    rows = _load_source_catalog()
    mapping = load_mapping()
    seen: set[str] = set()
    clean: list[dict[str, Any]] = []
    for row in rows:
        method_id = str(row.get('id') or '').upper()
        if not method_id or method_id in seen:
            continue
        if not row.get('title') or not row.get('module'):
            continue
        if any(not row.get(field) for field in CORE_FIELDS):
            continue
        row['id'] = method_id
        row['node_slug'] = mapping.get(method_id)
        row['category'] = _infer_category(row)
        row['category_path'] = [str(row.get('module')), row['category']]
        seen.add(method_id)
        clean.append(row)
    clean.sort(key=lambda item: (
        MODULE_ORDER.get(str(item.get('module')), 99),
        CATEGORY_ORDER.get(str(item.get('module')), []).index(str(item.get('category')))
        if str(item.get('category')) in CATEGORY_ORDER.get(str(item.get('module')), []) else 99,
        _method_sort_key(str(item.get('id') or '')),
    ))
    return clean


def hierarchy() -> list[dict[str, Any]]:
    grouped: dict[str, Counter[str]] = defaultdict(Counter)
    for row in load_catalog():
        grouped[str(row.get('module') or '其他')][str(row.get('category') or '其他')] += 1
    out: list[dict[str, Any]] = []
    for module in sorted(grouped, key=lambda x: MODULE_ORDER.get(x, 99)):
        preferred = CATEGORY_ORDER.get(module, [])
        cats = sorted(grouped[module], key=lambda x: preferred.index(x) if x in preferred else 99)
        out.append({
            'module': module,
            'count': sum(grouped[module].values()),
            'children': [{'category': cat, 'count': grouped[module][cat]} for cat in cats],
        })
    return out


def summary() -> dict[str, Any]:
    rows = load_catalog()
    counts = {module: 0 for module in MODULE_ORDER}
    for row in rows:
        module = str(row.get('module') or '其他')
        counts[module] = counts.get(module, 0) + 1
    manifest = _read_json(MANIFEST_PATH, {})
    mapped = sum(1 for row in rows if row.get('node_slug'))
    return {
        'total': len(rows),
        'mapped': mapped,
        'counts': counts,
        'hierarchy': hierarchy(),
        'source': manifest.get('source') or '行测全题型方法与技巧大全_GitHub技能融合深化版V2.docx',
        'version': manifest.get('version') or '2026-09-v2-source-grounded',
        'composition': manifest.get('composition') or {},
        'quality_rule': '正式方法必须同时包含识别信号、底层原理、标准操作、完整例题和失效边界；总方法论与复盘协议不虚增进正式方法数。',
    }


def search_methods(module: str = '', q: str = '', category: str = '') -> list[dict[str, Any]]:
    normalized_query = re.sub(r'\s+', '', q).lower()
    out: list[dict[str, Any]] = []
    for row in load_catalog():
        if module and row.get('module') != module:
            continue
        if category and row.get('category') != category:
            continue
        if normalized_query:
            values: list[str] = []
            for key in ('id', 'title', 'module', 'category', 'definition', 'principle', 'evidence', 'source_note', 'exam_command', 'comparison', 'variants', 'node_slug'):
                value = row.get(key)
                if value:
                    values.append(str(value))
            for key in ('signals', 'steps'):
                values.extend(str(item) for item in (row.get(key) or []))
            haystack = re.sub(r'\s+', '', '\n'.join(values)).lower()
            if normalized_query not in haystack:
                continue
        out.append(row)
    return out


def get_method(method_id: str) -> dict[str, Any] | None:
    target = method_id.strip().upper()
    for row in load_catalog():
        if str(row.get('id') or '').upper() == target:
            return row
    return None
