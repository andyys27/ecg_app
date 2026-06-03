import { useNavigate }  from "react-router-dom";
import { useAuth }      from "../context/AuthContext";
import { supabase }     from "../lib/supabase";
import { useEffect, useState } from "react";

const STATUS_STYLE = {
  normal:       { bg: "color-mix(in srgb, var(--c-ok) 12%, transparent)",     color: "var(--c-ok)",      glyph: "♥", label: "Normal" },
  elevado:      { bg: "color-mix(in srgb, var(--c-warn) 12%, transparent)",   color: "var(--c-warn)",    glyph: "↑", label: "Elevado" },
  taquicardia:  { bg: "color-mix(in srgb, var(--c-danger) 12%, transparent)", color: "var(--c-danger)",  glyph: "⚡", label: "Taquicardia" },
  bradicardia:  { bg: "color-mix(in srgb, var(--c-info) 12%, transparent)",   color: "var(--c-info)",    glyph: "↓", label: "Bradicardia" },
  indefinido:   { bg: "color-mix(in srgb, var(--c-idle) 12%, transparent)",   color: "var(--c-idle)",    glyph: "○", label: "Indefinido" },
};

export default function Dashboard() {
  const navigate        = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [sessions, setSessions]    = useState([]);
  const [stats,    setStats]       = useState({ bpm: "--", totalTiempo: 0, totalGlobal: 0 });
  const [loading,  setLoading]     = useState(true);
  
  const [showingAll, setShowingAll] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, showingAll]);

  async function loadData() {
    setLoading(true);
    
    const { count: totalReal } = await supabase
      .from("sessions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    const limiteActual = showingAll ? 100 : 3;

    const { data } = await supabase
      .from("sessions")
      .select(`*, ecg_measurements(*)`)
      .eq("user_id", user.id)
      .order("fecha", { ascending: false })
      .limit(limiteActual);

    if (data) {
      setSessions(data);

      const tiempoAcumulado = data.reduce((acc, s) => acc + (s.duracion_seg ?? 0), 0);
      const mediciones = data.flatMap((s) => s.ecg_measurements);
      
      if (mediciones.length > 0) {
        const bpms  = mediciones.map((m) => m.bpm_promedio).filter(Boolean);
        setStats({
          bpm: bpms.length ? Math.round(bpms.reduce((a,b) => a+b,0) / bpms.length) : "--",
          totalTiempo: tiempoAcumulado,
          totalGlobal: totalReal ?? data.length,
        });
      } else {
        setStats(prev => ({ ...prev, totalGlobal: totalReal ?? data.length, totalTiempo: tiempoAcumulado }));
      }
    }
    setLoading(false);
  }

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function formatTotalTime(segundos) {
    if (segundos === 0) return "0";
    if (segundos < 60) return `${segundos}s`;
    return `${Math.round(segundos / 60)}`;
  }

  const nombre = profile?.nombre ?? user?.email ?? "Usuario";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Roboto+Mono:ital,wght@0,100..700;1,100..700&display=swap');

        :root {
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
          
          --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          --font-mono: 'Roboto Mono', ui-monospace, SFMono-Regular, monospace;
          --r:         10px;
          --r-lg:      14px;
        }

        .db-page * { box-sizing: border-box; margin: 0; padding: 0; }
        .db-page { background: var(--c-bg); min-height: 100vh; color: var(--c-text); font-family: var(--font-sans); text-align: left; overflow-x: hidden; -webkit-font-smoothing: antialiased; }

        .db-page::before {
          content: '';
          position: fixed; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.6' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.015'/%3E%3C/svg%3E");
          background-size: 140px;
          pointer-events: none;
          z-index: 0;
        }

        .db-page > * { position: relative; z-index: 1; }

        .db-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 24px; height: 60px;
          background: color-mix(in srgb, var(--c-surface) 90%, transparent);
          border-bottom: 1px solid var(--c-border);
          backdrop-filter: blur(16px);
          position: sticky; top: 0; z-index: 20;
          box-shadow: 0 2px 10px rgba(15, 61, 92, 0.02);
        }

        .db-logo-mark {
          width: 32px; height: 32px; border-radius: 8px;
          background: linear-gradient(135deg, var(--c-accent), var(--c-info));
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-sans); font-size: 15px; color: #fff; font-weight: 700;
          box-shadow: 0 3px 10px color-mix(in srgb, var(--c-accent) 25%, transparent);
        }

        .db-logo-text { font-family: var(--font-sans); font-size: 17px; font-weight: 700; color: var(--c-text); letter-spacing: -0.02em; }
        .db-logo-sub { font-size: 10px; color: var(--c-muted); font-family: var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; }

        .db-workspace-layout { 
          max-width: 1380px; 
          margin: 0 auto; 
          padding: 24px; 
          display: grid; 
          grid-template-columns: 1fr 440px; 
          gap: 24px; 
          align-items: start;
        }

        .db-main-column { display: flex; flex-direction: column; gap: 20px; }
        .db-side-column { display: flex; flex-direction: column; }

        @media (max-width: 1100px) {
          .db-workspace-layout { grid-template-columns: 1fr; gap: 24px; }
          .db-history-panel { max-height: none !important; }
        }
        
        .db-title { font-size: 26px; font-weight: 700; color: var(--c-text); letter-spacing: -0.02em; }
        .db-sub { font-size: 13px; color: var(--c-muted); font-family: var(--font-sans); margin-top: 2px; font-weight: 500; }

        .db-btn-new {
          width: 100%; display: flex; align-items: center; gap: 12px;
          background: linear-gradient(135deg, var(--c-accent), var(--c-accent2));
          border: none; border-radius: var(--r);
          padding: 16px 20px; color: #fff; font-size: 13px; font-weight: 600;
          cursor: pointer; box-shadow: 0 4px 15px color-mix(in srgb, var(--c-accent) 25%, transparent);
          transition: all 0.2s ease;
        }
        .db-btn-new:hover { opacity: 0.95; transform: translateY(-1px); box-shadow: 0 6px 20px color-mix(in srgb, var(--c-accent) 40%, transparent); }

        .db-stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
        
        .db-stat-card {
          background: var(--c-surface); border: 1px solid var(--c-border);
          border-radius: var(--r); padding: 20px; display: flex; flex-direction: column; gap: 4px;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-shadow: 0 4px 12px rgba(15, 61, 92, 0.02);
        }
        .db-stat-card:hover { border-color: var(--c-border2); box-shadow: 0 6px 16px rgba(15, 61, 92, 0.05); }
        .db-stat-label { font-size: 10px; font-weight: 700; color: var(--c-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .db-stat-value { font-family: var(--font-sans); font-size: 28px; font-weight: 700; color: var(--c-text); line-height: 1; letter-spacing: -0.03em; }
        .db-stat-unit { font-size: 12px; color: var(--c-muted); margin-left: 4px; font-family: var(--font-sans); font-weight: 500; }

        .db-hardware-terminal {
          background: var(--c-surface); border: 1px solid var(--c-border);
          border-radius: var(--r-lg); padding: 20px; display: flex; flex-direction: column; gap: 14px;
          box-shadow: 0 4px 12px rgba(15, 61, 92, 0.02);
        }
        .db-hw-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .db-hw-item { background: var(--c-panel); padding: 10px; border-radius: 6px; border: 1px solid var(--c-border); }

        .db-section-title { font-size: 11px; font-weight: 700; color: var(--c-text); text-transform: uppercase; letter-spacing: 0.08em; }
        
        .db-history-panel {
          background: var(--c-surface);
          border: 1px solid var(--c-border);
          border-radius: var(--r-lg);
          padding: 20px;
          display: flex;
          flex-direction: column;
          max-height: calc(100vh - 110px);
          position: sticky; top: 84px;
          box-shadow: 0 4px 20px rgba(15, 61, 92, 0.03);
        }
        .db-history-scroll {
          overflow-y: auto;
          padding-right: 4px;
          margin-top: 14px;
        }
        .db-history-scroll::-webkit-scrollbar { width: 5px; }
        .db-history-scroll::-webkit-scrollbar-track { background: transparent; }
        .db-history-scroll::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: 10px; }
        .db-history-scroll::-webkit-scrollbar-thumb:hover { background: var(--c-faint); }

        .db-session-card {
          display: flex; align-items: center; justify-content: space-between;
          background: var(--c-surface); border: 1px solid var(--c-border);
          border-radius: var(--r); padding: 12px 14px; margin-bottom: 8px;
          transition: all 0.15s ease; cursor: pointer;
        }
        .db-session-card:hover { border-color: var(--c-accent); background: var(--c-panel); transform: translateY(-1px); }
        .db-session-card:last-child { margin-bottom: 0; }

        .db-pill {
          display: inline-flex; align-items: center; gap: 5px; font-size: 10px;
          padding: 4px 10px; border-radius: 4px; font-weight: 700;
          font-family: var(--font-sans); text-transform: uppercase; letter-spacing: 0.02em;
        }

        .db-empty-card {
          background: var(--c-panel); border: 1px dashed var(--c-border2);
          border-radius: var(--r); padding: 40px 16px; text-align: center;
        }

        .db-btn-ghost {
          background: var(--c-surface); border: 1px solid var(--c-border);
          border-radius: 6px; padding: 6px 12px; color: var(--c-text); font-size: 12px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s;
          font-weight: 600;
        }
        .db-btn-ghost:hover { color: var(--c-death); border-color: var(--c-death); background: color-mix(in srgb, var(--c-death) 8%, #fff); }

        .db-modal-overlay {
          position: fixed; inset: 0; background: rgba(15, 61, 92, 0.35);
          backdrop-filter: blur(6px); display: flex; align-items: center;
          justify-content: center; z-index: 100; padding: 20px;
        }
        .db-modal-card {
          background: var(--c-surface); border: 1px solid var(--c-border2);
          border-radius: var(--r-lg); width: 100%; max-width: 420px;
          padding: 24px; position: relative; display: flex; flex-direction: column; gap: 14px;
          box-shadow: 0 20px 40px rgba(15, 61, 92, 0.15);
        }
        .db-modal-close {
          position: absolute; top: 20px; right: 20px; background: transparent;
          border: none; color: var(--c-muted); cursor: pointer; font-size: 16px;
        }
        .db-modal-metric {
          background: var(--c-panel); border: 1px solid var(--c-border);
          border-radius: var(--r); padding: 12px 14px; display: flex;
          justify-content: space-between; align-items: center;
        }
      `}</style>

      <div className="db-page">
        {/* ── Navbar ── */}
        <nav className="db-nav">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="db-logo-mark">Ω</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <span className="db-logo-text">OndaVital</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 11, color: "var(--c-accent2)", fontFamily: "var(--font-mono)", background: "var(--c-panel)", padding: "4px 10px", borderRadius: "4px", border: "1px solid var(--c-border)", fontWeight: 600 }}>
              {nombre}
            </span>
            <button className="db-btn-ghost" onClick={handleSignOut}>
              <i className="ti ti-power" style={{ fontSize: 12 }} />
              Desconectar
            </button>
          </div>
        </nav>

        {/* Workspace Layout */}
        <div className="db-workspace-layout">
          
          {/* Columna Izquierda */}
          <div className="db-main-column">
            <div>
              <h1 className="db-title">Hola, {nombre.split(" ")[0]}</h1>
              <p className="db-sub">
                {new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>

            <button className="db-btn-new" onClick={() => navigate("/monitor")}>
              <i className="ti ti-pulse" style={{ fontSize: 16 }} />
              <span>Iniciar Adquisición y Análisis ECG en Tiempo Real</span>
              <i className="ti ti-chevron-right" style={{ fontSize: 13, marginLeft: "auto" }} />
            </button>

            <div className="db-stats-grid">
              <div className="db-stat-card" style={{ borderTop: "3px solid var(--c-ok)" }}>
                <span className="db-stat-label">BPM Promedio</span>
                <div>
                  <span className="db-stat-value" style={{ color: "var(--c-ok)" }}>{stats.bpm}</span>
                  <span className="db-stat-unit">bpm</span>
                </div>
              </div>

              <div className="db-stat-card" style={{ borderTop: "3px solid var(--c-accent)" }}>
                <span className="db-stat-label">Tiempo Acumulado</span>
                <div>
                  <span className="db-stat-value" style={{ color: "var(--c-accent)" }}>
                    {formatTotalTime(stats.totalTiempo)}
                  </span>
                  <span className="db-stat-unit">{stats.totalTiempo < 60 ? "" : "min"}</span>
                </div>
              </div>

              <div className="db-stat-card">
                <span className="db-stat-label">Sesiones en DB</span>
                <div>
                  <span className="db-stat-value">{stats.totalGlobal}</span>
                  <span className="db-stat-unit">registros</span>
                </div>
              </div>

              <div className="db-stat-card">
                <span className="db-stat-label">Ficha del Paciente</span>
                <div>
                  <span className="db-stat-value" style={{ color: "var(--c-info)" }}>
                    {profile?.edad ? profile.edad : "—"}
                  </span>
                  <span className="db-stat-unit">años u.</span>
                </div>
              </div>
            </div>

            {/* Configuración Biomédica */}
            <div className="db-hardware-terminal">
              <div>
                <p className="db-section-title" style={{ color: "var(--c-accent)" }}>Configuración de la Estación Biomédica</p>
                <p style={{ fontSize: 11, color: "var(--c-muted)", marginTop: 2 }}>Parámetros de adquisición de señal establecidos en firmware y backend</p>
              </div>
              <div className="db-hw-grid">
                <div className="db-hw-item">
                  <p style={{ fontSize: 9, color: "var(--c-muted)", textTransform: "uppercase", fontWeight: 700 }}>Filtros de Banda</p>
                  <p style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--c-accent)", marginTop: 2 }}>HW: 0.5-150 Hz</p>
                  <p style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--c-info)" }}>SW: 0.5-45 Hz</p>
                </div>
                <div className="db-hw-item">
                  <p style={{ fontSize: 9, color: "var(--c-muted)", textTransform: "uppercase", fontWeight: 700 }}>Frec. Muestreo</p>
                  <p style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--c-text)", marginTop: 4 }}>300 Hz</p>
                  <p style={{ fontSize: 10, color: "var(--c-muted)", fontFamily: "var(--font-sans)" }}>Firmware ESP32</p>
                </div>
                <div className="db-hw-item">
                  <p style={{ fontSize: 9, color: "var(--c-muted)", textTransform: "uppercase", fontWeight: 700 }}>Canal / Electrodos</p>
                  <p style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--c-warn)", marginTop: 4 }}>1 Derivación</p>
                  <p style={{ fontSize: 10, color: "var(--c-muted)", fontFamily: "var(--font-sans)" }}>Brazos + Pierna Der.</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--c-muted)", fontFamily: "var(--font-mono)", background: "var(--c-panel)", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--c-border)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><i className="ti ti-check" style={{ color: "var(--c-ok)" }} /> Filtro Notch 60Hz Integrado</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><i className="ti ti-check" style={{ color: "var(--c-ok)" }} /> Configuración RA/LA/RL Activa</span>
              </div>
            </div>
          </div>

          {/* Columna Derecha */}
          <div className="db-side-column">
            <div className="db-history-panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p className="db-section-title">
                  {showingAll ? `Todos los Trazos (${sessions.length})` : "Sesiones Recientes"}
                </p>
                {stats.totalGlobal > 0 && (
                  <span 
                    style={{ fontSize: 11, color: "var(--c-accent)", fontFamily: "var(--font-sans)", cursor: "pointer", fontWeight: 600 }}
                    onClick={() => setShowingAll(!showingAll)}
                  >
                    {showingAll ? "[ Ver Menos ]" : `[ Mostrar Todo (${stats.totalGlobal}) ]`}
                  </span>
                )}
              </div>

              <div className="db-history-scroll">
                {loading && (
                  <div style={{ fontSize: 11, color: "var(--c-muted)", textAlign: "center", padding: "30px 0" }}>
                    Sincronizando con nube...
                  </div>
                )}

                {!loading && sessions.length === 0 && (
                  <div className="db-empty-card">
                    <i className="ti ti-heart-broken" style={{ fontSize: 32, color: "var(--c-faint)", marginBottom: 10 }} />
                    <p style={{ fontSize: 12, color: "var(--c-text)", fontWeight: 600, marginBottom: 2 }}>Sin trazos registrados</p>
                    <p style={{ fontSize: 11, color: "var(--c-muted)" }}>Realiza tu primera adquisición vía streaming o archivo de datos.</p>
                  </div>
                )}

                {!loading && sessions.map((session) => {
                  const med     = session.ecg_measurements?.[0];
                  const estado  = med?.estado ?? "indefinido";
                  const estilo  = STATUS_STYLE[estado] ?? STATUS_STYLE.indefinido;
                  return (
                    <div key={session.id} className="db-session-card" onClick={() => setSelectedSession(session)}>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                        <p style={{ fontSize: 12, color: "var(--c-text)", fontWeight: 700 }}>
                          {formatDate(session.fecha)}
                        </p>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "var(--c-muted)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: 3 }}>
                            <i className="ti ti-clock" style={{ fontSize: 10 }} />
                            {session.duracion_seg ? `${session.duracion_seg}s` : "0s"}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--c-muted)", fontFamily: "var(--font-sans)", textTransform: "uppercase", fontWeight: 500 }}>
                            • {session.modo ?? "CSV"}
                          </span>
                          {med?.bpm_promedio && (
                            <span style={{ fontSize: 11, color: "var(--c-accent)", fontFamily: "var(--font-sans)", fontWeight: 600 }}>
                              • {Math.round(med.bpm_promedio)} bpm
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="db-pill" style={{ background: estilo.bg, color: estilo.color }}>
                        {estilo.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Modal */}
      {selectedSession && (() => {
        const med = selectedSession.ecg_measurements?.[0];
        const estado = med?.estado ?? "indefinido";
        const estilo = STATUS_STYLE[estado] ?? STATUS_STYLE.indefinido;
        return (
          <div className="db-modal-overlay" onClick={() => setSelectedSession(null)}>
            <div className="db-modal-card" onClick={e => e.stopPropagation()}>
              <button className="db-modal-close" onClick={() => setSelectedSession(null)}>✕</button>
              
              <div>
                <span className="db-stat-label">Informe de Adquisición</span>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--c-text)", marginTop: 4 }}>
                  Registro: {formatDate(selectedSession.fecha)}
                </h3>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--c-border)" }} />

              <div className="db-modal-metric">
                <span style={{ fontSize: 12, color: "var(--c-muted)", fontWeight: 500 }}>Diagnóstico Automatizado:</span>
                <span className="db-pill" style={{ background: estilo.bg, color: estilo.color }}>
                  {estilo.label}
                </span>
              </div>

              <div className="db-modal-metric">
                <span style={{ fontSize: 12, color: "var(--c-muted)", fontWeight: 500 }}>Frecuencia Promedio:</span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: estilo.color, fontWeight: 700 }}>
                  {med?.bpm_promedio ? `${Math.round(med.bpm_promedio)} BPM` : "—"}
                </span>
              </div>

              <div className="db-modal-metric">
                <span style={{ fontSize: 12, color: "var(--c-muted)", fontWeight: 500 }}>Ventana de Tiempo:</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--c-text)", fontWeight: 600 }}>
                  {selectedSession.duracion_seg ?? 0} segundos
                </span>
              </div>

              <div className="db-modal-metric">
                <span style={{ fontSize: 12, color: "var(--c-muted)", fontWeight: 500 }}>Método de Entrada:</span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--c-accent)", textTransform: "uppercase", fontWeight: 700 }}>
                  {selectedSession.modo ?? "CSV Interno"}
                </span>
              </div>
              
              {selectedSession.registro_mitbih && (
                <div style={{ fontSize: 11, color: "var(--c-muted)", textAlign: "center", fontFamily: "var(--font-mono)", background: "var(--c-panel)", padding: "6px", borderRadius: "4px", border: "1px solid var(--c-border)" }}>
                  Base de Datos: {selectedSession.registro_mitbih.replace("/", "")}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
}