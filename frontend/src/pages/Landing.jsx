import { useNavigate } from "react-router-dom";
import { useAuth }     from "../context/AuthContext";
import { useEffect }   from "react";

const FEATURES = [
  {
    icon: "ti-wave-sine",
    color: "#2471A3", 
    title: "ECG en vivo",
    desc:  "500 Hz · filtrado digital con biquads",
  },
  {
    icon: "ti-bell",
    color: "#E67E22", 
    title: "Alertas clínicas",
    desc:  "Bradicardia · taquicardia · arritmia",
  },
  {
    icon: "ti-history",
    color: "#229B46", 
    title: "Historial",
    desc:  "Seguimiento por sesión y evolución",
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate("/dashboard");
  }, [user, navigate]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Roboto+Mono:ital,wght@0,100..700;1,100..700&display=swap');
        
        .lan-page * { box-sizing: border-box; margin: 0; padding: 0; }
        .lan-btn:hover { opacity: 0.95; transform: translateY(-1px); transition: all 0.2s ease; }
        .lan-card-item:hover { border-color: #9ECCE8 !important; box-shadow: 0 4px 12px rgba(15, 61, 92, 0.05) !important; transition: all 0.2s; }
      `}</style>

      <div style={s.page} className="lan-page">
        {/* Navbar Sincronizado */}
        <nav style={s.nav}>
          <div style={s.logo}>
            <div style={s.logoIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, color: "white" }}>
                <path d="M3 12h3l2-6 2 13 2-10 2 3h7" />
              </svg>
            </div>
            <span style={s.logoText}>OndaVital</span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button className="lan-btn" style={s.btnGhost} onClick={() => navigate("/login")}>
              Iniciar sesión
            </button>
            <button className="lan-btn" style={s.btnPrimary} onClick={() => navigate("/register")}>
              Crear cuenta
            </button>
          </div>
        </nav>

        {/* Hero */}
        <section style={s.hero}>
          <div style={s.pill}>
            <i className="ti ti-bluetooth" style={{ fontSize: 12 }} aria-hidden="true" />
            <span>ESP32 · BLE · MIT-BIH</span>
          </div>

          <h1 style={s.heroTitle}>
            Monitoreo cardíaco<br />
            <span style={{ color: "#2471A3" }}>inteligente</span> en tiempo real
          </h1>

          <p style={s.heroSub}>
            Conecta tu ESP32, visualiza tu ECG y obtén análisis clínico
            de tu actividad cardiovascular. Diseñado exclusivamente para bioinstrumentación.
          </p>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginTop: 10 }}>
            <button className="lan-btn" style={{ ...s.btnPrimary, padding: "12px 28px", fontSize: 14 }}
              onClick={() => navigate("/register")}>
              Comenzar ahora
            </button>
            <button className="lan-btn" style={{ ...s.btnGhost, padding: "12px 28px", fontSize: 14, background: "#EBF3FA" }}
              onClick={() => navigate("/monitor")}>
              <i className="ti ti-player-play" style={{ fontSize: 13, marginRight: 6 }} aria-hidden="true" />
              Demo offline
            </button>
          </div>
        </section>

        {/* Features */}
        <section style={s.features}>
          {FEATURES.map((f) => (
            <div key={f.title} style={s.featureCard} className="lan-card-item">
              <div style={{ background: `color-mix(in srgb, ${f.color} 12%, transparent)`, width: 44, height: 44, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <i className={`ti ${f.icon}`} style={{ fontSize: 22, color: f.color }} aria-hidden="true" />
              </div>
              <p style={s.featureTitle}>{f.title}</p>
              <p style={s.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </section>

        {/* Footer */}
        <footer style={s.footer}>
          <p>OndaVital · MIT-BIH Arrhythmia Database · PhysioNet</p>
        </footer>
      </div>
    </>
  );
}

const s = {
  page: {
    background:  "#F0F6FB", // var(--c-bg)
    minHeight:   "100vh",
    fontFamily:  "'Inter', -apple-system, system-ui, sans-serif",
    color:       "#0F3D5C", // var(--c-text)
    display:     "flex",
    flexDirection: "column",
    WebkitFontSmoothing: "antialiased",
  },
  nav: {
    display:        "flex",
    alignItems:     "center",
    justifyContent: "space-between",
    padding:        "0 32px",
    height:         "56px",
    borderBottom:   "1px solid #C5DDF1", // var(--c-border)
    position:       "sticky",
    top:            0,
    background:     "rgba(255, 255, 255, 0.9)",
    backdropFilter: "blur(16px)",
    zIndex:         20,
    boxShadow:      "0 2px 8px rgba(36, 113, 163, 0.04)",
  },
  logo: {
    display:    "flex",
    alignItems: "center",
    gap:        12,
  },
  logoIcon: {
    width:          36,
    height:         36,
    background:     "linear-gradient(135deg, #2471A3, #2E86C1)", // var(--c-accent) a var(--c-info)
    borderRadius:   8,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    boxShadow:      "0 4px 12px rgba(36, 113, 163, 0.25)",
  },
  logoText: {
    fontSize:   17,
    fontWeight: 700,
    color:      "#0F3D5C",
    letterSpacing: "-0.02em",
  },
  hero: {
    flex:           1,
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
    justifyContent: "center",
    textAlign:      "center",
    padding:        "64px 24px", 
    maxWidth:       720,
    margin:         "0 auto",
    gap:            22,
  },
  pill: {
    display:        "inline-flex",
    alignItems:     "center",
    gap:            6,
    fontSize:       11,
    fontFamily:     "'Roboto Mono', monospace",
    padding:        "5px 14px",
    borderRadius:   20,
    background:     "rgba(36, 113, 163, 0.12)",
    color:          "#2471A3",
    fontWeight:     600,
  },
  heroTitle: {
    fontSize:   42,
    fontWeight: 800,
    lineHeight: 1.2,
    letterSpacing: "-0.03em",
    color:      "#0F3D5C",
    margin:     0,
  },
  heroSub: {
    fontSize:   15,
    color:      "#4A7FA7", 
    maxWidth:   540,
    lineHeight: 1.6,
    fontWeight: 500,
    margin:     "4px 0",
  },
  features: {
    display:             "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap:                 20,
    padding:             "0 32px 64px",
    maxWidth:            1000,
    margin:              "0 auto",
    width:               "100%",
  },
  featureCard: {
    background:   "#FFFFFF", 
    border:       "1px solid #C5DDF1",
    borderRadius: 14,
    padding:      "24px",
    boxShadow:    "0 2px 6px rgba(15, 61, 92, 0.02)",
    transition:   "all 0.2s ease",
  },
  featureTitle: {
    fontSize:     15,
    fontWeight:   700,
    color:        "#0F3D5C",
    marginBottom: 6,
  },
  featureDesc: {
    fontSize:   13,
    color:      "#4A7FA7",
    lineHeight: 1.5,
    fontWeight: 500,
  },
  footer: {
    textAlign:    "center",
    padding:      "24px",
    fontSize:     11,
    fontFamily:   "'Roboto Mono', monospace",
    color:        "#4A7FA7",
    borderTop:    "1px solid #C5DDF1",
    background:   "rgba(255, 255, 255, 0.5)",
  },
  btnPrimary: {
    background:   "linear-gradient(135deg, #2471A3, #2E86C1)",
    border:       "none",
    borderRadius: 8,
    padding:      "8px 18px",
    color:        "#fff",
    fontSize:     12,
    fontWeight:   600,
    cursor:       "pointer",
    boxShadow:    "0 3px 12px rgba(36, 113, 163, 0.3)",
  },
  btnGhost: {
    background:   "transparent",
    border:       "1px solid #9ECCE8",
    borderRadius: 8,
    padding:      "8px 18px",
    color:        "#2471A3",
    fontSize:     12,
    fontWeight:   600,
    cursor:       "pointer",
  },
};