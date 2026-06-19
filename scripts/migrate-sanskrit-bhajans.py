#!/usr/bin/env python3
"""Move Sanskrit bhajans to content/mantra/ with also_in cross-listing."""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content")
MANTRA = os.path.join(CONTENT, "mantra")

SKIP_SECTIONS = frozenset({"navratri", "ambikacharitra", "mantra", "horiya", "mooltatva", "swarachit"})

# Explicit Sanskrit bhajans to move (section, filename)
EXPLICIT = [
    ("shiv", "001-ॐ-नमः-शिवाय-ॐ-नमः-शिवाय.yaml"),
    ("shiv", "005-निर्वाण-षट्कम.yaml"),
    ("shiv", "006-श्री-रुद्राष्टकम्.yaml"),
    ("shiv", "011-शिव-तांडव-स्तोत्र.yaml"),
    ("ambe", "021-महिषासुर-मर्दिनी-स्तोत्र.yaml"),
    ("misc", "008-ॐ-नमो-भगवते-वासुदेवाय.yaml"),
    ("misc", "011-भज-गोविन्दं.yaml"),
    ("ganpati", "007-श्रीगणेशाय-धीमहि.yaml"),
    ("krishna", "003-अधरं-मधुरं-वदनं-मधुरं.yaml"),
]


def read_yaml(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def parse_also_in(raw):
    m = re.search(r"^also_in:\s*\n((?:\s+-\s+.+\n)*)", raw, re.MULTILINE)
    if not m:
        return []
    return [ln.strip().lstrip("- ").strip() for ln in m.group(1).splitlines() if ln.strip()]


def set_also_in(raw, slugs):
    slugs = sorted(set(slugs))
    block = "also_in:\n" + "".join(f"  - {s}\n" for s in slugs)
    if re.search(r"^also_in:\s*\n", raw, re.MULTILINE):
        return re.sub(r"^also_in:\s*\n(?:\s+-\s+.+\n)*", block, raw, count=1, flags=re.MULTILINE)
    return re.sub(r"^(title: .+\n)", rf"\1{block}", raw, count=1)


def next_mantra_num():
    nums = [int(m.group(1)) for n in os.listdir(MANTRA) if (m := re.match(r"^(\d{3})-", n))]
    return max(nums, default=0) + 1


def main():
    dry = "--apply" not in sys.argv
    moves = []
    missing = []

    for section, name in EXPLICIT:
        if section in SKIP_SECTIONS:
            continue
        src = os.path.join(CONTENT, section, name)
        if not os.path.isfile(src):
            missing.append(f"{section}/{name}")
            continue
        moves.append((section, name, src))

    if missing:
        raise SystemExit("Missing files:\n  " + "\n  ".join(missing))

    if dry:
        with open(os.path.join(ROOT, "scripts", "sanskrit-migrate-report.json"), "w", encoding="utf-8") as f:
            import json
            json.dump({"move_count": len(moves), "files": [f"{s}/{n}" for s, n, _ in moves]}, f, ensure_ascii=False, indent=2)
        return

    num = next_mantra_num()
    for section, name, src in moves:
        raw = read_yaml(src)
        also = parse_also_in(raw)
        if section not in also:
            also.append(section)
        raw = set_also_in(raw, also)
        suffix = name.split("-", 1)[-1] if "-" in name else name
        dest_name = f"{num:03d}-{suffix}"
        dest = os.path.join(MANTRA, dest_name)
        with open(dest, "w", encoding="utf-8", newline="\n") as f:
            f.write(raw)
        os.remove(src)
        num += 1


if __name__ == "__main__":
    main()
