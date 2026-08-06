import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "content" / "mantra"


def analyze(path: Path):
    text = path.read_text(encoding="utf-8")
    title_m = re.search(r"^title:\s*(.+)$", text, re.M)
    title = title_m.group(1).strip() if title_m else path.stem
    group_m = re.search(r"^group:\s*(.+)$", text, re.M)
    group = group_m.group(1).strip() if group_m else ""
    paras = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if re.match(r"^\s*-\s+commentary:\s*\|", line):
            block = []
            i += 1
            while i < len(lines) and (lines[i].startswith("      ") or lines[i].strip() == ""):
                if lines[i].startswith("      "):
                    block.append(lines[i][6:])
                i += 1
            paras.append(("commentary", "\n".join(block).strip()))
            continue
        if re.match(r"^\s*-\s+\|", line):
            block = []
            i += 1
            while i < len(lines) and (lines[i].startswith("      ") or lines[i].strip() == ""):
                if lines[i].startswith("      "):
                    block.append(lines[i][6:])
                i += 1
            paras.append(("shloka", "\n".join(block).strip()))
            continue
        if re.match(r"^\s*-\s+commentary:\s*.+", line):
            paras.append(("commentary", line.split("commentary:", 1)[1].strip()))
        elif re.match(r"^\s*-\s+[^|]", line) and "commentary" not in line:
            paras.append(("shloka", line.split("-", 1)[1].strip()))
        i += 1
    missing = []
    for idx, (kind, content) in enumerate(paras):
        if kind != "shloka":
            continue
        first_line = content.splitlines()[0][:70] if content else ""
        has_next = idx + 1 < len(paras) and paras[idx + 1][0] == "commentary"
        if not has_next:
            missing.append(first_line)
    n_sh = sum(1 for p in paras if p[0] == "shloka")
    n_com = sum(1 for p in paras if p[0] == "commentary")
    return title, group, missing, n_sh, n_com


def main():
    files = sorted(ROOT.glob("*.yaml"))
    out = []
    total_sh = total_missing = 0
    for p in files:
        title, group, missing, n_sh, n_com = analyze(p)
        total_sh += n_sh
        if missing:
            total_missing += len(missing)
            out.append((p.name, title, group, missing, n_sh, n_com))
        elif n_com == 0 and n_sh > 0:
            total_missing += n_sh
            out.append((p.name, title, group, ["(entire file — no commentary)"], n_sh, n_com))

    lines = [
        f"Total files: {len(files)}",
        f"Total shloka blocks: {total_sh}",
        f"Shlokas without meaning: {total_missing}",
        f"Files with gaps: {len(out)}",
        "",
    ]
    for name, title, group, missing, n_sh, n_com in out:
        lines.append(f"## {title} ({name})")
        if group:
            lines.append(f"Group: {group}")
        lines.append(f"{len(missing)} of {n_sh} shlokas missing meaning ({n_com} commentaries)")
        for m in missing:
            lines.append(f"  - {m}")
        lines.append("")

    report = "\n".join(lines)
    Path(__file__).resolve().parent.joinpath("_mantra-missing-meanings.txt").write_text(
        report, encoding="utf-8"
    )
    print(report)


if __name__ == "__main__":
    main()
