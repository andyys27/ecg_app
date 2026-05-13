import { useEffect, useRef } from "react";

const THEMES = {
  terminal: {
    background: "#0a0f0a",
    grid:       "#1a2e1a",
    gridBold:   "#1f3d1f",
    signal:     "#00ff88",
    rPeak:      "#ff4444",
    text:       "#4a7a4a",
  },
  app: {
    background: "#111827",
    grid:       "rgba(255,255,255,0.03)",
    gridBold:   "rgba(255,255,255,0.06)",
    signal:     "#4f8ef7",
    rPeak:      "#e24b4a",
    text:       "#3a4060",
  },
};

const VISIBLE_SAMPLES = 1500;
const BUFFER_SIZE     = 2000;

export default function LiveChart({ getBuffer, rPeakIdx = null, theme = "terminal" }) {
  const COLORS    = THEMES[theme] ?? THEMES.terminal;
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");

    function resize() {
      const rect    = canvas.getBoundingClientRect();
      canvas.width  = rect.width  * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resize();
    window.addEventListener("resize", resize);

    function drawGrid(W, H) {
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth   = 0.5;
      for (let x = 0; x < W; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.strokeStyle = COLORS.gridBold;
      ctx.lineWidth   = 1;
      for (let x = 0; x < W; x += 100) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 100) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
    }

    function draw() {
      const W = canvas.getBoundingClientRect().width;
      const H = canvas.getBoundingClientRect().height;

      // 1. Fondo
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, W, H);

      // 2. Grilla
      drawGrid(W, H);

      // 3. Obtener buffer ordenado cronológicamente
      const buffer = getBuffer();
      const slice  = buffer.slice(-VISIBLE_SAMPLES);
      const n      = slice.length;

      if (n < 2) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // 4. Normalizar al rango vertical
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < n; i++) {
        if (slice[i].ecg < min) min = slice[i].ecg;
        if (slice[i].ecg > max) max = slice[i].ecg;
      }
      const range   = max - min || 1;
      const padding = H * 0.1;
      const toY = (v) => H - padding - ((v - min) / range) * (H - 2 * padding);

      // 5. Dibujar señal
      ctx.beginPath();
      ctx.strokeStyle = COLORS.signal;
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = COLORS.signal;
      ctx.shadowBlur  = theme === "terminal" ? 4 : 0;

      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * W;
        const y = toY(slice[i].ecg);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 6. Marcar R-peak por índice del buffer
      if (rPeakIdx !== null) {
        // El buffer ordenado empieza en writeIdx y termina en writeIdx-1
        // slice son los últimos VISIBLE_SAMPLES del buffer ordenado
        // Necesitamos encontrar qué posición del slice corresponde a rPeakIdx

        // Calcular el índice global en el buffer ordenado
        // getBuffer() devuelve [...buf.slice(writeIdx), ...buf.slice(0, writeIdx)]
        // La posición de rPeakIdx en ese array ordenado es:
        const currentWriteIdx = (rPeakIdx) % BUFFER_SIZE;

        // Posición en el array ordenado: cuántas posiciones antes del writeIdx actual
        // está el pico. Necesitamos el writeIdx actual — lo estimamos como
        // el índice justo después del último elemento del buffer ordenado.
        // Como getBuffer se llama en cada frame, estimamos que el writeIdx
        // actual es rPeakIdx y buscamos su posición relativa en el slice.

        // Forma simple y robusta: buscar en el slice el elemento con t más
        // cercano al pico usando el índice de escritura como referencia.
        // El pico cayó en rPeakIdx, que en el array ordenado está en:
        // posición = (BUFFER_SIZE - (writeIdx_actual - rPeakIdx)) % BUFFER_SIZE
        // Como no tenemos writeIdx_actual aquí, usamos una aproximación:
        // el pico siempre está cerca del final del slice visible.

        // Buscar en el último 20% del slice (donde siempre cae el pico más reciente)
        const searchStart = Math.floor(n * 0.75);
        let peakX = null, peakY = null, peakEcg = -Infinity;

        for (let i = searchStart; i < n; i++) {
          if (slice[i].ecg > peakEcg) {
            peakEcg = slice[i].ecg;
            peakX   = (i / (n - 1)) * W;
            peakY   = toY(slice[i].ecg);
          }
        }

        if (peakX !== null) {
          ctx.fillStyle = COLORS.rPeak;
          ctx.beginPath();
          ctx.arc(peakX, peakY, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 7. Label inferior
      ctx.fillStyle = COLORS.text;
      ctx.font      = "11px monospace";
      ctx.fillText(`${(VISIBLE_SAMPLES / 500).toFixed(0)}s  |  500 Hz`, 10, H - 8);

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [getBuffer, rPeakIdx, theme]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width:        "100%",
        height:       "100%",
        borderRadius: "8px",
        display:      "block",
      }}
    />
  );
}