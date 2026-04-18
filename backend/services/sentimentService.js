const { queryOpenRouter } = require("./openrouterService");

// ── Weighted keyword lexicon ──────────────────────────────────────────────────
// Each entry: [keyword, weight]  (title match = weight×2, description = weight×1)

const NEG = [
  // Disasters
  ["cyclone", 3], ["flood", 3], ["heavy rain", 2], ["crop damage", 3],
  ["disaster", 2], ["drought", 3], ["heat wave", 2], ["water shortage", 2],
  // Pests & disease
  ["pest", 2], ["disease", 2], ["outbreak", 2], ["locust", 3],
  ["blight", 2], ["wilting", 2], ["fungal", 2], ["infestation", 2],
  // Market negatives
  ["price crash", 3], ["oversupply", 2], ["glut", 2], ["ban", 2],
  ["export ban", 3], ["strike", 2], ["protest", 1], ["contamination", 2],
  ["frost", 2], ["hailstorm", 2], ["landslide", 2], ["shortage", 1],
  ["inflation", 1], ["price fall", 2], ["market crash", 3],
  // AP/Telangana specific
  ["andhra flood", 3], ["telangana drought", 3], ["krishna flood", 3],
  ["godavari flood", 3], ["cyclone warning", 3], ["red alert", 2],
  ["crop loss", 3], ["yield loss", 2], ["storage damage", 2],
];

const POS = [
  // Harvest
  ["good harvest", 3], ["bumper crop", 3], ["record production", 3],
  ["high yield", 2], ["excellent crop", 2], ["abundant harvest", 2],
  // Demand & prices
  ["export demand", 2], ["price rise", 2], ["price increase", 2],
  ["market rally", 2], ["strong demand", 2], ["high demand", 2],
  ["shortage eases", 2], ["recovery", 1], ["surplus demand", 2],
  // Policy
  ["msp hike", 3], ["subsidy", 2], ["irrigation", 1], ["government support", 2],
  ["procurement", 2], ["bonus", 2], ["incentive", 1],
  // Weather positive
  ["rainfall normal", 2], ["favorable weather", 2], ["good monsoon", 2],
  ["adequate rain", 2], ["normal monsoon", 2],
  // AP/Telangana specific
  ["rytu bandhu", 2], ["pm kisan", 2], ["kharif bonus", 2],
  ["rabi support", 2], ["ap agriculture", 1], ["telangana farmer", 1],
];

const NEUTRAL = [
  "stable", "normal", "unchanged", "moderate", "average",
  "steady", "mixed", "expected", "forecast", "predicted",
];

// ── Score a single article ────────────────────────────────────────────────────
function scoreArticle(article) {
  const title = (article.title || "").toLowerCase();
  const desc  = (article.description || "").toLowerCase();
  let score   = 0;
  const matched = { negative: [], positive: [], neutral: [] };

  for (const [kw, w] of NEG) {
    const inTitle = title.includes(kw);
    const inDesc  = desc.includes(kw);
    if (inTitle || inDesc) {
      score -= w * (inTitle ? 2 : 1);
      matched.negative.push(kw);
    }
  }
  for (const [kw, w] of POS) {
    const inTitle = title.includes(kw);
    const inDesc  = desc.includes(kw);
    if (inTitle || inDesc) {
      score += w * (inTitle ? 2 : 1);
      matched.positive.push(kw);
    }
  }
  for (const kw of NEUTRAL) {
    if (title.includes(kw) || desc.includes(kw)) matched.neutral.push(kw);
  }

  return { score, matched };
}

// ── Classify normalised score ─────────────────────────────────────────────────
function classify(normScore) {
  if (normScore <= -1.5) return "Negative";
  if (normScore >=  1.5) return "Positive";
  return "Neutral";
}

// ── Market effect + price signal ─────────────────────────────────────────────
function marketEffect(sentiment, normScore) {
  if (sentiment === "Negative") {
    if (normScore <= -4) return { effect: "Severe supply disruption — prices likely to spike sharply",   priceSignal: +0.10 };
    if (normScore <= -2) return { effect: "Strong supply pressure — prices expected to rise",             priceSignal: +0.06 };
    return               { effect: "Moderate supply concern — slight upward price pressure",              priceSignal: +0.03 };
  }
  if (sentiment === "Positive") {
    if (normScore >= 4)  return { effect: "Bumper harvest signal — prices likely to soften significantly", priceSignal: -0.07 };
    if (normScore >= 2)  return { effect: "Good harvest conditions — prices may ease slightly",            priceSignal: -0.03 };
    return               { effect: "Positive market conditions — prices stable to slightly lower",         priceSignal: -0.01 };
  }
  return { effect: "Market conditions appear stable — no major price movement expected", priceSignal: 0 };
}

// ── Impact type label ─────────────────────────────────────────────────────────
function impactLabel(sentiment, keywords) {
  const neg = keywords.negative;
  const pos = keywords.positive;
  if (sentiment === "Negative") {
    if (neg.some((k) => ["cyclone", "flood", "disaster", "landslide"].includes(k))) return "Disaster Risk";
    if (neg.some((k) => ["drought", "heat wave", "water shortage"].includes(k)))    return "Drought Risk";
    if (neg.some((k) => ["pest", "disease", "locust", "blight"].includes(k)))       return "Pest/Disease Risk";
    return "Supply Disruption";
  }
  if (sentiment === "Positive") {
    if (pos.some((k) => ["bumper crop", "good harvest", "record production"].includes(k))) return "Bumper Harvest";
    if (pos.some((k) => ["msp hike", "subsidy", "government support"].includes(k)))        return "Policy Support";
    if (pos.some((k) => ["export demand", "high demand", "strong demand"].includes(k)))    return "Demand Surge";
    return "Market Positive";
  }
  return "Market Stable";
}

// ── Confidence in the sentiment result ───────────────────────────────────────
function sentimentConfidence(articles, totalScore) {
  if (!articles.length) return 0;
  const absScore = Math.abs(totalScore);
  if (absScore >= 6 && articles.length >= 3) return 90;
  if (absScore >= 3 && articles.length >= 2) return 72;
  if (absScore >= 1) return 55;
  return 35;
}

// ── Main function ─────────────────────────────────────────────────────────────
async function analyseSentiment(articles, crop, district) {
  if (!articles?.length) {
    return {
      sentiment:        "Neutral",
      sentiment_score:  0,
      normalised_score: 0,
      impact_type:      "No News",
      market_effect:    "Insufficient news data for analysis",
      price_signal:     0,
      confidence:       0,
      keywords:         { negative: [], positive: [], neutral: [] },
      article_count:    0,
      per_article:      [],
      explanation:      null,
    };
  }

  let totalScore = 0;
  const allMatched = { negative: [], positive: [], neutral: [] };
  const perArticle = [];

  for (const article of articles) {
    const { score, matched } = scoreArticle(article);
    totalScore += score;
    allMatched.negative.push(...matched.negative);
    allMatched.positive.push(...matched.positive);
    allMatched.neutral.push(...matched.neutral);

    const artSentiment = score < -1 ? "Negative" : score > 1 ? "Positive" : "Neutral";
    perArticle.push({
      title:     article.title,
      score,
      sentiment: artSentiment,
      source:    article.source || "News",
      url:       article.url || "#",
    });
  }

  const keywords = {
    negative: [...new Set(allMatched.negative)],
    positive: [...new Set(allMatched.positive)],
    neutral:  [...new Set(allMatched.neutral)],
  };

  const normScore  = parseFloat((totalScore / articles.length).toFixed(2));
  const sentiment  = classify(normScore);
  const { effect, priceSignal } = marketEffect(sentiment, normScore);
  const impact_type = impactLabel(sentiment, keywords);
  const confidence  = sentimentConfidence(articles, totalScore);

  // OpenRouter explanation (non-blocking)
  let explanation = null;
  try {
    const snippets = articles.slice(0, 3).map((a, i) => `${i + 1}. ${a.title}`).join("\n");
    const ctx = `News about ${crop} in ${district}:\n${snippets}\n\n` +
      `Sentiment: ${sentiment} (score: ${normScore})\n` +
      `Negative signals: ${keywords.negative.slice(0, 5).join(", ") || "none"}\n` +
      `Positive signals: ${keywords.positive.slice(0, 5).join(", ") || "none"}`;

    const { answer } = await queryOpenRouter(
      `In 2-3 sentences, explain how these news headlines may affect ${crop} prices in ${district}. Be specific and use numbers if possible.`,
      ctx
    );
    explanation = answer;
  } catch { /* non-critical */ }

  return {
    sentiment,
    sentiment_score:  parseFloat(totalScore.toFixed(2)),
    normalised_score: normScore,
    impact_type,
    market_effect:    effect,
    price_signal:     priceSignal,
    confidence,
    keywords,
    article_count:    articles.length,
    per_article:      perArticle,
    explanation,
  };
}

// Legacy export kept for backward compat
function scoreText(text) {
  const article = { title: text, description: "" };
  return scoreArticle(article);
}

module.exports = { analyseSentiment, scoreText };
