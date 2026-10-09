# Content Security Policy: the browser only runs scripts, loads styles/fonts/images and connects
# to the origins below. Inline <script>/style are still needed by the existing pages (Tailwind
# CDN, inline handlers), so 'unsafe-inline' stays for those two; everything else is locked down
# (no plugins, no framing by other sites, forms only post back here).
Rails.application.configure do
  config.content_security_policy do |policy|
    policy.default_src :self
    policy.script_src  :self, :unsafe_inline, "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"
    policy.style_src   :self, :unsafe_inline, "https://fonts.googleapis.com"
    policy.font_src    :self, "https://fonts.gstatic.com"
    policy.img_src     :self, :data, :blob, "https://www.tibiawiki.com.br", "https://tibiawiki.com.br"
    policy.connect_src :self, "https://api.tibiadata.com"
    policy.object_src  :none
    policy.base_uri    :self
    policy.form_action :self
    policy.frame_ancestors :none
  end
end
