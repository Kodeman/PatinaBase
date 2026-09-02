#!/usr/bin/env python3
"""First Flight L0.3 — the decisive column: hand-authored product spectrums.

`get_aesthete_matches` (00244) builds its candidate set two ways. The ANN path
needs `products.aesthete_vector`, which nothing populates today. The fallback
path is `WHERE b.pspec IS NOT NULL` — `b.pspec` being the `spectrums` jsonb
returned by `_aesthete_product_spectrum(p.id)` (00244:214). With no
`product_style_spectrum` row and no `product_dna_drafts` row that function
returns zero rows, `pspec` is NULL, `_ae_cand` is empty, and
`get_recommendations` returns nothing however many products are published.

So this file is the contract. PROGRAM.md L0.3 picks hand-authored rows from a
documented mapping over standing up `services/aesthete-inference`; when the
inference service is real it recomputes the same column and this script retires.
The column is the contract, not the generator.

Vocabulary. `style` is one of the twelve rows of `public.styles`, ordered by
`display_order` — the taxonomy the engine's own phi basis iterates (00244 §8.1).
Leah's manifest spells the style exactly as `--list-styles` prints it; matching
is case- and punctuation-insensitive so "mid century modern" also lands.

Authorship. Every number below was chosen by this lane (First Flight W0 · L0.3,
2026-09-02) under ruling D2, reading the six dimensions as
`_aesthete_spectrum_term` (00244:275) weighs them: gamma is
(warmth 1.2, complexity 1.0, formality 0.8, timelessness 0.6, boldness 1.1,
craftsmanship 1.0), so warmth and boldness read loudest and are the two the
style base commits hardest on. Nothing here is measured; it is a stated
editorial position, which is why the row lands as `source='manual'` at the 0.7
confidence the 00240 comment names for a designer save, never as `'validated'`.

Usage:
  python3 scripts/first-flight/build-spectrums.py --list-styles
  python3 scripts/first-flight/build-spectrums.py --explain "Japandi"
  python3 scripts/first-flight/build-spectrums.py --check <manifest.csv>
"""

import argparse
import csv
import re
import sys

# The exact dimension set and order `_aesthete_product_spectrum` reads
# (00244_aesthete_match_rpc.sql:220). Any drift here is silently dropped by
# `jsonb_strip_nulls` in that function, so it is asserted by the self-test.
DIMENSIONS = (
    "warmth",
    "complexity",
    "formality",
    "timelessness",
    "boldness",
    "craftsmanship",
)

MAPPING_AUTHOR = "First Flight W0 L0.3, 2026-09-02, ruling D2"

# ─── the style base ────────────────────────────────────────────────────────
# Keys are the twelve `public.styles` names. Each vector is this lane's reading
# of the style, not a measurement.
STYLE_SPECTRUM = {
    # Wood and textile forward, quiet, made to last: warm and well made, but it
    # does not claim formality either way.
    "Warm Modern": (0.55, -0.10, 0.05, 0.30, 0.05, 0.35),
    # Deliberately unassertive — the style whose whole point is not to shout,
    # so boldness is the only dimension it commits on.
    "Soft Contemporary": (0.30, -0.20, -0.05, 0.10, -0.20, 0.20),
    # Sixty years in production is the timelessness claim; the silhouettes are
    # confident, hence boldness above neutral.
    "Mid-Century Modern": (0.45, 0.05, 0.10, 0.55, 0.25, 0.45),
    # The one style that is defined by subtraction: complexity and boldness are
    # the strongest negatives in the table.
    "Scandinavian Minimal": (0.25, -0.55, -0.10, 0.45, -0.35, 0.50),
    # Metal and blackened finishes pull warmth below zero before any material
    # adjustment is applied.
    "Modern Industrial": (-0.35, 0.10, -0.15, 0.25, 0.35, 0.40),
    # Formality and timelessness are the point; boldness is not.
    "Traditional": (0.35, 0.55, 0.70, 0.75, -0.05, 0.55),
    # Traditional's bones with the ornament removed — every value moves toward
    # the middle.
    "Transitional": (0.25, 0.10, 0.30, 0.45, -0.10, 0.35),
    # Warmth and craftsmanship high, formality firmly negative: the style is an
    # argument against the formal room.
    "Rustic": (0.65, 0.20, -0.45, 0.55, 0.10, 0.60),
    # Light, airy, informal. Warmth is only slightly positive because the
    # palette runs cool even when the materials are natural.
    "Coastal": (0.15, -0.25, -0.35, 0.20, -0.15, 0.20),
    # Layered and unbuttoned; timelessness near zero because the look is
    # collected rather than enduring.
    "Bohemian": (0.60, 0.65, -0.55, 0.05, 0.55, 0.40),
    # The loudest row in the table on complexity and boldness, and the only one
    # with negative timelessness.
    "Maximalist": (0.35, 0.90, 0.35, -0.15, 0.85, 0.35),
    # Scandinavian restraint plus Japanese craft: the highest craftsmanship
    # value here, and complexity lower than anything but Scandinavian Minimal.
    "Japandi": (0.30, -0.60, 0.15, 0.60, -0.40, 0.70),
}

# ─── material adjustments ──────────────────────────────────────────────────
# Substring keys, matched against every lowercased material the manifest row
# lists. Deltas sum, then clamp. Chosen by the same author on the same reading.
MATERIAL_ADJUST = (
    (("oak", "walnut", "teak", "cherry", "ash", "maple", "pine", "wood"),
     {"warmth": 0.15, "craftsmanship": 0.10}),
    (("reclaimed", "salvaged", "antique"),
     {"warmth": 0.10, "timelessness": 0.10, "craftsmanship": 0.10}),
    (("linen", "cotton", "wool", "jute", "hemp", "rattan", "cane", "sisal", "shearling"),
     {"warmth": 0.12, "formality": -0.12}),
    (("velvet", "silk", "mohair"),
     {"warmth": 0.05, "formality": 0.20, "boldness": 0.15}),
    (("leather", "hide"),
     {"warmth": 0.10, "timelessness": 0.15}),
    (("brass", "bronze", "copper"),
     {"warmth": 0.18, "formality": 0.10, "boldness": 0.12}),
    (("steel", "iron", "aluminium", "aluminum", "chrome", "nickel"),
     {"warmth": -0.22, "formality": 0.05}),
    (("marble", "stone", "travertine", "limestone", "granite", "soapstone"),
     {"warmth": -0.05, "formality": 0.18, "timelessness": 0.15}),
    (("ceramic", "stoneware", "terracotta", "clay", "porcelain", "earthenware"),
     {"warmth": 0.12, "craftsmanship": 0.15}),
    (("glass", "crystal"),
     {"warmth": -0.12, "complexity": -0.10}),
    (("lacquer", "enamel"),
     {"warmth": -0.05, "formality": 0.15, "boldness": 0.15}),
    (("concrete", "cement"),
     {"warmth": -0.25, "boldness": 0.10}),
    # The only group that lowers craftsmanship: a piece whose substance is a
    # laminate is not making a craft claim, and the spectrum should not either.
    (("plastic", "acrylic", "resin", "laminate", "mdf", "particleboard", "veneer"),
     {"warmth": -0.15, "timelessness": -0.20, "craftsmanship": -0.25}),
)

# ─── palette adjustments ───────────────────────────────────────────────────
PALETTE_ADJUST = (
    (("natural", "oatmeal", "sand", "flax", "greige", "ecru", "bone", "cream", "ivory"),
     {"warmth": 0.10, "boldness": -0.10}),
    (("white", "chalk", "alabaster"),
     {"warmth": -0.05, "complexity": -0.10, "boldness": -0.12}),
    (("charcoal", "black", "graphite", "ink", "onyx"),
     {"warmth": -0.15, "formality": 0.10, "boldness": 0.15}),
    (("walnut", "chocolate", "cognac", "umber", "tobacco", "rust", "terracotta", "ochre"),
     {"warmth": 0.18}),
    (("green", "olive", "sage", "moss", "forest"),
     {"warmth": 0.05, "complexity": 0.05}),
    (("blue", "indigo", "navy", "slate", "grey", "gray"),
     {"warmth": -0.15, "formality": 0.08}),
    (("jewel", "saturated", "emerald", "sapphire", "ruby"),
     {"complexity": 0.15, "boldness": 0.25}),
    (("pastel", "blush", "muted", "dusty", "faded"),
     {"warmth": 0.05, "boldness": -0.18}),
    (("brass", "gold", "gilt", "gilded"),
     {"warmth": 0.10, "formality": 0.12, "boldness": 0.10}),
    (("multicolour", "multicolor", "pattern", "patterned", "print"),
     {"complexity": 0.25, "boldness": 0.15}),
)

# The app convention 00240 records for a designer save. `_aesthete_product_spectrum`
# would apply 0.7 itself for `source='manual'` rows with no confidence key; the
# rows are written with an explicit map so the number is visible in the seed
# rather than inherited from a function body.
CONFIDENCE_ASSERTED = 0.7
# Where the style base is near zero and nothing in the row's materials or
# palette moved it, the mapping is not really making a claim on that dimension.
# Saying so costs one number and stops a non-claim from carrying a claim's
# weight in `_aesthete_spectrum_term`.
CONFIDENCE_UNCOMMITTED = 0.55
UNCOMMITTED_BAND = 0.15

SPECTRUM_SOURCE = "manual"


class SpectrumUnresolved(Exception):
    """Raised when a row cannot be given a spectrum, which makes it unpublishable."""


def _normalize_style(raw):
    if raw is None:
        return ""
    return re.sub(r"[^a-z0-9]+", "", str(raw).lower())


_STYLE_INDEX = dict((_normalize_style(k), k) for k in STYLE_SPECTRUM)


def canonical_style(raw):
    """Return the canonical `public.styles` name, or raise SpectrumUnresolved."""
    key = _normalize_style(raw)
    if not key:
        raise SpectrumUnresolved(
            "no style given; every publishable row needs one of: %s"
            % ", ".join(sorted(STYLE_SPECTRUM))
        )
    if key not in _STYLE_INDEX:
        raise SpectrumUnresolved(
            "style %r is outside the vocabulary; use one of: %s"
            % (raw, ", ".join(sorted(STYLE_SPECTRUM)))
        )
    return _STYLE_INDEX[key]


def _apply(deltas, table, words):
    """Sum every table entry whose keyword appears in any of `words`."""
    hit = False
    for keys, adjust in table:
        for word in words:
            if any(k in word for k in keys):
                for dim, delta in adjust.items():
                    deltas[dim] = deltas.get(dim, 0.0) + delta
                hit = True
                break
    return hit


def resolve_spectrum(style, materials, palette):
    """(spectrum, confidence, provenance) for one manifest row.

    Raises SpectrumUnresolved when the style is missing or outside the
    vocabulary. There is deliberately no neutral fallback: a row without a
    spectrum is invisible to the matcher, so the generator must refuse it
    rather than emit a product nobody can ever be shown.
    """
    name = canonical_style(style)
    base = STYLE_SPECTRUM[name]

    material_words = [str(m).lower() for m in (materials or []) if str(m).strip()]
    palette_words = [w for w in re.split(r"[^a-z0-9]+", str(palette or "").lower()) if w]

    deltas = {}
    moved_by_material = _apply(deltas, MATERIAL_ADJUST, material_words)
    moved_by_palette = _apply(deltas, PALETTE_ADJUST, palette_words)

    spectrum = {}
    confidence = {}
    for index, dim in enumerate(DIMENSIONS):
        value = base[index] + deltas.get(dim, 0.0)
        value = max(-1.0, min(1.0, value))
        spectrum[dim] = round(value, 2)
        uncommitted = (
            abs(base[index]) < UNCOMMITTED_BAND and abs(deltas.get(dim, 0.0)) < 1e-9
        )
        confidence[dim] = (
            CONFIDENCE_UNCOMMITTED if uncommitted else CONFIDENCE_ASSERTED
        )

    provenance = "hand-authored mapping (%s); style=%s; materials moved=%s; palette moved=%s" % (
        MAPPING_AUTHOR,
        name,
        "yes" if moved_by_material else "no",
        "yes" if moved_by_palette else "no",
    )
    return spectrum, confidence, provenance


# ─── CLI ───────────────────────────────────────────────────────────────────


def _cmd_list_styles():
    print("style vocabulary (public.styles, display_order):")
    for name in STYLE_SPECTRUM:
        vec = STYLE_SPECTRUM[name]
        print(
            "  %-22s %s"
            % (name, "  ".join("%s %+.2f" % (d[:4], v) for d, v in zip(DIMENSIONS, vec)))
        )
    return 0


def _cmd_explain(style):
    try:
        spectrum, confidence, provenance = resolve_spectrum(style, [], "")
    except SpectrumUnresolved as exc:
        sys.stderr.write("error: %s\n" % exc)
        return 1
    print(provenance)
    for dim in DIMENSIONS:
        print("  %-14s %+.2f   confidence %.2f" % (dim, spectrum[dim], confidence[dim]))
    return 0


def _cmd_check(path):
    errors = []
    seen = 0
    with open(path, "r", newline="") as handle:
        for lineno, row in enumerate(csv.DictReader(handle), start=2):
            if not any((v or "").strip() for v in row.values()):
                continue
            seen += 1
            materials = [
                m.strip()
                for m in (row.get("materials") or "").split(";")
                if m.strip()
            ]
            try:
                resolve_spectrum(row.get("style"), materials, row.get("palette"))
            except SpectrumUnresolved as exc:
                errors.append(
                    "line %d (%s): %s" % (lineno, row.get("slug") or "<no slug>", exc)
                )
    if seen == 0:
        sys.stderr.write("error: %s has 0 data rows\n" % path)
        return 1
    for message in errors:
        sys.stderr.write("error: %s\n" % message)
    if errors:
        sys.stderr.write(
            "%d of %d rows cannot be given a spectrum and are therefore not publishable\n"
            % (len(errors), seen)
        )
        return 1
    print("all %d rows resolve to a spectrum" % seen)
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--list-styles", action="store_true")
    group.add_argument("--explain", metavar="STYLE")
    group.add_argument("--check", metavar="MANIFEST.CSV")
    args = parser.parse_args(argv)

    if args.list_styles:
        return _cmd_list_styles()
    if args.explain:
        return _cmd_explain(args.explain)
    return _cmd_check(args.check)


if __name__ == "__main__":
    sys.exit(main())
