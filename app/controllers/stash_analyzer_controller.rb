# Stash Analyzer: the page (recognition runs in the browser, see public/stash/analyzer.js) and
# the catalog it needs to price what it recognised.
class StashAnalyzerController < ApplicationController
  rate_limit to: 20, within: 1.minute, only: :catalog, with: -> { head :too_many_requests }
  def index
    @servers = LootAnalyzerController::TIBIA_SERVERS
  end

  # Every market item in the sprite atlas: name, best NPC buyer and market id. Changes only when
  # the item data is re-imported, so it is cached and served with a long-lived ETag.
  def catalog
    ids = atlas_ids
    payload = Rails.cache.fetch(["stash-catalog", Item.maximum(:updated_at), ids.size]) do
      best = NpcPrice.buy.where(item_id: ids).order(price: :desc).group_by(&:item_id).transform_values(&:first)
      Item.where(id: ids).pluck(:id, :name, :slug, :highest_npc_buy_price, :market_item_id).to_h do |id, name, slug, npc, market|
        buyer = best[id]
        [id, { n: name, s: slug, npc: npc.to_i, by: buyer&.npc_name, at: buyer&.npc_location, m: market }]
      end.to_json
    end
    expires_in 1.hour, public: true
    render json: payload if stale?(etag: Digest::SHA1.hexdigest(payload), public: true)
  end

  private

  def atlas_ids
    path = Rails.root.join("public/stash/atlas.json")
    @atlas_ids ||= File.exist?(path) ? JSON.parse(File.read(path))["ids"].uniq : []
  end
end
