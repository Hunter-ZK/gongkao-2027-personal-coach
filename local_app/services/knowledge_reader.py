from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parents[1]
LENS_PATH = BASE / 'content' / 'knowledge_lenses.json'

SECTION_RULES: list[tuple[str, tuple[str, ...]]] = [
    ('example', ('例题', '示例', '实战')),
    ('speed', ('最快', '速解', '速算', '选项', '精度', '停止', '止损', '考场')),
    ('boundary', ('边界', '失效', '陷阱', '易错', '误区', '不适用')),
    ('review', ('复盘', '训练', '回忆', '检测', '巩固')),
    ('recognition', ('识别', '题型', '信号', '问法', '触发')),
    ('deep', ('深入', '为什么', '原理', '本质', '推导')),
    ('method', ('核心', '方法', '步骤', '公式', '模型', '关系', '体系', '框架')),
]


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return default


@lru_cache(maxsize=1)
def load_lenses() -> dict[str, Any]:
    payload = _read_json(LENS_PATH, {'nodes': {}})
    return payload if isinstance(payload, dict) else {'nodes': {}}


def node_profile(slug: str) -> dict[str, Any]:
    payload = load_lenses()
    row = (payload.get('nodes') or {}).get(slug) or {}
    return {
        'positioning': str(row.get('positioning') or ''),
        'priority': [str(x) for x in row.get('priority') or [] if str(x).strip()],
        'exam_route': [str(x) for x in row.get('exam_route') or [] if str(x).strip()],
        'avoid': [str(x) for x in row.get('avoid') or [] if str(x).strip()],
        'training': [str(x) for x in row.get('training') or [] if str(x).strip()],
        'lenses': [x for x in row.get('lenses') or [] if isinstance(x, dict)],
        'evidence_policy': str(payload.get('evidence_policy') or ''),
    }


def lens_documents() -> list[dict[str, str]]:
    payload = load_lenses()
    docs: list[dict[str, str]] = []
    for slug, row in (payload.get('nodes') or {}).items():
        if not isinstance(row, dict):
            continue
        parts = [
            f"考点：{slug}",
            f"本节定位：{row.get('positioning') or ''}",
            '侧重点：' + '；'.join(str(x) for x in row.get('priority') or []),
            '考场调用：' + ' → '.join(str(x) for x in row.get('exam_route') or []),
            '不要这样做：' + '；'.join(str(x) for x in row.get('avoid') or []),
            '训练重点：' + '；'.join(str(x) for x in row.get('training') or []),
        ]
        for lens in row.get('lenses') or []:
            if not isinstance(lens, dict):
                continue
            parts.append(
                f"讲法视角：{lens.get('label') or '二级整理'}｜{lens.get('focus') or ''}｜来源：{lens.get('source') or ''}"
            )
        docs.append({
            'kind': 'skill_lens',
            'title': f"考点讲法｜{slug}",
            'source': f'content/knowledge_lenses.json#{slug}',
            'text': '\n'.join(x for x in parts if x.strip()),
        })
    return docs


def _strip_front_matter(text: str) -> str:
    value = (text or '').strip()
    if not value.startswith('---'):
        return value
    end = value.find('\n---', 3)
    return value[end + 4:].lstrip() if end >= 0 else value


def _clean_title(title: str) -> str:
    return re.sub(r'[`*_#]+', '', title or '').strip(' ：:') or '核心内容'


def _kind(title: str) -> str:
    compact = _clean_title(title)
    for kind, words in SECTION_RULES:
        if any(word in compact for word in words):
            return kind
    return 'other'


def parse_sections(markdown: str) -> list[dict[str, Any]]:
    text = _strip_front_matter(markdown)
    if not text:
        return []
    lines = text.splitlines()
    sections: list[dict[str, Any]] = []
    current_title = '核心内容'
    current_level = 2
    buf: list[str] = []

    def push() -> None:
        nonlocal buf
        body = '\n'.join(buf).strip()
        if not body:
            buf = []
            return
        title = _clean_title(current_title)
        sections.append({
            'id': f's{len(sections) + 1}',
            'title': title,
            'kind': _kind(title),
            'level': current_level,
            'body': body,
        })
        buf = []

    for line in lines:
        match = re.match(r'^(#{2,3})\s+(.+?)\s*$', line)
        if match:
            push()
            current_level = len(match.group(1))
            current_title = match.group(2)
            continue
        if re.match(r'^#\s+', line) and not sections and not buf:
            continue
        buf.append(line)
    push()
    if not sections:
        return [{'id': 's1', 'title': '核心内容', 'kind': 'other', 'level': 2, 'body': text}]
    return sections


def _lesson_order(section: dict[str, Any]) -> tuple[int, int]:
    order = {
        'recognition': 0,
        'method': 1,
        'speed': 2,
        'example': 3,
        'boundary': 4,
        'review': 5,
        'deep': 6,
        'other': 7,
    }
    try:
        seq = int(str(section.get('id') or 's0').lstrip('s'))
    except ValueError:
        seq = 999
    return order.get(str(section.get('kind')), 9), seq


def reading_pack(slug: str, module: str, body: str) -> dict[str, Any]:
    sections = parse_sections(body)
    profile = node_profile(slug)
    fallback_position = f'本节用于恢复「{module}」中的核心考点，并把知识转成可在考场直接调用的判断与动作。'
    if not profile['positioning']:
        profile['positioning'] = fallback_position
    if not profile['priority']:
        candidates = [s['title'] for s in sections if s['kind'] in {'recognition', 'method', 'speed'}]
        profile['priority'] = candidates[:4] or [s['title'] for s in sections[:3]]
    if not profile['exam_route']:
        profile['exam_route'] = ['先识别题型与关键条件', '调用本节主方法', '用选项/边界做复核', '形成下一次可复现规则']
    if not profile['avoid']:
        profile['avoid'] = ['只背结论、不看适用条件', '做对一次就判断已经掌握']
    if not profile['training']:
        profile['training'] = ['用真实题验证识别速度、正确率和方法稳定性']

    lesson = sorted(sections, key=_lesson_order)
    return {
        'slug': slug,
        'module': module,
        'profile': profile,
        'sections': sections,
        'lesson_sections': lesson,
        'toc': [{'id': x['id'], 'title': x['title'], 'kind': x['kind']} for x in sections],
        'evidence_policy': profile.get('evidence_policy') or '',
    }
