require "active_support/core_ext/integer/time"

Rails.application.configure do
  config.enable_reloading = false
  config.eager_load = true
  config.consider_all_requests_local = false
  # Render terminates HTTPS in front of the app: trust it, and redirect any http:// to https://
  config.assume_ssl = true
  config.force_ssl = true
  config.ssl_options = { hsts: { expires: 1.year, subdomains: true } }

  # Only answer for the site's own host name (set by Render, or SITE_HOST for a custom domain)
  config.hosts += [ENV["RENDER_EXTERNAL_HOSTNAME"], ENV["SITE_HOST"]].compact
  config.host_authorization = { exclude: ->(request) { request.path == "/up" } }

  config.logger = ActiveSupport::TaggedLogging.new(ActiveSupport::Logger.new($stdout))
  # Single small instance: catalog, market prices and rate limits live in memory
  config.cache_store = :memory_store, { size: 32.megabytes }
  # Long-lived caching for the static files (the stash sprite atlas is 3.5 MB)
  config.public_file_server.headers = { "cache-control" => "public, max-age=#{1.week.to_i}" }
  config.log_level = :info
  config.log_tags = [:request_id]
  config.action_mailer.perform_caching = false
  config.i18n.fallbacks = true
  config.active_support.report_deprecations = false
  config.active_record.dump_schema_after_migration = false
end
