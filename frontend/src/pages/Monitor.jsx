import { useWebSocket } from "../hooks/useWebSocket";
import LiveChart from "../components/LiveChart";
import StatsPanel from "../components/StatsPanel";

export default function Monitor() {
    // Custom hook to manage WebSocket connection and data processing
    const { metrics, getBuffer } = useWebSocket();

    return (
        <div style={{
            background: "#0a0f0a",
            minHeight: "100vh",
            padding: "24px",
            fontFamily: "monospace",
            color: "#00ff88",
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

        {/* Graph */}
        <LiveChart
            getBuffer={getBuffer}
            lastRPeak={metrics.lastRPeak}
        />

        {/* Metrics */}
        <div style={{ marginTop: "16px" }}>
            <StatsPanel metrics={metrics} />
        </div>

        </div>
    );
}