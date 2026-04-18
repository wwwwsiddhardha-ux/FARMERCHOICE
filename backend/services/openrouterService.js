const axios = require("axios");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const MODELS = [
  { id: "mistralai/mistral-small-3.1-24b-instruct:free", systemRole: true  },
  { id: "google/gemma-3-12b-it:free",                    systemRole: false },
  { id: "google/gemma-3-4b-it:free",                     systemRole: false },
];

// ── Known crops for detection ─────────────────────────────────────────────────
const KNOWN_CROPS = [
  "Rice", "Maize", "Wheat", "Cotton", "Groundnut", "Turmeric",
  "Tomato", "Onion", "Chilli", "Soybean", "Sugarcane", "Jowar",
  "Bajra", "Sunflower", "Mustard", "Potato", "Brinjal", "Okra",
  "Cabbage", "Cauliflower", "Mango", "Banana", "Papaya", "Coconut",
  "Arhar", "Moong", "Urad", "Chickpea", "Lentil", "Sesame",
];

// Detect crop name mentioned in the question (case-insensitive)
function detectCropFromQuestion(question) {
  const q = question.toLowerCase();
  for (const crop of KNOWN_CROPS) {
    if (q.includes(crop.toLowerCase())) return crop;
  }
  return null;
}

// ── Intent detection ──────────────────────────────────────────────────────────
const INTENTS = {
  price_query: {
    patterns: [/price|cost|rate|value|worth|how much|market rate|mandi/i],
    label: "Price Query", icon: "💰",
    needsData: true,
  },
  compare_districts: {
    patterns: [/compar|best district|which district|where.*sell|district.*price|versus|better.*market/i],
    label: "Compare Districts", icon: "📊",
    needsData: true,
  },
  sell_recommendation: {
    patterns: [/when.*sell|should.*sell|best time|hold|wait|sell now|profit|right time|advice|recommend/i],
    label: "Sell Recommendation", icon: "💡",
    needsData: true,
  },
  msp_query: {
    patterns: [/msp|minimum support|government price|procurement|floor price/i],
    label: "MSP Query", icon: "🏛",
    needsData: true,
  },
  weather_impact: {
    patterns: [/weather|rain|flood|drought|temperature|humidity|cyclone|monsoon|heat|cold|frost/i],
    label: "Weather Impact", icon: "🌦",
    needsData: true,
  },
  news_impact: {
    patterns: [/news|headline|report|impact|affect|market.*news|sentiment/i],
    label: "News Impact", icon: "📰",
    needsData: true,
  },
  explain_prediction: {
    patterns: [/why|reason|explain|because|cause|factor|signal|predict|how.*calculat|forecast/i],
    label: "Explain Prediction", icon: "🔍",
    needsData: true,
  },
  pest: {
    patterns: [/pest|insect|bug|aphid|whitefly|thrips|mite|borer|worm|caterpillar|locust|infestation|attack/i],
    label: "Pest Management", icon: "🐛",
    needsData: false,
  },
  disease: {
    patterns: [/disease|blight|rot|wilt|rust|mildew|fungus|fungal|bacterial|viral|infection|leaf.*spot|yellowing|brown.*spot/i],
    label: "Crop Disease", icon: "🦠",
    needsData: false,
  },
  cultivation: {
    patterns: [/grow|cultivat|plant|sow|harvest|irrigat|fertili|soil|seed|spacing|depth|yield|acre|hectare|nursery|transplant/i],
    label: "Cultivation Guide", icon: "🌱",
    needsData: false,
  },
  seasonal_risk: {
    patterns: [/season|kharif|rabi|zaid|summer|winter|monsoon.*crop|crop.*season|when.*grow|best.*month|sowing.*time/i],
    label: "Seasonal Risk", icon: "📅",
    needsData: false,
  },
  accuracy_query: {
    patterns: [/accurate|accuracy|how.*good|prediction.*correct|error|wrong/i],
    label: "Accuracy Query", icon: "📈",
    needsData: true,
  },
  general_knowledge: {
    patterns: [/.*/],
    label: "Crop Knowledge", icon: "🌾",
    needsData: false,
  },
};

function detectIntent(question) {
  for (const [key, intent] of Object.entries(INTENTS)) {
    if (key === "general_knowledge") continue;
    if (intent.patterns.some((p) => p.test(question))) return { key, ...intent };
  }
  return { key: "general_knowledge", ...INTENTS.general_knowledge };
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(intent, crop, district, hasLocalData) {
  const base =
    `You are KrishiAI, an expert agricultural assistant for farmers in Andhra Pradesh and Telangana, India.\n` +
    `You have deep knowledge of Indian agriculture: crop cultivation, pest management, diseases, market prices, weather impacts, MSP, and farming best practices.\n\n` +
    `RULES:\n` +
    `1. The farmer is asking about: ${crop} in ${district}.\n` +
    `2. NEVER answer about a different crop than what is asked.\n` +
    `3. If retrieved market data is provided, use specific numbers (Rs/quintal, °C, mm).\n` +
    `4. If no market data is available, use your agricultural knowledge to answer — do NOT say "I don't have data" for general crop questions.\n` +
    `5. Be concise and practical. Farmers need actionable advice.\n` +
    `6. Structure: most important point first, then supporting details.\n` +
    `7. For pest/disease/cultivation questions: give specific, practical guidance even without local market data.\n`;

  const extras = {
    price_query:
      "\nFor price questions: state the exact current price, trend direction, and whether it's above/below MSP. Give a 1-sentence outlook.",
    compare_districts:
      "\nFor district comparisons: list top 3 districts with exact prices. Calculate net gain after transport. Give a clear sell-location recommendation.",
    sell_recommendation:
      "\nFor sell recommendations: give SELL NOW / SELL SOON / HOLD as the first word. Then explain using price trend, weather forecast, and news sentiment with actual numbers.",
    msp_query:
      "\nFor MSP: state exact MSP value, compare to current price, calculate difference, advise on government procurement if near/below MSP.",
    weather_impact:
      "\nFor weather: use actual temperature, rainfall, humidity values. Explain specific agricultural risk and expected price effect.",
    news_impact:
      "\nFor news: reference specific headlines. Quantify expected price effect. Explain what sentiment means for the farmer.",
    explain_prediction:
      "\nFor prediction explanations: explain the 4 signals (trend, weather, news sentiment, MSP) with actual values from context.",
    pest:
      `\nFor pest questions about ${crop}: identify the pest, describe damage symptoms, give integrated pest management (IPM) steps, mention safe pesticides used in India, and prevention tips.`,
    disease:
      `\nFor disease questions about ${crop}: identify the disease, describe symptoms, explain cause (fungal/bacterial/viral), give treatment options available in India, and prevention measures.`,
    cultivation:
      `\nFor cultivation questions about ${crop}: give specific guidance on soil preparation, sowing time, seed rate, irrigation schedule, fertilizer doses (NPK), and expected yield per acre in AP/Telangana conditions.`,
    seasonal_risk:
      `\nFor seasonal questions about ${crop}: explain Kharif/Rabi season suitability, key risks per season, best sowing months for AP/Telangana, and how to mitigate seasonal risks.`,
    accuracy_query:
      "\nFor accuracy: use actual accuracy percentages from prediction history. Explain what the numbers mean.",
    general_knowledge:
      `\nAnswer the question about ${crop} using your agricultural knowledge. Be specific to Indian farming conditions, especially AP/Telangana. If market data is available, incorporate it.`,
  };

  return base + (extras[intent.key] || extras.general_knowledge);
}

// ── Build messages ────────────────────────────────────────────────────────────
function buildMessages(question, context, history, intent, crop, district, supportsSystem) {
  const hasLocalData = context.trim().length > 50;
  const systemContent = buildSystemPrompt(intent, crop, district, hasLocalData);

  const historyMsgs = (history || []).slice(-6).map((h) => ({
    role:    h.role === "user" ? "user" : "assistant",
    content: h.text,
  }));

  const dataSection = hasLocalData
    ? `=== RETRIEVED MARKET DATA FOR ${crop.toUpperCase()} IN ${district.toUpperCase()} ===\n${context}\n=== END OF MARKET DATA ===\n\n`
    : `=== NOTE: No local market data available for ${crop} in ${district}. Use your agricultural knowledge to answer. ===\n\n`;

  const userContent =
    dataSection +
    `Farmer's Question: ${question}\n\n` +
    (hasLocalData
      ? `Answer using the data above. Be specific with numbers. Do NOT answer about any crop other than ${crop}.`
      : `Answer using your agricultural knowledge about ${crop}. Be practical and specific to Indian farming.`);

  if (supportsSystem) {
    return [
      { role: "system", content: systemContent },
      ...historyMsgs,
      { role: "user",   content: userContent },
    ];
  }
  return [
    ...historyMsgs,
    { role: "user", content: `${systemContent}\n\n${userContent}` },
  ];
}

// ── Confidence scoring ────────────────────────────────────────────────────────
function estimateConfidence(answer, context, intent) {
  if (!answer || answer.length < 50) return 15;
  let score = 40;

  const dataKeywords = ["Rs", "quintal", "°C", "mm", "%", "district", "trend", "average", "MSP", "days", "accuracy"];
  score += Math.min(dataKeywords.filter((k) => answer.includes(k)).length * 4, 25);

  if (context.length > 500)  score += 8;
  if (context.length > 1000) score += 5;

  // Knowledge intents get base confidence boost (no data needed)
  if (["pest", "disease", "cultivation", "seasonal_risk", "general_knowledge"].includes(intent.key)) score += 10;

  if (intent.key === "compare_districts"   && /Rs\d+.*Rs\d+/i.test(answer))       score += 10;
  if (intent.key === "sell_recommendation" && /sell|hold|wait/i.test(answer))      score += 8;
  if (intent.key === "msp_query"           && /Rs\d+/i.test(answer))               score += 8;
  if (intent.key === "weather_impact"      && /°C|mm|rain|humid/i.test(answer))    score += 8;
  if (intent.key === "pest"                && /pesticide|spray|IPM|neem|control/i.test(answer)) score += 10;
  if (intent.key === "disease"             && /fungicide|treatment|symptom|prevent/i.test(answer)) score += 10;
  if (intent.key === "cultivation"         && /kg|acre|NPK|irrigat|sow/i.test(answer)) score += 10;

  if (/i don't know|no information|cannot answer|not available/i.test(answer)) score -= 25;
  if (/i'm sorry|i apologize|as an ai/i.test(answer)) score -= 10;
  if (answer.length < 100) score -= 15;

  return Math.max(10, Math.min(96, score));
}

// ── Main query function ───────────────────────────────────────────────────────
async function queryOpenRouter(question, context, history = [], intent, crop = "Rice", district = "Guntur") {
  const apiKey = process.env.OPENROUTER_API_KEY;

  // Resolve intent if not passed
  const resolvedIntent = intent || detectIntent(question);

  if (!apiKey || apiKey.includes("...") || apiKey.length < 30) {
    return {
      answer:     buildFallbackAnswer(question, context, resolvedIntent, crop),
      confidence: 45,
      model:      "fallback (no API key)",
      intent:     resolvedIntent,
    };
  }

  for (const { id: model, systemRole } of MODELS) {
    try {
      const messages = buildMessages(question, context, history, resolvedIntent, crop, district, systemRole);

      const { data } = await axios.post(
        OPENROUTER_URL,
        { model, messages, max_tokens: 900, temperature: 0.25, top_p: 0.9 },
        {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type":  "application/json",
            "HTTP-Referer":  "http://localhost:5001",
            "X-Title":       "KrishiAI Agricultural Market Intelligence",
          },
          timeout: 30000,
        }
      );

      const answer = data.choices?.[0]?.message?.content?.trim();
      if (!answer || answer.length < 20) continue;

      return {
        answer,
        confidence: estimateConfidence(answer, context, resolvedIntent),
        model:      data.model ?? model,
        intent:     resolvedIntent,
      };
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) throw new Error("Invalid OpenRouter API key — check OPENROUTER_API_KEY in backend/.env");
      if (status === 402) throw new Error("OpenRouter quota exceeded — check your account balance");
      console.warn(`[OpenRouter] Model ${model} failed (${status ?? err.code}), trying next…`);
    }
  }

  return {
    answer:     buildFallbackAnswer(question, context, resolvedIntent, crop),
    confidence: 40,
    model:      "fallback (all models failed)",
    intent:     resolvedIntent,
  };
}

// ── Fallback answer ───────────────────────────────────────────────────────────
function buildFallbackAnswer(question, context, intent, crop) {
  const hasData = context.trim().length > 50;

  if (hasData) {
    const lines = context.split("\n").filter((l) => l.trim() && l.includes(":"));
    const extract = (kws) => lines.find((l) => kws.some((k) => l.toLowerCase().includes(k.toLowerCase())));
    const facts = [
      extract(["Latest price"]),
      extract(["30-day average"]),
      extract(["Trend:"]),
      extract(["Week-over-week"]),
      extract(["Temperature:"]),
      extract(["Rainfall:"]),
      extract(["Minimum Support Price"]),
      extract(["Overall sentiment"]),
    ].filter(Boolean).slice(0, 6).map((l) => "• " + l.trim()).join("\n");

    return (
      `${intent.icon} ${intent.label} — ${crop}\n\n` +
      `Key data from market records:\n\n${facts}\n\n` +
      `💡 For full AI analysis, add your OpenRouter API key to backend/.env\n` +
      `Get a free key at: https://openrouter.ai`
    );
  }

  // Knowledge question fallback — give basic info
  const knowledgeFallbacks = {
    pest:        `🐛 Pest Management — ${crop}\n\nCommon pests affecting ${crop} include aphids, thrips, and stem borers. Use IPM: monitor regularly, use neem-based sprays (3ml/L) for early infestations, and chemical pesticides only when pest count exceeds economic threshold.\n\n💡 Add OpenRouter API key for detailed, AI-powered pest management advice.`,
    disease:     `🦠 Crop Disease — ${crop}\n\nCommon diseases in ${crop} include fungal blights and bacterial wilts. Key prevention: use certified disease-free seeds, maintain proper spacing for air circulation, avoid waterlogging, and apply recommended fungicides at first symptom.\n\n💡 Add OpenRouter API key for specific disease diagnosis and treatment.`,
    cultivation: `🌱 Cultivation Guide — ${crop}\n\nFor ${crop} cultivation in AP/Telangana: prepare well-drained soil, follow recommended sowing calendar for your season, apply balanced NPK fertilizers, and ensure timely irrigation. Contact your local KVK (Krishi Vigyan Kendra) for district-specific guidance.\n\n💡 Add OpenRouter API key for detailed cultivation advice.`,
    seasonal_risk: `📅 Seasonal Guide — ${crop}\n\nIn AP/Telangana, crop seasons are Kharif (June–October), Rabi (November–March), and Zaid (March–June). ${crop} suitability varies by season. Monitor IMD forecasts for weather risks.\n\n💡 Add OpenRouter API key for detailed seasonal risk analysis.`,
  };

  return (
    knowledgeFallbacks[intent.key] ||
    `${intent.icon} ${intent.label} — ${crop}\n\nI can answer questions about ${crop} cultivation, pests, diseases, market prices, MSP, weather impact, and sell recommendations.\n\n💡 Add your OpenRouter API key to backend/.env for full AI-powered answers.\nGet a free key at: https://openrouter.ai`
  );
}

module.exports = { queryOpenRouter, detectIntent, detectCropFromQuestion };
