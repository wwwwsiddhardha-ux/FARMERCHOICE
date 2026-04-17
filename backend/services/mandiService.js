const mandiData = require("../data/mandi_prices.json");

function getMandiData(crop, district, mandal) {
  const filtered = mandiData.filter(
    (d) =>
      d.crop.toLowerCase() === crop.toLowerCase() &&
      d.district.toLowerCase() === district.toLowerCase() &&
      (!mandal || d.mandal.toLowerCase() === mandal.toLowerCase())
  );
  return filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
}

module.exports = { getMandiData };
