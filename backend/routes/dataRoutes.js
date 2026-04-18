const express = require("express");
const router  = express.Router();
const { weather, news, marketData, alerts } = require("../controllers/dataController");
const { recommendation, districtComparison } = require("../controllers/recommendController");

router.get("/weather",             weather);
router.get("/news",                news);
router.get("/market-data",         marketData);
router.get("/alerts",              alerts);

// GET /api/recommendation?crop=&state=&district=
router.get("/recommendation",      recommendation);

// GET /api/market-comparison?crop=&state=&district=
// Also keep old path for backward compat
router.get("/market-comparison",   districtComparison);
router.get("/district-comparison", districtComparison);

module.exports = router;
