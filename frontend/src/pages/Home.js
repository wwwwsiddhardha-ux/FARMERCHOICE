import React from "react";
import InputForm from "../components/InputForm";

export default function Home({ onResult }) {
  return (
    <div style={s.page}>
      <div style={s.hero}>
        <div style={s.badge}>🏆 Hackathon Project — AI for Agriculture</div>
        <h1 style={s.title}>🌾 AI Farmer Market Intelligence</h1>
        <p style={s.sub}>Predict crop prices using historical mandi data & real-time weather intelligence</p>
        <div style={s.tags}>
          {["📊 Price Prediction", "🌤 Weather Analysis", "⚠️ Smart Alerts", "💡 Sell Suggestions"].map((t) => (
            <span key={t} style={s.tag}>{t}</span>
          ))}
        </div>
      </div>
      <div style={s.card}>
        <h2 style={s.cardTitle}>Get Price Prediction</h2>
        <InputForm onResult={onResult} />
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "linear-gradient(160deg,#f0fdf4 0%,#ecfdf5 50%,#f0f9ff 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 16px", gap: 32 },
  hero: { textAlign: "center", maxWidth: 640 },
  badge: { display: "inline-block", background: "#fef3c7", color: "#92400e", padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, marginBottom: 16 },
  title: { fontSize: 36, fontWeight: 800, color: "#14532d", margin: "0 0 12px 0", lineHeight: 1.2 },
  sub: { fontSize: 17, color: "#4b7c5e", margin: "0 0 20px 0", lineHeight: 1.6 },
  tags: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  tag: { background: "#fff", border: "1.5px solid #bbf7d0", color: "#166534", padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500 },
  card: { background: "#fff", borderRadius: 20, padding: "36px 40px", boxShadow: "0 8px 32px rgba(0,0,0,0.1)", width: "100%", maxWidth: 480 },
  cardTitle: { margin: "0 0 24px 0", color: "#14532d", fontSize: 22, fontWeight: 700, textAlign: "center" },
};
