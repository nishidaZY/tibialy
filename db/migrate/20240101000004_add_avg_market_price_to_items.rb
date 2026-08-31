class AddAvgMarketPriceToItems < ActiveRecord::Migration[7.2]
  def change
    add_column :items, :avg_market_price, :integer
    add_column :items, :market_price_updated_at, :datetime
    add_index  :items, :avg_market_price
  end
end
