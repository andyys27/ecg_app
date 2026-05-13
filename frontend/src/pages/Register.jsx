import { useState }         from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth }          from "../context/AuthContext";

const STEPS = ["Cuenta", "Perfil médico", "Listo"];

export default function Register() {
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const [step,    setStep]    = useState(0);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    nombre: "", email: "", password: "", confirmPassword: "",
    edad: "", sexo: "", peso_kg: "", altura_cm: "",
  });

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // Paso 1 → Paso 2
  function handleStep1(e) {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (form.password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    setStep(1);
  }

  // Paso 2 → Registro final
  async function handleStep2(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signUp({
        email:      form.email,
        password:   form.password,
        nombre:     form.nombre,
        edad:       parseInt(form.edad) || null,
        sexo:       form.sexo || null,
        peso_kg:    parseFloat(form.peso_kg) || null,
        altura_cm:  parseFloat(form.altura_cm) || null,
      });
      setStep(2);
    } catch (err) {
      setError(err.message ?? "Error al crear la cuenta");
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

        {/* Stepper */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
          {STEPS.map((label, i) => (
            <div key={label} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : 0 }}>
              <div style={{
                width:          22,
                height:         22,
                borderRadius:   "50%",
                background:     i <= step ? "#4f8ef7" : "#1a1f2e",
                border:         i <= step ? "none" : "0.5px solid rgba(255,255,255,0.15)",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                fontSize:       11,
                color:          i <= step ? "#fff" : "#5a6280",
                fontWeight:     500,
                flexShrink:     0,
              }}>
                {i < step
                  ? <i className="ti ti-check" style={{ fontSize: 12 }} aria-hidden="true" />
                  : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div style={{
                  flex:       1,
                  height:     1.5,
                  background: i < step ? "#4f8ef7" : "rgba(255,255,255,0.08)",
                  margin:     "0 6px",
                }} />
              )}
            </div>
          ))}
        </div>

        {/* ── Paso 0: Cuenta ── */}
        {step === 0 && (
          <>
            <h1 style={s.title}>Crear cuenta</h1>
            <p style={s.sub}>Paso 1 de 2 · Datos de acceso</p>
            <form onSubmit={handleStep1} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <Field label="Nombre completo" name="nombre" placeholder="Juan Pérez"
                value={form.nombre} onChange={handleChange} required />
              <Field label="Correo electrónico" name="email" type="email"
                placeholder="correo@ejemplo.com" value={form.email} onChange={handleChange} required />
              <Field label="Contraseña" name="password" type="password"
                placeholder="Mínimo 8 caracteres" value={form.password} onChange={handleChange} required />
              <Field label="Confirmar contraseña" name="confirmPassword" type="password"
                placeholder="Repite la contraseña" value={form.confirmPassword} onChange={handleChange} required />
              {error && <ErrorBox msg={error} />}
              <button style={s.btnPrimary} type="submit">Continuar</button>
            </form>
            <p style={{ textAlign: "center", fontSize: 12, color: "#5a6280", marginTop: 20 }}>
              ¿Ya tienes cuenta?{" "}
              <Link to="/login" style={{ color: "#4f8ef7", textDecoration: "none" }}>Inicia sesión</Link>
            </p>
          </>
        )}

        {/* ── Paso 1: Perfil médico ── */}
        {step === 1 && (
          <>
            <h1 style={s.title}>Perfil médico</h1>
            <p style={s.sub}>Paso 2 de 2 · Estos datos personalizan tu análisis clínico</p>
            <form onSubmit={handleStep2} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Edad" name="edad" type="number" placeholder="25"
                  value={form.edad} onChange={handleChange} />
                <div>
                  <label style={s.label}>Sexo</label>
                  <select name="sexo" value={form.sexo} onChange={handleChange} style={s.input}>
                    <option value="">Seleccionar</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <Field label="Peso (kg)" name="peso_kg" type="number"
                  placeholder="70" value={form.peso_kg} onChange={handleChange} />
                <Field label="Altura (cm)" name="altura_cm" type="number"
                  placeholder="170" value={form.altura_cm} onChange={handleChange} />
              </div>

              <div style={{
                background:   "rgba(79,142,247,0.07)",
                border:       "0.5px solid rgba(79,142,247,0.2)",
                borderRadius: 8,
                padding:      "10px 12px",
                fontSize:     12,
                color:        "#5a7aaa",
                lineHeight:   1.5,
              }}>
                <i className="ti ti-lock" style={{ fontSize: 13, marginRight: 6 }} aria-hidden="true" />
                Tus datos médicos son privados y solo se usan para personalizar el análisis. Puedes omitir cualquier campo.
              </div>

              {error && <ErrorBox msg={error} />}
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" style={s.btnGhost}
                  onClick={() => { setStep(0); setError(""); }}>
                  Atrás
                </button>
                <button type="submit" style={s.btnPrimary} disabled={loading}>
                  {loading ? "Creando cuenta..." : "Crear cuenta"}
                </button>
              </div>
            </form>
          </>
        )}

        {/* ── Paso 2: Confirmación ── */}
        {step === 2 && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{
              width:          56,
              height:         56,
              background:     "rgba(79,199,164,0.12)",
              border:         "0.5px solid rgba(79,199,164,0.3)",
              borderRadius:   "50%",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              margin:         "0 auto 16px",
            }}>
              <i className="ti ti-check" style={{ fontSize: 28, color: "#4fc7a4" }} aria-hidden="true" />
            </div>
            <h1 style={{ ...s.title, marginBottom: 8 }}>¡Cuenta creada!</h1>
            <p style={{ ...s.sub, marginBottom: 24 }}>
              Revisa tu correo para confirmar tu cuenta,<br />
              luego inicia sesión.
            </p>
            <button style={s.btnPrimary} onClick={() => navigate("/login")}>
              Ir a iniciar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Componentes auxiliares ─────────────────────────────
function Field({ label, name, type = "text", placeholder, value, onChange, required }) {
  return (
    <div>
      <label style={s.label}>{label}</label>
      <input style={s.input} type={type} name={name} placeholder={placeholder}
        value={value} onChange={onChange} required={required} />
    </div>
  );
}

function ErrorBox({ msg }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: "rgba(226,75,74,0.1)", border: "0.5px solid rgba(226,75,74,0.3)",
      borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#e24b4a",
    }}>
      <i className="ti ti-alert-circle" style={{ fontSize: 14 }} aria-hidden="true" />
      {msg}
    </div>
  );
}

// ── Estilos ────────────────────────────────────────────
const s = {
  page: {
    background: "#0d1117", minHeight: "100vh",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "var(--font-sans, system-ui, sans-serif)", padding: "24px",
  },
  card: {
    background: "#111318", border: "0.5px solid rgba(255,255,255,0.08)",
    borderRadius: 16, padding: "32px 28px", width: "100%", maxWidth: 440,
  },
  logoIcon: {
    width: 40, height: 40, background: "#4f8ef7", borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 20, fontWeight: 500, color: "#e8eaf0", marginBottom: 4 },
  sub:   { fontSize: 13, color: "#5a6280", marginBottom: 20 },
  label: {
    display: "block", fontSize: 11, color: "#5a6280",
    marginBottom: 6, textTransform: "uppercase",
    letterSpacing: "0.06em", fontWeight: 500,
  },
  input: {
    width: "100%", background: "#1c2030",
    border: "0.5px solid rgba(255,255,255,0.1)",
    borderRadius: 8, padding: "10px 12px",
    color: "#e8eaf0", fontSize: 14, outline: "none", boxSizing: "border-box",
  },
  btnPrimary: {
    flex: 1, width: "100%", background: "#4f8ef7", border: "none",
    borderRadius: 10, padding: "12px", color: "#fff",
    fontSize: 14, fontWeight: 500, cursor: "pointer",
  },
  btnGhost: {
    flex: 1, background: "transparent",
    border: "0.5px solid rgba(255,255,255,0.15)",
    borderRadius: 10, padding: "12px", color: "#8b92a8",
    fontSize: 14, cursor: "pointer",
  },
};