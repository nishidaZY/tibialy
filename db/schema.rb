# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[7.2].define(version: 2024_01_01_000004) do
  create_table "items", force: :cascade do |t|
    t.string "name", null: false
    t.string "slug", null: false
    t.decimal "weight", precision: 8, scale: 2
    t.string "item_type"
    t.string "image_url"
    t.integer "highest_npc_buy_price", default: 0
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "market_item_id"
    t.integer "avg_market_price"
    t.datetime "market_price_updated_at"
    t.index ["avg_market_price"], name: "index_items_on_avg_market_price"
    t.index ["highest_npc_buy_price"], name: "index_items_on_highest_npc_buy_price"
    t.index ["market_item_id"], name: "index_items_on_market_item_id"
    t.index ["name"], name: "index_items_on_name"
    t.index ["slug"], name: "index_items_on_slug", unique: true
  end

  create_table "npc_prices", force: :cascade do |t|
    t.integer "item_id", null: false
    t.string "npc_name", null: false
    t.string "npc_location"
    t.integer "price", default: 0, null: false
    t.string "price_type", default: "buy", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["item_id", "price_type"], name: "index_npc_prices_on_item_id_and_price_type"
    t.index ["item_id"], name: "index_npc_prices_on_item_id"
  end

  add_foreign_key "npc_prices", "items"
end
