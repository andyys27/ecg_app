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
    <div style={s.page}>
      <div style={s.card}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div style={s.logoIcon}>
            <i className="ti ti-activity" style={{ fontSize: 20, color: "#fff" }} aria-hidden="true" />
          </div>
          <span style={{ fontSize: 16, fontWeight: 500, color: "#e8eaf0" }}>CardioSense</span>
        </div>

        <h1 style={s.title}>Bienvenido de nuevo</h1>
        <p style={s.sub}>Inicia sesión para continuar</p>

        {/* Tab selector visual (decorativo, el register es otra ruta) */}
        <div style={s.tabRow}>
          <div style={{ ...s.tab, ...s.tabActive }}>Iniciar sesión</div>
          <div style={s.tab} onClick={() => navigate("/register")}>Registrarse</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={s.label}>Correo electrónico</label>
            <input
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
              style={s.input}
              type="password"
              name="password"
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
              required
            />
            <div style={{ textAlign: "right", marginTop: 6 }}>
              <span style={{ fontSize: 11, color: "#4f8ef7", cursor: "pointer" }}>
                ¿Olvidaste tu contraseña?
              </span>
            </div>
          </div>

          {error && (
            <div style={s.errorBox}>
              <i className="ti ti-alert-circle" style={{ fontSize: 14 }} aria-hidden="true" />
              {error}
            </div>
          )}

          <button style={s.btnPrimary} type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Iniciar sesión"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 12, color: "#5a6280", marginTop: 20 }}>
          ¿No tienes cuenta?{" "}
          <Link to="/register" style={{ color: "#4f8ef7", textDecoration: "none" }}>
            Regístrate gratis
          </Link>
        </p>
      </div>
    </div>
  );
}

const s = {
  page: {
    background:     "#0d1117",
    minHeight:      "100vh",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    fontFamily:     "var(--font-sans, system-ui, sans-serif)",
    padding:        "24px",
  },
  card: {
    background:   "#111318",
    border:       "0.5px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding:      "32px 28px",
    width:        "100%",
    maxWidth:     420,
  },
  logoIcon: {
    width:          40,
    height:         40,
    background:     "#4f8ef7",
    borderRadius:   10,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
  },
  title: {
    fontSize:     20,
    fontWeight:   500,
    color:        "#e8eaf0",
    marginBottom: 4,
  },
  sub: {
    fontSize:     13,
    color:        "#5a6280",
    marginBottom: 20,
  },
  tabRow: {
    display:       "flex",
    background:    "#1a1f2e",
    borderRadius:  10,
    padding:       4,
    marginBottom:  24,
  },
  tab: {
    flex:           1,
    textAlign:      "center",
    padding:        "7px 0",
    fontSize:       13,
    color:          "#5a6280",
    borderRadius:   7,
    cursor:         "pointer",
  },
  tabActive: {
    background: "#2a3050",
    color:      "#e8eaf0",
    fontWeight: 500,
  },
  label: {
    display:      "block",
    fontSize:     11,
    color:        "#5a6280",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontWeight:   500,
  },
  input: {
    width:        "100%",
    background:   "#1c2030",
    border:       "0.5px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding:      "10px 12px",
    color:        "#e8eaf0",
    fontSize:     14,
    outline:      "none",
    boxSizing:    "border-box",
  },
  errorBox: {
    display:      "flex",
    alignItems:   "center",
    gap:          8,
    background:   "rgba(226,75,74,0.1)",
    border:       "0.5px solid rgba(226,75,74,0.3)",
    borderRadius: 8,
    padding:      "10px 12px",
    fontSize:     13,
    color:        "#e24b4a",
  },
  btnPrimary: {
    width:        "100%",
    background:   "#4f8ef7",
    border:       "none",
    borderRadius: 10,
    padding:      "12px",
    color:        "#fff",
    fontSize:     14,
    fontWeight:   500,
    cursor:       "pointer",
    marginTop:    4,
  },
};