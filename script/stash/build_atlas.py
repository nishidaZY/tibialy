#!/usr/bin/env python3
"""Downloads the item sprites listed in <work>/items.json (cached in <work>/sprites) and packs
them into <out>/atlas.png (32x32 cells, 64 per row, transparent background) plus
<out>/atlas.json ({"cell": 32, "cols": 64, "ids": [item id of each cell]}).
The first cell of every item is its first frame. The wiki GIF of a stackable item cycles through
its stack looks (1 coal, 2 coals ... a heap): those frames, and the frames of animated items,
follow after all the first frames (up to MAX_FRAMES distinct ones per item), so a slot holding
297 coal matches the heap and not only the single lump.
Usage: python3 script/stash/build_atlas.py <work dir> <output dir>   (needs Pillow)"""
import json, os, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageChops, ImageStat

work, out = sys.argv[1], sys.argv[2]
CELL, COLS = 32, 64
MAX_FRAMES = 8           # stack looks: 1, 2, 3, 4, 5, 10, 25, 50+
SAME = 6                 # mean RGBA difference under which two frames count as the same
items = json.load(open(os.path.join(work, 'items.json')))
sprites = os.path.join(work, 'sprites')
os.makedirs(sprites, exist_ok=True)

def download(item):
    path = os.path.join(sprites, f"{item['id']}.gif")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return True
    try:
        req = urllib.request.Request(urllib.parse.quote(item['url'], safe=':/%'),
                                     headers={'User-Agent': 'TIBIALY/1.0 (stash atlas)'})
        with urllib.request.urlopen(req, timeout=20) as r:
            open(path, 'wb').write(r.read())
        return True
    except Exception:
        return False

with ThreadPoolExecutor(6) as pool:      # gentle on TibiaWiki
    ok = list(pool.map(download, items))
print(f"sprites: {sum(ok)}/{len(items)} available")

def frames(path):
    im = Image.open(path)
    kept, first_area = [], 0
    for f in range(getattr(im, 'n_frames', 1)):
        if len(kept) >= MAX_FRAMES:
            break
        im.seek(f)
        fr = im.convert('RGBA')
        if fr.size != (CELL, CELL):      # a few sprites are 64x64: the client shows them scaled down
            fr = fr.resize((CELL, CELL), Image.BOX)
        # a bigger stack covers more of the cell; a smaller frame is an animation fading out
        # (Dead Frog ends on an empty cell) and would match every small item
        area = sum(1 for a in fr.getchannel('A').getdata() if a > 128)
        if kept and area < 0.9 * first_area:
            continue
        if all(sum(ImageStat.Stat(ImageChops.difference(fr, k)).mean) / 4 > SAME for k in kept):
            kept.append(fr)
            if len(kept) == 1:
                first_area = area
    return kept

firsts, extras = [], []
for item in items:
    try:
        kept = frames(os.path.join(sprites, f"{item['id']}.gif"))
    except Exception:
        continue
    firsts.append((item['id'], kept[0]))
    extras += [(item['id'], fr) for fr in kept[1:]]
ids = [i for i, _ in firsts + extras]
cells = [fr for _, fr in firsts + extras]

rows = (len(cells) + COLS - 1) // COLS
atlas = Image.new('RGBA', (COLS * CELL, rows * CELL), (0, 0, 0, 0))
for i, im in enumerate(cells):
    atlas.paste(im, ((i % COLS) * CELL, (i // COLS) * CELL))
os.makedirs(out, exist_ok=True)
atlas.save(os.path.join(out, 'atlas.png'), optimize=True)
json.dump({'cell': CELL, 'cols': COLS, 'ids': ids}, open(os.path.join(out, 'atlas.json'), 'w'))
print(f"atlas: {len(firsts)} items, {len(ids)} sprites, {atlas.size[0]}x{atlas.size[1]}")
