const express = require("express");
const router  = express.Router();
const { getNews }          = require("../services/newsService");
const { analyseSentiment } = require("../services/sentimentService");

// Shared handler
async function handleSentiment(district, crop, res) {
  if (!district || !crop)
    return res.status(400).json({ error: "district and crop are required" });

  try {
    const articles = await getNews(district);
    const result   = await analyseSentiment(articles, crop, district);

    // Chart-ready sentiment breakdown
    const sentimentChart = [
      { label: "Positive", count: result.per_article.filter((a) => a.sentiment === "Positive").length },
      { label: "Neutral",  count: result.per_article.filter((a) => a.sentiment === "Neutral").length },
      { label: "Negative", count: result.per_article.filter((a) => a.sentiment === "Negative").length },
    ];

    res.json({
      ...result,
      district,
      crop,
      articles_fetched: articles.length,
      articles,
      sentiment_chart: sentimentChart,
    });
  } catch (err) {
    console.error("[Sentiment]", err.message);
    res.status(500).json({ error: err.message || "Sentiment analysis failed" });
  }
}

// POST /api/news/sentiment  { district, crop }
router.post("/sentiment", (req, res) => {
  const { district, crop } = req.body;
  return handleSentiment(district, crop, res);
});

// GET /api/news/sentiment?district=Guntur&crop=Rice
router.get("/sentiment", (req, res) => {
  const { district, crop } = req.query;
  return handleSentiment(district, crop, res);
});

// GET /api/news?district=Guntur  — raw news articles (also handled by dataRoutes, kept here for direct access)
router.get("/articles", async (req, res) => {
  const { district } = req.query;
  if (!district) return res.status(400).json({ error: "district query param required" });
  try {
    const articles = await getNews(district);
    res.json({ news: articles, count: articles.length, district });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
