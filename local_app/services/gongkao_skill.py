from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from services.knowledge_reader import lens_documents
from services.method_library import load_catalog

BASE = Path(__file__).resolve().parents[1]
SKILL_DIR = BASE / 'skills' / 'gongkao-method-coach'
SKILL_EXTRACT_DIR = BASE / 'content' / 'skill_extracts'
METHOD_DIR = BASE / 'content' / 'methods'
NODE_DIR = BASE / 'content' / 'nodes'
SECRETS_PATH = BASE / 'data' / 'secrets.json'
CURRENT_MODEL = 'deepseek-flash'
LEGACY_MODEL_ALIASES = {
    'deepseek-v4-flash': CURRENT_MODEL,
    'deepseek-v4-flash-vision-exp': CURRENT_MODEL,
    'deepseek-chat': CURRENT_MODEL,
    'deepseek-reasoner': CURRENT_MODEL,
}
ALLOWED_MODELS = {CURRENT_MODEL, 'deepseek-v4-pro'}
DEFAULT_MODEL = CURRENT_MODEL

KEYWORD_GROUPS = {
    '资料分析': ['资料', '基期', '现期', '增长率', '增长量', '比重', '百分点', '平均数', '倍数', '截位', '直除', '415', '份数', 'ABRX', '混合增长', '误差护栏', '选项差距'],
    '判断推理': ['判断', '逻辑', '加强', '削弱', '前提', '假设', '翻译推理', '分析推理', '类比', '图形', '图推', '定义判断', '六面体'],
    '言语理解': ['言语', '主旨', '中心', '意图', '逻辑填空', '成语', '词语', '排序', '衔接', '细节', '语境'],
    '数量关系': ['数量', '排列', '组合', '概率', '工程', '行程', '利润', '容斥', '最值', '几何', '年龄', '方程', '牛吃草', '数字推理', '代入'],
    '常识判断': ['常识', '政治', '法律', '科技', '措辞', '绝对词'],
    '复盘策略': ['复盘', '错题', '模考', '超时', '蒙对', '纠结', '时间', '弃题', '止损', '提速', '训练', '降级路径', '调度', '恢复'],
    '计划与证据': ['计划', '阶段', '晋级', '样本', '证据', '薄弱', '正确率', '学习时间', '任务'],
}


def normalize_model(model: str | None) -> str:
    value = str(model or '').strip() or DEFAULT_MODEL
    return LEGACY_MODEL_ALIASES.get(value, value)


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return default


def load_skill_text() -> str:
    path = SKILL_DIR / 'SKILL.md'
    return path.read_text(encoding='utf-8') if path.exists() else ''


def load_sources() -> list[dict[str, Any]]:
    data = _read_json(SKILL_DIR / 'sources.json', {'sources': []})
    return list(data.get('sources') or [])


def _method_text(item: dict[str, Any]) -> str:
    body_parts: list[str] = []
    for field in ('source_method_label', 'module', 'category', 'definition', 'signals', 'principle', 'steps', 'example', 'boundary', 'comparison', 'variants', 'exam_command', 'evidence', 'source_note'):
        value = item.get(field)
        if isinstance(value, list):
            value = '\n'.join(str(x) for x in value)
        if value:
            body_parts.append(f'{field}: {value}')
    return '\n'.join(body_parts)


def load_method_documents() -> list[dict[str, str]]:
    docs: list[dict[str, str]] = []
    for path in sorted(METHOD_DIR.glob('*.json')):
        data = _read_json(path, {})
        for key in ('principles', 'review_protocols', 'items'):
            for item in data.get(key, []) if isinstance(data, dict) else []:
                if isinstance(item, dict):
                    title = str(item.get('title') or item.get('name') or item.get('id') or path.stem)
                    docs.append({'kind': 'method', 'title': title, 'source': f'content/methods/{path.name}', 'text': _method_text(item) or str(item.get('body') or '')})
    for item in load_catalog():
        docs.append({'kind': 'method', 'title': str(item.get('title') or item.get('id')), 'source': 'content/methods/source/*.json', 'text': _method_text(item)})
    return docs


def _strip_front_matter(text: str) -> str:
    if not text.startswith('---'):
        return text
    end = text.find('\n---', 3)
    return text[end + 4:] if end >= 0 else text


def load_node_documents() -> list[dict[str, str]]:
    docs: list[dict[str, str]] = []
    for path in sorted(NODE_DIR.glob('*.md')):
        text = path.read_text(encoding='utf-8')
        title_match = re.search(r'(?m)^title:\s*(.+)$', text)
        title = title_match.group(1).strip() if title_match else path.stem
        docs.append({'kind': 'node', 'title': title, 'source': f'content/nodes/{path.name}', 'text': _strip_front_matter(text)})
    return docs


def load_skill_documents() -> list[dict[str, str]]:
    docs: list[dict[str, str]] = []
    if not SKILL_EXTRACT_DIR.exists():
        return docs
    for path in sorted(SKILL_EXTRACT_DIR.glob('*.md')):
        text = path.read_text(encoding='utf-8')
        for index, section in enumerate(re.split(r'(?m)^##\s+', text)):
            section = section.strip()
            if not section:
                continue
            first, *rest = section.splitlines()
            title = first.strip('# ').strip() if index else path.stem
            body = '\n'.join(rest).strip() if rest else section
            if len(body) < 80:
                continue
            docs.append({'kind': 'skill_secondary', 'title': f'GitHub Skill｜{title}', 'source': f'content/skill_extracts/{path.name}', 'text': body})
    return docs


def load_skill_lens_documents() -> list[dict[str, str]]:
    return lens_documents()


def _query_terms(query: str) -> list[str]:
    terms: list[str] = []
    compact = re.sub(r'\s+', '', query)
    for group, words in KEYWORD_GROUPS.items():
        if any(word.lower() in compact.lower() for word in words):
            terms.append(group)
            terms.extend(word for word in words if word.lower() in compact.lower())
    terms.extend(x for x in re.split(r'[\s，。！？、；：,.!?;:()（）]+', query) if len(x) >= 2)
    seen: set[str] = set()
    return [x for x in terms if not (x in seen or seen.add(x))]


def _score_doc(doc: dict[str, str], terms: list[str], query: str) -> int:
    hay = f"{doc['title']}\n{doc['text']}".lower()
    score = 0
    for term in terms:
        count = hay.count(term.lower())
        if count:
            score += 5 if term.lower() in doc['title'].lower() else min(7, count)
    compact_query = re.sub(r'\s+', '', query).lower()
    if compact_query and compact_query in re.sub(r'\s+', '', hay):
        score += 10
    if doc.get('kind') == 'skill_lens' and score:
        score += 2
    return score


def retrieve_context(query: str, limit: int = 8, char_budget: int = 22000) -> list[dict[str, str]]:
    terms = _query_terms(query)
    docs = load_method_documents() + load_node_documents() + load_skill_documents()
    docs += load_skill_lens_documents()
    kind_priority = {'method': 0, 'node': 1, 'skill_lens': 2, 'skill_secondary': 3}
    ranked: list[tuple[int, int, dict[str, str]]] = []
    for doc in docs:
        score = _score_doc(doc, terms, query)
        if score:
            ranked.append((score, kind_priority.get(doc['kind'], 9), doc))
    ranked.sort(key=lambda x: (-x[0], x[1], x[2]['title']))

    chosen: list[dict[str, str]] = []
    seen_sources: set[tuple[str, str]] = set()

    def add(doc: dict[str, str]) -> None:
        key = (doc['kind'], doc['source'])
        if key not in seen_sources:
            seen_sources.add(key)
            chosen.append(doc)

    for wanted in (('method', 'node'), ('skill_lens', 'skill_secondary')):
        hit = next((doc for score, _, doc in ranked if score > 0 and doc['kind'] in wanted), None)
        if hit:
            add(hit)
    for _, _, doc in ranked:
        if len(chosen) >= limit:
            break
        add(doc)
    if not chosen:
        chosen = load_method_documents()[:min(4, limit)]

    selected: list[dict[str, str]] = []
    used = 0
    for doc in chosen:
        remaining = char_budget - used
        if remaining <= 500:
            break
        text = doc['text'][:remaining]
        selected.append({**doc, 'text': text})
        used += len(text)
        if len(selected) >= limit:
            break
    return selected


def build_system_prompt(query: str) -> tuple[str, list[dict[str, str]]]:
    skill = load_skill_text()
    context = retrieve_context(query)
    blocks = []
    for i, item in enumerate(context, 1):
        if item['kind'] == 'skill_lens':
            evidence = '按考点整理的 GitHub Skill 二级讲法视角'
        elif item['kind'] == 'skill_secondary':
            evidence = '通用 GitHub Skill 二级整理证据'
        else:
            evidence = '本地正式材料'
        blocks.append(f"### 检索材料 {i}｜{item['title']}\n证据级别：{evidence}\n来源：{item['source']}\n{item['text']}")
    prompt = f"""{skill}

# 本轮本地检索材料
以下材料分为正式方法/知识节点与 GitHub Skill 二级证据。正式材料负责正确性底座；Skill 讲法视角负责补充老师式的识别入口、考场取舍、速解思路和复盘重点。二级整理不得冒充老师本人逐字原话。

{chr(10).join(blocks)}

# 本轮回答纪律
1. 先直接回答用户问题，再解释方法；不要先讲泛泛背景。
2. 具体题目按“识别信号 → 主方法 → 最短安全路径 → 边界/止损 → 下一次调用规则”作答。
3. 检索到 skill_lens 时，必须吸收其中至少一个真正相关的讲法重点，而不是只在末尾列来源。
4. 资料分析优先执行“翻译问法 → 扫选项 → 定性/范围 → 最低成本算法 → 误差护栏 → 坑位复核”；唯一选项稳定时停止继续计算。
5. 卡题要给降级路径：换入口/借选项 → 基础法 → 超预算则跳；不要在同一技巧上无限加时。
6. 复盘区分调度、读取、知识、方法、执行、恢复六类故障，只保留下一次可验证规则。
7. 正确题也检查蒙对、超时和绕路，不把“做对”自动写成“掌握”。
8. GitHub Skill 都是二次整理证据；没有一手材料时只能写“该 Skill 整理强调/本平台采用”，不得写成老师本人确定原话。
9. 本地材料没有覆盖或需要最新官方事实才能确认时，明确说需要外部核验，不猜。
10. 末尾“依据：”只列本轮真正使用的 1–3 个材料标题。
"""
    return prompt, context


def load_secret_config() -> dict[str, Any]:
    stored = _read_json(SECRETS_PATH, {})
    env_key = os.environ.get('DEEPSEEK_API_KEY', '').strip()
    model = normalize_model(str(stored.get('model') or DEFAULT_MODEL))
    if model not in ALLOWED_MODELS:
        model = DEFAULT_MODEL
    return {
        'api_key': env_key or str(stored.get('api_key') or ''),
        'model': model,
        'thinking': bool(stored.get('thinking', False)),
        'key_source': 'environment' if env_key else ('local' if stored.get('api_key') else 'none'),
    }


def public_config() -> dict[str, Any]:
    cfg = load_secret_config()
    return {
        'configured': bool(cfg['api_key']),
        'model': cfg['model'],
        'thinking': cfg['thinking'],
        'key_source': cfg['key_source'],
        'models': [
            {'id': CURRENT_MODEL, 'label': 'DeepSeek V4.1 Flash · 当前推荐', 'note': '官方当前模型名为 deepseek-flash，适合日常问答、错题解析与结构化输出'},
            {'id': 'deepseek-v4-pro', 'label': 'DeepSeek V4 Pro · 兼容入口', 'note': '官方当前会路由到 V4.1 Flash；保留仅用于旧配置兼容'},
        ],
        'model_notice': '旧 deepseek-v4-flash / deepseek-v4-flash-vision-exp / deepseek-chat / deepseek-reasoner 配置会自动迁移到 deepseek-flash。',
    }


def save_secret_config(*, api_key: str | None, model: str, thinking: bool, clear_key: bool = False) -> dict[str, Any]:
    normalized = normalize_model(model)
    if normalized not in ALLOWED_MODELS:
        raise ValueError('不支持的 DeepSeek 模型')
    existing = _read_json(SECRETS_PATH, {})
    if clear_key:
        existing.pop('api_key', None)
    elif api_key is not None and api_key.strip():
        existing['api_key'] = api_key.strip()
    existing['model'] = normalized
    existing['thinking'] = bool(thinking)
    SECRETS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SECRETS_PATH.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding='utf-8')
    try:
        os.chmod(SECRETS_PATH, 0o600)
    except OSError:
        pass
    return public_config()
