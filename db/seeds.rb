# Loads the item database from db/seed/items.json.gz (made with `bin/rails tibia:export_seed`).
# The hosted site rebuilds its SQLite file on every deploy, so this is where its data comes from.
require "zlib"

path = Rails.root.join("db/seed/items.json.gz")
if Item.exists?
  puts "Items already loaded — skipping seed."
elsif File.exist?(path)
  data = JSON.parse(Zlib::GzipReader.open(path, &:read))
  now  = Time.current
  Item.transaction do
    data["items"].each_slice(1000) { |rows| Item.insert_all(rows.map { |r| r.merge("created_at" => now, "updated_at" => now) }) }
    data["npc_prices"].each_slice(1000) { |rows| NpcPrice.insert_all(rows.map { |r| r.merge("created_at" => now, "updated_at" => now) }) }
  end
  puts "Seeded #{Item.count} items and #{NpcPrice.count} NPC prices."
else
  puts "No #{path} — run `bin/rails tibia:import` (slow) or `tibia:export_seed` on a machine that has the data."
end
