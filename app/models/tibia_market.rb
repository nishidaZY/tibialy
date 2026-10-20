# api.tibiamarket.top: Market prices per world, uploaded by players (so a world's data can be weeks
# old; every row has `time`). The API answers one call per 5 s per address: every call goes through
# here, one at a time, 5 s apart.
module TibiaMarket
  LOCK = Mutex.new
  @last_call = Time.at(0)

  # parsed JSON of GET /<path>, or nil (timeout, rate limit, anything else)
  def self.get(path, timeout: 10, retries: 1)
    require "net/http"
    data = LOCK.synchronize do
      wait = 5.1 - (Time.current - @last_call)
      sleep(wait) if wait.positive?
      @last_call = Time.current
      uri = URI("https://api.tibiamarket.top/#{path}")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 8
      http.read_timeout = timeout
      req = Net::HTTP::Get.new(uri)
      req["User-Agent"] = "TIBIALY/1.0"
      resp = http.request(req)
      resp.is_a?(Net::HTTPSuccess) || resp.code == "429" ? JSON.parse(resp.body) : nil
    end
    # another caller (the daily price sync) took the 5 s slot: wait for the next one
    return get(path, timeout: timeout, retries: retries - 1) if data.is_a?(Hash) && data["error"].to_s.match?(/rate limit/i) && retries.positive?
    data
  rescue => e
    Rails.logger.warn "tibiamarket #{path[0, 40]}: #{e}"
    nil
  end

  # every world the API knows (refreshed daily), with the ones listed in the code as a floor
  KNOWN = %w[
    Antica Belobra Bona Calmera Celesta Collabra Descubra Dia Escura Esmera
    Ferobra Firmera Gladera Harmonia Honbra Inabra Jaguna Kalimera Lobera
    Luminera Maligna Monza Mystera Nefera Nevia Oceanis Pacera Peloria
    Premia Quelibra Refugia Runera Secura Serdebra Solidera Talera Thyria
    Ustebra Venebra Victoris Vunira Wildera Wintera Xyla Yara Yonabra
    Zuna Zunera
  ].freeze
  @worlds = nil
  @worlds_at = Time.at(0)
  @refreshing = false

  # never makes a page wait: the list is refreshed in the background
  def self.worlds
    if (@worlds_at < 1.day.ago) && !@refreshing
      @refreshing = true
      Thread.new do
        list = get("world_data")
        names = list.is_a?(Array) ? list.filter_map { |w| w["name"] if w["name"].to_s.match?(/\A[A-Z][a-z]{2,15}\z/) } : []
        @worlds = (KNOWN + names).uniq.sort.freeze
        @worlds_at = names.any? ? Time.current : 23.hours.ago   # failed: try again within the hour
      ensure
        @refreshing = false
      end
    end
    @worlds || KNOWN
  end
end
