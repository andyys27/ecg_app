import { useEffect, useRef } from "react";

// ── Paleta por tema (Sincronizada con las variables CSS de Monitor) ──
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
    background: "#0e0e10",                 // Mismo fondo de la página (--c-bg)
    grid:       "rgba(255, 255, 255, 0.02)", // Microgrilla sutil médica
    gridBold:   "rgba(255, 255, 255, 0.05)", // Subdivisiones principales
    raw:        "rgba(124, 109, 250, 0.35)", // Azul/violeta atenuado para el ADC crudo
    filtered:   "#a594fb",                 // Violeta brillante de instrumentación (--c-accent2)
    rPeak:      "#f87171",                 // Rojo coral síncrono (--c-danger)
    label:      "#707088",                 // Texto secundario (--c-muted)
    timeLabel:  "#3a3a44",                 // Ejes de tiempo discretos (--c-faint)
    divider:    "#2a2a32",                 // Borde de separación segmentado (--c-border)
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
  theme        = "app", // Cambiado por defecto a "app" para acoplarse al monitor
}) {
  const COLORS    = THEMES[theme] ?? THEMES.app;
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");

    // DPR y ResizeObserver para alta densidad de píxeles (Retina/4K)
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

    // Grilla Médica / Milimetrada Estilo Osciloscopio
    function drawGrid(W, H, yOffset = 0, height = H) {
      // 1. Líneas horizontales estáticas (Eje Y / Amplitud)
      ctx.lineWidth   = 0.5;
      ctx.strokeStyle = COLORS.grid;
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, yOffset + y); ctx.lineTo(W, yOffset + y); ctx.stroke();
      }
      ctx.lineWidth   = 1;
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
        ctx.lineWidth   = isBold ? 1 : 0.5;
        ctx.strokeStyle = isBold ? COLORS.gridBold : COLORS.grid;

        ctx.beginPath();
        ctx.moveTo(x, yOffset);
        ctx.lineTo(x, yOffset + height);
        ctx.stroke();

        // Marcas de tiempo en la base de cada carril
        if (isBold && i > 0 && i < totalSteps) {
          ctx.fillStyle = COLORS.timeLabel;
          // Se usa tipografía monospace limpia emparejada con el CSS del monitor
          ctx.font      = "9px 'DM Mono', monospace";
          ctx.textAlign = "center";
          ctx.fillText(`${currentSec.toFixed(0)}s`, x, yOffset + height - 8);
        }
      }
      ctx.textAlign = "left";
    }

    // Renderizado continuo de vectores ECG
    function drawSignal({ slice, yOffset, laneH, color, label, peaks = [] }) {
      const n = slice.length;
      if (n < 2) return;

      // Normalización auto-escalable independiente por carril (Previene saturación visual)
      let minV = Infinity, maxV = -Infinity;
      for (let i = 0; i < n; i++) {
        if (slice[i].ecg < minV) minV = slice[i].ecg;
        if (slice[i].ecg > maxV) maxV = slice[i].ecg;
      }
      const range = maxV - minV || 1;
      const pad   = laneH * 0.15; // Padding vertical de seguridad para picos altos (complejos QRS)
      const toY   = (v) => yOffset + laneH - pad - ((v - minV) / range) * (laneH - 2 * pad);

      const W = canvas.getBoundingClientRect().width;

      // Dibujo de la traza de señal continua
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.5;
      if (COLORS.glow) { ctx.shadowColor = color; ctx.shadowBlur = 4; }
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * W;
        const y = toY(slice[i].ecg);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Inyección de Marcadores R-Peak (Clasificación del Algoritmo DSP)
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
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }

      // Etiquetas informativas de hardware del carril
      ctx.fillStyle = COLORS.label;
      ctx.font      = "500 10px 'DM Sans', system-ui, sans-serif";
      ctx.fillText(label, 12, yOffset + 18);
    }

    // Línea divisoria segmentada en modo multicanal
    function drawDivider(W, y) {
      ctx.strokeStyle = COLORS.divider;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Render loop síncrono (60fps acoplado a la GPU)
    function draw() {
      const rect = canvas.getBoundingClientRect();
      const W    = rect.width;
      const H    = rect.height;

      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, W, H);

      const peakTimes = typeof getRPeaks === "function" ? getRPeaks() : [];
      const visS      = (VISIBLE_SAMPLES / fs).toFixed(0);

      if (dualChannel) {
        // Modo dual: Señal Cruda (Carril Superior), Procesada/Filtrada (Carril Inferior)
        const laneH = H / 2;

        // 1. Carril RAW (ADC Directo)
        drawGrid(W, H, 0, laneH);
        const rawBuf   = getBuffer("raw");
        const rawSlice = rawBuf.slice(-VISIBLE_SAMPLES);
        drawSignal({
          slice:   rawSlice,
          yOffset: 0,
          laneH,
          color:   COLORS.raw,
          label:   `CANAL 01 [RAW_DATA] · SWEEP: ${visS}s · SR: ${fs}Hz`,
          peaks:   [], // La señal cruda no lleva marcadores para contrastar efectividad    
        });

        // Separación sutil física de carriles
        drawDivider(W, laneH);

        // 2. Carril FILTRADO (Pipeline DSP)
        drawGrid(W, H, laneH, laneH);
        const filtBuf   = getBuffer("filtered");
        const filtSlice = filtBuf.slice(-VISIBLE_SAMPLES);
        drawSignal({
          slice:   filtSlice,
          yOffset: laneH,
          laneH,
          color:   COLORS.filtered,
          label:   `CANAL 02 [FILTRADO_DSP] · BPF: 0.5–40 Hz · NOTCH: 60 Hz`,
          peaks:   peakTimes, // Inyecta picos en tiempo real detectados sobre la señal limpia
        });

      } else {
        // Modo monocanal simple full-screen
        drawGrid(W, H);
        const buf   = getBuffer(signalType);
        const slice = buf.slice(-VISIBLE_SAMPLES);
        drawSignal({
          slice,
          yOffset: 0,
          laneH:   H,
          color:   signalType === "raw" ? COLORS.raw : COLORS.filtered,
          label:   `${signalType.toUpperCase()} MONITOR · TIMELINE: ${visS}s · MUESTREO: ${fs} Hz`,
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