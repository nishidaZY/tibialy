require "net/http"
require "json"
require "nokogiri"

namespace :tibia do
  WIKI_API = "https://www.tibiawiki.com.br/api.php"
  WIKI_BASE = "https://www.tibiawiki.com.br/wiki"

  desc "Import all items with NPC prices from TibiaWiki (highest buyer only)"
  task import: :environment do
    puts "🗡️  TibiaLootFinder Importer"
    puts "Fetching item list from TibiaWiki API..."

    titles = fetch_category_members("Categoria:Itens")
    puts "Found #{titles.size} items. Starting import..."

    imported = 0
    skipped  = 0
    errors   = 0

    titles.each_with_index do |title, idx|
      print "\r[#{idx + 1}/#{titles.size}] #{title[0..40].ljust(41)}"

      begin
        html = fetch_wiki_page(title)
        next if html.nil?

        doc = Nokogiri::HTML(html)

        # Item name (from page title)
        name = title.gsub("_", " ")

        # Weight
        weight_text = doc.at_css(".infobox td:contains('oz'), .infobox td")&.text
        weight = extract_weight(doc)

        # Image
        image_url = extract_image(doc)

        # Item type
        item_type = extract_item_type(doc)

        # NPC prices
        buy_prices  = extract_npc_prices(doc, "buy")
        sell_prices = extract_npc_prices(doc, "sell")

        next if buy_prices.empty? && sell_prices.empty?

        item = Item.find_or_initialize_by(name: name)
        item.weight    = weight
        item.image_url = image_url
        item.item_type = item_type

        if buy_prices.any?
          best = buy_prices.max_by { |p| p[:price] }
          item.highest_npc_buy_price = best[:price]
        end

        item.save!

        # Upsert NPC prices
        item.npc_prices.delete_all
        buy_prices.each do |p|
          item.npc_prices.create!(
            npc_name: p[:npc_name],
            npc_location: p[:npc_location],
            price: p[:price],
            price_type: "buy"
          )
        end
        sell_prices.each do |p|
          item.npc_prices.create!(
            npc_name: p[:npc_name],
            npc_location: p[:npc_location],
            price: p[:price],
            price_type: "sell"
          )
        end

        imported += 1
        sleep 0.3 # be polite to the wiki

      rescue => e
        errors += 1
        STDERR.puts "\n  ⚠️  Error on #{title}: #{e.message}"
      end
    end

    puts "\n\n✅ Done! Imported: #{imported} | Skipped: #{skipped} | Errors: #{errors}"
  end

  desc "Import a single item by name (for testing)"
  task :item, [:name] => :environment do |_, args|
    name = args[:name] || "Dragon_Scale_Mail"
    puts "Fetching: #{name}"
    html = fetch_wiki_page(name)
    if html.nil?
      puts "Could not fetch page."
      next
    end
    doc = Nokogiri::HTML(html)
    puts "Buy prices: #{extract_npc_prices(doc, 'buy').inspect}"
    puts "Sell prices: #{extract_npc_prices(doc, 'sell').inspect}"
    puts "Weight: #{extract_weight(doc)}"
    puts "Image: #{extract_image(doc)}"
    puts "Type: #{extract_item_type(doc)}"
  end

  # --- Helpers ---

  def fetch_category_members(category)
    titles = []
    cmcontinue = nil

    loop do
      params = {
        action: "query",
        list: "categorymembers",
        cmtitle: category,
        cmlimit: 500,
        cmnamespace: 0,
        format: "json"
      }
      params[:cmcontinue] = cmcontinue if cmcontinue

      uri = URI(WIKI_API)
      uri.query = URI.encode_www_form(params)

      response = Net::HTTP.get_response(uri)
      data = JSON.parse(response.body)

      members = data.dig("query", "categorymembers") || []
      titles.concat(members.map { |m| m["title"].gsub(" ", "_") })

      cmcontinue = data.dig("continue", "cmcontinue")
      break unless cmcontinue
    end

    titles
  end

  def fetch_wiki_page(title)
    uri = URI("#{WIKI_BASE}/#{URI.encode_www_form_component(title)}")
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 10, read_timeout: 15) do |http|
      http.get(uri.request_uri, "User-Agent" => "TibiaLootFinder/1.0 (fan site importer)")
    end
    response.code == "200" ? response.body : nil
  rescue => e
    nil
  end

  def extract_weight(doc)
    # Look for "oz" near infobox cells
    doc.css(".infobox tr").each do |row|
      label = row.at_css("th")&.text.to_s.strip
      value = row.at_css("td")&.text.to_s.strip
      if label.downcase.include?("peso") || label.downcase.include?("weight")
        return value.gsub(/[^\d.]/, "").to_f
      end
    end

    # Fallback: find any "X.XX oz" pattern in the page
    match = doc.text.match(/(\d+[\.,]\d+)\s*oz/)
    match ? match[1].gsub(",", ".").to_f : nil
  end

  def extract_image(doc)
    # Tibia item images are usually in .infobox-image or similar
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
    prices = []

    # The wiki uses tables with headers like "Compra de" (NPCs that buy = "buy" for us)
    # and "Vende para" (NPCs that sell TO player = "sell" for us)
    # "Compra de" means: NPC compra de você (NPC buys FROM you)
    # "Vende para" means: NPC vende para você (NPC sells TO you)

    headers = {
      "buy"  => ["compra de", "compra", "compradores", "npc buy"],
      "sell" => ["vende para", "vende", "vendedores", "npc sell"]
    }

    target_keywords = headers[type]

    doc.css("table, .wikitable").each do |table|
      # Check if this table is preceded by a relevant heading
      section_header = table.previous_element&.text.to_s.downcase
      prev_sibling   = table.parent&.previous_element&.text.to_s.downcase

      relevant = target_keywords.any? do |kw|
        section_header.include?(kw) || prev_sibling.include?(kw) ||
          table.at_css("th")&.text.to_s.downcase.include?(kw)
      end

      # Also check table caption or first header row
      table_text = table.at_css("caption, thead th")&.text.to_s.downcase
      relevant ||= target_keywords.any? { |kw| table_text.include?(kw) }

      next unless relevant

      table.css("tr").each do |row|
        cells = row.css("td")
        next if cells.size < 2

        npc_name = cells[0].text.strip.gsub(/\s+/, " ")
        location = cells.size >= 3 ? cells[1].text.strip : nil
        price_text = cells.last.text.strip.gsub(/[^\d]/, "").to_i

        next if npc_name.empty? || price_text == 0
        next if npc_name.downcase == "ninguém" || npc_name.downcase == "nobody"

        prices << { npc_name: npc_name, npc_location: location, price: price_text }
      end
    end

    prices.uniq { |p| p[:npc_name] }
  end
end
