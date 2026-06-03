import { useState }    from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth }     from "../context/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [form,    setForm]    = useState({ email: "", password: "" });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(form);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message ?? "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Inyección de estilos globales de la marca e interactividad */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Roboto+Mono:wght@500&display=swap');
        
        .log-page * { box-sizing: border-box; margin: 0; padding: 0; }
        .log-input:focus { border-color: #2471A3 !important; box-shadow: 0 0 0 3px rgba(36, 113, 163, 0.12) !important; }
        .log-btn:hover { opacity: 0.95; transform: translateY(-0.5px); }
        .log-btn:active { transform: translateY(0); }
        .log-link:hover { text-decoration: underline !important; color: #1a5276 !important; }
      `}</style>

      <div style={s.page} className="log-page">
        <div style={s.card}>
          {/* Logo Sincronizado */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div style={s.logoIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, color: "white" }}>
                <path d="M3 12h3l2-6 2 13 2-10 2 3h7" />
              </svg>
            </div>
            <span style={{ fontSize: 17, fontWeight: 700, color: "#0F3D5C", letterSpacing: "-0.02em" }}>
              OndaVital
            </span>
          </div>

          <h1 style={s.title}>Bienvenido de nuevo</h1>
          <p style={s.sub}>Inicia sesión para continuar al panel clínico</p>

          {/* Selector de pestañas optimizado */}
          <div style={s.tabRow}>
            <div style={{ ...s.tab, ...s.tabActive }}>Iniciar sesión</div>
            <div style={s.tab} onClick={() => navigate("/register")}>Registrarse</div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={s.label}>Correo electrónico</label>
              <input
                className="log-input"
                style={s.input}
                type="email"
                name="email"
                placeholder="usuario@email.com"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label style={s.label}>Contraseña</label>
              <input
                className="log-input"
                style={s.input}
                type="password"
                name="password"
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange}
                required
              />
              <div style={{ textAlign: "right", marginTop: 8 }}>
                <span className="log-link" style={{ fontSize: 12, color: "#2471A3", cursor: "pointer", fontWeight: 500 }}>
                  ¿Olvidaste tu contraseña?
                </span>
              </div>
            </div>

            {error && (
              <div style={s.errorBox}>
                <i className="ti ti-alert-circle" style={{ fontSize: 15, marginTop: 1 }} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <button className="log-btn" style={s.btnPrimary} type="submit" disabled={loading}>
              {loading ? "Autenticando..." : "Iniciar sesión"}
            </button>
          </form>

          <p style={{ textAlign: "center", fontSize: 13, color: "#4A7FA7", marginTop: 24, fontWeight: 500 }}>
            ¿No tienes cuenta?{" "}
            <Link to="/register" className="log-link" style={{ color: "#2471A3", textDecoration: "none", fontWeight: 600 }}>
              Regístrate gratis
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}

// Estilos Reestructurados (Paleta Clara e Inter)
const s = {
  page: {
    background:     "#F0F6FB", // var(--c-bg)
    minHeight:      "100vh",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    fontFamily:     "'Inter', -apple-system, system-ui, sans-serif",
    padding:        "24px",
    WebkitFontSmoothing: "antialiased",
  },
  card: {
    background:   "#FFFFFF", // var(--c-surface)
    border:       "1px solid #C5DDF1", // var(--c-border)
    borderRadius: 16,
    padding:      "36px 32px",
    width:        "100%",
    maxWidth:     400,
    boxShadow:    "0 8px 24px rgba(15, 61, 92, 0.04)",
  },
  logoIcon: {
    width:          38,
    height:         38,
    background:     "linear-gradient(135deg, #2471A3, #2E86C1)", // var(--c-accent)
    borderRadius:   8,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    boxShadow:      "0 3px 10px rgba(36, 113, 163, 0.2)",
  },
  title: {
    fontSize:     22,
    fontWeight:   800,
    color:        "#0F3D5C", // var(--c-text)
    letterSpacing: "-0.02em",
    marginBottom: 4,
  },
  sub: {
    fontSize:     14,
    color:        "#4A7FA7", // var(--c-muted)
    fontWeight:   500,
    marginBottom: 24,
  },
  tabRow: {
    display:       "flex",
    background:    "#EBF3FA",
    borderRadius:  8,
    padding:       4,
    marginBottom:  24,
  },
  tab: {
    flex:           1,
    textAlign:      "center",
    padding:        "8px 0",
    fontSize:       13,
    color:          "#4A7FA7",
    fontWeight:     600,
    borderRadius:   6,
    cursor:         "pointer",
    transition:     "all 0.15s ease",
  },
  tabActive: {
    background: "#FFFFFF",
    color:      "#0F3D5C",
    boxShadow:  "0 2px 6px rgba(15, 61, 92, 0.06)",
  },
  label: {
    display:       "block",
    fontSize:      11,
    color:         "#0F3D5C",
    marginBottom:  6,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontWeight:    700,
  },
  input: {
    width:        "100%",
    background:   "#FFFFFF",
    border:       "1px solid #C5DDF1",
    borderRadius: 8,
    padding:      "11px 14px",
    color:        "#0F3D5C",
    fontSize:     14,
    fontWeight:   500,
    outline:      "none",
    transition:   "all 0.15s ease",
  },
  errorBox: {
    display:      "flex",
    alignItems:   "center",
    gap:          10,
    background:   "rgba(231, 76, 60, 0.08)", // Tono clínico suave para errores
    border:       "1px solid rgba(231, 76, 60, 0.2)",
    borderRadius: 8,
    padding:      "12px",
    fontSize:     13,
    color:        "#C0392B",
    fontWeight:   500,
    lineHeight:   1.4,
  },
  btnPrimary: {
    width:        "100%",
    background:   "linear-gradient(135deg, #2471A3, #2E86C1)",
    border:       "none",
    borderRadius: 8,
    padding:      "13px",
    color:        "#FFFFFF",
    fontSize:     14,
    fontWeight:   600,
    cursor:       "pointer",
    boxShadow:    "0 4px 12px rgba(36, 113, 163, 0.25)",
    transition:   "all 0.2s ease",
    marginTop:    4,
  },
};