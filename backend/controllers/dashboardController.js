const pool                               = require("../config/db");
const { getWeather, getWeatherForecast } = require("../services/weatherService");
const { getNews }                        = require("../services/newsService");
const { analyseSentiment }               = require("../services/sentimentService");

// ── Reconcile prediction accuracy against actual market prices ────────────────
async function reconcile() {
  await pool.execute(`
    UPDATE prediction_log pl
    JOIN   market_data md
      ON   md.crop     = pl.crop
      AND  md.district = pl.district
      AND  md.date     = pl.target_date
    SET    pl.actual_price = md.modal_price,
           pl.accuracy_pct = ROUND(
             100 - ABS(pl.predicted_price - md.modal_price) / md.modal_price * 100, 1
           )
    WHERE  pl.actual_price IS NULL
  `).catch(() => {});
}

// GET /api/dashboard?district=Guntur&crop=Rice&state=Andhra Pradesh
async function dashboard(req, res) {
  const { district, crop, state } = req.query;
  if (!district) return res.status(400).json({ error: "district query param required" });

  const safeCrop  = crop  || "Rice";
  const safeState = state || "Andhra Pradesh";

  try {
    // Run all data fetches in parallel
    const [
      weather,
      weatherForecast,
      newsArticles,
    ] = await Promise.all([
      getWeather(district),
      getWeatherForecast(district),
      getNews(district, safeCrop),
    ]);

    // Sentiment from news
    let sentiment = null;
    try {
      sentiment = await analyseSentiment(newsArticles, safeCrop, district);
    } catch { /* non-critical */ }

    // Accuracy summary (reconcile first)
    await reconcile();
    const [accSummary] = await pool.execute(
      `SELECT ROUND(AVG(accuracy_pct), 1)   AS avg_accuracy,
              COUNT(*)                       AS total_predictions,
              SUM(accuracy_pct >= 95)        AS excellent_count,
              SUM(accuracy_pct >= 90)        AS high_count,
              MAX(accuracy_pct)              AS best_accuracy,
              MIN(accuracy_pct)              AS worst_accuracy
       FROM   prediction_log
       WHERE  actual_price IS NOT NULL`
    ).catch(() => [[{}]]);

    // Recent prediction log (last 5 resolved)
    const [recentPredictions] = await pool.execute(
      `SELECT crop, district, predicted_price, actual_price, accuracy_pct, target_date
       FROM   prediction_log
       WHERE  actual_price IS NOT NULL
       ORDER  BY target_date DESC
       LIMIT  5`
    ).catch(() => [[]]);

    // Accuracy time-series for chart (last 14 days)
    const [accuracyTimeSeries] = await pool.execute(
      `SELECT target_date AS date,
              ROUND(AVG(accuracy_pct), 1) AS avg_accuracy,
              COUNT(*) AS count
       FROM   prediction_log
       WHERE  actual_price IS NOT NULL
       GROUP  BY target_date
       ORDER  BY target_date DESC
       LIMIT  14`
    ).catch(() => [[]]);

    // Weather-based agricultural impact
    const w = weather;
    let weatherImpact = { level: "normal", message: "Weather conditions are normal for farming." };
    if (w.rain > 10)          weatherImpact = { level: "danger",  message: `Heavy rain (${w.rain}mm) — supply disruption risk, prices may spike.` };
    else if (w.rain > 5)      weatherImpact = { level: "warning", message: `Moderate rain (${w.rain}mm) — monitor mandi prices closely.` };
    else if (w.temperature > 42) weatherImpact = { level: "danger",  message: `Extreme heat (${w.temperature}°C) — crop quality risk, prices may fall.` };
    else if (w.temperature > 38) weatherImpact = { level: "warning", message: `High temperature (${w.temperature}°C) — ensure proper crop storage.` };
    else if (w.humidity > 85)    weatherImpact = { level: "warning", message: `High humidity (${w.humidity}%) — fungal disease risk in storage.` };

    // 5-day weather forecast summary
    const forecastSummary = weatherForecast.slice(0, 5).map((d) => ({
      date:      d.date,
      tempMax:   d.tempMax,
      tempMin:   d.tempMin,
      rain:      d.rain,
      condition: d.condition,
    }));

    // News impact summary (top 5 articles with impact)
    const newsImpact = newsArticles.slice(0, 5).map((n) => ({
      title:       n.title,
      source:      n.source,
      publishedAt: n.publishedAt,
      impact:      n.impact,
    }));

    // Alerts from weather + news
    const alerts = [];
    if (w.rain > 10)
      alerts.push({ type: "danger",  message: "🌧 Heavy rain expected — possible supply disruption." });
    else if (w.rain > 5)
      alerts.push({ type: "warning", message: "🌦 Moderate rain forecast — monitor prices closely." });
    if (w.temperature > 42)
      alerts.push({ type: "danger",  message: "🌡 Extreme heat alert — crop quality risk." });
    else if (w.temperature > 38)
      alerts.push({ type: "warning", message: "☀️ High temperature — ensure proper storage." });
    if (w.humidity > 85)
      alerts.push({ type: "warning", message: "💧 High humidity — fungal disease risk." });
    for (const n of newsArticles) {
      if (n.impact?.type === "danger")
        alerts.push({ type: "danger",  message: `📰 ${n.title}` });
      else if (n.impact?.type === "warning")
        alerts.push({ type: "warning", message: `📰 ${n.title}` });
    }
    if (!alerts.length)
      alerts.push({ type: "info", message: "✅ Weather and market conditions are normal." });

    res.json({
      district,
      crop:    safeCrop,
      state:   safeState,

      // Weather section
      weather: {
        current:        w,
        forecast:       forecastSummary,
        agriculturalImpact: weatherImpact,
      },

      // News section
      news: {
        articles:  newsImpact,
        sentiment: sentiment
          ? {
              label:       sentiment.sentiment,
              score:       sentiment.sentiment_score,
              impact_type: sentiment.impact_type,
              market_effect: sentiment.market_effect,
              price_signal:  sentiment.price_signal,
              confidence:    sentiment.confidence,
            }
          : null,
      },

      // Alerts
      alerts,

      // Accuracy section
      accuracy: {
        summary:     accSummary[0] || null,
        recent:      recentPredictions,
        time_series: accuracyTimeSeries.reverse(), // chronological
      },
    });
  } catch (err) {
    console.error("[Dashboard]", err.message);
    res.status(500).json({ error: err.message || "Dashboard fetch failed" });
  }
}

module.exports = { dashboard };
