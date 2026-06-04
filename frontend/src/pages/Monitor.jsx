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
  death:    { label: "Sin pulso",   accent: "var(--c-danger)", icon: "ti-alert-circle",     desc: "Paro cardíaco detectado" },
  idle:     { label: "Sin señal",   accent: "var(--c-idle)",   icon: "ti-wifi-off",         desc: "Esperando flujo de datos..." },
  normal:   { label: "Normal",      accent: "var(--c-ok)",     icon: "ti-activity",         desc: "Ritmo sinusal estable" },
  elevated: { label: "Elevado",     accent: "var(--c-warn)",   icon: "ti-trending-up",      desc: "FC sobre el promedio" },
  tachy:    { label: "Taquicardia", accent: "var(--c-danger)", icon: "ti-alert-octagon",    desc: "Frecuencia crítica alta" },
  brady:    { label: "Bradicardia", accent: "var(--c-info)",   icon: "ti-trending-down",    desc: "Frecuencia crítica baja" },
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

  const [mode,         setMode]         = useState("offline");
  const [csvPath,      setCsvPath]      = useState("/100.csv");
  const [session,      setSession]      = useState(null);
  const [elapsed,      setElapsed]      = useState(0);
  const [initialRPeaks, setInitialRPeaks] = useState(0);
  const [wsUrl,        setWsUrl]        = useState(`ws://${window.location.hostname}:8000/ws`);

  const timerRef = useRef(null);
  const startRef = useRef(null);

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
    ? Math.max(0, rpeaksCount - initialRPeaks)
    : metrics.total_beats || 0;

  // Timer de sesión clínica
  useEffect(() => {
    if (session) {
      startRef.current = Date.now();
      timerRef.current = setInterval(
        () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000
      );
    } else {
      clearInterval(timerRef.current);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsed(0);
    }
    return () => clearInterval(timerRef.current);
  }, [session]);

  const isConnected      = Boolean(metrics.connected);
  const showConnectBtn   = mode !== "offline";

  const handleConnect = useCallback(() => {
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
    if (!user || !canStartSession) {
      console.warn("DEBUG: No se pudo iniciar sesión. User:", user, "CanStart:", canStartSession);
      return;
    }
    
    if (mode === "offline") {
      setInitialRPeaks(getRPeaks().length);
    }
    
    const { data, error } = await supabase.from("sessions").insert({
      user_id: user.id, 
      modo: mode,
      registro_mitbih: mode === "offline" ? csvPath : null,
    }).select().single();

    if (error) {
      console.error("ERROR AL CREAR SESIÓN EN SUPABASE:", error.message, error.details);
    } else {
      console.log("Sesión creada con éxito ID:", data.id);
      setSession(data);
    }
  }, [user, canStartSession, mode, csvPath, getRPeaks]);

  const endSession = useCallback(async () => {
    if (!session) {
      console.error("ERROR: Intentaste terminar sesión pero 'session' está vacío. Nada se guardará.");
      return;
    }
    
    clearInterval(timerRef.current);
    const bpm = Number(metrics.bpm);

    const estado = { 
      death: "muerte",
      idle: "indefinido", 
      normal: "normal", 
      elevated: "elevado",
      tachy: "taquicardia", 
      brady: "bradicardia" 
    }[stateKey] ?? "indefinido";
                    
    // 1. Actualizar Sesión
    const { error: errorSession } = await supabase
      .from("sessions")
      .update({ duracion_seg: elapsed })
      .eq("id", session.id);

    if (errorSession) {
      console.error("ERROR AL ACTUALIZAR DURACIÓN DE SESIÓN:", errorSession.message);
    }

    // 2. Insertar Medición
    const { error: errorMeasurement } = await supabase
      .from("ecg_measurements")
      .insert({
        session_id: session.id,
        bpm_promedio: isNaN(bpm) || bpm === 0 ? null : bpm,
        estado,
        total_beats: displayBeats, 
      });

    if (errorMeasurement) {
      console.error("ERROR AL INSERTAR MEDICIÓN:", errorMeasurement.message, errorMeasurement.details);
    } else {
      console.log("Medición guardada con éxito.");
    }

    navigate("/dashboard");
  }, [session, elapsed, metrics.bpm, stateKey, displayBeats, navigate]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=DM+Sans:wght@300;400;500;600&display=swap');

        :root {
          /* Paleta Clara - Azul Celeste Amigable (Belize Hole mejorado) */
          --c-bg:      #F0F6FB;
          --c-surface: #FFFFFF;
          --c-panel:   #EBF3FA;
          --c-border:  #C5DDF1;
          --c-border2: #9ECCE8;
          --c-text:    #0F3D5C;
          --c-muted:   #4A7FA7;
          --c-faint:   #7FA8C9;
          --c-accent:  #2471A3;
          --c-accent2: #1F618D;
          --c-ok:      #229B46;
          --c-warn:    #E67E22;
          --c-danger:  #E74C3C;
          --c-info:    #2E86C1;
          --c-death:   #C0392B;
          --c-idle:    #7F8C8D;
          --font-mono: 'DM Mono', ui-monospace, monospace;
          --font-sans: 'DM Sans', system-ui, sans-serif;
          --r:         10px;
          --r-lg:      14px;
        }

        .mon-page * { box-sizing: border-box; margin: 0; padding: 0; }
        .mon-page { background: var(--c-bg); min-height: 100vh; color: var(--c-text); font-family: var(--font-sans); text-align: left; }

        .mon-page::before {
          content: '';
          position: fixed; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.02'/%3E%3C/svg%3E");
          background-size: 180px;
          pointer-events: none;
          z-index: 0;
        }

        .mon-page > * { position: relative; z-index: 1; }

        .mon-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 32px; height: 56px;
          background: color-mix(in srgb, var(--c-surface) 85%, transparent);
          border-bottom: 1px solid var(--c-border);
          backdrop-filter: blur(8px);
          position: sticky; top: 0; z-index: 20;
          box-shadow: 0 2px 8px color-mix(in srgb, var(--c-accent) 8%, transparent);
        }

        .mon-logo-mark {
          width: 36px; height: 36px; border-radius: 8px;
          background: linear-gradient(135deg, var(--c-accent), var(--c-info));
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 12px color-mix(in srgb, var(--c-accent) 35%, transparent);
        }

        .mon-logo-text { font-family: var(--font-sans); font-size: 16px; font-weight: 600; color: var(--c-text); letter-spacing: -0.02em; }
        .mon-logo-sub { font-size: 11px; color: var(--c-muted); font-family: var(--font-mono); letter-spacing: 0.04em; }

        .mon-mode-bar { display: flex; background: var(--c-surface); border: 1px solid var(--c-border2); border-radius: 8px; padding: 4px; gap: 3px; }
        .mon-mode-btn {
          padding: 6px 15px; border-radius: 6px; border: none;
          font-family: var(--font-sans); font-size: 12px; font-weight: 500;
          cursor: pointer; transition: all 0.2s ease; white-space: nowrap;
        }
        .mon-mode-btn.active {
          background: linear-gradient(135deg, var(--c-accent), var(--c-info));
          color: white;
          font-weight: 600;
          box-shadow: 0 3px 12px color-mix(in srgb, var(--c-accent) 50%, transparent);
        }
        .mon-mode-btn:not(.active) { background: transparent; color: var(--c-text); opacity: 0.7; }
        .mon-mode-btn:not(.active):hover { color: var(--c-accent); opacity: 1; }
        .mon-mode-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .mon-btn {
          display: inline-flex; align-items: center; gap: 6px;
          border-radius: 8px; border: none; cursor: pointer;
          font-family: var(--font-sans); font-size: 12px; font-weight: 500;
          padding: 8px 16px; transition: all 0.2s;
        }
        .mon-btn-ghost { background: var(--c-panel); border: 1px solid var(--c-border2); color: var(--c-muted); }
        .mon-btn-ghost:hover { color: var(--c-accent); border-color: var(--c-accent); }
        .mon-btn-connect {
          background: color-mix(in srgb, var(--c-accent) 15%, transparent);
          border: 1px solid var(--c-border2);
          color: var(--c-accent);
        }
        .mon-btn-connect:hover { background: color-mix(in srgb, var(--c-accent) 25%, transparent); border-color: var(--c-accent); }

        /* NUEVO CONFIGURACIÓN DE ESPACIO DE TRABAJO (GRID DE 2 COLUMNAS) */
        .mon-workspace-layout { 
          max-width: 1440px; 
          margin: 0 auto; 
          padding: 32px 28px; 
          display: grid; 
          grid-template-columns: 1fr 340px; 
          gap: 20px; 
          align-items: start;
        }

        /* Columna principal izquierda */
        .mon-main-column {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* Columna lateral derecha para la imagen del pulso */
        .mon-side-column {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          height: 100%;
          min-height: 520px; /* Consistencia visual con el alto de las gráficas */
          background: var(--c-surface);
        }

        .mon-pulse-zone {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 20px;
        }

        /* Simulación de animación de latido para probar el feedback visual */
        .mock-heart.beating {
          animation: pulse-animation 0.5s infinite alternate ease-in-out;
        }
        @keyframes pulse-animation {
          0% { transform: scale(1); opacity: 0.85; }
          100% { transform: scale(1.2); opacity: 1; filter: drop-shadow(0 0 12px var(--c-danger)); }
        }

        .mon-side-footer {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--c-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          text-align: center;
          border-top: 1px solid var(--c-border);
          padding-top: 16px;
          margin-top: auto;
        }

        @media (max-width: 1100px) {
          .mon-workspace-layout {
            grid-template-columns: 1fr; /* Se apila en una sola columna en pantallas medianas */
          }
          .mon-side-column {
            min-height: 300px;
          }
        }

        .mon-card { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--r-lg); padding: 24px; transition: all 0.2s; box-shadow: 0 1px 4px color-mix(in srgb, var(--c-accent) 5%, transparent); }
        .mon-card:hover { border-color: var(--c-border2); box-shadow: 0 2px 8px color-mix(in srgb, var(--c-accent) 10%, transparent); }

        .mon-top { display: grid; grid-template-columns: 230px 1fr; gap: 16px; align-items: stretch; }
        
        .mon-rec-badge {
          display: inline-flex; align-items: center; gap: 5px;
          background: color-mix(in srgb, var(--c-danger) 15%, transparent);
          border: 1px solid var(--c-danger);
          border-radius: 20px; padding: 5px 12px;
          font-family: var(--font-mono); font-size: 11px; color: var(--c-danger);
        }
        .mon-rec-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c-danger); animation: blink 1s ease-in-out infinite; }
        @keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0.4 } }

        .mon-metrics { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
        .mon-metric-card { background: var(--c-panel); border: 1px solid var(--c-border); border-radius: var(--r); padding: 20px; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; transition: all 0.2s; }
        .mon-metric-card:hover { border-color: var(--c-border2); box-shadow: 0 2px 6px color-mix(in srgb, var(--c-accent) 8%, transparent); }

        .mon-metric-label { font-family: var(--font-sans); font-size: 11px; font-weight: 600; color: var(--c-accent); text-transform: uppercase; letter-spacing: 0.08em; }
        .mon-metric-value { font-family: var(--font-mono); font-size: 28px; font-weight: 700; line-height: 1; letter-spacing: -0.02em; color: var(--c-accent2); }
        .mon-metric-unit { font-family: var(--font-mono); font-size: 12px; font-weight: 500; color: var(--c-accent); margin-left: 6px; }
        .mon-metric-sub { font-family: var(--font-sans); font-size: 11px; color: var(--c-muted); margin-top: 2px; font-weight: 500; }

        .mon-chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .mon-chart-title { font-family: var(--font-sans); font-size: 14px; font-weight: 600; color: var(--c-text); }
        .mon-chart-sub { font-family: var(--font-mono); font-size: 11px; color: var(--c-muted); margin-top: 4px; }
        .mon-legend { display: flex; align-items: center; gap: 16px; }
        .mon-legend-item { display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 11px; color: var(--c-muted); }
        .mon-legend-dot { width: 8px; height: 2px; border-radius: 1px; }

        .mon-signal-dot { width: 8px; height: 8px; border-radius: 50%; transition: background 0.3s, box-shadow 0.3s; }
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
          background: linear-gradient(135deg, var(--c-accent), var(--c-info));
          color: white; border: none; border-radius: var(--r);
          padding: 12px 28px; font-family: var(--font-sans); font-size: 13px;
          font-weight: 700; cursor: pointer; white-space: nowrap;
          display: inline-flex; align-items: center; gap: 8px;
          box-shadow: 0 4px 16px color-mix(in srgb, var(--c-accent) 45%, transparent);
          transition: all 0.2s;
        }
        .mon-btn-start:hover:not(:disabled) { opacity: 0.95; transform: translateY(-2px); box-shadow: 0 6px 22px color-mix(in srgb, var(--c-accent) 55%, transparent); }
        .mon-btn-start:disabled {
          background: var(--c-panel);
          color: var(--c-muted);
          border: 1px solid var(--c-border);
          box-shadow: none;
          cursor: not-allowed;
          opacity: 0.5;
        }
        .mon-btn-stop {
          background: color-mix(in srgb, var(--c-danger) 20%, transparent);
          color: var(--c-danger);
          border: 1.5px solid var(--c-danger);
          border-radius: var(--r); padding: 12px 28px;
          font-family: var(--font-sans); font-size: 13px; font-weight: 700;
          cursor: pointer; white-space: nowrap;
          display: inline-flex; align-items: center; gap: 8px;
          transition: all 0.2s;
        }
        .mon-btn-stop:hover { background: color-mix(in srgb, var(--c-danger) 30%, transparent); box-shadow: 0 2px 8px color-mix(in srgb, var(--c-danger) 30%, transparent); }

        .mon-info-bar { display: flex; align-items: center; gap: 12px; background: var(--c-panel); border: 1.5px solid var(--c-border); border-radius: var(--r); padding: 14px 18px; width: 100%; box-shadow: 0 1px 4px color-mix(in srgb, var(--c-accent) 8%, transparent); }
        .mon-info-icon { font-size: 18px; color: var(--c-accent); flex-shrink: 0; }
        .mon-info-text { font-family: var(--font-sans); font-size: 12px; color: var(--c-text); line-height: 1.6; font-weight: 500; }

        .mon-csv-row { display: flex; align-items: center; gap: 12px; }
        .mon-csv-label { font-family: var(--font-mono); font-size: 11px; color: var(--c-muted); white-space: nowrap; }
        .mon-select { flex: 1; background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 8px; padding: 9px 12px; color: var(--c-text); font-family: var(--font-sans); font-size: 12px; outline: none; transition: all 0.2s; cursor: pointer; }
        .mon-select:focus { border-color: var(--c-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-accent) 15%, transparent); }

        .mon-footer { font-family: var(--font-mono); font-size: 10px; color: var(--c-muted); text-align: center; padding: 24px 0 12px; letter-spacing: 0.04em; }
        .mon-ws-input { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 8px; padding: 7px 12px; color: var(--c-text); font-family: var(--font-mono); font-size: 11px; outline: none; width: 210px; transition: all 0.2s; }
        .mon-ws-input:focus { border-color: var(--c-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-accent) 15%, transparent); }

        .mon-indicator-panel { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .mon-indicator-badge {
          background: var(--c-panel); border: 1px solid var(--c-border);
          border-radius: 6px; padding: 5px 12px; display: flex; align-items: center; gap: 6px;
        }
        .mon-badge-label { font-family: var(--font-sans); font-size: 10px; font-weight: 600; color: var(--c-muted); text-transform: uppercase; letter-spacing: 0.04em; }
        .mon-badge-value { font-family: var(--font-mono); font-size: 12px; font-weight: 500; color: var(--c-text); }
        .mon-badge-value.accent { color: var(--c-accent); }
      `}</style>

      <div className="mon-page">
        {/* Nav */}
        <nav className="mon-nav">
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div className="mon-logo-mark">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, color: "white" }}>
                <path d="M3 12h3l2-6 2 13 2-10 2 3h7" />
              </svg>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
              <span className="mon-logo-text">OndaVital</span>
              <span className="mon-logo-sub">Monitor</span>
            </div>
          </div>

          <div style={{ display:"flex", gap:12, alignItems:"center" }}>
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
                  style={{ fontSize:14 }} />
                {isConnected ? "Desconectar" : "Conectar"}
              </button>
            )}

            <button className="mon-btn mon-btn-ghost" onClick={() => navigate("/dashboard")}>
              <i className="ti ti-arrow-left" style={{ fontSize:14 }} />
              Panel
            </button>
          </div>
        </nav>

        {/* CONTENEDOR GRID DE DOS COLUMNAS */}
        <div className="mon-workspace-layout">
          
          {/* COLUMNA IZQUIERDA: Métricas, Gráfica y Controles */}
          <div className="mon-main-column">
            
            {/* Fila superior */}
            <div className="mon-top">
              {/* Estado Diagnóstico */}
              <div className="mon-card"
                style={{ 
                  borderColor: `color-mix(in srgb, ${st.accent} 30%, var(--c-border))`,
                  boxShadow: `0 0 12px color-mix(in srgb, ${st.accent} 12%, transparent)`,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  height: "100%"
                }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--c-muted)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: "600" }}>
                  Diagnóstico
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", margin: "14px 0" }}>
                  <div style={{ color: st.accent, background: `color-mix(in srgb, ${st.accent} 15%, transparent)`, width: "48px", height: "48px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid color-mix(in srgb, ${st.accent} 35%, transparent)` }} >
                    <i className={`ti ${st.icon}`} style={{ fontSize: "24px" }} />
                  </div>
                  <span style={{ color: st.accent, fontSize: "22px", fontWeight: "700", letterSpacing: "-0.02em" }}>
                    {st.label}
                  </span>
                </div>
                <span style={{ fontSize: "12px", color: "var(--c-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: "500" }}>
                  {st.desc}
                </span>
              </div>

              {/* Panel de Métricas */}
              <div className="mon-metrics">
                <div className="mon-metric-card" style={{ borderColor: stateKey !== "idle" ? `color-mix(in srgb, ${st.accent} 30%, var(--c-border))` : undefined }}>
                  <div className="mon-metric-label">Frecuencia Cardíaca</div>
                  <div>
                    <span className="mon-metric-value" style={{ color: st.accent }}>
                      {metrics.bpm === "--" ? "—" : Math.round(Number(metrics.bpm))}
                    </span>
                    <span className="mon-metric-unit">bpm</span>
                  </div>
                  <div className="mon-metric-sub">{st.label}</div>
                </div>

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

                <div className="mon-metric-card">
                  <div className="mon-metric-label">Total de Latidos</div>
                  <div>
                    <span className="mon-metric-value" style={{ color: "var(--c-accent)" }}>
                      {displayBeats}
                    </span>
                    <span className="mon-metric-unit">qrs</span>
                  </div>
                  <div className="mon-metric-sub">
                    {metrics.bpm !== "--" && bpmValid > 0 ? "detección activa" : "esperando datos..."}
                  </div>
                </div>
              </div>
            </div>

            {/* Gráfica ECG */}
            <div className="mon-card">
              <div className="mon-chart-header">
                <div>
                  <div className="mon-chart-title">Señal ECG en Tiempo Real</div>
                  <div className="mon-chart-sub">{`${FS} Hz · Monitoreo Continuo de Ritmo Cardíaco`}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:18 }}>
                  <div className="mon-legend">
                    <div className="mon-legend-item">
                      <div className="mon-legend-dot" style={{ background:"color-mix(in srgb, var(--c-accent) 40%, transparent)" }} />
                      señal cruda
                    </div>
                    <div className="mon-legend-item">
                      <div className="mon-legend-dot" style={{ background:"var(--c-accent)" }} />
                      filtrada
                    </div>
                    <div className="mon-legend-item">
                      <div className="mon-legend-dot" style={{ background:"var(--c-danger)", borderRadius:"50%", width:7, height:7 }} />
                      R-peak
                    </div>
                  </div>
                  <div className={`mon-signal-dot ${(isConnected || mode==="offline") ? "live" : "off"}`} />
                </div>
              </div>

              <div style={{ width:"100%", height: 340, background: "var(--c-bg)", borderRadius: 10, overflow: "hidden", border: "1px solid var(--c-border)" }}>
                <LiveChart getBuffer={getBuffer} getRPeaks={getRPeaks} dualChannel={true} signalType="filtered" fs={FS} theme="app" />
              </div>

              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:14, flexWrap:"wrap", gap:12 }}>
                <div className="mon-indicator-panel">
                  <div className="mon-indicator-badge">
                    <span className="mon-badge-label">Ventana:</span>
                    <span className="mon-badge-value">{(VISIBLE_SAMPLES / FS).toFixed(1)} s</span>
                  </div>
                  {typeof metrics.sampleCount === "number" && (
                    <>
                      <div className="mon-indicator-badge">
                        <span className="mon-badge-label">Tiempo:</span>
                        <span className="mon-badge-value accent">{samplesTo(metrics.sampleCount)}</span>
                      </div>
                      <div className="mon-indicator-badge">
                        <span className="mon-badge-label">Muestras:</span>
                        <span className="mon-badge-value">{metrics.sampleCount.toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </div>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-muted)", letterSpacing:"0.02em" }}>
                  {mode === "offline" ? "PhysioNet · MIT-BIH Database" : `Dispositivo Embebido · ${metrics.min ?? 0}–${metrics.max ?? 0} ADC`}
                </span>
              </div>
            </div>

            {/* Barra inferior */}
            <div className="mon-bottom">
              <div className="mon-info-bar">
                <i className="ti ti-heart-handshake mon-info-icon" />
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
                    <i className="ti ti-play" style={{ fontSize:15 }} /> Iniciar
                  </button>
                : <button className="mon-btn-stop" onClick={endSession}>
                    <i className="ti ti-square" style={{ fontSize:15 }} /> Terminar
                  </button>}
            </div>

            {/* Selector CSV */}
            {mode === "offline" && !session && (
              <div className="mon-csv-row">
                <span className="mon-csv-label">Registro MIT-BIH</span>
                <select className="mon-select" value={csvPath} onChange={e => setCsvPath(e.target.value)}>
                  {RECORDS.map(r => (
                    <option key={r.path} value={r.path}>{r.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* COLUMNA DERECHA NUEVA: Panel de Biofeedback Visual (Pulso) */}
          <div className="mon-side-column mon-card" 
            style={{ 
              borderColor: stateKey !== "idle" ? `color-mix(in srgb, ${st.accent} 30%, var(--c-border))` : undefined,
              boxShadow: stateKey !== "idle" ? `0 4px 20px color-mix(in srgb, ${st.accent} 8%, transparent)` : undefined
            }}>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="mon-metric-label">Biofeedback Visual</span>
              <span style={{ fontSize: 11, color: "var(--c-muted)", fontFamily: "var(--font-sans)" }}>
                Modelado morfológico reactivo
              </span>
            </div>

            {/* Zona central dedicada a la imagen o animación */}
            <div className="mon-pulse-zone">
              
              {/* Marcador de posición (Placeholder animado) */}
              {/* La clase 'beating' se activa dinámicamente si hay una señal activa */}
              <div className={`mock-heart ${metrics.bpm !== '--' && stateKey !== 'idle' && stateKey !== 'death' ? 'beating' : ''}`}>
                <i className="ti ti-heart" style={{ fontSize: "84px", color: st.accent, transition: "color 0.3s" }} />
              </div>

              {stateKey !== 'idle' && stateKey !== 'death' ? (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: st.accent, fontWeight: 600 }}>
                  Sincronizado con R-Peak
                </span>
              ) : (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--c-muted)" }}>
                  Esperando trazo...
                </span>
              )}
            </div>

            <div className="mon-side-footer">
              Canal ECG-Ch1 Activo
            </div>
          </div>

        </div>

        {/* Footer fuera de las columnas para que abarque el centro inferior */}
        <div className="mon-footer">
          {mode === "offline"
            ? "physionet.org · MIT-BIH Arrhythmia Database · datos de dominio público"
            : `WebSocket · ${wsUrl}`}
        </div>
      </div>
    </>
  );
}