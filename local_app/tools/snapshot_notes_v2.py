from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FORMAL = ROOT / 'local_app' / 'content' / 'nodes'
SOURCE = ROOT / 'notes' / 'xingce'
SNAP = ROOT / 'notes' / '_snapshot_before_split'
SNAP_FORMAL = SNAP / 'formal_nodes'
SNAP_SOURCE = SNAP / 'source_notes'
PLAN = ROOT / 'plans' / 'experience-upgrade-v2'
REPORT = PLAN / '切分比对报告.md'
RESULTS = PLAN / '切分结果清单.md'
MANIFEST = SNAP / 'manifest.json'


def non_ws(text: str) -> str:
    return re.sub(r'\s+', '', text)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def frontmatter(text: str) -> dict[str, str]:
    if not text.startswith('---'):
        return {}
    end = text.find('\n---', 3)
    if end < 0:
        return {}
    out: dict[str, str] = {}
    for line in text[3:end].splitlines():
        if ':' in line:
            k, v = line.split(':', 1)
            out[k.strip()] = v.strip()
    return out


def body(text: str) -> str:
    if not text.startswith('---'):
        return text
    end = text.find('\n---', 3)
    return text[end + 4:].lstrip('\n') if end >= 0 else text


def sections(text: str) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    title = '核心内容'; buf: list[str] = []
    def push() -> None:
        nonlocal buf
        value = '\n'.join(buf).strip()
        if value:
            rows.append((title, value))
        buf = []
    for line in body(text).splitlines():
        m = re.match(r'^#{2,3}\s+(.+?)\s*$', line)
        if m:
            push(); title = m.group(1).strip(); continue
        if line.startswith('# ') and not rows and not buf:
            continue
        buf.append(line)
    push(); return rows


def situation_units(text: str) -> list[dict[str, str]]:
    fm = frontmatter(text); slug = fm.get('slug', 'unknown')
    sec = sections(text)
    triggers: list[str] = []
    for title, value in sec:
        if '识别' not in title and '信号' not in title:
            continue
        for line in value.splitlines():
            m = re.match(r'^\s*[-*]\s+(.+?)\s*$', line)
            if m:
                triggers.append(m.group(1).strip())
    if not triggers:
        for title, value in sec:
            if any(k in title for k in ('方法', '步骤', '速解', '考场')):
                first = re.split(r'[。！？；\n]', value.strip())[0].strip()
                if first:
                    triggers.append(first); break
    return [{'id': f'{slug}::s{i:02d}', 'trigger': value} for i, value in enumerate(triggers[:16], 1)]


def ensure_snapshot() -> bool:
    first = not SNAP_FORMAL.exists()
    SNAP_FORMAL.mkdir(parents=True, exist_ok=True)
    SNAP_SOURCE.mkdir(parents=True, exist_ok=True)
    if first:
        for path in sorted(FORMAL.glob('*.md')):
            shutil.copy2(path, SNAP_FORMAL / path.name)
        if SOURCE.exists():
            for path in sorted(SOURCE.glob('*.md')):
                shutil.copy2(path, SNAP_SOURCE / path.name)
    return first


def diff_count(a: str, b: str) -> int:
    x, y = non_ws(a), non_ws(b)
    common = min(len(x), len(y))
    return sum(1 for i in range(common) if x[i] != y[i]) + abs(len(x) - len(y))


def main() -> int:
    PLAN.mkdir(parents=True, exist_ok=True)
    created = ensure_snapshot()
    manifest = {'snapshot_created_by': 'snapshot_notes_v2.py', 'formal_nodes': [], 'source_notes': []}
    total_diff = 0; total_chars = 0; result_rows: list[dict[str, object]] = []
    for current in sorted(FORMAL.glob('*.md')):
        snap = SNAP_FORMAL / current.name
        current_text = current.read_text(encoding='utf-8')
        snap_text = snap.read_text(encoding='utf-8') if snap.exists() else ''
        diff = diff_count(snap_text, current_text)
        total_diff += diff; total_chars += len(non_ws(snap_text))
        fm = frontmatter(current_text); units = situation_units(current_text)
        manifest['formal_nodes'].append({'path': str(current.relative_to(ROOT)).replace('\\','/'), 'snapshot': str(snap.relative_to(ROOT)).replace('\\','/'), 'sha256': sha(snap) if snap.exists() else None, 'non_whitespace_chars': len(non_ws(snap_text)), 'difference_chars': diff})
        result_rows.append({'slug': fm.get('slug', current.stem), 'title': fm.get('title', current.stem), 'source': str(current.relative_to(ROOT)).replace('\\','/'), 'units': units})
    for src in sorted(SNAP_SOURCE.glob('*.md')):
        manifest['source_notes'].append({'path': str(src.relative_to(ROOT)).replace('\\','/'), 'sha256': sha(src), 'non_whitespace_chars': len(non_ws(src.read_text(encoding='utf-8')))})
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

    lines = ['# 切分比对报告', '', '> 自动生成；正式原文快照位于 `notes/_snapshot_before_split/formal_nodes/`。', '', f'- 首次创建快照：`{"是" if created else "否"}`', f'- 正式节点数：**{len(manifest["formal_nodes"])}**', f'- 快照非空白字符总数：**{total_chars}**', f'- **差异字符数：{total_diff}**', f'- 结论：**{"通过" if total_diff == 0 else "失败"}**', '', '## 逐文件结果', '', '| 文件 | 非空白字符 | 差异字符 |', '|---|---:|---:|']
    for row in manifest['formal_nodes']:
        lines.append(f"| `{row['path']}` | {row['non_whitespace_chars']} | {row['difference_chars']} |")
    REPORT.write_text('\n'.join(lines) + '\n', encoding='utf-8')

    out = ['# 切分结果清单', '', '> 情形级笔记采用虚拟 ID `parent_slug::unit_id`；正式 Markdown 原文不改写、不删除、不迁移。', '', f'- 节点数：**{len(result_rows)}**', f'- 情形单元数：**{sum(len(x["units"]) for x in result_rows)}**', '', '| 原节点 | 情形 ID | 触发信号 | 原文件 |', '|---|---|---|---|']
    for row in result_rows:
        units = row['units']
        if not units:
            out.append(f"| {row['title']} | `{row['slug']}::s01` | 无独立识别信号，保留为上位方法/出处 | `{row['source']}` |")
        else:
            for unit in units:
                trigger = str(unit['trigger']).replace('|', '\\|').replace('\n', ' ')
                out.append(f"| {row['title']} | `{unit['id']}` | {trigger} | `{row['source']}` |")
    RESULTS.write_text('\n'.join(out) + '\n', encoding='utf-8')
    print(f'formal_nodes={len(result_rows)} diff_chars={total_diff} report={REPORT.relative_to(ROOT)}')
    return 0 if total_diff == 0 else 2


if __name__ == '__main__':
    raise SystemExit(main())
