import { useNavigate } from "react-router-dom";
import { useAuth }     from "../context/AuthContext";
import { useEffect }   from "react";

const FEATURES = [
  {
    icon: "ti-wave-sine",
    color: "#4f8ef7",
    title: "ECG en vivo",
    desc:  "500 Hz · filtrado digital con biquads",
  },
  {
    icon: "ti-chart-dots",
    color: "#7c6af7",
    title: "Análisis HRV",
    desc:  "SDNN · RMSSD · pNN50 · Poincaré",
  },
  {
    icon: "ti-bell",
    color: "#f7a84f",
    title: "Alertas clínicas",
    desc:  "Bradicardia · taquicardia · arritmia",
  },
  {
    icon: "ti-history",
    color: "#4fc7a4",
    title: "Historial",
    desc:  "Seguimiento por sesión y evolución",
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Si ya hay sesión activa, ir directo al dashboard
  useEffect(() => {
    if (user) navigate("/dashboard");
  }, [user, navigate]);

  return (
    <div style={s.page}>
      {/* ── Navbar ── */}
      <nav style={s.nav}>
        <div style={s.logo}>
          <div style={s.logoIcon}>
            <i className="ti ti-activity" style={{ fontSize: 16, color: "#fff" }} aria-hidden="true" />
          </div>
          <span style={s.logoText}>CardioSense</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button style={s.btnGhost} onClick={() => navigate("/login")}>
            Iniciar sesión
          </button>
          <button style={s.btnPrimary} onClick={() => navigate("/register")}>
            Crear cuenta
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={s.hero}>
        <div style={s.pill}>
          <i className="ti ti-bluetooth" style={{ fontSize: 12 }} aria-hidden="true" />
          ESP32 · BLE · MIT-BIH
        </div>

        <h1 style={s.heroTitle}>
          Monitoreo cardíaco<br />
          <span style={{ color: "#4f8ef7" }}>inteligente</span> en tiempo real
        </h1>

        <p style={s.heroSub}>
          Conecta tu ESP32, visualiza tu ECG y obtén análisis clínico
          de tu actividad cardiovascular. Diseñado para bioinstrumentación.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={{ ...s.btnPrimary, padding: "12px 28px", fontSize: 15 }}
            onClick={() => navigate("/register")}>
            Comenzar gratis
          </button>
          <button style={{ ...s.btnGhost, padding: "12px 28px", fontSize: 15 }}
            onClick={() => navigate("/monitor")}>
            <i className="ti ti-player-play" style={{ fontSize: 14, marginRight: 6 }} aria-hidden="true" />
            Demo offline
          </button>
        </div>
      </section>

      {/* ── Features ── */}
      <section style={s.features}>
        {FEATURES.map((f) => (
          <div key={f.title} style={s.featureCard}>
            <i className={`ti ${f.icon}`}
              style={{ fontSize: 24, color: f.color, marginBottom: 10 }}
              aria-hidden="true" />
            <p style={s.featureTitle}>{f.title}</p>
            <p style={s.featureDesc}>{f.desc}</p>
          </div>
        ))}
      </section>

      {/* ── Footer ── */}
      <footer style={s.footer}>
        <p>CardioSense · Bioinstrumentación · MIT-BIH Arrhythmia Database · PhysioNet</p>
      </footer>
    </div>
  );
}

// ── Estilos ──────────────────────────────────────────────
const s = {
  page: {
    background:  "#0d1117",
    minHeight:   "100vh",
    fontFamily:  "var(--font-sans, system-ui, sans-serif)",
    color:       "#e8eaf0",
    display:     "flex",
    flexDirection: "column",
  },
  nav: {
    display:        "flex",
    alignItems:     "center",
    justifyContent: "space-between",
    padding:        "16px 32px",
    borderBottom:   "0.5px solid rgba(255,255,255,0.07)",
    position:       "sticky",
    top:            0,
    background:     "#0d1117",
    zIndex:         10,
  },
  logo: {
    display:    "flex",
    alignItems: "center",
    gap:        10,
  },
  logoIcon: {
    width:          32,
    height:         32,
    background:     "#4f8ef7",
    borderRadius:   8,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize:   16,
    fontWeight: 500,
    color:      "#e8eaf0",
  },
  hero: {
    flex:           1,
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
    justifyContent: "center",
    textAlign:      "center",
    padding:        "80px 24px 60px",
    gap:            20,
  },
  pill: {
    display:        "inline-flex",
    alignItems:     "center",
    gap:            6,
    fontSize:       12,
    padding:        "5px 14px",
    borderRadius:   20,
    background:     "rgba(79,142,247,0.12)",
    color:          "#4f8ef7",
    fontWeight:     500,
  },
  heroTitle: {
    fontSize:   36,
    fontWeight: 500,
    lineHeight: 1.25,
    maxWidth:   520,
    margin:     0,
  },
  heroSub: {
    fontSize:   15,
    color:      "#5a6280",
    maxWidth:   480,
    lineHeight: 1.7,
    margin:     0,
  },
  features: {
    display:             "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap:                 16,
    padding:             "0 32px 64px",
    maxWidth:            900,
    margin:              "0 auto",
    width:               "100%",
  },
  featureCard: {
    background:   "#1a1f2e",
    border:       "0.5px solid rgba(255,255,255,0.07)",
    borderRadius: 12,
    padding:      "20px 16px",
  },
  featureTitle: {
    fontSize:     14,
    fontWeight:   500,
    color:        "#c8cde0",
    marginBottom: 4,
  },
  featureDesc: {
    fontSize:   12,
    color:      "#5a6280",
    lineHeight: 1.5,
  },
  footer: {
    textAlign:    "center",
    padding:      "20px 24px",
    fontSize:     11,
    color:        "#2a3050",
    borderTop:    "0.5px solid rgba(255,255,255,0.05)",
  },
  btnPrimary: {
    background:   "#4f8ef7",
    border:       "none",
    borderRadius: 10,
    padding:      "9px 18px",
    color:        "#fff",
    fontSize:     13,
    fontWeight:   500,
    cursor:       "pointer",
  },
  btnGhost: {
    background:   "transparent",
    border:       "0.5px solid rgba(255,255,255,0.15)",
    borderRadius: 10,
    padding:      "9px 18px",
    color:        "#8b92a8",
    fontSize:     13,
    cursor:       "pointer",
  },
};