const cron = require("node-cron");
const pool = require("../config/db");

function vary(price) {
  return Math.round(price * (1 + (Math.random() * 0.04 - 0.02)));
}

async function ensurePredictionLog() {
  await pool.execute(`
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
}

async function refreshPrices() {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Check if today's data already exists
    const [existing] = await pool.execute(
      "SELECT COUNT(*) AS c FROM market_data WHERE date = ?", [today]
    );
    if (existing[0].c > 0) return;

    // Get latest price per crop+district using a JOIN (avoids subquery-on-same-table issue)
    const [latest] = await pool.execute(`
      SELECT m.crop, m.state, m.district, m.min_price, m.max_price, m.modal_price
      FROM market_data m
      INNER JOIN (
        SELECT crop, district, MAX(date) AS max_date
        FROM market_data
        GROUP BY crop, district
      ) AS lm ON m.crop = lm.crop AND m.district = lm.district AND m.date = lm.max_date
    `);

    if (!latest.length) return;

    const rows = latest.map((row) => {
      const modal  = vary(row.modal_price);
      const spread = Math.round(modal * 0.05);
      return [row.crop, row.state, row.district, modal - spread, modal + spread, modal, today];
    });

    // Batch insert
    const ph = rows.map(() => "(?,?,?,?,?,?,?)").join(",");
    await pool.execute(
      `INSERT IGNORE INTO market_data (crop,state,district,min_price,max_price,modal_price,date) VALUES ${ph}`,
      rows.flat()
    );

    console.log(`[CRON] Refreshed ${rows.length} price records for ${today}`);

    // Reconcile prediction accuracy
    await pool.execute(`
      UPDATE prediction_log pl
      JOIN   market_data md
        ON   md.crop = pl.crop AND md.district = pl.district AND md.date = pl.target_date
      SET    pl.actual_price = md.modal_price,
             pl.accuracy_pct = ROUND(
               100 - ABS(pl.predicted_price - md.modal_price) / md.modal_price * 100, 1
             )
      WHERE  pl.actual_price IS NULL
    `).catch(() => {});

  } catch (e) {
    console.error("[CRON] Error:", e.message);
  }
}

function startCron() {
  ensurePredictionLog();
  cron.schedule("0 6 * * *", refreshPrices);
  console.log("⏰ Daily price refresh cron scheduled (6:00 AM)");
}

module.exports = { startCron, refreshPrices };
