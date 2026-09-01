class ItemsController < ApplicationController
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

  def market_prices
    require 'net/http'
    world    = (params[:world] || params[:server]).to_s.strip
    item_ids = params[:item_ids].to_s.gsub(/[^0-9,]/, '').strip
    return render json: [] if world.blank? || item_ids.blank?

    uri = URI("https://api.tibiamarket.top/market_values?server=#{URI.encode_www_form_component(world)}&item_ids=#{item_ids}")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = 8
    http.read_timeout = 10
    req = Net::HTTP::Get.new(uri)
    req['User-Agent'] = 'TibiaLootFinder/1.0'
    resp = http.request(req)
    render body: resp.body, content_type: 'application/json'
  rescue => e
    Rails.logger.warn "market_prices proxy error: #{e}"
    render json: []
  end
end
