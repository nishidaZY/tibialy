class CreateNpcPrices < ActiveRecord::Migration[7.2]
  def change
    create_table :npc_prices do |t|
      t.references :item, null: false, foreign_key: true
      t.string :npc_name, null: false
      t.string :npc_location
      t.integer :price, null: false, default: 0
      t.string :price_type, null: false, default: "buy"
      t.timestamps
    end
    add_index :npc_prices, [:item_id, :price_type]
  end
end
