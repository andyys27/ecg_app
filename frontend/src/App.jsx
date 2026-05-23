import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

// Páginas
import Landing   from "./pages/Landing";
import Login     from "./pages/Login";
import Register  from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Monitor   from "./pages/Monitor";

// Ruta protegida — redirige a login si no hay sesión
function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ background: "#0a0f0a", minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#00ff88", fontFamily: "monospace" }}>
      Cargando...
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/"         element={<Landing />} />
      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/dashboard" element={
        <PrivateRoute><Dashboard /></PrivateRoute>
      }/>
      <Route path="/monitor" element={
        <PrivateRoute><Monitor /></PrivateRoute>
      }/>
    </Routes>
  );
}