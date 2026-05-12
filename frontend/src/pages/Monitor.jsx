import { useState }        from "react";
import { useWebSocket }    from "../hooks/useWebSocket";
import { useOfflineECG }   from "../hooks/useOfflineECG";
import LiveChart            from "../components/LiveChart";
import StatsPanel           from "../components/StatsPanel";

const RECORDS = [
  { label: "100 — Ritmo sinusal normal",        path: "/100.csv" },
  { label: "106 — Contracciones ventriculares", path: "/106.csv" },
  { label: "119 — Bigeminismo",                 path: "/119.csv" },
  { label: "208 — Arritmia mixta",              path: "/208.csv" },
];

export default function Monitor() {
  const [mode,    setMode]    = useState("offline");
  const [csvPath, setCsvPath] = useState("/100.csv");

  // Ambos hooks viven siempre — React lo requiere
  // useWebSocket recibe enabled=false cuando estamos offline → no intenta conectar
  const wsData      = useWebSocket(mode === "online");
  const offlineData = useOfflineECG(csvPath);

  // Elegir fuente según modo — esto NO es un hook, es solo una variable
  const { metrics, getBuffer } = mode === "offline" ? offlineData : wsData;

  return (
    <div style={{
      background: "#0a0f0a", minHeight: "100vh",
      padding: "24px", fontFamily: "monospace",
      color: "#00ff88", boxSizing: "border-box",
    }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.1rem", letterSpacing: "0.2em", color: "#4a7a4a" }}>
            ── ECG MONITOR ──
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#2a4a2a" }}>
            Bioinstrumentación · ESP32 · 500 Hz
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {mode === "offline" && (
            <select
              value={csvPath}
              onChange={(e) => setCsvPath(e.target.value)}
              style={{
                background: "#111a11", color: "#00ff88",
                border: "1px solid #1f3d1f", borderRadius: "6px",
                padding: "6px 10px", fontFamily: "monospace", fontSize: "11px",
              }}
            >
              {RECORDS.map((r) => (
                <option key={r.path} value={r.path}>{r.label}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => setMode(m => m === "online" ? "offline" : "online")}
            style={{
              background:   mode === "online" ? "#003300" : "#1a0000",
              color:        mode === "online" ? "#00ff88" : "#ff4444",
              border:       `1px solid ${mode === "online" ? "#00ff88" : "#ff4444"}`,
              borderRadius: "6px", padding: "6px 14px",
              fontFamily:   "monospace", fontSize: "11px", cursor: "pointer",
            }}
          >
            {mode === "online" ? "● LIVE" : "○ OFFLINE"}
          </button>
        </div>
      </div>

      {/* Gráfica con altura explícita */}
      <div style={{ width: "100%", height: "220px" }}>
        <LiveChart getBuffer={getBuffer} lastRPeak={metrics.lastRPeak} />
      </div>

      {/* Métricas */}
      <div style={{ marginTop: "16px" }}>
        <StatsPanel metrics={metrics} />
      </div>

      {/* Badge */}
      <div style={{ marginTop: "12px", fontSize: "10px", color: "#2a4a2a" }}>
        {mode === "offline"
          ? "MODO OFFLINE · MIT-BIH Arrhythmia Database · PhysioNet"
          : `MODO LIVE · ws://${window.location.hostname}:81`}
      </div>
    </div>
  );
}