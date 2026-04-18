// ── Exponential Moving Average (more weight on recent prices) ─────────────────
function ema(prices, period = 7) {
  if (!prices.length) return 0;
  const k = 2 / (period + 1);
  let e = prices[0];
  for (let i = 1; i < prices.length; i++) e = prices[i] * k + e * (1 - k);
  return e;
}

// ── Simple moving average (last N) ───────────────────────────────────────────
function movingAverage(prices, n = 7) {
  const slice = prices.slice(-n);
  return slice.reduce((s, p) => s + p, 0) / slice.length;
}

// ── Linear regression slope over last N prices ───────────────────────────────
function regressionSlope(prices, n = 14) {
  const slice = prices.slice(-n);
  const len   = slice.length;
  if (len < 2) return 0;
  const xMean = (len - 1) / 2;
  const yMean = slice.reduce((s, v) => s + v, 0) / len;
  let num = 0, den = 0;
  slice.forEach((y, x) => { num += (x - xMean) * (y - yMean); den += (x - xMean) ** 2; });
  return den === 0 ? 0 : num / den;
}

// ── Trend classification using regression slope ───────────────────────────────
function getTrend(prices) {
  if (prices.length < 2) return "Stable";
  const slope    = regressionSlope(prices);
  const baseline = movingAverage(prices);
  const pct      = baseline > 0 ? slope / baseline : 0;
  if (pct >  0.003) return "Increasing";
  if (pct < -0.003) return "Decreasing";
  return "Stable";
}

// ── Historical volatility (std-dev as % of mean) ─────────────────────────────
function volatility(prices) {
  if (prices.length < 2) return 0;
  const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
  const variance = prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length;
  return mean > 0 ? Math.sqrt(variance) / mean : 0;
}

// ── Confidence interval around a predicted price ─────────────────────────────
// Returns { lower, upper, pct } where pct is the half-width as a percentage
function confidenceInterval(price, vol, daysAhead, sentimentRisk = 0) {
  // Uncertainty grows with time and volatility
  const uncertainty = vol * Math.sqrt(daysAhead) + sentimentRisk * 0.5;
  const halfWidth   = Math.round(price * Math.min(uncertainty, 0.25)); // cap at 25%
  return {
    lower: price - halfWidth,
    upper: price + halfWidth,
    pct:   parseFloat((uncertainty * 100).toFixed(1)),
  };
}

// ── Weather impact factor for a single day ───────────────────────────────────
// decayDay: 0 = today, 1 = tomorrow, etc. (impact decays over time)
function weatherImpactFactor(weather, decayDay = 0) {
  const decay = Math.max(0, 1 - decayDay * 0.15); // 15% decay per day
  let factor  = 1.0;
  if (weather.rain > 10)       factor += 0.05 * decay;
  else if (weather.rain > 5)   factor += 0.03 * decay;
  if (weather.temperature > 42)      factor -= 0.04 * decay;
  else if (weather.temperature > 40) factor -= 0.02 * decay;
  if (weather.humidity > 85)         factor += 0.02 * decay;
  else if (weather.humidity > 80)    factor += 0.01 * decay;
  return factor;
}

// ── Legacy alias (used by old callers) ───────────────────────────────────────
function applyWeatherImpact(basePrice, weather) {
  return Math.round(basePrice * weatherImpactFactor(weather, 0));
}

// ── Alert generation ──────────────────────────────────────────────────────────
function generateAlerts(weather, trend, avgPrice, predictedPrices) {
  const alerts = [];

  if (weather.rain > 10)
    alerts.push({ type: "danger",  message: "🌧 Heavy rain expected — supply disruption likely. Prices may spike." });
  else if (weather.rain > 5)
    alerts.push({ type: "warning", message: "🌦 Moderate rain forecast — monitor mandi prices closely." });

  if (weather.temperature > 42)
    alerts.push({ type: "danger",  message: "🌡 Extreme heat alert — crop quality risk. Prices may fall." });
  else if (weather.temperature > 38)
    alerts.push({ type: "warning", message: "☀️ High temperature — ensure proper crop storage." });

  if (weather.humidity > 85)
    alerts.push({ type: "warning", message: "💧 High humidity — risk of fungal disease. Check storage conditions." });

  if (trend === "Decreasing") {
    const drop = avgPrice - predictedPrices[predictedPrices.length - 1].price;
    if (drop > avgPrice * 0.05)
      alerts.push({ type: "danger",  message: `📉 Significant price drop predicted (₹${Math.round(drop)}/qtl). Consider selling now.` });
    else
      alerts.push({ type: "warning", message: "📉 Prices trending downward. Monitor market closely." });
  }

  return alerts;
}

// ── Smart sell recommendation with MSP floor ─────────────────────────────────
function getSmartSuggestion(trend, predictedPrices, avgPrice, mspPrice = null) {
  const peak    = predictedPrices.reduce((a, b) => (b.price > a.price ? b : a));
  const trough  = predictedPrices.reduce((a, b) => (b.price < a.price ? b : a));

  // MSP floor warning
  if (mspPrice && avgPrice < mspPrice * 1.02) {
    return `⚠️ Current price ₹${Math.round(avgPrice)}/qtl is near MSP floor (₹${mspPrice}/qtl). ` +
           `Consider government procurement channels. Predicted peak: ₹${peak.price}/qtl on ${peak.date}.`;
  }

  if (trend === "Increasing")
    return `✅ Best time to sell: ${peak.date} — predicted peak ₹${peak.price}/qtl. ` +
           `Hold stock if storage is available.`;

  if (trend === "Decreasing")
    return `⚠️ Prices falling. Sell within 1–2 days to avoid further loss. ` +
           `Predicted low: ₹${trough.price}/qtl on ${trough.date}.`;

  return `➡️ Prices stable around ₹${Math.round(avgPrice)}/qtl. ` +
         `Best predicted price: ₹${peak.price}/qtl on ${peak.date}.`;
}

module.exports = {
  movingAverage,
  ema,
  regressionSlope,
  getTrend,
  volatility,
  confidenceInterval,
  weatherImpactFactor,
  applyWeatherImpact,
  generateAlerts,
  getSmartSuggestion,
};
