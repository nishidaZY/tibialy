ENV["BUNDLE_GEMFILE"] ||= File.expand_path("../Gemfile", __dir__)
require "bundler/setup"
require "bootsnap/setup" if File.exist?(File.expand_path("../Gemfile.lock", __dir__)) && Gem::Specification.find_all_by_name("bootsnap").any?
