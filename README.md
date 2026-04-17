# 🌾 AI Farmer Market Intelligence

> Hackathon Project — AI-powered crop price prediction using historical mandi data & real-time weather

---

## 👥 Team Structure

| Role | Members | Responsibility |
|------|---------|----------------|
| Frontend | 2 members | React UI, Charts, Dropdowns, Alerts |
| Backend  | 2 members | Node.js API, AI Logic, Weather Integration |

---

## 🚀 Quick Start (Single Command)

```bash
# Step 1 — Install all dependencies
npm run install-all

# Step 2 — Build React frontend
npm run build

# Step 3 — Start everything
npm start
```

Open: **http://localhost:5000**

---

## 🔑 Add OpenWeather API Key

Edit `backend/.env`:
```
OPENWEATHER_API_KEY=your_actual_key_here
PORT=5000
```

Get a free key at: https://openweathermap.org/api

> Without a key, weather falls back to safe defaults (temp: 30°C, humidity: 60%, rain: 0mm)

---

## 📁 Project Structure

```
AI-Farmer-Market-Intelligence/
├── backend/
│   ├── server.js                  ← Express entry point
│   ├── routes/predictRoutes.js    ← POST /api/predict-price
│   ├── controllers/predictController.js
│   ├── services/
│   │   ├── weatherService.js      ← OpenWeather API
│   │   ├── predictionService.js   ← Core prediction logic
│   │   └── mandiService.js        ← Mandi data filtering
│   ├── utils/trendCalculator.js   ← Moving avg, alerts, suggestions
│   └── data/
│       ├── mandi_prices.json      ← 5 crops × 4 districts × 2 mandals
│       └── locationData.json      ← State → District → Mandal hierarchy
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── InputForm.js       ← Dependent dropdowns + loading
│   │   │   ├── PriceChart.js      ← Chart.js dual-line graph
│   │   │   ├── WeatherCard.js     ← Weather display
│   │   │   └── AlertCard.js       ← Alerts + smart suggestions
│   │   ├── pages/
│   │   │   ├── Home.js            ← Landing + form
│   │   │   └── Results.js         ← Full dashboard
│   │   └── data/locationData.js   ← Frontend dropdown data
│   └── package.json
│
├── package.json   ← Root: install-all / build / start
└── README.md
```

---

## 🌐 API Reference

### POST `/api/predict-price`

**Request:**
```json
{
  "crop": "Wheat",
  "state": "Punjab",
  "district": "Ludhiana",
  "mandal": "Ludhiana East"
}
```

**Response:**
```json
{
  "historicalPrices": [{ "date": "2024-06-01", "price": 2100 }, ...],
  "predictedPrices":  [{ "date": "2024-06-08", "price": 2195 }, ...],
  "trend": "Increasing",
  "avgPrice": 2153,
  "alerts": [{ "type": "warning", "message": "🌧 Moderate rain expected..." }],
  "suggestion": "✅ Best time to sell: around 2024-06-10 — predicted peak ₹2210/quintal.",
  "weather": { "temp": 32, "humidity": 65, "rain": 0, "description": "clear sky" }
}
```

---

## 🧠 Prediction Logic

1. Filter mandi data by crop + district + mandal
2. Take last 7 days → compute moving average
3. Detect trend (last price vs first of last 5)
4. Apply weather impact per day:
   - Rain > 10mm → +5% price
   - Rain > 5mm  → +3% price
   - Temp > 42°C → -4% price
   - Humidity > 85% → +2% price
5. Project 5 days forward with trend drift (±0.6%/day)
6. Generate alerts + smart sell suggestion

---

## 🌾 Sample Data

| Crop   | State       | District  | Mandals                        |
|--------|-------------|-----------|-------------------------------|
| Wheat  | Punjab      | Ludhiana  | Ludhiana East, Ludhiana West  |
| Wheat  | Haryana     | Karnal    | Karnal Central                |
| Rice   | Punjab      | Ludhiana  | Ludhiana East                 |
| Rice   | Haryana     | Karnal    | Karnal Central                |
| Tomato | Maharashtra | Nashik    | Nashik Road, Sinnar           |
| Onion  | Maharashtra | Nashik    | Nashik Road, Sinnar           |
| Maize  | Telangana   | Nizamabad | Nizamabad Urban, Bodhan       |

---

## 🛠 Tech Stack

| Layer    | Technology                    |
|----------|-------------------------------|
| Backend  | Node.js, Express, Axios, dotenv |
| Frontend | React 18, Chart.js, Axios     |
| Weather  | OpenWeatherMap API            |
| Data     | JSON flat-file dataset        |
