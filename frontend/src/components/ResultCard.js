import React from "react";

export default function ResultCard({ weather, trend, avgPrice, crop, district }) {
  const trendColor = trend === "Increasing" ? "#2d6a4f" : "#e63946";
  const trendIcon = trend === "Increasing" ? "📈" : "📉";

  return (
    <div style={styles.grid}>
      <div style={styles.card}>
        <h4 style={styles.cardTitle}>📍 Query</h4>
        <p><b>Crop:</b> {crop}</p>
        <p><b>District:</b> {district}</p>
        <p><b>Avg Price:</b> ₹{avgPrice}/quintal</p>
      </div>

      <div style={{ ...styles.card, borderLeft: `4px solid ${trendColor}` }}>
        <h4 style={styles.cardTitle}>Trend</h4>
        <p style={{ fontSize: 22, color: trendColor }}>{trendIcon} {trend}</p>
      </div>

      <div style={styles.card}>
        <h4 style={styles.cardTitle}>🌤 Weather</h4>
        <p><b>Temp:</b> {weather.temp}°C</p>
        <p><b>Humidity:</b> {weather.humidity}%</p>
        <p><b>Rain:</b> {weather.rain} mm</p>
        <p style={{ fontSize: 12, color: "#888" }}>{weather.description}</p>
      </div>
    </div>
  );
}

const styles = {
  grid: { display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 },
  card: {
    flex: 1, minWidth: 160, background: "#fff", borderRadius: 10,
    padding: "16px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  cardTitle: { marginBottom: 8, color: "#2d6a4f" },
};
