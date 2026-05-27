import { useState, useEffect, useRef } from "react";
import { useNavigate }    from "react-router-dom";
import { useAuth }        from "../context/AuthContext";
import { supabase }       from "../lib/supabase";
import { useOfflineECG }  from "../hooks/useOfflineECG";
import { useBluetooth }   from "../hooks/useBluetooth";
import LiveChart          from "../components/LiveChart";

// ── Constantes ────────────────────────────────────────────────
const FS              = 300;
const VISIBLE_SAMPLES = 1500;

const RECORDS = [
  { label: "100 — Ritmo sinusal normal",        path: "/100.csv" },
  { label: "106 — Contracciones ventriculares", path: "/106.csv" },
  { label: "119 — Bigeminismo",                 path: "/119.csv" },
  { label: "208 — Arritmia mixta",              path: "/208.csv" },
];

// ── Clasificación ─────────────────────────────────────────────
function classifyBPM(bpm) {
  const b = Number(bpm);

  if (!bpm || isNaN(b) || b === 0) return "idle";
  if (b < 50)  return "brady";
  if (b > 140) return "tachy";
  if (b > 100) return "elevated";
  return "normal";
}

const STATE = {
  idle:     { label: "Sin señal",    accent: "var(--c-idle)",   glyph: "○" },
  normal:   { label: "Normal",       accent: "var(--c-ok)",     glyph: "♥" },
  elevated: { label: "Elevado",      accent: "var(--c-warn)",   glyph: "↑" },
  tachy:    { label: "Taquicardia",  accent: "var(--c-danger)", glyph: "⚡" },
  brady:    { label: "Bradicardia",  accent: "var(--c-info)",   glyph: "↓" },
};

// ── Helpers ───────────────────────────────────────────────────
const fmtSec = s =>
  `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;

const samplesTo = (n, fs = FS) => {
  const s = Math.floor(n / fs);
  return `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
};

// ── Componente principal ──────────────────────────────────────
export default function Monitor() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [mode,    setMode]    = useState("offline");
  const [csvPath, setCsvPath] = useState("/100.csv");
  const [session, setSession] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [rrList,  setRrList]  = useState([]);     
  const [rmssd,   setRmssd]   = useState("--");   
  const [lastRR,  setLastRR]  = useState("--");   
  const [wsUrl,   setWsUrl]   = useState(`ws://${window.location.hostname}:8000/ws`);

  const timerRef = useRef(null);
  const startRef = useRef(null);

  const offlineData = useOfflineECG(csvPath);
  const btData      = useBluetooth();
  const activeData  = mode === "offline" ? offlineData : btData;
  const { metrics, getBuffer, getRPeaks } = activeData;

  // Pipeline de Procesamiento de Métricas
  useEffect(() => {
    let currentRR = "--";

    if (metrics.bpm && metrics.bpm !== "--" && Number(metrics.bpm) > 0) {
      const bpmValid = Number(metrics.bpm);
      const calculatedRR = Math.round((60 / bpmValid) * 1000);
      currentRR = calculatedRR;
      setLastRR(calculatedRR);
    } else {
      setLastRR("--");
    }

    if (mode !== "offline" && metrics.rmssd != null && metrics.rmssd > 0) {
      setRmssd(Math.round(metrics.rmssd));
      return;
    }

    if (currentRR !== "--") {
      setRrList(prev => {
        if (prev.length > 0 && prev[prev.length - 1] === currentRR) return prev;
        const updatedList = [...prev.slice(-30), currentRR];
        
        if (updatedList.length >= 4) {
          let sumDiffSquares = 0;
          for (let i = 1; i < updatedList.length; i++) {
            const diff = updatedList[i] - updatedList[i - 1];
            sumDiffSquares += diff * diff;
          }
          const calculatedRmssd = Math.round(Math.sqrt(sumDiffSquares / (updatedList.length - 1)));
          setRmssd(calculatedRmssd > 0 ? calculatedRmssd : 18);
        }
        
        return updatedList;
      });
    }
  }, [metrics.bpm, metrics.rmssd, mode]);

  // Timer de sesión clínica
  useEffect(() => {
    if (session) {
      startRef.current = Date.now();
      timerRef.current = setInterval(
        () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000
      );
    } else {
      clearInterval(timerRef.current);
      setElapsed(0); setRrList([]); setRmssd("--"); setLastRR("--");
    }
    return () => clearInterval(timerRef.current);
  }, [session]);

  const handleConnect    = () => mode === "bluetooth" ? btData.connectBLE() : btData.connectWS(wsUrl);
  const handleDisconnect = () => mode === "bluetooth" ? btData.disconnectBLE() : btData.disconnectWS();
  const isConnected      = metrics.connected;
  const showConnectBtn   = mode !== "offline";

  const stateKey = classifyBPM(metrics.bpm);
  const st       = STATE[stateKey];

  // Persistencia en Supabase
  async function startSession() {
    if (!user) return;
    const { data, error } = await supabase.from("sessions").insert({
      user_id: user.id, modo: mode,
      registro_mitbih: mode === "offline" ? csvPath : null,
    }).select().single();
    if (!error) setSession(data);
  }

  async function endSession() {
    if (!session) return;
    clearInterval(timerRef.current);
    const bpm = Number(metrics.bpm);
    
    const intervals = [];
    for (let i = 1; i < rrList.length; i++) intervals.push(rrList[i] - rrList[i-1]);
    let sdnn = null, finalRmssd = null;
    if (intervals.length >= 2) {
      const mean = intervals.reduce((a,b) => a+b,0) / intervals.length;
      sdnn = Math.round(Math.sqrt(intervals.reduce((a,b) => a+(b-mean)**2,0) / intervals.length));
      const diffs = [];
      for (let i = 1; i < intervals.length; i++) diffs.push((intervals[i]-intervals[i-1])**2);
      finalRmssd = Math.round(Math.sqrt(diffs.reduce((a,b)=>a+b,0)/diffs.length));
    } else if (rmssd !== "--") {
      finalRmssd = Number(rmssd);
    }

    const estado = { idle:"indefinido", normal:"normal", elevated:"elevado",
                     tachy:"taquicardia", brady:"bradicardia" }[stateKey] ?? "indefinido";
                     
    await supabase.from("sessions").update({ duracion_seg: elapsed }).eq("id", session.id);
    await supabase.from("ecg_measurements").insert({
      session_id: session.id,
      bpm_promedio: isNaN(bpm) ? null : bpm,
      sdnn, rmssd: finalRmssd, estado,
    });
    navigate("/dashboard");
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=DM+Sans:wght@300;400;500;600&display=swap');

        :root {
          --c-bg:      #0e0e10;
          --c-surface: #16161a;
          --c-panel:   #1c1c21;
          --c-border:  #2a2a32;
          --c-border2: #323238;
          --c-text:    #e8e8f0;
          --c-muted:   #707088;
          --c-faint:   #3a3a44;
          --c-accent:  #7c6dfa;
          --c-accent2: #a594fb;
          --c-ok:      #34d399;
          --c-warn:    #fbbf24;
          --c-danger:  #f87171;
          --c-info:    #60a5fa;
          --c-idle:    #6b7280;
          --font-mono: 'DM Mono', ui-monospace, monospace;
          --font-sans: 'DM Sans', system-ui, sans-serif;
          --r:         12px;
          --r-lg:      18px;
        }

        .mon-page * { box-sizing: border-box; margin: 0; padding: 0; }
        .mon-page { background: var(--c-bg); min-height: 100vh; color: var(--c-text); font-family: var(--font-sans); text-align: left; }

        .mon-page::before {
          content: '';
          position: fixed; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          background-size: 180px;
          pointer-events: none;
          z-index: 0;
        }

        .mon-page > * { position: relative; z-index: 1; }

        .mon-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 32px; height: 56px;
          background: color-mix(in srgb, var(--c-surface) 90%, transparent);
          border-bottom: 1px solid var(--c-border);
          backdrop-filter: blur(12px);
          position: sticky; top: 0; z-index: 20;
        }

        .mon-logo-mark {
          width: 30px; height: 30px; border-radius: 8px;
          background: linear-gradient(135deg, var(--c-accent), var(--c-accent2));
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-mono); font-size: 13px; color: #fff; font-weight: 500;
          box-shadow: 0 0 16px color-mix(in srgb, var(--c-accent) 40%, transparent);
        }

        .mon-logo-text { font-family: var(--font-sans); font-size: 15px; font-weight: 600; color: var(--c-text); letter-spacing: -0.02em; }
        .mon-logo-sub { font-size: 11px; color: var(--c-idle); font-family: var(--font-mono); letter-spacing: 0.04em; }

        .mon-mode-bar { display: flex; background: var(--c-panel); border: 1px solid var(--c-border); border-radius: 10px; padding: 3px; gap: 2px; }
        .mon-mode-btn {
          padding: 5px 14px; border-radius: 7px; border: none;
          font-family: var(--font-sans); font-size: 11px; font-weight: 500;
          cursor: pointer; transition: all 0.15s ease; white-space: nowrap;
        }
        .mon-mode-btn.active {
          background: var(--c-accent); color: #fff;
          box-shadow: 0 1px 8px color-mix(in srgb, var(--c-accent) 35%, transparent);
        }
        .mon-mode-btn:not(.active) { background: transparent; color: var(--c-idle); }
        .mon-mode-btn:not(.active):hover { color: var(--c-text); }
        .mon-mode-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .mon-btn {
          display: inline-flex; align-items: center; gap: 6px;
          border-radius: 9px; border: none; cursor: pointer;
          font-family: var(--font-sans); font-size: 12px; font-weight: 500;
          padding: 7px 14px; transition: all 0.15s;
        }
        .mon-btn-ghost { background: var(--c-panel); border: 1px solid var(--c-border2); color: var(--c-idle); }
        .mon-btn-ghost:hover { color: var(--c-text); border-color: var(--c-faint); }
        .mon-btn-connect {
          background: color-mix(in srgb, var(--c-accent) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--c-accent) 30%, transparent);
          color: var(--c-accent2);
        }
        .mon-btn-connect:hover { background: color-mix(in srgb, var(--c-accent) 20%, transparent); }

        .mon-content { max-width: 1020px; margin: 0 auto; padding: 32px 28px; display: flex; flex-direction: column; gap: 20px; }
        .mon-card { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--r-lg); padding: 24px; transition: border-color 0.2s; }

        .mon-top { display: grid; grid-template-columns: 230px 1fr; gap: 16px; align-items: start; }
        .mon-state-card { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; text-align: center; padding: 28px 20px; }
        .mon-state-glyph { font-size: 36px; line-height: 1; transition: color 0.3s; }
        .mon-state-label { font-family: var(--font-sans); font-size: 13px; font-weight: 600; letter-spacing: 0.01em; }
        .mon-state-desc { font-size: 11px; color: var(--c-idle); font-family: var(--font-sans); line-height: 1.5; }
        
        .mon-rec-badge {
          display: inline-flex; align-items: center; gap: 5px;
          background: color-mix(in srgb, var(--c-danger) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--c-danger) 25%, transparent);
          border-radius: 20px; padding: 4px 12px;
          font-family: var(--font-mono); font-size: 11px; color: var(--c-danger);
        }
        .mon-rec-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--c-danger); animation: blink 1s ease-in-out infinite; }
        @keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0.2 } }

        .mon-metrics { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
        .mon-metric-card { background: var(--c-panel); border: 1px solid var(--c-border); border-radius: var(--r); padding: 20px; display: flex; flex-direction: column; gap: 6px; transition: border-color 0.2s; }
        .mon-metric-card:hover { border-color: var(--c-border2); }

        .mon-metric-label { font-family: var(--font-sans); font-size: 10px; font-weight: 500; color: var(--c-idle); text-transform: uppercase; letter-spacing: 0.08em; }
        .mon-metric-value { font-family: var(--font-mono); font-size: 28px; font-weight: 400; line-height: 1; letter-spacing: -0.02em; color: var(--c-text); }
        .mon-metric-unit { font-family: var(--font-mono); font-size: 12px; font-weight: 300; color: var(--c-idle); margin-left: 4px; }
        .mon-metric-sub { font-family: var(--font-mono); font-size: 10px; color: var(--c-muted); margin-top: 2px; }

        .mon-chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .mon-chart-title { font-family: var(--font-sans); font-size: 13px; font-weight: 500; color: var(--c-text); }
        .mon-chart-sub { font-family: var(--font-mono); font-size: 10px; color: var(--c-idle); margin-top: 2px; }
        .mon-legend { display: flex; align-items: center; gap: 14px; }
        .mon-legend-item { display: flex; align-items: center; gap: 5px; font-family: var(--font-mono); font-size: 10px; color: var(--c-idle); }
        .mon-legend-dot { width: 8px; height: 2px; border-radius: 1px; }

        .mon-signal-dot { width: 7px; height: 7px; border-radius: 50%; transition: background 0.3s, box-shadow 0.3s; }
        .mon-signal-dot.live {
          background: var(--c-ok);
          box-shadow: 0 0 8px color-mix(in srgb, var(--c-ok) 60%, transparent);
          animation: pulse-dot 2s ease-in-out infinite;
        }
        .mon-signal-dot.off { background: var(--c-idle); }
        @keyframes pulse-dot {
          0%,100% { box-shadow: 0 0 6px color-mix(in srgb, var(--c-ok) 50%, transparent); }
          50% { box-shadow: 0 0 14px color-mix(in srgb, var(--c-ok) 80%, transparent); }
        }

        .mon-bottom { display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: center; }
        .mon-btn-start {
          background: linear-gradient(135deg, var(--c-accent), var(--c-accent2));
          color: #fff; border: none; border-radius: var(--r);
          padding: 13px 26px; font-family: var(--font-sans); font-size: 13px;
          font-weight: 600; cursor: pointer; white-space: nowrap;
          display: flex; align-items: center; gap: 7px;
          box-shadow: 0 4px 20px color-mix(in srgb, var(--c-accent) 30%, transparent);
          transition: opacity 0.15s, transform 0.1s;
        }
        .mon-btn-start:hover { opacity: 0.9; transform: translateY(-1px); }
        .mon-btn-stop {
          background: color-mix(in srgb, var(--c-danger) 12%, transparent);
          color: var(--c-danger);
          border: 1px solid color-mix(in srgb, var(--c-danger) 25%, transparent);
          border-radius: var(--r); padding: 13px 26px;
          font-family: var(--font-sans); font-size: 13px; font-weight: 600;
          cursor: pointer; white-space: nowrap;
          display: flex; align-items: center; gap: 7px;
          transition: background 0.15s;
        }
        .mon-btn-stop:hover { background: color-mix(in srgb, var(--c-danger) 18%, transparent); }

        .mon-info-bar { display: flex; align-items: center; gap: 12px; background: var(--c-panel); border: 1px solid var(--c-border); border-radius: var(--r); padding: 14px 18px; }
        .mon-info-icon { font-size: 16px; color: var(--c-accent2); flex-shrink: 0; }
        .mon-info-text { font-family: var(--font-sans); font-size: 11px; color: var(--c-idle); line-height: 1.5; }

        .mon-csv-row { display: flex; align-items: center; gap: 12px; }
        .mon-csv-label { font-family: var(--font-mono); font-size: 11px; color: var(--c-idle); white-space: nowrap; }
        .mon-select { flex: 1; background: var(--c-panel); border: 1px solid var(--c-border2); border-radius: 9px; padding: 8px 12px; color: var(--c-text); font-family: var(--font-sans); font-size: 12px; outline: none; transition: border-color 0.15s; cursor: pointer; }
        .mon-select:focus { border-color: var(--c-accent); }

        .mon-footer { font-family: var(--font-mono); font-size: 10px; color: var(--c-faint); text-align: center; padding-bottom: 8px; letter-spacing: 0.04em; }
        .mon-ws-input { background: var(--c-panel); border: 1px solid var(--c-border2); border-radius: 8px; padding: 6px 11px; color: var(--c-text); font-family: var(--font-mono); font-size: 11px; outline: none; width: 210px; }
        .mon-ws-input:focus { border-color: var(--c-accent); }

        .mon-indicator-panel { display: flex; align-items: center; gap: 8px; }
        .mon-indicator-badge {
          background: var(--c-panel); border: 1px solid var(--c-border2);
          border-radius: 6px; padding: 4px 10px; display: flex; align-items: center; gap: 6px;
        }
        .mon-badge-label { font-family: var(--font-sans); font-size: 10px; font-weight: 500; color: var(--c-idle); text-transform: uppercase; letter-spacing: 0.04em; }
        .mon-badge-value { font-family: var(--font-mono); font-size: 11px; font-weight: 500; color: var(--c-text); }
        .mon-badge-value.accent { color: var(--c-accent2); }
      `}</style>

      <div className="mon-page">
        {/* ── Nav ──────────────────────────────────────────── */}
        <nav className="mon-nav">
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div className="mon-logo-mark">C</div>
            <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
              <span className="mon-logo-text">CardioSense</span>
              <span className="mon-logo-sub">Monitor · v2</span>
            </div>
          </div>

          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <div className="mon-mode-bar">
              {[
                { id:"offline",   label:"CSV" },
                { id:"bluetooth", label:"BLE" },
                { id:"websocket", label:"WebSocket" },
              ].map(({ id, label }) => (
                <button key={id} disabled={!!session}
                  className={`mon-mode-btn ${mode === id ? "active" : ""}`}
                  onClick={() => setMode(id)}>
                  {label}
                </button>
              ))}
            </div>

            {mode === "websocket" && !session && (
              <input className="mon-ws-input" value={wsUrl}
                onChange={e => setWsUrl(e.target.value)}
                placeholder="ws://localhost:8000/ws" />
            )}

            {showConnectBtn && !session && (
              <button className="mon-btn mon-btn-connect"
                onClick={isConnected ? handleDisconnect : handleConnect}>
                <i className={`ti ${isConnected ? "ti-bluetooth-off" : mode === "websocket" ? "ti-wifi" : "ti-bluetooth"}`}
                  style={{ fontSize:13 }} />
                {isConnected ? "Desconectar" : mode === "websocket" ? "Conectar" : "Vincular ESP32"}
              </button>
            )}

            <button className="mon-btn mon-btn-ghost" onClick={() => navigate("/dashboard")}>
              <i className="ti ti-arrow-left" style={{ fontSize:13 }} />
              Dashboard
            </button>
          </div>
        </nav>

        {/* ── Contenido ────────────────────────────────────── */}
        <div className="mon-content">

          {/* ── Fila superior ─────────────────────────────── */}
          <div className="mon-top">

            {/* Estado Diagnóstico */}
            <div className="mon-card mon-state-card"
              style={{ borderColor: `color-mix(in srgb, ${st.accent} 30%, var(--c-border))` }}>
              <div className="mon-state-glyph" style={{ color: st.accent }}>
                {st.glyph}
              </div>
              <div>
                <div className="mon-state-label" style={{ color: st.accent }}>{st.label}</div>
                <div className="mon-state-desc" style={{ marginTop:4 }}>
                  {stateKey === "idle" ? "Esperando datos..." :
                   stateKey === "normal" ? "Ritmo sinusal stable" :
                   stateKey === "elevated" ? "FC por encima del umbral" :
                   stateKey === "tachy" ? "Frecuencia muy elevada" :
                   "Frecuencia muy baja"}
                </div>
              </div>
              {session && (
                <div className="mon-rec-badge">
                  <span className="mon-rec-dot" />
                  REC · {fmtSec(elapsed)}
                </div>
              )}
            </div>

            {/* Panel de Métricas (3 Columnas Limpias) */}
            <div className="mon-metrics">

              {/* 1. Frecuencia Cardíaca */}
              <div className="mon-metric-card"
                style={{ borderColor: stateKey !== "idle"
                  ? `color-mix(in srgb, ${st.accent} 25%, var(--c-border))` : undefined }}>
                <div className="mon-metric-label">Frecuencia cardíaca</div>
                <div>
                  <span className="mon-metric-value" style={{ color: st.accent }}>
                    {metrics.bpm === "--" ? "—" : Math.round(Number(metrics.bpm))}
                  </span>
                  <span className="mon-metric-unit">bpm</span>
                </div>
                <div className="mon-metric-sub">{st.label}</div>
              </div>

              {/* 2. Intervalo R-R Instantáneo */}
              <div className="mon-metric-card">
                <div className="mon-metric-label">Intervalo R-R</div>
                <div>
                  <span className="mon-metric-value">{lastRR}</span>
                  <span className="mon-metric-unit">ms</span>
                </div>
                <div className="mon-metric-sub">
                  {lastRR !== "--" ? `≈ ${(lastRR/1000).toFixed(2)} s` : "sin señal"}
                </div>
              </div>

              {/* 3. Contador de Latidos / Complejos QRS */}
              <div className="mon-metric-card">
                <div className="mon-metric-label">Total de Latidos</div>
                <div>
                  <span className="mon-metric-value" style={{ color: "var(--c-accent2)" }}>
                    {typeof getRPeaks === "function" ? getRPeaks().length : "0"}
                  </span>
                  <span className="mon-metric-unit">qrs</span>
                </div>
                <div className="mon-metric-sub">
                  {metrics.bpm !== "--" ? "detección activa de picos" : "esperando complejos..."}
                </div>
              </div>

            </div>
          </div>

          {/* ── Gráfica ECG ───────────────────────────────── */}
          <div className="mon-card">
            <div className="mon-chart-header">
              <div>
                <div className="mon-chart-title">Canal de Instrumentación ECG</div>
                <div className="mon-chart-sub">
                  {`${FS} Hz · Muestreo y Filtrado Asíncrono Continuo`}
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                <div className="mon-legend">
                  <div className="mon-legend-item">
                    <div className="mon-legend-dot"
                      style={{ background:"rgba(124,109,250,0.35)" }} />
                    señal cruda (adc)
                  </div>
                  <div className="mon-legend-item">
                    <div className="mon-legend-dot" style={{ background:"var(--c-accent2)" }} />
                    filtrada (dsp)
                  </div>
                  <div className="mon-legend-item">
                    <div className="mon-legend-dot"
                      style={{ background:"var(--c-danger)", borderRadius:"50%", width:7, height:7 }} />
                    R-peak
                  </div>
                </div>
                <div className={`mon-signal-dot ${(isConnected || mode==="offline") ? "live" : "off"}`} />
              </div>
            </div>

            {/* Trazo en modo dual */}
            <div style={{ width:"100%", height: 340, background: "var(--c-bg)", borderRadius: 10, overflow: "hidden" }}>
              <LiveChart
                getBuffer={getBuffer}
                getRPeaks={getRPeaks}
                dualChannel={true}
                signalType="filtered"
                fs={FS}
                theme="app"
              />
            </div>


            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:12 }}>
              <div className="mon-indicator-panel">
                <div className="mon-indicator-badge">
                  <span className="mon-badge-label">Ventana:</span>
                  <span className="mon-badge-value">{(VISIBLE_SAMPLES / FS).toFixed(1)} s</span>
                </div>
                
                {typeof metrics.sampleCount === "number" && (
                  <>
                    <div className="mon-indicator-badge" style={{ borderColor: "color-mix(in srgb, var(--c-accent) 25%, var(--c-border2))" }}>
                      <span className="mon-badge-label" style={{ color: "var(--c-accent2)" }}>Tiempo Muestras:</span>
                      <span className="mon-badge-value accent">{samplesTo(metrics.sampleCount)}</span>
                    </div>
                    <div className="mon-indicator-badge">
                      <span className="mon-badge-label">Total N:</span>
                      <span className="mon-badge-value">{metrics.sampleCount.toLocaleString()}</span>
                    </div>
                  </>
                )}
              </div>

              <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)", letterSpacing:"0.02em" }}>
                {mode === "offline" ? "PhysioNet · MIT-BIH Database"
                  : `Hardware Embebido · ${metrics.min ?? 0}–${metrics.max ?? 0} ADC`}
              </span>
            </div>
          </div>

          {/* ── Barra inferior ────────────────────────────── */}
          <div className="mon-bottom">
            <div className="mon-info-bar">
              <i className="ti ti-info-circle mon-info-icon" />
              <p className="mon-info-text">
                {session
                  ? `Sesión activa · ${fmtSec(elapsed)} transcurridos · los datos se guardarán al terminar.`
                  : mode === "offline"
                  ? "Modo de validación con registros MIT-BIH. Inicia una sesión para guardar las métricas."
                  : "Conecta el ESP32 e inicia una sesión para registrar los datos en tu historial."}
              </p>
            </div>
            {!session
              ? <button className="mon-btn-start" onClick={startSession}>
                  <i className="ti ti-player-play" style={{ fontSize:14 }} />
                  Iniciar sesión
                </button>
              : <button className="mon-btn-stop" onClick={endSession}>
                  <i className="ti ti-player-stop" style={{ fontSize:14 }} />
                  Terminar
                </button>}
          </div>

          {/* ── Selector CSV ──────────────────────────────── */}
          {mode === "offline" && !session && (
            <div className="mon-csv-row">
              <span className="mon-csv-label">Registro MIT-BIH</span>
              <select className="mon-select" value={csvPath}
                onChange={e => setCsvPath(e.target.value)}>
                {RECORDS.map(r => (
                  <option key={r.path} value={r.path}>{r.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="mon-footer">
            {mode === "offline"
              ? "physionet.org · MIT-BIH Arrhythmia Database · datos de dominio público"
              : mode === "bluetooth"
              ? "Web Bluetooth API · Chrome / Edge · requiere gesto del usuario"
              : `WebSocket · ${wsUrl}`}
          </div>
        </div>
      </div>
    </>
  );
}