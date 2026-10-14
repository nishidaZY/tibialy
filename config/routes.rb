Rails.application.routes.draw do
  root "items#index"
  resources :items, only: [:index, :show] do
    collection do
      get :names
      get :market_prices
    end
  end

  get  "/loot",         to: "loot_analyzer#index",   as: :loot_analyzer
  get  "/stash",         to: "stash_analyzer#index",   as: :stash_analyzer
  get  "/stash/catalog", to: "stash_analyzer#catalog", as: :stash_catalog, defaults: { format: :json }
  get  "/damage",        to: "damage_calculator#index", as: :damage_calculator
  post "/loot/analyze", to: "loot_analyzer#analyze",  as: :analyze_loot

  get "up" => "rails/health#show", as: :rails_health_check
end
