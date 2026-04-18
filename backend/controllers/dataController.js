const { getWeather } = require("../services/weatherService");
const { getNews }    = require("../services/newsService");
const pool = require("../config/db");

async function weather(req, res) {
  const { district } = req.query;
  if (!district) return res.status(400).json({ error: "district query param required" });
  res.json(await getWeather(district));
}

async function news(req, res) {
  const { district } = req.query;
  if (!district) return res.status(400).json({ error: "district query param required" });
  res.json({ news: await getNews(district) });
}

async function marketData(req, res) {
  const { crop, district, days = 30 } = req.query;
  try {
    const conditions = ["date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)"];
    const params = [parseInt(days)];
    if (crop)     { conditions.push("crop = ?");     params.push(crop); }
    if (district) { conditions.push("district = ?"); params.push(district); }

    const [rows] = await pool.execute(
      `SELECT crop, state, district, min_price, max_price, modal_price AS price, date
       FROM market_data WHERE ${conditions.join(" AND ")} ORDER BY date DESC LIMIT 200`,
      params
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch market data" });
  }
}

async function alerts(req, res) {
  const { district } = req.query;
  const [w, newsItems] = await Promise.all([
    getWeather(district || "Hyderabad"),
    getNews(district || "Hyderabad"),
  ]);

  const result = [];
  if (w.rain > 10)
    result.push({ type: "danger",  message: "🌧 Heavy rain expected — possible supply disruption. Prices may rise." });
  else if (w.rain > 5)
    result.push({ type: "warning", message: "🌦 Moderate rain forecast — monitor mandi prices closely." });
  if (w.temperature > 42)
    result.push({ type: "danger",  message: "🌡 Extreme heat alert — crop quality risk. Prices may fall." });
  else if (w.temperature > 38)
    result.push({ type: "warning", message: "☀️ High temperature — ensure proper crop storage." });
  if (w.humidity > 85)
    result.push({ type: "warning", message: "💧 High humidity — risk of fungal disease. Check storage conditions." });

  for (const n of newsItems) {
    if (n.impact?.type === "danger")
      result.push({ type: "danger",  message: `📰 ${n.title}` });
    else if (n.impact?.type === "warning")
      result.push({ type: "warning", message: `📰 ${n.title}` });
  }

  if (!result.length)
    result.push({ type: "info", message: "✅ Weather conditions normal. Market stable." });

  res.json({ alerts: result, weather: w });
}

module.exports = { weather, news, marketData, alerts };
