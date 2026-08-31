Rails.application.routes.draw do
  root "items#index"
  resources :items, only: [:index, :show]

  get  "/loot",         to: "loot_analyzer#index",   as: :loot_analyzer
  post "/loot/analyze", to: "loot_analyzer#analyze",  as: :analyze_loot

  get "up" => "rails/health#show", as: :rails_health_check
end
