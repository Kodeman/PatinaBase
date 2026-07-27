"""Build JSON that this interpreter's ``json`` module actually refuses.

WHY THIS EXISTS.  Three tests pinned the normalization of a ``RecursionError``
out of ``json`` into a typed ``AdapterError``, and each did it with a hardcoded
nesting depth of 10 000.  MEASURED, in this repository's own gate containers
(``python:3.12-slim`` and ``python:3.14-slim``, aarch64): 3.12.13 raises
``RecursionError`` from the C scanner at that depth, and 3.14.6 does not -- it
parses 10 000 and 30 000 without complaint -- because 3.14 replaced the fixed
C-recursion counter with a real STACK-HEADROOM check.
``sys.setrecursionlimit`` does not move either one on 3.14 -- MEASURED: with the
limit set to 200, ``json.loads`` still parsed a 10 000-deep payload -- because
the C scanner does not consult it.

NO FIRST-REFUSAL DEPTH IS WRITTEN DOWN FOR 3.14, and none may be.  Once the
check is stack headroom, the depth is a property of the thread's stack rather
than of the interpreter, and it moves on the same host and the same build.
MEASURED on ``python:3.14-slim`` aarch64, driving the identical ladder from
threads that differ only in ``threading.stack_size``: 1 MiB first refused at
10 000, 8 MiB first refused at 50 000, 64 MiB refused nothing up to 100 000.
An earlier revision of this file recorded "first raises at 100 000" as a fact
about 3.14; on the main thread of that same image it is 50 000, and the figure
was never the interpreter's to state.

The 3.12 figure is what the ladders below start from.  Neither figure is what
the helpers TRUST: every rung is probed at run time, so an interpreter or a
stack that moves again is handled without editing this file.

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

#: Decode ladder.  10 000 is where 3.12 refuses.  The rest is coverage for an
#: interpreter that checks stack headroom instead, where the refusal depth is a
#: property of the running thread and not a constant this file may name; the
#: tail is bounded by the caller's payload ceiling rather than by anything here.
#: The rungs are NOT dense -- on the gate's 3.14 the true first refusal sits
#: between two of them -- which is why the helper below promises the smallest
#: refused rung ON THIS LADDER and not the smallest refused depth.
_DECODE_DEPTHS = (10_000, 30_000, 100_000, 300_000)

#: Encode ladder.  ``json.dumps`` refuses shallower than ``json.loads`` on the
#: gate's 3.14 and deeper than nothing on 3.12 (10 000).  Building the document
#: is iterative, so only the encoder's recursion is under test.  Same caveat as
#: above: these are rungs, not measured thresholds.
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
    """Smallest LADDER RUNG ``json.loads`` refuses here, or ``None``.

    Not the smallest refusing depth: ``_DECODE_DEPTHS`` is a sparse ladder, and
    on the gate's 3.14 the true first refusal (50 000 on the main thread) falls
    between two rungs, so this returns the 100 000 one.  That is fine for what
    the callers need -- a payload that drives a REAL ``RecursionError`` through
    the production path -- and it is stated because "smallest" was claimed here
    once and was not true.

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
    """Shallowest LADDER RUNG ``json.dumps`` refuses to canonicalize, or ``None``.

    Same sparseness caveat as :func:`deeply_nested_json_payload`: a rung, not a
    measured threshold.
    """

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
