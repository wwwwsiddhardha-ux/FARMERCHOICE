const express = require("express");
const router  = express.Router();
const { getStates, getDistricts, getCropsByDistrict } = require("../controllers/locationController");

router.get("/states",    getStates);
router.get("/districts", getDistricts);
router.get("/crops",     getCropsByDistrict);   // ?state=...&district=...

module.exports = router;
