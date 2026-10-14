# TibiaTools damage calculator (vendored)

The damage calculator at `/damage` is the one from **TibiaTools** by Kikaro:

- Source: https://github.com/kik-tibia/tibiatools (commit `a153026801e9f9f22c4fac29e3c1aa26f85909de`, 2026-10-11)
- Site: https://tibiatools.io/tools/calculator
- Licence: **EUPL-1.2** — full text in `LICENCE`. This folder and the bundle it builds
  (`public/damage/calculator.js`, `public/damage/calculator.css`) are distributed under the same licence.
  The rest of TibiaLootFinder is not part of this Work.

## What is here

- `upstream/` — files copied unchanged from the original repository:
  `src/lib/damage-calc/` (without the tests), `src/data/`, the calculator's Svelte components
  (`DamageCalc`, `ResultsTable`, `BuildBadge`, `FuzzySelect`, `RemoveButton`, `Tooltip`, `build-panel/*`)
  and `src/styles/build-table.css`.
- `entry.ts`, `build.mjs`, `theme.css`, `package.json` — added for TibiaLootFinder.
- `public/damage/{check,copy,paste}.svg` — icons copied unchanged from the original `public/`.

## Modifications

1. **Theme** (`theme.css`): the original's CSS variables are mapped to TibiaLootFinder's colours and fonts,
   and its global table rules are scoped to `#damage-calc`.
2. **Icon paths** (`build.mjs`): `/check.svg`, `/copy.svg`, `/paste.svg` are rewritten to `/damage/…` at build time.
3. **Mounting** (`entry.ts`): the calculator is mounted into `#damage-calc` on a Rails page instead of an
   Astro page; the initial state is read from the same `?s=` URL parameter, so TibiaTools links open here.

The calculation code itself is not modified.

## Updating

Copy the same paths from a newer upstream commit into `upstream/`, update the commit above, then:

    cd vendor/tibiatools-calc && npm install && npm run build
