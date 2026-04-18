const pool = require("../config/db");

// GET /api/location/states
async function getStates(req, res) {
  try {
    const [rows] = await pool.execute(
      "SELECT DISTINCT state FROM market_data ORDER BY state"
    );
    const states = rows.map((r) => r.state);
    if (!states.length) return res.json(["Andhra Pradesh", "Telangana"]);
    res.json(states);
  } catch {
    res.json(["Andhra Pradesh", "Telangana"]);
  }
}

// GET /api/location/districts?state=Andhra Pradesh
async function getDistricts(req, res) {
  const { state } = req.query;
  if (!state) return res.status(400).json({ error: "state query param required" });
  try {
    const [rows] = await pool.execute(
      "SELECT DISTINCT district FROM market_data WHERE state = ? ORDER BY district",
      [state]
    );
    res.json(rows.map((r) => r.district));
  } catch {
    res.json([]);
  }
}

// GET /api/location/crops?state=Andhra Pradesh&district=Guntur
// Without params → returns all unique crops (used by MarketUploadView)
async function getCropsByDistrict(req, res) {
  const { state, district } = req.query;
  try {
    if (state && district) {
      const [rows] = await pool.execute(
        "SELECT DISTINCT crop FROM market_data WHERE state = ? AND district = ? ORDER BY crop",
        [state, district]
      );
      return res.json(rows.map((r) => r.crop));
    }
    // No filters — return all unique crops
    const [rows] = await pool.execute(
      "SELECT DISTINCT crop FROM market_data ORDER BY crop"
    );
    res.json(rows.map((r) => r.crop));
  } catch {
    res.json([]);
  }
}

module.exports = { getStates, getDistricts, getCropsByDistrict };
