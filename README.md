# TIBIALY

A fan-made web app for [Tibia](https://www.tibia.com/) players: item prices, where to sell your
loot (NPC or Market), your whole stash priced from one screenshot, and a damage calculator.

> Ruby on Rails 7.2. Unofficial; not affiliated with CipSoft.

## Pages

| Page | What it does |
|---|---|
| **Items** (`/`) | Every tradeable item with its best NPC buyer and Market average; typo-tolerant search (Fuse.js), sort by value, Market premium badges |
| **Loot Analyzer** (`/loot`) | Paste the loot text of a hunt: each item goes to the NPC or to the Market, whichever pays more, with live Market prices for your world |
| **Stash Analyzer** (`/stash`) | Paste a screenshot of your Supply Stash, drag a box around the slots: every item and amount is recognised and priced. Runs in the browser; the screenshot is never uploaded |
| **Damage Calculator** (`/damage`) | The TibiaTools damage calculator (EUPL-1.2), restyled for the site |

## Apps: Windows, Mac, Android

Players get it from `/install` (the **Download** tab):

- **Windows and Mac:** installers made from `desktop/` (Electron). The app opens the site in its own
  window, so it is always current.
  - Build: `cd desktop && npm install && npm run dist:win && npm run dist:mac` → `desktop/dist/TIBIALY-windows-setup.exe`
    and `TIBIALY-mac.dmg`. The site address is in `desktop/config.json`.
  - Publish: attach both files to a GitHub release and set `DOWNLOADS_URL` on the server to the
    release's `…/releases/latest/download`. `/download/windows` and `/download/mac` redirect there,
    and the download buttons appear.
  - They are not code-signed, so the first launch shows "Windows protected your PC" (More info → Run
    anyway) or a macOS warning (right-click → Open); `/install` explains both.
- **Android, and Windows/Mac without a download:** the site is a Progressive Web App
  (`public/manifest.webmanifest`, `public/sw.js`): Chrome → ⋮ → **Install app**, Safari → **File → Add to Dock**.

## Market prices

Prices come from [tibiamarket.top](https://tibiamarket.top), which only knows what players last
uploaded for each world; a world can be weeks old. Pages use the current highest buy offer for your
world and say how old that world's data is. `app/models/tibia_market.rb` spaces calls 5 s apart (the
API's limit), asks for up to 1,000 rows (the API's default is only 100) and serves the last good
answer when a call fails. Without a world, the Items page shows the typical price:
`bin/rails tibia:sync_all_market_prices` (daily, about 30 min) stores the median over the worlds
scanned in the last 60 days.

## Stash Analyzer

`public/stash/analyzer.js` draws each candidate slot the way the Tibia client does: the item's
own sprite, the rarity edge and the amount in the client's outlined digits. It shrinks that
picture to the screenshot's size with the same kind of resizing the screenshot went through,
then compares it pixel by pixel with the slot. It also detects how the stash is sorted (name,
total NPC value or amount) and uses that order to check every item and amount. Slots it cannot
confirm are flagged so you can fix them with one click.

It works from full-size screenshots down to small or WhatsApp-compressed ones. Accuracy on
hand-checked screenshots is in [`script/stash/bench/README.md`](script/stash/bench/README.md).

Data files (committed):

| File | Made by |
|---|---|
| `public/stash/atlas.png` + `atlas.json` | `bin/rails stash:atlas`: sprites, names and NPC prices read from an installed Tibia client (Python 3 + Pillow) |
| `public/stash/ui.json` | the amount digits and rarity edges (`script/stash/bench/build_ui.py`) |
| `db/seed/items.json.gz` | `bin/rails tibia:export_seed`, loaded by `db/seeds.rb` on deploy |

## Tech stack

| Layer | Tech |
|---|---|
| Server | Ruby 3.4, Rails 7.2, SQLite |
| Pages | ERB, Tailwind (CDN), Faustina + Geist fonts, line-art figures (`public/figures`) |
| In the browser | Stash Analyzer (plain JavaScript, canvas), Fuse.js search, the calculator (Svelte bundle) |
| Data | TibiaWiki (Nokogiri + HTTParty), Market prices from tibiamarket.top |
| Desktop | Electron (`desktop/`), installers for Windows (NSIS) and Mac (dmg) |

## Getting started

```bash
git clone <repo-url>
cd tibialy
bundle install
bin/rails db:create db:migrate db:seed   # or: bin/rails tibia:import (fresh data from TibiaWiki)
bin/rails server
```

Then open http://localhost:3000.

Data tasks: `tibia:import` (items and NPC prices), `tibia:sync_market_ids`,
`tibia:sync_all_market_prices`, `tibia:export_seed`, `stash:atlas`.

## Routes

| Path | |
|---|---|
| `GET /` · `GET /items/:id` | Item list and item page |
| `GET /items/names` | Item names (fuzzy search) |
| `GET /items/market_prices` | Market prices proxy (known worlds only, cached) |
| `GET /loot` · `POST /loot/analyze` | Loot Analyzer |
| `GET /stash` · `GET /stash/catalog` | Stash Analyzer and its item catalog |
| `GET /damage` | Damage Calculator |
| `GET /install` · `GET /download/:os` | Downloads (Windows, Mac) and how to install |
| `GET /up` | Health check |

## Deploy (Render, free)

1. On [render.com](https://render.com): **New → Blueprint**, pick the repository. `render.yaml`
   creates a free web service. `bin/render-build.sh` installs gems, compiles assets, then
   creates and seeds the SQLite database on every deploy.
2. The site runs at `https://<name>.onrender.com`. Free instances sleep after 15 idle minutes,
   so the first visit after that takes about 30 s.

Security: HTTPS enforced (HSTS), host allow-list, Content-Security-Policy, Permissions-Policy,
CSRF protection, per-IP rate limits on the API endpoints, a Market proxy limited to known worlds
and cached, no secrets in the repo (Render generates `SECRET_KEY_BASE`). Check gems with
`bundle-audit check --update`.

## Licences

- The damage calculator (`vendor/tibiatools-calc`, `public/damage`) is TibiaTools by Kikaro,
  EUPL-1.2. See `vendor/tibiatools-calc/NOTICE.md`; the site links its source as a zip.
- Tibia is a registered trademark of CipSoft GmbH. Item data, names and sprites belong to CipSoft.
