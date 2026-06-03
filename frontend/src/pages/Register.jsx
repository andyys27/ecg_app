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

  // Paso 1
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

  // Registro final
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
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Roboto+Mono:wght@500&display=swap');
        
        .reg-page * { box-sizing: border-box; margin: 0; padding: 0; }
        .reg-input:focus { border-color: #2471A3 !important; box-shadow: 0 0 0 3px rgba(36, 113, 163, 0.12) !important; }
        .reg-btn:hover { opacity: 0.95; transform: translateY(-0.5px); transition: all 0.2s ease; }
        .reg-btn:active { transform: translateY(0); }
        .reg-link:hover { text-decoration: underline !important; color: #1a5276 !important; }
      `}</style>

      <div style={s.page} className="reg-page">
        <div style={s.card}>
          {/* Logo Sincronizado */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
            <div style={s.logoIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, color: "white" }}>
                <path d="M3 12h3l2-6 2 13 2-10 2 3h7" />
              </svg>
            </div>
            <span style={{ fontSize: 17, fontWeight: 700, color: "#0F3D5C", letterSpacing: "-0.02em" }}>OndaVital</span>
          </div>

          {/* Stepper */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 28 }}>
            {STEPS.map((label, i) => (
              <div key={label} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : 0 }}>
                <div style={{
                  width:          24,
                  height:         24,
                  borderRadius:   "50%",
                  background:     i <= step ? "linear-gradient(135deg, #2471A3, #2E86C1)" : "#EBF3FA",
                  border:         i <= step ? "none" : "1px solid #C5DDF1",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  fontSize:       11,
                  fontFamily:     "'Roboto Mono', monospace",
                  color:          i <= step ? "#FFFFFF" : "#4A7FA7",
                  fontWeight:     600,
                  flexShrink:     0,
                  boxShadow:      i === step ? "0 2px 6px rgba(36, 113, 163, 0.25)" : "none"
                }}>
                  {i < step ? <i className="ti ti-check" style={{ fontSize: 11 }} /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{
                    flex:       1,
                    height:     2,
                    background: i < step ? "#2471A3" : "#C5DDF1",
                    margin:     "0 8px",
                  }} />
                )}
              </div>
            ))}
          </div>

          {/* Paso 0: Cuenta */}
          {step === 0 && (
            <>
              <h1 style={s.title}>Crear cuenta</h1>
              <p style={s.sub}>Paso 1 de 2 · Datos de credenciales</p>
              <form onSubmit={handleStep1} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Field label="Nombre completo" name="nombre" placeholder="Juan Pérez"
                  value={form.nombre} onChange={handleChange} required />
                <Field label="Correo electrónico" name="email" type="email"
                  placeholder="correo@ejemplo.com" value={form.email} onChange={handleChange} required />
                <Field label="Contraseña" name="password" type="password"
                  placeholder="Mínimo 8 caracteres" value={form.password} onChange={handleChange} required />
                <Field label="Confirmar contraseña" name="confirmPassword" type="password"
                  placeholder="Repite la contraseña" value={form.confirmPassword} onChange={handleChange} required />
                
                {error && <ErrorBox msg={error} />}
                <button className="reg-btn" style={s.btnPrimary} type="submit">Continuar</button>
              </form>
              <p style={{ textAlign: "center", fontSize: 13, color: "#4A7FA7", marginTop: 24, fontWeight: 500 }}>
                ¿Ya tienes cuenta?{" "}
                <Link to="/login" className="reg-link" style={{ color: "#2471A3", textDecoration: "none", fontWeight: 600 }}>Inicia sesión</Link>
              </p>
            </>
          )}

          {/* Paso 1: Perfil médico */}
          {step === 1 && (
            <>
              <h1 style={s.title}>Perfil médico</h1>
              <p style={s.sub}>Paso 2 de 2 · Estos datos personalizan tu análisis clínico</p>
              <form onSubmit={handleStep2} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Edad" name="edad" type="number" placeholder="25"
                    value={form.edad} onChange={handleChange} />
                  <div>
                    <label style={s.label}>Sexo</label>
                    <select className="reg-input" name="sexo" value={form.sexo} onChange={handleChange} style={s.input}>
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
                  background:   "rgba(46, 134, 193, 0.08)",
                  border:       "1px solid rgba(46, 134, 193, 0.2)",
                  borderRadius: 8,
                  padding:      "12px",
                  fontSize:     12,
                  color:        "#2E86C1",
                  lineHeight:   1.5,
                  fontWeight:   500,
                  display:      "flex",
                  alignItems:   "flex-start",
                  gap:          8
                }}>
                  <i className="ti ti-lock" style={{ fontSize: 14, marginTop: 1 }} aria-hidden="true" />
                  <span>Tus datos médicos son privados y se procesan de forma local para personalización opcional.</span>
                </div>

                {error && <ErrorBox msg={error} />}
                <div style={{ display: "flex", gap: 12 }}>
                  <button className="reg-btn" type="button" style={s.btnGhost}
                    onClick={() => { setStep(0); setError(""); }}>
                    Atrás
                  </button>
                  <button className="reg-btn" type="submit" style={s.btnPrimary} disabled={loading}>
                    {loading ? "Creando cuenta..." : "Crear cuenta"}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Paso 2: Confirmación */}
          {step === 2 && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{
                width:          56,
                height:         56,
                background:     "rgba(34, 155, 70, 0.1)",
                border:         "1px solid rgba(34, 155, 70, 0.25)",
                borderRadius:   "50%",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                margin:         "0 auto 20px",
                boxShadow:      "0 4px 12px rgba(34, 155, 70, 0.1)"
              }}>
                <i className="ti ti-check" style={{ fontSize: 26, color: "#229B46" }} aria-hidden="true" />
              </div>
              <h1 style={{ ...s.title, marginBottom: 8 }}>¡Cuenta creada!</h1>
              <p style={{ ...s.sub, marginBottom: 24 }}>
                Revisa tu bandeja de entrada para confirmar tu correo,<br />
                luego inicia sesión en la plataforma.
              </p>
              <button className="reg-btn" style={s.btnPrimary} onClick={() => navigate("/login")}>
                Ir a iniciar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Componentes auxiliares perfectamente adaptados
function Field({ label, name, type = "text", placeholder, value, onChange, required }) {
  return (
    <div>
      <label style={s.label}>{label}</label>
      <input className="reg-input" style={s.input} type={type} name={name} placeholder={placeholder}
        value={value} onChange={onChange} required={required} />
    </div>
  );
}

function ErrorBox({ msg }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "rgba(231, 76, 60, 0.08)", border: "1px solid rgba(231, 76, 60, 0.2)",
      borderRadius: 8, padding: "12px", fontSize: 13, color: "#C0392B", fontWeight: 500,
    }}>
      <i className="ti ti-alert-circle" style={{ fontSize: 15 }} aria-hidden="true" />
      <span>{msg}</span>
    </div>
  );
}

const s = {
  page: {
    background: "#F0F6FB",
    minHeight: "100vh",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Inter', -apple-system, system-ui, sans-serif", padding: "24px",
    WebkitFontSmoothing: "antialiased",
  },
  card: {
    background: "#FFFFFF",
    border: "1px solid #C5DDF1", 
    borderRadius: 16, padding: "36px 32px", width: "100%", maxWidth: 440,
    boxShadow: "0 8px 24px rgba(15, 61, 92, 0.04)",
  },
  logoIcon: {
    width: 38, height: 38, background: "linear-gradient(135deg, #2471A3, #2E86C1)", borderRadius: 8,
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 3px 10px rgba(36, 113, 163, 0.2)",
  },
  title: { fontSize: 22, fontWeight: 800, color: "#0F3D5C", letterSpacing: "-0.02em", marginBottom: 4 },
  sub:   { fontSize: 14, color: "#4A7FA7", fontWeight: 500, marginBottom: 20 },
  label: {
    display: "block", fontSize: 11, color: "#0F3D5C",
    marginBottom: 6, textTransform: "uppercase",
    letterSpacing: "0.05em", fontWeight: 700,
  },
  input: {
    width: "100%", background: "#FFFFFF",
    border: "1px solid #C5DDF1",
    borderRadius: 8, padding: "11px 14px",
    color: "#0F3D5C", fontSize: 14, fontWeight: 500, outline: "none", boxSizing: "border-box",
    transition: "all 0.15s ease",
  },
  btnPrimary: {
    flex: 1, width: "100%", background: "linear-gradient(135deg, #2471A3, #2E86C1)", border: "none",
    borderRadius: 8, padding: "13px", color: "#FFFFFF",
    fontSize: 14, fontWeight: 600, cursor: "pointer",
    boxShadow: "0 4px 12px rgba(36, 113, 163, 0.25)",
  },
  btnGhost: {
    flex: 1, background: "transparent",
    border: "1px solid #9ECCE8",
    borderRadius: 8, padding: "13px", color: "#2471A3",
    fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
};