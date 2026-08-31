# Seeds with real data + images from TibiaWiki
# Full dataset: run `rake tibia:import` (needs tibiawiki.com.br access)

puts "🗡️  Seeding TibiaLootFinder..."

WIKI_IMG = "https://www.tibiawiki.com.br/images"

items = [
  {
    name: "Dragon Scale Mail", weight: 114.00, item_type: "Armadura",
    image_url: "#{WIKI_IMG}/1/16/Dragon_Scale_Mail.gif",
    highest_npc_buy_price: 40_000,
    buy_prices: [
      { npc_name: "Rashid", npc_location: "Roteiro (viajante)", price: 40_000 },
      { npc_name: "H.L.",   npc_location: "Outlaw Camp",        price: 280 }
    ], sell_prices: []
  },
  {
    name: "Boots of Haste", weight: 7.50, item_type: "Botas",
    image_url: "#{WIKI_IMG}/1/1a/Boots_of_Haste.gif",
    highest_npc_buy_price: 30_000,
    buy_prices: [
      { npc_name: "Rashid", npc_location: "Roteiro (viajante)", price: 30_000 }
    ], sell_prices: []
  },
  {
    name: "Demon Shield", weight: 26.00, item_type: "Escudo",
    image_url: "#{WIKI_IMG}/4/4f/Demon_Shield.gif",
    highest_npc_buy_price: 30_000,
    buy_prices: [
      { npc_name: "Rashid", npc_location: "Roteiro (viajante)", price: 30_000 },
      { npc_name: "H.L.",   npc_location: "Outlaw Camp",        price: 130 }
    ], sell_prices: []
  },
  {
    name: "Vampire Shield", weight: 42.00, item_type: "Escudo",
    image_url: "#{WIKI_IMG}/5/59/Vampire_Shield.gif",
    highest_npc_buy_price: 25_000,
    buy_prices: [
      { npc_name: "Rashid", npc_location: "Roteiro (viajante)", price: 25_000 }
    ], sell_prices: []
  },
  {
    name: "Golden Armor", weight: 80.00, item_type: "Armadura",
    image_url: "#{WIKI_IMG}/d/d0/Golden_Armor.gif",
    highest_npc_buy_price: 20_000,
    buy_prices: [
      { npc_name: "Rashid", npc_location: "Roteiro (viajante)", price: 20_000 },
      { npc_name: "Shanar", npc_location: "Ab'Dendriel",        price: 1_500 },
      { npc_name: "H.L.",   npc_location: "Outlaw Camp",        price: 580 }
    ], sell_prices: []
  },
  {
    name: "Magic Sword", weight: 42.00, item_type: "Arma de Ataque (Espada)",
    image_url: "#{WIKI_IMG}/f/fd/Magic_Sword.gif",
    highest_npc_buy_price: 14_000,
    buy_prices: [
      { npc_name: "Rashid", npc_location: "Roteiro (viajante)", price: 14_000 }
    ], sell_prices: []
  },
  {
    name: "Thunder Hammer", weight: 78.00, item_type: "Arma de Ataque (Clava)",
    image_url: "#{WIKI_IMG}/e/e1/Thunder_Hammer.gif",
    highest_npc_buy_price: 12_000,
    buy_prices: [
      { npc_name: "Rashid", npc_location: "Roteiro (viajante)", price: 12_000 }
    ], sell_prices: []
  },
  {
    name: "Medusa Shield", weight: 58.00, item_type: "Escudo",
    image_url: "#{WIKI_IMG}/f/fe/Medusa_Shield.gif",
    highest_npc_buy_price: 9_000,
    buy_prices: [
      { npc_name: "Rashid", npc_location: "Roteiro (viajante)", price: 9_000 }
    ], sell_prices: []
  },
  {
    name: "Fire Axe", weight: 40.00, item_type: "Arma de Ataque (Machado)",
    image_url: "#{WIKI_IMG}/3/31/Fire_Axe.gif",
    highest_npc_buy_price: 8_000,
    buy_prices: [
      { npc_name: "Nah'Bob", npc_location: "Ashta'daramai", price: 8_000 },
      { npc_name: "H.L.",    npc_location: "Outlaw Camp",   price: 280 }
    ], sell_prices: []
  },
  {
    name: "Knight Armor", weight: 120.00, item_type: "Armadura",
    image_url: "#{WIKI_IMG}/8/8e/Knight_Armor.gif",
    highest_npc_buy_price: 5_000,
    buy_prices: [
      { npc_name: "Alesar", npc_location: "Mal'ouquah",  price: 5_000 },
      { npc_name: "Shanar", npc_location: "Ab'Dendriel",  price: 875 },
      { npc_name: "H.L.",   npc_location: "Outlaw Camp",  price: 140 }
    ], sell_prices: []
  },
  {
    name: "Guardian Shield", weight: 62.00, item_type: "Escudo",
    image_url: "#{WIKI_IMG}/4/4e/Guardian_Shield.gif",
    highest_npc_buy_price: 1_800,
    buy_prices: [
      { npc_name: "H.L.",   npc_location: "Outlaw Camp",  price: 1_800 },
      { npc_name: "Alesar", npc_location: "Mal'ouquah",   price: 1_800 }
    ],
    sell_prices: [
      { npc_name: "Alesar", npc_location: "Mal'ouquah",   price: 2_000 }
    ]
  },
  {
    name: "Dragon Hammer", weight: 55.00, item_type: "Arma de Ataque (Clava)",
    image_url: "#{WIKI_IMG}/1/1f/Dragon_Hammer.gif",
    highest_npc_buy_price: 1_000,
    buy_prices: [
      { npc_name: "H.L.", npc_location: "Outlaw Camp", price: 1_000 }
    ], sell_prices: []
  },
  {
    name: "Platinum Amulet", weight: 6.00, item_type: "Amuleto",
    image_url: "#{WIKI_IMG}/4/42/Platinum_Amulet.gif",
    highest_npc_buy_price: 2_500,
    buy_prices: [
      { npc_name: "Rashid", npc_location: "Roteiro (viajante)", price: 2_500 }
    ], sell_prices: []
  },
  {
    name: "War Hammer", weight: 65.00, item_type: "Arma de Ataque (Clava)",
    image_url: "#{WIKI_IMG}/2/25/War_Hammer.gif",
    highest_npc_buy_price: 770,
    buy_prices: [
      { npc_name: "H.L.",  npc_location: "Outlaw Camp", price: 770 },
      { npc_name: "Kroox", npc_location: "Kazordoon",   price: 770 }
    ],
    sell_prices: [
      { npc_name: "Kroox",   npc_location: "Kazordoon",  price: 900 },
      { npc_name: "Brengus", npc_location: "Port Hope",  price: 900 }
    ]
  },
  {
    name: "Serpent Sword", weight: 37.00, item_type: "Arma de Ataque (Espada)",
    image_url: "#{WIKI_IMG}/7/79/Serpent_Sword.gif",
    highest_npc_buy_price: 900,
    buy_prices: [
      { npc_name: "Rashid", npc_location: "Roteiro (viajante)", price: 900 },
      { npc_name: "H.L.",   npc_location: "Outlaw Camp",        price: 900 }
    ], sell_prices: []
  },
  {
    name: "Crystal Necklace", weight: 7.00, item_type: "Colar",
    image_url: "#{WIKI_IMG}/3/3e/Crystal_Necklace.gif",
    highest_npc_buy_price: 100,
    buy_prices: [
      { npc_name: "Rashid", npc_location: "Roteiro (viajante)", price: 100 }
    ], sell_prices: []
  },
  {
    name: "Amulet of Loss", weight: 5.50, item_type: "Amuleto",
    image_url: "#{WIKI_IMG}/1/13/Amulet_of_Loss.gif",
    highest_npc_buy_price: 0,
    buy_prices: [],
    sell_prices: [
      { npc_name: "Haroun", npc_location: "Ankrahmun", price: 30_000 },
      { npc_name: "Yaman",  npc_location: "Ankrahmun", price: 30_000 }
    ]
  },
  {
    name: "Scale Armor", weight: 95.00, item_type: "Armadura",
    image_url: "#{WIKI_IMG}/8/84/Scale_Armor.gif",
    highest_npc_buy_price: 150,
    buy_prices: [
      { npc_name: "H.L.", npc_location: "Outlaw Camp", price: 150 }
    ],
    sell_prices: [
      { npc_name: "Norma",  npc_location: "Thais",      price: 170 },
      { npc_name: "Alesar", npc_location: "Mal'ouquah", price: 170 }
    ]
  },
  {
    name: "Mana Potion", weight: 2.00, item_type: "Poção",
    image_url: nil,
    highest_npc_buy_price: 50,
    buy_prices: [{ npc_name: "Shops", npc_location: "Várias cidades", price: 50 }],
    sell_prices: [{ npc_name: "Shops", npc_location: "Várias cidades", price: 56 }]
  },
  {
    name: "Strong Mana Potion", weight: 2.30, item_type: "Poção",
    image_url: nil,
    highest_npc_buy_price: 115,
    buy_prices: [{ npc_name: "Shops", npc_location: "Várias cidades", price: 115 }],
    sell_prices: [{ npc_name: "Shops", npc_location: "Várias cidades", price: 125 }]
  }
]

items.each do |data|
  item = Item.find_or_initialize_by(name: data[:name])
  item.weight                = data[:weight]
  item.item_type             = data[:item_type]
  item.image_url             = data[:image_url]
  item.highest_npc_buy_price = data[:highest_npc_buy_price]
  item.save!

  item.npc_prices.delete_all
  data[:buy_prices].each  { |p| item.npc_prices.create!(p.merge(price_type: "buy")) }
  data[:sell_prices].each { |p| item.npc_prices.create!(p.merge(price_type: "sell")) }

  puts "  ✓ #{item.name}"
end

puts "\n✅ Seeded #{items.size} items. Run `rake tibia:import` for all ~7000."
