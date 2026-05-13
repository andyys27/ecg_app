import { useState, useEffect, useRef } from "react";
import { useNavigate }                  from "react-router-dom";
import { useAuth }                      from "../context/AuthContext";
import { supabase }                     from "../lib/supabase";
import { useWebSocket }                 from "../hooks/useWebSocket";
import { useOfflineECG }                from "../hooks/useOfflineECG";
import { useBluetooth }                 from "../hooks/useBluetooth";
import LiveChart                         from "../components/LiveChart";

const RECORDS = [
  { label: "100 — Ritmo sinusal normal",        path: "/100.csv" },
  { label: "106 — Contracciones ventriculares", path: "/106.csv" },
  { label: "119 — Bigeminismo",                 path: "/119.csv" },
  { label: "208 — Arritmia mixta",              path: "/208.csv" },
];

// ── Clasificación de estado cardiovascular ─────────────
function classifyState(bpm, sdnn) {
  if (bpm === "--" || bpm === 0) return "sin_señal";
  const b = Number(bpm);
  if (b < 50)  return "bradicardia";
  if (b > 150) return "taquicardia";
  if (sdnn !== "--" && Number(sdnn) < 20) return "arritmia";
  if (b > 100) return "elevado";
  return "normal";
}

const STATE_CONFIG = {
  sin_señal:   { color: "#5a6280", bg: "rgba(90,98,128,0.12)",   border: "rgba(90,98,128,0.3)",   icon: "ti-heart",           label: "Sin señal",    desc: "Esperando datos del sensor"          },
  normal:      { color: "#4fc7a4", bg: "rgba(79,199,164,0.12)",  border: "rgba(79,199,164,0.3)",  icon: "ti-heart",           label: "Normal",       desc: "Ritmo sinusal dentro del rango"      },
  elevado:     { color: "#f7a84f", bg: "rgba(247,168,79,0.12)",  border: "rgba(247,168,79,0.3)",  icon: "ti-heart-rate-monitor", label: "Elevado",   desc: "BPM por encima de 100"               },
  taquicardia: { color: "#e24b4a", bg: "rgba(226,75,74,0.12)",   border: "rgba(226,75,74,0.3)",   icon: "ti-alert-triangle",  label: "Taquicardia", desc: "Frecuencia cardíaca muy elevada"     },
  bradicardia: { color: "#4f8ef7", bg: "rgba(79,142,247,0.12)",  border: "rgba(79,142,247,0.3)",  icon: "ti-alert-triangle",  label: "Bradicardia", desc: "Frecuencia cardíaca muy baja"        },
  arritmia:    { color: "#e24b4a", bg: "rgba(226,75,74,0.12)",   border: "rgba(226,75,74,0.3)",   icon: "ti-alert-circle",    label: "Arritmia",    desc: "Variabilidad irregular detectada"    },
};

// ── Cálculo de métricas HRV ────────────────────────────
function calcHRV(rrIntervals) {
  if (rrIntervals.length < 2) return { sdnn: "--", rmssd: "--" };
  const mean = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
  const sdnn = Math.round(Math.sqrt(
    rrIntervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / rrIntervals.length
  ));
  const diffs = [];
  for (let i = 1; i < rrIntervals.length; i++)
    diffs.push(Math.pow(rrIntervals[i] - rrIntervals[i - 1], 2));
  const rmssd = Math.round(Math.sqrt(diffs.reduce((a, b) => a + b, 0) / diffs.length));
  return { sdnn, rmssd };
}

// ── Componente principal ───────────────────────────────
export default function Monitor() {
  const navigate       = useNavigate();
  const { user }       = useAuth();

  const [mode,    setMode]    = useState("offline");
  const [csvPath, setCsvPath] = useState("/100.csv");
  const [session, setSession] = useState(null);   // sesión activa en Supabase
  const [elapsed, setElapsed] = useState(0);      // segundos transcurridos
  const [rrList,  setRrList]  = useState([]);     // intervalos RR acumulados
  const timerRef = useRef(null);
  const startRef = useRef(null);

  // Hooks de datos — siempre los tres, regla de React
  const wsData      = useWebSocket(mode === "online");
  const offlineData = useOfflineECG(csvPath);
  const btData      = useBluetooth();

  const { metrics, getBuffer } =
    mode === "offline"   ? offlineData :
    mode === "bluetooth" ? btData      : wsData;

  // Acumular intervalos RR cuando llega un pico
  useEffect(() => {
    if (metrics.lastRPeak && session) {
      setRrList((prev) => {
        if (prev.length === 0) return [metrics.lastRPeak];
        const last = prev[prev.length - 1];
        const rr   = metrics.lastRPeak - last;
        if (rr > 300 && rr < 2000) return [...prev.slice(-30), metrics.lastRPeak];
        return prev;
      });
    }
  }, [metrics.lastRPeak]);

  // Timer de sesión
  useEffect(() => {
    if (session) {
      startRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => clearInterval(timerRef.current);
  }, [session]);

  function formatElapsed(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // Iniciar sesión en Supabase
  async function startSession() {
    if (!user) return;
    const { data, error } = await supabase.from("sessions").insert({
      user_id: user.id,
      modo:    mode,
      registro_mitbih: mode === "offline" ? csvPath : null,
    }).select().single();
    if (!error) setSession(data);
  }

  // Terminar sesión — guardar mediciones y navegar a resultados
  async function endSession() {
    if (!session) return;
    clearInterval(timerRef.current);

    const bpm  = Number(metrics.bpm);
    const rrIntervals = [];
    for (let i = 1; i < rrList.length; i++)
      rrIntervals.push(rrList[i] - rrList[i - 1]);
    const { sdnn, rmssd } = calcHRV(rrIntervals);
    const estado = classifyState(bpm, sdnn);

    // Actualizar duración de la sesión
    await supabase.from("sessions")
      .update({ duracion_seg: elapsed })
      .eq("id", session.id);

    // Guardar mediciones
    await supabase.from("ecg_measurements").insert({
      session_id:   session.id,
      bpm_promedio: isNaN(bpm) ? null : bpm,
      sdnn:         sdnn === "--" ? null : sdnn,
      rmssd:        rmssd === "--" ? null : rmssd,
      estado:       estado === "sin_señal" ? "indefinido" : estado,
    });

    navigate("/dashboard");
  }

  // Estado cardiovascular actual
  const rrIntervals = [];
  for (let i = 1; i < rrList.length; i++)
    rrIntervals.push(rrList[i] - rrList[i - 1]);
  const { sdnn, rmssd } = calcHRV(rrIntervals);
  const estado  = classifyState(metrics.bpm, sdnn);
  const stConf  = STATE_CONFIG[estado];

  return (
    <div style={s.page}>
      {/* ── Navbar ── */}
      <nav style={s.nav}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={s.logoIcon}>
            <i className="ti ti-activity" style={{ fontSize: 15, color: "#fff" }} aria-hidden="true" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#e8eaf0" }}>CardioSense</span>
          <span style={{ fontSize: 11, color: "#5a6280" }}>· Monitor</span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Selector de modo */}
          <div style={s.modeSelector}>
            {["offline", "bluetooth", "online"].map((m) => (
              <button key={m} disabled={!!session}
                onClick={() => setMode(m)}
                style={{
                  ...s.modeBtn,
                  background: mode === m ? "#2a3050" : "transparent",
                  color:      mode === m ? "#4f8ef7"  : "#5a6280",
                  fontWeight: mode === m ? 500 : 400,
                }}>
                {m === "offline" ? "Offline" : m === "bluetooth" ? "Bluetooth" : "WiFi"}
              </button>
            ))}
          </div>

          {/* Conectar BLE */}
          {mode === "bluetooth" && !session && (
            <button style={s.btnGhost}
              onClick={metrics.connected ? btData.disconnect : btData.connect}>
              <i className={`ti ${metrics.connected ? "ti-bluetooth-off" : "ti-bluetooth"}`}
                style={{ fontSize: 13, marginRight: 5 }} aria-hidden="true" />
              {metrics.connected ? "Desconectar" : "Conectar ESP32"}
            </button>
          )}

          <button style={s.btnBack} onClick={() => navigate("/dashboard")}>
            <i className="ti ti-arrow-left" style={{ fontSize: 13, marginRight: 5 }} aria-hidden="true" />
            Dashboard
          </button>
        </div>
      </nav>

      {/* ── Contenido ── */}
      <div style={s.content}>

        {/* ── Fila superior: Estado + Métricas ── */}
        <div style={s.topRow}>

          {/* Indicador de estado */}
          <div style={{ ...s.card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, minWidth: 150 }}>
            <div style={{
              width: 60, height: 60, borderRadius: "50%",
              background: stConf.bg,
              border: `2px solid ${stConf.color}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.4s ease",
            }}>
              <i className={`ti ${stConf.icon}`}
                style={{ fontSize: 26, color: stConf.color }} aria-hidden="true" />
            </div>
            <span style={{
              fontSize: 12, fontWeight: 500, padding: "3px 12px",
              borderRadius: 20, background: stConf.bg, color: stConf.color,
            }}>
              {stConf.label}
            </span>
            <p style={{ fontSize: 10, color: "#5a6280", textAlign: "center", lineHeight: 1.4 }}>
              {stConf.desc}
            </p>
            {session && (
              <p style={{ fontSize: 12, color: "#4f8ef7", fontWeight: 500 }}>
                <i className="ti ti-clock" style={{ fontSize: 11, marginRight: 4 }} aria-hidden="true" />
                {formatElapsed(elapsed)}
              </p>
            )}
          </div>

          {/* Métricas */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flex: 1 }}>
            <MetricCard label="Frecuencia" value={metrics.bpm} unit="BPM" color="#4f8ef7" />
            <MetricCard label="SDNN"       value={sdnn}        unit="ms"  color="#7c6af7" />
            <MetricCard label="RMSSD"      value={rmssd}       unit="ms"  color="#4fc7a4" />
            <MetricCard label="Muestras"   value={typeof metrics.sampleCount === "number"
              ? metrics.sampleCount.toLocaleString() : "--"} unit="" color="#f7a84f" />
          </div>
        </div>

        {/* ── ECG en vivo ── */}
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p style={s.cardLabel}>ECG en vivo</p>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "#5a6280" }}>500 Hz · 0.5–40 Hz</span>
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: metrics.connected || mode === "offline" ? "#4fc7a4" : "#5a6280",
              }} />
            </div>
          </div>
          <div style={{ width: "100%", height: 180 }}>
            <LiveChart getBuffer={getBuffer} lastRPeak={metrics.lastRPeak} theme="app" />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 10, color: "#3a4060" }}>3s</span>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#e24b4a" }} />
              <span style={{ fontSize: 10, color: "#3a4060" }}>R-peak detectado</span>
            </div>
          </div>
        </div>

        {/* ── Alerta + Botón sesión ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
          <div style={{
            background: stConf.bg, border: `0.5px solid ${stConf.border}`,
            borderRadius: 10, padding: "12px 16px",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <i className={`ti ${stConf.icon}`}
              style={{ fontSize: 18, color: stConf.color, flexShrink: 0 }} aria-hidden="true" />
            <div>
              <p style={{ fontSize: 13, color: stConf.color, fontWeight: 500, marginBottom: 2 }}>
                {stConf.label}
              </p>
              <p style={{ fontSize: 11, color: "#5a6280" }}>{stConf.desc}</p>
            </div>
          </div>

          {!session ? (
            <button style={s.btnStart} onClick={startSession}>
              <i className="ti ti-player-play" style={{ fontSize: 15, marginRight: 6 }} aria-hidden="true" />
              Iniciar sesión
            </button>
          ) : (
            <button style={s.btnStop} onClick={endSession}>
              <i className="ti ti-player-stop" style={{ fontSize: 15, marginRight: 6 }} aria-hidden="true" />
              Terminar
            </button>
          )}
        </div>

        {/* ── Selector de registro offline ── */}
        {mode === "offline" && !session && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <p style={{ fontSize: 11, color: "#5a6280", whiteSpace: "nowrap" }}>Registro MIT-BIH:</p>
            <select value={csvPath} onChange={(e) => setCsvPath(e.target.value)} style={s.select}>
              {RECORDS.map((r) => (
                <option key={r.path} value={r.path}>{r.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Badge ── */}
        <p style={{ fontSize: 10, color: "#2a3050", marginTop: 8 }}>
          {mode === "offline"
            ? "MIT-BIH Arrhythmia Database · PhysioNet · physionet.org"
            : mode === "bluetooth"
            ? "Web Bluetooth API · Solo Chrome / Edge"
            : `WebSocket · ws://${window.location.hostname}:81`}
        </p>
      </div>
    </div>
  );
}

// ── Subcomponente: tarjeta de métrica ─────────────────
function MetricCard({ label, value, unit, color }) {
  return (
    <div style={s.card}>
      <p style={s.cardLabel}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 500, color: "#e8eaf0", marginTop: 2 }}>
        {value}
        {unit && <span style={{ fontSize: 13, color: "#5a6280", marginLeft: 4 }}>{unit}</span>}
      </p>
    </div>
  );
}

// ── Estilos ───────────────────────────────────────────
const s = {
  page: {
    background: "#0d1117", minHeight: "100vh",
    fontFamily: "var(--font-sans, system-ui, sans-serif)", color: "#e8eaf0",
  },
  nav: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 24px", borderBottom: "0.5px solid rgba(255,255,255,0.07)",
    position: "sticky", top: 0, background: "#0d1117", zIndex: 10,
  },
  logoIcon: {
    width: 28, height: 28, background: "#4f8ef7", borderRadius: 7,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  content: { maxWidth: 860, margin: "0 auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 14 },
  topRow:  { display: "grid", gridTemplateColumns: "auto 1fr", gap: 14 },
  card: {
    background: "#1a1f2e", border: "0.5px solid rgba(255,255,255,0.07)",
    borderRadius: 12, padding: "14px 16px",
  },
  cardLabel: { fontSize: 10, color: "#5a6280", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 2 },
  modeSelector: {
    display: "flex", background: "#1a1f2e",
    border: "0.5px solid rgba(255,255,255,0.07)",
    borderRadius: 8, padding: 3, gap: 2,
  },
  modeBtn: {
    padding: "4px 12px", borderRadius: 6, border: "none",
    fontSize: 11, cursor: "pointer", transition: "all 0.2s",
  },
  btnBack: {
    background: "transparent", border: "0.5px solid rgba(255,255,255,0.1)",
    borderRadius: 8, padding: "6px 12px", color: "#8b92a8",
    fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center",
  },
  btnGhost: {
    background: "transparent", border: "0.5px solid rgba(255,255,255,0.1)",
    borderRadius: 8, padding: "6px 12px", color: "#8b92a8",
    fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center",
  },
  btnStart: {
    background: "#4f8ef7", border: "none", borderRadius: 10,
    padding: "12px 20px", color: "#fff", fontSize: 13,
    fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
    display: "flex", alignItems: "center",
  },
  btnStop: {
    background: "#e24b4a", border: "none", borderRadius: 10,
    padding: "12px 20px", color: "#fff", fontSize: 13,
    fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
    display: "flex", alignItems: "center",
  },
  select: {
    flex: 1, background: "#1a1f2e", border: "0.5px solid rgba(255,255,255,0.1)",
    borderRadius: 8, padding: "7px 10px", color: "#e8eaf0",
    fontSize: 12, outline: "none",
  },
};