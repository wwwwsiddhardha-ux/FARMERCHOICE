const axios = require("axios");

const API_KEY  = process.env.OPENWEATHER_API_KEY;
const CACHE    = new Map();
const TTL      = 5 * 60 * 1000; // 5 min

// ── Current weather ───────────────────────────────────────────────────────────
async function getWeather(city) {
  const key    = `cur:${city.toLowerCase()}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  try {
    const { data } = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},IN&appid=${API_KEY}&units=metric`,
      { timeout: 4000 }
    );
    const result = {
      temperature: parseFloat(data.main.temp.toFixed(1)),
      feelsLike:   parseFloat(data.main.feels_like.toFixed(1)),
      humidity:    data.main.humidity,
      rain:        parseFloat((data.rain?.["1h"] || data.rain?.["3h"] || 0).toFixed(1)),
      windSpeed:   parseFloat((data.wind?.speed || 0).toFixed(1)),
      condition:   data.weather[0].main,
      description: data.weather[0].description,
      icon:        data.weather[0].icon,
      city:        data.name,
    };
    CACHE.set(key, { data: result, ts: Date.now() });
    return result;
  } catch {
    return { temperature: 30, feelsLike: 32, humidity: 60, rain: 0, windSpeed: 10, condition: "Clear", description: "clear sky", icon: "01d", city };
  }
}

// ── 5-day / 3-hour forecast → daily aggregates ───────────────────────────────
async function getWeatherForecast(city) {
  const key    = `fct:${city.toLowerCase()}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  try {
    const { data } = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)},IN&appid=${API_KEY}&units=metric&cnt=40`,
      { timeout: 4000 }
    );

    // Group 3-hour slots by date → daily summary
    const byDay = {};
    for (const item of data.list) {
      const date = item.dt_txt.split(" ")[0];
      if (!byDay[date]) byDay[date] = { temps: [], rain: 0, conditions: [] };
      byDay[date].temps.push(item.main.temp);
      byDay[date].rain += item.rain?.["3h"] || 0;
      byDay[date].conditions.push(item.weather[0].main);
    }

    const result = Object.entries(byDay).slice(0, 7).map(([date, d]) => ({
      date,
      tempMax:   parseFloat(Math.max(...d.temps).toFixed(1)),
      tempMin:   parseFloat(Math.min(...d.temps).toFixed(1)),
      tempAvg:   parseFloat((d.temps.reduce((s, t) => s + t, 0) / d.temps.length).toFixed(1)),
      rain:      parseFloat(d.rain.toFixed(1)),
      condition: d.conditions[Math.floor(d.conditions.length / 2)], // midday condition
    }));

    CACHE.set(key, { data: result, ts: Date.now() });
    return result;
  } catch {
    // Return 7 days of safe defaults
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() + i);
      return { date: d.toISOString().split("T")[0], tempMax: 34, tempMin: 26, tempAvg: 30, rain: 0, condition: "Clear" };
    });
  }
}

module.exports = { getWeather, getWeatherForecast };
