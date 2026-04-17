const pool = require("../config/db");

async function addPrice(req, res) {
  const { crop, state, district, mandal, price, date } = req.body;
  if (!crop || !state || !district || !mandal || !price || !date)
    return res.status(400).json({ error: "crop, state, district, mandal, price, date are required" });

  try {
    await pool.execute(
      "INSERT INTO mandi_prices (crop, state, district, mandal, price, date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [crop, state, district, mandal, price, date, req.user.id]
    );
    res.status(201).json({ message: "Price entry added successfully" });
  } catch {
    res.status(500).json({ error: "Failed to add price entry" });
  }
}

async function getPrices(req, res) {
  const { crop, district, mandal } = req.query;
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM mandi_prices WHERE crop = ? AND district = ? AND mandal = ? ORDER BY date DESC LIMIT 30",
      [crop, district, mandal]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch prices" });
  }
}

module.exports = { addPrice, getPrices };
