#!/usr/bin/env python3
"""Downloads the item sprites listed in <work>/items.json (cached in <work>/sprites) and packs
them into <out>/atlas.png (32x32 cells, 64 per row, first animation frame, transparent
background) plus <out>/atlas.json ({"cell": 32, "cols": 64, "ids": [item ids in cell order]}).
Usage: python3 script/stash/build_atlas.py <work dir> <output dir>   (needs Pillow)"""
import json, os, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

work, out = sys.argv[1], sys.argv[2]
CELL, COLS = 32, 64
items = json.load(open(os.path.join(work, 'items.json')))
sprites = os.path.join(work, 'sprites')
os.makedirs(sprites, exist_ok=True)

def download(item):
    path = os.path.join(sprites, f"{item['id']}.gif")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return True
    try:
        req = urllib.request.Request(urllib.parse.quote(item['url'], safe=':/%'),
                                     headers={'User-Agent': 'TibiaLootFinder/1.0 (stash atlas)'})
        with urllib.request.urlopen(req, timeout=20) as r:
            open(path, 'wb').write(r.read())
        return True
    except Exception:
        return False

with ThreadPoolExecutor(6) as pool:      # gentle on TibiaWiki
    ok = list(pool.map(download, items))
print(f"sprites: {sum(ok)}/{len(items)} available")

ids, cells = [], []
for item in items:
    path = os.path.join(sprites, f"{item['id']}.gif")
    try:
        im = Image.open(path)
        im.seek(0)
        im = im.convert('RGBA')
    except Exception:
        continue
    if im.size != (CELL, CELL):          # a few sprites are 64x64: the client shows them scaled down
        im = im.resize((CELL, CELL), Image.BOX)
    ids.append(item['id'])
    cells.append(im)

rows = (len(cells) + COLS - 1) // COLS
atlas = Image.new('RGBA', (COLS * CELL, rows * CELL), (0, 0, 0, 0))
for i, im in enumerate(cells):
    atlas.paste(im, ((i % COLS) * CELL, (i // COLS) * CELL))
os.makedirs(out, exist_ok=True)
atlas.save(os.path.join(out, 'atlas.png'), optimize=True)
json.dump({'cell': CELL, 'cols': COLS, 'ids': ids}, open(os.path.join(out, 'atlas.json'), 'w'))
print(f"atlas: {len(ids)} sprites, {atlas.size[0]}x{atlas.size[1]}")
