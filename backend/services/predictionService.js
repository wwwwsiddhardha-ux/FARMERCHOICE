const pool = require("../config/db");
const {
  movingAverage, ema, getTrend, volatility,
  confidenceInterval, weatherImpactFactor,
  generateAlerts, getSmartSuggestion,
} = require("../utils/trendCalculator");

// ── MSP 2024-25 (₹/quintal) — Government of India ────────────────────────────
const MSP = {
  Rice:      2300,
  Maize:     2090,
  Cotton:    7121,
  Groundnut: 6783,
  Turmeric:  null,
  Tomato:    null,
  Onion:     null,
  Chilli:    null,
};

// ── Fetch historical prices ───────────────────────────────────────────────────
async function fetchPrices(crop, district, days) {
  const [rows] = await pool.execute(
    `SELECT modal_price AS price, min_price, max_price, date
     FROM market_data
     WHERE crop = ? AND district = ?
       AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY date ASC`,
    [crop, district, days]
  );
  return rows;
}

// ── Best district to sell (highest avg price in last 7 days) ─────────────────
async function getDistrictComparison(crop, state) {
  const [rows] = await pool.execute(
    `SELECT district,
            ROUND(AVG(modal_price))  AS avg_price,
            ROUND(MIN(modal_price))  AS min_price,
            ROUND(MAX(modal_price))  AS max_price,
            COUNT(*)                 AS data_points
     FROM market_data
     WHERE crop = ? AND state = ?
       AND date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
     GROUP BY district
     HAVING data_points >= 3
     ORDER BY avg_price DESC
     LIMIT 10`,
    [crop, state]
  );
  return rows;
}

// ── News impact: weighted sum with recency decay ──────────────────────────────
function calcNewsImpact(news) {
  if (!news?.length) return 0;
  return news.reduce((sum, n, i) => {
    const decay = Math.max(0.4, 1 - i * 0.15); // older articles matter less
    return sum + (n.impact?.priceEffect || 0) * decay;
  }, 0);
}

// ── Project prices day-by-day using per-day weather forecast ─────────────────
function projectPrices(basePrice, trend, weatherForecast, combinedImpact, days) {
  const slope = trend === "Increasing" ? 0.006 : trend === "Decreasing" ? -0.006 : 0.001;
  let price   = basePrice;

  return Array.from({ length: days }, (_, i) => {
    // Apply trend drift
    price = price * (1 + slope);

    // Per-day weather from forecast (fallback to day-0 weather if forecast shorter)
    const dayWeather = weatherForecast[i + 1] || weatherForecast[weatherForecast.length - 1] || {};
    const wFactor    = weatherImpactFactor(
      { rain: dayWeather.rain || 0, temperature: dayWeather.tempAvg || 30, humidity: 60 },
      0 // already per-day, no extra decay
    );

    const finalPrice = Math.round(price * wFactor * (1 + combinedImpact));
    const date       = new Date();
    date.setDate(date.getDate() + i + 1);

    return { date: date.toISOString().split("T")[0], price: finalPrice };
  });
}

// ── Main prediction function ──────────────────────────────────────────────────
async function predictPrices(crop, state, district, weather, news, sentimentSignal = null, weatherForecast = []) {
  // Fetch 7-day and 30-day history in parallel
  const [week, month] = await Promise.all([
    fetchPrices(crop, district, 7),
    fetchPrices(crop, district, 30),
  ]);

  if (!week.length && !month.length) return null;

  const source = week.length >= 5 ? week : month;
  const prices = source.map((r) => parseFloat(r.price));

  // ── Baseline price: blend EMA (60%) + SMA (40%) for stability ────────────
  const emaPrice = ema(prices, 7);
  const smaPrice = movingAverage(prices, 7);
  const basePrice = Math.round(emaPrice * 0.6 + smaPrice * 0.4);

  // ── Trend from regression over 14-day history ─────────────────────────────
  const allPrices = month.length ? month.map((r) => parseFloat(r.price)) : prices;
  const trend     = getTrend(allPrices);

  // ── Volatility for confidence intervals ───────────────────────────────────
  const vol = volatility(allPrices);

  // ── Combined impact: news (60%) + sentiment (40%), capped at ±15% ─────────
  const newsImpact      = calcNewsImpact(news);
  const sentimentImpact = sentimentSignal?.price_signal ?? 0;
  const combinedImpact  = Math.max(-0.15, Math.min(0.15, newsImpact * 0.6 + sentimentImpact * 0.4));

  // ── Build weather forecast array (fallback to current weather repeated) ───
  const wForecast = weatherForecast.length >= 7
    ? weatherForecast
    : Array.from({ length: 7 }, (_, i) => ({
        date:    (() => { const d = new Date(); d.setDate(d.getDate() + i); return d.toISOString().split("T")[0]; })(),
        rain:    weather.rain,
        tempAvg: weather.temperature,
        condition: weather.condition,
      }));

  // ── Project 7 days ────────────────────────────────────────────────────────
  const forecast7 = projectPrices(basePrice, trend, wForecast, combinedImpact, 7);
  const forecast3 = forecast7.slice(0, 3);
  const tomorrow  = forecast7[0];

  // ── Confidence intervals per day ──────────────────────────────────────────
  const sentimentRisk = sentimentSignal?.sentiment === "Negative" ? 0.04 : 0;
  const forecastWithCI = forecast7.map((f, i) => ({
    ...f,
    ci: confidenceInterval(f.price, vol, i + 1, sentimentRisk),
  }));

  // ── MSP data ──────────────────────────────────────────────────────────────
  const mspPrice  = MSP[crop] || null;
  const mspSignal = mspPrice
    ? {
        msp:          mspPrice,
        currentVsMsp: parseFloat(((basePrice - mspPrice) / mspPrice * 100).toFixed(1)),
        belowMsp:     basePrice < mspPrice,
        label:        basePrice < mspPrice
          ? `⚠️ Price ₹${basePrice} is BELOW MSP ₹${mspPrice}`
          : `✅ Price ₹${basePrice} is ₹${basePrice - mspPrice} above MSP`,
      }
    : null;

  // ── Alerts ────────────────────────────────────────────────────────────────
  const alerts     = generateAlerts(weather, trend, basePrice, forecast7);
  const suggestion = getSmartSuggestion(trend, forecast7, basePrice, mspPrice);

  // ── Best sell day (peak of 7-day forecast) ────────────────────────────────
  const peak = forecast7.reduce((a, b) => (b.price > a.price ? b : a));

  // ── Best district to sell ─────────────────────────────────────────────────
  const markets = await getDistrictComparison(crop, state);
  const bestDistrict = markets[0]
    ? {
        district:  markets[0].district,
        avgPrice:  Math.round(markets[0].avg_price),
        premium:   Math.round(markets[0].avg_price - basePrice),
        allMarkets: markets.map((m, i) => {
          const transport = i === 0 ? 0 : Math.round(15 + i * 10);
          const netProfit = Math.round(m.avg_price - basePrice - transport);
          return {
            district:    m.district,
            avgPrice:    Math.round(m.avg_price),
            minPrice:    Math.round(m.min_price),
            maxPrice:    Math.round(m.max_price),
            transport,
            netProfit,
            premium:     Math.round(m.avg_price - basePrice),
            rank:        i + 1,
            recommended: netProfit > 50,
          };
        }),
      }
    : null;

  // ── Risk level ────────────────────────────────────────────────────────────
  const riskScore =
    (vol > 0.08 ? 2 : vol > 0.04 ? 1 : 0) +
    (weather.rain > 10 ? 2 : weather.rain > 5 ? 1 : 0) +
    (sentimentSignal?.sentiment === "Negative" ? 2 : 0) +
    (trend === "Decreasing" ? 1 : 0) +
    (mspSignal?.belowMsp ? 2 : 0);

  const riskLevel = riskScore >= 4 ? "high" : riskScore >= 2 ? "medium" : "low";

  // ── Prediction explanation signals ───────────────────────────────────────
  const signals = [];
  if (trend !== "Stable")
    signals.push(`📊 Regression trend is ${trend.toLowerCase()} over last 14 days`);
  if (weather.rain > 5)
    signals.push(`🌧 Rainfall (${weather.rain}mm) causing supply pressure — prices pushed up`);
  if (weather.temperature > 40)
    signals.push(`🌡 High temperature (${weather.temperature}°C) may reduce crop quality`);
  if (sentimentSignal?.sentiment === "Negative")
    signals.push(`📰 News sentiment Negative (${sentimentSignal.impact_type}) — supply disruption risk`);
  if (sentimentSignal?.sentiment === "Positive")
    signals.push(`📰 News sentiment Positive (${sentimentSignal.impact_type}) — favourable market`);
  if (Math.abs(combinedImpact) > 0.02)
    signals.push(`⚡ Market signals: ${combinedImpact > 0 ? "+" : ""}${(combinedImpact * 100).toFixed(1)}% price pressure`);
  if (mspSignal?.belowMsp)
    signals.push(`🏛 Price is below MSP (₹${mspPrice}/qtl) — consider government procurement`);
  if (vol > 0.06)
    signals.push(`📉 High price volatility (${(vol * 100).toFixed(1)}%) — wider confidence intervals`);

  return {
    // Core prices
    avgPrice:           basePrice,
    tomorrow:           { ...tomorrow, ci: forecastWithCI[0].ci },
    forecast3:          forecastWithCI.slice(0, 3),
    predictedPrices:    forecastWithCI,          // 7-day with CI
    historicalPrices:   week,

    // Summary
    trend,
    riskLevel,
    volatility:         parseFloat((vol * 100).toFixed(1)),
    bestSellDay:        peak.date,
    predictedPeakPrice: peak.price,

    // MSP
    msp: mspSignal,

    // Best district
    bestDistrict,
    markets: bestDistrict?.allMarkets ?? [],

    // Alerts & recommendation
    alerts,
    suggestion,
    predictionSignals: signals,

    // Sentiment passthrough
    sentimentSignal,

    // Chart data (clean arrays for frontend)
    chartData: {
      week:     week.map((r)  => ({ date: r.date, price: parseFloat(r.price) })),
      month:    month.map((r) => ({ date: r.date, price: parseFloat(r.price) })),
      forecast: forecastWithCI.map((f) => ({
        date:  f.date,
        price: f.price,
        lower: f.ci.lower,
        upper: f.ci.upper,
      })),
    },
  };
}

module.exports = { predictPrices, MSP };
