#!/usr/bin/env python3
"""Assemble PROGRAM.md from prose parts + tables lifted verbatim from findings-by-lane.md."""
import json, re, sys, collections, pathlib

BASE = pathlib.Path("/Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01")
SCR = pathlib.Path("/private/tmp/claude-501/-Users-kody-Code-patina-merged/0e0b6543-ba0e-4550-9905-c14cbc299e3d/scratchpad")

src = (BASE / "build/findings-by-lane.md").read_text().splitlines()

# --- parse sections -------------------------------------------------------
tables = {}          # "W0 · L0.1" -> list of table lines (header + rows)
counts = {}          # same key -> the _count: line
cur = None
for line in src:
    m = re.match(r"^### (W\d) · (L[\d\w.\-]+) ", line)
    if m:
        cur = f"{m.group(1)} · {m.group(2)}"
        tables[cur] = []
        continue
    if line.startswith("### ") or line.startswith("## ") or line.startswith("**W"):
        cur = None
        continue
    if cur is None:
        continue
    if line.startswith("_count:"):
        counts[cur] = line
        continue
    if line.startswith("|"):
        tables[cur].append(line)

# --- W3 by-area rollup ----------------------------------------------------
fj = json.loads((BASE / "build/findings.json").read_text())
w3 = [f for f in fj if f["wave"] == "W3"]
by_area = collections.defaultdict(lambda: collections.Counter())
lane_of_area = collections.defaultdict(collections.Counter)
for f in w3:
    by_area[f["area"]][f["severity"]] += 1
    by_area[f["area"]]["total"] += 1
    lane_of_area[f["area"]][f["lane"]] += 1

rows = ["| area | total | major | minor | polish | lanes that own them |",
        "|---|---:|---:|---:|---:|---|"]
for area, c in sorted(by_area.items(), key=lambda kv: (-kv[1]["total"], kv[0])):
    lanes = ", ".join(f"{l} ({n})" for l, n in lane_of_area[area].most_common())
    rows.append(f"| {area} | {c['total']} | {c['major']} | {c['minor']} | {c['polish']} | {lanes} |")
tot = collections.Counter()
for f in w3:
    tot[f["severity"]] += 1
rows.append(f"| **all areas** | **{len(w3)}** | **{tot['major']}** | **{tot['minor']}** | **{tot['polish']}** | 12 lanes |")
W3AREA = "\n".join(rows)

# --- expand ---------------------------------------------------------------
parts = sorted(SCR.glob("part-*.md"))
out = []
placed = collections.Counter()
for p in parts:
    for line in p.read_text().splitlines():
        m = re.match(r"^\{\{TABLE:(.+?)\}\}$", line.strip())
        if m:
            key = m.group(1)
            if key not in tables:
                sys.exit(f"UNKNOWN TABLE KEY: {key}")
            out.append(counts.get(key, ""))
            out.append("")
            out.extend(tables[key])
            placed[key] = len(tables[key]) - 2   # minus header + separator
            continue
        if line.strip() == "{{W3AREA}}":
            out.append(W3AREA)
            continue
        out.append(line)

dest = BASE / "build/PROGRAM.md"
dest.write_text("\n".join(out) + "\n")

# --- report ---------------------------------------------------------------
print(f"wrote {dest} — {len(out)} lines, {dest.stat().st_size} bytes")
missing = set(tables) - set(placed)
print("tables placed:", sum(placed.values()), "rows across", len(placed), "sections")
if missing:
    print("NOT PLACED:", sorted(missing))
for k in sorted(placed):
    print(f"  {k}: {placed[k]} rows")
