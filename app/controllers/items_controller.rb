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

  # Proxy to api.tibiamarket.top (avoids CORS). Only known servers and at most 300 numeric ids.
  # The API allows one call per 5 s per address, so answers are cached 10 minutes per world + id
  # set, calls are spaced 5 s apart, and when a call fails the last good answer (up to 7 days old)
  # is served instead of nothing. Each row keeps the API's `time`: when that world's Market was last
  # scanned (the data is uploaded by players, so a world can be weeks old); the pages show it.
  def market_prices
    world = (params[:world] || params[:server]).to_s.strip
    ids   = params[:item_ids].to_s.split(",").filter_map { |i| Integer(i, exception: false) }.uniq.first(300).sort
    return render json: [] unless TibiaMarket.worlds.include?(world) && ids.any?

    key  = ["market", world, Digest::SHA1.hexdigest(ids.join(","))]
    body = Rails.cache.read(key) || MARKET_LAST[key.join(":")]&.then { |b, at| b if at > 7.days.ago }
    unless Rails.cache.exist?(key)
      fresh = fetch_market(world, ids)
      if fresh
        Rails.cache.write(key, fresh, expires_in: 10.minutes)
        MARKET_LAST[key.join(":")] = [fresh, Time.current]
        MARKET_LAST.shift while MARKET_LAST.size > 500
        body = fresh
      end
    end
    render body: body || "[]", content_type: "application/json"
  end

  private

  MARKET_LAST = {}            # last good answer per world + ids (served when the API fails)

  # limit: the API returns only 100 rows unless asked for more
  def fetch_market(world, ids)
    data = TibiaMarket.get("market_values?server=#{URI.encode_www_form_component(world)}&limit=1000&item_ids=#{ids.join(",")}")
    data.is_a?(Array) ? data.to_json : nil   # only ever pass a list through (not a rate-limit error)
  end
end
