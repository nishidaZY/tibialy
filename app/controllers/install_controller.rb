# Getting TIBIALY as an app: downloads for Windows and Mac (the desktop/ app, which opens the site in
# its own window) and, for Android or without a download, installing the site from the browser (it
# is a PWA: public/manifest.webmanifest, public/sw.js).
# DOWNLOADS_URL: where the installers are, e.g. a GitHub release's .../releases/latest/download
class InstallController < ApplicationController
  FILES = { "windows" => "TIBIALY-windows-setup.exe", "mac" => "TIBIALY-mac.dmg" }.freeze

  def index
    @downloads = ENV["DOWNLOADS_URL"].present?
  end

  def download
    file = FILES[params[:os]]
    return redirect_to(install_path) unless file && ENV["DOWNLOADS_URL"].present?
    redirect_to "#{ENV["DOWNLOADS_URL"].chomp("/")}/#{file}", allow_other_host: true
  end
end
