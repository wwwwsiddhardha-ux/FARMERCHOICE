const { getWeather, getWeatherForecast } = require("../services/weatherService");
const { getNews }                        = require("../services/newsService");
const { predictPrices }                  = require("../services/predictionService");
const { analyseSentiment }               = require("../services/sentimentService");
const pool                               = require("../config/db");

// Ensure prediction_log table exists
pool.execute(`
  CREATE TABLE IF NOT EXISTS prediction_log (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    crop            VARCHAR(100) NOT NULL,
    state           VARCHAR(100) NOT NULL,
    district        VARCHAR(100) NOT NULL,
    predicted_price FLOAT        NOT NULL,
    actual_price    FLOAT,
    prediction_date DATE         NOT NULL,
    target_date     DATE         NOT NULL,
    accuracy_pct    FLOAT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cpd (crop, district, target_date),
    INDEX idx_cpd (crop, district, target_date)
  )
`).catch(() => {});

async function logPrediction(crop, state, district, tomorrow) {
  try {
    const today = new Date().toISOString().split("T")[0];
    await pool.execute(
      `INSERT INTO prediction_log
         (crop, state, district, predicted_price, prediction_date, target_date)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE predicted_price = VALUES(predicted_price)`,
      [crop, state, district, tomorrow.price, today, tomorrow.date]
    );
  } catch { /* non-critical */ }
}

// POST /api/predict-price
// Returns ONLY forecast data — weather/news/dashboard data is separate
async function predict(req, res) {
  const { crop, state, district } = req.body;
  if (!crop || !state || !district)
    return res.status(400).json({ error: "crop, state, district are required" });

  try {
    // Fetch weather + forecast + news in parallel (needed for prediction engine)
    const [weather, weatherForecast, news] = await Promise.all([
      getWeather(district),
      getWeatherForecast(district),
      getNews(district),
    ]);

    // NLP sentiment feeds into price prediction
    let sentimentSignal = null;
    try {
      sentimentSignal = await analyseSentiment(news, crop, district);
    } catch { /* prediction works without sentiment */ }

    const result = await predictPrices(
      crop, state, district,
      weather, news, sentimentSignal,
      weatherForecast
    );

    if (!result)
      return res.status(404).json({
        error: `No data found for ${crop} in ${district}. Run: cd backend && node seedMarket.js`,
      });

    // Log tomorrow's prediction for accuracy tracking (fire-and-forget)
    if (result.tomorrow) logPrediction(crop, state, district, result.tomorrow);

    // Return ONLY forecast-focused data — no weather/news duplication
    res.json({
      crop,
      state,
      district,

      // Current baseline
      avgPrice:           result.avgPrice,
      trend:              result.trend,
      riskLevel:          result.riskLevel,
      volatility:         result.volatility,

      // Tomorrow
      tomorrow:           result.tomorrow,

      // 3-day and 7-day forecast with confidence intervals
      forecast3:          result.forecast3,
      predictedPrices:    result.predictedPrices,

      // Peak sell signal
      bestSellDay:        result.bestSellDay,
      predictedPeakPrice: result.predictedPeakPrice,

      // MSP
      msp:                result.msp,

      // District comparison
      bestDistrict:       result.bestDistrict,
      markets:            result.markets,

      // Prediction reasoning
      predictionSignals:  result.predictionSignals,
      alerts:             result.alerts,
      suggestion:         result.suggestion,

      // Sentiment (used by frontend for sentiment card)
      sentimentSignal,

      // Historical prices for chart
      historicalPrices:   result.historicalPrices,

      // Chart-ready data
      chartData:          result.chartData,

      // Weather included here because forecast engine uses it — frontend can use for weather card
      weather,
      weatherForecast,

      // News included for alerts card
      news,
    });
  } catch (err) {
    console.error("[Predict]", err.message);
    res.status(500).json({ error: err.message || "Prediction failed" });
  }
}

module.exports = { predict };
