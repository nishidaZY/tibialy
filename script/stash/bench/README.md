# Stash Analyzer bench

Measures the analyzer (`public/stash/analyzer.js`) against screenshots whose every slot was checked
by hand, so a change is kept only when the numbers say it helps.

The screenshots and truth files are players' own stashes, so they stay out of git: they live in
`tmp/stash-bench/` (`BENCH`), listed in `cases.txt` as `image  x,y,w,h|-  truth.json`. A truth file
maps each slot, in reading order, to what is really there:

```json
{ "r0c0": { "names": ["demonic essence"], "count": 940 }, "r0c1": { "names": ["violet gem"], "count": 70 } }
```

Checking a new screenshot: run `bench.mjs` on it, review the slots against the picture, fix what is
wrong. A stash sorted by name or by Total Sell To Value checks itself: every item's place has to fit
that order (`count × NPC price` falling from slot to slot).

## Tools

| file | does |
|---|---|
| `bench.mjs <out.json> <image> [x,y,w,h]` | runs the analyzer in headless Chrome, writes what it found (`ANALYZER`, `ATLAS`, `UI` override the shipped files) |
| `score.py <result> <truth> [-v]` | items and amounts right, and how many wrong ones were marked sure |
| `runall.sh` | every case in `cases.txt`, scored |
| `e2e.mjs <image> <x,y,w,h> <truth>` | the same through the real page (`/stash`): paste, drag, analyze, read the table |
| `harvest.mjs <image> <sel> <result> <truth> <out>` | learns the amount digits' 1x look from the slots a result read right |
| `build_ui.py <graphics_resources.rcc> <glyphs> <out>` | builds `public/stash/ui.json` (digits + rarity edges) |

`../build_client_atlas.py` builds the sprite atlas from the client (`bin/rails stash:atlas`).
The Node tools need `puppeteer-core` (`PUPPETEER_FROM` = a `package.json` whose `node_modules`
has it) and Google Chrome.

## Results (2026-10-20)

Items / amounts right. "Before" is the previous analyzer (TibiaWiki sprites) with the page's default
"sorted by name" box checked, as players used it, and unchecked.

| screenshot | slot size | before (box checked) | before (unchecked) | now |
|---|---|---|---|---|
| 1600×900 WhatsApp, value order | 31 px | 81.8% / 96.4% | 93.6% / 96.4% | **100% / 100%** |
| same, 1280×720 | 25 px | 73.2% / 80.9% | 88.6% / 80.9% | **99.5% / 99.5%** |
| same, 1024×576 | 20 px | 59.5% / 50.5% | 83.2% / 50.5% | **96.8% / 97.3%** |
| same, 960×540 | 18.5 px | 51.4% / 30.5% | 80.0% / 30.5% | **95.9% / 93.2%** |
| same, 800×450 | 15 px | grid misread (50 of 220 slots) | same | **90.5% / 76.8%** |
| stash cropped and zoomed 2.5× | 77 px | 79.1% / 98.6% | 93.6% / 98.6% | **100% / 99.5%** |
| 1600×900, name order | 31 px | 98.1% / 100% | 96.3% / 100% | **100% / 100%** |
| same, 1024×576 | 20 px | 96.9% / 74.5% | 88.2% / 74.5% | **100% / 97.5%** |
| zoomed stash (1.5×), name order, has "2,860" | 55 px | 97.6% / 100% | 96.4% / 100% | **100% / 99.4%** |
| same, half size | 27 px | 98.2% / 98.8% | 89.7% / 98.8% | **99.4% / 97.0%** |

Wrong answers marked sure (the bad kind of error): none down to 1280 px wide, at most 1 item and 2
amounts per screenshot down to 960 px, 3 items and 4 amounts at 800 px. Everything else that is not
certain is flagged in the page for the player to check.
