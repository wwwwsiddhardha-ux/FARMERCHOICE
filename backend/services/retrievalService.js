const pool = require("../config/db");
const { getWeather, getWeatherForecast } = require("./weatherService");
const { getNews }                        = require("./newsService");
const { analyseSentiment }               = require("./sentimentService");
const { MSP }                            = require("./predictionService");
const { getTrend, volatility, ema, movingAverage } = require("../utils/trendCalculator");

async function retrieveContext(crop, state, district) {
  const sources = [];

  const [
    priceRows,
    compRows,
    predLogRows,
    weather,
    weatherForecast,
    newsArticles,
  ] = await Promise.all([
    // 1. Price history — last 30 days
    pool.execute(
      `SELECT date, modal_price, min_price, max_price
       FROM market_data
       WHERE crop = ? AND district = ?
         AND date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       ORDER BY date ASC`,
      [crop, district]
    ).then(([r]) => r).catch(() => []),

    // 2. District comparison — last 7 days, all districts in state
    pool.execute(
      `SELECT district,
              ROUND(AVG(modal_price)) AS avg_price,
              ROUND(MIN(modal_price)) AS min_price,
              ROUND(MAX(modal_price)) AS max_price,
              COUNT(*) AS data_points
       FROM market_data
       WHERE crop = ? AND state = ?
         AND date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY district ORDER BY avg_price DESC LIMIT 10`,
      [crop, state]
    ).then(([r]) => r).catch(() => []),

    // 3. Prediction log — last 15 predictions for this crop+district
    pool.execute(
      `SELECT predicted_price, actual_price, accuracy_pct,
              prediction_date, target_date
       FROM prediction_log
       WHERE crop = ? AND district = ?
       ORDER BY target_date DESC LIMIT 15`,
      [crop, district]
    ).then(([r]) => r).catch(() => []),

    // 4. Current weather
    getWeather(district).catch(() => null),

    // 5. Weather forecast
    getWeatherForecast(district).catch(() => []),

    // 6. News articles
    getNews(district, crop).catch(() => []),
  ]);

  // ── 1. Price context with trend analysis ─────────────────────────────────
  let priceContext = "";
  if (priceRows.length) {
    const prices   = priceRows.map((r) => parseFloat(r.modal_price));
    const avg      = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    const latest   = priceRows[priceRows.length - 1];
    const oldest   = priceRows[0];
    const trend    = getTrend(prices);
    const vol      = prices.length > 1
      ? (Math.sqrt(prices.reduce((s, p) => s + (p - avg) ** 2, 0) / prices.length) / avg * 100).toFixed(1)
      : "0";
    const emaVal   = Math.round(ema(prices, 7));
    const smaVal   = Math.round(movingAverage(prices, 7));
    const latestDate = String(latest.date).split("T")[0];
    const oldestDate = String(oldest.date).split("T")[0];

    // Week-over-week change
    const weekAgo  = priceRows.length >= 7 ? parseFloat(priceRows[priceRows.length - 7].modal_price) : null;
    const weekChg  = weekAgo ? Math.round(latest.modal_price - weekAgo) : null;

    priceContext =
      `PRICE DATA — ${crop} in ${district}, ${state} (last 30 days):\n` +
      `- Latest price (${latestDate}): Rs${latest.modal_price}/quintal\n` +
      `- 30-day average: Rs${avg}/quintal\n` +
      `- Price range: Rs${Math.min(...prices)} – Rs${Math.max(...prices)}/quintal\n` +
      `- Trend: ${trend} (Rs${oldest.modal_price} on ${oldestDate} → Rs${latest.modal_price} on ${latestDate})\n` +
      (weekChg !== null ? `- Week-over-week change: ${weekChg >= 0 ? "+" : ""}Rs${weekChg}/quintal\n` : "") +
      `- EMA(7): Rs${emaVal}/quintal | SMA(7): Rs${smaVal}/quintal\n` +
      `- Volatility: ${vol}% (${parseFloat(vol) > 8 ? "HIGH" : parseFloat(vol) > 4 ? "MODERATE" : "LOW"})\n` +
      `- Data points: ${priceRows.length} daily records`;
    sources.push({ type: "MySQL Price Data", records: priceRows.length, district, crop });
  } else {
    priceContext = `PRICE DATA: No records found for ${crop} in ${district} in the last 30 days.`;
  }

  // ── 2. District comparison context ───────────────────────────────────────
  let compContext = "";
  if (compRows.length) {
    const selectedRow = compRows.find((r) => r.district === district);
    const best        = compRows[0];
    const premium     = selectedRow ? Math.round(best.avg_price - selectedRow.avg_price) : 0;

    compContext =
      `\nDISTRICT COMPARISON — ${crop} in ${state} (7-day average prices):\n` +
      compRows.map((r, i) => {
        const tag = r.district === district ? " ← YOUR DISTRICT" : i === 0 ? " ← BEST PRICE" : "";
        return `${i + 1}. ${r.district}: Rs${r.avg_price}/qtl (range Rs${r.min_price}–Rs${r.max_price})${tag}`;
      }).join("\n") +
      (premium > 0 ? `\n- Selling in ${best.district} instead of ${district} could earn Rs${premium}/qtl more` : "");
    sources.push({ type: "District Comparison", state, crop, districts: compRows.length });
  }

  // ── 3. Prediction accuracy context ───────────────────────────────────────
  let predLogContext = "";
  if (predLogRows.length) {
    const resolved = predLogRows.filter((r) => r.actual_price != null && r.accuracy_pct != null);
    const avgAcc   = resolved.length
      ? (resolved.reduce((s, r) => s + parseFloat(r.accuracy_pct), 0) / resolved.length).toFixed(1)
      : null;

    predLogContext =
      `\nPREDICTION HISTORY — ${crop} in ${district} (last ${predLogRows.length} predictions):\n` +
      predLogRows.slice(0, 6).map((r) => {
        const acc = r.accuracy_pct != null ? ` | Accuracy: ${r.accuracy_pct}%` : " | Pending resolution";
        const tgt = String(r.target_date).split("T")[0];
        return `- Predicted Rs${Math.round(r.predicted_price)} for ${tgt}` +
               (r.actual_price ? ` → Actual Rs${Math.round(r.actual_price)}` : "") + acc;
      }).join("\n") +
      (avgAcc ? `\n- Average prediction accuracy: ${avgAcc}%` : "");
    sources.push({ type: "Prediction Log", records: predLogRows.length, accuracy: avgAcc });
  }

  // ── 4. Weather context ────────────────────────────────────────────────────
  let weatherContext = "";
  if (weather) {
    const agriNote = weather.rain > 10 ? "⚠️ Heavy rain — supply disruption risk, prices may spike"
                   : weather.rain > 5  ? "⚠️ Moderate rain — prices may rise slightly"
                   : weather.temperature > 42 ? "⚠️ Extreme heat — crop quality risk"
                   : weather.humidity > 85 ? "⚠️ High humidity — fungal disease risk in storage"
                   : "✅ Normal conditions — no weather-related price pressure";
    weatherContext =
      `\nWEATHER — ${district} (current):\n` +
      `- Temperature: ${weather.temperature}°C (feels like ${weather.feelsLike ?? weather.temperature}°C)\n` +
      `- Humidity: ${weather.humidity}%\n` +
      `- Rainfall: ${weather.rain} mm\n` +
      `- Wind: ${weather.windSpeed ?? "—"} m/s\n` +
      `- Condition: ${weather.description ?? weather.condition}\n` +
      `- Agricultural impact: ${agriNote}`;
    sources.push({ type: "OpenWeather API", district });
  }

  // ── 5. Weather forecast context ───────────────────────────────────────────
  let forecastContext = "";
  if (weatherForecast.length) {
    const rain3d   = weatherForecast.slice(0, 3).reduce((s, d) => s + (d.rain || 0), 0);
    const maxTemp  = weatherForecast.slice(0, 3).reduce((m, d) => Math.max(m, d.tempMax || 0), 0);
    forecastContext =
      `\nWEATHER FORECAST — ${district} (next 5 days):\n` +
      weatherForecast.slice(0, 5).map((d) =>
        `- ${d.date}: ${d.condition}, ${d.tempMin}–${d.tempMax}°C, rain: ${d.rain}mm`
      ).join("\n") +
      `\n- 3-day total rain: ${rain3d.toFixed(1)}mm | Max temp: ${maxTemp}°C`;
  }

  // ── 6. News context ───────────────────────────────────────────────────────
  let newsContext = "";
  if (newsArticles.length) {
    newsContext =
      `\nRECENT NEWS — ${district} (${newsArticles.length} articles):\n` +
      newsArticles.slice(0, 5).map((n, i) => {
        const effect = n.impact?.priceEffect
          ? ` (price effect: ${n.impact.priceEffect > 0 ? "+" : ""}${(n.impact.priceEffect * 100).toFixed(0)}%)`
          : "";
        return `${i + 1}. [${n.impact?.label ?? "News"}] ${n.title}${effect}`;
      }).join("\n");
    sources.push({ type: "GNews API", district, articles: newsArticles.length });
  }

  // ── 7. MSP context ────────────────────────────────────────────────────────
  let mspContext = "";
  const mspVal = MSP[crop];
  if (mspVal) {
    const currentPrice = priceRows.length ? priceRows[priceRows.length - 1].modal_price : null;
    const diff = currentPrice ? Math.round(currentPrice - mspVal) : null;
    mspContext =
      `\nMSP DATA — ${crop} (Government of India, 2024-25):\n` +
      `- Minimum Support Price: Rs${mspVal}/quintal\n` +
      (diff != null
        ? `- Current vs MSP: ${diff >= 0 ? "+" : ""}Rs${diff}/qtl (${diff >= 0 ? "ABOVE MSP ✅" : "BELOW MSP ⚠️"})\n`
        : "") +
      `- Farmers can sell to government at MSP through APMC/FCI procurement centres`;
    sources.push({ type: "MSP Data", crop, msp: mspVal, year: "2024-25" });
  }

  // ── 8. Sentiment context ──────────────────────────────────────────────────
  let sentimentContext = "";
  try {
    const s = await analyseSentiment(newsArticles, crop, district);
    sentimentContext =
      `\nNEWS SENTIMENT — ${crop} in ${district}:\n` +
      `- Overall sentiment: ${s.sentiment} (score: ${s.sentiment_score}, confidence: ${s.confidence}%)\n` +
      `- Impact type: ${s.impact_type}\n` +
      `- Market effect: ${s.market_effect}\n` +
      `- Price signal: ${s.price_signal > 0 ? "+" : ""}${(s.price_signal * 100).toFixed(0)}% pressure on forecast\n` +
      (s.keywords.negative.length ? `- Risk signals: ${s.keywords.negative.slice(0, 5).join(", ")}\n` : "") +
      (s.keywords.positive.length ? `- Positive signals: ${s.keywords.positive.slice(0, 5).join(", ")}\n` : "") +
      (s.explanation ? `- AI analysis: ${s.explanation}` : "");
    sources.push({ type: "NLP Sentiment Engine", sentiment: s.sentiment, score: s.sentiment_score, confidence: s.confidence });
  } catch { /* non-critical */ }

  const fullContext = [
    priceContext, compContext, predLogContext,
    weatherContext, forecastContext, newsContext,
    mspContext, sentimentContext,
  ].filter(Boolean).join("\n");

  return { context: fullContext, sources };
}

module.exports = { retrieveContext };
