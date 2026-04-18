const express    = require("express");
const router     = express.Router();
const { dashboard } = require("../controllers/dashboardController");

// GET /api/dashboard?district=Guntur&crop=Rice&state=Andhra Pradesh
router.get("/", dashboard);

module.exports = router;
