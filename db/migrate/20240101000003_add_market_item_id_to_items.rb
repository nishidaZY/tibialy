class AddMarketItemIdToItems < ActiveRecord::Migration[7.2]
  def change
    add_column :items, :market_item_id, :integer
    add_index :items, :market_item_id
  end
end
