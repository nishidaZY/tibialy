class LootAnalyzerController < ApplicationController
  TIBIA_SERVERS = %w[
    Antica Belobra Bona Calmera Celesta Collabra Descubra Dia Escura Esmera
    Ferobra Firmera Gladera Harmonia Honbra Inabra Jaguna Kalimera Lobera
    Luminera Maligna Monza Mystera Nefera Nevia Oceanis Pacera Peloria
    Premia Quelibra Refugia Runera Secura Serdebra Solidera Talera Thyria
    Ustebra Venebra Victoris Vunira Wildera Wintera Xyla Yara Yonabra
    Zuna Zunera
  ].sort.freeze

  def index
    @servers = TIBIA_SERVERS
  end

  def analyze
    loot_text = params[:loot_text].to_s.strip
    server    = params[:server].to_s.strip

    if loot_text.blank?
      render json: { error: "Paste some loot text first." }, status: :unprocessable_entity
      return
    end

    parsed = parse_loot(loot_text)
    results = parsed.map do |entry|
      item = find_item(entry[:name])
      if item
        best_buyer = item.npc_prices.where(price_type: "buy").order(price: :desc).first
        {
          original_name:    entry[:name],
          matched_name:     item.name,
          quantity:         entry[:quantity],
          image_url:        item.image_url,
          npc_buy_price:    item.highest_npc_buy_price || 0,
          best_npc_buyer:   best_buyer&.npc_name,
          npc_location:     best_buyer&.npc_location,
          market_item_id:   item.market_item_id,
          npc_total:        (item.highest_npc_buy_price || 0) * entry[:quantity],
          found:            true
        }
      else
        {
          original_name:  entry[:name],
          matched_name:   nil,
          quantity:       entry[:quantity],
          image_url:      nil,
          npc_buy_price:  0,
          best_npc_buyer: nil,
          npc_location:   nil,
          market_item_id: nil,
          npc_total:      0,
          found:          false
        }
      end
    end

    render json: {
      server:  server,
      results: results,
      market_ids: results.filter_map { |r| r[:market_item_id] }.uniq
    }
  end

  private

  def parse_loot(text)
    # Strip "Loot of a/an SomeName:" prefix (battle log format)
    text = text.sub(/\ALoot of (?:a |an )?[^:]+:\s*/i, "")
    # Strip container header like "Backpack contains:" etc.
    text = text.sub(/\A[^:]{1,40}:\s*/i, "") if text =~ /\A[^:]{1,40}:/

    # Remove trailing period
    text = text.chomp(".")

    # Split on comma separators
    chunks = text.split(/,\s*/)

    chunks.filter_map do |chunk|
      chunk = chunk.strip
      next if chunk.blank?

      if chunk =~ /\A(\d+)\s+(.+)\z/
        { quantity: $1.to_i, name: $2.strip }
      elsif chunk =~ /\Aan?\s+(.+)\z/i
        { quantity: 1, name: $1.strip }
      elsif chunk =~ /\A\d+\z/
        # bare number — skip (gold coin edge case)
        nil
      else
        { quantity: 1, name: chunk }
      end
    end
  end

  def find_item(name)
    n = name.downcase.strip

    # 1) Exact match
    item = Item.where("LOWER(name) = ?", n).first
    return item if item

    # 2) Remove trailing 's' (plurals: "platinum coins" -> "platinum coin")
    item = Item.where("LOWER(name) = ?", n.delete_suffix("s")).first
    return item if item

    # 3) Remove trailing 'es' ("war axes" -> "war axe")
    item = Item.where("LOWER(name) = ?", n.delete_suffix("es")).first
    return item if item

    # 4) LIKE fallback — partial match
    Item.where("LOWER(name) LIKE ?", "%#{n}%").first
  end
end
