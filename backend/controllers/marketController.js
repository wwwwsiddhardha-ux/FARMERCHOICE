const pool = require("../config/db");

async function addPrice(req, res) {
  const { crop, state, district, min_price, max_price, price, date } = req.body;
  if (!crop || !state || !district || !price || !date)
    return res.status(400).json({ error: "crop, state, district, price, date are required" });

  const modal = parseFloat(price);
  const min   = min_price ? parseFloat(min_price) : Math.round(modal * 0.95);
  const max   = max_price ? parseFloat(max_price) : Math.round(modal * 1.05);

  try {
    await pool.execute(
      "INSERT INTO market_data (crop, state, district, min_price, max_price, modal_price, date) VALUES (?,?,?,?,?,?,?)",
      [crop, state, district, min, max, modal, date]
    );
    res.status(201).json({ message: "Price entry added successfully" });
  } catch {
    res.status(500).json({ error: "Failed to add price entry" });
  }
}

async function getPrices(req, res) {
  const { crop, district } = req.query;
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM market_data WHERE crop = ? AND district = ?
       ORDER BY date DESC LIMIT 30`,
      [crop, district]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch prices" });
  }
}

module.exports = { addPrice, getPrices };
