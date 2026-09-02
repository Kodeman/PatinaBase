#!/usr/bin/env python3
"""
Compose Chrome Web Store listing screenshots for Patina Capture.
Outputs:
  docs/design/capture-launch/screenshots/store/frame-1.png .. frame-4.png (1280x800, RGB)
  docs/design/capture-launch/screenshots/store/promo-tile-440x280.png (440x280, RGB)
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

REPO = "/Users/kody/Code/patina-merged"
SRC_DIR = os.path.join(REPO, "docs/design/capture-launch/screenshots")
OUT_DIR = os.path.join(SRC_DIR, "store")
FONT_DIR = "/private/tmp/claude-501/-Users-kody-Code-patina-merged/b3f58c7b-25f6-470b-93db-bf7a51a6cd0e/scratchpad/fonts"

os.makedirs(OUT_DIR, exist_ok=True)

BG = (236, 232, 222)          # #ECE8DE cream
BORDER = (201, 195, 182)      # #C9C3B6
TEXT = (31, 29, 26)           # #1F1D1A
LABEL = (107, 103, 96)        # #6B6760

FRAUNCES_TTF = os.path.join(FONT_DIR, "fraunces.ttf")
PLEXMONO_TTF = os.path.join(FONT_DIR, "plexmono.ttf")


def find_src(substr):
    for f in os.listdir(SRC_DIR):
        if substr in f:
            return os.path.join(SRC_DIR, f)
    raise FileNotFoundError(substr)


def fraunces(size, weight=520):
    f = ImageFont.truetype(FRAUNCES_TTF, size)
    try:
        f.set_variation_by_axes([min(size * 1.6, 144), weight])
    except Exception:
        pass
    return f


def fraunces_fallback_check():
    # Confirms variable font loaded; fallback to Georgia if anything fails upstream.
    try:
        fraunces(10)
        return True
    except Exception:
        return False


USE_FRAUNCES = fraunces_fallback_check()
GEORGIA = "/System/Library/Fonts/Supplemental/Georgia.ttf"
MENLO = "/System/Library/Fonts/Menlo.ttc"


def caption_font(size):
    if USE_FRAUNCES:
        return fraunces(size, weight=520)
    return ImageFont.truetype(GEORGIA, size)


def label_font(size):
    try:
        return ImageFont.truetype(PLEXMONO_TTF, size)
    except Exception:
        return ImageFont.truetype(MENLO, size)


def wrap_text(draw, text, font, max_width):
    words = text.split()
    lines = []
    cur = ""
    for w in words:
        trial = (cur + " " + w).strip()
        bbox = draw.textbbox((0, 0), trial, font=font)
        if bbox[2] - bbox[0] <= max_width or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return mask


def paste_card(canvas, panel_img, target_h, right_margin=80, center_y=400, radius=12):
    """Scale panel_img (RGB) to target_h tall preserving aspect, add border+shadow,
    paste onto canvas with right edge at canvas_w - right_margin, vertical center at center_y."""
    cw, ch = canvas.size
    w, h = panel_img.size
    scale = target_h / h
    new_w = max(1, round(w * scale))
    new_h = target_h
    resized = panel_img.resize((new_w, new_h), Image.LANCZOS)

    # Card with border drawn onto its own RGBA layer, rounded corners.
    card = Image.new("RGBA", (new_w, new_h), (0, 0, 0, 0))
    mask = rounded_mask((new_w, new_h), radius)
    card.paste(resized.convert("RGBA"), (0, 0), mask)
    # border
    bd = ImageDraw.Draw(card)
    bd.rounded_rectangle([0, 0, new_w - 1, new_h - 1], radius=radius, outline=BORDER + (255,), width=1)

    # Position
    x = cw - right_margin - new_w
    y = center_y - new_h // 2

    # Drop shadow: blurred rounded-rect alpha, offset down
    shadow_pad = 40
    shadow = Image.new("RGBA", (new_w + shadow_pad * 2, new_h + shadow_pad * 2), (0, 0, 0, 0))
    smask = rounded_mask((new_w, new_h), radius)
    shadow_layer = Image.new("L", (new_w + shadow_pad * 2, new_h + shadow_pad * 2), 0)
    shadow_layer.paste(smask, (shadow_pad, shadow_pad))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(18))
    shadow_rgba = Image.new("RGBA", shadow_layer.size, (0, 0, 0, 0))
    black = Image.new("RGBA", shadow_layer.size, (0, 0, 0, int(255 * 0.18)))
    shadow_rgba = Image.composite(black, shadow_rgba, shadow_layer)

    shadow_x = x - shadow_pad
    shadow_y = y - shadow_pad + 8  # offset 0/8
    canvas.paste(shadow_rgba, (shadow_x, shadow_y), shadow_rgba)
    canvas.paste(card, (x, y), card)
    return x, y, new_w, new_h


def make_frame(out_path, crop_src, crop_box, caption, panel_target_h, whole=False):
    W, H = 1280, 800
    canvas_rgba = Image.new("RGBA", (W, H), BG + (255,))

    src_img = Image.open(crop_src).convert("RGB")
    if whole:
        panel = src_img
    else:
        panel = src_img.crop(crop_box)

    px, py, pw, ph = paste_card(canvas_rgba, panel, panel_target_h)

    draw = ImageDraw.Draw(canvas_rgba)
    cap_font = caption_font(58)
    lbl_font = label_font(14)

    left_margin = 96
    max_w = 460

    lines = wrap_text(draw, caption, cap_font, max_w)
    line_heights = []
    total_h = 0
    for ln in lines:
        bbox = draw.textbbox((0, 0), ln, font=cap_font)
        lh = bbox[3] - bbox[1]
        line_heights.append(lh)
    line_gap = 8
    ascent, descent = cap_font.getmetrics()
    line_step = ascent + descent + line_gap
    total_h = line_step * len(lines) - line_gap

    label_text = "PATINA CAPTURE"
    # letterspacing
    def draw_letterspaced(draw_obj, xy, text, font, fill, spacing=3):
        x, y = xy
        for ch in text:
            draw_obj.text((x, y), ch, font=font, fill=fill)
            bbox = draw_obj.textbbox((0, 0), ch, font=font)
            x += (bbox[2] - bbox[0]) + spacing
        return x

    label_bbox = draw.textbbox((0, 0), label_text, font=lbl_font)
    label_h = label_bbox[3] - label_bbox[1]
    block_h = total_h + 28 + label_h
    start_y = 380 - block_h // 2

    y = start_y
    for ln in lines:
        draw.text((left_margin, y), ln, font=cap_font, fill=TEXT + (255,))
        y += line_step

    label_y = start_y + total_h + 28
    draw_letterspaced(draw, (left_margin, label_y), label_text, lbl_font, LABEL + (255,), spacing=3)

    canvas_rgb = Image.new("RGB", (W, H), BG)
    canvas_rgb.paste(canvas_rgba, (0, 0), canvas_rgba)
    canvas_rgb.save(out_path)
    print(f"wrote {out_path} {canvas_rgb.size}")


def make_promo_tile(out_path, panel_src, panel_crop_box):
    W, H = 440, 280
    canvas_rgba = Image.new("RGBA", (W, H), BG + (255,))

    panel = Image.open(panel_src).convert("RGB").crop(panel_crop_box)
    # target width ~140px floated on the right, leaving clear room for the caption column
    target_w = 140
    w, h = panel.size
    scale = target_w / w
    new_w = target_w
    new_h = round(h * scale)
    resized = panel.resize((new_w, new_h), Image.LANCZOS)

    radius = 10
    card = Image.new("RGBA", (new_w, new_h), (0, 0, 0, 0))
    mask = rounded_mask((new_w, new_h), radius)
    card.paste(resized.convert("RGBA"), (0, 0), mask)
    bd = ImageDraw.Draw(card)
    bd.rounded_rectangle([0, 0, new_w - 1, new_h - 1], radius=radius, outline=BORDER + (255,), width=1)

    right_margin = 20
    center_y = H // 2
    x = W - right_margin - new_w
    y = center_y - new_h // 2
    if y < 12:
        y = 12
    if y + new_h > H - 12:
        y = H - 12 - new_h

    shadow_pad = 24
    shadow_layer = Image.new("L", (new_w + shadow_pad * 2, new_h + shadow_pad * 2), 0)
    shadow_layer.paste(mask, (shadow_pad, shadow_pad))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(10))
    shadow_rgba = Image.new("RGBA", shadow_layer.size, (0, 0, 0, 0))
    black = Image.new("RGBA", shadow_layer.size, (0, 0, 0, int(255 * 0.18)))
    shadow_rgba = Image.composite(black, shadow_rgba, shadow_layer)
    canvas_rgba.paste(shadow_rgba, (x - shadow_pad, y - shadow_pad + 5), shadow_rgba)
    canvas_rgba.paste(card, (x, y), card)

    draw = ImageDraw.Draw(canvas_rgba)
    left_margin = 24
    title_font = caption_font(34)
    sub_font = ImageFont.truetype(GEORGIA, 15) if not USE_FRAUNCES else fraunces(15, weight=400)

    title = "Patina Capture"
    sub = "Save the piece in\nfront of you."

    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    title_h = title_bbox[3] - title_bbox[1]
    sub_bbox = draw.multiline_textbbox((0, 0), sub, font=sub_font, spacing=6)
    sub_h = sub_bbox[3] - sub_bbox[1]

    gap = 14
    block_h = title_h + gap + sub_h
    start_y = H // 2 - block_h // 2

    draw.text((left_margin, start_y), title, font=title_font, fill=TEXT + (255,))
    draw.multiline_text((left_margin, start_y + title_h + gap), sub, font=sub_font, fill=LABEL + (255,), spacing=6)

    canvas_rgb = Image.new("RGB", (W, H), BG)
    canvas_rgb.paste(canvas_rgba, (0, 0), canvas_rgba)
    canvas_rgb.save(out_path)
    print(f"wrote {out_path} {canvas_rgb.size}")


def main():
    f1 = find_src("12.00.44")
    f2 = find_src("12.03.39")
    f3 = find_src("12.04.49")
    f4 = find_src("12.05.17")

    make_frame(
        os.path.join(OUT_DIR, "frame-1.png"),
        f1, (0, 0, 726, 1466),
        "Reads the page you're on.",
        780,
    )
    make_frame(
        os.path.join(OUT_DIR, "frame-2.png"),
        f2, (0, 0, 710, 1338),
        "Manufacturer, not just retailer.",
        780,
    )
    make_frame(
        os.path.join(OUT_DIR, "frame-3.png"),
        f3, (0, 620, 700, 1460),
        "Saves straight into the room.",
        780,
    )
    make_frame(
        os.path.join(OUT_DIR, "frame-4.png"),
        f4, None,
        "Pick the image that's right.",
        700,
        whole=True,
    )

    make_promo_tile(
        os.path.join(OUT_DIR, "promo-tile-440x280.png"),
        f1, (0, 0, 726, 900),
    )


if __name__ == "__main__":
    main()
