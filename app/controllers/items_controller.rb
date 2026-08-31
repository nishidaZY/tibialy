class ItemsController < ApplicationController
  PER_PAGE = 30

  def index
    @query = params[:q]
    @sort  = params[:sort] || "value"
    @page  = (params[:page] || 1).to_i.clamp(1, 99_999)

    base   = Item.all
    base   = base.search(@query) if @query.present?
    base   = @sort == "name" ? base.order(:name) : base.by_value

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
end
