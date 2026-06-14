#!/usr/bin/env python3
"""Add romantitle to all bhajan YAML files (mirrors scripts/add-roman-titles.js)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
SECTIONS_FILE = CONTENT / "sections.yaml"

INDEP = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri",
    "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "अं": "an", "अः": "ah", "ऑ": "o",
}
CONS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng", "च": "ch", "छ": "chh",
    "ज": "j", "झ": "jh", "ञ": "ny", "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh",
    "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n", "प": "p",
    "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l",
    "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h", "क्ष": "ksh", "त्र": "tr",
    "ज्ञ": "gy", "ॐ": "Om",
}
MATRA = {
    "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri", "े": "e",
    "ै": "ai", "ो": "o", "ौ": "au", "ं": "n", "ः": "h", "्": "", "ॅ": "e", "ॉ": "o",
}


def is_devanagari(ch: str) -> bool:
    o = ord(ch)
    return 0x0900 <= o <= 0x097F


def title_case_word(w: str) -> str:
    if not w:
        return w
    if w == w.upper() and len(w) > 1:
        return w
    return w[0].upper() + w[1:].lower()


def transliterate_word(word: str) -> str:
    chars = list(word)
    out = []
    i = 0
    while i < len(chars):
        ch = chars[i]
        if not is_devanagari(ch):
            out.append(ch)
            i += 1
            continue
        if ch == "़":
            i += 1
            continue
        cons = None
        if i + 1 < len(chars):
            pair = ch + chars[i + 1]
            if pair in CONS:
                cons = pair
                i += 2
        if not cons and ch in CONS:
            cons = ch
            i += 1
        if cons:
            vowel = "a"
            if i < len(chars) and chars[i] in MATRA:
                m = MATRA[chars[i]]
                vowel = "" if m == "" else m
                i += 1
            out.append(CONS[cons] + vowel)
            continue
        if ch in INDEP:
            out.append(INDEP[ch])
            i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def devanagari_to_roman(text: str) -> str:
    parts = re.split(r"(\s+|[-–—,;:.!?()]+)", str(text or ""))
    out = []
    for part in parts:
        if part.strip() and re.search(r"[\u0900-\u097F]", part):
            out.append(title_case_word(transliterate_word(part)))
        else:
            out.append(part)
    return re.sub(r"\s+", " ", "".join(out)).strip()


def parse_sections() -> list[str]:
    folders = []
    for line in SECTIONS_FILE.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\s*folder:\s*(\S+)", line)
        if m:
            folders.append(m.group(1))
    return folders


def has_romantitle(text: str) -> bool:
    for line in text.splitlines():
        if line.startswith("romantitle:"):
            val = line.split(":", 1)[1].strip()
            return bool(val)
    return False


def get_title(text: str) -> str | None:
    for line in text.splitlines():
        if line.startswith("title:"):
            return line.split(":", 1)[1].strip()
    return None


def insert_romantitle(text: str, roman: str) -> str:
    lines = text.splitlines(keepends=True)
    out = []
    inserted = False
    for line in lines:
        out.append(line)
        if not inserted and line.startswith("title:"):
            nl = "\n" if line.endswith("\n") else ""
            out.append(f"romantitle: {roman}{nl}")
            inserted = True
    if not inserted:
        out.insert(0, f"romantitle: {roman}\n")
    return "".join(out)


def main() -> int:
    updated = skipped = 0
    for folder in parse_sections():
        dir_path = CONTENT / folder
        if not dir_path.is_dir():
            continue
        for path in sorted(dir_path.glob("*.yaml"), key=lambda p: p.name):
            text = path.read_text(encoding="utf-8-sig")
            if has_romantitle(text):
                skipped += 1
                continue
            title = get_title(text)
            if not title:
                print(f"skip (no title): {path.relative_to(ROOT)}", file=sys.stderr)
                continue
            roman = devanagari_to_roman(title)
            path.write_text(insert_romantitle(text, roman), encoding="utf-8")
            updated += 1
            try:
                print(path.relative_to(ROOT).as_posix())
            except UnicodeEncodeError:
                print(str(path.relative_to(ROOT)).encode("ascii", "backslashreplace").decode())
    print(f"\nDone: {updated} updated, {skipped} already had romantitle")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
