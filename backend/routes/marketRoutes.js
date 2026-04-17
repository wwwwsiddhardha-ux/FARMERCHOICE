const express = require("express");
const router = express.Router();
const { addPrice, getPrices } = require("../controllers/marketController");
const { authMiddleware, marketOnly } = require("../middleware/authMiddleware");

router.post("/add-price", authMiddleware, marketOnly, addPrice);
router.get("/prices", authMiddleware, getPrices);

module.exports = router;
