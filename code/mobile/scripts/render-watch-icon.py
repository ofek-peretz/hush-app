"""
The watch's app icon, drawn from the brand master.

  python scripts/render-watch-icon.py targets/watch/icon.png            # writes the icon
  python scripts/render-watch-icon.py out.png --scale 0.70               # the 2026-09-16 cut, to compare

WHY THE WATCH HAS A CUT OF ITS OWN (2026-10-10). The phone's icon (`brand/logo/export/
ferrox-app-icon.svg`) sets the mark at 0.86 of the square: right for a rounded square, and under
the watch's CIRCULAR mask it leaves the horn tips at 85% of the radius. The first watch icon
answered that by drawing the mark at 0.70 — safe, and at the size of the Home Screen's grid the
smallest mark on the dial. 0.80 puts the tips at 79% of the radius: clear of the edge, and a
quarter larger by area than it was.

Everything else is the master's, number for number: the stage's radial gradient, the horns' path,
the moss dot, the 3.5 the mark is set down by. This file re-draws nothing; change the master and
change these constants with it.
"""
import argparse

import numpy as np
from PIL import Image, ImageDraw

SIZE = 1024
SS = 4  # supersampling

# ── brand/logo/export/ferrox-app-icon.svg ────────────────────────────────────────────────────
STOPS = [(0.0, (0x2B, 0x29, 0x22)), (0.55, (0x14, 0x13, 0x10)), (1.0, (0x0A, 0x09, 0x07))]
GRADIENT = dict(cx=50.0, cy=28.0, r=82.0)
CREAM = (0xF1, 0xEE, 0xE5)
MOSS = (0xA9, 0xC4, 0x9F)
SET_DOWN = 3.5
DOT = dict(cx=50.0, cy=64.0, r=10.0)
NOTCH_R = 14.0
# M62 60 C79 60 88 46 89.5 17 C82 34 74 44 61 44 L39 44 C26 44 18 34 10.5 17 C12 46 21 60 38 60
# L36.584 60 A14 14 0 0 1 63.416 60 Z
HORNS = [
    ('M', (62, 60)),
    ('C', (79, 60), (88, 46), (89.5, 17)),
    ('C', (82, 34), (74, 44), (61, 44)),
    ('L', (39, 44)),
    ('C', (26, 44), (18, 34), (10.5, 17)),
    ('C', (12, 46), (21, 60), (38, 60)),
    ('L', (36.584, 60)),
    ('A', (63.416, 60)),  # over the top of the circle r 14 around the dot's centre
]


def outline(steps=96):
    pts, cur = [], None
    for seg in HORNS:
        if seg[0] in ('M', 'L'):
            cur = seg[1]
            pts.append(cur)
        elif seg[0] == 'C':
            p0, (p1, p2, p3) = cur, seg[1:]
            for i in range(1, steps + 1):
                t = i / steps
                a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3
                pts.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
            cur = p3
        else:  # the notch
            cx, cy = DOT['cx'], DOT['cy']
            a0 = np.arctan2(cur[1] - cy, cur[0] - cx)
            a1 = np.arctan2(seg[1][1] - cy, seg[1][0] - cx)
            if a1 < a0:
                a1 += 2 * np.pi  # sweep 1: increasing angle on a y-down plane, i.e. over the top
            for i in range(1, steps + 1):
                a = a0 + (a1 - a0) * i / steps
                pts.append((cx + NOTCH_R * np.cos(a), cy + NOTCH_R * np.sin(a)))
            cur = seg[1]
    return pts


def stage(n):
    y, x = np.mgrid[0:n, 0:n].astype(np.float64)
    u, v = (x + 0.5) * 100 / n, (y + 0.5) * 100 / n
    t = np.clip(np.hypot(u - GRADIENT['cx'], v - GRADIENT['cy']) / GRADIENT['r'], 0, 1)
    out = np.zeros((n, n, 3))
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        m = (t >= t0) & (t <= t1)
        f = ((t - t0) / (t1 - t0))[m]
        for k in range(3):
            out[..., k][m] = c0[k] + (c1[k] - c0[k]) * f
    return Image.fromarray(np.round(out).astype(np.uint8), 'RGB')


def render(scale):
    n = SIZE * SS
    k = n / 100

    def place(p):
        return ((50 + (p[0] - 50) * scale) * k, (50 + (p[1] + SET_DOWN - 50) * scale) * k)

    # The stage is smooth, so it is drawn at size; only the mark's edges need the supersampling.
    icon = stage(SIZE)
    mark = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    draw = ImageDraw.Draw(mark)
    draw.polygon([place(p) for p in outline()], fill=CREAM + (255,))
    cx, cy = place((DOT['cx'], DOT['cy']))
    r = DOT['r'] * scale * k
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=MOSS + (255,))
    mark = mark.resize((SIZE, SIZE), Image.LANCZOS)
    icon.paste(mark, (0, 0), mark)
    return icon


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--scale', type=float, default=0.80)
    args = ap.parse_args()
    render(args.scale).save(args.out, optimize=True)
    tip = np.hypot(10.5 - 50, 17 + SET_DOWN - 50) * args.scale
    print(f'{args.out}: mark at {args.scale:.2f}, horn tips at {tip / 50:.0%} of the radius')
