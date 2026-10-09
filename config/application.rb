require_relative "boot"
# Only the frameworks the site uses (no file uploads, inbound mail or rich text):
# less code loaded, less to configure and to keep patched.
require "rails"
require "active_model/railtie"
require "active_record/railtie"
require "action_controller/railtie"
require "action_view/railtie"
require "action_mailer/railtie"
require "action_cable/engine"
require "sprockets/railtie"
require "rails/test_unit/railtie"

Bundler.require(*Rails.groups)

module TibiaLootFinder
  class Application < Rails::Application
    config.load_defaults 7.2
    config.autoload_lib(ignore: %w[assets tasks])
    config.time_zone = "America/Sao_Paulo"
    config.i18n.default_locale = :en
  end
end
