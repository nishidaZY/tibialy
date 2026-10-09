# Extra response headers on top of Rails' defaults (X-Frame-Options, X-Content-Type-Options,
# Referrer-Policy): no camera/microphone/geolocation for any page.
Rails.application.config.action_dispatch.default_headers.merge!(
  "Permissions-Policy" => "camera=(), microphone=(), geolocation=(), payment=()"
)
