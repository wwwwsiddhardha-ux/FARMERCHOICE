/* ================================================================
   KrishiAI — Frontend ↔ Backend connector
   All endpoints match backend routes exactly
   ================================================================ */

/* ── LANDING PAGE ───────────────────────────────────────────────────────── */
function showApp() {
  document.getElementById('landingPage').style.display = 'none';
  document.getElementById('appRoot').style.display = 'block';
}

document.getElementById('lpGetStartedBtn').addEventListener('click', showApp);
document.getElementById('lpSignupBtn').addEventListener('click', showApp);
document.getElementById('lpLoginBtn').addEventListener('click', showApp);
document.getElementById('lpExploreBtn').addEventListener('click', () => {
  document.getElementById('lpFeatures').scrollIntoView({ behavior: 'smooth' });
});

/* ── API ROUTES (matching backend exactly) ─────────────────────── */
const API = {
  states:      '/api/location/states',
  districts:   (state)           => `/api/location/districts?state=${encodeURIComponent(state)}`,
  crops:       (state, district) => `/api/location/crops?state=${encodeURIComponent(state)}&district=${encodeURIComponent(district)}`,
  predict:     '/api/predict-price',                                                          // POST {crop,state,district}
  dashboard:   (state, district, crop) => `/api/dashboard?state=${encodeURIComponent(state)}&district=${encodeURIComponent(district)}&crop=${encodeURIComponent(crop)}`,
  recommend:   (crop, state, district) => `/api/recommendation?crop=${encodeURIComponent(crop)}&state=${encodeURIComponent(state)}&district=${encodeURIComponent(district)}`,
  comparison:  (crop, state, district) => `/api/market-comparison?crop=${encodeURIComponent(crop)}&state=${encodeURIComponent(state)}&district=${encodeURIComponent(district)}`,
  weather:     (district)        => `/api/weather?district=${encodeURIComponent(district)}`,
  news:        (district)        => `/api/news?district=${encodeURIComponent(district)}`,
  accuracy:    '/api/accuracy',
  rag:         '/api/rag/query',                                                               // POST {question,crop,state,district,history}
};

/* ── APP STATE ──────────────────────────────────────────────────── */
const appState = { state: '', district: '', crop: '' };
let forecastChartInst = null;
let compChartInst     = null;
let ragHistory        = [];   // conversation history for RAG

/* ── FETCH HELPER ───────────────────────────────────────────────── */
async function apiFetch(url, opts = {}) {
  try {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    console.warn('[API]', url, e.message);
    return null;
  }
}

async function apiPost(url, body) {
  return apiFetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

/* ── HELPERS ────────────────────────────────────────────────────── */
function fmt(val) {
  if (val == null || val === '--') return '--';
  return '₹' + Number(val).toLocaleString('en-IN');
}

function setOptions(select, items) {
  const placeholder = select.options[0].text;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = typeof item === 'string' ? item : item.name || item;
    select.appendChild(opt);
  });
}

function setNavActive(section) {
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.section === section)
  );
}

/* ── NAVIGATION ─────────────────────────────────────────────────── */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    showSection(btn.dataset.section);
    setNavActive(btn.dataset.section);
    document.getElementById('mobileNav').classList.remove('open');
  });
});

document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('mobileNav').classList.toggle('open');
});

document.querySelectorAll('.feature-card').forEach(card => {
  card.addEventListener('click', () => {
    const target = card.dataset.section;
    showSection(target);
    setNavActive(target);
  });
});

function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('active');
  el.querySelectorAll('.fade-in').forEach((node, i) => {
    node.style.animationDelay = `${i * 0.07}s`;
  });
}

/* ── LOCATION SELECTORS ─────────────────────────────────────────── */
const stateSelect    = document.getElementById('stateSelect');
const districtSelect = document.getElementById('districtSelect');
const cropSelect     = document.getElementById('cropSelect');
const analyzeBtn     = document.getElementById('analyzeBtn');

async function loadStates() {
  const data = await apiFetch(API.states);
  const list = Array.isArray(data) ? data : [];
  if (list.length) {
    setOptions(stateSelect, list);
  } else {
    setOptions(stateSelect, ['Andhra Pradesh', 'Telangana']);
  }
}

stateSelect.addEventListener('change', async () => {
  appState.state    = stateSelect.value;
  appState.district = '';
  appState.crop     = '';
  districtSelect.disabled = true;
  cropSelect.disabled     = true;
  analyzeBtn.disabled     = true;
  districtSelect.innerHTML = '<option value="">-- Select District --</option>';
  cropSelect.innerHTML     = '<option value="">-- Select Crop --</option>';
  if (!appState.state) return;

  const data = await apiFetch(API.districts(appState.state));
  const list = Array.isArray(data) ? data : [];
  setOptions(districtSelect, list.length ? list : ['Guntur', 'Warangal', 'Nizamabad']);
  districtSelect.disabled = false;
});

districtSelect.addEventListener('change', async () => {
  appState.district = districtSelect.value;
  appState.crop     = '';
  cropSelect.disabled = true;
  analyzeBtn.disabled = true;
  cropSelect.innerHTML = '<option value="">-- Select Crop --</option>';
  if (!appState.district) return;

  const data = await apiFetch(API.crops(appState.state, appState.district));
  const list = Array.isArray(data) ? data : [];
  setOptions(cropSelect, list.length ? list : ['Rice', 'Maize', 'Tomato', 'Onion', 'Chilli']);
  cropSelect.disabled = false;
});

cropSelect.addEventListener('change', () => {
  appState.crop       = cropSelect.value;
  analyzeBtn.disabled = !appState.crop;
  // Update RAG context badge
  const badge = document.getElementById('ragContextBadge');
  if (badge && appState.crop) badge.textContent = `Context: ${appState.crop} · ${appState.district || 'select district'}`;
});

analyzeBtn.addEventListener('click', () => {
  if (!appState.crop || !appState.district || !appState.state) return;
  runAnalysis();
});

/* ── MAIN ANALYSIS TRIGGER ──────────────────────────────────────── */
async function runAnalysis() {
  const { crop, state, district } = appState;
  const meta = `${crop} — ${district}`;

  // Update meta labels
  ['forecastMeta', 'dashMeta', 'compMeta'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = meta;
  });

  // Navigate to forecast first, load everything in parallel
  showSection('forecast');
  setNavActive('forecast');

  await Promise.all([
    loadForecast(crop, state, district),
    loadDashboard(crop, state, district),
    loadComparison(crop, state, district),
  ]);
}

/* ── FORECAST ───────────────────────────────────────────────────── */
async function loadForecast(crop, state, district) {
  // POST /api/predict-price  { crop, state, district }
  const data = await apiPost(API.predict, { crop, state, district });

  if (!data) {
    showForecastError('Prediction failed. Check backend connection.');
    return;
  }

  // Tomorrow price
  const tomorrow = data.tomorrow?.price ?? data.avgPrice ?? 0;
  document.getElementById('f1').textContent = tomorrow ? tomorrow.toLocaleString('en-IN') : '--';

  // 3-day average from forecast3
  const f3prices = (data.forecast3 || []).map(f => f.price).filter(Boolean);
  const f3avg    = f3prices.length ? Math.round(f3prices.reduce((a, b) => a + b, 0) / f3prices.length) : 0;
  document.getElementById('f3').textContent = f3avg ? f3avg.toLocaleString('en-IN') : '--';

  // 7-day average from predictedPrices
  const f7prices = (data.predictedPrices || []).map(f => f.price).filter(Boolean);
  const f7avg    = f7prices.length ? Math.round(f7prices.reduce((a, b) => a + b, 0) / f7prices.length) : 0;
  document.getElementById('f7').textContent = f7avg ? f7avg.toLocaleString('en-IN') : '--';

  // Change indicators vs current avg
  const base = data.avgPrice || 0;
  setChange('f1c', tomorrow, base);
  setChange('f3c', f3avg,    base);
  setChange('f7c', f7avg,    base);

  // MSP card
  if (data.msp) {
    document.getElementById('mspCurrent').textContent = fmt(data.avgPrice);
    document.getElementById('mspValue').textContent   = fmt(data.msp.msp);
    const diff = (data.avgPrice || 0) - (data.msp.msp || 0);
    const mspAboveEl = document.getElementById('mspAbove');
    mspAboveEl.textContent = fmt(Math.abs(diff));
    mspAboveEl.style.color = diff >= 0 ? '#2E7D32' : '#c62828';
  }

  // Build chart: historical + forecast
  const histPoints = (data.chartData?.week || data.historicalPrices || []).map(p => ({
    label: typeof p.date === 'string' ? p.date.slice(5) : (p.day || ''),
    price: parseFloat(p.price || p.modal_price || 0),
    type:  'historical',
  }));
  const fcastPoints = (data.chartData?.forecast || data.predictedPrices || []).map(p => ({
    label: typeof p.date === 'string' ? p.date.slice(5) : (p.day || ''),
    price: p.price,
    type:  'forecast',
  }));

  renderForecastChart(histPoints, fcastPoints);
}

function setChange(id, curr, prev) {
  const el = document.getElementById(id);
  if (!el || !curr || !prev) return;
  const pct = (((curr - prev) / prev) * 100).toFixed(1);
  el.textContent  = (pct >= 0 ? '▲ +' : '▼ ') + pct + '%';
  el.className    = 'forecast-change ' + (pct >= 0 ? 'up' : 'down');
}

function showForecastError(msg) {
  ['f1','f3','f7'].forEach(id => { document.getElementById(id).textContent = '--'; });
  document.getElementById('forecastMeta').textContent = msg;
}

function renderForecastChart(histPoints, fcastPoints) {
  const ctx = document.getElementById('forecastChart').getContext('2d');
  if (forecastChartInst) forecastChartInst.destroy();

  const allLabels = [...histPoints.map(p => p.label), ...fcastPoints.map(p => p.label)];
  const histData  = [
    ...histPoints.map(p => p.price),
    ...fcastPoints.map(() => null),
  ];
  const fcastData = [
    ...histPoints.map(() => null),
    // overlap one point for visual continuity
    histPoints.length ? histPoints[histPoints.length - 1].price : null,
    ...fcastPoints.slice(1).map(p => p.price),
  ];

  forecastChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        {
          label: 'Historical',
          data:  histData,
          borderColor: '#2E7D32',
          backgroundColor: 'rgba(46,125,50,0.08)',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#2E7D32',
          tension: 0.35,
          fill: true,
          spanGaps: false,
        },
        {
          label: 'Forecast',
          data:  fcastData,
          borderColor: '#FFC107',
          backgroundColor: 'rgba(255,193,7,0.08)',
          borderWidth: 2.5,
          borderDash: [6, 3],
          pointRadius: 4,
          pointBackgroundColor: '#FFC107',
          tension: 0.35,
          fill: true,
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', labels: { usePointStyle: true, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.parsed.y != null ? `₹${ctx.parsed.y.toLocaleString('en-IN')}/qtl` : null,
          },
        },
      },
      scales: {
        y: {
          grid: { color: '#e0ede0' },
          ticks: { callback: v => '₹' + v.toLocaleString('en-IN'), font: { size: 11 } },
        },
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      },
    },
  });
}

/* ── DASHBOARD (weather + news + recommendation + MSP) ──────────── */
async function loadDashboard(crop, state, district) {
  // Run recommendation and dashboard in parallel
  const [dashData, recData] = await Promise.all([
    apiFetch(API.dashboard(state, district, crop)),
    apiFetch(API.recommend(crop, state, district)),
  ]);

  if (dashData) {
    renderWeather(dashData.weather);
    renderNews(dashData.news);
  }

  if (recData) {
    renderRecommendation(recData);
  }
}

function renderWeather(weatherSection) {
  if (!weatherSection) return;
  const w = weatherSection.current || {};
  const icons = { Clear: '☀️', Clouds: '⛅', Rain: '🌧️', Drizzle: '🌦️', Thunderstorm: '⛈️', Snow: '❄️', Mist: '🌫️', Haze: '🌫️' };

  document.getElementById('weatherIcon').textContent     = icons[w.condition] || '🌡️';
  document.getElementById('weatherTemp').textContent     = (w.temperature ?? '--') + '°C';
  document.getElementById('weatherDesc').textContent     = w.description || w.condition || '--';
  document.getElementById('weatherHumidity').textContent = (w.humidity ?? '--') + '%';
  document.getElementById('weatherWind').textContent     = (w.windSpeed ?? '--') + ' m/s';
  document.getElementById('weatherRain').textContent     = (w.rain ?? '0') + ' mm';

  const impact = weatherSection.agriculturalImpact;
  const impactEl = document.getElementById('weatherImpact');
  if (impact) {
    impactEl.textContent  = impact.message;
    impactEl.style.background = impact.level === 'danger'  ? '#fce4ec'
                              : impact.level === 'warning' ? '#fff8e1'
                              : '#e8f5e9';
    impactEl.style.color  = impact.level === 'danger'  ? '#c62828'
                          : impact.level === 'warning' ? '#f57f17'
                          : '#2e7d32';
  }
}

function renderNews(newsSection) {
  if (!newsSection) return;
  const articles = newsSection.articles || [];
  const sentiment = newsSection.sentiment;
  const list = document.getElementById('newsList');

  if (!articles.length) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No recent news found.</p>';
    return;
  }

  list.innerHTML = articles.slice(0, 4).map(a => {
    const impactType  = a.impact?.type || 'info';
    const impactLabel = a.impact?.label || 'News';
    const sentClass   = impactType === 'danger' ? 'negative' : impactType === 'warning' ? 'neutral' : 'positive';
    return `
      <div class="news-item">
        <div class="news-item-title">
          ${a.title || 'Market Update'}
          <span class="news-sentiment ${sentClass}">${impactLabel}</span>
        </div>
        <div class="news-item-meta">${a.source || ''}</div>
      </div>`;
  }).join('');

  // Show overall sentiment if available
  if (sentiment) {
    const sentEl = document.createElement('div');
    sentEl.style.cssText = 'margin-top:0.75rem;padding:0.5rem 0.75rem;border-radius:8px;font-size:0.82rem;font-weight:600;';
    const col = sentiment.label === 'Positive' ? '#2e7d32' : sentiment.label === 'Negative' ? '#c62828' : '#f57f17';
    sentEl.style.color      = col;
    sentEl.style.background = sentiment.label === 'Positive' ? '#e8f5e9' : sentiment.label === 'Negative' ? '#fce4ec' : '#fff8e1';
    sentEl.textContent      = `Overall Sentiment: ${sentiment.label} (${sentiment.impact_type}) · Confidence ${sentiment.confidence}%`;
    list.appendChild(sentEl);
  }
}

function renderRecommendation(r) {
  const action  = r.action || 'MONITOR';
  const isSell  = action.includes('SELL');
  const isHold  = action === 'HOLD';

  const card = document.getElementById('recCard');
  card.className = 'card rec-card ' + (isSell ? 'sell' : isHold ? 'hold' : '');

  document.getElementById('recIcon').textContent   = isSell ? '💰' : isHold ? '⏳' : '👁️';
  document.getElementById('recAction').textContent = action;
  document.getElementById('recReason').textContent = r.summary || 'Based on current market conditions.';

  const risk   = (r.riskLevel || 'medium').toLowerCase();
  const riskEl = document.getElementById('riskBadge');
  riskEl.textContent = risk.charAt(0).toUpperCase() + risk.slice(1) + ' Risk';
  riskEl.className   = 'risk-badge ' + risk;

  const confEl = document.getElementById('recConfidence');
  if (r.confidence) confEl.textContent = `Confidence: ${r.confidence}% · Sell window: ${r.sellWindow || '--'}`;

  // Top reasons
  if (r.reasons?.length) {
    const reasonsHtml = r.reasons.slice(0, 3).map(reason => {
      const col = reason.type === 'danger' ? '#c62828' : reason.type === 'warn' ? '#f57f17' : reason.type === 'good' ? '#2e7d32' : '#546e7a';
      return `<div style="font-size:0.82rem;color:${col};margin-top:0.4rem;padding-left:0.5rem;border-left:3px solid ${col}">
        ${reason.text}
      </div>`;
    }).join('');
    const reasonsEl = document.createElement('div');
    reasonsEl.style.marginTop = '0.75rem';
    reasonsEl.innerHTML = reasonsHtml;
    const recCard = document.getElementById('recCard');
    // Remove old reasons if any
    const old = recCard.querySelector('.rec-reasons');
    if (old) old.remove();
    reasonsEl.className = 'rec-reasons';
    recCard.appendChild(reasonsEl);
  }

  // MSP from signals
  const sig = r.signals || {};
  if (sig.mspPrice) {
    document.getElementById('mspCurrent').textContent = fmt(sig.avgPrice);
    document.getElementById('mspValue').textContent   = fmt(sig.mspPrice);
    const diff = (sig.avgPrice || 0) - (sig.mspPrice || 0);
    const mspAboveEl = document.getElementById('mspAbove');
    mspAboveEl.textContent = fmt(Math.abs(diff));
    mspAboveEl.style.color = diff >= 0 ? '#2E7D32' : '#c62828';
  }
}

/* ── DISTRICT COMPARISON ────────────────────────────────────────── */
async function loadComparison(crop, state, district) {
  // GET /api/market-comparison?crop=&state=&district=
  const data = await apiFetch(API.comparison(crop, state, district));

  if (!data || !data.districts?.length) {
    document.getElementById('compTable').innerHTML =
      '<p style="color:var(--text-muted);font-size:0.85rem">No comparison data available. Ensure market data is seeded.</p>';
    return;
  }

  const best = data.best || {};
  document.getElementById('bestDistrict').textContent = best.district || '--';
  document.getElementById('bestProfit').textContent   = best.premiumOver > 0
    ? `+${fmt(best.premiumOver)}/qtl`
    : best.premiumOver === 0 ? 'Best market' : '--';

  const districts = data.districts;
  const maxPrice  = Math.max(...districts.map(d => d.avgPrice || 0));

  document.getElementById('compTable').innerHTML = districts.map(d => {
    const isSelected = d.isSelected;
    const isBest     = d.isBest;
    const barWidth   = maxPrice ? Math.round((d.avgPrice / maxPrice) * 100) : 0;
    const netTag     = d.netGain > 50 ? `<span style="font-size:0.75rem;color:#2e7d32;font-weight:700">+₹${d.netGain} net</span>` : '';
    return `
      <div class="comp-row ${isSelected ? 'selected' : ''} ${isBest ? 'best' : ''}">
        <span class="comp-district">${d.district} ${d.rank === 1 ? '🏆' : ''}</span>
        <div class="comp-bar-wrap"><div class="comp-bar" style="width:${barWidth}%"></div></div>
        <span class="comp-price">${fmt(d.avgPrice)}</span>
        ${netTag}
        ${isSelected ? '<span class="comp-tag you">You</span>' : ''}
        ${isBest && !isSelected ? '<span class="comp-tag best">Best</span>' : ''}
      </div>`;
  }).join('');

  renderCompChart(districts, data.topDistricts);
}

function renderCompChart(districts, topDistricts) {
  const ctx = document.getElementById('compChart').getContext('2d');
  if (compChartInst) compChartInst.destroy();

  // Limit to top 8 for readability
  const shown  = districts.slice(0, 8);
  const labels = shown.map(d => d.district);
  const prices = shown.map(d => d.avgPrice || 0);
  const colors = shown.map(d =>
    d.isBest     ? '#FFC107' :
    d.isSelected ? '#64B5F6' :
    '#4CAF50'
  );

  compChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg Price (₹/quintal)',
        data:  prices,
        backgroundColor: colors,
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `₹${ctx.parsed.y.toLocaleString('en-IN')}/qtl`,
          },
        },
      },
      scales: {
        y: {
          grid: { color: '#e0ede0' },
          ticks: { callback: v => '₹' + v.toLocaleString('en-IN'), font: { size: 11 } },
        },
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      },
    },
  });
}

/* ── AI RESEARCH (RAG) ──────────────────────────────────────────── */
const chatMessages = document.getElementById('chatMessages');
const aiQuery      = document.getElementById('aiQuery');
const askBtn       = document.getElementById('askBtn');

async function sendAIQuery(query) {
  if (!query.trim()) return;
  aiQuery.value = '';
  askBtn.disabled = true;

  appendMessage('user', query);
  const typingEl = appendTyping();

  // POST /api/rag/query  { question, crop, state, district, history }
  const data = await apiPost(API.rag, {
    question: query,
    crop:     appState.crop     || 'Rice',
    state:    appState.state    || 'Andhra Pradesh',
    district: appState.district || 'Guntur',
    history:  ragHistory.slice(-6),
  });

  typingEl.remove();
  askBtn.disabled = false;

  const answer = data?.answer || 'Sorry, I could not get a response. Please check the backend connection.';

  // Show crop override notice if question crop differs from UI crop
  if (data?.crop_overridden && data?.crop_used) {
    appendCropNotice(data.crop_used);
  }

  appendMessage('bot', answer, true);

  // Update conversation history
  ragHistory.push({ role: 'user',      text: query  });
  ragHistory.push({ role: 'assistant', text: answer });

  // Update RAG context badge with intent
  if (data?.intent) {
    const badge = document.getElementById('ragContextBadge');
    if (badge) badge.textContent = `${data.intent.icon} ${data.intent.label} · ${data.crop_used || appState.crop || 'General'}`;
  }

  // Highlight active sources based on what was used
  if (data?.sources?.length) highlightActiveSources(data.sources);
  showSources(data?.sources || []);

  // Confidence panel
  if (data?.confidence != null) showConfidence(data.confidence);
}

function appendMessage(role, text, animate = false) {
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = `
    <span class="chat-avatar">${role === 'bot' ? '🌾' : '👤'}</span>
    <div class="chat-bubble"></div>`;
  chatMessages.appendChild(div);
  const bubble = div.querySelector('.chat-bubble');
  if (animate && role === 'bot') {
    typeText(bubble, text);
  } else {
    bubble.textContent = text;
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function appendTyping() {
  const div = document.createElement('div');
  div.className = 'chat-msg bot';
  div.innerHTML = `<span class="chat-avatar">🌾</span>
    <div class="chat-bubble">
      <div class="typing-dots"><span></span><span></span><span></span></div>
    </div>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function typeText(el, text, speed = 14) {
  let i = 0;
  el.textContent = '';
  const interval = setInterval(() => {
    el.textContent += text[i++];
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (i >= text.length) clearInterval(interval);
  }, speed);
}

function appendCropNotice(crop) {
  const div = document.createElement('div');
  div.className = 'chat-msg bot';
  div.innerHTML = `<span class="chat-avatar">ℹ️</span>
    <div class="chat-bubble" style="background:#fff8e1;border-color:#FFC107;font-size:0.82rem;color:#795548">
      Answering about <strong>${crop}</strong> (detected from your question)
    </div>`;
  chatMessages.appendChild(div);
}

function highlightActiveSources(sources) {
  // Reset all
  document.querySelectorAll('.rag-source-item').forEach(el => el.classList.remove('active'));
  const typeMap = {
    'MySQL Price Data':    'rsrcPrice',
    'OpenWeather API':     'rsrcWeather',
    'GNews API':           'rsrcNews',
    'MSP Data':            'rsrcMsp',
    'District Comparison': 'rsrcDistrict',
    'NLP Sentiment Engine':'rsrcSentiment',
    'Prediction Log':      'rsrcPrice',
  };
  sources.forEach(s => {
    const key = typeof s === 'string' ? s : s.type;
    const id  = typeMap[key];
    if (id) {
      const el = document.getElementById(id);
      if (el) el.classList.add('active');
    }
  });
}

function showSources(sources) {
  const list = document.getElementById('sourcesList');
  if (!sources.length) { list.innerHTML = ''; return; }
  list.innerHTML = sources.map(s => {
    const label  = typeof s === 'string' ? s : (s.type || s.name || JSON.stringify(s));
    const detail = s.records ? ` (${s.records} records)` : s.accuracy ? ` · ${s.accuracy}% acc` : s.articles ? ` (${s.articles} articles)` : '';
    return `<div class="source-item">${label}${detail}</div>`;
  }).join('');
}

function showConfidence(conf) {
  const card = document.getElementById('confidenceCard');
  card.style.display = 'block';
  const pct = typeof conf === 'number' ? conf : parseFloat(conf) || 0;
  document.getElementById('confidenceBar').style.width = pct + '%';
  document.getElementById('confidencePct').textContent = Math.round(pct) + '%';
  // Color the bar based on confidence level
  const bar = document.getElementById('confidenceBar');
  bar.style.background = pct >= 75 ? 'linear-gradient(90deg,#4CAF50,#2E7D32)'
                       : pct >= 50 ? 'linear-gradient(90deg,#FFC107,#f57f17)'
                       : 'linear-gradient(90deg,#ef5350,#c62828)';
}

/* ── EVENT LISTENERS ────────────────────────────────────────────── */
askBtn.addEventListener('click', () => sendAIQuery(aiQuery.value));
aiQuery.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIQuery(aiQuery.value); }
});
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => sendAIQuery(btn.dataset.q));
});

/* ── INIT ───────────────────────────────────────────────────────── */
loadStates();
