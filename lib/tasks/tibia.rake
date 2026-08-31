require "nokogiri"
require "json"

namespace :tibia do
  WIKI_API  = "https://www.tibiawiki.com.br/api.php"
  WIKI_BASE = "https://www.tibiawiki.com.br/wiki"

  desc "Import all items with NPC prices from TibiaWiki (highest buyer only)"
  task import: :environment do
    puts "🗡️  TibiaLootFinder Importer"
    puts "Fetching item list from TibiaWiki API..."

    titles = fetch_category_members("Categoria:Itens")
    puts "Found #{titles.size} items. Starting import..."

    imported = 0
    errors   = 0

    titles.each_with_index do |title, idx|
      print "\r[#{idx + 1}/#{titles.size}] #{title[0..40].ljust(41)}"

      begin
        html = fetch_wiki_page(title)
        next if html.nil?

        doc  = Nokogiri::HTML(html)
        name = title.gsub("_", " ")

        buy_prices  = extract_npc_prices(doc, "buy")
        sell_prices = extract_npc_prices(doc, "sell")

        # Save ALL items regardless of NPC data
        item = Item.find_or_initialize_by(name: name)
        item.weight    = extract_weight(doc)
        item.image_url = extract_image(doc) if item.image_url.blank?
        item.item_type = extract_item_type(doc)
        item.highest_npc_buy_price = buy_prices.map { |p| p[:price] }.max || 0
        item.save!

        unless buy_prices.empty? && sell_prices.empty?
          item.npc_prices.delete_all
          buy_prices.each  { |p| item.npc_prices.create!(p.merge(price_type: "buy")) }
          sell_prices.each { |p| item.npc_prices.create!(p.merge(price_type: "sell")) }
        end

        imported += 1
        sleep 0.3

      rescue => e
        errors += 1
        STDERR.puts "\n  ⚠️  Error on #{title}: #{e.message}"
      end
    end

    puts "\n\n✅ Done! Imported: #{imported} | Errors: #{errors}"
  end

  desc "Test a single item  (rake tibia:item[Dragon_Scale_Mail])"
  task :item, [:name] => :environment do |_, args|
    name = args[:name] || "Dragon_Scale_Mail"
    puts "Fetching: #{name}"
    html = fetch_wiki_page(name)
    abort("Could not fetch page.") if html.nil?
    doc = Nokogiri::HTML(html)
    puts "Buy  prices: #{extract_npc_prices(doc, 'buy').inspect}"
    puts "Sell prices: #{extract_npc_prices(doc, 'sell').inspect}"
    puts "Weight: #{extract_weight(doc)}"
    puts "Image:  #{extract_image(doc)}"
    puts "Type:   #{extract_item_type(doc)}"
  end

  # ── Helpers ──────────────────────────────────────────────────────────────

  CURL_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

  def curl_get(url)
    result = `curl -sL --max-time 20 -H "Accept: text/html,application/xhtml+xml,*/*;q=0.8" -H "Accept-Language: pt-BR,pt;q=0.9" -A "#{CURL_UA}" "#{url}" 2>/dev/null`
    result.empty? ? nil : result
  end

  def fetch_category_members(category)
    titles     = []
    cmcontinue = nil
    loop do
      qs = "action=query&list=categorymembers&cmtitle=#{URI.encode_www_form_component(category)}&cmlimit=500&cmnamespace=0&format=json"
      qs += "&cmcontinue=#{URI.encode_www_form_component(cmcontinue)}" if cmcontinue
      raw = curl_get("#{WIKI_API}?#{qs}")
      break unless raw
      begin
        data = JSON.parse(raw)
      rescue JSON::ParserError
        STDERR.puts "\n  API returned non-JSON: #{raw[0..200]}"
        break
      end
      members = data.dig("query", "categorymembers") || []
      titles.concat(members.map { |m| m["title"].gsub(" ", "_") })
      cmcontinue = data.dig("continue", "cmcontinue")
      break unless cmcontinue
    end
    titles
  end

  def fetch_wiki_page(title)
    url = "#{WIKI_BASE}/#{URI.encode_www_form_component(title)}"
    curl_get(url)
  end

  def extract_weight(doc)
    doc.css(".infobox tr").each do |row|
      label = row.at_css("th")&.text.to_s.strip.downcase
      if label.include?("peso") || label.include?("weight")
        val = row.at_css("td")&.text.to_s.strip
        return val.gsub(/[^\d.]/, "").to_f
      end
    end
    match = doc.text.match(/(\d+[\.,]\d+)\s*oz/)
    match ? match[1].gsub(",", ".").to_f : nil
  end

  def extract_image(doc)
    # Only look inside the infobox — avoids picking up map/NPC/creature images
    img = doc.at_css(".infobox-image img, .infobox img")
    return nil unless img
    src = img["src"] || img["data-src"]
    return nil unless src
    # Skip thumbnails and tiny icons
    return nil if src.include?("thumb") && src =~ /\d+px/
    src.start_with?("http") ? src : "https://www.tibiawiki.com.br#{src}"
  end

  def extract_item_type(doc)
    doc.css(".infobox tr").each do |row|
      label = row.at_css("th")&.text.to_s.strip.downcase
      if label.include?("tipo") || label.include?("type") || label.include?("classe")
        return row.at_css("td")&.text.to_s.strip
      end
    end
    nil
  end

  def extract_npc_prices(doc, type)
    prices  = []
    keywords = type == "buy" ? %w[compra compradores] : %w[vende vendedores]

    doc.css("table, .wikitable").each do |table|
      context = [
        table.previous_element&.text,
        table.parent&.previous_element&.text,
        table.at_css("caption, thead th")&.text
      ].compact.map(&:downcase).join(" ")

      next unless keywords.any? { |kw| context.include?(kw) }

      table.css("tr").each do |row|
        cells = row.css("td")
        next if cells.size < 2

        npc_name   = cells[0].text.strip.gsub(/\s+/, " ")
        location   = cells.size >= 3 ? cells[1].text.strip : nil
        price_text = cells.last.text.strip.gsub(/[^\d]/, "").to_i

        next if npc_name.empty? || price_text == 0
        next if %w[ninguém nobody].include?(npc_name.downcase)

        prices << { npc_name: npc_name, npc_location: location, price: price_text }
      end
    end

    prices.uniq { |p| p[:npc_name] }
  end

  desc "Sync market IDs + NPC prices from api.tibiamarket.top (run after import)"
  task sync_market_ids: :environment do
    puts "📈 Fetching item metadata from TibiaMarket API..."
    raw = `curl -sL --max-time 60 "https://api.tibiamarket.top/item_metadata" 2>/dev/null`
    if raw.empty?
      puts "❌ Could not reach api.tibiamarket.top"
      next
    end
    begin
      metadata = JSON.parse(raw)
    rescue JSON::ParserError => e
      puts "❌ JSON parse error: #{e.message[0..200]}"
      next
    end

    # Build item lookup: lowercase name -> Item record
    puts "  Building item lookup (#{Item.count} items in DB)..."
    item_lookup = {}
    Item.find_each do |item|
      item_lookup[item.name.downcase.strip] = item
    end

    matched = 0
    npc_updated = 0
    not_found = []

    metadata.each do |m|
      key  = m["name"].to_s.downcase.strip
      key2 = m["wiki_name"].to_s.downcase.strip
      item = item_lookup[key] || item_lookup[key2]

      unless item
        not_found << m["name"]
        next
      end

      item.market_item_id = m["id"]

      # NPC prices from the API — more reliable than TibiaWiki HTML scraping
      api_buys  = (m["npc_buy"]  || []).select { |p| p["price"].to_i > 0 }
      api_sells = (m["npc_sell"] || []).select { |p| p["price"].to_i > 0 }

      if api_buys.any? || api_sells.any?
        item.npc_prices.delete_all
        api_buys.each do |p|
          item.npc_prices.build(npc_name: p["name"], npc_location: p["location"],
                                price: p["price"].to_i, price_type: "buy")
        end
        api_sells.each do |p|
          item.npc_prices.build(npc_name: p["name"], npc_location: p["location"],
                                price: p["price"].to_i, price_type: "sell")
        end
        item.highest_npc_buy_price = api_buys.map { |p| p["price"].to_i }.max || 0
        npc_updated += 1
      end

      item.save!
      matched += 1
    end

    puts "✅ Done!"
    puts "   #{matched} items matched to TibiaMarket IDs"
    puts "   #{npc_updated} items got NPC prices from API"
    puts "   #{not_found.size} API items had no DB match"
    puts "   #{Item.where.not(market_item_id: nil).count} total items now have market IDs"
  end

  desc "Fetch item images via TibiaWiki MediaWiki API — run with FORCE=1 to overwrite all"
  task fetch_images: :environment do
    items = if ENV["FORCE"] == "1"
              puts "🖼️  Force mode: re-fetching images for ALL items..."
              Item.all.to_a
            else
              Item.where(image_url: nil).or(Item.where(image_url: "")).to_a
            end
    missing = items
    puts "🖼️  Fetching images for #{missing.size} items (#{[(missing.size / 50.0).ceil, 1].max} batches)..."

    updated = 0
    errors  = 0

    missing.each_slice(50).with_index do |batch, idx|
      # Build pipe-separated File: titles for the batch
      titles = batch.map { |i| "File:#{i.name.gsub(' ', '_')}.gif" }.join("|")
      qs = "action=query&titles=#{URI.encode_www_form_component(titles)}&prop=imageinfo&iiprop=url&format=json"
      raw = curl_get("#{WIKI_API}?#{qs}")

      if raw.nil?
        STDERR.puts "\n  ⚠️  Batch #{idx + 1}: no response, skipping"
        errors += batch.size
        next
      end

      begin
        data = JSON.parse(raw)
      rescue JSON::ParserError
        STDERR.puts "\n  ⚠️  Batch #{idx + 1}: JSON parse error"
        errors += batch.size
        next
      end

      pages = data.dig("query", "pages") || {}

      # Build map: normalised title -> url
      url_map = {}
      pages.each_value do |page|
        url = page.dig("imageinfo", 0, "url")
        next unless url
        # Strip "File:" prefix, replace underscores with spaces, downcase for lookup
        title = page["title"].to_s.sub(/\AFile:/i, "").gsub("_", " ").downcase.sub(/\.gif\z/, "")
        url_map[title] = url
      end

      batch.each do |item|
        key = item.name.downcase
        img_url = url_map[key]
        if img_url
          item.update_column(:image_url, img_url)
          updated += 1
        end
      end

      print "\r  Batch #{idx + 1}/#{(missing.size / 50.0).ceil} — #{updated} updated, #{errors} errors"
      sleep 0.4
    end

    puts "\n\n✅ Done! Updated #{updated} images. Still missing: #{missing.size - updated}."
  end

  desc "Assign Special:FilePath image URLs for all items (instant — no API calls)"
  task assign_image_urls: :environment do
    count  = 0
    errors = 0
    Item.find_each do |item|
      name_slug = item.name.gsub(" ", "_")
      url = "https://www.tibiawiki.com.br/wiki/Special:FilePath/#{name_slug}.gif"
      item.update_column(:image_url, url)
      count += 1
      print "\r  #{count} items updated..." if (count % 500).zero?
    rescue => e
      errors += 1
      STDERR.puts "\n  ⚠️  #{item.name}: #{e.message}"
    end
    puts "\n✅ Done! Set image URLs for #{count} items (#{errors} errors)."
  end
  TIBIA_SERVERS = %w[
    Antica Belobra Bona Calmera Celesta Collabra Descubra Dia Escura Esmera
    Ferobra Firmera Gladera Harmonia Honbra Inabra Jaguna Kalimera Lobera
    Luminera Maligna Monza Mystera Nefera Nevia Oceanis Pacera Peloria
    Premia Quelibra Refugia Runera Secura Serdebra Solidera Talera Thyria
    Ustebra Venebra Victoris Vunira Wildera Wintera Xyla Yara Yonabra
    Zuna Zunera
  ].freeze

  desc "Fetch market prices across ALL servers and store average — run daily"
  task sync_all_market_prices: :environment do
    puts "🌍 Syncing market prices across #{TIBIA_SERVERS.size} servers..."

    # All items that have a market ID
    items      = Item.where.not(market_item_id: nil).to_a
    id_to_item = items.each_with_object({}) { |i, h| h[i.market_item_id] = i }
    all_ids    = items.map(&:market_item_id).join(",")
    puts "  #{items.size} items with market IDs."

    # Accumulate prices: market_item_id -> [price, price, ...]
    prices_by_id = Hash.new { |h, k| h[k] = [] }
    errors = 0

    TIBIA_SERVERS.each_with_index do |server, idx|
      print "\r  [#{idx + 1}/#{TIBIA_SERVERS.size}] #{server.ljust(14)}"

      # Try fetching all items for the server in one shot
      url = "https://api.tibiamarket.top/market_values?server=#{URI.encode_www_form_component(server)}&item_ids=#{all_ids}"
      raw = curl_get(url)

      if raw.nil? || raw.strip.empty?
        errors += 1
        next
      end

      begin
        data = JSON.parse(raw)
        # API may return Array of objects OR Hash keyed by item_id
        entries = case data
                  when Hash  then data.map { |k, v| v.is_a?(Hash) ? v.merge("id" => k.to_i) : nil }.compact
                  when Array then data
                  else []
                  end
        entries.each do |m|
          id    = m["id"].to_i
          price = m["buy_offer"].to_i > 0 ? m["buy_offer"].to_i : m["month_average_buy"].to_i
          prices_by_id[id] << price if price > 0
        end
      rescue JSON::ParserError
        errors += 1
      end

      sleep 0.4
    end

    puts "\n\n  Computing averages and saving..."
    updated = 0
    now     = Time.current

    prices_by_id.each do |market_id, prices|
      item = id_to_item[market_id]
      next unless item && prices.any?

      avg = (prices.sum.to_f / prices.size).round
      item.update_columns(avg_market_price: avg, market_price_updated_at: now)
      updated += 1
    end

    puts "✅ Done! #{updated} items got avg market prices. #{errors} server errors."
    puts "   #{Item.where("avg_market_price > highest_npc_buy_price").count} items have market price > NPC price."
  end

end
