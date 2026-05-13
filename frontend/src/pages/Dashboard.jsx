import { useNavigate }  from "react-router-dom";
import { useAuth }      from "../context/AuthContext";
import { supabase }     from "../lib/supabase";
import { useEffect, useState } from "react";

const STATUS_STYLE = {
  normal:       { bg: "rgba(79,199,164,0.12)", color: "#4fc7a4" },
  taquicardia:  { bg: "rgba(247,168,79,0.12)",  color: "#f7a84f" },
  bradicardia:  { bg: "rgba(79,142,247,0.12)",  color: "#4f8ef7" },
  arritmia:     { bg: "rgba(226,75,74,0.12)",   color: "#e24b4a" },
  indefinido:   { bg: "rgba(90,98,128,0.12)",   color: "#5a6280" },
};

export default function Dashboard() {
  const navigate        = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [sessions, setSessions]    = useState([]);
  const [stats,    setStats]       = useState({ bpm: "--", sdnn: "--", total: 0 });
  const [loading,  setLoading]     = useState(true);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  async function loadData() {
    setLoading(true);

    // Cargar sesiones con sus mediciones
    const { data } = await supabase
      .from("sessions")
      .select(`*, ecg_measurements(*)`)
      .eq("user_id", user.id)
      .order("fecha", { ascending: false })
      .limit(10);

    if (data) {
      setSessions(data);

      // Calcular stats globales del usuario
      const mediciones = data.flatMap((s) => s.ecg_measurements);
      if (mediciones.length > 0) {
        const bpms  = mediciones.map((m) => m.bpm_promedio).filter(Boolean);
        const sdnns = mediciones.map((m) => m.sdnn).filter(Boolean);
        setStats({
          bpm:   bpms.length  ? Math.round(bpms.reduce((a,b) => a+b,0)  / bpms.length)  : "--",
          sdnn:  sdnns.length ? Math.round(sdnns.reduce((a,b) => a+b,0) / sdnns.length) : "--",
          total: data.length,
        });
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

  const nombre = profile?.nombre ?? user?.email ?? "Usuario";

  return (
    <div style={s.page}>
      {/* ── Navbar ── */}
      <nav style={s.nav}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={s.logoIcon}>
            <i className="ti ti-activity" style={{ fontSize: 16, color: "#fff" }} aria-hidden="true" />
          </div>
          <span style={{ fontSize: 15, fontWeight: 500, color: "#e8eaf0" }}>CardioSense</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "#5a6280" }}>{nombre}</span>
          <button style={s.btnGhost} onClick={handleSignOut}>
            <i className="ti ti-logout" style={{ fontSize: 14, marginRight: 6 }} aria-hidden="true" />
            Salir
          </button>
        </div>
      </nav>

      <div style={s.content}>
        {/* ── Header ── */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={s.title}>Hola, {nombre.split(" ")[0]}</h1>
          <p style={s.sub}>
            {new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        {/* ── Botón nueva sesión ── */}
        <button style={s.btnNew} onClick={() => navigate("/monitor")}>
          <i className="ti ti-bluetooth" style={{ fontSize: 18 }} aria-hidden="true" />
          Nueva sesión de monitoreo
          <i className="ti ti-arrow-right" style={{ fontSize: 16, marginLeft: "auto" }} aria-hidden="true" />
        </button>

        {/* ── Stats globales ── */}
        <div style={s.statsGrid}>
          <StatCard icon="ti-heart-rate-monitor" label="BPM promedio" value={stats.bpm} color="#4f8ef7" />
          <StatCard icon="ti-chart-dots"          label="SDNN promedio" value={stats.sdnn ? `${stats.sdnn} ms` : "--"} color="#7c6af7" />
          <StatCard icon="ti-history"             label="Sesiones totales" value={stats.total} color="#4fc7a4" />
          <StatCard icon="ti-user"
            label="Perfil"
            value={profile?.edad ? `${profile.edad} años` : "--"}
            color="#f7a84f"
          />
        </div>

        {/* ── Sesiones recientes ── */}
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p style={s.sectionTitle}>Sesiones recientes</p>
            {sessions.length > 0 && (
              <span style={{ fontSize: 12, color: "#4f8ef7", cursor: "pointer" }}>Ver todas</span>
            )}
          </div>

          {loading && (
            <div style={s.empty}>Cargando sesiones...</div>
          )}

          {!loading && sessions.length === 0 && (
            <div style={s.emptyCard}>
              <i className="ti ti-heartbeat" style={{ fontSize: 32, color: "#2a3050", marginBottom: 10 }} aria-hidden="true" />
              <p style={{ fontSize: 14, color: "#5a6280", marginBottom: 4 }}>Sin sesiones todavía</p>
              <p style={{ fontSize: 12, color: "#3a4060" }}>Inicia tu primera sesión de monitoreo</p>
            </div>
          )}

          {!loading && sessions.map((session) => {
            const med     = session.ecg_measurements?.[0];
            const estado  = med?.estado ?? "indefinido";
            const estilo  = STATUS_STYLE[estado] ?? STATUS_STYLE.indefinido;
            return (
              <div key={session.id} style={s.sessionCard}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, color: "#c8cde0", marginBottom: 3 }}>
                    {formatDate(session.fecha)}
                  </p>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#5a6280" }}>
                      <i className="ti ti-clock" style={{ fontSize: 11, marginRight: 4 }} aria-hidden="true" />
                      {session.duracion_seg ? `${session.duracion_seg}s` : "--"}
                    </span>
                    <span style={{ fontSize: 11, color: "#5a6280" }}>
                      <i className="ti ti-bluetooth" style={{ fontSize: 11, marginRight: 4 }} aria-hidden="true" />
                      {session.modo ?? "--"}
                    </span>
                    {med?.bpm_promedio && (
                      <span style={{ fontSize: 11, color: "#5a6280" }}>
                        {Math.round(med.bpm_promedio)} BPM
                      </span>
                    )}
                  </div>
                </div>
                <span style={{
                  ...s.pill,
                  background: estilo.bg,
                  color:      estilo.color,
                }}>
                  {estado.charAt(0).toUpperCase() + estado.slice(1)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Componente StatCard ───────────────────────────────
function StatCard({ icon, label, value, color }) {
  return (
    <div style={s.statCard}>
      <i className={`ti ${icon}`} style={{ fontSize: 20, color, marginBottom: 8 }} aria-hidden="true" />
      <p style={{ fontSize: 22, fontWeight: 500, color: "#e8eaf0", marginBottom: 2 }}>{value}</p>
      <p style={{ fontSize: 11, color: "#5a6280" }}>{label}</p>
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
    padding: "14px 28px", borderBottom: "0.5px solid rgba(255,255,255,0.07)",
    position: "sticky", top: 0, background: "#0d1117", zIndex: 10,
  },
  logoIcon: {
    width: 30, height: 30, background: "#4f8ef7", borderRadius: 8,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  content: { maxWidth: 720, margin: "0 auto", padding: "32px 24px" },
  title:   { fontSize: 22, fontWeight: 500, color: "#e8eaf0", marginBottom: 4 },
  sub:     { fontSize: 13, color: "#5a6280", textTransform: "capitalize" },
  btnNew: {
    width: "100%", display: "flex", alignItems: "center", gap: 12,
    background: "#4f8ef7", border: "none", borderRadius: 12,
    padding: "14px 18px", color: "#fff", fontSize: 14, fontWeight: 500,
    cursor: "pointer", marginBottom: 20,
  },
  statsGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12,
  },
  statCard: {
    background: "#1a1f2e", border: "0.5px solid rgba(255,255,255,0.07)",
    borderRadius: 12, padding: "16px 14px",
  },
  sectionTitle: { fontSize: 11, fontWeight: 500, color: "#5a6280", textTransform: "uppercase", letterSpacing: "0.08em" },
  sessionCard: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "#1a1f2e", border: "0.5px solid rgba(255,255,255,0.07)",
    borderRadius: 10, padding: "12px 14px", marginBottom: 8, cursor: "pointer",
  },
  emptyCard: {
    background: "#1a1f2e", border: "0.5px solid rgba(255,255,255,0.07)",
    borderRadius: 12, padding: "40px 20px", textAlign: "center",
  },
  empty: { fontSize: 13, color: "#5a6280", textAlign: "center", padding: "40px 0" },
  pill: {
    display: "inline-flex", alignItems: "center", fontSize: 11,
    padding: "4px 10px", borderRadius: 20, fontWeight: 500,
  },
  btnGhost: {
    background: "transparent", border: "0.5px solid rgba(255,255,255,0.12)",
    borderRadius: 8, padding: "7px 12px", color: "#8b92a8", fontSize: 12, cursor: "pointer",
    display: "flex", alignItems: "center",
  },
};