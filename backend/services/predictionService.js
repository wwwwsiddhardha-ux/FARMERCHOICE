const pool = require("../config/db");
const { movingAverage, getTrend, applyWeatherImpact, generateAlerts, getSmartSuggestion } = require("../utils/trendCalculator");

async function predictPrices(crop, state, district, mandal, weather) {
  const [records] = await pool.execute(
    "SELECT price, date FROM mandi_prices WHERE crop = ? AND district = ? AND mandal = ? ORDER BY date ASC LIMIT 7",
    [crop, district, mandal]
  );

  if (records.length === 0) return null;

  const prices = records.map((r) => parseFloat(r.price));
  const avgPrice = movingAverage(prices);
  const trend = getTrend(prices);

  const predicted = [];
  let base = avgPrice;
  for (let i = 1; i <= 5; i++) {
    const daily = applyWeatherImpact(base, weather);
    const drift = trend === "Increasing" ? 1.006 : trend === "Decreasing" ? 0.994 : 1.0;
    base = Math.round(base * drift);
    const date = new Date();
    date.setDate(date.getDate() + i);
    predicted.push({ date: date.toISOString().split("T")[0], price: daily });
  }

  const alerts = generateAlerts(weather, trend, avgPrice, predicted);
  const suggestion = getSmartSuggestion(trend, predicted, avgPrice);

  return {
    historicalPrices: records,
    predictedPrices: predicted,
    trend,
    avgPrice: Math.round(avgPrice),
    alerts,
    suggestion,
  };
}

module.exports = { predictPrices };
