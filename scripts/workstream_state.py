#!/usr/bin/env python3
"""Report workstream id state (R/O/I) from docs/design/the-document/DECISIONS.md.

DECISIONS.md is Patina's append-only design-decision log for The Document
workstream. Entries are headings of the form `### R<n> · <title>` (a few are
`## `-level, one is `#### `-nested), and carry three independent id
prefixes that each count up on their own: R (rulings), O (open questions),
I (implementation notes). This script is the sanctioned way to learn "what's
the next id" before drafting a new batch — see scripts/append_entry.py for
the append itself. Hand-numbering an entry is forbidden by the log's own
append-only discipline; both scripts exist so that rule has real teeth.

Usage:
    python3 scripts/workstream_state.py <repo_root>   # "." works from repo root
    python3 scripts/workstream_state.py --selftest    # run embedded fixture tests

Scans HEADING LINES ONLY (`^#{2,4}\\s`) for id tokens matching
`\\b([ROI])(\\d+)(?:\\.(\\d+))?\\b`. Prose mentions (e.g. "see R500 for
context") never count toward a maximum — only headings mint ids, which is
exactly why the scan is heading-scoped. Sub-ids (`R68.1`) resolve to their
major (68). Range headings (`R10–R12`) naturally contribute both
endpoints as separate token matches. Duplicate ids (the historical `O7` /
`O7 (Track 5)` pair) are tolerated — only the maximum is ever used.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

DECISIONS_REL_PATH = Path("docs/design/the-document/DECISIONS.md")
PREFIXES = ("R", "O", "I")

HEADING_RE = re.compile(r"^#{2,4}\s")
ID_TOKEN_RE = re.compile(r"\b([ROI])(\d+)(?:\.(\d+))?\b")
FOOTER_RE = re.compile(r"^\*Entries add: .* · last id = [ROI]\d+\*$")


def scan_heading_ids(text: str) -> dict:
    """Return the per-prefix maximum id found across heading lines only.

    Only lines matching HEADING_RE are inspected; every [ROI]<n> token on
    those lines is a candidate (duplicates and multiple tokens per line —
    e.g. a range heading — are all fine, only the max per prefix survives).
    """
    maxima: dict = {}
    for line in text.splitlines():
        if not HEADING_RE.match(line):
            continue
        for match in ID_TOKEN_RE.finditer(line):
            prefix = match.group(1)
            major = int(match.group(2))
            if major > maxima.get(prefix, 0):
                maxima[prefix] = major
    return maxima


def last_nonblank_line(text: str):
    """The last non-blank line of text, or None if the text is all blank."""
    for line in reversed(text.splitlines()):
        if line.strip():
            return line
    return None


def decisions_path(repo_root: Path) -> Path:
    return repo_root / DECISIONS_REL_PATH


def report(repo_root: Path) -> int:
    path = decisions_path(repo_root)
    if not path.is_file():
        print(f"ERROR: {path} not found", file=sys.stderr)
        return 1
    text = path.read_text()
    line_count = len(text.splitlines())
    maxima = scan_heading_ids(text)

    print(f"{path} — {line_count} lines")
    for prefix in PREFIXES:
        max_id = maxima.get(prefix, 0)
        next_id = max_id + 1
        max_label = f"{prefix}{max_id}" if max_id else "(none)"
        print(f"  {prefix}: max {max_label}, next {prefix}{next_id}")

    footer = last_nonblank_line(text)
    print(f"footer: {footer}")

    if not footer or not FOOTER_RE.match(footer):
        print(
            "WARNING: last non-blank line is not a valid integrity footer "
            "(expected '*Entries add: ... · last id = [ROI]<n>*'); "
            f"got: {footer!r}. DECISIONS.md may be corrupted or mid-edit — "
            "do NOT append until this is understood.",
            file=sys.stderr,
        )
        return 1
    return 0


# ── selftest ──────────────────────────────────────────────────────────────

_FIXTURE = """\
# DECISIONS.md — fixture

## R5 · A level-2 heading counts too

### R10–R12 confirmed

### R68.1 · A sub-id heading resolves to its major

### O7 · First O7 (historical duplicate, part one)

### O7 (Track 5) · Second O7 (historical duplicate, part two)

### I40 · An ordinary implementation note

Prose down here mentions R500 in passing — must NOT count, this line is
not a heading.

*Entries add: I40 · last id = I40*
"""


def selftest() -> int:
    failures = []

    maxima = scan_heading_ids(_FIXTURE)
    expected = {"R": 68, "O": 7, "I": 40}
    for prefix, expected_max in expected.items():
        actual = maxima.get(prefix)
        if actual != expected_max:
            failures.append(f"{prefix}: expected max {expected_max}, got {actual}")

    # The prose mention of R500 must never leak into the heading-only scan.
    if maxima.get("R") == 500:
        failures.append("R500 prose mention was incorrectly counted as a heading id")

    footer = last_nonblank_line(_FIXTURE)
    if not footer or not FOOTER_RE.match(footer):
        failures.append(f"footer regex failed to match fixture footer: {footer!r}")

    if failures:
        print("SELFTEST FAILED:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print(f"SELFTEST OK: {maxima}")
    return 0


def main(argv) -> int:
    if "--selftest" in argv:
        return selftest()
    if not argv:
        print(__doc__)
        print("ERROR: repo_root argument required (or --selftest)", file=sys.stderr)
        return 1
    repo_root = Path(argv[0]).resolve()
    return report(repo_root)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
