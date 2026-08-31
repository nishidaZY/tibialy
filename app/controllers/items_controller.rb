class ItemsController < ApplicationController
  def index
    @query = params[:q]
    @sort  = params[:sort] || "value"

    @items = Item.all
    @items = @items.search(@query) if @query.present?
    @items = @sort == "name" ? @items.order(:name) : @items.by_value
    @items = @items.page(params[:page]).per(50) if @items.respond_to?(:page)
    @items = @items.limit(200) unless @items.respond_to?(:page)
  end

  def show
    @item = Item.find_by!(slug: params[:id])
    @buy_prices = @item.buy_prices
    @sell_prices = @item.sell_prices
  end
end
