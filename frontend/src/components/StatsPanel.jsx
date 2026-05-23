const COLOR_MAP = {
  BLUE:   { hex: "#4488ff", label: "Bradicardia", range: "< 60 bpm"    },
  GREEN:  { hex: "#00c97a", label: "Normal",      range: "60–99 bpm"   },
  YELLOW: { hex: "#f5a623", label: "Taquicardia", range: "100–140 bpm" },
  RED:    { hex: "#ff4444", label: "Alerta",      range: "> 140 bpm"   },
  NONE:   { hex: "#555",    label: "Sin señal",   range: "—"           },
};

// Estilo de base
const CARD = {
  background:   "#0d160d",
  border:       "1px solid #1f3d1f",
  borderRadius: "10px",
  padding:      "14px 18px",
  minWidth:     "130px",
  display:      "flex",
  flexDirection:"column",
  gap:          "4px",
};

const LABEL = {
  fontSize:      "10px",
  color:         "#4a7a4a",
  fontFamily:    "monospace",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const VALUE = (color = "#00ff88", size = "2.2rem") => ({
  fontSize:   size,
  fontWeight: "700",
  fontFamily: "monospace",
  color,
  lineHeight: "1.1",
});

const SUB = (color = "#4a7a4a") => ({
  fontSize:  "10px",
  color,
  fontFamily:"monospace",
});


export default function StatsPanel({ metrics, fs = 300 }) {
  const {
    bpm         = "--",
    color       = "NONE",
    min         = 0,
    max         = 0,
    connected   = false,
    sampleCount = 0,
    mode        = "websocket",
    lastRPeak   = null,
  } = metrics;

  const statusInfo = COLOR_MAP[color] ?? COLOR_MAP.NONE;
  const accentColor = connected ? statusInfo.hex : "#555";

  // Tiempo desde el ultimo pico R
  const rPeakAge = lastRPeak
    ? `${((Date.now() - lastRPeak) / 1000).toFixed(1)}s`
    : "—";

  // Rango ADC 
  const toVolt = (raw) => ((raw / 4095) * 3.3).toFixed(2);

  return (
    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "stretch" }}>

      // BPM y estado de color 
      <div style={{ ...CARD, borderColor: accentColor + "55", minWidth: "150px" }}>
        // Barra de color 
        <div style={{
          position:     "absolute",
          left:         0, top: "10%",
          width:        "3px",
          height:       "80%",
          background:   accentColor,
          borderRadius: "2px",
          boxShadow:    `0 0 8px ${accentColor}`,
        }} />
        <div style={LABEL}>Frecuencia</div>
        <div style={VALUE(accentColor)}>
          {bpm === "--" ? "--" : Math.round(bpm)}
        </div>
        <div style={SUB(accentColor)}>{statusInfo.label}</div>
        <div style={SUB()}>{statusInfo.range}</div>
      </div>

      // Indicador de color 
      <div style={{ ...CARD, alignItems: "center", justifyContent: "center", minWidth: "90px" }}>
        <div style={LABEL}>Estado</div>
        <div style={{
          width:        "36px",
          height:       "36px",
          borderRadius: "50%",
          background:   accentColor,
          boxShadow:    `0 0 16px ${accentColor}, 0 0 4px ${accentColor}`,
          margin:       "4px 0",
          transition:   "background 0.3s, box-shadow 0.3s",
        }} />
        <div style={SUB(accentColor)}>{color}</div>
      </div>

      // Conexion 
      <div style={CARD}>
        <div style={LABEL}>Fuente</div>
        <div style={VALUE(connected ? "#00ff88" : "#ff4444", "1.3rem")}>
          {connected ? "LIVE" : "OFF"}
        </div>
        <div style={SUB()}>
          {mode === "offline"     ? "CSV offline"    :
           mode === "ble-direct"  ? "BLE directo"    :
                                    "WebSocket"}
        </div>
        <div style={SUB(connected ? "#00c97a" : "#ff4444")}>
          {connected ? "● conectado" : "○ desconectado"}
        </div>
      </div>

      // Rango ADC 
      <div style={CARD}>
        <div style={LABEL}>Rango ADC</div>
        <div style={{ ...VALUE(), fontSize: "1.1rem", letterSpacing: "0.05em" }}>
          {min} – {max}
        </div>
        <div style={SUB()}>
          {toVolt(min)} V – {toVolt(max)} V
        </div>
        <div style={SUB()}>12-bit / 3.3 V</div>
      </div>

      // Muestras y ultimo pico R
      <div style={CARD}>
        <div style={LABEL}>Muestras</div>
        <div style={{ ...VALUE(), fontSize: "1.4rem" }}>
          {sampleCount.toLocaleString()}
        </div>
        <div style={SUB()}>@ {fs} Hz</div>
        <div style={{ marginTop: "8px", ...LABEL }}>Último R-peak</div>
        <div style={SUB(accentColor)}>{rPeakAge} atrás</div>
      </div>

    </div>
  );
}