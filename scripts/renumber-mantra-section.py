#!/usr/bin/env python3
"""Renumber content/mantra/*.yaml continuously by popularity (001–030)."""
import os
import re
import shutil

import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mantra_popularity import POPULARITY

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANTRA = os.path.join(ROOT, "content", "mantra")


def slug_from_name(name: str) -> str:
    m = re.match(r"^\d{3}-(.+)\.ya?ml$", name)
    return m.group(1) if m else name


def main():
    files = [f for f in os.listdir(MANTRA) if f.endswith((".yaml", ".yml"))]
    by_slug = {slug_from_name(f): f for f in files}

    missing = [s for s in POPULARITY if s not in by_slug]
    extra = [s for s in by_slug if s not in POPULARITY]
    if missing:
        raise SystemExit(f"Missing slugs: {missing}")
    if extra:
        raise SystemExit(f"Unknown slugs (update POPULARITY): {extra}")

    tmp_dir = os.path.join(MANTRA, ".renumber-tmp")
    os.makedirs(tmp_dir, exist_ok=True)

    for i, slug in enumerate(POPULARITY, start=1):
        src = os.path.join(MANTRA, by_slug[slug])
        tmp = os.path.join(tmp_dir, f"{i:03d}-{slug}.yaml")
        shutil.copy2(src, tmp)

    for f in files:
        os.remove(os.path.join(MANTRA, f))

    for name in sorted(os.listdir(tmp_dir)):
        shutil.move(os.path.join(tmp_dir, name), os.path.join(MANTRA, name))

    os.rmdir(tmp_dir)
    print(f"Renumbered {len(POPULARITY)} files in {MANTRA}")


if __name__ == "__main__":
    main()
