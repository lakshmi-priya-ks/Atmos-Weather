import { useEffect, useState } from "react";
import {
  Search,
  MapPin,
  Wind,
  Droplets,
  Gauge,
  Sunrise,
  Sunset,
  Cloud,
  Sun,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudDrizzle,
  CloudFog,
  LoaderCircle,
  Navigation,
  CalendarDays,
  Thermometer,
  X,
} from "lucide-react";

import "./App.css";

const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const PHOTON_URL = "https://photon.komoot.io/api/";

function getWeather(code) {
  if (code === 0) return { label: "Clear Sky", Icon: Sun };
  if (code <= 2) return { label: "Partly Cloudy", Icon: Cloud };
  if (code === 3) return { label: "Overcast", Icon: Cloud };
  if (code <= 48) return { label: "Foggy", Icon: CloudFog };
  if (code <= 57) return { label: "Drizzle", Icon: CloudDrizzle };
  if (code <= 67) return { label: "Rainy", Icon: CloudRain };
  if (code <= 77) return { label: "Snowfall", Icon: CloudSnow };
  if (code <= 82) return { label: "Rain Showers", Icon: CloudRain };
  if (code <= 86) return { label: "Snow Showers", Icon: CloudSnow };
  if (code >= 95) return { label: "Thunderstorm", Icon: CloudLightning };

  return { label: "Cloudy", Icon: Cloud };
}

function formatTime(value) {
  if (!value) return "--:--";

  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// Find a location using Open-Meteo first.
async function searchOpenMeteo(name) {
  const response = await fetch(
    `${GEO_URL}?name=${encodeURIComponent(name)}&count=10&language=en&format=json`
  );

  if (!response.ok) {
    throw new Error("Location search failed.");
  }

  const result = await response.json();

  if (!result.results?.length) {
    return null;
  }

  // Prefer an exact name match.
  const exactMatch = result.results.find(
    (place) => place.name?.toLowerCase() === name.toLowerCase()
  );

  return exactMatch || result.results[0];
}

// Fallback search using OpenStreetMap data through Photon.
// This can help find smaller towns and localities.
async function searchPhoton(name) {
  const response = await fetch(
    `${PHOTON_URL}?q=${encodeURIComponent(name)}&limit=10&lang=en`
  );

  if (!response.ok) {
    throw new Error("Alternative location search failed.");
  }

  const result = await response.json();

  const features = result.features || [];

  if (features.length === 0) {
    return null;
  }

  // Prefer an exact location-name match.
  const exactMatch = features.find((item) => {
    const properties = item.properties;

    return (
      properties.name?.toLowerCase() === name.toLowerCase() ||
      properties.city?.toLowerCase() === name.toLowerCase()
    );
  });

  // If there is no exact match, use the first available result.
  const match = exactMatch || features[0];

  const properties = match.properties;
  const [longitude, latitude] = match.geometry.coordinates;

  return {
    name:
      properties.name ||
      properties.city ||
      properties.locality ||
      name,

    admin1:
      properties.state ||
      properties.county ||
      properties.district ||
      "",

    country: properties.country || "",

    latitude,
    longitude,
  };
}

function App() {
  const [city, setCity] = useState("Kozhikode");
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState(null);
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unit, setUnit] = useState("C");

  const [recent, setRecent] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("atmos-recent")) || [];
    } catch {
      return [];
    }
  });

  const temperature = (value) =>
    Math.round(unit === "C" ? value : (value * 9) / 5 + 32);

  const speed = (value) => Math.round(value * 10) / 10;

  // Fetch weather information using coordinates.
  async function getWeatherData(latitude, longitude, place) {
    const params = new URLSearchParams({
      latitude,
      longitude,
      current:
        "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,surface_pressure",
      hourly:
        "temperature_2m,precipitation_probability,weather_code",
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max",
      timezone: "auto",
      forecast_days: "5",
    });

    const response = await fetch(`${WEATHER_URL}?${params}`);

    if (!response.ok) {
      throw new Error("Unable to retrieve weather information.");
    }

    const data = await response.json();

    if (!data.current || !data.daily || !data.hourly) {
      throw new Error("Weather information is incomplete.");
    }

    setLocation(place);
    setWeather(data);
    setCity(place.name);

    const updated = [
      place.name,
      ...recent.filter(
        (item) => item.toLowerCase() !== place.name.toLowerCase()
      ),
    ].slice(0, 5);

    setRecent(updated);
    localStorage.setItem("atmos-recent", JSON.stringify(updated));
  }

  // Search for a city or locality.
  async function searchCity(cityName) {
    const name = cityName.trim();

    if (!name) {
      setError("Please enter a city name.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      let place = null;

      // First attempt: Open-Meteo geocoding.
      try {
        place = await searchOpenMeteo(name);
      } catch (err) {
        console.warn("Open-Meteo search failed:", err);
      }

      // Second attempt: Photon / OpenStreetMap.
      // Used when Open-Meteo cannot find the location.
      if (!place) {
        try {
          place = await searchPhoton(name);
        } catch (err) {
          console.warn("Photon search failed:", err);
        }
      }

      if (!place) {
        throw new Error(
          "Location not found. Check the spelling or try adding the district or state name."
        );
      }

      await getWeatherData(
        place.latitude,
        place.longitude,
        place
      );

      setSearch("");
    } catch (err) {
      setError(
        err.message || "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // Detect the user's current location and identify its place name.
  async function getCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Location detection is not supported by your browser.");
      return;
    }

    setLoading(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;

          // Reverse geocoding: convert GPS coordinates into a place name.
          const response = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );

          if (!response.ok) {
            throw new Error("Unable to identify your current location.");
          }

          const result = await response.json();

          const placeName =
            result.city ||
            result.locality ||
            result.localityName ||
            result.principalSubdivision ||
            "Nearby Location";

          const place = {
            name: placeName,

            admin1:
              result.principalSubdivision || "",

            country:
              result.countryName || "",

            latitude,
            longitude,
          };

          await getWeatherData(
            latitude,
            longitude,
            place
          );

        } catch (err) {
          setError(
            err.message || "Unable to fetch your local weather."
          );
        } finally {
          setLoading(false);
        }
      },

      (geoError) => {
        if (geoError.code === 1) {
          setError(
            "Location permission denied. Allow location access in your browser settings and try again."
          );
        } else if (geoError.code === 2) {
          setError(
            "Your location is currently unavailable. Please try again."
          );
        } else {
          setError(
            "Location request timed out. Please try again."
          );
        }

        setLoading(false);
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  // Load default weather when the application opens.
  useEffect(() => {
    searchCity("Kozhikode");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = weather?.current;
  const daily = weather?.daily;
  const hourly = weather?.hourly;

  const currentWeather = current
    ? getWeather(current.weather_code)
    : { label: "Loading", Icon: Cloud };

  const MainIcon = currentWeather.Icon;

  const hourlyForecast = hourly
    ? hourly.time
        .map((time, index) => ({
          time,
          temp: hourly.temperature_2m[index],
          code: hourly.weather_code[index],
          rain: hourly.precipitation_probability[index],
          index,
        }))
        .filter((item) => {
          return item.time >= current.time;
        })
        .slice(0, 8)
    : [];

  const greeting = () => {
    const hour = new Date().getHours();

    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="app-shell">

      <header className="topbar">
        <a href="#" className="brand">
          <span className="brand-icon">
            <Sun size={23} />
          </span>

          <span>
            atmos<span className="brand-dot">.</span>
          </span>
        </a>

        <div className="header-right">
          <span className="live-status">
            <span className="status-dot"></span>
            LIVE WEATHER
          </span>

          <button
            className="location-button"
            onClick={getCurrentLocation}
            disabled={loading}
          >
            <Navigation size={15} />
            <span>My Location</span>
          </button>
        </div>
      </header>

      <main className="dashboard">

        <section className="welcome-section">
          <div>
            <p className="eyebrow">{greeting()}</p>

            <h1>Weather, at a glance.</h1>

            <p className="welcome-subtitle">
              A little clarity about the day ahead.
            </p>
          </div>

          <div className="date-display">
            <CalendarDays size={17} />

            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
        </section>

        <section className="search-section">
          <form
            className="search-form"
            onSubmit={(e) => {
              e.preventDefault();
              searchCity(search);
            }}
          >
            <Search size={19} />

            <input
              type="text"
              placeholder="Search for a city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {search && (
              <button
                type="button"
                className="clear-button"
                onClick={() => setSearch("")}
              >
                <X size={17} />
              </button>
            )}

            <button
              type="submit"
              className="search-button"
              disabled={loading}
            >
              Search
            </button>
          </form>

          {recent.length > 0 && (
            <div className="recent-searches">
              <span>RECENT</span>

              {recent.map((item) => (
                <button
                  key={item}
                  onClick={() => searchCity(item)}
                  disabled={loading}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </section>

        {error && (
          <div className="error-message">
            <span>{error}</span>

            <button onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}

        {loading && (
          <div className="loading-overlay">
            <LoaderCircle className="spinner" size={24} />
            <span>Fetching weather information...</span>
          </div>
        )}

        {weather && current && daily && hourly && (
          <>

            <section className="main-grid">

              <div className="current-card">
                <div className="card-top">
                  <div>
                    <span className="section-label">
                      CURRENT WEATHER
                    </span>

                    <h2>
                      <MapPin size={17} />
                      {location?.name}
                    </h2>

                    <p className="location-subtitle">
                      {[location?.admin1, location?.country]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>

                  <div className="unit-toggle">
                    <button
                      className={unit === "C" ? "active" : ""}
                      onClick={() => setUnit("C")}
                    >
                      °C
                    </button>

                    <button
                      className={unit === "F" ? "active" : ""}
                      onClick={() => setUnit("F")}
                    >
                      °F
                    </button>
                  </div>
                </div>

                <div className="temperature-area">
                  <div>
                    <div className="temperature">
                      {temperature(current.temperature_2m)}
                      <span>°{unit}</span>
                    </div>

                    <p className="weather-description">
                      {currentWeather.label}
                    </p>

                    <p className="feels-like">
                      Feels like{" "}
                      {temperature(current.apparent_temperature)}°
                      {unit}
                    </p>
                  </div>

                  <div className="main-weather-icon">
                    <MainIcon size={105} strokeWidth={1.1} />
                  </div>
                </div>

                <div className="current-card-footer">
                  <span>
                    <Thermometer size={16} />
                    {current.is_day ? "Daytime" : "Night"}
                  </span>

                  <span>
                    <Droplets size={16} />
                    {current.precipitation} mm precipitation
                  </span>
                </div>
              </div>

              <div className="details-card">
                <div className="card-heading">
                  <div>
                    <span className="section-label">
                      WEATHER DETAILS
                    </span>

                    <h3>Atmospheric conditions</h3>
                  </div>
                </div>

                <div className="details-grid">

                  <Detail
                    icon={<Droplets />}
                    label="Humidity"
                    value={`${current.relative_humidity_2m}%`}
                  />

                  <Detail
                    icon={<Wind />}
                    label="Wind Speed"
                    value={`${speed(current.wind_speed_10m)} km/h`}
                  />

                  <Detail
                    icon={<Gauge />}
                    label="Pressure"
                    value={`${Math.round(current.surface_pressure)} hPa`}
                  />

                  <Detail
                    icon={<Thermometer />}
                    label="Feels Like"
                    value={`${temperature(current.apparent_temperature)}°${unit}`}
                  />

                </div>
              </div>

            </section>

            <section className="forecast-card">
              <div className="section-header">
                <div>
                  <span className="section-label">
                    THE NEXT FEW HOURS
                  </span>

                  <h3>Today's outlook</h3>
                </div>

                <span className="forecast-note">
                  Hourly forecast
                </span>
              </div>

              <div className="hourly-list">
                {hourlyForecast.map((item) => {
                  const { Icon } = getWeather(item.code);

                  return (
                    <div className="hour-item" key={item.time}>
                      <span className="hour-time">
                        {formatTime(item.time)}
                      </span>

                      <Icon size={24} strokeWidth={1.6} />

                      <strong>
                        {temperature(item.temp)}°
                      </strong>

                      <span className="hour-rain">
                        <Droplets size={12} />
                        {item.rain ?? 0}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="forecast-card five-day-card">
              <div className="section-header">
                <div>
                  <span className="section-label">
                    PLAN AHEAD
                  </span>

                  <h3>5-day forecast</h3>
                </div>

                <span className="forecast-note">
                  Upcoming weather
                </span>
              </div>

              <div className="daily-list">
                {daily.time.map((date, index) => {
                  const { Icon, label } = getWeather(
                    daily.weather_code[index]
                  );

                  return (
                    <div className="daily-item" key={date}>
                      <div className="daily-date">
                        <strong>
                          {index === 0
                            ? "Today"
                            : new Date(
                                date + "T12:00:00"
                              ).toLocaleDateString("en-IN", {
                                weekday: "long",
                              })}
                        </strong>

                        <span>
                          {new Date(
                            date + "T12:00:00"
                          ).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </div>

                      <div className="daily-condition">
                        <Icon size={25} strokeWidth={1.5} />
                        <span>{label}</span>
                      </div>

                      <div className="daily-rain">
                        <Droplets size={14} />
                        {daily.precipitation_probability_max[index] ?? 0}%
                      </div>

                      <div className="daily-temperatures">
                        <strong>
                          {temperature(
                            daily.temperature_2m_max[index]
                          )}°
                        </strong>

                        <span>
                          {temperature(
                            daily.temperature_2m_min[index]
                          )}°
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="sun-card">
              <div className="sun-info">
                <div className="sun-icon sunrise-icon">
                  <Sunrise size={24} />
                </div>

                <div>
                  <span>SUNRISE</span>
                  <strong>{formatTime(daily.sunrise[0])}</strong>
                </div>
              </div>

              <div className="sun-visual">
                <div className="sun-line">
                  <span className="sun-circle"></span>
                </div>

                <span>Daylight</span>
              </div>

              <div className="sun-info">
                <div className="sun-icon sunset-icon">
                  <Sunset size={24} />
                </div>

                <div>
                  <span>SUNSET</span>
                  <strong>{formatTime(daily.sunset[0])}</strong>
                </div>
              </div>
            </section>

          </>
        )}

        {!weather && !loading && !error && (
          <div className="empty-state">
            <Cloud size={45} />
            <h3>Search for a city</h3>
            <p>Find weather conditions anywhere in the world.</p>
          </div>
        )}

        <footer className="footer">
          <div className="footer-brand">
            <Sun size={17} />
            atmos.
          </div>

          <span>
            Weather data provided by Open-Meteo
          </span>

          <span>Designed with clarity.</span>
        </footer>

      </main>
    </div>
  );
}

function Detail({ icon, label, value }) {
  return (
    <div className="detail-item">
      <div className="detail-icon">{icon}</div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

export default App;