#!/usr/bin/env python3
"""First Flight L0.3 — push the manifest's photographs into the product-images bucket.

One code path for local and production; the only difference is `--supabase-url`
and `--service-key`, and neither has a default that points at production.

The object name is derived from the manifest alone, exactly as
build-catalog.py derives it, so the SQL and the uploaded files agree without
either script reading the other's output:

    product-images/<uploader uid>/<product id>/<uuid5(product id + '/' + i)>.<ext>

The first folder segment is the uploader's own uid because the bucket's INSERT
policy (00542) requires `(storage.foldername(name))[1] = auth.uid()::text`.
A service key bypasses that policy, but the path convention is what the rest of
the system reads, so it is honoured either way.

Usage:
  upload-catalog-images.py --manifest FILE --supabase-url URL --service-key KEY
                           [--uploader-uid UUID] [--dry-run] [--overwrite]
                           [--allow-oversize]

Environment fallbacks: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
"""

import argparse
import importlib.util
import json
import mimetypes
import os
import struct
import sys
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))

BUCKET = "product-images"

# storage.buckets.allowed_mime_types for product-images.
ALLOWED_MIME = (
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/heic",
)

EXT_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".heic": "image/heic",
}


def load_catalog():
    path = os.path.join(HERE, "build-catalog.py")
    spec = importlib.util.spec_from_file_location("build_catalog", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


BC = load_catalog()


def long_edge(path):
    """Pixel long edge for JPEG and PNG. None when the format is not read here.

    Only the two formats a resize step actually produces are measured; a WebP,
    AVIF or HEIC file is passed through with no size claim rather than a
    guessed one.
    """
    ext = os.path.splitext(path)[1].lower()
    try:
        with open(path, "rb") as handle:
            if ext == ".png":
                head = handle.read(24)
                if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n":
                    return None
                width, height = struct.unpack(">II", head[16:24])
                return max(width, height)
            if ext in (".jpg", ".jpeg"):
                if handle.read(2) != b"\xff\xd8":
                    return None
                while True:
                    byte = handle.read(1)
                    while byte and byte != b"\xff":
                        byte = handle.read(1)
                    marker = handle.read(1)
                    while marker == b"\xff":
                        marker = handle.read(1)
                    if not marker:
                        return None
                    code = ord(marker)
                    if code in (0xD8, 0xD9) or 0xD0 <= code <= 0xD7:
                        continue
                    length_bytes = handle.read(2)
                    if len(length_bytes) < 2:
                        return None
                    length = struct.unpack(">H", length_bytes)[0]
                    if 0xC0 <= code <= 0xCF and code not in (0xC4, 0xC8, 0xCC):
                        payload = handle.read(7)
                        if len(payload) < 5:
                            return None
                        height, width = struct.unpack(">HH", payload[1:5])
                        return max(width, height)
                    handle.seek(length - 2, os.SEEK_CUR)
    except (OSError, struct.error):
        return None
    return None


def put_object(base_url, service_key, object_path, body, content_type, overwrite):
    url = "%s/storage/v1/object/%s/%s" % (
        base_url.rstrip("/"),
        BUCKET,
        urllib.parse.quote(object_path),
    )
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Authorization", "Bearer %s" % service_key)
    request.add_header("apikey", service_key)
    request.add_header("Content-Type", content_type)
    request.add_header("Cache-Control", "public, max-age=31536000")
    if overwrite:
        request.add_header("x-upsert", "true")
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--supabase-url", default=os.environ.get("SUPABASE_URL"))
    parser.add_argument(
        "--service-key", default=os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    )
    parser.add_argument("--uploader-uid", default=BC.LOCAL_UPLOADER_UID)
    parser.add_argument("--profile", choices=("fixture", "release"), default="release")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument(
        "--allow-oversize",
        action="store_true",
        help="upload a photograph whose long edge is over %d px" % BC.MAX_LONG_EDGE_PX,
    )
    args = parser.parse_args(argv)

    if not args.dry_run:
        if not args.supabase_url:
            sys.stderr.write(
                "error: --supabase-url is required (there is no default; naming the "
                "target is the point)\n"
            )
            return 2
        if not args.service_key:
            sys.stderr.write("error: --service-key is required\n")
            return 2

    try:
        rows = BC.load_manifest(args.manifest, profile=args.profile)
    except BC.ManifestError as exc:
        for message in exc.errors:
            sys.stderr.write("error: %s\n" % message)
        sys.stderr.write("%s: manifest is invalid — nothing uploaded\n" % args.manifest)
        return 1

    planned = []
    errors = []
    for row in rows:
        for index, path in enumerate(row.images):
            ext = os.path.splitext(path)[1].lower()
            content_type = EXT_MIME.get(ext) or mimetypes.guess_type(path)[0]
            if content_type not in ALLOWED_MIME:
                errors.append(
                    "%s: %s is %s, which the %s bucket rejects"
                    % (row.slug, os.path.basename(path), content_type, BUCKET)
                )
                continue
            edge = long_edge(path)
            if edge and edge > BC.MAX_LONG_EDGE_PX and not args.allow_oversize:
                errors.append(
                    "%s: %s is %d px on the long edge, over %d — run "
                    "`sips -Z %d %s` first, or pass --allow-oversize"
                    % (
                        row.slug,
                        os.path.basename(path),
                        edge,
                        BC.MAX_LONG_EDGE_PX,
                        BC.MAX_LONG_EDGE_PX,
                        path,
                    )
                )
                continue
            planned.append(
                (
                    row.slug,
                    path,
                    BC.image_storage_path(args.uploader_uid, row.product_id, index, ext),
                    content_type,
                )
            )

    for message in errors:
        sys.stderr.write("error: %s\n" % message)
    if errors:
        sys.stderr.write("%d image(s) rejected — nothing uploaded\n" % len(errors))
        return 1

    if args.dry_run:
        for slug, path, object_path, content_type in planned:
            print("PUT %s/%s  (%s, %s)" % (BUCKET, object_path, content_type, slug))
        print("%d image(s) planned; nothing uploaded (--dry-run)" % len(planned))
        return 0

    failures = 0
    for slug, path, object_path, content_type in planned:
        with open(path, "rb") as handle:
            body = handle.read()
        status, text = put_object(
            args.supabase_url, args.service_key, object_path, body, content_type,
            args.overwrite,
        )
        if 200 <= status < 300:
            print("ok   %s  %s" % (object_path, slug))
        elif status == 409 and not args.overwrite:
            print("skip %s  (already present; pass --overwrite to replace)" % object_path)
        else:
            failures += 1
            detail = text
            try:
                detail = json.loads(text).get("message", text)
            except ValueError:
                pass
            sys.stderr.write("FAIL %s  HTTP %d  %s\n" % (object_path, status, detail))

    public_base = "%s/storage/v1/object/public/%s" % (
        args.supabase_url.rstrip("/"),
        BUCKET,
    )
    print(
        "\n%d uploaded, %d failed. products.images must carry\n  %s/<path>"
        % (len(planned) - failures, failures, public_base)
    )
    print(
        "Emit the matching SQL with:\n"
        "  python3 scripts/first-flight/build-catalog.py --emit %s --out <file> "
        "--storage-base-url %s --uploader-uid %s"
        % (args.manifest, public_base, args.uploader_uid)
    )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
