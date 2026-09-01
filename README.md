# Tibia Loot Analyser 💰

A fan-made web app for [Tibia](https://www.tibia.com/) players to look up item prices and figure out the best way to sell their loot — NPC or Market.

> Built with Ruby on Rails 7.2. Not affiliated with CipSoft.

---

## Features

- **Item database** — browse all tradeable items with NPC buy prices and Market averages
- **Fuzzy search** — typo-tolerant live search powered by Fuse.js (try `gren adargoin lether` → Green Dragon Leather)
- **Loot Analyser** — paste your hunt loot text and instantly see what to sell to NPCs vs. the Market
- **Market premium badges** — highlights items where the Market pays significantly more than NPCs
- **Dracula theme** — dark UI with animated pixel art

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Ruby on Rails 7.2 |
| Database | SQLite3 |
| Styling | Tailwind CSS (CDN) |
| Search | Fuse.js 6.6 (client-side fuzzy) |
| Scraping | Nokogiri + HTTParty |

---

## Getting Started

### Prerequisites

- Ruby 3.4.1
- Bundler

### Setup

```bash
git clone <repo-url>
cd tibialootfinder
bundle install
rails db:create db:migrate
rake tibia:import      # imports item data from TibiaWiki
rails server
```

Then open [http://localhost:3000](http://localhost:3000).

---

## Routes

| Path | Description |
|------|-------------|
| `GET /` | Item list with search & sort |
| `GET /items/:id` | Item detail page |
| `GET /items/names` | JSON array of all item names (used by fuzzy search) |
| `GET /loot` | Loot Analyser |
| `POST /loot/analyze` | Analyse pasted loot |

---

## Disclaimer

This is an unofficial fan project. Tibia is a registered trademark of CipSoft GmbH. All item data belongs to CipSoft.
