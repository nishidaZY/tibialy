#!/bin/bash
# The whole bench: every screenshot with its truth, scored. Screenshots and truth files are the
# user's own (not in git): BENCH (default tmp/stash-bench) holds them, cases.txt lists
# "image  x,y,w,h|-  truth.json" per line.
cd "$(dirname "$0")"
BENCH=${BENCH:-../../../tmp/stash-bench}
while read -r img sel truth; do
  [ -z "$img" ] || [ "${img:0:1}" = "#" ] && continue
  [ "$sel" = "-" ] && sel=""
  out=$BENCH/result_${img%.*}.json
  node bench.mjs "$out" "$BENCH/$img" "$sel" > /dev/null 2>&1
  printf "%-18s " "$img"; python3 score.py "$out" "$BENCH/$truth" | tr -d '\n'
  python3 -c "import json; d=json.load(open('$out')); print('  %s %.1fs' % (d['order'], d['ms'] / 1000))"
done < "$BENCH/cases.txt"
