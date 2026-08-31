class NpcPrice < ApplicationRecord
  belongs_to :item

  validates :npc_name, presence: true
  validates :price, numericality: { greater_than_or_equal_to: 0 }
  validates :price_type, inclusion: { in: %w[buy sell] }

  scope :buy,  -> { where(price_type: "buy") }
  scope :sell, -> { where(price_type: "sell") }
end
