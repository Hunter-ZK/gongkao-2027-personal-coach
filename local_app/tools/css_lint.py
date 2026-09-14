#!/usr/bin/env python3
"""Frontend visual lint aligned with the current Civil_gemini2 design baseline."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

# Civil_gemini2 deliberately uses rounded cards, tiny metadata labels, subtle shadows,
# gradients in the dashboard hero, and a 256px sidebar. These values supersede the
# older flat 6px/no-shadow visual baseline. Fully-pill controls may use 999px.
MAX_RADIUS = 28
MIN_FONT_SIZE = 8.0
MAX_SIDEBAR_W = 260

ICON_GLYPHS = "⌂✓◷▤□↻⇧◇✎◎↗✦★☆●◆▲▼■◼▣⊙⊕⊗✧✩➤➜⟶⇨"
EMOJI = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F900-\U0001F9FF\u2700-\u27bf]"
)

BANNED_CSS = [
    (r"text-transform\s*:\s*uppercase", "WARN", "避免用 CSS 强制全大写中文界面标签"),
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
    "--bg": "#F5F5F4",
    "--surface": "#FFFFFF",
    "--surface-sunk": "#FAFAF9",
    "--border": "#E7E5E4",
    "--border-strong": "#D6D3D1",
    "--text": "#1C1917",
    "--text-sub": "#57534E",
    "--text-mute": "#78716C",
    "--accent": "#1C1917",
    "--accent-hover": "#292524",
    "--correct": "#047857",
    "--wrong": "#BE123C",
    "--pending": "#B45309",
}

TELL_COLORS = {
    "4f46e5": "Tailwind indigo-600，当前 Civil_gemini2 视觉基线不使用其作为主色",
    "6366f1": "Tailwind indigo-500，当前 Civil_gemini2 视觉基线不使用其作为主色",
    "8b5cf6": "Tailwind violet-500，当前 Civil_gemini2 视觉基线不使用其作为主色",
    "7c3aed": "Tailwind violet-600，当前 Civil_gemini2 视觉基线不使用其作为主色",
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
        # 999px/9999px are explicit pill radii, not card geometry. Variables are
        # checked separately below, and percentage radii are naturally self-bounded.
        if "%" in val or "var(" in val or "999px" in val or "9999" in val:
            continue
        for px in RE_PX.findall(val):
            if float(px) > MAX_RADIUS:
                out.append(Issue(str(path), line_of(m.start()), "ERROR", "V2", f"圆角 {px}px 超过当前上限 {MAX_RADIUS}px", snip(m.start())))
                break

    for m in RE_VAR_DEF.finditer(text):
        name, val = m.group(1), m.group(2)
        if re.search(r"radius|^--r(xl|lg|md|sm)$", name):
            for px in RE_PX.findall(val):
                if float(px) > MAX_RADIUS and float(px) < 999:
                    out.append(Issue(str(path), line_of(m.start()), "ERROR", "V2", f"圆角变量 {name}={val.strip()} 超过 {MAX_RADIUS}px"))
                    break

    # Subtle card shadows are part of the copied Civil_gemini2 UI. Keep them visible
    # to reviewers but do not fail CI. Heavy visual regressions should be reviewed by
    # screenshot/acceptance tests rather than blanket banning all box shadows.
    for m in RE_SHADOW.finditer(text):
        val = m.group(1).strip()
        if val.startswith("none") or "var(" in val:
            continue
        out.append(Issue(str(path), line_of(m.start()), "WARN", "V3", "检测到阴影；确认其属于 Civil_gemini2 的卡片/浮层层级", snip(m.start())))

    for regex in (RE_FONTSZ, RE_FONTSHORT):
        for m in regex.finditer(text):
            v = float(m.group(1))
            if v < MIN_FONT_SIZE:
                out.append(Issue(str(path), line_of(m.start()), "ERROR", "V4", f"字号 {v}px 低于当前下限 {MIN_FONT_SIZE}px", snip(m.start())))

    fams = set()
    for m in RE_FONTFAMILY.finditer(text):
        val = (m.group(1) or m.group(2) or "")
        for f in re.findall(r'"([^"]+)"|\'([^\']+)\'', val):
            name = (f[0] or f[1]).strip()
            if name and not name.startswith("-"):
                fams.add(name)
    latin = {f for f in fams if re.fullmatch(r"[A-Za-z0-9 .\-]+", f)}
    web_latin = latin - {"system-ui", "ui-monospace", "sans-serif", "serif", "monospace"}
    if len(web_latin) > 6:
        out.append(Issue(str(path), 1, "WARN", "V5", f"字族较多：{sorted(web_latin)}"))

    for m in re.finditer(r"\.sidebar[^{]*\{[^}]*width\s*:\s*([\d.]+)px", text):
        w = float(m.group(1))
        if w > MAX_SIDEBAR_W:
            out.append(Issue(str(path), line_of(m.start()), "ERROR", "V6", f"侧栏 {w}px 超过 Civil_gemini2 的 256px 基线"))

    used_tells = {}
    for m in RE_HEX.finditer(text):
        h = m.group(1).lower()
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if h in TELL_COLORS and h not in used_tells:
            used_tells[h] = m.start()
    for h, pos in used_tells.items():
        out.append(Issue(str(path), line_of(pos), "WARN", "V7", f"#{h} 是 {TELL_COLORS[h]}"))

    defined = {m.group(1): m.group(2).strip().rstrip(";") for m in RE_VAR_DEF.finditer(text)}
    if "--accent" in defined or "--bg" in defined:
        for name, expect in SPEC_TOKENS.items():
            if name in defined and expect.lower() not in defined[name].lower():
                out.append(Issue(str(path), 1, "WARN", "V8", f"{name} 实际 {defined[name]}，Civil_gemini2 基线 {expect}"))

    long_lines = [i + 1 for i, line in enumerate(_lines(text)) if len(line) > 500]
    if long_lines:
        out.append(Issue(str(path), long_lines[0], "ERROR", "V9", f"{len(long_lines)} 行超过 500 字符，影响 diff 与维护"))
    return out


def check_markup(path: Path) -> list[Issue]:
    text = path.read_text(encoding="utf-8", errors="replace")
    out: list[Issue] = []
    for i, line in enumerate(_lines(text), 1):
        if EMOJI.search(line):
            out.append(Issue(str(path), i, "ERROR", "V10", "emoji 不能替代产品图标，使用 SVG 图标", line.strip()[:70]))
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
