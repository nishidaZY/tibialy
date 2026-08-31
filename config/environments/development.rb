require "active_support/core_ext/integer/time"

Rails.application.configure do
  config.enable_reloading = true
  config.eager_load = false
  config.consider_all_requests_local = true
  config.server_timing = true

  config.action_controller.perform_caching = false
  config.action_controller.enable_fragment_cache_logging = true
  config.cache_store = :null_store

  config.action_mailer.raise_delivery_errors = false
  config.action_mailer.perform_caching = false

  config.active_support.deprecation = :log
  config.active_record.migration_error = :page_load
  config.active_record.verbose_query_logs = true

  config.assets.debug = true
  config.assets.quiet = true
end
