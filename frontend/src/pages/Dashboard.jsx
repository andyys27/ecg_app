import { useNavigate }  from "react-router-dom";
import { useAuth }      from "../context/AuthContext";
import { supabase }     from "../lib/supabase";
import { useEffect, useState } from "react";

const STATUS_STYLE = {
  normal:       { bg: "color-mix(in srgb, var(--c-ok) 10%, transparent)",     color: "var(--c-ok)",      glyph: "♥", label: "Normal" },
  elevado:      { bg: "color-mix(in srgb, var(--c-warn) 10%, transparent)",   color: "var(--c-warn)",    glyph: "↑", label: "Elevado" },
  taquicardia:  { bg: "color-mix(in srgb, var(--c-danger) 10%, transparent)", color: "var(--c-danger)",  glyph: "⚡", label: "Taquicardia" },
  bradicardia:  { bg: "color-mix(in srgb, var(--c-info) 10%, transparent)",   color: "var(--c-info)",    glyph: "↓", label: "Bradicardia" },
  indefinido:   { bg: "color-mix(in srgb, var(--c-idle) 10%, transparent)",   color: "var(--c-idle)",    glyph: "○", label: "Indefinido" },
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
    
    // 1. Obtener el conteo REAL de todas las sesiones en la base de datos
    const { count: totalReal } = await supabase
      .from("sessions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    // 2. Traer los registros con el límite solicitado (3 para corto, 100 para completo)
    const limiteActual = showingAll ? 100 : 3;

    const { data } = await supabase
      .from("sessions")
      .select(`*, ecg_measurements(*)`)
      .eq("user_id", user.id)
      .order("fecha", { ascending: false })
      .limit(limiteActual);

    if (data) {
      setSessions(data);

      // El cálculo de promedio de tiempo se hace sobre las acumuladas disponibles
      const tiempoAcumulado = data.reduce((acc, s) => acc + (s.duracion_seg ?? 0), 0);
      const mediciones = data.flatMap((s) => s.ecg_measurements);
      
      if (mediciones.length > 0) {
        const bpms  = mediciones.map((m) => m.bpm_promedio).filter(Boolean);
        setStats({
          bpm: bpms.length ? Math.round(bpms.reduce((a,b) => a+b,0) / bpms.length) : "--",
          totalTiempo: tiempoAcumulado,
          totalGlobal: totalReal ?? data.length, // Almacena el conteo global absoluto
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

        .db-page * { box-sizing: border-box; margin: 0; padding: 0; }
        .db-page { background: var(--c-bg); min-height: 100vh; color: var(--c-text); font-family: var(--font-sans); text-align: left; }

        .db-page::before {
          content: '';
          position: fixed; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          background-size: 180px;
          pointer-events: none;
          z-index: 0;
        }

        .db-page > * { position: relative; z-index: 1; }

        .db-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 32px; height: 56px;
          background: color-mix(in srgb, var(--c-surface) 90%, transparent);
          border-bottom: 1px solid var(--c-border);
          backdrop-filter: blur(12px);
          position: sticky; top: 0; z-index: 20;
        }

        .db-logo-mark {
          width: 30px; height: 30px; border-radius: 8px;
          background: linear-gradient(135deg, var(--c-accent), var(--c-accent2));
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-mono); font-size: 13px; color: #fff; font-weight: 500;
          box-shadow: 0 0 16px color-mix(in srgb, var(--c-accent) 40%, transparent);
        }

        .db-logo-text { font-family: var(--font-sans); font-size: 15px; font-weight: 600; color: var(--c-text); letter-spacing: -0.02em; }
        .db-logo-sub { font-size: 11px; color: var(--c-idle); font-family: var(--font-mono); letter-spacing: 0.04em; }

        .db-content { max-width: 800px; margin: 0 auto; padding: 36px 24px; display: flex; flex-direction: column; gap: 24px; }
        
        .db-title { font-size: 24px; font-weight: 500; color: var(--c-text); letter-spacing: -0.02em; }
        .db-sub { font-size: 13px; color: var(--c-idle); font-family: var(--font-sans); margin-top: 2px; }

        .db-btn-new {
          width: 100%; display: flex; align-items: center; gap: 10px;
          background: linear-gradient(135deg, var(--c-accent), var(--c-accent2));
          border: none; border-radius: var(--r);
          padding: 14px 18px; color: #fff; font-size: 13px; font-weight: 600;
          cursor: pointer; box-shadow: 0 4px 20px color-mix(in srgb, var(--c-accent) 25%, transparent);
          transition: transform 0.1s, opacity 0.15s;
        }
        .db-btn-new:hover { opacity: 0.95; transform: translateY(-0.5px); }

        .db-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; }
        
        .db-stat-card {
          background: var(--c-surface); border: 1px solid var(--c-border);
          border-radius: var(--r); padding: 18px 16px; display: flex; flex-direction: column; gap: 6px;
          transition: border-color 0.2s;
        }
        .db-stat-card:hover { border-color: var(--c-border2); }
        .db-stat-label { font-size: 10px; font-weight: 500; color: var(--c-idle); text-transform: uppercase; letter-spacing: 0.08em; }
        .db-stat-value { font-family: var(--font-mono); font-size: 24px; font-weight: 400; color: var(--c-text); line-height: 1; }
        .db-stat-unit { font-size: 12px; color: var(--c-idle); margin-left: 3px; font-weight: 300; }

        .db-section-title { font-size: 11px; font-weight: 500; color: var(--c-idle); text-transform: uppercase; letter-spacing: 0.08em; }
        
        .db-session-card {
          display: flex; align-items: center; justify-content: space-between;
          background: var(--c-surface); border: 1px solid var(--c-border);
          border-radius: var(--r); padding: 14px 18px; margin-bottom: 8px;
          transition: border-color 0.15s, background 0.15s, transform 0.1s; cursor: pointer;
        }
        .db-session-card:hover { border-color: var(--c-accent); background: var(--c-panel); transform: translateX(2px); }

        .db-pill {
          display: inline-flex; align-items: center; gap: 5px; font-size: 11px;
          padding: 4px 12px; border-radius: 20px; font-weight: 500;
          font-family: var(--font-sans); text-transform: uppercase; letter-spacing: 0.02em;
        }

        .db-empty-card {
          background: var(--c-surface); border: 1px solid var(--c-border);
          border-radius: var(--r-lg); padding: 44px 20px; text-align: center;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
        }

        .db-btn-ghost {
          background: transparent; border: 1px solid var(--c-border2);
          border-radius: 8px; padding: 6px 12px; color: var(--c-idle); font-size: 12px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 5px; transition: color 0.15s, border-color 0.15s;
        }
        .db-btn-ghost:hover { color: var(--c-text); border-color: var(--c-faint); }

        .db-modal-overlay {
          position: fixed; inset: 0; background: rgba(5, 5, 8, 0.75);
          backdrop-filter: blur(6px); display: flex; align-items: center;
          justify-content: center; z-index: 100; padding: 20px;
        }
        .db-modal-card {
          background: var(--c-surface); border: 1px solid var(--c-border);
          border-radius: var(--r-lg); width: 100%; max-width: 440px;
          padding: 24px; position: relative; display: flex; flex-direction: column; gap: 16px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.5);
        }
        .db-modal-close {
          position: absolute; top: 18px; right: 18px; background: transparent;
          border: none; color: var(--c-idle); cursor: pointer; font-size: 16px;
        }
        .db-modal-close:hover { color: var(--c-text); }
        .db-modal-metric {
          background: var(--c-panel); border: 1px solid var(--c-border);
          border-radius: var(--r); padding: 12px 16px; display: flex;
          justify-content: space-between; align-items: center;
        }
      `}</style>

      <div className="db-page">
        {/* ── Navbar ── */}
        <nav className="db-nav">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="db-logo-mark">C</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span className="db-logo-text">CardioSense</span>
              <span className="db-logo-sub">Estación de Control</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 12, color: "var(--c-idle)", fontFamily: "var(--font-mono)" }}>{nombre}</span>
            <button className="db-btn-ghost" onClick={handleSignOut}>
              <i className="ti ti-logout" style={{ fontSize: 13 }} />
              Salir
            </button>
          </div>
        </nav>

        <div className="db-content">
          {/* ── Header ── */}
          <div>
            <h1 className="db-title">Hola, {nombre.split(" ")[0]}</h1>
            <p className="db-sub">
              {new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>

          {/* ── Botón Nueva Sesión ── */}
          <button className="db-btn-new" onClick={() => navigate("/monitor")}>
            <i className="ti ti-activity" style={{ fontSize: 15 }} />
            Nueva sesión de monitoreo clínico
            <i className="ti ti-arrow-right" style={{ fontSize: 14, marginLeft: "auto" }} />
          </button>

          {/* ── Stats Globales ── */}
          <div className="db-stats-grid">
            <div className="db-stat-card">
              <span className="db-stat-label">BPM Promedio</span>
              <div>
                <span className="db-stat-value" style={{ color: "var(--c-ok)" }}>{stats.bpm}</span>
                <span className="db-stat-unit">bpm</span>
              </div>
            </div>

            <div className="db-stat-card">
              <span className="db-stat-label">Tiempo Total</span>
              <div>
                <span className="db-stat-value" style={{ color: "var(--c-accent2)" }}>
                  {formatTotalTime(stats.totalTiempo)}
                </span>
                <span className="db-stat-unit">{stats.totalTiempo < 60 ? "" : "min"}</span>
              </div>
            </div>

            {/* FIXED: Muestra siempre el conteo global absoluto de la DB */}
            <div className="db-stat-card">
              <span className="db-stat-label">Sesiones Guardadas</span>
              <div>
                <span className="db-stat-value">{stats.totalGlobal}</span>
                <span className="db-stat-unit">runs</span>
              </div>
            </div>

            <div className="db-stat-card">
              <span className="db-stat-label">Ficha Fisiológica</span>
              <div>
                <span className="db-stat-value" style={{ color: "var(--c-info)" }}>
                  {profile?.edad ? profile.edad : "—"}
                </span>
                <span className="db-stat-unit">años</span>
              </div>
            </div>
          </div>

          {/* ── Sesiones Recientes ── */}
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", justifyBetween: "space-between", alignItems: "center", marginBottom: 14, justifyContent: "space-between" }}>
              <p className="db-section-title">
                {showingAll ? `Historial Completo (Últimas ${sessions.length})` : "Últimas 3 sesiones registradas"}
              </p>
              {stats.totalGlobal > 0 && (
                <span 
                  style={{ fontSize: 11, color: "var(--c-accent2)", fontFamily: "var(--font-mono)", cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => setShowingAll(!showingAll)}
                >
                  {showingAll ? "Ver menos" : `Ver historial completo (${stats.totalGlobal})`}
                </span>
              )}
            </div>

            {loading && (
              <div style={{ fontSize: 12, color: "var(--c-idle)", textAlign: "center", padding: "40px 0", fontFamily: "var(--font-mono)" }}>
                Sincronizando con Supabase...
              </div>
            )}

            {!loading && sessions.length === 0 && (
              <div className="db-empty-card">
                <i className="ti ti-heartbeat" style={{ fontSize: 32, color: "var(--c-faint)", marginBottom: 12 }} />
                <p style={{ fontSize: 13, color: "var(--c-text)", fontWeight: 500, marginBottom: 4 }}>Sin trazos de instrumentación</p>
                <p style={{ fontSize: 11, color: "var(--c-idle)" }}>Inicia tu primera adquisición offline (CSV) o hardware continuo.</p>
              </div>
            )}

            {!loading && sessions.map((session) => {
              const med     = session.ecg_measurements?.[0];
              const estado  = med?.estado ?? "indefinido";
              const estilo  = STATUS_STYLE[estado] ?? STATUS_STYLE.indefinido;
              return (
                <div key={session.id} className="db-session-card" onClick={() => setSelectedSession(session)}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                    <p style={{ fontSize: 13, color: "var(--c-text)", fontWeight: 500, letterSpacing: "-0.01em" }}>
                      {formatDate(session.fecha)}
                    </p>
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "var(--c-idle)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: 4 }}>
                        <i className="ti ti-clock" style={{ fontSize: 11 }} />
                        {session.duracion_seg ? `${session.duracion_seg}s` : "0s"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--c-idle)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: 4 }}>
                        <i className="ti ti-layers-subtract" style={{ fontSize: 11 }} />
                        {session.modo ? session.modo.toUpperCase() : "CSV"}
                      </span>
                      {med?.bpm_promedio && (
                        <span style={{ fontSize: 11, color: "var(--c-muted)", fontFamily: "var(--font-mono)" }}>
                          • {Math.round(med.bpm_promedio)} bpm promedio
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="db-pill" style={{ background: estilo.bg, color: estilo.color }}>
                    <span style={{ fontSize: 9 }}>{estilo.glyph}</span>
                    {estilo.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── MODAL DE INSPECCIÓN CLÍNICA ── */}
      {selectedSession && (() => {
        const med = selectedSession.ecg_measurements?.[0];
        const estado = med?.estado ?? "indefinido";
        const estilo = STATUS_STYLE[estado] ?? STATUS_STYLE.indefinido;
        return (
          <div className="db-modal-overlay" onClick={() => setSelectedSession(null)}>
            <div className="db-modal-card" onClick={e => e.stopPropagation()}>
              <button className="db-modal-close" onClick={() => setSelectedSession(null)}>✕</button>
              
              <div>
                <span className="db-stat-label">Reporte Clínico</span>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--c-text)", marginTop: 2 }}>
                  Adquisición {formatDate(selectedSession.fecha)}
                </h3>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--c-border)" }} />

              <div className="db-modal-metric">
                <span style={{ fontSize: 13, color: "var(--c-idle)" }}>Diagnóstico del Trazo:</span>
                <span className="db-pill" style={{ background: estilo.bg, color: estilo.color }}>
                  <span style={{ fontSize: 9 }}>{estilo.glyph}</span>
                  {estilo.label}
                </span>
              </div>

              <div className="db-modal-metric">
                <span style={{ fontSize: 13, color: "var(--c-idle)" }}>Frecuencia Promedio:</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: estilo.color, fontWeight: 500 }}>
                  {med?.bpm_promedio ? `${Math.round(med.bpm_promedio)} BPM` : "—"}
                </span>
              </div>

              <div className="db-modal-metric">
                <span style={{ fontSize: 13, color: "var(--c-idle)" }}>Duración del Registro:</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--c-text)" }}>
                  {selectedSession.duracion_seg ?? 0} segundos
                </span>
              </div>

              <div className="db-modal-metric">
                <span style={{ fontSize: 13, color: "var(--c-idle)" }}>Origen de Instrumentación:</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--c-accent2)", textTransform: "uppercase" }}>
                  {selectedSession.modo ?? "CSV Fijo"}
                </span>
              </div>
              
              {selectedSession.registro_mitbih && (
                <div style={{ fontSize: 11, color: "var(--c-muted)", textAlign: "center", fontFamily: "var(--font-mono)" }}>
                  Registro base: {selectedSession.registro_mitbih.replace("/", "")}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
}