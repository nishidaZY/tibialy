require_relative "boot"
require "rails/all"

Bundler.require(*Rails.groups)

module TibiaLootFinder
  class Application < Rails::Application
    config.load_defaults 7.2
    config.autoload_lib(ignore: %w[assets tasks])
    config.time_zone = "America/Sao_Paulo"
    config.i18n.default_locale = :pt
  end
end
