import React from "react";
import PriceChart from "../components/PriceChart";
import WeatherCard from "../components/WeatherCard";
import AlertCard from "../components/AlertCard";

export default function Results({ result, query, onBack }) {
  const { historicalPrices, predictedPrices, trend, avgPrice, weather, alerts, suggestion } = result;
  const trendUp = trend === "Increasing";

  return (
    <div style={s.page}>
      <div style={s.container}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <h2 style={s.title}>📊 Price Prediction Results</h2>
            <p style={s.sub}>{query.crop} · {query.district}, {query.state} · {query.mandal}</p>
          </div>
          <button style={s.backBtn} onClick={onBack}>← New Search</button>
        </div>

        {/* Summary Row */}
        <div style={s.summaryRow}>
          <div style={s.summaryCard}>
            <p style={s.summaryLabel}>Avg Market Price</p>
            <p style={s.summaryVal}>₹{avgPrice}<span style={s.unit}>/quintal</span></p>
          </div>
          <div style={{ ...s.summaryCard, borderTop: `4px solid ${trendUp ? "#22c55e" : "#ef4444"}` }}>
            <p style={s.summaryLabel}>Price Trend</p>
            <p style={{ ...s.summaryVal, color: trendUp ? "#16a34a" : "#dc2626" }}>
              {trendUp ? "📈 Increasing" : "📉 Decreasing"}
            </p>
          </div>
          <div style={s.summaryCard}>
            <p style={s.summaryLabel}>Predicted (Day 5)</p>
            <p style={s.summaryVal}>₹{predictedPrices[4]?.price}<span style={s.unit}>/quintal</span></p>
          </div>
          <div style={s.summaryCard}>
            <p style={s.summaryLabel}>Alerts</p>
            <p style={{ ...s.summaryVal, color: alerts.length > 0 ? "#dc2626" : "#16a34a" }}>
              {alerts.length > 0 ? `⚠️ ${alerts.length} Alert${alerts.length > 1 ? "s" : ""}` : "✅ All Clear"}
            </p>
          </div>
        </div>

        {/* Alerts */}
        <AlertCard alerts={alerts} suggestion={suggestion} />

        {/* Chart */}
        <PriceChart historicalPrices={historicalPrices} predictedPrices={predictedPrices} />

        {/* Weather + Tables */}
        <div style={s.bottomRow}>
          <WeatherCard weather={weather} />

          <div style={s.tableCard}>
            <h3 style={s.tableTitle}>📅 Historical (Last 7 Days)</h3>
            <table style={s.table}>
              <thead><tr style={s.thead}><th>Date</th><th>Price (₹)</th></tr></thead>
              <tbody>
                {historicalPrices.map((d) => (
                  <tr key={d.date} style={s.trow}>
                    <td style={s.td}>{d.date}</td>
                    <td style={{ ...s.td, fontWeight: 700 }}>₹{d.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={s.tableCard}>
            <h3 style={s.tableTitle}>🔮 Predicted (Next 5 Days)</h3>
            <table style={s.table}>
              <thead><tr style={s.thead}><th>Date</th><th>Price (₹)</th></tr></thead>
              <tbody>
                {predictedPrices.map((d) => (
                  <tr key={d.date} style={s.trow}>
                    <td style={s.td}>{d.date}</td>
                    <td style={{ ...s.td, fontWeight: 700, color: trendUp ? "#16a34a" : "#dc2626" }}>₹{d.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#f8fafc", padding: "24px 16px" },
  container: { maxWidth: 1100, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 },
  title: { margin: 0, color: "#14532d", fontSize: 26, fontWeight: 800 },
  sub: { margin: "4px 0 0 0", color: "#6b7280", fontSize: 14 },
  backBtn: { padding: "10px 20px", background: "#2d6a4f", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 },
  summaryRow: { display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" },
  summaryCard: { flex: 1, minWidth: 160, background: "#fff", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", borderTop: "4px solid #2d6a4f" },
  summaryLabel: { margin: "0 0 6px 0", fontSize: 12, color: "#9ca3af", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5 },
  summaryVal: { margin: 0, fontSize: 22, fontWeight: 800, color: "#111" },
  unit: { fontSize: 13, fontWeight: 400, color: "#6b7280", marginLeft: 2 },
  bottomRow: { display: "flex", gap: 16, flexWrap: "wrap" },
  tableCard: { flex: 1, minWidth: 220, background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" },
  tableTitle: { margin: "0 0 14px 0", color: "#2d6a4f", fontSize: 16 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  thead: { background: "#f0fdf4" },
  trow: { borderBottom: "1px solid #f3f4f6" },
  td: { padding: "9px 8px", color: "#374151" },
};
