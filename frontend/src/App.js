import React, { useState } from "react";
import Home from "./pages/Home";
import Results from "./pages/Results";

export default function App() {
  const [result, setResult] = useState(null);
  const [query, setQuery] = useState(null);

  return result ? (
    <Results result={result} query={query} onBack={() => setResult(null)} />
  ) : (
    <Home onResult={(data, q) => { setResult(data); setQuery(q); }} />
  );
}
