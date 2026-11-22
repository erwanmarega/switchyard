#!/usr/bin/env python3
"""Duotone halftone: cream dots (#F4F1E8) on Prussian blue (#1B3A8C), 45deg amplitude-modulated screen.

python3 -I scripts/halftone.py <input> <output.webp> --width W --height H
    [--cell 6] [--flip] [--focus x,y] [--zoom z] [--gamma g] [--invert]
    [--fade-left f] [--sky s] [--quality q]
"""
import argparse, math
import numpy as np
from PIL import Image, ImageDraw, ImageOps, ImageFilter

CREAM = (0xF4, 0xF1, 0xE8)
BLUE = (0x1B, 0x3A, 0x8C)
SS = 3  # supersampling
LOCAL = 1.2
CONTRAST = 1.0


def crop_to(img, W, H, focus, zoom, contain=False):
    iw, ih = img.size
    if contain:  # fit whole width, pad top with white (becomes background after tone/invert)
        h = round(W * ih / iw)
        r = img.resize((W, h), Image.LANCZOS)
        if h >= H:
            top = min(max(round(focus[1] * h - H / 2), 0), h - H)
            return r.crop((0, top, W, top + H))
        canvas = Image.new("L", (W, H), 255)
        canvas.paste(r.crop((0, 0, W, 1)).resize((W, H - h + 1)), (0, 0)) if H > h else None
        canvas.paste(r, (0, H - h))
        return canvas
    s = max(W / iw, H / ih) * zoom
    cw, ch = W / s, H / s
    cx = min(max(focus[0] * iw, cw / 2), iw - cw / 2)
    cy = min(max(focus[1] * ih, ch / 2), ih - ch / 2)
    box = (cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)
    return img.resize((W, H), Image.LANCZOS, box=box)


def tone(img, gamma, invert, fade_left, sky):
    g = ImageOps.autocontrast(img, cutoff=1.0)
    a = np.asarray(g, dtype=np.float32) / 255.0
    a = a ** gamma
    # local contrast (large-radius unsharp) so dark machinery keeps detail
    blur = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(40)), dtype=np.float32) / 255
    a = np.clip(a + LOCAL * (a - blur), 0, 1)
    if CONTRAST != 1.0:
        a = np.clip((a - 0.5) * CONTRAST + 0.5, 0, 1)
    if invert:
        a = 1 - a
    if sky > 0:  # compress highlights so large white areas do not become solid cream
        a = a * (1 - sky)
    if fade_left > 0:  # push left part toward blue so overlaid text stays readable
        W = a.shape[1]
        x = np.linspace(0, 1, W, dtype=np.float32)
        k = np.clip(x / 0.35, 0, 1)
        k = k * k * (3 - 2 * k)
        a = a * ((1 - fade_left) + fade_left * k)[None, :]
    return a


def halftone(a, cell):
    H, W = a.shape
    # work at SS x resolution; screen rotated 45deg
    big = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((W * SS, H * SS), Image.BICUBIC), dtype=np.float32) / 255
    yy, xx = np.mgrid[0:H * SS, 0:W * SS].astype(np.float32)
    c = cell * SS
    ang = math.radians(45)
    u = (xx * math.cos(ang) + yy * math.sin(ang)) / c
    v = (-xx * math.sin(ang) + yy * math.cos(ang)) / c
    du = u - np.floor(u) - 0.5
    dv = v - np.floor(v) - 0.5
    d = np.sqrt(du * du + dv * dv)  # distance to cell centre, in cell units
    # tone sampled per cell centre would be classic AM; per-pixel sampling gives finer detail at this size,
    # so sample a lightly blurred tone at the cell centre for stable dot shape.
    cu = np.floor(u) + 0.5
    cv = np.floor(v) + 0.5
    cx = (cu * math.cos(ang) - cv * math.sin(ang)) * c
    cy = (cu * math.sin(ang) + cv * math.cos(ang)) * c
    ix = np.clip(cx.astype(np.int32), 0, W * SS - 1)
    iy = np.clip(cy.astype(np.int32), 0, H * SS - 1)
    t = big[iy, ix]
    # dot radius so that area coverage ~= tone (circle area pi r^2 = t, cell area 1); allow overlap merge to 0.75
    r = np.sqrt(t / math.pi) * 1.0
    r = np.where(t > 0.80, 0.5 + (t - 0.80) / 0.20 * 0.2, r)  # merge dots in highlights
    r = np.where(t < 0.04, 0, r)
    mask = (d < r).astype(np.uint8) * 255
    m = Image.fromarray(mask).resize((W, H), Image.LANCZOS)
    out = Image.composite(Image.new("RGB", (W, H), CREAM), Image.new("RGB", (W, H), BLUE), m)
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("input"); p.add_argument("output")
    p.add_argument("--width", type=int, required=True); p.add_argument("--height", type=int, required=True)
    p.add_argument("--cell", type=float, default=6)
    p.add_argument("--flip", action="store_true")
    p.add_argument("--invert", action="store_true")
    p.add_argument("--focus", default="0.5,0.5")
    p.add_argument("--zoom", type=float, default=1.0)
    p.add_argument("--gamma", type=float, default=1.0)
    p.add_argument("--fade-left", type=float, default=0.0)
    p.add_argument("--sky", type=float, default=0.0)
    p.add_argument("--place-right", type=float, default=1.0, help="image occupies this fraction of width on the right; rest is blue")
    p.add_argument("--contain", action="store_true")
    p.add_argument("--local", type=float, default=1.2)
    p.add_argument("--contrast", type=float, default=1.0)
    p.add_argument("--quality", type=int, default=80)
    a = p.parse_args()
    Image.MAX_IMAGE_PIXELS = 200_000_000
    img = Image.open(a.input)
    img.draft("L", (a.width * 2, a.height * 2))
    img = ImageOps.exif_transpose(img).convert("L")
    if a.flip:
        img = ImageOps.mirror(img)
    fx, fy = (float(s) for s in a.focus.split(","))
    bw = int(a.width * a.place_right)
    img = crop_to(img, bw, a.height, (fx, fy), a.zoom, a.contain)
    global LOCAL, CONTRAST
    CONTRAST = a.contrast
    LOCAL = a.local
    t = tone(img, a.gamma, a.invert, a.fade_left, a.sky)
    if bw < a.width:
        full = np.zeros((a.height, a.width), dtype=np.float32)
        full[:, a.width - bw:] = t
        t = full
    out = halftone(t, a.cell)
    out.save(a.output, "WEBP", quality=a.quality, method=6)


if __name__ == "__main__":
    main()
