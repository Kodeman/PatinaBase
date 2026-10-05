"""Build the full-chain e2e deck (SQ-364) from the SQ-356 tickets fixture.

full-chain.pptx = src/lib/deck-import/__fixtures__/tickets.pptx plus one slide,
"Reading Chair": a single picture, no text on the slide, and the product URL
only as a bare URL in the speaker notes. Real decks sometimes carry the link
in the notes rather than on the picture.

Run from the repository root (python-pptx 1.0.2 and Pillow 11):

    uv venv "$TMPDIR/deck-fixtures" --python python3
    uv pip install --python "$TMPDIR/deck-fixtures/bin/python" python-pptx==1.0.2 Pillow==11.3.0
    "$TMPDIR/deck-fixtures/bin/python" apps/designer-portal/e2e/deck-import/fixtures/generate.py

The zip is re-packed with a fixed timestamp so reruns are byte-stable.
"""

import io
import os
import zipfile

from PIL import Image, ImageDraw
from pptx import Presentation
from pptx.util import Emu

HERE = os.path.dirname(os.path.abspath(__file__))
TICKETS = os.path.join(HERE, "../../../src/lib/deck-import/__fixtures__/tickets.pptx")
FIXED_TIME = (1980, 1, 1, 0, 0, 0)
NOTES_URL = "https://www.burkedecor.com/products/reading-chair"


def picture():
    im = Image.new("RGB", (160, 120), (122, 98, 74))
    d = ImageDraw.Draw(im)
    d.rectangle([20, 30, 140, 100], fill=(201, 176, 140))
    d.rectangle([30, 10, 130, 40], fill=(90, 70, 52))
    out = io.BytesIO()
    im.save(out, "PNG")
    return out.getvalue()


def main():
    prs = Presentation(TICKETS)
    slide = prs.slides.add_slide(prs.slide_layouts[5])
    slide.shapes.title.text = "Reading Chair"
    slide.shapes.add_picture(io.BytesIO(picture()), Emu(4000000), Emu(1600000), Emu(4000000), Emu(3000000))
    slide.notes_slide.notes_text_frame.text = f"Client loved this one. {NOTES_URL}"

    raw = io.BytesIO()
    prs.save(raw)
    raw.seek(0)
    dst = os.path.join(HERE, "full-chain.pptx")
    with zipfile.ZipFile(raw) as src, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as out:
        for info in src.infolist():
            entry = zipfile.ZipInfo(info.filename, FIXED_TIME)
            entry.compress_type = zipfile.ZIP_DEFLATED
            out.writestr(entry, src.read(info.filename))
    print(dst)


if __name__ == "__main__":
    main()
