const { getWeather } = require("../services/weatherService");
const { predictPrices } = require("../services/predictionService");

async function predict(req, res) {
  const { crop, state, district, mandal } = req.body;
  if (!crop || !state || !district || !mandal)
    return res.status(400).json({ error: "crop, state, district, mandal are required" });

  const weather = await getWeather(district);
  const result = await predictPrices(crop, state, district, mandal, weather);

  if (!result)
    return res.status(404).json({ error: "No data found for given crop/district/mandal" });

  res.json({ ...result, weather });
}

module.exports = { predict };
