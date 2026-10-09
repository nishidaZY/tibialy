# Stash Analyzer data. The analyzer recognises items in a screenshot of the Tibia stash in the
# browser, comparing each slot with the item sprites. Those sprites are packed into one image
# (public/stash/atlas.png + atlas.json) so the page loads them in a single request.
#
#   bin/rails stash:atlas    # export the item list, download the sprites, build the atlas
#
# Building the atlas needs Python 3 with Pillow (dev machine only); the result is committed, so
# the server never needs either.
namespace :stash do
  desc "Build public/stash/atlas.png + atlas.json from the sprites of all market items"
  task atlas: :environment do
    list = Item.where.not(market_item_id: nil).where.not(image_url: nil).order(:id)
               .map { |i| { id: i.id, url: i.image_url } }
    dir = Rails.root.join("tmp/stash")
    FileUtils.mkdir_p(dir)
    File.write(dir.join("items.json"), JSON.generate(list))
    puts "#{list.size} items exported"
    system("python3", Rails.root.join("script/stash/build_atlas.py").to_s, dir.to_s,
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
