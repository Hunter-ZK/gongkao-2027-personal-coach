#!/usr/bin/env python3
"""
视觉规范检查。把 03-UI设计规范.md 的禁止清单变成可执行的检查。

用法:
    python tools/css_lint.py static/css/
    python tools/css_lint.py static/css/ templates/ static/js/
    python tools/css_lint.py static/css/ --json

退出码: 0 = 无 ERROR, 1 = 有 ERROR
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

MAX_RADIUS = 18
MIN_FONT_SIZE = 12.5
MAX_SIDEBAR_W = 240

ALLOWED_SHADOW_CONTEXTS = {
    "dialog", "popover", "dropdown", "tooltip", "menu",
    "overlay", "modal", "float", "drawer", "toast",
}

ICON_GLYPHS = "⌂✓◷▤□↻⇧◇✎◎↗✦★☆●◆▲▼■◼▣⊙⊕⊗✧✩➤➜⟶⇨"
EMOJI = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F900-\U0001F9FF\u2700-\u27bf]"
)

BANNED_CSS = [
    (r"\b(linear|radial|conic)-gradient\s*\(", "ERROR", "禁止渐变。03 禁止清单第 1 条"),
    (r"text-transform\s*:\s*uppercase", "ERROR", "禁止全大写英文标签。03 禁止清单第 3 条"),
    (r"backdrop-filter\s*:", "ERROR", "禁止毛玻璃。不在 03 允许的视觉手段内"),
    (r"transform\s*:\s*translate[XY]?\s*\([^)]*\)\s*[;}]?(?=[^}]*:hover)", "WARN", "hover 位移属于 03 禁止的卡片浮动效果"),
    (r"animation\s*:\s*(?!none)", "WARN", "动效只允许浮层出现与解析展开两处。03 第 6.2 节"),
    (r"letter-spacing\s*:\s*\.?\d*\.?\d+em(?=[^}]*text-transform)", "WARN", "tracked-out 大写标签"),
]

RE_RADIUS = re.compile(r"border-radius\s*:\s*([^;}]+)")
RE_SHADOW = re.compile(r"box-shadow\s*:\s*([^;}]+)")
RE_FONTSZ = re.compile(r"font-size\s*:\s*([\d.]+)px")
RE_FONTSHORT = re.compile(r"\bfont\s*:\s*[^;}]*?\b([\d.]+)px")
RE_PX = re.compile(r"([\d.]+)px")
RE_VAR_DEF = re.compile(r"(--[a-z0-9-]+)\s*:\s*([^;}]+)")
RE_FONTFAMILY = re.compile(r"font-family\s*:\s*([^;}]+)|--font[a-z-]*\s*:\s*([^;}]+)")
RE_HEX = re.compile(r"#([0-9a-fA-F]{3,8})\b")

SPEC_TOKENS = {
    "--bg": "#F5F6F8", "--surface": "#FFFFFF", "--surface-sunk": "#FAFBFC",
    "--border": "#E2E5EA", "--border-strong": "#C9CED6",
    "--text": "#1A1D23", "--text-sub": "#5C646F", "--text-mute": "#8E97A3",
    "--accent": "#23305E", "--accent-hover": "#2E3D74", "--accent-soft": "#EBEEF6",
    "--correct": "#1F7A5A", "--wrong": "#B4342B", "--pending": "#9A6B14",
    "--m0": "#C1C7D0", "--m1": "#8FA3C4", "--m2": "#5C7CB0",
    "--m3": "#33538F", "--m4": "#23305E",
}

TELL_COLORS = {
    "4f46e5": "Tailwind indigo-600，AI 生成后台的默认主色",
    "6366f1": "Tailwind indigo-500",
    "6d5dfc": "紫蓝渐变常用色",
    "8b5cf6": "Tailwind violet-500",
    "7c3aed": "Tailwind violet-600",
    "d97757": "Anthropic 交互强调色，出现在用户项目里是明显的生成痕迹",
    "f4f1ea": "暖奶油底，AI 生成页面的典型配色",
    "0f172a": "Tailwind slate-900，深色侧栏默认",
    "111827": "Tailwind gray-900",
}


@dataclass
class Issue:
    file: str
    line: int
    level: str
    code: str
    message: str
    snippet: str = ""


def _lines(text: str):
    return text.split("\n")


def check_css(path: Path) -> list[Issue]:
    text = path.read_text(encoding="utf-8", errors="replace")
    out: list[Issue] = []

    def line_of(pos: int) -> int:
        return text[:pos].count("\n") + 1

    def snip(pos: int, n: int = 60) -> str:
        return text[max(0, pos - 5): pos + n].replace("\n", " ").strip()

    for pattern, level, desc in BANNED_CSS:
        for m in re.finditer(pattern, text):
            out.append(Issue(str(path), line_of(m.start()), level, "V1", desc, snip(m.start())))

    for m in RE_RADIUS.finditer(text):
        val = m.group(1)
        if "%" in val or "var(" in val:
            continue
        for px in RE_PX.findall(val):
            if float(px) > MAX_RADIUS:
                out.append(Issue(str(path), line_of(m.start()), "ERROR", "V2", f"圆角 {px}px 超过上限 {MAX_RADIUS}px", snip(m.start())))
                break

    for m in RE_VAR_DEF.finditer(text):
        name, val = m.group(1), m.group(2)
        if re.search(r"radius|^--r(xl|lg|md|sm)$", name):
            for px in RE_PX.findall(val):
                if float(px) > MAX_RADIUS:
                    out.append(Issue(str(path), line_of(m.start()), "ERROR", "V2", f"圆角变量 {name}={val.strip()} 超过 {MAX_RADIUS}px"))
                    break

    for m in RE_SHADOW.finditer(text):
        val = m.group(1).strip()
        if val.startswith("none") or "var(" in val:
            continue
        head = text[max(0, m.start() - 800): m.start()].lower()
        if any(c in head for c in ALLOWED_SHADOW_CONTEXTS):
            continue
        out.append(Issue(str(path), line_of(m.start()), "ERROR", "V3", "只有浮层可以有阴影，层级用 1px 边框表达。03 第 3.3 节", snip(m.start())))
    for m in RE_VAR_DEF.finditer(text):
        if "shadow" in m.group(1) and "none" not in m.group(2):
            out.append(Issue(str(path), line_of(m.start()), "WARN", "V3", f"定义了全局阴影变量 {m.group(1)}，只应给浮层用"))

    for regex in (RE_FONTSZ, RE_FONTSHORT):
        for m in regex.finditer(text):
            v = float(m.group(1))
            if v < MIN_FONT_SIZE:
                out.append(Issue(str(path), line_of(m.start()), "ERROR", "V4", f"字号 {v}px 低于下限 {MIN_FONT_SIZE}px，长时间阅读伤眼", snip(m.start())))

    fams = set()
    for m in RE_FONTFAMILY.finditer(text):
        val = (m.group(1) or m.group(2) or "")
        for f in re.findall(r'"([^"]+)"|\'([^\']+)\'', val):
            name = (f[0] or f[1]).strip()
            if name and not name.startswith("-"):
                fams.add(name)
    latin = {f for f in fams if re.fullmatch(r"[A-Za-z0-9 .\-]+", f)}
    web_latin = latin - {"system-ui", "ui-monospace", "sans-serif", "serif", "monospace"}
    mono_like = {f for f in web_latin if re.search(r"mono|code|consol", f, re.I)}
    display_like = web_latin - mono_like
    if len(display_like) > 2:
        out.append(Issue(str(path), 1, "WARN", "V5", f"正文字族过多：{sorted(display_like)}。03 要求一个字族 + 一个等宽数字族"))
    for f in display_like:
        if f in {"Inter", "SF Pro Display", "Roboto", "Poppins", "Manrope"}:
            out.append(Issue(str(path), 1, "WARN", "V5", f"'{f}' 未随仓库分发，多数机器会 fallback，导致中英文字重与字宽错配。用系统栈"))

    for m in re.finditer(r"\.sidebar[^{]*\{[^}]*width\s*:\s*([\d.]+)px", text):
        w = float(m.group(1))
        if w > MAX_SIDEBAR_W:
            out.append(Issue(str(path), line_of(m.start()), "WARN", "V6", f"侧栏 {w}px，03 规定 224px。过宽会挤压数据表格"))

    used_tells = {}
    for m in RE_HEX.finditer(text):
        h = m.group(1).lower()
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if h in TELL_COLORS and h not in used_tells:
            used_tells[h] = m.start()
    for h, pos in used_tells.items():
        out.append(Issue(str(path), line_of(pos), "ERROR", "V7", f"#{h} 是 {TELL_COLORS[h]}。03 指定主色为 #23305E"))

    defined = {m.group(1): m.group(2).strip().rstrip(";") for m in RE_VAR_DEF.finditer(text)}
    if "--accent" in defined or "--bg" in defined or "--brand" in defined:
        for name, expect in SPEC_TOKENS.items():
            if name in defined:
                got = defined[name].lower()
                if expect.lower() not in got:
                    out.append(Issue(str(path), 1, "WARN", "V8", f"{name} 实际 {defined[name]}，03 规定 {expect}"))
        if "--brand" in defined and "--accent" not in defined:
            out.append(Issue(str(path), 1, "ERROR", "V8", "用了 --brand 而不是 03 规定的 --accent，token 体系未对齐"))

    ls = _lines(text)
    long_lines = [i + 1 for i, line in enumerate(ls) if len(line) > 400]
    if long_lines:
        out.append(Issue(str(path), long_lines[0], "ERROR", "V9", f"{len(long_lines)} 行超过 400 字符。CSS 被压成单行，无法 diff 也无法维护。一个选择器块一行以上，属性分行"))
    return out


def check_markup(path: Path) -> list[Issue]:
    text = path.read_text(encoding="utf-8", errors="replace")
    out: list[Issue] = []
    for i, line in enumerate(_lines(text), 1):
        if EMOJI.search(line):
            out.append(Issue(str(path), i, "ERROR", "V10", "emoji 不能当图标用，改用 16px 线性 SVG。03 禁止清单第 4 条", line.strip()[:70]))
        for glyph in ICON_GLYPHS:
            if glyph in line and ("nav-ico" in line or "icon" in line.lower()):
                out.append(Issue(str(path), i, "ERROR", "V10", f"用几何字符 '{glyph}' 当图标，改用 SVG", line.strip()[:70]))
                break
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("targets", nargs="+")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    issues: list[Issue] = []
    for target in args.targets:
        path = Path(target)
        files = [path] if path.is_file() else sorted(
            file for file in path.rglob("*")
            if file.suffix in {".css", ".html", ".js", ".jsx"} and "vendor" not in str(file)
        )
        for file in files:
            issues += check_css(file) if file.suffix == ".css" else check_markup(file)

    if args.json:
        print(json.dumps([issue.__dict__ for issue in issues], ensure_ascii=False, indent=2))
    else:
        by_file: dict[str, list[Issue]] = {}
        for issue in issues:
            by_file.setdefault(issue.file, []).append(issue)
        for file, items in sorted(by_file.items()):
            print(f"\n{file}")
            for issue in sorted(items, key=lambda x: x.line):
                marker = " ERROR" if issue.level == "ERROR" else "  WARN"
                print(f"{marker} {issue.code} L{issue.line}  {issue.message}")
                if issue.snippet:
                    print(f"        {issue.snippet}")
        n_err = sum(1 for issue in issues if issue.level == "ERROR")
        n_warn = len(issues) - n_err
        print(f"\n{'=' * 58}")
        print(f"ERROR {n_err}，WARN {n_warn}")
        if n_err == 0:
            print("视觉规范检查通过")
    return 1 if any(issue.level == "ERROR" for issue in issues) else 0


if __name__ == "__main__":
    sys.exit(main())