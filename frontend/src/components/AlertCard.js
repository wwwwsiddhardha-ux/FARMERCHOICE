import React from "react";

export default function AlertCard({ alerts, suggestion }) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div style={s.container}>
      <h3 style={s.title}>⚠️ Alerts & Recommendations</h3>
      {alerts.map((alert, i) => (
        <div key={i} style={{ ...s.alert, ...s[alert.type] }}>
          {alert.message}
        </div>
      ))}
      {suggestion && (
        <div style={s.suggestion}>
          <strong>💡 Smart Suggestion:</strong> {suggestion}
        </div>
      )}
    </div>
  );
}

const s = {
  container: { background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", marginBottom: 20 },
  title: { margin: "0 0 14px 0", color: "#2d6a4f", fontSize: 18 },
  alert: { padding: "12px 16px", borderRadius: 8, marginBottom: 10, fontSize: 14, lineHeight: 1.5, borderLeft: "4px solid" },
  danger: { background: "#fef2f2", color: "#991b1b", borderColor: "#dc2626" },
  warning: { background: "#fffbeb", color: "#92400e", borderColor: "#f59e0b" },
  suggestion: { padding: "14px 16px", borderRadius: 8, background: "#f0fdf4", color: "#166534", fontSize: 14, lineHeight: 1.6, borderLeft: "4px solid #22c55e" },
};
