#!/usr/bin/env python3
"""Builds public/stash/ui.json, the pieces of the slot the analyzer draws besides the item:
  edges   the five rarity edges (white, green, blue, purple, gold), 8x8 RGBA, from the client's
          graphics_resources.rcc (images/containerslot-coloredges.png)
  digits  the amount's characters: Verdana Bold 11 px with a 1 px black outline (that is what the
          client draws; the shapes match screenshots pixel for pixel). The grey levels inside each
          digit come from digits harvested off real screenshots (harvest.mjs), which also measured
          the spacing (ADV 8 px) and where the pen ends (RIGHT 34). The comma (4 px) and the squeeze
          of numbers wider than the slot (FIT 33 px) were measured on a "2,860".
Usage: build_ui.py <graphics_resources.rcc> <harvested glyphs.json> <out ui.json>   (needs Pillow and
the macOS Verdana Bold font)"""
import io, json, struct, sys, zlib
from PIL import Image, ImageDraw, ImageFilter, ImageFont

rcc_path, harvest_path, out_path = sys.argv[1:4]


def rcc_file(path, wanted):
    """one file out of a Qt binary resource (.rcc, format 1-3; zlib-compressed entries)"""
    b = open(path, 'rb').read()
    assert b[:4] == b'qres'
    ver, tree, data, names = struct.unpack('>IIII', b[4:20])
    node = 14 if ver == 1 else 22

    def name(off):
        n, = struct.unpack('>H', b[names + off:names + off + 2])
        return b[names + off + 6:names + off + 6 + 2 * n].decode('utf-16-be')

    def walk(i, path):
        o = tree + i * node
        noff, flags = struct.unpack('>IH', b[o:o + 6])
        nm = name(noff) if i else ''
        if flags & 2:
            cnt, first = struct.unpack('>II', b[o + 6:o + 14])
            for c in range(first, first + cnt):
                r = walk(c, path + '/' + nm if nm else path)
                if r:
                    return r
        elif (path + '/' + nm) == wanted:
            doff, = struct.unpack('>I', b[o + 10:o + 14])
            sz, = struct.unpack('>I', b[data + doff:data + doff + 4])
            raw = b[data + doff + 4:data + doff + 4 + sz]
            return zlib.decompress(raw[4:]) if flags & 1 else raw
    return walk(0, '')


edges = Image.open(io.BytesIO(rcc_file(rcc_path, '/images/containerslot-coloredges.png'))).convert('RGBA')
harv = json.load(open(harvest_path))
box = harv['box']
GW, GH = box['GW'], box['GH']
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Verdana Bold.ttf', 11)
OX, OY, FILL = 1, 0, 215          # where the font's glyph sits in the box, fitted to the harvest


def layers(ch):
    m = Image.new('L', (GW + 4, GH + 4), 0)
    ImageDraw.Draw(m).text((2 + OX, 2 + OY), ch, font=font, fill=255)
    m = m.point(lambda v: 255 if v >= 128 else 0)
    o = m.filter(ImageFilter.MaxFilter(3))
    return [(o.getpixel((x + 2, y + 2)) / 255, m.getpixel((x + 2, y + 2)) / 255) for y in range(GH) for x in range(GW)]


px = {}
for d in '0123456789,':
    L = layers(d)
    if d == ',':
        px[d] = [round(FILL * a) if o > 0.5 else -1 for o, a in L]
        continue
    A, B = harv['glyphs'][d]['A'], harv['glyphs'][d]['B']
    # inside the font's outline: the harvested grey (or the font's own where the harvest had none)
    px[d] = [(round(B[i]) if A[i] else round(FILL * L[i][1])) if L[i][0] > 0.5 else -1 for i in range(GW * GH)]
ui = {'digits': {'box': {**box, 'ADV': 8, 'COMMA': 4, 'FIT': 33}, 'px': px},
      'edges': [[list(edges.getpixel((e * 32 + x, y))) for y in range(8) for x in range(8)] for e in range(5)]}
json.dump(ui, open(out_path, 'w'), separators=(',', ':'))
print('wrote', out_path)
