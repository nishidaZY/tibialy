#!/usr/bin/env python3
"""Scores a bench.mjs result against a truth file ({"r0c0": {"names": [...], "count": n}, ...}):
items right (by name; an item listed as looking the same counts), amounts right, and how many of the
wrong ones were marked sure (the bad case) and right ones marked unsure (the user is asked to check).
Usage: score.py <result.json> <truth.json> [atlas.json] [-v]"""
import json, sys
args = [a for a in sys.argv[1:] if a != '-v']
R, T = json.load(open(args[0])), json.load(open(args[1]))
import os
root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../..'))
items = json.load(open(args[2] if len(args) > 2 else root + '/public/stash/atlas.json'))['items']
names = lambda i: [items[str(i)]['n'].lower()] + [n.lower() for n in items[str(i)].get('also', [])]
got = {f"r{s['r']}c{s['c']}": s for s in R['slots']}
n = len(T); item = cnt = sw = fr = csw = cfr = missing = 0; wrong = []
for k, t in T.items():
    s = got.get(k)
    if not s: missing += 1; continue
    ok_i = any(x in [m.lower() for m in t['names']] for x in names(s['id']))
    ok_c = s['count'] == t['count']
    item += ok_i; cnt += ok_c
    sw += s['ok'] and not ok_i; fr += (not s['ok']) and ok_i
    csw += s['cs'] and not ok_c; cfr += (not s['cs']) and ok_c
    if not ok_i: wrong.append(f"  {k}: {items[str(s['id'])]['n']} ≠ {t['names'][0]}")
    if not ok_c: wrong.append(f"  {k}: amount {s['count']} ≠ {t['count']}")
print(f"items {item}/{n} ({100*item/n:.1f}%) [sure but wrong {sw}, flagged {fr}]  amounts {cnt}/{n} ({100*cnt/n:.1f}%) [sure but wrong {csw}, flagged {cfr}]  missing {missing}, extra {len(got) - n + missing}")
if '-v' in sys.argv: print('\n'.join(wrong))
