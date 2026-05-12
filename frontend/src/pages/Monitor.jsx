import { useWebSocket } from "../hooks/useWebSocket";
import LiveChart         from "../components/LiveChart";
import StatsPanel        from "../components/StatsPanel";

export default function Monitor() {
  // Una sola instancia del hook — una sola conexión WebSocket
  const { metrics, getBuffer } = useWebSocket();

  return (
    <div style={{
      background:  "#0a0f0a",
      minHeight:   "100vh",
      padding:     "24px",
      fontFamily:  "monospace",
      color:       "#00ff88",
    }}>

      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ margin: 0, fontSize: "1.1rem", letterSpacing: "0.2em", color: "#4a7a4a" }}>
          ── ECG MONITOR ──
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#2a4a2a" }}>
          Bioinstrumentación · ESP32 · 500 Hz
        </p>
      </div>

      {/* Gráfica en vivo */}
      <LiveChart
        getBuffer={getBuffer}
        lastRPeak={metrics.lastRPeak}
      />

      {/* Métricas */}
      <div style={{ marginTop: "16px" }}>
        <StatsPanel metrics={metrics} />
      </div>

    </div>
  );
}