class Item < ApplicationRecord
  has_many :npc_prices, dependent: :destroy
  has_many :buy_prices, -> { where(price_type: "buy").order(price: :desc) }, class_name: "NpcPrice"
  has_many :sell_prices, -> { where(price_type: "sell").order(price: :asc) }, class_name: "NpcPrice"

  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true

  before_validation :set_slug

  scope :with_npc_price, -> { where("highest_npc_buy_price > 0") }
  scope :search, ->(q) { where("name LIKE ?", "%#{q}%") if q.present? }
  scope :by_value, -> { order(highest_npc_buy_price: :desc) }

  def best_buyer
    buy_prices.first
  end

  def wiki_url
    "https://www.tibiawiki.com.br/wiki/#{URI.encode_www_form_component(name.gsub(" ", "_"))}"
  end

  private

  def set_slug
    self.slug = name.to_s.downcase.gsub(/[^a-z0-9]+/, "-").gsub(/^-|-$/, "") if name.present?
  end
end
