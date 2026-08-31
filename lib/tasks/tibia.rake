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
    img = doc.at_css(".infobox-image img, .infobox img, #mw-content-text img")
    return nil unless img
    src = img["src"] || img["data-src"]
    return nil unless src
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

  desc "Sync market item IDs from api.tibiamarket.top (run after import)"
  task sync_market_ids: :environment do
    puts "📈 Syncing market item IDs from TibiaMarket API..."
    raw = `curl -sL --max-time 30 "https://api.tibiamarket.top/item_metadata" 2>/dev/null`
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

    # Build lookup: lowercase name/wiki_name -> market id
    lookup = {}
    metadata.each do |m|
      id = m["id"]
      lookup[m["name"].to_s.downcase.strip]      = id
      lookup[m["wiki_name"].to_s.downcase.strip] = id if m["wiki_name"].present?
    end
    lookup.delete("")

    updated = 0
    not_found = []
    Item.find_each do |item|
      key = item.name.downcase.strip
      market_id = lookup[key]
      if market_id
        item.update_column(:market_item_id, market_id) if item.market_item_id != market_id
        updated += 1
      else
        not_found << item.name
      end
    end

    total = Item.where.not(market_item_id: nil).count
    puts "✅ Done! #{updated}/#{Item.count} items matched market IDs."
    puts "⚠️  Not found (#{not_found.size}): #{not_found.first(5).join(', ')}..." if not_found.any?
  end

  desc "Fetch missing item images via TibiaWiki MediaWiki API (batch of 50)"
  task fetch_images: :environment do
    missing = Item.where(image_url: nil).or(Item.where(image_url: "")).to_a
    puts "🖼️  Fetching images for #{missing.size} items (#{(missing.size / 50.0).ceil} batches)..."

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
end
