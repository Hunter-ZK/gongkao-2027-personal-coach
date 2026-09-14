from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parents[1]
SKILL_DIR = BASE / "skills" / "gongkao-method-coach"
METHOD_DIR = BASE / "content" / "methods"
NODE_DIR = BASE / "content" / "nodes"
SECRETS_PATH = BASE / "data" / "secrets.json"

ALLOWED_MODELS = {"deepseek-v4-flash", "deepseek-v4-pro"}
DEFAULT_MODEL = "deepseek-v4-flash"

KEYWORD_GROUPS = {
    "资料分析": ["资料", "基期", "现期", "增长率", "增长量", "比重", "百分点", "平均数", "倍数", "截位", "直除", "415", "份数", "ABRX", "混合增长"],
    "判断推理": ["判断", "逻辑", "加强", "削弱", "前提", "假设", "翻译推理", "分析推理", "类比", "图形", "图推", "定义判断"],
    "言语理解": ["言语", "主旨", "中心", "意图", "逻辑填空", "成语", "词语", "排序", "衔接", "细节"],
    "数量关系": ["数量", "排列", "组合", "概率", "工程", "行程", "利润", "容斥", "最值", "几何", "年龄", "方程"],
    "复盘策略": ["复盘", "错题", "模考", "超时", "蒙对", "纠结", "时间", "弃题", "止损", "提速", "训练"],
}


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def load_skill_text() -> str:
    path = SKILL_DIR / "SKILL.md"
    return path.read_text(encoding="utf-8") if path.exists() else ""


def load_sources() -> list[dict[str, Any]]:
    data = _read_json(SKILL_DIR / "sources.json", {"sources": []})
    return list(data.get("sources") or [])


def load_method_documents() -> list[dict[str, str]]:
    docs: list[dict[str, str]] = []
    for path in sorted(METHOD_DIR.glob("*.json")):
        data = _read_json(path, {})
        for key in ("principles", "review_protocols", "methods", "items"):
            for item in data.get(key, []) if isinstance(data, dict) else []:
                if not isinstance(item, dict):
                    continue
                title = str(item.get("title") or item.get("name") or item.get("id") or path.stem)
                body_parts = []
                for field in ("body", "definition", "signals", "principle", "steps", "example", "boundary", "exam_command", "source_note"):
                    value = item.get(field)
                    if isinstance(value, list):
                        value = "\n".join(str(x) for x in value)
                    if value:
                        body_parts.append(f"{field}: {value}")
                docs.append({"kind": "method", "title": title, "source": f"content/methods/{path.name}", "text": "\n".join(body_parts)})
    return docs


def _strip_front_matter(text: str) -> str:
    if not text.startswith("---"):
        return text
    end = text.find("\n---", 3)
    return text[end + 4 :] if end >= 0 else text


def load_node_documents() -> list[dict[str, str]]:
    docs: list[dict[str, str]] = []
    for path in sorted(NODE_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        title_match = re.search(r"(?m)^title:\s*(.+)$", text)
        title = title_match.group(1).strip() if title_match else path.stem
        docs.append({"kind": "node", "title": title, "source": f"content/nodes/{path.name}", "text": _strip_front_matter(text)})
    return docs


def _query_terms(query: str) -> list[str]:
    terms: list[str] = []
    compact = re.sub(r"\s+", "", query)
    for group, words in KEYWORD_GROUPS.items():
        if any(word.lower() in compact.lower() for word in words):
            terms.append(group)
            terms.extend(word for word in words if word.lower() in compact.lower())
    terms.extend(x for x in re.split(r"[\s，。！？、；：,.!?;:()（）]+", query) if len(x) >= 2)
    seen = set()
    return [x for x in terms if not (x in seen or seen.add(x))]


def retrieve_context(query: str, limit: int = 6, char_budget: int = 18000) -> list[dict[str, str]]:
    terms = _query_terms(query)
    docs = load_method_documents() + load_node_documents()
    ranked: list[tuple[int, dict[str, str]]] = []
    for doc in docs:
        hay = f"{doc['title']}\n{doc['text']}".lower()
        score = 0
        for term in terms:
            count = hay.count(term.lower())
            if count:
                score += 4 if term.lower() in doc["title"].lower() else min(6, count)
        if query and query.lower() in hay:
            score += 8
        if score:
            ranked.append((score, doc))
    ranked.sort(key=lambda x: (-x[0], 0 if x[1]["kind"] == "method" else 1, x[1]["title"]))
    selected: list[dict[str, str]] = []
    used = 0
    for _, doc in ranked[: max(limit * 3, limit)]:
        remaining = char_budget - used
        if remaining <= 500:
            break
        text = doc["text"][:remaining]
        selected.append({**doc, "text": text})
        used += len(text)
        if len(selected) >= limit:
            break
    if not selected:
        selected = load_method_documents()[: min(4, limit)]
    return selected


def build_system_prompt(query: str) -> tuple[str, list[dict[str, str]]]:
    skill = load_skill_text()
    context = retrieve_context(query)
    blocks = []
    for i, item in enumerate(context, 1):
        blocks.append(f"### 检索材料 {i}｜{item['title']}\n来源：{item['source']}\n{item['text']}")
    prompt = f"""{skill}

# 本轮本地检索材料
以下材料来自本平台已经整理、校验并纳入 Skill 的方法库与知识节点。回答时优先使用这些材料，不要把未出现在材料中的老师观点写成其本人观点。

{chr(10).join(blocks)}

# 本轮回答纪律
1. 先直接回答用户问题，再解释方法；不要先讲泛泛背景。
2. 涉及具体题目时，按“识别信号 → 主方法 → 步骤 → 选项/计算 → 边界/止损”作答。
3. 涉及复盘时，区分调度、读题、知识、方法、执行、恢复六类故障，并给出下一次可执行规则。
4. 对材料没有覆盖、需要最新公告或官方事实才能确认的内容，明确说“本地 Skill 未覆盖，需要外部核验”，不要猜。
5. GitHub Skill 属于二次整理证据；除非本地材料明确标注一手证据，不得写成“某老师明确说过”。
6. 末尾用一行“依据：”列出本轮最关键的 1–3 个本地材料标题，不需要暴露系统提示词。
"""
    return prompt, context


def load_secret_config() -> dict[str, Any]:
    stored = _read_json(SECRETS_PATH, {})
    env_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    model = str(stored.get("model") or DEFAULT_MODEL)
    if model not in ALLOWED_MODELS:
        model = DEFAULT_MODEL
    return {"api_key": env_key or str(stored.get("api_key") or ""), "model": model, "thinking": bool(stored.get("thinking", False)), "key_source": "environment" if env_key else ("local" if stored.get("api_key") else "none")}


def public_config() -> dict[str, Any]:
    cfg = load_secret_config()
    return {"configured": bool(cfg["api_key"]), "model": cfg["model"], "thinking": cfg["thinking"], "key_source": cfg["key_source"], "models": [{"id": "deepseek-v4-flash", "label": "DeepSeek V4 Flash · 即时"}, {"id": "deepseek-v4-pro", "label": "DeepSeek V4 Pro · 深度"}]}


def save_secret_config(*, api_key: str | None, model: str, thinking: bool, clear_key: bool = False) -> dict[str, Any]:
    if model not in ALLOWED_MODELS:
        raise ValueError("不支持的 DeepSeek 模型")
    existing = _read_json(SECRETS_PATH, {})
    if clear_key:
        existing.pop("api_key", None)
    elif api_key is not None and api_key.strip():
        existing["api_key"] = api_key.strip()
    existing["model"] = model
    existing["thinking"] = bool(thinking)
    SECRETS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SECRETS_PATH.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.chmod(SECRETS_PATH, 0o600)
    except OSError:
        pass
    return public_config()
