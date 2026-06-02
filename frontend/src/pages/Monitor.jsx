import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate }    from "react-router-dom";
import { useAuth }        from "../context/AuthContext";
import { supabase }       from "../lib/supabase";
import { useOfflineECG }  from "../hooks/useOfflineECG";
import { useBluetooth }   from "../hooks/useBluetooth";
import LiveChart          from "../components/LiveChart";

// Constantes 
const FS              = 300;
const VISIBLE_SAMPLES = 1500;

const RECORDS = [
  { label: "100 — Ritmo sinusal normal",         path: "/100.csv" },
  { label: "106 — Contracciones ventriculares",  path: "/106.csv" },
  { label: "119 — Bigeminismo",                  path: "/119.csv" },
  { label: "208 — Arritmia mixta",               path: "/208.csv" },
];

// Clasificación 
function classifyBPM(bpm) {
  const b = Number(bpm);

  if (b === 0) return "death";
  if (!bpm || isNaN(b)) return "idle";
  if (b < 60)  return "brady";
  if (b > 140) return "tachy";
  if (b > 100) return "elevated";
  return "normal";
}

const STATE = {
  death:    { label: "Sin pulso",   accent: "var(--c-danger)", icon: "ti-heart-off",       desc: "Paro cardíaco detectado" },
  idle:     { label: "Sin señal",   accent: "var(--c-idle)",   icon: "ti-database-off",    desc: "Esperando flujo de datos..." },
  normal:   { label: "Normal",      accent: "var(--c-ok)",     icon: "ti-activity",        desc: "Ritmo sinusal estable" },
  elevated: { label: "Elevado",     accent: "var(--c-warn)",   icon: "ti-trending-up",     desc: "FC sobre el promedio" },
  tachy:    { label: "Taquicardia", accent: "var(--c-danger)", icon: "ti-alert-triangle",  desc: "Frecuencia crítica alta" },
  brady:    { label: "Bradicardia", accent: "var(--c-info)",   icon: "ti-trending-down",   desc: "Frecuencia crítica baja" },
};

// Helpers
const fmtSec = s =>
  `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;

const samplesTo = (n, fs = FS) => {
  const s = Math.floor(n / fs);
  return `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
};

// Componente principal
export default function Monitor() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [mode,    setMode]    = useState("offline");
  const [csvPath, setCsvPath] = useState("/100.csv");
  const [session, setSession] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [rrList,  setRrList]  = useState([]);     
  const [wsUrl,   setWsUrl]   = useState(`ws://${window.location.hostname}:8000/ws`);

  const timerRef = useRef(null);
  const startRef = useRef(null);
  const initialRPeaksRef = useRef(0);

  const offlineData = useOfflineECG(csvPath, mode === "offline");
  const btData      = useBluetooth();
  const activeData  = mode === "offline" ? offlineData : btData;
  const { metrics, getBuffer, getRPeaks } = activeData;

  // ── Estados Derivados ──
  const bpmValid = Number(metrics.bpm);
  const lastRR = (!isNaN(bpmValid) && bpmValid > 0) ? Math.round((60 / bpmValid) * 1000) : "--";

  // Total beats
  const rpeaksCount = getRPeaks().length;
  const displayBeats = mode === "offline" 
    ? Math.max(0, rpeaksCount - initialRPeaksRef.current)
    : metrics.total_beats || 0;

  // Actualización del histórico de intervalos R-R
  useEffect(() => {
    if (lastRR !== "--") {
      setRrList(prev => {
        if (prev.length > 0 && prev[prev.length - 1] === lastRR) return prev;
        return [...prev.slice(-29), lastRR]; 
      });
    }
  }, [lastRR]);

  // Timer de sesión clínica
  useEffect(() => {
    if (session) {
      startRef.current = Date.now();
      timerRef.current = setInterval(
        () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000
      );
    } else {
      clearInterval(timerRef.current);
      setElapsed(0); setRrList([]);
    }
    return () => clearInterval(timerRef.current);
  }, [session]);

  const isConnected      = Boolean(metrics.connected);
  const showConnectBtn   = mode !== "offline";

  const handleConnect    = useCallback(() => {
    if (!isConnected) {
      btData.resetSessionBeats();
    }
    btData.connectWS(wsUrl);
  }, [btData, wsUrl, isConnected]);
  const handleDisconnect = useCallback(() => btData.disconnectWS(), [btData]);

  const stateKey = classifyBPM(metrics.bpm);
  const st       = STATE[stateKey];
  
  const canStartSession = mode === "offline" || isConnected;

  // Persistencia en Supabase
  const startSession = useCallback(async () => {
    if (!user || !canStartSession) return;
    
    if (mode === "offline") {
      initialRPeaksRef.current = getRPeaks().length;
    }
    
    const { data, error } = await supabase.from("sessions").insert({
      user_id: user.id, 
      modo: mode,
      registro_mitbih: mode === "offline" ? csvPath : null,
    }).select().single();
    if (!error) setSession(data);
  }, [user, canStartSession, mode, csvPath, getRPeaks]);

  const endSession = useCallback(async () => {
    if (!session) return;
    clearInterval(timerRef.current);
    const bpm = Number(metrics.bpm);

    const estado = { 
      death:"muerte",
      idle:"indefinido", 
      normal:"normal", 
      elevated:"elevado",
      tachy:"taquicardia", 
      brady:"bradicardia" 
    }[stateKey] ?? "indefinido";
                     
    await supabase.from("sessions").update({ duracion_seg: elapsed }).eq("id", session.id);
    await supabase.from("ecg_measurements").insert({
      session_id: session.id,
      bpm_promedio: isNaN(bpm) || bpm === 0 ? null : bpm,
      estado,
      total_beats: displayBeats,
    });
    navigate("/dashboard");
  }, [session, elapsed, metrics.bpm, stateKey, displayBeats, navigate]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=DM+Sans:wght@300;400;500;600&display=swap');

        :root {
          --c-bg:      #0a1628;
          --c-surface: #0f1f35;
          --c-panel:   #132d4a;
          --c-border:  #1a3a52;
          --c-border2: #1f4661;
          --c-text:    #e0f2ff;
          --c-muted:   #7fa3c0;
          --c-faint:   #3a4d5c;
          --c-accent:  #00d4ff;
          --c-accent2: #00e5ff;
          --c-ok:      #00d974;
          --c-warn:    #ffa500;
          --c-danger:  #ff5a5a;
          --c-info:    #0099ff;
          --c-death:   #8b0000;
          --c-idle:    #5a7a99;
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
          font-family: var(--font-mono); font-size: 13px; color: var(--c-bg); font-weight: 600;
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
          background: var(--c-accent); color: var(--c-bg);
          font-weight: 600;
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

        /* Ajustado de 'start' a 'stretch' para que la primera tarjeta iguale el alto de las métricas */
        .mon-top { display: grid; grid-template-columns: 230px 1fr; gap: 16px; align-items: stretch; }
        
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
        .mon-metric-card { background: var(--c-panel); border: 1px solid var(--c-border); border-radius: var(--r); padding: 20px; display: flex; flex-direction: column; justify-content: space-between; gap: 6px; transition: border-color 0.2s; }
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
          color: var(--c-bg); border: none; border-radius: var(--r);
          padding: 13px 26px; font-family: var(--font-sans); font-size: 13px;
          font-weight: 600; cursor: pointer; white-space: nowrap;
          display: inline-flex; align-items: center; gap: 7px;
          box-shadow: 0 4px 20px color-mix(in srgb, var(--c-accent) 30%, transparent);
          transition: opacity 0.15s, transform 0.1s;
        }
        .mon-btn-start:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .mon-btn-start:disabled {
          background: var(--c-panel);
          color: var(--c-muted);
          border: 1px solid var(--c-border);
          box-shadow: none;
          cursor: not-allowed;
          opacity: 0.6;
        }
        .mon-btn-stop {
          background: color-mix(in srgb, var(--c-danger) 12%, transparent);
          color: var(--c-danger);
          border: 1px solid color-mix(in srgb, var(--c-danger) 25%, transparent);
          border-radius: var(--r); padding: 13px 26px;
          font-family: var(--font-sans); font-size: 13px; font-weight: 600;
          cursor: pointer; white-space: nowrap;
          display: inline-flex; align-items: center; gap: 7px;
          transition: background 0.15s;
        }
        .mon-btn-stop:hover { background: color-mix(in srgb, var(--c-danger) 18%, transparent); }

        .mon-info-bar { display: flex; align-items: center; gap: 12px; background: var(--c-panel); border: 1px solid var(--c-border); border-radius: var(--r); padding: 14px 18px; width: 100%; }
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
                <i className={`ti ${isConnected ? "ti-wifi-off" : "ti-wifi"}`}
                  style={{ fontSize:13 }} />
                {isConnected ? "Desconectar" : "Conectar"}
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
            <div className="mon-card"
              style={{ 
                borderColor: `color-mix(in srgb, ${st.accent} 25%, var(--c-border))`,
                boxShadow: `0 0 15px color-mix(in srgb, ${st.accent} 5%, transparent)`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                height: "100%"
              }}>
              
              {/* 1. Título Superior */}
              <span style={{ 
                fontFamily: "var(--font-mono)", 
                fontSize: "10px", 
                color: "var(--c-idle)", 
                letterSpacing: "0.06em",
                textTransform: "uppercase"
              }}>
                Sistema Diagnóstico
              </span>

              {/* 2. Bloque Central: Icono + Label */}
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "12px", 
                margin: "12px 0" 
              }}>
                {/* Microindicador LED */}
                <div style={{ 
                  color: st.accent,
                  background: `color-mix(in srgb, ${st.accent} 12%, transparent)`,
                  width: "42px",
                  height: "42px",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `1px solid color-mix(in srgb, ${st.accent} 30%, transparent)`
                }}>
                  <i className={`ti ${st.icon}`} style={{ fontSize: "22px" }} />
                </div>

                {/* Texto de Estado Principal */}
                <span style={{ 
                  color: st.accent, 
                  fontSize: "24px", 
                  fontWeight: "600",
                  letterSpacing: "-0.02em"
                }}>
                  {st.label}
                </span>
              </div>

              {/* 3. Descripción Inferior */}
              <span style={{ 
                fontSize: "13px", 
                color: "var(--c-muted)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}>
                {st.desc}
              </span>
            </div>

            {/* Panel de Métricas */}
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
                    {displayBeats}
                  </span>
                  <span className="mon-metric-unit">qrs</span>
                </div>
                <div className="mon-metric-sub">
                  {metrics.bpm !== "--" && bpmValid > 0 ? "detección activa de picos" : "esperando complejos..."}
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
                  : isConnected
                  ? "WebSocket conectado. Presiona 'Iniciar Sesión' para comenzar a almacenar el historial."
                  : "Por favor, establece conexión con el WebSocket antes de iniciar sesión."}
              </p>
            </div>
            {!session
              ? <button className="mon-btn-start" onClick={startSession} disabled={!canStartSession}>
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
              : `WebSocket · ${wsUrl}`}
          </div>
        </div>
      </div>
    </>
  );
}