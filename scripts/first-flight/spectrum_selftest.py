#!/usr/bin/env python3
"""Self-test for scripts/first-flight/build-spectrums.py.

Run: python3 scripts/first-flight/spectrum_selftest.py
Exit 0 = every case passed. Any failure prints the case and exits 1.

The mapping is the decisive column of First Flight L0.3: a catalogue row with no
product_style_spectrum row is invisible to get_aesthete_matches' spectrum-only
candidate path, so the generator must never be able to emit one.
"""

import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def load_spectrums():
    path = os.path.join(HERE, "build-spectrums.py")
    spec = importlib.util.spec_from_file_location("build_spectrums", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


FAILURES = []


def check(name, condition, detail=""):
    if condition:
        print("  ok   %s" % name)
    else:
        print("  FAIL %s %s" % (name, detail))
        FAILURES.append(name)


def main():
    bs = load_spectrums()
    dims = bs.DIMENSIONS

    print("1. dimension set matches _aesthete_product_spectrum (00244:220)")
    check(
        "1a six dimensions in the engine's order",
        list(dims)
        == [
            "warmth",
            "complexity",
            "formality",
            "timelessness",
            "boldness",
            "craftsmanship",
        ],
        repr(list(dims)),
    )

    print("2. a known style resolves")
    spec, conf, prov = bs.resolve_spectrum(
        "Warm Modern", ["white oak", "linen"], "natural"
    )
    check("2a every dimension present", sorted(spec.keys()) == sorted(dims), repr(spec))
    check(
        "2b every value inside [-1, 1]",
        all(-1.0 <= v <= 1.0 for v in spec.values()),
        repr(spec),
    )
    check(
        "2c confidence covers every dimension",
        sorted(conf.keys()) == sorted(dims),
        repr(conf),
    )
    check(
        "2d confidence values inside [0, 1]",
        all(0.0 <= v <= 1.0 for v in conf.values()),
        repr(conf),
    )
    check("2e provenance names the mapping", "L0.3" in prov, prov)

    print("3. an unknown style refuses")
    try:
        bs.resolve_spectrum("vaporwave brutalist", [], "")
    except bs.SpectrumUnresolved as exc:
        check("3a raises SpectrumUnresolved", True)
        check(
            "3b the message names the offending style",
            "vaporwave brutalist" in str(exc),
            str(exc),
        )
    else:
        check("3a raises SpectrumUnresolved", False, "no exception raised")
        check("3b the message names the offending style", False, "no exception raised")

    print("4. an empty style refuses")
    for empty in ("", "   ", None):
        try:
            bs.resolve_spectrum(empty, [], "")
        except bs.SpectrumUnresolved:
            check("4a refuses %r" % (empty,), True)
        else:
            check("4a refuses %r" % (empty,), False, "no exception raised")

    print("5. deterministic")
    a = bs.resolve_spectrum("Warm Modern", ["white oak", "linen"], "natural")
    b = bs.resolve_spectrum("Warm Modern", ["white oak", "linen"], "natural")
    check("5a same input, identical output", a == b, "%r != %r" % (a, b))

    print("6. materials and palette actually move the vector")
    plain = bs.resolve_spectrum("Warm Modern", [], "")[0]
    with_brass = bs.resolve_spectrum("Warm Modern", ["polished brass"], "")[0]
    check(
        "6a a material changes at least one dimension",
        plain != with_brass,
        "%r == %r" % (plain, with_brass),
    )
    with_palette = bs.resolve_spectrum("Warm Modern", [], "charcoal")[0]
    check(
        "6b a palette word changes at least one dimension",
        plain != with_palette,
        "%r == %r" % (plain, with_palette),
    )

    print("7. clamping holds at the extremes")
    loud = bs.resolve_spectrum(
        "Maximalist",
        ["polished brass", "lacquer", "velvet", "marble"],
        "jewel saturated",
    )[0]
    check(
        "7a still inside [-1, 1] after every adjustment",
        all(-1.0 <= v <= 1.0 for v in loud.values()),
        repr(loud),
    )

    print("8. every style in the vocabulary resolves and is well formed")
    bad = []
    for style in bs.STYLE_SPECTRUM:
        s, c, _ = bs.resolve_spectrum(style, [], "")
        if sorted(s.keys()) != sorted(dims) or not all(
            -1.0 <= v <= 1.0 for v in s.values()
        ):
            bad.append(style)
        if sorted(c.keys()) != sorted(dims):
            bad.append(style + " (confidence)")
    check("8a all %d styles" % len(bs.STYLE_SPECTRUM), not bad, repr(bad))

    print("9. unknown material and palette words are ignored, not fatal")
    try:
        s = bs.resolve_spectrum("Warm Modern", ["unobtanium"], "ultraviolet")[0]
        check("9a resolves anyway", sorted(s.keys()) == sorted(dims), repr(s))
    except Exception as exc:  # noqa: BLE001 - the point is that nothing escapes
        check("9a resolves anyway", False, repr(exc))

    print("10. style matching is case- and punctuation-insensitive")
    check(
        "10a 'mid century modern' lands on 'Mid-Century Modern'",
        bs.canonical_style("mid century modern") == "Mid-Century Modern",
        bs.canonical_style("mid century modern"),
    )
    check(
        "10b 'JAPANDI' lands on 'Japandi'",
        bs.canonical_style("JAPANDI") == "Japandi",
        bs.canonical_style("JAPANDI"),
    )

    print("11. the vocabulary is the twelve public.styles rows, in display_order")
    check(
        "11a twelve styles",
        len(bs.STYLE_SPECTRUM) == 12,
        str(len(bs.STYLE_SPECTRUM)),
    )
    check(
        "11b display_order preserved",
        list(bs.STYLE_SPECTRUM)
        == [
            "Warm Modern",
            "Soft Contemporary",
            "Mid-Century Modern",
            "Scandinavian Minimal",
            "Modern Industrial",
            "Traditional",
            "Transitional",
            "Rustic",
            "Coastal",
            "Bohemian",
            "Maximalist",
            "Japandi",
        ],
        repr(list(bs.STYLE_SPECTRUM)),
    )

    if FAILURES:
        print("\n%d FAILED: %s" % (len(FAILURES), ", ".join(FAILURES)))
        return 1
    print("\nall spectrum self-tests passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
