# 🌾 KrishiAI — Agricultural Market Intelligence

> AI-powered crop price prediction for Andhra Pradesh & Telangana farmers

---

## ⚡ Quick Start

```bash
# 1. Install dependencies
npm run install-all

# 2. Build frontend
npm run build

# 3. Start (auto-seeds DB + serves everything)
npm start
```

Open: **http://localhost:5001**

> The server **automatically deletes old data and seeds fresh 30-day data** every startup. No manual seeding needed.

---

## 🔑 API Keys (backend/.env)

| Key | Where to get | Required |
|-----|-------------|----------|
| `OPENWEATHER_API_KEY` | openweathermap.org/api | ✅ Already set |
| `GNEWS_API_KEY` | gnews.io | ✅ Already set |
| `OPENROUTER_API_KEY` | openrouter.ai (free) | ⚠️ Paste full key for AI answers |
| `JWT_SECRET` | Any random string | ✅ Already set |

---

## ✅ Verified Working

| Feature | Status |
|---------|--------|
| MySQL auto-seed on startup | ✅ 5704 rows in ~500ms |
| Location APIs (states/districts/crops) | ✅ |
| Prediction engine (EMA + regression) | ✅ |
| OpenWeather current + 5-day forecast | ✅ |
| GNews + NLP sentiment | ✅ |
| RAG + OpenRouter (fallback if no key) | ✅ |
| Historical accuracy tracking | ✅ |
| Auth (JWT login/register) | ✅ |
| Frontend build | ✅ Zero errors |

---

## 📁 Structure

```
backend/
  server.js          ← Express + auto-seed on startup
  seedMarket.js      ← Drops + recreates market_data (30 days, AP+TG)
  services/          ← prediction, weather, news, sentiment, RAG
  routes/            ← All API endpoints
  utils/cronJob.js   ← Daily price refresh at 6AM

frontend/
  src/pages/         ← Login, Dashboard
  src/components/    ← All UI cards and views
  dist/              ← Built frontend served by Express
```

---

## 🌐 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/location/states` | List states |
| GET | `/api/location/districts?state=` | Districts for state |
| GET | `/api/location/crops?state=&district=` | Crops available in district |
| POST | `/api/predict-price` | Full prediction with weather+sentiment |
| GET | `/api/market-data?crop=&district=` | Raw market prices |
| GET | `/api/weather?district=` | Current weather |
| GET | `/api/news?district=` | News articles |
| POST | `/api/news/sentiment` | NLP sentiment analysis |
| POST | `/api/rag/query` | AI research assistant |
| GET | `/api/accuracy` | Prediction accuracy history |
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login → JWT token |

---

## 🧠 Prediction Engine

1. Fetch 7-day + 30-day historical prices from MySQL
2. Baseline = EMA(60%) + SMA(40%)
3. Trend = linear regression slope over 14 days
4. Weather impact per day from 5-day forecast
5. News impact with recency decay
6. NLP sentiment signal (weighted 40%)
7. Confidence intervals using historical volatility
8. MSP floor check
9. Best district comparison across all markets

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, MySQL2 |
| AI/ML | Custom prediction engine, NLP sentiment |
| RAG | OpenRouter (Mistral/Gemma/Llama free models) |
| Weather | OpenWeatherMap API |
| News | GNews API |
| Frontend | React 18, Recharts, Framer Motion |
| Auth | JWT + bcrypt |
