require("dotenv").config();
const pool = require("./config/db");

const CROPS = {
  Rice:      { base: 2200, s: [1.00,1.00,0.95,0.92,0.90,0.93,1.05,1.10,1.08,1.05,1.02,1.00] },
  Maize:     { base: 1800, s: [1.00,1.02,1.05,1.08,1.05,0.98,0.95,0.97,1.00,1.02,1.00,0.98] },
  Tomato:    { base: 1200, s: [1.20,1.10,0.90,0.80,0.70,0.80,1.00,1.30,1.50,1.40,1.30,1.20] },
  Onion:     { base: 1500, s: [1.10,1.00,0.90,0.85,0.80,0.90,1.00,1.10,1.20,1.30,1.20,1.10] },
  Chilli:    { base: 8000, s: [1.00,1.05,1.10,1.15,1.10,1.00,0.95,0.90,0.92,0.95,0.98,1.00] },
  Cotton:    { base: 6500, s: [0.95,0.90,0.88,0.90,0.95,1.00,1.05,1.10,1.08,1.05,1.00,0.97] },
  Groundnut: { base: 5200, s: [1.00,1.00,1.02,1.05,1.08,1.05,1.00,0.98,0.97,0.98,1.00,1.00] },
  Turmeric:  { base: 7500, s: [1.00,1.05,1.10,1.08,1.05,1.00,0.95,0.92,0.93,0.95,0.98,1.00] },
};

const LOCATIONS = {
  "Andhra Pradesh": [
    "Srikakulam","Vizianagaram","Visakhapatnam",
    "East Godavari","West Godavari","Krishna",
    "Guntur","Prakasam","Nellore",
    "Chittoor","Kadapa","Anantapur","Kurnool",
  ],
  "Telangana": [
    "Hyderabad","Rangareddy","Medak",
    "Nizamabad","Adilabad","Karimnagar",
    "Warangal","Khammam","Nalgonda","Mahbubnagar",
  ],
};

const DIST_MULT = {
  Guntur:1.12, Warangal:1.08, Nizamabad:1.05,
  Krishna:1.06, "East Godavari":1.04, Khammam:1.03,
  Karimnagar:1.02, Nellore:1.02,
};

function genPrice(crop, district, dateStr) {
  const { base, s } = CROPS[crop];
  const month  = new Date(dateStr).getMonth();
  const mult   = DIST_MULT[district] || 1.0;
  const noise  = 0.97 + Math.random() * 0.06;
  const modal  = Math.round(base * s[month] * mult * noise);
  const spread = Math.round(modal * (0.04 + Math.random() * 0.04));
  return { min_price: modal - spread, max_price: modal + spread, modal_price: modal };
}

async function seed() {
  console.log("🌾  Clearing old data and reseeding…");

  // Drop + recreate for clean state
  await pool.execute("DROP TABLE IF EXISTS market_data");
  await pool.execute(`
    CREATE TABLE market_data (
      id          INT PRIMARY KEY AUTO_INCREMENT,
      crop        VARCHAR(100) NOT NULL,
      state       VARCHAR(100) NOT NULL,
      district    VARCHAR(100) NOT NULL,
      min_price   FLOAT        NOT NULL,
      max_price   FLOAT        NOT NULL,
      modal_price FLOAT        NOT NULL,
      date        DATE         NOT NULL,
      INDEX idx_crop_district (crop, district),
      INDEX idx_date (date)
    )
  `);

  // Only last 30 days — fast and sufficient for prediction
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 30);

  const allRows = [];
  for (const [state, districts] of Object.entries(LOCATIONS)) {
    for (const district of districts) {
      for (const crop of Object.keys(CROPS)) {
        const cur = new Date(start);
        while (cur <= today) {
          const dateStr = cur.toISOString().split("T")[0];
          const { min_price, max_price, modal_price } = genPrice(crop, district, dateStr);
          allRows.push([crop, state, district, min_price, max_price, modal_price, dateStr]);
          cur.setDate(cur.getDate() + 1);
        }
      }
    }
  }

  // Single bulk insert — split into chunks of 1000
  const CHUNK = 1000;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    const chunk = allRows.slice(i, i + CHUNK);
    const ph    = chunk.map(() => "(?,?,?,?,?,?,?)").join(",");
    await pool.execute(
      `INSERT INTO market_data (crop,state,district,min_price,max_price,modal_price,date) VALUES ${ph}`,
      chunk.flat()
    );
  }

  console.log(`✅  Seeded ${allRows.length} records (last 30 days, AP + Telangana)`);
  return allRows.length;
}

// Run directly: node seedMarket.js
if (require.main === module) {
  seed()
    .then((n) => { console.log(`Done: ${n} rows`); process.exit(0); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { seed };
