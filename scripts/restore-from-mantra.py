#!/usr/bin/env python3
"""Restore misclassified bhajans from content/mantra/ to original sections."""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content")
MANTRA = os.path.join(CONTENT, "mantra")

# mantra file basename -> (section folder, original file basename)
RESTORE = {
    "051-ॐ-जय-शिव-ओंकारा.yaml": ("aarti", "001-ॐ-जय-शिव-ओंकारा.yaml"),
    "052-आरती-कीजै-हनुमान-लला-की.yaml": ("aarti", "002-आरती-कीजै-हनुमान-लला-की.yaml"),
    "053-जय-गणेश-देवा.yaml": ("aarti", "003-जय-गणेश-देवा.yaml"),
    "054-ॐ-जय-जगदीश-हरे.yaml": ("aarti", "004-ॐ-जय-जगदीश-हरे.yaml"),
    "055-जय-अम्बे-गौरी.yaml": ("aarti", "005-जय-अम्बे-गौरी.yaml"),
    "056-आरती-कुंजबिहारी-की.yaml": ("aarti", "006-आरती-कुंजबिहारी-की.yaml"),
    "057-श्री-रामचन्द्र-कृपालु-भजुमन.yaml": ("aarti", "007-श्री-रामचन्द्र-कृपालु-भजुमन.yaml"),
    "065-नमो-नमो-हिमगिरी-कन्या-कुमार.yaml": ("ganpati", "004-नमो-नमो-हिमगिरी-कन्या-कुमार.yaml"),
    "068-हनुमान-चालीसा.yaml": ("hanuman", "001-हनुमान-चालीसा.yaml"),
    "069-हनुमानाष्टक.yaml": ("hanuman", "002-हनुमानाष्टक.yaml"),
}


def strip_also_in(raw: str) -> str:
    return re.sub(r"^also_in:\s*\n(?:\s+-\s+.+\n)*", "", raw, count=1, flags=re.MULTILINE)


def main():
    os.makedirs(os.path.join(CONTENT, "aarti"), exist_ok=True)
    os.makedirs(os.path.join(CONTENT, "ganpati"), exist_ok=True)
    os.makedirs(os.path.join(CONTENT, "hanuman"), exist_ok=True)

    for mantra_name, (section, orig_name) in RESTORE.items():
        src = os.path.join(MANTRA, mantra_name)
        if not os.path.isfile(src):
            raise SystemExit(f"Missing: {src}")
        with open(src, encoding="utf-8") as f:
            raw = strip_also_in(f.read())
        dest_dir = os.path.join(CONTENT, section)
        dest = os.path.join(dest_dir, orig_name)
        with open(dest, "w", encoding="utf-8", newline="\n") as f:
            f.write(raw)
        os.remove(src)


if __name__ == "__main__":
    main()
