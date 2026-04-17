const axios = require("axios");

const API_KEY = process.env.OPENWEATHER_API_KEY;

async function getWeather(city) {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city},IN&appid=${API_KEY}&units=metric`;
    const { data } = await axios.get(url);
    return {
      temperature: data.main.temp,
      humidity: data.main.humidity,
      rain: data.rain ? data.rain["1h"] || 0 : 0,
      condition: data.weather[0].main,
    };
  } catch {
    return { temperature: 30, humidity: 60, rain: 0, condition: "Clear" };
  }
}

module.exports = { getWeather };
