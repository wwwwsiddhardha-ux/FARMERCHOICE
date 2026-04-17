import React, { useState } from "react";
import axios from "axios";
import { locationData, crops } from "../data/locationData";

export default function InputForm({ onResult }) {
  const [form, setForm] = useState({ crop: "", state: "", district: "", mandal: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const states = Object.keys(locationData);
  const districts = form.state ? Object.keys(locationData[form.state]) : [];
  const mandals = form.state && form.district ? locationData[form.state][form.district] || [] : [];

  const set = (key, value) => {
    if (key === "state") setForm({ crop: form.crop, state: value, district: "", mandal: "" });
    else if (key === "district") setForm({ ...form, district: value, mandal: "" });
    else setForm({ ...form, [key]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await axios.post("/api/predict-price", form);
      onResult(data, form);
    } catch (err) {
      setError(err.response?.data?.error || "Server error. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const sel = (label, key, options, disabled) => (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      <select style={{ ...s.input, color: form[key] ? "#222" : "#999" }}
        value={form[key]} onChange={(e) => set(key, e.target.value)} disabled={disabled} required>
        <option value="">Select {label}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={s.form}>
      {sel("Crop", "crop", crops, false)}
      {sel("State", "state", states, false)}
      {sel("District", "district", districts, !form.state)}
      {sel("Mandal", "mandal", mandals, !form.district)}
      {error && <p style={s.error}>{error}</p>}
      <button style={s.btn} type="submit" disabled={loading}>
        {loading ? <span style={s.spinner}>⏳ Predicting...</span> : "🔍 Predict Price"}
      </button>
    </form>
  );
}

const s = {
  form: { display: "flex", flexDirection: "column", gap: 14 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontWeight: 600, fontSize: 13, color: "#444", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { padding: "10px 12px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 15, background: "#fff", cursor: "pointer" },
  btn: { marginTop: 6, padding: "13px", background: "linear-gradient(135deg,#2d6a4f,#40916c)", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5 },
  error: { color: "#dc2626", fontSize: 13, background: "#fef2f2", padding: "8px 12px", borderRadius: 6 },
  spinner: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
};
