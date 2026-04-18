const axios = require("axios");

const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 min

async function getNews(district, crop = '') {
  const key = `${district.toLowerCase()}:${crop.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const cropPart = crop ? `"${crop}" OR ` : '';
  const keywords = `${cropPart}"${district}" cyclone OR "heavy rain" OR "crop damage" OR "flood" OR "drought" India agriculture`;
  const result = [];

  try {
    // GNews free tier — 100 req/day
    const GNEWS_KEY = process.env.GNEWS_API_KEY;
    if (GNEWS_KEY) {
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(keywords)}&lang=en&country=in&max=5&apikey=${GNEWS_KEY}`;
      const { data } = await axios.get(url, { timeout: 4000 });
      for (const a of data.articles || []) {
        result.push({
          title:       a.title,
          description: a.description || "",
          url:         a.url,
          source:      a.source?.name || "News",
          publishedAt: a.publishedAt,
          impact:      classifyImpact(a.title + " " + (a.description || "")),
        });
      }
    }
  } catch { /* fallback below */ }

  // If no API key or failed, return contextual static news
  if (!result.length) {
    result.push(...getStaticNews(district, crop));
  }

  cache.set(key, { data: result, ts: Date.now() });
  return result;
}


function classifyImpact(text) {
  const t = text.toLowerCase();
  if (/cyclone|flood|heavy rain|crop damage|disaster/.test(t))
    return { type: "danger", priceEffect: +0.08, label: "Supply Disruption" };
  if (/drought|heat wave|water shortage/.test(t))
    return { type: "warning", priceEffect: +0.05, label: "Drought Risk" };
  if (/good harvest|bumper crop|record production/.test(t))
    return { type: "info", priceEffect: -0.04, label: "Bumper Harvest" };
  return { type: "info", priceEffect: 0, label: "Market News" };
}

function getStaticNews(district, crop = '') {
  const cropLabel = crop || 'crop';
  return [
    {
      title:       `${district} mandi: ${cropLabel} prices stable amid normal monsoon`,
      description: `Agricultural markets in ${district} report steady ${cropLabel} prices with adequate supply.`,
      url:         "#",
      source:      "AgriNews",
      publishedAt: new Date().toISOString(),
      impact:      { type: "info", priceEffect: 0, label: "Market Update" },
    },
    {
      title:       `Government announces MSP hike for ${cropLabel}`,
      description: "Minimum support prices increased by 5-8% for major crops this season.",
      url:         "#",
      source:      "AgriNews",
      publishedAt: new Date().toISOString(),
      impact:      { type: "info", priceEffect: +0.03, label: "Policy Update" },
    },
  ];
}

module.exports = { getNews, classifyImpact };
