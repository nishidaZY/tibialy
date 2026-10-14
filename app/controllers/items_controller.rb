class ItemsController < ApplicationController
  # per IP: market lookups hit an external API
  rate_limit to: 30, within: 1.minute, only: :market_prices, with: -> { render json: [], status: :too_many_requests }
  PER_PAGE = 30

  def index
    @query = params[:q]
    @sort  = params[:sort] || "market"
    @page  = (params[:page] || 1).to_i.clamp(1, 99_999)

    base = Item.where.not(market_item_id: nil)

    if params[:fuzzy].present?
      fuzzy_names = Array(params[:fuzzy]).map(&:strip).reject(&:blank?).first(100)
      base = fuzzy_names.any? ? base.where(name: fuzzy_names) : base.none
    elsif @query.present?
      base = base.search(@query)
    end

    base = case @sort
           when "name"  then base.order(:name)
           when "value" then base.by_value
           else              base.by_market_value
           end

    @total_count = base.count
    @total_pages = [(@total_count / PER_PAGE.to_f).ceil, 1].max
    @page        = @page.clamp(1, @total_pages)

    @items = base.offset((@page - 1) * PER_PAGE).limit(PER_PAGE)
  end

  def show
    @item        = Item.find_by!(slug: params[:id])
    @buy_prices  = @item.buy_prices
    @sell_prices = @item.sell_prices
  end

  def names
    items = Item.where.not(market_item_id: nil).pluck(:name)
    render json: items
  end

  # Proxy to api.tibiamarket.top (avoids CORS). Only known servers and at most 300 numeric ids;
  # answers are cached 10 minutes per server + id set so the public site cannot hammer the API.
  def market_prices
    world = (params[:world] || params[:server]).to_s.strip
    ids   = params[:item_ids].to_s.split(",").filter_map { |i| Integer(i, exception: false) }.uniq.first(300).sort
    return render json: [] unless LootAnalyzerController::TIBIA_SERVERS.include?(world) && ids.any?

    body = Rails.cache.fetch(["market", world, Digest::SHA1.hexdigest(ids.join(","))], expires_in: 10.minutes, skip_nil: true) do
      fetch_market(world, ids)
    end
    render body: body || "[]", content_type: "application/json"
  end

  private

  def fetch_market(world, ids)
    require "net/http"
    uri = URI("https://api.tibiamarket.top/market_values?server=#{URI.encode_www_form_component(world)}&item_ids=#{ids.join(",")}")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = 8
    http.read_timeout = 10
    req = Net::HTTP::Get.new(uri)
    req["User-Agent"] = "TIBIALY/1.0"
    resp = http.request(req)
    return nil unless resp.is_a?(Net::HTTPSuccess)
    JSON.parse(resp.body).is_a?(Array) ? resp.body : nil   # only ever pass a list through
  rescue => e
    Rails.logger.warn "market_prices proxy error: #{e}"
    nil
  end
end
