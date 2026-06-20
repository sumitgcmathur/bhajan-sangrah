#!/usr/bin/env python3
"""Rebuild corpus + Sanskrit spell dictionaries when Node is unavailable."""

from __future__ import annotations

import json
import re
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
SECTIONS_FILE = CONTENT / "sections.yaml"
ADMIN_PUBLIC = ROOT / "admin" / "public"
CORPUS_JSON = ADMIN_PUBLIC / "corpus-dictionary.json"
CORPUS_DIC = ADMIN_PUBLIC / "corpus.dic"
SANSKRIT_JSON = ADMIN_PUBLIC / "sanskrit-dictionary.json"
SANSKRIT_DIC = ADMIN_PUBLIC / "sanskrit-words.dic"
SA_DIC_URL = (
    "https://raw.githubusercontent.com/Shreeshrii/hindi-hunspell/master/Sanskrit/sa_IN.dic"
)
MARWARI_SECTIONS = {"horiya", "mooltatva", "ambikacharitra"}
MANTRA_SECTION = "mantra"
MIN_WORD_LEN = 2


def norm_word(word: str) -> str:
    return unicodedata.normalize("NFC", word or "")


def clean_spell_token(word: str) -> str:
    w = norm_word(word).strip()
    if not w:
        return ""
    prev = None
    while w and w != prev:
        prev = w
        w = re.sub(r"^[।॥]+|[।॥]+$", "", w)
        w = re.sub(r"^[\u0966-\u096F\d]+|[\u0966-\u096F\d]+$", "", w)
        w = re.sub(r"^[\u200C\u200D]+|[\u200C\u200D]+$", "", w)
        w = re.sub(r"^[\u0970-\u097F]+|[\u0970-\u097F]+$", "", w)
    return w


def tokenize_hindi_for_spell(text: str, min_len: int = MIN_WORD_LEN) -> list[str]:
    out: list[str] = []
    for raw in re.split(r"[^\u0900-\u097F]+", text or ""):
        w = clean_spell_token(raw)
        if len(w) >= min_len:
            out.append(w)
    return out


def load_sections() -> list[dict]:
    raw = SECTIONS_FILE.read_text(encoding="utf-8")
    body = "\n".join(line for line in raw.splitlines() if not line.strip().startswith("#"))
    sections: list[dict] = []
    current: dict | None = None
    for line in body.splitlines():
        if line.strip().startswith("- slug:"):
            if current:
                sections.append(current)
            current = {"slug": line.split(":", 1)[1].strip()}
        elif current is not None and line.strip().startswith("folder:"):
            current["folder"] = line.split(":", 1)[1].strip()
    if current:
        sections.append(current)
    return sections


def extract_text_from_yaml(path: Path) -> str:
    """Use full file text; YAML keys are ASCII so Devanagari tokens are lyric content."""
    return path.read_text(encoding="utf-8")


def hi_sort(words: set[str]) -> list[str]:
    try:
        import locale

        locale.setlocale(locale.LC_COLLATE, "hi_IN.UTF-8")
        return sorted(words, key=locale.strxfrm)
    except Exception:
        return sorted(words)


def write_hunspell_dic(words: list[str], dest: Path) -> None:
    dest.write_text(f"{len(words)}\n" + "\n".join(words) + "\n", encoding="utf-8")


def word_from_sa_dic_line(line: str) -> str | None:
    trimmed = (line or "").strip()
    if not trimmed:
        return None
    slash = trimmed.find("/")
    raw = trimmed[:slash] if slash >= 0 else trimmed
    word = raw.strip()
    return word or None


def parse_sa_dic_text(text: str) -> list[str]:
    words: set[str] = set()
    lines = text.splitlines()
    for line in lines[1:]:
        word = word_from_sa_dic_line(line)
        if word:
            words.add(word)
    return hi_sort(words)


def collect_section_words(section: dict) -> set[str]:
    folder = CONTENT / section["folder"]
    words: set[str] = set()
    if not folder.is_dir():
        return words
    for path in sorted(folder.glob("*.yaml")):
        text = extract_text_from_yaml(path)
        for w in tokenize_hindi_for_spell(text):
            words.add(w)
    return words


def rebuild_corpus() -> None:
    sections = load_sections()
    all_words: set[str] = set()
    marwari_words: set[str] = set()
    by_section: dict[str, int] = {}
    bhajan_count = 0

    for section in sections:
        section_words = collect_section_words(section)
        by_section[section["slug"]] = len(section_words)
        all_words.update(section_words)
        folder = CONTENT / section["folder"]
        if folder.is_dir():
            bhajan_count += len(list(folder.glob("*.yaml")))
        if section["slug"] in MARWARI_SECTIONS:
            marwari_words.update(section_words)

    words = hi_sort(all_words)
    payload = {
        "generated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "bhajanCount": bhajan_count,
        "uniqueWords": len(words),
        "marwariSectionWords": len(marwari_words),
        "marwariSections": sorted(MARWARI_SECTIONS),
        "wordsBySection": by_section,
        "words": words,
    }
    CORPUS_JSON.write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")
    write_hunspell_dic(words, CORPUS_DIC)
    print(
        f"Corpus dictionary: {len(words)} words from {bhajan_count} bhajans "
        f"(mantra: {by_section.get(MANTRA_SECTION, 0)}) -> {CORPUS_JSON.name}"
    )


def rebuild_sanskrit() -> None:
    with urllib.request.urlopen(SA_DIC_URL, timeout=60) as res:
        sa_text = res.read().decode("utf-8")
    upstream = parse_sa_dic_text(sa_text)

    mantra_section = next((s for s in load_sections() if s["slug"] == MANTRA_SECTION), None)
    mantra_words: set[str] = set()
    if mantra_section:
        mantra_words = collect_section_words(mantra_section)

    merged = set(upstream) | mantra_words
    words = hi_sort(merged)

    payload = {
        "generated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": SA_DIC_URL,
        "upstreamWords": len(upstream),
        "mantraSectionWords": len(mantra_words),
        "uniqueWords": len(words),
        "words": words,
    }
    SANSKRIT_JSON.write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")
    write_hunspell_dic(words, SANSKRIT_DIC)
    print(
        f"Sanskrit dictionary: {len(words)} words "
        f"({len(mantra_words)} from mantra section) -> {SANSKRIT_DIC.name}"
    )


def main() -> None:
    ADMIN_PUBLIC.mkdir(parents=True, exist_ok=True)
    rebuild_corpus()
    rebuild_sanskrit()


if __name__ == "__main__":
    main()
