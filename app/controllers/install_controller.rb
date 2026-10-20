# How to install the site as an app (Android, Mac): it is a PWA (public/manifest.webmanifest,
# public/sw.js), so the browser installs it; no store, no download.
class InstallController < ApplicationController
  def index; end
end
