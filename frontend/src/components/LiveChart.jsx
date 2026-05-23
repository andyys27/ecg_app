import { useEffect, useRef } from "react";

// Paleta por tema 
const THEMES = {
  terminal: {
    background: "#0a0f0a",
    grid:       "#1a2e1a",
    gridBold:   "#1f3d1f",
    raw:        "#2a6e4a",        // verde apagado para raw
    filtered:   "#00ff88",        // verde brillante para filtrada
    rPeak:      "#ff4444",
    label:      "#4a7a4a",
    divider:    "#1a3d1a",
    glow:       true,
  },
  app: {
    background: "#111827",
    grid:       "rgba(255,255,255,0.03)",
    gridBold:   "rgba(255,255,255,0.06)",
    raw:        "#2a4a7a",        // azul apagado para raw
    filtered:   "#4f8ef7",        // azul brillante para filtrada
    rPeak:      "#e24b4a",
    label:      "#3a4060",
    divider:    "rgba(255,255,255,0.06)",
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
  theme        = "terminal",
}) {
  const COLORS    = THEMES[theme] ?? THEMES.terminal;
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");

    // DPR y ResizeObserver 
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

    // Grilla
    function drawGrid(W, H, yOffset = 0, height = H) {
      ctx.lineWidth   = 0.5;
      ctx.strokeStyle = COLORS.grid;
      for (let x = 0; x < W; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, yOffset); ctx.lineTo(x, yOffset + height); ctx.stroke();
      }
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, yOffset + y); ctx.lineTo(W, yOffset + y); ctx.stroke();
      }
      ctx.lineWidth   = 1;
      ctx.strokeStyle = COLORS.gridBold;
      for (let x = 0; x < W; x += 100) {
        ctx.beginPath(); ctx.moveTo(x, yOffset); ctx.lineTo(x, yOffset + height); ctx.stroke();
      }
      for (let y = 0; y < height; y += 100) {
        ctx.beginPath(); ctx.moveTo(0, yOffset + y); ctx.lineTo(W, yOffset + y); ctx.stroke();
      }
    }

    // Dibujar una senal dentro de un carril 
    function drawSignal({ slice, yOffset, laneH, color, label, peaks = [] }) {
      const n = slice.length;
      if (n < 2) return;

      // Normalizacion independiente por carril
      let minV = Infinity, maxV = -Infinity;
      for (let i = 0; i < n; i++) {
        if (slice[i].ecg < minV) minV = slice[i].ecg;
        if (slice[i].ecg > maxV) maxV = slice[i].ecg;
      }
      const range = maxV - minV || 1;
      const pad   = laneH * 0.1;
      const toY   = (v) => yOffset + laneH - pad - ((v - minV) / range) * (laneH - 2 * pad);

      const W = canvas.getBoundingClientRect().width;

      // Linea de senal
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

      // Picos R 
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
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }

      // Etiqueta del carril
      ctx.fillStyle = COLORS.label;
      ctx.font      = "10px monospace";
      ctx.fillText(label, 8, yOffset + laneH - 6);
    }

    // Linea divisoria entre carriles
    function drawDivider(W, y) {
      ctx.strokeStyle = COLORS.divider;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Loop de dibujo
    function draw() {
      const rect = canvas.getBoundingClientRect();
      const W    = rect.width;
      const H    = rect.height;

      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, W, H);

      const peakTimes = typeof getRPeaks === "function" ? getRPeaks() : [];
      const visS      = (VISIBLE_SAMPLES / fs).toFixed(0);

      if (dualChannel) {
        // Modo dual: raw arriba, filtrada abajo
        const laneH = H / 2;

        // Carril raw
        drawGrid(W, H, 0, laneH);
        const rawBuf   = getBuffer("raw");
        const rawSlice = rawBuf.slice(-VISIBLE_SAMPLES);
        drawSignal({
          slice:   rawSlice,
          yOffset: 0,
          laneH,
          color:   COLORS.raw,
          label:   `RAW · ${visS}s · ${fs} Hz`,
          peaks:   [],    
        });

        // Divisor
        drawDivider(W, laneH);

        // Carril filtrado
        drawGrid(W, H, laneH, laneH);
        const filtBuf   = getBuffer("filtered");
        const filtSlice = filtBuf.slice(-VISIBLE_SAMPLES);
        drawSignal({
          slice:   filtSlice,
          yOffset: laneH,
          laneH,
          color:   COLORS.filtered,
          label:   `FILTRADA · 0.5–40 Hz · notch 60 Hz`,
          peaks:   peakTimes,
        });

      } else {
        // Modo simple: un solo canal
        drawGrid(W, H);
        const buf   = getBuffer(signalType);
        const slice = buf.slice(-VISIBLE_SAMPLES);
        drawSignal({
          slice,
          yOffset: 0,
          laneH:   H,
          color:   signalType === "raw" ? COLORS.raw : COLORS.filtered,
          label:   `${signalType.toUpperCase()} · ${visS}s · ${fs} Hz`,
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
      style={{ width: "100%", height: "100%", borderRadius: "8px", display: "block" }}
    />
  );
}