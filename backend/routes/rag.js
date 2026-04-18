const express = require("express");
const router  = express.Router();
const { retrieveContext }         = require("../services/retrievalService");
const { queryOpenRouter, detectCropFromQuestion, detectIntent } = require("../services/openrouterService");

// POST /api/rag/query
// Body: { question, crop, state, district, history? }
router.post("/query", async (req, res) => {
  const { question, crop, state, district, history = [] } = req.body;

  if (!question?.trim())
    return res.status(400).json({ error: "question is required" });

  const safeState    = state    || "Andhra Pradesh";
  const safeDistrict = district || "Guntur";

  // Detect crop from question — overrides UI selection if found
  const questionCrop = detectCropFromQuestion(question);
  const safeCrop     = questionCrop || crop || "Rice";
  const cropOverridden = !!(questionCrop && questionCrop !== crop);

  // Detect intent to decide retrieval strategy
  const intent = detectIntent(question);
  const needsLocalData = !["pest", "disease", "cultivation", "seasonal_risk", "general_knowledge"].includes(intent.key);

  try {
    // Always attempt retrieval — but don't block on missing data for knowledge questions
    const { context, sources } = await retrieveContext(safeCrop, safeState, safeDistrict).catch(() => ({ context: "", sources: [] }));

    const hasLocalData = context.trim().length > 50;

    // For market/price intents with no local data, return clear error
    if (!hasLocalData && needsLocalData) {
      return res.status(404).json({
        error: `No market data found for ${safeCrop} in ${safeDistrict}. Ensure the database is seeded.`,
      });
    }

    // Generate answer — passes context (may be empty for knowledge questions)
    const { answer, confidence, model } = await queryOpenRouter(
      question, context, history, intent, safeCrop, safeDistrict
    );

    res.json({
      answer,
      sources,
      confidence,
      model,
      intent: { key: intent.key, label: intent.label, icon: intent.icon },
      context_chars: context.length,
      crop_used: safeCrop,
      crop_overridden: cropOverridden,
      location: { crop: safeCrop, state: safeState, district: safeDistrict },
    });
  } catch (err) {
    console.error("[RAG]", err.message);
    const isKeyError = err.message?.includes("API key") || err.message?.includes("quota");
    res.status(isKeyError ? 402 : 500).json({ error: err.message || "RAG query failed" });
  }
});

// GET /api/rag/context?crop=Rice&state=Andhra Pradesh&district=Guntur
router.get("/context", async (req, res) => {
  const { crop, state, district } = req.query;
  if (!crop || !state || !district)
    return res.status(400).json({ error: "crop, state, district required" });
  try {
    const { context, sources } = await retrieveContext(crop, state, district);
    res.json({ context, sources, context_chars: context.length, location: { crop, state, district } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
