class CreateItems < ActiveRecord::Migration[7.2]
  def change
    create_table :items do |t|
      t.string :name, null: false
      t.string :slug, null: false
      t.decimal :weight, precision: 8, scale: 2
      t.string :item_type
      t.string :image_url
      t.integer :highest_npc_buy_price, default: 0
      t.timestamps
    end
    add_index :items, :slug, unique: true
    add_index :items, :name
    add_index :items, :highest_npc_buy_price
  end
end
