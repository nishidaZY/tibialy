# Stash Analyzer: the page (recognition runs in the browser, see public/stash/analyzer.js) and
# the catalog it needs to price what it recognised.
class StashAnalyzerController < ApplicationController
  rate_limit to: 20, within: 1.minute, only: :catalog, with: -> { head :too_many_requests }
  SMALL_WORDS = %w[of the a an and in on to with for from].freeze

  def index
    @servers = LootAnalyzerController::TIBIA_SERVERS
  end

  # Every item of the sprite atlas, keyed by its client id (= Market id): name, NPC price, best NPC
  # buyer and Market id. The item database supplies the name, slug and buyer when it knows the item
  # (by Market id, else by name); the client's own data (atlas.json) the rest — its NPC price is
  # what the stash's "Total Sell To Value" order uses. Changes only with the data, so it is cached
  # and served with a long-lived ETag.
  def catalog
    atlas = atlas_items
    payload = Rails.cache.fetch(["stash-catalog", Item.maximum(:updated_at), atlas_mtime, atlas.size]) do
      ids = atlas.keys.map(&:to_i)
      by_market = Item.where(market_item_id: ids).index_by(&:market_item_id)
      unknown = atlas.reject { |id, _| by_market.key?(id.to_i) }.values.map { |v| v["n"].downcase }
      by_name = Item.where("LOWER(name) IN (?)", unknown.presence || [""]).index_by { |i| i.name.downcase }
      items = ids.index_with { |id| by_market[id] || by_name[atlas[id.to_s]["n"].downcase] }
      best = NpcPrice.buy.where(item_id: items.values.compact.map(&:id)).order(price: :desc)
                     .group_by(&:item_id).transform_values(&:first)
      ids.to_h do |id|
        meta, item = atlas[id.to_s], items[id]
        buyer = item && best[item.id]
        [id, { n: item&.name || display_name(meta["n"]), s: item&.slug, npc: meta["npc"].to_i,
               by: buyer&.npc_name, at: buyer&.npc_location, m: meta["m"] ? id : nil,
               also: meta["also"]&.map { |n| display_name(n) } }.compact]
      end.to_json
    end
    expires_in 1.hour, public: true
    render json: payload if stale?(etag: Digest::SHA1.hexdigest(payload), public: true)
  end

  private

  def atlas_path = Rails.root.join("public/stash/atlas.json")
  def atlas_mtime = File.exist?(atlas_path) ? File.mtime(atlas_path).to_i : 0

  def atlas_items
    @atlas_items ||= File.exist?(atlas_path) ? JSON.parse(File.read(atlas_path))["items"] : {}
  end

  # the client writes names in lower case ("piece of hellfire armor"); the site in title case
  def display_name(name)
    name.split(" ").each_with_index.map { |w, i| i.positive? && SMALL_WORDS.include?(w) ? w : w[0].upcase + w[1..] }.join(" ")
  end
end
