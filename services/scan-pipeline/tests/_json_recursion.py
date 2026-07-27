"""Build JSON that this interpreter's ``json`` module actually refuses.

WHY THIS EXISTS.  Three tests pinned the normalization of a ``RecursionError``
out of ``json`` into a typed ``AdapterError``, and each did it with a hardcoded
nesting depth of 10 000.  MEASURED, in this repository's own gate containers
(``python:3.12-slim`` and ``python:3.14-slim``, aarch64) and again on macOS
CPython 3.14.2: 3.12.13 raises ``RecursionError`` from the C scanner at that
depth, and 3.14.6 does not -- it parses 10 000, 20 000 and 30 000 without
complaint and first raises at 100 000, because 3.14 replaced the fixed
C-recursion counter with a real stack-headroom check.  ``json.dumps`` moved the
same way: 3.12 raises at 10 000, 3.14 first raises at 50 000.
``sys.setrecursionlimit`` does not move either one on 3.14 -- MEASURED: with the
limit set to 200, ``json.loads`` still parsed a 10 000-deep payload -- because
the C scanner does not consult it.

Those numbers are the reason the ladders below start where they do.  They are
NOT what the helpers trust: every rung is probed at run time, so an interpreter
that moves again is handled without editing this file.

So a hardcoded depth pins ONE interpreter rather than the normalization the
tests are about.  These helpers walk a ladder and return the first input this
interpreter genuinely refuses, so the tests keep driving a REAL
``RecursionError`` through the real production path on every version.  They
return ``None`` rather than guessing when nothing on the ladder is refused,
which is the caller's cue to skip with a reason that states that measurement
instead of asserting a normalization that never ran.

NOTHING HERE MAY BE "FIXED" BY LOWERING THE RECURSION LIMIT: the production code
under test catches ``RecursionError`` from ``json``, and only ``json`` raising it
for real exercises that clause.
"""

from __future__ import annotations

import json

#: Decode ladder.  10 000 is where 3.12 refuses; 100 000 is where 3.14 does.
#: The tail is headroom for a future interpreter with a deeper stack, bounded by
#: the caller's payload ceiling rather than by anything here.
_DECODE_DEPTHS = (10_000, 30_000, 100_000, 300_000)

#: Encode ladder.  ``json.dumps`` refuses shallower than ``json.loads`` on 3.14
#: (50 000 vs 100 000), and deeper than nothing on 3.12 (10 000).  Building the
#: document is iterative, so only the encoder's recursion is under test.
_ENCODE_DEPTHS = (10_000, 50_000, 200_000)

#: The exact keyword arguments ``_canonical_json_bytes`` passes, so a depth this
#: ladder proves is refused is refused by the production call too.
_CANONICAL_KWARGS = {
    "sort_keys": True,
    "separators": (",", ":"),
    "ensure_ascii": True,
    "allow_nan": False,
}


def deeply_nested_json_payload(maximum_bytes: int) -> bytes | None:
    """Smallest nested payload ``json.loads`` refuses here, or ``None``.

    ``maximum_bytes`` is the production ceiling the payload has to stay under so
    that it reaches ``json.loads`` at all rather than being refused earlier for
    its size.  A ladder rung over that ceiling ends the search.
    """

    for depth in _DECODE_DEPTHS:
        payload = b"[" * depth + b"0" + b"]" * depth
        if len(payload) > maximum_bytes:
            return None
        try:
            json.loads(payload.decode("ascii"))
        except RecursionError:
            return payload
    return None


def deeply_nested_json_document() -> list[object] | None:
    """Shallowest document ``json.dumps`` refuses to canonicalize here, or ``None``."""

    for depth in _ENCODE_DEPTHS:
        document: list[object] = []
        cursor = document
        for _ in range(depth):
            child: list[object] = []
            cursor.append(child)
            cursor = child
        try:
            json.dumps(document, **_CANONICAL_KWARGS)
        except RecursionError:
            return document
    return None


def no_recursion_limit_reason(what: str, depths: tuple[int, ...]) -> str:
    """The skip text for an interpreter that refuses nothing on the ladder."""

    import sys

    return (
        f"this interpreter's json {what} accepted every nesting depth on the "
        f"ladder {depths} without raising RecursionError, so there is no real "
        "RecursionError to drive through the production normalization here; "
        f"measured on {sys.implementation.name} "
        f"{'.'.join(str(part) for part in sys.version_info[:3])}. Raise the "
        "ladder (and the caller's payload ceiling) rather than asserting a "
        "clause that never ran."
    )


DECODE_DEPTHS = _DECODE_DEPTHS
ENCODE_DEPTHS = _ENCODE_DEPTHS
