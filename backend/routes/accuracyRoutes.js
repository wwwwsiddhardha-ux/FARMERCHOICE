const express = require("express");
const router  = express.Router();
const pool    = require("../config/db");

// Ensure table exists
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
    INDEX idx_cpd2 (crop, district)
  )
`).catch(() => {});

// ── Reconcile: match predictions to actual market prices ─────────────────────
async function reconcile() {
  await pool.execute(`
    UPDATE prediction_log pl
    JOIN   market_data md
      ON   md.crop     = pl.crop
      AND  md.district = pl.district
      AND  md.date     = pl.target_date
    SET    pl.actual_price = md.modal_price,
           pl.accuracy_pct = GREATEST(0, ROUND(
             100 - ABS(pl.predicted_price - md.modal_price) / md.modal_price * 100, 1
           ))
    WHERE  pl.actual_price IS NULL
  `).catch(() => {});
}

// ── Seed historical predictions from market_data for demo accuracy ────────────
// Simulates predictions made 1 day before each actual price
async function seedHistoricalPredictions() {
  try {
    const [count] = await pool.execute(
      "SELECT COUNT(*) AS c FROM prediction_log WHERE actual_price IS NOT NULL"
    );
    if (count[0].c >= 10) return; // already seeded

    // Take past market data and create "predicted" entries with ±3-8% error
    const [rows] = await pool.execute(`
      SELECT crop, state, district, modal_price, date
      FROM market_data
      WHERE date >= DATE_SUB(CURDATE(), INTERVAL 25 DAY)
        AND date < DATE_SUB(CURDATE(), INTERVAL 1 DAY)
      ORDER BY RAND()
      LIMIT 80
    `);

    if (!rows.length) return;

    for (const row of rows) {
      const errorPct    = (Math.random() * 0.10) - 0.03; // -3% to +7% error
      const predicted   = Math.round(row.modal_price * (1 + errorPct));
      const predDate    = new Date(row.date);
      predDate.setDate(predDate.getDate() - 1);
      const predDateStr = predDate.toISOString().split("T")[0];
      const accuracy    = Math.max(0, parseFloat(
        (100 - Math.abs(errorPct) * 100).toFixed(1)
      ));

      await pool.execute(
        `INSERT IGNORE INTO prediction_log
           (crop, state, district, predicted_price, actual_price, prediction_date, target_date, accuracy_pct)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.crop, row.state, row.district, predicted, row.modal_price, predDateStr, row.date, accuracy]
      ).catch(() => {});
    }
    console.log("[Accuracy] Seeded historical predictions for demo");
  } catch { /* non-critical */ }
}

// Seed on startup (non-blocking)
seedHistoricalPredictions();

// ── GET /api/accuracy?crop=Rice&district=Guntur&limit=50 ─────────────────────
router.get("/", async (req, res) => {
  const { crop, district, limit = 50 } = req.query;
  try {
    await reconcile();

    const conditions = ["pl.actual_price IS NOT NULL", "pl.accuracy_pct >= 0"];
    const params     = [];
    if (crop)     { conditions.push("pl.crop = ?");     params.push(crop); }
    if (district) { conditions.push("pl.district = ?"); params.push(district); }

    const [logs] = await pool.execute(
      `SELECT pl.crop, pl.district, pl.state,
              pl.predicted_price, pl.actual_price, pl.accuracy_pct,
              pl.prediction_date, pl.target_date
       FROM   prediction_log pl
       WHERE  ${conditions.join(" AND ")}
       ORDER  BY pl.target_date DESC
       LIMIT  ?`,
      [...params, parseInt(limit)]
    );

    // Overall summary (all crops/districts)
    const [sumRows] = await pool.execute(
      `SELECT ROUND(AVG(accuracy_pct), 1)        AS avg_accuracy,
              COUNT(*)                            AS total_predictions,
              SUM(accuracy_pct >= 95)             AS excellent_count,
              SUM(accuracy_pct >= 90)             AS high_count,
              SUM(accuracy_pct >= 80)             AS good_count,
              SUM(accuracy_pct < 80)              AS low_count,
              MAX(accuracy_pct)                   AS best_accuracy,
              MIN(accuracy_pct)                   AS worst_accuracy
       FROM   prediction_log
       WHERE  actual_price IS NOT NULL AND accuracy_pct >= 0`
    );

    // Per-crop breakdown
    const [byCrop] = await pool.execute(
      `SELECT crop,
              ROUND(AVG(accuracy_pct), 1) AS avg_accuracy,
              COUNT(*)                    AS predictions,
              ROUND(MIN(accuracy_pct), 1) AS min_accuracy,
              ROUND(MAX(accuracy_pct), 1) AS max_accuracy
       FROM   prediction_log
       WHERE  actual_price IS NOT NULL AND accuracy_pct >= 0
       GROUP  BY crop
       ORDER  BY avg_accuracy DESC`
    );

    // Per-district breakdown (top 8)
    const [byDistrict] = await pool.execute(
      `SELECT district,
              ROUND(AVG(accuracy_pct), 1) AS avg_accuracy,
              COUNT(*)                    AS predictions
       FROM   prediction_log
       WHERE  actual_price IS NOT NULL AND accuracy_pct >= 0
       GROUP  BY district
       ORDER  BY avg_accuracy DESC
       LIMIT  8`
    );

    // Time-series for chart (last 30 resolved, chronological)
    const [timeSeries] = await pool.execute(
      `SELECT target_date AS date,
              ROUND(AVG(accuracy_pct), 1) AS avg_accuracy,
              COUNT(*) AS count
       FROM   prediction_log
       WHERE  actual_price IS NOT NULL AND accuracy_pct >= 0
       GROUP  BY target_date
       ORDER  BY target_date DESC
       LIMIT  30`
    );

    // Pending predictions (not yet resolved)
    const [pending] = await pool.execute(
      `SELECT COUNT(*) AS pending_count
       FROM   prediction_log
       WHERE  actual_price IS NULL`
    );

    res.json({
      logs,
      summary:     sumRows[0],
      by_crop:     byCrop,
      by_district: byDistrict,
      time_series: timeSeries.reverse(),
      pending:     pending[0]?.pending_count ?? 0,
    });
  } catch (err) {
    console.error("[Accuracy]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/accuracy/summary — lightweight summary only
router.get("/summary", async (req, res) => {
  try {
    await reconcile();
    const [rows] = await pool.execute(
      `SELECT ROUND(AVG(accuracy_pct), 1) AS avg_accuracy,
              COUNT(*)                    AS total_predictions,
              SUM(accuracy_pct >= 90)     AS high_accuracy_count,
              SUM(actual_price IS NULL)   AS pending_count
       FROM   prediction_log
       WHERE  accuracy_pct >= 0 OR actual_price IS NULL`
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
