# Stash Analyzer data. The analyzer recognises items in a screenshot of the Tibia stash in the
# browser by drawing every candidate the way the client draws it and comparing. It needs the item
# sprites exactly as the client has them, packed into one image (public/stash/atlas.png + atlas.json),
# taken from an installed Tibia client:
#
#   bin/rails stash:atlas                       # macOS client in its default place
#   TIBIA_ASSETS=/path/to/assets bin/rails stash:atlas
#
# public/stash/ui.json (the amount digits and rarity edges) comes from the client's UI files and
# screenshots; see script/stash/bench/README.md. Building needs Python 3 with Pillow (dev machine
# only); the result is committed, so the server never needs either.
namespace :stash do
  desc "Build public/stash/atlas.png + atlas.json from the Tibia client's own sprites"
  task :atlas do
    assets = ENV.fetch("TIBIA_ASSETS") { File.expand_path("~/Library/Application Support/CipSoft GmbH/Tibia/packages/Tibia.app/Contents/Resources/assets") }
    abort "Tibia client assets not found at #{assets} (set TIBIA_ASSETS)" unless File.exist?(File.join(assets, "catalog-content.json"))
    system("python3", Rails.root.join("script/stash/build_client_atlas.py").to_s, assets,
           Rails.root.join("public/stash").to_s, exception: true)
  end
end

namespace :tibia do
  desc "Export items + NPC prices to db/seed/items.json.gz (loaded by db/seeds.rb on deploy)"
  task export_seed: :environment do
    require "zlib"
    items = Item.order(:id).as_json(except: %w[created_at updated_at])
    npc   = NpcPrice.order(:id).as_json(except: %w[id created_at updated_at])
    path  = Rails.root.join("db/seed/items.json.gz")
    Zlib::GzipWriter.open(path) { |gz| gz.write(JSON.generate(items: items, npc_prices: npc)) }
    puts "#{items.size} items, #{npc.size} NPC prices -> #{path} (#{File.size(path) / 1024} KB)"
  end
end
