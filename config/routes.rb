Rails.application.routes.draw do
  root "items#index"
  resources :items, only: [:index, :show]
  get "up" => "rails/health#show", as: :rails_health_check
end
