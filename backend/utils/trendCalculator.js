function movingAverage(prices) {
  const last = prices.slice(-7);
  return last.reduce((sum, p) => sum + p, 0) / last.length;
}

function getTrend(prices) {
  const last = prices.slice(-5);
  const diff = last[last.length - 1] - last[0];
  if (diff > last[0] * 0.01) return "Increasing";
  if (diff < -last[0] * 0.01) return "Decreasing";
  return "Stable";
}

function applyWeatherImpact(basePrice, weather) {
  let factor = 1.0;
  if (weather.rain > 10) factor += 0.05;
  else if (weather.rain > 5) factor += 0.03;
  if (weather.temperature > 42) factor -= 0.04;
  else if (weather.temperature > 40) factor -= 0.02;
  if (weather.humidity > 85) factor += 0.02;
  else if (weather.humidity > 80) factor += 0.01;
  return Math.round(basePrice * factor);
}

function generateAlerts(weather, trend, avgPrice, predictedPrices) {
  const alerts = [];

  if (weather.rain > 10)
    alerts.push({ type: "danger", message: "Heavy rain expected – possible supply impact" });
  else if (weather.rain > 5)
    alerts.push({ type: "warning", message: "🌧 Moderate rain expected — prices likely to rise due to supply disruption." });

  if (weather.temperature > 42)
    alerts.push({ type: "danger", message: "Prices may decrease due to high temperature" });

  if (trend === "Decreasing") {
    const drop = avgPrice - predictedPrices[predictedPrices.length - 1].price;
    if (drop > avgPrice * 0.05)
      alerts.push({ type: "danger", message: `📉 Significant price drop predicted (₹${Math.round(drop)}/quintal). Consider selling now.` });
    else
      alerts.push({ type: "warning", message: "📉 Prices trending downward. Monitor market closely." });
  }

  if (weather.humidity > 85)
    alerts.push({ type: "warning", message: "💧 High humidity — risk of fungal disease. Ensure proper storage." });

  return alerts;
}

function getSmartSuggestion(trend, predictedPrices, avgPrice) {
  const maxPred = Math.max(...predictedPrices.map((p) => p.price));
  const maxDay = predictedPrices.find((p) => p.price === maxPred);
  if (trend === "Increasing")
    return `✅ Best time to sell: around ${maxDay.date} — predicted peak price ₹${maxPred}/quintal.`;
  return `⚠ Prices are falling. Consider selling within the next 1–2 days to avoid further loss.`;
}

module.exports = { movingAverage, getTrend, applyWeatherImpact, generateAlerts, getSmartSuggestion };
