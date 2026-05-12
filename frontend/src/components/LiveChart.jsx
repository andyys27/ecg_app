import { useEffect, useRef } from "react";

// Colores del tema (estilo monitor clínico)
const COLORS = {
  background: "#0a0f0a",
  grid:       "#1a2e1a",
  signal:     "#00ff88",
  rPeak:      "#ff4444",
  text:       "#4a7a4a",
};

// Cuántas muestras mostrar en pantalla (las últimas N del buffer)
const VISIBLE_SAMPLES = 1500; // 3 segundos a 500 Hz

export default function LiveChart({ getBuffer, lastRPeak }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);  // ID del requestAnimationFrame activo

  useEffect(() => {
    const canvas  = canvasRef.current;
    const ctx     = canvas.getContext("2d");

    // Ajustar resolución del canvas al tamaño real en pantalla (para pantallas HiDPI)
    function resize() {
      const rect    = canvas.getBoundingClientRect();
      canvas.width  = rect.width  * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resize();
    window.addEventListener("resize", resize);

    // ── Función de dibujo principal ──────────────────────
    function draw() {
      const W = canvas.getBoundingClientRect().width;
      const H = canvas.getBoundingClientRect().height;

      // 1. Limpiar fondo
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, W, H);

      // 2. Dibujar grilla (estilo papel milimetrado ECG)
      drawGrid(ctx, W, H);

      // 3. Obtener las últimas VISIBLE_SAMPLES muestras del buffer
      const buffer  = getBuffer();
      const slice   = buffer.slice(-VISIBLE_SAMPLES);
      const n       = slice.length;
      if (n < 2) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // 4. Normalizar la señal al rango vertical del canvas
      //    Encontrar min/max dinámico de las muestras visibles
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < n; i++) {
        if (slice[i].ecg < min) min = slice[i].ecg;
        if (slice[i].ecg > max) max = slice[i].ecg;
      }
      const range   = max - min || 1;  // evitar división por cero
      const padding = H * 0.1;         // 10% de margen arriba y abajo

      // Función para mapear valor ECG → coordenada Y en canvas
      const toY = (v) =>
        H - padding - ((v - min) / range) * (H - 2 * padding);

      // 5. Dibujar la señal
      ctx.beginPath();
      ctx.strokeStyle = COLORS.signal;
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = COLORS.signal;
      ctx.shadowBlur  = 4;  // efecto glow sutil

      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * W;
        const y = toY(slice[i].ecg);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 6. Marcar picos R
      //    Buscar en el slice las muestras cuyo timestamp coincide con un pico reciente
      if (lastRPeak) {
        ctx.fillStyle = COLORS.rPeak;
        for (let i = 0; i < n; i++) {
          // Consideramos pico si el timestamp está dentro de ±10 ms del lastRPeak
          if (Math.abs(slice[i].t - lastRPeak) < 10) {
            const x = (i / (n - 1)) * W;
            const y = toY(slice[i].ecg);
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 7. Timestamp en esquina (debug útil para la presentación)
      ctx.fillStyle  = COLORS.text;
      ctx.font       = "11px monospace";
      ctx.fillText(`${VISIBLE_SAMPLES / 500}s  |  500 Hz`, 10, H - 8);

      rafRef.current = requestAnimationFrame(draw);
    }

    // ── Grilla estilo papel ECG ───────────────────────────
    function drawGrid(ctx, W, H) {
      // Cuadrícula pequeña cada 20px
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth   = 0.5;
      for (let x = 0; x < W; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      // Líneas gruesas cada 100px (grandes cuadrados del papel ECG)
      ctx.strokeStyle = "#1f3d1f";
      ctx.lineWidth   = 1;
      for (let x = 0; x < W; x += 100) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 100) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
    }

    // Arrancar el loop de animación
    rafRef.current = requestAnimationFrame(draw);

    // Cleanup: cancelar el loop al desmontar el componente
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [getBuffer, lastRPeak]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width:        "100%",
        height:       "220px",
        borderRadius: "8px",
        display:      "block",
      }}
    />
  );
}