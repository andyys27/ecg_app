import { useEffect, useRef } from "react";

// Paleta por tema 
const THEMES = {
  terminal: {
    background: "#0a0f0a",
    grid:       "#1a2e1a",
    gridBold:   "#1f3d1f",
    raw:        "#2a6e4a",        
    filtered:   "#00ff88",       
    rPeak:      "#ff4444",
    label:      "#4a7a4a",
    timeLabel:  "#2a6e4a",
    divider:    "#1a3d1a",
    glow:       true,
  },
  app: {
    background: "#F8FBFE",                 
    grid:       "rgba(41, 113, 163, 0.08)",
    gridBold:   "rgba(41, 113, 163, 0.15)",
    raw:        "rgba(79, 172, 254, 0.4)",
    filtered:   "#2471A3",                 
    rPeak:      "#E67E22",                 
    label:      "#2E5C8A",                 
    timeLabel:  "#5499C7",                 
    divider:    "rgba(41, 113, 163, 0.12)",                 
    glow:       false,
  },
};

const VISIBLE_SAMPLES = 1500;   // ≈ 5 s a 300 Hz

export default function LiveChart({
  getBuffer,
  getRPeaks,
  signalType   = "filtered",
  dualChannel  = false,
  fs           = 300,
  theme        = "app", 
}) {
  const COLORS    = THEMES[theme] ?? THEMES.app;
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");

    // DPR y ResizeObserver para alta densidad de píxeles 
    function resize() {
      const rect    = canvas.getBoundingClientRect();
      canvas.width  = rect.width  * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Grilla Médica 
    function drawGrid(W, H, yOffset = 0, height = H) {
      // 1. Líneas horizontales estáticas (Eje Y / Amplitud)
      ctx.lineWidth   = 0.6;
      ctx.strokeStyle = COLORS.grid;
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, yOffset + y); ctx.lineTo(W, yOffset + y); ctx.stroke();
      }
      ctx.lineWidth   = 1.2;
      ctx.strokeStyle = COLORS.gridBold;
      for (let y = 0; y < height; y += 100) {
        ctx.beginPath(); ctx.moveTo(0, yOffset + y); ctx.lineTo(W, yOffset + y); ctx.stroke();
      }

      // 2. Líneas verticales (Eje X / Tiempo Dinámico)
      const totalSeconds = VISIBLE_SAMPLES / fs;
      const stepSec = 0.5;
      const totalSteps = totalSeconds / stepSec;

      for (let i = 0; i <= totalSteps; i++) {
        const currentSec = i * stepSec;
        const x = (currentSec / totalSeconds) * W;

        const isBold = currentSec % 1.0 === 0;
        ctx.lineWidth   = isBold ? 1.2 : 0.6;
        ctx.strokeStyle = isBold ? COLORS.gridBold : COLORS.grid;

        ctx.beginPath();
        ctx.moveTo(x, yOffset);
        ctx.lineTo(x, yOffset + height);
        ctx.stroke();      
      }
      ctx.textAlign = "left";
    }

    // Renderizado continuo de vectores ECG
    function drawSignal({ slice, yOffset, laneH, color, label, peaks = [] }) {
      const n = slice.length;
      if (n < 2) return;

      // Normalización auto-escalable independiente por carril 
      let minV = Infinity, maxV = -Infinity;
      for (let i = 0; i < n; i++) {
        if (slice[i].ecg < minV) minV = slice[i].ecg;
        if (slice[i].ecg > maxV) maxV = slice[i].ecg;
      }
      const range = maxV - minV || 1;
      const pad   = laneH * 0.15; // Padding vertical de seguridad para picos altos (complejos QRS)
      const toY   = (v) => yOffset + laneH - pad - ((v - minV) / range) * (laneH - 2 * pad);

      const W = canvas.getBoundingClientRect().width;

      // Dibujo de la traza de senal continua
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      if (COLORS.glow) { ctx.shadowColor = color; ctx.shadowBlur = 4; }
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * W;
        const y = toY(slice[i].ecg);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Inyección de Marcadores R-Peak 
      if (peaks.length > 0 && slice[0].t > 0) {
        const tStart = slice[0].t;
        const tEnd   = slice[n - 1].t;
        const tSpan  = tEnd - tStart || 1;

        ctx.fillStyle = COLORS.rPeak;
        if (COLORS.glow) { ctx.shadowColor = COLORS.rPeak; ctx.shadowBlur = 6; }

        for (const pt of peaks) {
          if (pt < tStart || pt > tEnd) continue;
          const xRatio    = (pt - tStart) / tSpan;
          const px        = xRatio * W;
          const approxIdx = Math.min(Math.round(xRatio * (n - 1)), n - 1);
          const py        = toY(slice[approxIdx]?.ecg ?? 0);
          
          // Círculo del pico R localizado
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fill();
          
          // Anillo alrededor del pico para mejor visibilidad
          ctx.strokeStyle = COLORS.rPeak;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px, py, 6, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }

      // Etiquetas informativas de hardware del carril
      ctx.fillStyle = COLORS.label;
      ctx.font      = "600 11px 'DM Sans', system-ui, sans-serif";
      ctx.fillText(label, 12, yOffset + 18);
    }

    function drawDivider(W, y) {
      ctx.strokeStyle = COLORS.divider;
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([5, 7]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Render loop síncrono
    function draw() {
      const rect = canvas.getBoundingClientRect();
      const W    = rect.width;
      const H    = rect.height;

      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, W, H);

      const peakTimes = typeof getRPeaks === "function" ? getRPeaks() : [];
      const visS      = (VISIBLE_SAMPLES / fs).toFixed(0);

      if (dualChannel) {
        const laneH = H / 2;

        // 1. Carril RAW 
        drawGrid(W, H, 0, laneH);
        const rawBuf   = getBuffer("raw");
        const rawSlice = rawBuf.slice(-VISIBLE_SAMPLES);
        drawSignal({
          slice:   rawSlice,
          yOffset: 0,
          laneH,
          color:   COLORS.raw,
          label:   `CANAL 01 [SEÑAL CRUDA] · BARRIDO: ${visS}s · SR: ${fs}Hz`,
          peaks:   [], 
        });

        drawDivider(W, laneH);

        // 2. Carril FILTRADO 
        drawGrid(W, H, laneH, laneH);
        const filtBuf   = getBuffer("filtered");
        const filtSlice = filtBuf.slice(-VISIBLE_SAMPLES);
        drawSignal({
          slice:   filtSlice,
          yOffset: laneH,
          laneH,
          color:   COLORS.filtered,
          label:   `CANAL 02 [SEÑAL FILTRADA] · FILTRO PASA-BANDA: 0.5–45 Hz · NOTCH: 60 Hz`,
          peaks:   peakTimes, 
        });
      } 

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };

  }, [getBuffer, getRPeaks, signalType, dualChannel, fs, theme]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}