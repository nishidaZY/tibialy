#!/usr/bin/env python3
"""Builds the Stash Analyzer's sprite atlas from the Tibia client's own files, so every slot is
compared with exactly what the game draws (TibiaWiki's GIFs can differ in look, size and position).

Reads <assets>/catalog-content.json, the appearances-*.dat (protobuf) and the sprites-*.bmp.lzma
sheets of an installed client (macOS: ~/Library/Application Support/CipSoft GmbH/Tibia/packages/
Tibia.app/Contents/Resources/assets) and writes into <out>:
  atlas.png   32x32 cells, COLS per row, transparent background
  atlas.json  {"cell": 32, "cols": COLS, "ids": [client item id per cell], "pat": [stack look per
              cell, -1 = any amount], "items": {id: {"n": name, "npc": best NPC buy price,
              "stack": bool, "m": market item, "also": [names of items that look the same]}}}

Candidates are the items a stash can hold: takeable, named, not corpses, and sold on the Market or
bought by an NPC. Stackable items get one cell per stack look (1, 2, 3, 4, 5-9, 10-24, 25-49, 50+:
the amount in the slot picks the look); others one per pattern (wall decorations hang in several
ways) and per distinct animation phase. Items that look exactly the same and are worth the same
are kept once ("also" lists the others); same look, different value: all kept, the stash order
tells them apart.
Usage: python3 script/stash/build_client_atlas.py <assets dir> <out dir>   (needs Pillow)"""
import bisect, glob, io, json, lzma, os, struct, sys
from PIL import Image, ImageChops, ImageStat

assets, out = sys.argv[1], sys.argv[2]
COLS, MAX_PHASES, SAME = 128, 6, 4


# ── client files ─────────────────────────────────────────────────────────────
def decompress(path):
    """CipSoft's .bmp.lzma: zero padding, a 5-byte constant, the compressed size (7-bit varint),
    LZMA properties, 8 bytes of size, then a raw LZMA1 stream holding a BMP."""
    b = open(path, 'rb').read()
    i = 0
    while b[i] == 0:
        i += 1
    i += 5
    while b[i] & 0x80:
        i += 1
    i += 1
    props = b[i:i + 5]
    i += 5 + 8
    lc, lp, pb = props[0] % 9, (props[0] % 45) // 9, props[0] // 45
    dec = lzma.LZMADecompressor(format=lzma.FORMAT_RAW, filters=[{'id': lzma.FILTER_LZMA1, 'lc': lc, 'lp': lp, 'pb': pb,
                                                                   'dict_size': struct.unpack('<I', props[1:5])[0]}])
    return dec.decompress(b[i:])


def varint(b, i):
    r = s = 0
    while True:
        c = b[i]; i += 1
        r |= (c & 0x7f) << s; s += 7
        if not c & 0x80:
            return r, i


def fields(b):
    """protobuf wire format: (field, value) pairs; length-delimited values stay bytes"""
    i = 0
    while i < len(b):
        key, i = varint(b, i)
        f, wt = key >> 3, key & 7
        if wt == 0:
            v, i = varint(b, i)
        elif wt == 2:
            n, i = varint(b, i); v = b[i:i + n]; i += n
        elif wt == 5:
            v = b[i:i + 4]; i += 4
        elif wt == 1:
            v = b[i:i + 8]; i += 8
        else:
            raise ValueError(f'wire type {wt}')
        yield f, v


def msg(b):
    d = {}
    for f, v in fields(b):
        d.setdefault(f, []).append(v)
    return d


catalog = json.load(open(os.path.join(assets, 'catalog-content.json')))
sheets_meta = sorted([x for x in catalog if x['type'] == 'sprite'], key=lambda x: x['firstspriteid'])
firsts = [x['firstspriteid'] for x in sheets_meta]
appearances = next(x['file'] for x in catalog if x['type'] == 'appearances')
DIM = {0: (32, 32), 1: (32, 64), 2: (64, 32), 3: (64, 64)}
sheets = {}


def sprite(sid):
    c = sheets_meta[bisect.bisect_right(firsts, sid) - 1]
    if c['file'] not in sheets:
        sheets[c['file']] = Image.open(io.BytesIO(decompress(os.path.join(assets, c['file'])))).convert('RGBA')
    w, h = DIM[c['spritetype']]
    i, per_row = sid - c['firstspriteid'], 384 // w
    x, y = (i % per_row) * w, (i // per_row) * h
    return sheets[c['file']].crop((x, y, x + w, y + h))


def to32(im):
    """A slot shows a 32x32 sprite as it is. A bigger one (wall trophies, statues) is shown by its
    visible part, centred in the slot and shrunk if it does not fit. The centring is off by up to a
    pixel between items (rounding), so a big sprite gets its centred look plus the 1 px shifts."""
    if im.size == (32, 32):
        return [im]
    content = im.crop(im.getbbox() or (0, 0, 1, 1))
    if max(content.size) > 32:
        f = 32 / max(content.size)
        content = content.resize((max(1, round(content.width * f)), max(1, round(content.height * f))), Image.BOX)
    x, y = (32 - content.width) // 2, (32 - content.height) // 2
    out = []
    for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
        if x + dx + content.width > 32 or y + dy + content.height > 32:
            continue
        sq = Image.new('RGBA', (32, 32))
        sq.paste(content, (x + dx, y + dy))
        out.append(sq)
    return out


def differ(a, b):
    return sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 4 > SAME


# ── items ────────────────────────────────────────────────────────────────────
# Appearance: 1 id, 2 frame group (3 sprite info: 1-3 pattern w/h/depth, 4 layers, 5 sprite ids),
# 3 flags (6 cumulative, 18 take, 36 market, 40 NPC sale data: 4 = what the NPC pays, 42 corpse), 4 name
cands = []
for f, o in fields(open(os.path.join(assets, appearances), 'rb').read()):
    if f != 1:
        continue
    m = msg(o)
    flags = msg(m[3][0]) if 3 in m else {}
    name = m.get(4, [b''])[0]
    name = name.decode('latin-1') if isinstance(name, (bytes, bytearray)) else ''
    if not name or 18 not in flags or 42 in flags or 2 not in m:
        continue
    buys = [msg(v).get(4, [0])[0] for v in flags.get(40, [])]
    npc = max(buys, default=0)
    if 36 not in flags and not npc:
        continue
    si = msg(msg(m[2][0])[3][0])
    spr = si.get(5, [])
    if not spr:
        continue
    pw, ph, pd, L = (si.get(n, [1])[0] for n in (1, 2, 3, 4))
    cands.append({'id': m[1][0], 'n': name, 'npc': npc, 'm': 36 in flags, 'cum': 6 in flags,
                  'pw': pw, 'ph': ph, 'pd': pd, 'L': L, 'spr': spr})

groups = {}
for it in sorted(cands, key=lambda x: x['id']):
    pw, ph, pd, L = it['pw'], it['ph'], it['pd'], it['L']
    phases = max(1, len(it['spr']) // (pw * ph * pd * L))
    stack = it['cum'] and pw * ph >= 8
    # the slot shows pattern 0 (a stackable item: the pattern of its amount)
    pats = [(x, y) for y in range(ph) for x in range(pw)][:8] if stack else [(0, 0)]
    looks = []
    for p, (x, y) in enumerate(pats):
        kept = []
        for a in range(min(phases, 24)):
            for im in to32(sprite(it['spr'][(((a * pd) * ph + y) * pw + x) * L])):
                if all(differ(im, k) for _, k in looks + [(None, k) for k in kept]):
                    kept.append(im)
            if len(kept) >= MAX_PHASES:
                break
        looks += [(p if stack else -1, im) for im in kept]
    # a pattern that shows (almost) nothing in the slot (a wall decoration's other sides) matches any small item
    full = [l for l in looks if sum(1 for a in l[1].getchannel('A').getdata() if a > 128) >= 16]
    looks = full or looks[:1]
    # same looks and same value: one entry for all of them
    groups.setdefault((tuple(im.tobytes() for _, im in looks), it['npc'], stack), []).append((it, stack, looks))

cells, items = [], {}
for group in groups.values():
    # named after the plainest market item of the group (small sapphire, not small enchanted sapphire)
    group.sort(key=lambda g: (not g[0]['m'], len(g[0]['n'].split()), -g[0]['id']))
    it, stack, looks = group[0]
    items[it['id']] = {'n': it['n'], 'npc': it['npc'], 'stack': stack, 'm': it['m'], 'also': sorted({g[0]['n'] for g in group[1:]} - {it['n']})}
    cells += [(it['id'], p, im) for p, im in looks]

rows = (len(cells) + COLS - 1) // COLS
atlas = Image.new('RGBA', (COLS * 32, rows * 32))
for i, (_, _, im) in enumerate(cells):
    atlas.paste(im, ((i % COLS) * 32, (i // COLS) * 32))
os.makedirs(out, exist_ok=True)
atlas.save(os.path.join(out, 'atlas.png'), optimize=True)
for v in items.values():
    if not v['also']:
        del v['also']
json.dump({'cell': 32, 'cols': COLS, 'ids': [c[0] for c in cells], 'pat': [c[1] for c in cells], 'items': items},
          open(os.path.join(out, 'atlas.json'), 'w'), separators=(',', ':'))
# one 32x32 icon per item for the item lists (public/icons/items/<id>.png; the site no longer hotlinks TibiaWiki)
icons = os.path.join(out, '..', 'icons', 'items')
os.makedirs(icons, exist_ok=True)
seen = set()
for iid, _, im in cells:
    if iid not in seen:
        seen.add(iid)
        im.save(os.path.join(icons, f'{iid}.png'), optimize=True)
for it in cands:   # look-alikes ("also") share the icon of the one kept
    if it['id'] not in seen and it['spr']:
        sprite_im = to32(sprite(it['spr'][0]))[0]
        sprite_im.save(os.path.join(icons, f"{it['id']}.png"), optimize=True)
# coins (not traded, so not candidates): their 100-coin look, for the Loot Analyzer
for f, o in fields(open(os.path.join(assets, appearances), 'rb').read()):
    if f != 1:
        continue
    m = msg(o)
    if m[1][0] in (3031, 3035, 3043):
        si = msg(msg(m[2][0])[3][0])
        spr = si.get(5, [])
        to32(sprite(spr[min(7, len(spr) - 1)]))[0].save(os.path.join(icons, f"{m[1][0]}.png"), optimize=True)
print(f'{len(items)} items, {len(cells)} cells -> {out}/atlas.png {atlas.size}; icons in public/icons/items')

