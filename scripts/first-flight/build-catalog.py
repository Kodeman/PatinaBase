#!/usr/bin/env python3
"""First Flight L0.3 — manifest CSV to catalogue SQL.

Reads Leah's manifest, validates every row against the catalogue row contract
(PROGRAM.md §3 W0 L0.3, "The catalogue row contract") and emits idempotent SQL:
vendors resolved or inserted by name, `products` upserted at `layer='catalog'`
/ `status='published'`, and one `product_style_spectrum` row per product.

The refusal that matters: a row whose `style` does not resolve to a spectrum is
rejected, never emitted. With no spectrum row `_aesthete_product_spectrum`
returns nothing, `get_aesthete_matches`' spectrum-only candidate path finds
nothing, and the product is invisible however well the rest of the row is
filled in. See scripts/first-flight/build-spectrums.py.

Usage:
  build-catalog.py --check   MANIFEST [--profile fixture|release]
  build-catalog.py --emit    MANIFEST --out FILE
                             [--profile fixture|release]
                             [--storage-base-url URL] [--uploader-uid UUID]
                             [--assigned-by UUID]

`--check` never writes. `--emit` writes SQL to a file and still never touches a
database: applying it is a separate, deliberate step, and against production it
is Kody's.
"""

import argparse
import csv
import datetime
import decimal
import importlib.util
import io
import json
import os
import re
import sys
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))

# ─── the app's category vocabulary ─────────────────────────────────────────
# ProductCategory's six raw values, read from
# apps/mobile/Patina/Patina/Core/Models/ProductModel.swift:289-296. The stored
# string must BE one of these: `ProductCategory(normalizing:)` silently lands
# anything it does not know on `.decor`, so a row stored as 'sofa' renders in
# the wrong category rather than failing loudly (A3-21).
PRODUCT_CATEGORIES = ("seating", "tables", "lighting", "storage", "decor", "textiles")

# `get_recommendations` projects `products.tags` as `badges`, and
# ProductDetailView.swift:484-505 renders them under a "PROVENANCE" heading
# whose help text calls them "verified claims about materials, craft, and
# origin". A tag is therefore tester-visible copy making a verification claim.
# Only these four may be written; everything else is rejected rather than
# shipped as an unreviewed label — and NO internal marker goes in here.
ALLOWED_TAGS = ("maker_piece", "designers_pick", "sourced", "made_to_order")

# The catalogue owner's own folder, per the image path convention
# (PROGRAM.md §3 W0 L0.3, "The image path convention"). Local mirrors prod's
# shape with the seeded superadmin.
LOCAL_UPLOADER_UID = "a0000000-0000-0000-0000-000000000001"
LOCAL_STORAGE_BASE_URL = (
    "http://127.0.0.1:54321/storage/v1/object/public/product-images"
)

# Deterministic ids: build-catalog.py and upload-catalog-images.py derive the
# same product id and the same object name from the manifest alone, so neither
# needs to read the other's output and a re-run overwrites rather than orphans.
#
# The id is also the provenance marker. `id = uuid_generate_v5(FIRST_FLIGHT_NS,
# slug)` identifies a row this pipeline produced, so nothing internal has to be
# smuggled into a tester-visible column to make the seed's own rows countable.
# extensions.uuid_generate_v5 (uuid-ossp) computes the identical value in SQL —
# schema-qualified, because a bare call fails on Strata with 42883.
FIRST_FLIGHT_NS = uuid.UUID("f1a57f11-9c74-4b3e-9c2f-1e5a0b7d4c10")

ALLOWED_IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp", ".avif", ".heic")
# storage.buckets: product-images file_size_limit 52428800, and the app renders
# at <= 402 pt logical width, so 1600 px on the long edge is the ship rule.
MAX_IMAGE_BYTES = 52428800
MAX_LONG_EDGE_PX = 1600

# The charter's release floors.
MIN_ROWS = 30
MIN_CATEGORIES = 6
MIN_MAKERS = 3
MIN_RECENT = 3
RECENT_DAYS = 7
STAGGER_WEEKS = 8

# A "designer selection" that is most of the shelf is decoration, not a claim.
# The share is meaningless on a handful of rows — a partial file Leah is
# checking as she goes would otherwise fail on its first scored piece — so the
# rule only applies once a third is a real fraction.
MAX_HIGH_QUALITY_SHARE = 1.0 / 3.0
HIGH_QUALITY_MIN_SAMPLE = 9
DESIGNER_SELECTION_THRESHOLD = 80

REQUIRED_COLUMNS = (
    "slug",
    "name",
    "category",
    "style",
    "maker_name",
    "price_retail_usd",
    "image_1",
)

OPTIONAL_COLUMNS = (
    "maker_made_in",
    "maker_website",
    "materials",
    "palette",
    "description",
    "width_in",
    "depth_in",
    "height_in",
    "lead_time_weeks",
    "finish",
    "source_url",
    "quality_score",
    "published_at",
    "photo_verified",
    "shipping_flat_usd",
    "tags",
    "image_2",
    "image_3",
)

ALL_COLUMNS = REQUIRED_COLUMNS + OPTIONAL_COLUMNS


def load_spectrums():
    """Import build-spectrums.py by path — a hyphenated filename is not importable."""
    path = os.path.join(HERE, "build-spectrums.py")
    spec = importlib.util.spec_from_file_location("build_spectrums", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


BS = load_spectrums()


class ManifestError(Exception):
    def __init__(self, errors):
        Exception.__init__(self, "%d manifest error(s)" % len(errors))
        self.errors = errors


class Row(object):
    """One validated manifest row, already in the shape the SQL wants."""

    def __init__(self):
        self.slug = None
        self.name = None
        self.category = None
        self.style = None
        self.maker_name = None
        self.maker_made_in = None
        self.maker_website = None
        self.price_retail_cents = None
        self.materials = []
        self.palette = None
        self.description = None
        self.dimensions = None
        self.lead_time_weeks = None
        self.finish = None
        self.source_url = None
        self.quality_score = None
        self.published_at = None
        self.published_offset_minutes = None
        self.photo_verified = False
        self.shipping_flat_cents = None
        self.tags = []
        self.images = []
        self.spectrum = None
        self.spectrum_confidence = None
        self.spectrum_provenance = None
        self.product_id = None
        self.line = None


def product_uuid(slug):
    return str(uuid.uuid5(FIRST_FLIGHT_NS, slug))


def image_object_name(product_id, index, ext):
    return str(uuid.uuid5(FIRST_FLIGHT_NS, "%s/%d" % (product_id, index))) + ext


def image_storage_path(uploader_uid, product_id, index, ext):
    return "%s/%s/%s" % (
        uploader_uid,
        product_id,
        image_object_name(product_id, index, ext),
    )


# ─── field parsers ─────────────────────────────────────────────────────────


def _blank(value):
    return value is None or not str(value).strip()


def _text(value):
    """A blank cell is an absent value, never a placeholder string."""
    if _blank(value):
        return None
    return str(value).strip()


def _cents(value, label, errors, where):
    if _blank(value):
        return None
    raw = str(value).strip().lstrip("$")
    try:
        amount = decimal.Decimal(raw)
    except (decimal.InvalidOperation, ValueError):
        errors.append("%s: %s %r is not a number" % (where, label, value))
        return None
    if amount <= 0:
        errors.append("%s: %s %r must be greater than zero" % (where, label, value))
        return None
    cents = (amount * 100).quantize(decimal.Decimal("1"), rounding=decimal.ROUND_HALF_UP)
    return int(cents)


def _int(value, label, errors, where, low=None, high=None):
    if _blank(value):
        return None
    try:
        number = int(str(value).strip())
    except ValueError:
        errors.append("%s: %s %r is not a whole number" % (where, label, value))
        return None
    if low is not None and number < low:
        errors.append("%s: %s %d is below %d" % (where, label, number, low))
        return None
    if high is not None and number > high:
        errors.append("%s: %s %d is above %d" % (where, label, number, high))
        return None
    return number


def _bool(value):
    return str(value or "").strip().lower() in ("1", "true", "yes", "y")


def _list(value):
    return [part.strip() for part in str(value or "").split(";") if part.strip()]


def _date(value, label, errors, where):
    if _blank(value):
        return None
    raw = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            parsed = datetime.datetime.strptime(raw, fmt)
        except ValueError:
            continue
        return parsed.replace(tzinfo=datetime.timezone.utc)
    errors.append("%s: %s %r is not an ISO date (YYYY-MM-DD)" % (where, label, value))
    return None


def _image(path, manifest_dir, errors, where, field):
    resolved = path if os.path.isabs(path) else os.path.join(manifest_dir, path)
    resolved = os.path.normpath(resolved)
    if not os.path.isfile(resolved):
        errors.append("%s: %s file not found: %s" % (where, field, path))
        return None
    ext = os.path.splitext(resolved)[1].lower()
    if ext not in ALLOWED_IMAGE_EXT:
        errors.append(
            "%s: %s %s is not one of %s (the product-images bucket rejects it)"
            % (where, field, ext or "<no extension>", ", ".join(ALLOWED_IMAGE_EXT))
        )
        return None
    size = os.path.getsize(resolved)
    if size > MAX_IMAGE_BYTES:
        errors.append(
            "%s: %s is %d bytes, over the bucket's %d limit"
            % (where, field, size, MAX_IMAGE_BYTES)
        )
        return None
    return resolved


# ─── the staggered publish dates ───────────────────────────────────────────


def _stagger(count):
    """Deterministic publish offsets, in hours before now, across STAGGER_WEEKS.

    The newest rows land inside RECENT_DAYS so NEW THIS WEEK has something to
    draw (it needs at least MIN_RECENT rows). These are not invented facts
    about the piece: `published_at` means the moment the piece entered the
    Patina catalogue, and the seed is that moment.

    Offsets rather than timestamps, so the generated SQL can say
    `now() - interval 'N hours'` and stay true on a stack reset months later.
    """
    offsets = []
    span_days = STAGGER_WEEKS * 7 - 1
    # A quarter of the shelf, rounded UP: floor division gives 7 on a 30-row
    # manifest and the charter asks for at least 8. The 6-row fixture is
    # unaffected (both forms are floored at MIN_RECENT).
    recent = min(count, max(MIN_RECENT, -(-count // 4)))
    for index in range(count):
        if index < recent:
            # spread across the last RECENT_DAYS, newest first
            offset_hours = int(round(index * (RECENT_DAYS - 1) * 24.0 / max(recent, 1)))
        else:
            older = index - recent
            older_total = max(count - recent, 1)
            offset_days = RECENT_DAYS + (
                (span_days - RECENT_DAYS) * older / float(older_total)
            )
            offset_hours = int(round(offset_days * 24))
        # a distinct minute per row keeps the ordering stable and total
        offsets.append(offset_hours * 60 + index)
    return offsets


def count_recent(rows, days=RECENT_DAYS):
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)
    return len([r for r in rows if r.published_at and r.published_at > cutoff])


def count_within(rows, days):
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)
    return len([r for r in rows if r.published_at and r.published_at >= cutoff])


# ─── the manifest reader ───────────────────────────────────────────────────


def load_manifest(path, profile="release", now=None):
    """Parse and validate. Raises ManifestError carrying every error at once."""
    now = now or datetime.datetime.now(datetime.timezone.utc)
    manifest_dir = os.path.dirname(os.path.abspath(path))
    errors = []
    rows = []

    with open(path, "r", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ManifestError(["%s: 0 data rows (no header)" % path])
        missing = [c for c in REQUIRED_COLUMNS if c not in reader.fieldnames]
        if missing:
            raise ManifestError(
                ["%s: header is missing required column(s): %s" % (path, ", ".join(missing))]
            )
        for lineno, raw in enumerate(reader, start=2):
            if not any((v or "").strip() for v in raw.values()):
                continue
            rows.append(_parse_row(raw, lineno, manifest_dir, errors))

    if not rows:
        raise ManifestError(["%s: 0 data rows" % path])

    # Dates first: the NEW THIS WEEK floor is a check on resolved dates, and
    # _assign_dates only fills blank cells — a manifest Leah dates in full is
    # exactly the case the floor has to catch.
    _assign_dates(rows, now)
    _check_manifest(rows, errors, profile, path)

    if errors:
        raise ManifestError(errors)
    return rows


def _parse_row(raw, lineno, manifest_dir, errors):
    where = "line %d (%s)" % (lineno, (raw.get("slug") or "<no slug>").strip())
    row = Row()
    row.line = lineno

    for column in REQUIRED_COLUMNS:
        if _blank(raw.get(column)):
            errors.append("%s: %s is required and is blank" % (where, column))

    row.slug = _text(raw.get("slug"))
    if row.slug and not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", row.slug):
        errors.append(
            "%s: slug %r must be lowercase words joined by single hyphens" % (where, row.slug)
        )
    row.name = _text(raw.get("name"))

    category = (_text(raw.get("category")) or "").lower()
    if category and category not in PRODUCT_CATEGORIES:
        errors.append(
            "%s: category %r is not one of ProductCategory's six raw values (%s)"
            % (where, raw.get("category"), ", ".join(PRODUCT_CATEGORIES))
        )
    row.category = category or None

    row.maker_name = _text(raw.get("maker_name"))
    if row.maker_name and row.maker_name.strip().lower() == "unknown maker":
        errors.append(
            "%s: maker_name 'Unknown Maker' is the literal the app drops rows on "
            "(Product.resolvedMakerName) — name the maker or leave the piece out" % where
        )
    row.maker_made_in = _text(raw.get("maker_made_in"))
    row.maker_website = _text(raw.get("maker_website"))

    row.price_retail_cents = _cents(
        raw.get("price_retail_usd"), "price_retail_usd", errors, where
    )
    row.shipping_flat_cents = _cents(
        raw.get("shipping_flat_usd"), "shipping_flat_usd", errors, where
    )

    row.materials = _list(raw.get("materials"))
    row.palette = _text(raw.get("palette"))
    row.description = _text(raw.get("description"))
    row.finish = _text(raw.get("finish"))
    row.source_url = _text(raw.get("source_url"))
    row.lead_time_weeks = _int(
        raw.get("lead_time_weeks"), "lead_time_weeks", errors, where, low=1, high=104
    )
    row.quality_score = _int(
        raw.get("quality_score"), "quality_score", errors, where, low=0, high=100
    )
    row.photo_verified = _bool(raw.get("photo_verified"))
    row.published_at = _date(raw.get("published_at"), "published_at", errors, where)

    width = _int(raw.get("width_in"), "width_in", errors, where, low=1)
    depth = _int(raw.get("depth_in"), "depth_in", errors, where, low=1)
    height = _int(raw.get("height_in"), "height_in", errors, where, low=1)
    if width or depth or height:
        dims = {"unit": "in"}
        if width:
            dims["width"] = width
        if depth:
            dims["depth"] = depth
        if height:
            dims["height"] = height
        row.dimensions = dims

    for tag in _list(raw.get("tags")):
        if tag not in ALLOWED_TAGS:
            errors.append(
                "%s: tag %r is not allow-listed (%s) — tags reach the tester as "
                "`badges` in get_recommendations" % (where, tag, ", ".join(ALLOWED_TAGS))
            )
        else:
            row.tags.append(tag)

    for index, field in enumerate(("image_1", "image_2", "image_3")):
        value = _text(raw.get(field))
        if value is None:
            continue
        resolved = _image(value, manifest_dir, errors, where, field)
        if resolved:
            row.images.append(resolved)

    row.style = _text(raw.get("style"))
    try:
        spectrum, confidence, provenance = BS.resolve_spectrum(
            row.style, row.materials, row.palette
        )
        row.spectrum = spectrum
        row.spectrum_confidence = confidence
        row.spectrum_provenance = provenance
        row.style = BS.canonical_style(row.style)
    except BS.SpectrumUnresolved as exc:
        errors.append(
            "%s: no spectrum, so the row is not publishable — %s" % (where, exc)
        )

    if row.slug:
        row.product_id = product_uuid(row.slug)
    return row


def _check_manifest(rows, errors, profile, path):
    seen = {}
    for row in rows:
        if not row.slug:
            continue
        if row.slug in seen:
            errors.append(
                "line %d: duplicate slug %r (first seen on line %d)"
                % (row.line, row.slug, seen[row.slug])
            )
        else:
            seen[row.slug] = row.line

    # NEW THIS WEEK needs MIN_RECENT rows or the rail does not render, and the
    # SQL test's case 5 asserts the same number in both profiles. Checked here
    # so a manifest that would fail it fails BEFORE the photographs are
    # uploaded and the rows applied.
    # A manifest smaller than the floor cannot satisfy it, and a two-row file is
    # a mechanics check rather than a shelf — the same reasoning as
    # HIGH_QUALITY_MIN_SAMPLE below. Round one's manifest is >= 30 rows.
    recent = count_recent(rows)
    if len(rows) >= MIN_RECENT and recent < MIN_RECENT:
        errors.append(
            "%s: %d row(s) published inside %d days, below the floor of %d — "
            "NEW THIS WEEK will not render. Leave `published_at` blank on at "
            "least %d pieces (the generator staggers them) or date them inside "
            "the last week"
            % (path, recent, RECENT_DAYS, MIN_RECENT, MIN_RECENT)
        )

    # One maker is one vendors row, so two manifest rows naming the same maker
    # must not disagree about where it works or what its site is: the emitted
    # SQL can only write one value, and silently taking the first row's is how
    # a wrong origin reaches `maker_location` in the app. A blank cell is an
    # absence, never a disagreement.
    for field, label in (("maker_made_in", "made_in"), ("maker_website", "website")):
        seen_value = {}
        for row in rows:
            value = getattr(row, field)
            if not row.maker_name or not value:
                continue
            if row.maker_name not in seen_value:
                seen_value[row.maker_name] = (value, row.line)
            elif seen_value[row.maker_name][0] != value:
                errors.append(
                    "line %d: maker %r gives %s %r here and %r on line %d — one "
                    "maker is one vendors row and can carry only one value"
                    % (
                        row.line,
                        row.maker_name,
                        label,
                        value,
                        seen_value[row.maker_name][0],
                        seen_value[row.maker_name][1],
                    )
                )

    scored = [r for r in rows if r.quality_score is not None]
    high = [r for r in scored if r.quality_score >= DESIGNER_SELECTION_THRESHOLD]
    if len(rows) >= HIGH_QUALITY_MIN_SAMPLE and len(high) > MAX_HIGH_QUALITY_SHARE * len(rows):
        errors.append(
            "%s: %d of %d rows carry quality_score >= %d, which makes "
            "'designer selection' the default rather than a claim — cap it at a third"
            % (path, len(high), len(rows), DESIGNER_SELECTION_THRESHOLD)
        )

    if profile != "release":
        return

    if len(rows) < MIN_ROWS:
        errors.append(
            "%s: %d rows, below the round-one floor of %d" % (path, len(rows), MIN_ROWS)
        )
    categories = set(r.category for r in rows if r.category)
    if len(categories) < MIN_CATEGORIES:
        errors.append(
            "%s: %d categories (%s), below the floor of %d — the app's six-category "
            "model cannot be filled"
            % (path, len(categories), ", ".join(sorted(categories)) or "none", MIN_CATEGORIES)
        )
    makers = set(r.maker_name for r in rows if r.maker_name)
    if len(makers) < MIN_MAKERS:
        errors.append(
            "%s: %d maker(s), below the floor of %d" % (path, len(makers), MIN_MAKERS)
        )


def _assign_dates(rows, now):
    """Fill published_at where the manifest left it blank.

    `published_offset_minutes` is what the SQL emits; `published_at` is the
    resolved datetime the validator counts with.
    """
    blanks = [r for r in rows if r.published_at is None]
    if not blanks:
        return
    for row, minutes in zip(blanks, _stagger(len(blanks))):
        row.published_offset_minutes = minutes
        row.published_at = now - datetime.timedelta(minutes=minutes)


# ─── SQL rendering ─────────────────────────────────────────────────────────


def q(value):
    """A SQL literal, or NULL. Never a placeholder."""
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def q_array(values):
    if not values:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ", ".join(q(v) for v in values) + "]"


def q_json(value):
    if value is None:
        return "NULL"
    return q(json.dumps(value, sort_keys=True)) + "::jsonb"


def q_int(value):
    return "NULL" if value is None else str(int(value))


def q_published(row):
    """The publish timestamp expression for one row.

    A manifest-supplied date is an absolute literal — it is a fact about the
    piece. A generator-staggered date is emitted RELATIVE to now(), so the
    committed seed stays byte-identical between regenerations and a stack reset
    six weeks from today still has three rows inside the last seven days.
    """
    if row.published_offset_minutes is None:
        return q(row.published_at.strftime("%Y-%m-%d %H:%M:%S+00")) + "::timestamptz"
    return "now() - interval '%d minutes'" % row.published_offset_minutes


def render_sql(rows, storage_base_url, uploader_uid, assigned_by, profile="release",
               manifest_name="<manifest>"):
    out = io.StringIO()

    out.write(
        "-- ═══════════════════════════════════════════════════════════════════════════\n"
        "-- First Flight catalogue — GENERATED, do not hand-edit.\n"
        "--\n"
        "--   generator : scripts/first-flight/build-catalog.py\n"
        "--   manifest  : %s\n"
        "--   profile   : %s\n"
        "--   rows      : %d\n"
        "--\n"
        "-- No generation timestamp and no absolute seeded dates: the file is a\n"
        "-- deterministic function of the manifest, so regenerating it produces no\n"
        "-- diff, and a stack reset months from now still has rows inside the last\n"
        "-- seven days for NEW THIS WEEK to draw.\n"
        "--\n"
        "-- Re-generate rather than patch: product ids and image object names are\n"
        "-- uuid5 derivations of the manifest, so the same manifest always produces\n"
        "-- the same file and re-running overwrites rather than duplicates.\n"
        "--\n"
        "-- `published_at` means the moment the piece entered the Patina catalogue.\n"
        "-- Rows whose manifest cell was blank carry a staggered seeding timestamp;\n"
        "-- that is the only thing the column asserts.\n"
        "--\n"
        "-- `photo_verified_at` is written as now() where the manifest's\n"
        "-- `photo_verified` box is ticked. The manifest carries a boolean, not a\n"
        "-- moment, so the column records THIS SEEDING PASS rather than claiming to\n"
        "-- know when the photograph was checked. It is never the publish date.\n"
        "--\n"
        "-- Every optional column the manifest left blank is written as NULL. A piece\n"
        "-- with no lead time has no lead time; the app omits the line rather than\n"
        "-- printing a placeholder.\n"
        "--\n"
        "-- `patina_managed` is not a choice here: products_catalog_requires_management\n"
        "-- CHECKs (layer <> 'catalog' OR patina_managed) and the\n"
        "-- products_normalize_layer_defaults BEFORE INSERT trigger sets it true for\n"
        "-- every catalog row.\n"
        "-- ═══════════════════════════════════════════════════════════════════════════\n\n"
        % (manifest_name, profile, len(rows))
    )

    out.write(
        "-- Applied by `pnpm supabase:reset` (wired into config.toml [db.seed]) and,\n"
        "-- on production, by a Kody-run `psql -1 -f`. No BEGIN/COMMIT here: no other\n"
        "-- seed file in this tree opens a transaction, and psql's -1 is what makes the\n"
        "-- production apply all-or-nothing.\n\n"
    )
    out.write(
        "-- ─── the slug guard, before anything is written ──────────────────────────\n"
        "-- Idempotency is keyed on the derived id, not the slug, and products.slug\n"
        "-- carries no unique index. A manifest slug that already belongs to a\n"
        "-- different row would therefore INSERT a second, near-identical published\n"
        "-- piece rather than update the first. Stop instead: the collision is a\n"
        "-- decision for a person, not a thing to resolve automatically.\n"
        "DO $ff$\nDECLARE\n  v_slug text;\n  v_id uuid;\nBEGIN\n"
    )
    for row in rows:
        out.write(
            "  SELECT p.slug, p.id INTO v_slug, v_id FROM public.products p\n"
            "   WHERE p.slug = %s AND p.id <> %s::uuid LIMIT 1;\n"
            "  IF v_slug IS NOT NULL THEN\n"
            "    RAISE EXCEPTION 'slug %% already exists on a different row (%%) — "
            "resolve by hand before seeding', v_slug, v_id;\n"
            "  END IF;\n"
            % (q(row.slug), q(row.product_id))
        )
    out.write("END\n$ff$;\n\n")

    out.write("-- ─── makers ──────────────────────────────────────────────────────────────\n")
    out.write(
        "-- vendors has no unique constraint on name, so ON CONFLICT is unavailable:\n"
        "-- resolve by lower(name), insert when absent, and refuse an ambiguous name\n"
        "-- rather than pick one. `maker_name` must never resolve to 'Unknown Maker' —\n"
        "-- Product.resolvedMakerName drops those rows client-side.\n"
    )
    out.write(
        "-- An existing vendor is UPDATED, not left alone: is_patina_catalog is\n"
        "-- what gates create_direct_order (A3-20), and made_in reaches the app as\n"
        "-- `maker_location`. Both are COALESCEd — this apply fills what the row does\n"
        "-- not know and overwrites nothing it does — and every vendor whose\n"
        "-- is_patina_catalog it actually changes is announced, so the flip lands in\n"
        "-- the apply report rather than happening quietly to production data.\n"
    )
    out.write("DO $ff$\nDECLARE\n  v_n int;\n  v_was boolean;\nBEGIN\n")

    makers = {}
    for row in rows:
        if not row.maker_name:
            continue
        entry = makers.setdefault(row.maker_name, {"made_in": None, "website": None})
        if entry["made_in"] is None:
            entry["made_in"] = row.maker_made_in
        if entry["website"] is None:
            entry["website"] = row.maker_website
    for maker_name in sorted(makers):
        entry = makers[maker_name]
        out.write(
            "\n  SELECT count(*) INTO v_n FROM public.vendors WHERE lower(name) = lower(%s);\n"
            % q(maker_name)
        )
        out.write(
            "  IF v_n > 1 THEN\n"
            "    RAISE EXCEPTION 'maker %% matches %% vendor rows — resolve by hand before seeding', %s, v_n;\n"
            "  ELSIF v_n = 0 THEN\n"
            "    INSERT INTO public.vendors (name, made_in, website, is_patina_catalog)\n"
            "    VALUES (%s, %s, %s, true);\n"
            "  ELSE\n"
            "    SELECT is_patina_catalog INTO v_was FROM public.vendors WHERE lower(name) = lower(%s);\n"
            "    UPDATE public.vendors SET\n"
            "      is_patina_catalog = true,\n"
            "      made_in = COALESCE(public.vendors.made_in, %s),\n"
            "      website = COALESCE(public.vendors.website, %s)\n"
            "     WHERE lower(name) = lower(%s);\n"
            "    IF v_was IS DISTINCT FROM true THEN\n"
            "      RAISE NOTICE 'vendor %% is_patina_catalog %% -> true (pre-existing row)', %s, v_was;\n"
            "    END IF;\n"
            "  END IF;\n"
            % (
                q(maker_name),
                q(maker_name),
                q(entry["made_in"]),
                q(entry["website"]),
                q(maker_name),
                q(entry["made_in"]),
                q(entry["website"]),
                q(maker_name),
                q(maker_name),
            )
        )
    out.write("END\n$ff$;\n\n")

    out.write("-- ─── pieces ──────────────────────────────────────────────────────────────\n")
    for row in rows:
        images = []
        for index, path in enumerate(row.images):
            ext = os.path.splitext(path)[1].lower()
            images.append(
                "%s/%s"
                % (
                    storage_base_url.rstrip("/"),
                    image_storage_path(uploader_uid, row.product_id, index, ext),
                )
            )
        # Only Leah's own allow-listed provenance words. No internal marker:
        # these render to a tester under a "verified claims" heading.
        tags = list(row.tags)
        out.write(
            "\nINSERT INTO public.products (\n"
            "  id, name, slug, brand, description, category, status, layer,\n"
            "  price_retail, materials, style_tags, tags, finish, dimensions,\n"
            "  lead_time_weeks, images, source_url, quality_score, published_at,\n"
            "  photo_verified_at, shipping_flat_cents, vendor_id,\n"
            "  captured_by, captured_at\n"
            ") VALUES (\n"
            "  %s, %s, %s, %s, %s,\n"
            "  %s, 'published', 'catalog',\n"
            "  %s, %s, %s, %s,\n"
            "  %s, %s, %s,\n"
            "  %s,\n"
            "  %s, %s, %s,\n"
            "  %s, %s,\n"
            "  (SELECT id FROM public.vendors WHERE lower(name) = lower(%s) LIMIT 1),\n"
            "  %s, %s\n"
            ")\n"
            "ON CONFLICT (id) DO UPDATE SET\n"
            "  name = EXCLUDED.name, slug = EXCLUDED.slug, brand = EXCLUDED.brand,\n"
            "  description = EXCLUDED.description, category = EXCLUDED.category,\n"
            "  status = EXCLUDED.status, layer = EXCLUDED.layer,\n"
            "  price_retail = EXCLUDED.price_retail, materials = EXCLUDED.materials,\n"
            "  style_tags = EXCLUDED.style_tags, tags = EXCLUDED.tags,\n"
            "  finish = EXCLUDED.finish, dimensions = EXCLUDED.dimensions,\n"
            "  lead_time_weeks = EXCLUDED.lead_time_weeks, images = EXCLUDED.images,\n"
            "  source_url = EXCLUDED.source_url, quality_score = EXCLUDED.quality_score,\n"
            "  published_at = EXCLUDED.published_at,\n"
            "  photo_verified_at = EXCLUDED.photo_verified_at,\n"
            "  shipping_flat_cents = EXCLUDED.shipping_flat_cents,\n"
            "  vendor_id = EXCLUDED.vendor_id, updated_at = now();\n"
            % (
                q(row.product_id),
                q(row.name),
                q(row.slug),
                q(row.maker_name),
                q(row.description),
                q(row.category),
                q_int(row.price_retail_cents),
                q_array(row.materials),
                q_array([row.style]),
                q_array(tags),
                q(row.finish),
                q_json(row.dimensions),
                q_int(row.lead_time_weeks),
                q_array(images),
                q(row.source_url),
                q_int(row.quality_score),
                q_published(row),
                "now()" if row.photo_verified else "NULL",
                q_int(row.shipping_flat_cents),
                q(row.maker_name),
                q(assigned_by),
                q_published(row),
            )
        )
        out.write(
            "-- %s\nINSERT INTO public.product_style_spectrum (\n"
            "  product_id, warmth, complexity, formality, timelessness, boldness,\n"
            "  craftsmanship, source, confidence, assigned_by\n"
            ") VALUES (\n"
            "  %s, %s, %s, %s, %s, %s, %s,\n"
            "  %s, %s, %s\n"
            ")\n"
            "ON CONFLICT (product_id) DO UPDATE SET\n"
            "  warmth = EXCLUDED.warmth, complexity = EXCLUDED.complexity,\n"
            "  formality = EXCLUDED.formality, timelessness = EXCLUDED.timelessness,\n"
            "  boldness = EXCLUDED.boldness, craftsmanship = EXCLUDED.craftsmanship,\n"
            "  source = EXCLUDED.source, confidence = EXCLUDED.confidence,\n"
            "  updated_at = now();\n"
            % (
                row.spectrum_provenance,
                q(row.product_id),
                repr(row.spectrum["warmth"]),
                repr(row.spectrum["complexity"]),
                repr(row.spectrum["formality"]),
                repr(row.spectrum["timelessness"]),
                repr(row.spectrum["boldness"]),
                repr(row.spectrum["craftsmanship"]),
                q(BS.SPECTRUM_SOURCE),
                q_json(row.spectrum_confidence),
                q(assigned_by),
            )
        )

    out.write(
        "\n-- ─── the refusal, restated as an assertion ───────────────────────────────\n"
        "-- A publishable row with no spectrum is invisible to get_aesthete_matches.\n"
        "-- The generator cannot emit one; this catches a hand-edit that removed a\n"
        "-- spectrum insert but left the product behind.\n"
        "DO $ff$\nDECLARE\n  v_missing int;\nBEGIN\n"
        "  SELECT count(*) INTO v_missing\n"
        "    FROM public.products p\n"
        "    LEFT JOIN LATERAL public._aesthete_product_spectrum(p.id) sp ON true\n"
        "   WHERE p.layer = 'catalog' AND p.status = 'published'\n"
        "     AND p.slug IS NOT NULL\n"
        "     AND p.id = extensions.uuid_generate_v5(%s::uuid, p.slug)\n"
        "     AND sp.spectrums IS NULL;\n"
        "  IF v_missing > 0 THEN\n"
        "    RAISE EXCEPTION '%% first-flight row(s) have no spectrum and would be invisible', v_missing;\n"
        "  END IF;\n"
        "END\n$ff$;\n\n" % q(str(FIRST_FLIGHT_NS))
    )
    return out.getvalue()


# ─── CLI ───────────────────────────────────────────────────────────────────


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", metavar="MANIFEST")
    mode.add_argument("--emit", metavar="MANIFEST")
    parser.add_argument("--out", metavar="FILE")
    parser.add_argument(
        "--profile", choices=("fixture", "release"), default="release",
        help="release enforces the charter's floors (>=30 rows, 6 categories, "
             ">=3 makers); fixture checks the row contract only",
    )
    parser.add_argument("--storage-base-url", default=LOCAL_STORAGE_BASE_URL)
    parser.add_argument("--uploader-uid", default=LOCAL_UPLOADER_UID)
    parser.add_argument("--assigned-by", default=None,
                        help="uuid written to products.captured_by and "
                             "product_style_spectrum.assigned_by (default: --uploader-uid)")
    args = parser.parse_args(argv)

    path = args.check or args.emit
    try:
        rows = load_manifest(path, profile=args.profile)
    except ManifestError as exc:
        for message in exc.errors:
            sys.stderr.write("error: %s\n" % message)
        sys.stderr.write(
            "\n%s: %d error(s) — nothing emitted\n" % (path, len(exc.errors))
        )
        return 1

    categories = sorted(set(r.category for r in rows))
    makers = sorted(set(r.maker_name for r in rows))
    print(
        "%s: %d rows · %d categories (%s) · %d makers · %d published inside %d days · "
        "%d with a spectrum"
        % (
            path,
            len(rows),
            len(categories),
            ", ".join(categories),
            len(makers),
            count_recent(rows),
            RECENT_DAYS,
            len([r for r in rows if r.spectrum]),
        )
    )

    if args.check:
        return 0

    if not args.out:
        sys.stderr.write("error: --emit needs --out FILE\n")
        return 2

    sql = render_sql(
        rows,
        storage_base_url=args.storage_base_url,
        uploader_uid=args.uploader_uid,
        assigned_by=args.assigned_by or args.uploader_uid,
        profile=args.profile,
        manifest_name=os.path.basename(path),
    )
    directory = os.path.dirname(os.path.abspath(args.out))
    if directory and not os.path.isdir(directory):
        os.makedirs(directory)
    with open(args.out, "w") as handle:
        handle.write(sql)
    print("wrote %s (%d bytes)" % (args.out, len(sql)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
