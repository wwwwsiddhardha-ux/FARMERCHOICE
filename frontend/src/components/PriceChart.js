import React from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Title, Tooltip, Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function PriceChart({ historicalPrices, predictedPrices }) {
  const histLabels = historicalPrices.map((d) => d.date);
  const predLabels = predictedPrices.map((d) => d.date);
  const allLabels = [...histLabels, ...predLabels];

  const histPrices = historicalPrices.map((d) => d.price);
  const predPrices = predictedPrices.map((d) => d.price);

  const data = {
    labels: allLabels,
    datasets: [
      {
        label: "Historical Price (₹/quintal)",
        data: [...histPrices, ...Array(predLabels.length).fill(null)],
        borderColor: "#2d6a4f",
        backgroundColor: "rgba(45,106,79,0.1)",
        tension: 0.4,
        pointRadius: 6,
        pointHoverRadius: 8,
      },
      {
        label: "Predicted Price (₹/quintal)",
        data: [...Array(histLabels.length).fill(null), ...predPrices],
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245,158,11,0.1)",
        borderDash: [8, 4],
        tension: 0.4,
        pointRadius: 6,
        pointHoverRadius: 8,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: "top", labels: { font: { size: 13, weight: 600 } } },
      tooltip: { backgroundColor: "rgba(0,0,0,0.8)", padding: 12, titleFont: { size: 14 }, bodyFont: { size: 13 } },
    },
    scales: {
      y: { title: { display: true, text: "Price (₹/quintal)", font: { size: 13, weight: 600 } }, grid: { color: "#f3f4f6" } },
      x: { grid: { display: false } },
    },
  };

  return (
    <div style={s.card}>
      <h3 style={s.title}>📈 Price Trend Analysis</h3>
      <Line data={data} options={options} />
    </div>
  );
}

const s = {
  card: { background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", marginBottom: 20 },
  title: { margin: "0 0 16px 0", color: "#2d6a4f", fontSize: 18 },
};
