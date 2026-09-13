#!/usr/bin/env python3
"""Draws a loot-bag app icon in the app's Dracula palette and exports
a full macOS .iconset directory (iconutil turns that into .icns)."""

import math
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# ── rounded-square背景, macOS Big Sur style ──────────────────────────
bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
bgd = ImageDraw.Draw(bg)
radius = int(SIZE * 0.225)


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


# vertical gradient from header dark to sand
top = (25, 26, 33)      # #191A21
bottom = (40, 42, 54)   # #282A36
grad = Image.new("RGBA", (1, SIZE), (0, 0, 0, 0))
for y in range(SIZE):
    t = y / SIZE
    r = int(top[0] + (bottom[0] - top[0]) * t)
    g = int(top[1] + (bottom[1] - top[1]) * t)
    b = int(top[2] + (bottom[2] - top[2]) * t)
    grad.putpixel((0, y), (r, g, b, 255))
grad = grad.resize((SIZE, SIZE))

mask = Image.new("L", (SIZE, SIZE), 0)
mdraw = ImageDraw.Draw(mask)
mdraw.rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=radius, fill=255)
bg = Image.composite(grad, bg, mask)

# subtle purple glow bottom-right, matches --accent
glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
gdraw = ImageDraw.Draw(glow)
gdraw.ellipse(
    (SIZE * 0.45, SIZE * 0.35, SIZE * 1.15, SIZE * 1.05),
    fill=(189, 147, 249, 60),
)
glow = glow.filter(ImageFilter.GaussianBlur(SIZE * 0.06))
bg = Image.alpha_composite(bg, Image.composite(glow, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), mask))

img = bg

draw = ImageDraw.Draw(img)

cx = SIZE / 2

# ── sack shape ───────────────────────────────────────────────────────
sack_top = SIZE * 0.34
sack_bottom = SIZE * 0.82
sack_half_w = SIZE * 0.235

sack_fill = (194, 141, 87)     # warm leather brown
sack_shadow = (147, 101, 58)   # darker brown for shading
sack_outline = (94, 61, 33)

# Body: a soft rounded sack via a polygon smoothed with rounded corners
points = [
    (cx - sack_half_w * 0.55, sack_top),
    (cx + sack_half_w * 0.55, sack_top),
    (cx + sack_half_w, sack_top + (sack_bottom - sack_top) * 0.32),
    (cx + sack_half_w * 0.9, sack_bottom - (sack_bottom - sack_top) * 0.06),
    (cx, sack_bottom),
    (cx - sack_half_w * 0.9, sack_bottom - (sack_bottom - sack_top) * 0.06),
    (cx - sack_half_w, sack_top + (sack_bottom - sack_top) * 0.32),
]

sack_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
sdraw = ImageDraw.Draw(sack_layer)
sdraw.polygon(points, fill=sack_fill)

# smooth it with a blur + re-threshold so corners aren't jagged
smooth_mask = Image.new("L", (SIZE, SIZE), 0)
smdraw = ImageDraw.Draw(smooth_mask)
smdraw.polygon(points, fill=255)
smooth_mask = smooth_mask.filter(ImageFilter.GaussianBlur(SIZE * 0.018))
smooth_mask = smooth_mask.point(lambda p: 255 if p > 90 else 0)

sack_solid = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
sack_solid.paste(Image.new("RGBA", (SIZE, SIZE), sack_fill + (255,)), (0, 0), smooth_mask)

# left-side shading
shade_mask = Image.new("L", (SIZE, SIZE), 0)
shdraw = ImageDraw.Draw(shade_mask)
shdraw.polygon(
    [
        (cx - sack_half_w, sack_top + (sack_bottom - sack_top) * 0.32),
        (cx - sack_half_w * 0.55, sack_top),
        (cx - sack_half_w * 0.1, sack_top),
        (cx - sack_half_w * 0.2, sack_bottom),
        (cx - sack_half_w * 0.9, sack_bottom - (sack_bottom - sack_top) * 0.06),
    ],
    fill=255,
)
shade_mask = Image.composite(shade_mask, Image.new("L", (SIZE, SIZE), 0), smooth_mask)
shade_mask = shade_mask.filter(ImageFilter.GaussianBlur(SIZE * 0.012))
shade_layer = Image.new("RGBA", (SIZE, SIZE), sack_shadow + (255,))
sack_solid = Image.composite(shade_layer, sack_solid, shade_mask)

# outline
outline_mask = Image.new("L", (SIZE, SIZE), 0)
oldraw = ImageDraw.Draw(outline_mask)
oldraw.polygon(points, outline=255, width=int(SIZE * 0.012))
outline_mask = outline_mask.filter(ImageFilter.GaussianBlur(SIZE * 0.004))
outline_layer = Image.new("RGBA", (SIZE, SIZE), sack_outline + (255,))
sack_solid = Image.composite(outline_layer, sack_solid, outline_mask)

img = Image.alpha_composite(img, sack_solid)
draw = ImageDraw.Draw(img)

# ── neck / tie at the top ────────────────────────────────────────────
neck_w = sack_half_w * 0.62
neck_top = sack_top - SIZE * 0.05
draw.rounded_rectangle(
    (cx - neck_w * 0.5, neck_top, cx + neck_w * 0.5, sack_top + SIZE * 0.02),
    radius=int(SIZE * 0.03),
    fill=sack_shadow,
    outline=sack_outline,
    width=int(SIZE * 0.01),
)

# rope tie (a couple of wrapped bands) + a small loop knot
rope_color = (168, 122, 74)
rope_dark = (120, 84, 48)
for i, ty in enumerate([neck_top + SIZE * 0.012, neck_top + SIZE * 0.03]):
    draw.rounded_rectangle(
        (cx - neck_w * 0.62, ty, cx + neck_w * 0.62, ty + SIZE * 0.018),
        radius=int(SIZE * 0.01),
        fill=rope_color,
        outline=rope_dark,
        width=int(SIZE * 0.004),
    )

knot_r = SIZE * 0.028
draw.ellipse(
    (cx - knot_r, neck_top - knot_r * 0.4, cx + knot_r, neck_top + knot_r * 1.4),
    fill=rope_color,
    outline=rope_dark,
    width=int(SIZE * 0.004),
)

# little frayed rope ends
draw.line(
    (cx - knot_r * 0.3, neck_top + knot_r, cx - knot_r * 0.9, neck_top + knot_r * 2.6),
    fill=rope_dark, width=int(SIZE * 0.01)
)
draw.line(
    (cx + knot_r * 0.3, neck_top + knot_r, cx + knot_r * 0.9, neck_top + knot_r * 2.6),
    fill=rope_dark, width=int(SIZE * 0.01)
)

# ── gold coins spilling in front ─────────────────────────────────────
gold = (255, 184, 108)      # --gold
gold_dark = (196, 132, 63)
gold_shine = (255, 224, 176)

coin_positions = [
    (cx - sack_half_w * 0.55, sack_bottom - SIZE * 0.05, SIZE * 0.085),
    (cx - sack_half_w * 0.05, sack_bottom + SIZE * 0.01, SIZE * 0.10),
    (cx + sack_half_w * 0.52, sack_bottom - SIZE * 0.03, SIZE * 0.088),
    (cx + sack_half_w * 0.08, sack_bottom - SIZE * 0.12, SIZE * 0.07),
]

for (px, py, r) in coin_positions:
    draw.ellipse((px - r, py - r * 0.62, px + r, py + r * 0.62 + r * 0.5),
                  fill=gold_dark)
    draw.ellipse((px - r, py - r * 0.9, px + r, py + r * 0.9),
                  fill=gold, outline=gold_dark, width=int(SIZE * 0.006))
    draw.ellipse((px - r * 0.45, py - r * 0.45, px + r * 0.45, py + r * 0.45),
                  outline=gold_shine, width=int(SIZE * 0.008))
    # small sparkle highlight
    draw.ellipse((px - r * 0.22, py - r * 0.55, px - r * 0.05, py - r * 0.38),
                 fill=gold_shine)

# ── purple accent sparkle (brand touch) ──────────────────────────────
spark_color = (189, 147, 249)


def sparkle(x, y, s):
    draw.polygon(
        [
            (x, y - s), (x + s * 0.22, y - s * 0.22),
            (x + s, y), (x + s * 0.22, y + s * 0.22),
            (x, y + s), (x - s * 0.22, y + s * 0.22),
            (x - s, y), (x - s * 0.22, y - s * 0.22),
        ],
        fill=spark_color,
    )


sparkle(cx + sack_half_w * 0.98, sack_top - SIZE * 0.01, SIZE * 0.028)
sparkle(cx - sack_half_w * 1.05, sack_top + SIZE * 0.12, SIZE * 0.018)

img = img.convert("RGBA")

# ── export iconset ────────────────────────────────────────────────────
sizes = [16, 32, 128, 256, 512]
iconset_dir = "~/Documents/tibialootfinder/native-app/AppIcon.iconset"
import os
os.makedirs(iconset_dir, exist_ok=True)

for s in sizes:
    im1x = img.resize((s, s), Image.LANCZOS)
    im1x.save(f"{iconset_dir}/icon_{s}x{s}.png")
    im2x = img.resize((s * 2, s * 2), Image.LANCZOS)
    im2x.save(f"{iconset_dir}/icon_{s}x{s}@2x.png")

print("iconset written to", iconset_dir)
