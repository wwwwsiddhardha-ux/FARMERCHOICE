const pool                               = require("../config/db");
const { getWeather, getWeatherForecast } = require("../services/weatherService");
const { getNews }                        = require("../services/newsService");
const { analyseSentiment }               = require("../services/sentimentService");
const { MSP }                            = require("../services/predictionService");
const {
  ema, movingAverage, getTrend, volatility, regressionSlope,
} = require("../utils/trendCalculator");

// ── GET /api/recommendation?crop=Rice&state=Andhra Pradesh&district=Guntur ────
async function recommendation(req, res) {
  const { crop, state, district } = req.query;
  if (!crop || !state || !district)
    return res.status(400).json({ error: "crop, state, district required" });

  try {
    const [priceRows, weather, weatherForecast, newsArticles] = await Promise.all([
      pool.execute(
        `SELECT modal_price AS price, date FROM market_data
         WHERE crop = ? AND district = ?
           AND date >= DATE_SUB(CURDATE(), INTERVAL 21 DAY)
         ORDER BY date ASC`,
        [crop, district]
      ).then(([r]) => r).catch(() => []),
      getWeather(district).catch(() => ({ temperature: 30, humidity: 60, rain: 0, condition: "Clear" })),
      getWeatherForecast(district).catch(() => []),
      getNews(district, crop).catch(() => []),
    ]);

    const prices    = priceRows.map((r) => parseFloat(r.price));
    const avgPrice  = prices.length
      ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      : 0;

    // ── Price trend analysis ──────────────────────────────────────────────
    const trend       = prices.length >= 5 ? getTrend(prices) : "Stable";
    const vol         = prices.length >= 5 ? volatility(prices) : 0;
    const slope       = prices.length >= 5 ? regressionSlope(prices, 14) : 0;
    const emaPrice    = prices.length >= 3 ? Math.round(ema(prices, 7)) : avgPrice;
    const smaPrice    = prices.length >= 3 ? Math.round(movingAverage(prices, 7)) : avgPrice;

    // 3-day recent average vs 7-day average to detect short-term momentum
    const recent3Avg  = prices.length >= 3
      ? Math.round(prices.slice(-3).reduce((a, b) => a + b, 0) / 3)
      : avgPrice;
    const week7Avg    = prices.length >= 7
      ? Math.round(prices.slice(-7).reduce((a, b) => a + b, 0) / 7)
      : avgPrice;
    const momentum    = recent3Avg > week7Avg * 1.015 ? "accelerating_up"
                      : recent3Avg < week7Avg * 0.985 ? "accelerating_down"
                      : "neutral";

    // ── Weather risk signals ──────────────────────────────────────────────
    const rainNow     = weather.rain;
    const tempNow     = weather.temperature;
    const humidNow    = weather.humidity;

    // Upcoming 3-day rain total from forecast
    const rain3d      = weatherForecast.slice(0, 3).reduce((s, d) => s + (d.rain || 0), 0);
    const maxTemp3d   = weatherForecast.slice(0, 3).reduce((m, d) => Math.max(m, d.tempMax || 0), 0);
    const rainRisk    = rain3d > 20 ? "high" : rain3d > 8 ? "medium" : "low";
    const heatRisk    = maxTemp3d > 42 ? "high" : maxTemp3d > 38 ? "medium" : "low";
    const storageRisk = humidNow > 85 ? "high" : humidNow > 75 ? "medium" : "low";

    // ── Sentiment ─────────────────────────────────────────────────────────
    const sentiment       = await analyseSentiment(newsArticles, crop, district).catch(() => null);
    const sentimentLabel  = sentiment?.sentiment ?? "Neutral";
    const sentimentSignal = sentiment?.price_signal ?? 0;
    const sentimentConf   = sentiment?.confidence ?? 0;

    // ── MSP check ─────────────────────────────────────────────────────────
    const mspPrice  = MSP[crop] || null;
    const belowMsp  = mspPrice ? avgPrice < mspPrice : false;
    const mspGap    = mspPrice ? Math.round(avgPrice - mspPrice) : null;
    const nearMsp   = mspPrice ? avgPrice < mspPrice * 1.05 : false;

    // ── Supply risk from district comparison ──────────────────────────────
    let supplyRisk = "low";
    try {
      const [compRows] = await pool.execute(
        `SELECT COUNT(DISTINCT district) AS district_count,
                ROUND(AVG(modal_price))  AS state_avg
         FROM market_data
         WHERE crop = ? AND state = ?
           AND date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
        [crop, state]
      );
      const stateAvg = compRows[0]?.state_avg || avgPrice;
      // If local price is significantly below state average, supply is high locally
      if (avgPrice < stateAvg * 0.92) supplyRisk = "high";
      else if (avgPrice < stateAvg * 0.97) supplyRisk = "medium";
    } catch { /* non-critical */ }

    // ── Scoring engine ────────────────────────────────────────────────────
    // Positive score = SELL NOW, negative = HOLD
    let score = 0;
    const reasons = [];

    // Price trend signals
    if (trend === "Decreasing" && momentum === "accelerating_down") {
      score += 4;
      reasons.push({ type: "danger", weight: 4, text: `Prices falling fast — ${crop} down ₹${Math.abs(Math.round(slope * 7))}/qtl over 7 days. Sell to avoid further loss.` });
    } else if (trend === "Decreasing") {
      score += 2;
      reasons.push({ type: "warn", weight: 2, text: `Downward price trend detected. Selling now avoids further loss.` });
    } else if (trend === "Increasing" && momentum === "accelerating_up") {
      score -= 3;
      reasons.push({ type: "good", weight: -3, text: `Prices rising strongly — up ₹${Math.round(slope * 7)}/qtl over 7 days. Hold for better returns.` });
    } else if (trend === "Increasing") {
      score -= 2;
      reasons.push({ type: "good", weight: -2, text: `Prices are rising. Holding may yield ₹${Math.round(slope * 5)}/qtl more over 5 days.` });
    } else {
      score += 1;
      reasons.push({ type: "info", weight: 1, text: `Prices are stable around ₹${avgPrice}/qtl. No strong reason to wait.` });
    }

    // Volatility — high volatility = sell sooner
    if (vol > 0.08) {
      score += 2;
      reasons.push({ type: "warn", weight: 2, text: `High price volatility (${(vol * 100).toFixed(1)}%) — unpredictable market, selling now reduces risk.` });
    } else if (vol > 0.04) {
      score += 1;
      reasons.push({ type: "info", weight: 1, text: `Moderate volatility (${(vol * 100).toFixed(1)}%) — prices may swing. Monitor daily.` });
    }

    // Weather signals
    if (rainRisk === "high") {
      score += 2;
      reasons.push({ type: "warn", weight: 2, text: `Heavy rain forecast next 3 days (${rain3d.toFixed(0)}mm total) — storage risk is high. Sell before rain.` });
    } else if (rainRisk === "medium") {
      score += 1;
      reasons.push({ type: "info", weight: 1, text: `Moderate rain expected (${rain3d.toFixed(0)}mm) — check storage conditions.` });
    }

    if (heatRisk === "high") {
      score += 2;
      reasons.push({ type: "danger", weight: 2, text: `Extreme heat forecast (${maxTemp3d}°C) — crop quality degrades quickly. Sell soon.` });
    } else if (heatRisk === "medium") {
      score += 1;
      reasons.push({ type: "warn", weight: 1, text: `High temperatures expected (${maxTemp3d}°C) — ensure proper storage.` });
    }

    if (storageRisk === "high") {
      score += 1;
      reasons.push({ type: "warn", weight: 1, text: `High humidity (${humidNow}%) — fungal disease risk in storage. Sell sooner.` });
    }

    // Sentiment signals
    if (sentimentLabel === "Negative" && sentimentConf >= 50) {
      score += 2;
      reasons.push({ type: "warn", weight: 2, text: `News sentiment is Negative (${sentiment?.impact_type}) — market may weaken. Selling now is safer.` });
    } else if (sentimentLabel === "Negative") {
      score += 1;
      reasons.push({ type: "info", weight: 1, text: `Slightly negative news sentiment — monitor market news closely.` });
    } else if (sentimentLabel === "Positive" && sentimentConf >= 50) {
      score -= 2;
      reasons.push({ type: "good", weight: -2, text: `Positive market news (${sentiment?.impact_type}) — demand may increase. Holding could be profitable.` });
    } else if (sentimentLabel === "Positive") {
      score -= 1;
      reasons.push({ type: "good", weight: -1, text: `Positive news sentiment — market conditions look favourable.` });
    }

    // MSP signals
    if (belowMsp) {
      score -= 3;
      reasons.push({ type: "info", weight: -3, text: `Price ₹${avgPrice} is BELOW MSP ₹${mspPrice}. Consider government procurement (APMC/FCI) instead of open market.` });
    } else if (nearMsp) {
      score -= 1;
      reasons.push({ type: "info", weight: -1, text: `Price ₹${avgPrice} is near MSP ₹${mspPrice}. Government procurement is an option.` });
    } else if (mspGap > 300) {
      score -= 1;
      reasons.push({ type: "good", weight: -1, text: `Price is ₹${mspGap} above MSP — strong market conditions. Holding is viable.` });
    }

    // Supply risk
    if (supplyRisk === "high") {
      score += 1;
      reasons.push({ type: "warn", weight: 1, text: `Local supply appears high — prices may face downward pressure.` });
    }

    // ── Decision ──────────────────────────────────────────────────────────
    const action     = score >= 4 ? "SELL NOW"
                     : score >= 2 ? "SELL SOON"
                     : score <= -2 ? "HOLD"
                     : "MONITOR";

    const riskLevel  = score >= 5 ? "high"
                     : score >= 3 ? "medium"
                     : score <= -3 ? "low"
                     : "medium";

    const confidence = Math.min(92, 45 + Math.abs(score) * 7);

    const summaryMap = {
      "SELL NOW":  `Sell your ${crop} now. Multiple risk signals are active — ${trend === "Decreasing" ? "prices are falling" : "weather and market conditions are unfavourable for holding"}.`,
      "SELL SOON": `Consider selling ${crop} within 2–3 days. Conditions are leaning towards selling but not urgent yet.`,
      "HOLD":      `Hold your ${crop} stock. ${trend === "Increasing" ? "Prices are rising" : belowMsp ? "Price is below MSP — use government procurement" : "Market conditions favour waiting"}.`,
      "MONITOR":   `Market signals are mixed for ${crop}. Monitor prices daily and reassess in 2–3 days.`,
    };

    // Best estimated sell window
    const sellWindow = action === "SELL NOW"  ? "Today or tomorrow"
                     : action === "SELL SOON" ? "Within 2–3 days"
                     : action === "HOLD"      ? "Wait 5–7 days, reassess"
                     : "Check again in 2–3 days";

    res.json({
      action,
      summary:    summaryMap[action],
      riskLevel,
      confidence,
      score,
      sellWindow,
      reasons:    reasons.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)), // most impactful first

      signals: {
        priceTrend:       trend,
        momentum,
        avgPrice,
        emaPrice,
        smaPrice,
        volatility:       parseFloat((vol * 100).toFixed(1)),
        slope:            parseFloat(slope.toFixed(2)),
        rainRisk,
        heatRisk,
        storageRisk,
        supplyRisk,
        rain3dForecast:   parseFloat(rain3d.toFixed(1)),
        maxTemp3d,
        sentimentLabel,
        sentimentSignal,
        sentimentConf,
        mspPrice,
        belowMsp,
        mspGap,
      },

      weather: {
        temperature: weather.temperature,
        humidity:    weather.humidity,
        rain:        weather.rain,
        condition:   weather.condition,
      },

      forecast: weatherForecast.slice(0, 3).map((d) => ({
        date:    d.date,
        tempMax: d.tempMax,
        rain:    d.rain,
        condition: d.condition,
      })),

      crop,
      district,
      state,
    });
  } catch (err) {
    console.error("[Recommendation]", err.message);
    res.status(500).json({ error: err.message || "Recommendation failed" });
  }
}

// ── GET /api/market-comparison?crop=Rice&state=Andhra Pradesh&district=Guntur ─
async function districtComparison(req, res) {
  const { crop, state, district } = req.query;
  if (!crop || !state) return res.status(400).json({ error: "crop and state required" });

  try {
    // 7-day average per district
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
       ORDER BY avg_price DESC`,
      [crop, state]
    );

    if (!rows.length) return res.json({ districts: [], best: null, chartData: [] });

    // 14-day trend per district (for chart)
    const [trendRows] = await pool.execute(
      `SELECT district, date, ROUND(AVG(modal_price)) AS avg_price
       FROM market_data
       WHERE crop = ? AND state = ?
         AND date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
       GROUP BY district, date
       ORDER BY date ASC`,
      [crop, state]
    );

    const selectedRow = district ? rows.find((r) => r.district === district) : null;
    const basePrice   = selectedRow ? Math.round(selectedRow.avg_price) : Math.round(rows[0].avg_price);

    const districts = rows.map((r, i) => {
      const transportEst = i === 0 ? 0 : Math.round(15 + i * 10); // ₹/qtl rough estimate
      const premium      = Math.round(r.avg_price - basePrice);
      const netGain      = premium - transportEst;
      return {
        district:      r.district,
        avgPrice:      Math.round(r.avg_price),
        minPrice:      Math.round(r.min_price),
        maxPrice:      Math.round(r.max_price),
        dataPoints:    r.data_points,
        premium,
        transportEst,
        netGain,
        isBest:        i === 0,
        isSelected:    r.district === district,
        rank:          i + 1,
        recommendation: netGain > 50 ? "Worth travelling" : netGain > 0 ? "Marginal gain" : "Sell locally",
      };
    });

    // Build chart data: date → { date, [district]: price }
    const chartMap = {};
    for (const row of trendRows) {
      const d = String(row.date).split("T")[0];
      if (!chartMap[d]) chartMap[d] = { date: d };
      chartMap[d][row.district] = Math.round(row.avg_price);
    }
    const chartData = Object.values(chartMap).sort((a, b) => a.date.localeCompare(b.date));

    // Top 5 districts for chart (avoid clutter)
    const topDistricts = rows.slice(0, 5).map((r) => r.district);

    res.json({
      crop,
      state,
      selectedDistrict: district || null,
      selectedPrice:    selectedRow ? Math.round(selectedRow.avg_price) : null,
      districts,
      best: {
        district:    rows[0].district,
        avgPrice:    Math.round(rows[0].avg_price),
        premiumOver: selectedRow ? Math.round(rows[0].avg_price - selectedRow.avg_price) : 0,
      },
      chartData,
      topDistricts,
    });
  } catch (err) {
    console.error("[DistrictComparison]", err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { recommendation, districtComparison };
