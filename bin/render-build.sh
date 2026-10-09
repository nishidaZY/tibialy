#!/usr/bin/env bash
# Render build: gems, compiled assets, and a fresh SQLite database seeded from db/seed/.
set -o errexit
bundle install
bin/rails assets:precompile
bin/rails assets:clean
bin/rails db:prepare   # creates the database, loads the schema and runs db/seeds.rb
