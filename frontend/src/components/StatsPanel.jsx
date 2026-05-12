export default function StatsPanel({ metrics }) {
  const { bpm, connected, sampleCount } = metrics;

  // Clasificación visual del BPM
  const bpmStatus =
    bpm === "--"   ? { label: "Sin señal", color: "#666" }
    : bpm < 60     ? { label: "Bradicardia", color: "#4488ff" }
    : bpm <= 100   ? { label: "Normal",      color: "#00ff88" }
    : bpm <= 150   ? { label: "Taquicardia", color: "#ffaa00" }
    :                { label: "Alerta",       color: "#ff4444" };

  const cardStyle = {
    background:   "#111a11",
    border:       "1px solid #1f3d1f",
    borderRadius: "8px",
    padding:      "16px 20px",
    minWidth:     "140px",
    textAlign:    "center",
  };

  const labelStyle = {
    fontSize: "11px",
    color:    "#4a7a4a",
    fontFamily: "monospace",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    marginBottom: "6px",
  };

  const valueStyle = (color = "#00ff88") => ({
    fontSize:   "2.2rem",
    fontWeight: "700",
    fontFamily: "monospace",
    color,
    lineHeight: "1",
  });

  return (
    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>

      {/* BPM */}
      <div style={cardStyle}>
        <div style={labelStyle}>Frecuencia</div>
        <div style={valueStyle(bpmStatus.color)}>{bpm}</div>
        <div style={{ fontSize: "10px", color: bpmStatus.color, marginTop: "4px" }}>
          {bpmStatus.label}
        </div>
      </div>

      {/* Estado de conexión */}
      <div style={cardStyle}>
        <div style={labelStyle}>ESP32</div>
        <div style={valueStyle(connected ? "#00ff88" : "#ff4444")}>
          {connected ? "ON" : "OFF"}
        </div>
        <div style={{ fontSize: "10px", color: "#4a7a4a", marginTop: "4px" }}>
          {connected ? "Conectado" : "Sin señal"}
        </div>
      </div>

      {/* Muestras recibidas */}
      <div style={cardStyle}>
        <div style={labelStyle}>Muestras</div>
        <div style={{ ...valueStyle(), fontSize: "1.4rem" }}>
          {sampleCount.toLocaleString()}
        </div>
        <div style={{ fontSize: "10px", color: "#4a7a4a", marginTop: "4px" }}>
          @ 500 Hz
        </div>
      </div>

    </div>
  );
}