#!/usr/bin/env python3
"""Self-test for scripts/first-flight/build-catalog.py.

Run: python3 scripts/first-flight/catalog_selftest.py
Exit 0 = every case passed. Any failure prints the case and exits 1.

Every case writes its own manifest into a temporary directory, so the test
depends on nothing but this repo's own image files and needs no database.
"""

import importlib.util
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
PHOTO = os.path.join(
    REPO, "artifacts/ios-daily-return-2026-08-26/mock/img/pendant-lamp.jpg"
)

HEADER = (
    "slug,name,category,style,maker_name,maker_made_in,maker_website,"
    "price_retail_usd,materials,palette,description,width_in,depth_in,height_in,"
    "lead_time_weeks,finish,source_url,quality_score,published_at,"
    "photo_verified,shipping_flat_usd,tags,image_1,image_2,image_3\n"
)

CATEGORIES = ["seating", "tables", "lighting", "storage", "decor", "textiles"]

FAILURES = []


def load_catalog():
    path = os.path.join(HERE, "build-catalog.py")
    spec = importlib.util.spec_from_file_location("build_catalog", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def check(name, condition, detail=""):
    if condition:
        print("  ok   %s" % name)
    else:
        print("  FAIL %s %s" % (name, detail))
        FAILURES.append(name)


def row(**over):
    values = {
        "slug": "test-piece",
        "name": "Test Piece",
        "category": "lighting",
        "style": "Warm Modern",
        "maker_name": "Test Workshop",
        "maker_made_in": "Portland, Oregon",
        "maker_website": "",
        "price_retail_usd": "1200.00",
        "materials": "white oak;linen",
        "palette": "natural",
        "description": "",
        "width_in": "",
        "depth_in": "",
        "height_in": "",
        "lead_time_weeks": "",
        "finish": "",
        "source_url": "",
        "quality_score": "",
        "published_at": "",
        "photo_verified": "",
        "shipping_flat_usd": "",
        "tags": "",
        "image_1": PHOTO,
        "image_2": "",
        "image_3": "",
    }
    values.update(over)
    order = HEADER.strip().split(",")
    return ",".join('"%s"' % values[k].replace('"', '""') for k in order) + "\n"


def write_manifest(tmp, rows, name="m.csv"):
    path = os.path.join(tmp, name)
    with open(path, "w") as handle:
        handle.write(HEADER)
        for r in rows:
            handle.write(r)
    return path


def errors_for(bc, path, profile="fixture"):
    """Return the validator's error list for one manifest."""
    try:
        bc.load_manifest(path, profile=profile)
    except bc.ManifestError as exc:
        return list(exc.errors)
    return []


def main():
    bc = load_catalog()
    if not os.path.exists(PHOTO):
        print("FAIL: fixture photo missing at %s" % PHOTO)
        return 1

    tmp = tempfile.mkdtemp(prefix="ff-catalog-selftest-")
    try:
        print("1. a well-formed row validates")
        path = write_manifest(tmp, [row()])
        errs = errors_for(bc, path)
        check("1a no errors", not errs, repr(errs))

        print("2. required columns are enforced")
        for column, value in (
            ("slug", ""),
            ("name", ""),
            ("category", ""),
            ("style", ""),
            ("maker_name", ""),
            ("price_retail_usd", ""),
            ("image_1", ""),
        ):
            path = write_manifest(tmp, [row(**{column: value})])
            errs = errors_for(bc, path)
            check(
                "2a missing %s is rejected" % column,
                any(column in e for e in errs),
                repr(errs),
            )

        print("3. the category vocabulary is ProductCategory's six raw values")
        check(
            "3a the six values, exactly",
            sorted(bc.PRODUCT_CATEGORIES) == sorted(CATEGORIES),
            repr(sorted(bc.PRODUCT_CATEGORIES)),
        )
        path = write_manifest(tmp, [row(category="sofa")])
        errs = errors_for(bc, path)
        check("3b 'sofa' is rejected", any("category" in e for e in errs), repr(errs))
        path = write_manifest(tmp, [row(category="Lighting")])
        errs = errors_for(bc, path)
        check("3c 'Lighting' is accepted and lowercased", not errs, repr(errs))

        print("4. a blank optional column becomes SQL NULL, never a placeholder")
        path = write_manifest(tmp, [row()])
        rows = bc.load_manifest(path, profile="fixture")
        check("4a description is None", rows[0].description is None, repr(rows[0].description))
        check("4b finish is None", rows[0].finish is None, repr(rows[0].finish))
        check("4c dimensions is None", rows[0].dimensions is None, repr(rows[0].dimensions))
        check(
            "4d lead_time_weeks is None",
            rows[0].lead_time_weeks is None,
            repr(rows[0].lead_time_weeks),
        )
        sql = bc.render_sql(rows, storage_base_url="http://x/y", uploader_uid=bc.LOCAL_UPLOADER_UID,
                            assigned_by=bc.LOCAL_UPLOADER_UID, profile="fixture")
        # Comments are prose about the contract and legitimately name the
        # 'Unknown Maker' literal; the claim is about emitted values.
        statements = "\n".join(
            line for line in sql.splitlines() if not line.lstrip().startswith("--")
        )
        check(
            "4e the emitted statements carry no placeholder values",
            "TBD" not in statements
            and "N/A" not in statements
            and "Unknown Maker" not in statements,
            "placeholder found",
        )
        check(
            "4f blanks are emitted as NULL",
            statements.count("NULL") >= 4,
            str(statements.count("NULL")),
        )

        print("5. price is validated")
        for bad in ("", "0", "-5", "free", "1,200"):
            path = write_manifest(tmp, [row(price_retail_usd=bad)])
            errs = errors_for(bc, path)
            check(
                "5a price %r is rejected" % bad,
                any("price" in e for e in errs),
                repr(errs),
            )
        path = write_manifest(tmp, [row(price_retail_usd="1200.50")])
        rows = bc.load_manifest(path, profile="fixture")
        check(
            "5b 1200.50 becomes 120050 cents",
            rows[0].price_retail_cents == 120050,
            repr(rows[0].price_retail_cents),
        )

        print("6. an unresolvable maker is rejected")
        path = write_manifest(tmp, [row(maker_name="Unknown Maker")])
        errs = errors_for(bc, path)
        check(
            "6a 'Unknown Maker' is rejected",
            any("Unknown Maker" in e for e in errs),
            repr(errs),
        )

        print("7. the style must resolve to a spectrum")
        path = write_manifest(tmp, [row(style="vaporwave brutalist")])
        errs = errors_for(bc, path)
        check(
            "7a an unmapped style is rejected",
            any("spectrum" in e or "vocabulary" in e for e in errs),
            repr(errs),
        )

        print("8. tags are allow-listed")
        path = write_manifest(tmp, [row(tags="best_seller")])
        errs = errors_for(bc, path)
        check("8a an unlisted tag is rejected", any("tag" in e for e in errs), repr(errs))
        path = write_manifest(tmp, [row(tags="maker_piece")])
        errs = errors_for(bc, path)
        check("8b an allow-listed tag is accepted", not errs, repr(errs))

        print("8b. no internal marker reaches products.tags")
        # get_recommendations projects tags as `badges`, and
        # ProductDetailView.swift:484-505 renders them under a "PROVENANCE"
        # heading calling them verified claims. Only Leah's words go there.
        path = write_manifest(tmp, [row(tags="maker_piece")])
        rows = bc.load_manifest(path, profile="fixture")
        sql = bc.render_sql(
            rows,
            storage_base_url="http://x/y",
            uploader_uid=bc.LOCAL_UPLOADER_UID,
            assigned_by=bc.LOCAL_UPLOADER_UID,
            profile="fixture",
        )
        statements = "\n".join(
            line for line in sql.splitlines() if not line.lstrip().startswith("--")
        )
        check(
            "8b-i tags carry only the manifest's allow-listed words",
            "ARRAY['maker_piece']" in statements,
            "not found",
        )
        check(
            "8b-ii no 'first_flight' marker in any emitted statement",
            "first_flight" not in statements,
            "internal marker emitted",
        )
        path = write_manifest(tmp, [row(tags="")])
        rows = bc.load_manifest(path, profile="fixture")
        statements = "\n".join(
            line
            for line in bc.render_sql(
                rows,
                storage_base_url="http://x/y",
                uploader_uid=bc.LOCAL_UPLOADER_UID,
                assigned_by=bc.LOCAL_UPLOADER_UID,
                profile="fixture",
            ).splitlines()
            if not line.lstrip().startswith("--")
        )
        check(
            "8b-iii no manifest tags means an empty badge array",
            "ARRAY[]::text[]" in statements,
            "not found",
        )
        check(
            "8b-iv the seed's own guard scopes on the derived id",
            "extensions.uuid_generate_v5(" in statements,
            "not found",
        )

        print("9. a missing image file is rejected")
        path = write_manifest(tmp, [row(image_1=os.path.join(tmp, "nope.jpg"))])
        errs = errors_for(bc, path)
        check("9a rejected", any("nope.jpg" in e for e in errs), repr(errs))

        print("10. duplicate slugs are rejected")
        path = write_manifest(tmp, [row(), row(name="Other")])
        errs = errors_for(bc, path)
        check("10a rejected", any("duplicate" in e for e in errs), repr(errs))

        print("11. quality_score is bounded, and 'designer selection' cannot be most of the shelf")
        path = write_manifest(tmp, [row(quality_score="140")])
        errs = errors_for(bc, path)
        check("11a 140 is rejected", any("quality_score" in e for e in errs), repr(errs))
        many = [
            row(slug="p%d" % i, quality_score="90" if i < 5 else "")
            for i in range(12)
        ]
        path = write_manifest(tmp, many)
        errs = errors_for(bc, path)
        check(
            "11b 5 of 12 rows at >=80 is rejected",
            any("quality_score" in e and "80" in e for e in errs),
            repr(errs),
        )
        few = [
            row(slug="p%d" % i, quality_score="90" if i < 4 else "")
            for i in range(12)
        ]
        path = write_manifest(tmp, few)
        errs = errors_for(bc, path)
        check("11c 4 of 12 rows at >=80 is accepted", not errs, repr(errs))
        # The share is meaningless below HIGH_QUALITY_MIN_SAMPLE rows: a partial
        # file with one scored piece must not fail.
        path = write_manifest(tmp, [row(quality_score="84")])
        errs = errors_for(bc, path)
        check("11d one scored row in a one-row file is accepted", not errs, repr(errs))

        print("12. the release profile enforces the charter's four floors")
        path = write_manifest(tmp, [row(slug="p%d" % i) for i in range(6)])
        errs = errors_for(bc, path, profile="release")
        joined = " | ".join(errs)
        check("12a fewer than 30 rows", "30" in joined, joined)
        check("12b fewer than 6 categories", "categor" in joined, joined)
        check("12c fewer than 3 makers", "maker" in joined, joined)
        check(
            "12d the same manifest passes the fixture profile",
            not errors_for(bc, path, profile="fixture"),
            repr(errors_for(bc, path, profile="fixture")),
        )

        print("13. ids and image object names are deterministic")
        path = write_manifest(tmp, [row()])
        a = bc.load_manifest(path, profile="fixture")[0]
        b = bc.load_manifest(path, profile="fixture")[0]
        check("13a product id stable", a.product_id == b.product_id, a.product_id)
        check(
            "13b object name stable",
            bc.image_object_name(a.product_id, 0, ".jpg")
            == bc.image_object_name(b.product_id, 0, ".jpg"),
            bc.image_object_name(a.product_id, 0, ".jpg"),
        )
        check(
            "13c different slugs give different ids",
            bc.product_uuid("one") != bc.product_uuid("two"),
            "collision",
        )

        print("14. published_at is staggered, newest inside 7 days")
        path = write_manifest(tmp, [row(slug="p%d" % i) for i in range(10)])
        rows = bc.load_manifest(path, profile="fixture")
        stamps = sorted(r.published_at for r in rows)
        check("14a all rows carry one", all(stamps), repr(stamps[:2]))
        check("14b distinct", len(set(stamps)) == len(stamps), repr(stamps))
        recent = bc.count_recent(rows, days=7)
        check("14c at least 3 inside 7 days", recent >= 3, str(recent))
        oldest = bc.count_within(rows, days=57)
        check("14d none older than 8 weeks", oldest == len(rows), str(oldest))

        print("15. a manifest with no data rows is rejected")
        path = write_manifest(tmp, [])
        errs = errors_for(bc, path)
        check("15a rejected", any("0 data rows" in e for e in errs), repr(errs))

        print("16. the generated SQL is idempotent in shape and quotes safely")
        path = write_manifest(tmp, [row(name="O'Hara's \"Bench\"", description="a; b")])
        rows = bc.load_manifest(path, profile="fixture")
        sql = bc.render_sql(
            rows,
            storage_base_url="http://127.0.0.1:54321/storage/v1/object/public/product-images",
            uploader_uid=bc.LOCAL_UPLOADER_UID,
            assigned_by=bc.LOCAL_UPLOADER_UID,
            profile="fixture",
        )
        check("16a products upsert", "ON CONFLICT (id) DO UPDATE" in sql, "missing")
        check(
            "16b spectrum upsert",
            "ON CONFLICT (product_id) DO UPDATE" in sql,
            "missing",
        )
        check("16c apostrophe doubled", "O''Hara''s" in sql, "not escaped")
        check("16d layer catalog", "'catalog'" in sql, "missing")
        check("16e status published", "'published'" in sql, "missing")
        check(
            "16f no BEGIN/COMMIT (no other seed opens a transaction)",
            "\nBEGIN;" not in sql and "\nCOMMIT;" not in sql,
            "transaction wrapper present",
        )

        print("17. publish timestamps: staggered rows relative, given rows absolute")
        path = write_manifest(
            tmp,
            [row(slug="staggered"), row(slug="given", published_at="2026-07-04")],
        )
        rows = bc.load_manifest(path, profile="fixture")
        sql = bc.render_sql(
            rows,
            storage_base_url="http://x/y",
            uploader_uid=bc.LOCAL_UPLOADER_UID,
            assigned_by=bc.LOCAL_UPLOADER_UID,
            profile="fixture",
        )
        check(
            "17a staggered row emits now() - interval",
            "now() - interval '" in sql,
            "missing",
        )
        check(
            "17b manifest-supplied date emits the literal",
            "'2026-07-04 00:00:00+00'::timestamptz" in sql,
            "missing",
        )

        print("18. the generated SQL is a deterministic function of the manifest")
        path = write_manifest(tmp, [row(slug="p%d" % i) for i in range(6)])
        rows_a = bc.load_manifest(path, profile="fixture")
        rows_b = bc.load_manifest(path, profile="fixture")
        args = dict(
            storage_base_url="http://x/y",
            uploader_uid=bc.LOCAL_UPLOADER_UID,
            assigned_by=bc.LOCAL_UPLOADER_UID,
            profile="fixture",
        )
        check(
            "18a two renders are byte-identical",
            bc.render_sql(rows_a, **args) == bc.render_sql(rows_b, **args),
            "renders differ",
        )
        check(
            "18b no wall-clock stamp in the header",
            "generated :" not in bc.render_sql(rows_a, **args),
            "header carries a timestamp",
        )

        print("19. a fully-dated, entirely-old manifest is rejected (RL03-02)")
        path = write_manifest(
            tmp,
            [row(slug="old%d" % i, published_at="2026-01-05") for i in range(6)],
        )
        try:
            bc.load_manifest(path, profile="fixture")
            check("19a all-old manifest is rejected", False, "it was accepted")
        except bc.ManifestError as exc:
            check(
                "19a all-old manifest is rejected",
                any("inside 7 days" in e for e in exc.errors),
                "; ".join(exc.errors),
            )
        path = write_manifest(
            tmp,
            [row(slug="mix%d" % i, published_at="2026-01-05") for i in range(3)]
            + [row(slug="mix%d" % i) for i in range(3, 6)],
        )
        rows_mix = bc.load_manifest(path, profile="fixture")
        check(
            "19b three blank-dated rows satisfy the floor",
            bc.count_recent(rows_mix) >= bc.MIN_RECENT,
            "recent=%d" % bc.count_recent(rows_mix),
        )

        print("20. a 30-row manifest reaches the charter's 8 recent rows (RL03-14)")
        path = write_manifest(
            tmp,
            [
                row(slug="s%d" % i, category=CATEGORIES[i % 6],
                    maker_name="Maker %d" % (i % 4))
                for i in range(30)
            ],
        )
        rows30 = bc.load_manifest(path, profile="release")
        check(
            "20a >= 8 published inside 7 days",
            bc.count_recent(rows30) >= 8,
            "recent=%d" % bc.count_recent(rows30),
        )
        check(
            "20b the 6-row fixture stagger is unchanged",
            bc._stagger(6)[:3] == [0, 2881, 5762],
            "%s" % bc._stagger(6)[:3],
        )

        print("21. one maker, two contradictory origins, is rejected (RL03-04)")
        path = write_manifest(
            tmp,
            [
                row(slug="a", maker_name="Split Workshop", maker_made_in="Bath, Maine"),
                row(slug="b", maker_name="Split Workshop",
                    maker_made_in="Aarhus, Denmark"),
            ],
        )
        try:
            bc.load_manifest(path, profile="fixture")
            check("21a contradictory made_in is rejected", False, "it was accepted")
        except bc.ManifestError as exc:
            check(
                "21a contradictory made_in is rejected",
                any("made_in" in e for e in exc.errors),
                "; ".join(exc.errors),
            )
        path = write_manifest(
            tmp,
            [
                row(slug="a", maker_name="Quiet Workshop", maker_made_in="Bath, Maine"),
                row(slug="b", maker_name="Quiet Workshop", maker_made_in=""),
            ],
        )
        rows_blank = bc.load_manifest(path, profile="fixture")
        check(
            "21b a blank cell is an absence, not a contradiction",
            len(rows_blank) == 2,
            "rejected",
        )

        print("22. the vendor block preserves what the row already knows (RL03-04)")
        sql = bc.render_sql(rows_blank, **args)
        check(
            "22a made_in is COALESCEd rather than discarded",
            "made_in = COALESCE(public.vendors.made_in, 'Bath, Maine')" in sql,
            "missing",
        )
        check(
            "22b a flipped is_patina_catalog is announced",
            "RAISE NOTICE" in sql and "is_patina_catalog" in sql,
            "missing",
        )

        print("23. photo_verified_at records the seeding pass, not a claim (RL03-09)")
        path = write_manifest(tmp, [row(slug="pv", photo_verified="yes")])
        rows_pv = bc.load_manifest(path, profile="fixture")
        sql = bc.render_sql(rows_pv, **args)
        check(
            "23a photo_verified_at is now(), never the publish date",
            "  now(), NULL,\n" in sql or ",\n  now()," in sql,
            "missing now()",
        )

        print("24. a slug already on the target stack stops the apply (RL03-10)")
        check(
            "24a the guard names the slug and the colliding id",
            "already exists on a different row" in sql and "p.slug = " in sql,
            "missing",
        )

    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if FAILURES:
        print("\n%d FAILED: %s" % (len(FAILURES), ", ".join(FAILURES)))
        return 1
    print("\nall catalogue self-tests passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
