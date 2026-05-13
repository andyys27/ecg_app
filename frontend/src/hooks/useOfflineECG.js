import { useState, useEffect, useRef, useCallback } from "react";

const BUFFER_SIZE   = 2000;
const OFFLINE_FS    = 360;
const PLAYBACK_RATE = 1.0;

export function useOfflineECG(csvPath) {
  const bufferRef     = useRef(Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
  const writeIdxRef   = useRef(0);
  const samplesRef    = useRef([]);
  const playIdxRef    = useRef(0);
  const intervalRef   = useRef(null);
  const rPeakTimesRef = useRef([]);
  const peakIdxRef    = useRef(null);

  const [metrics, setMetrics] = useState({
    bpm:        "--",
    lastRPeak:  null,
    rPeakIdx:   null,
    connected:  false,
    sampleCount: 0,
    mode:       "offline",
  });

  // ── Cargar CSV ───────────────────────────────────────
  useEffect(() => {
    fetch(csvPath)
      .then((res) => {
        if (!res.ok) throw new Error(`No se pudo cargar ${csvPath}`);
        return res.text();
      })
      .then((text) => {
        const lines   = text.trim().split("\n");
        const samples = [];
        for (let i = 1; i < lines.length; i++) {
          const [t, v] = lines[i].split(",").map(Number);
          if (!isNaN(t) && !isNaN(v))
            samples.push({ t: t * 1000, ecg: v });
        }
        samplesRef.current = samples;
        setMetrics((prev) => ({ ...prev, connected: true }));
        console.log(`[Offline] ${samples.length} muestras cargadas de ${csvPath}`);
      })
      .catch((err) => console.error("[Offline] Error cargando CSV:", err));
  }, [csvPath]);

  // ── Simular streaming ────────────────────────────────
  useEffect(() => {
    const intervalMs = (1000 / OFFLINE_FS) / PLAYBACK_RATE;
    let sampleCount  = 0;

    intervalRef.current = setInterval(() => {
      const samples = samplesRef.current;
      if (samples.length === 0) return;

      const sample = samples[playIdxRef.current];
      playIdxRef.current = (playIdxRef.current + 1) % samples.length;

      const idx = writeIdxRef.current;
      bufferRef.current[idx] = { t: sample.t, ecg: sample.ecg };
      writeIdxRef.current    = (idx + 1) % BUFFER_SIZE;
      sampleCount++;

      detectRPeak(sample);

      if (sampleCount % 6 === 0) {
        const avgBpm = calcBpm(rPeakTimesRef.current);
        setMetrics((prev) => ({
          ...prev,
          bpm:        avgBpm,
          sampleCount: prev.sampleCount + 6,
          lastRPeak:  rPeakTimesRef.current.at(-1) ?? prev.lastRPeak,
          rPeakIdx:   peakIdxRef.current,
        }));
      }
    }, intervalMs);

    return () => clearInterval(intervalRef.current);
  }, []);

  // ── Pan-Tompkins con calentamiento ───────────────────
  const ptStateRef = useRef({
    prev:      0,
    sum:       0,
    win:       new Array(22).fill(0),
    head:      0,
    thresh:    0,
    lastPeakT: 0,
    warmup:    130,   // ignora las primeras ~360ms
  });

  function detectRPeak(sample) {
    const s     = ptStateRef.current;
    const deriv = sample.ecg - s.prev;
    s.prev      = sample.ecg;
    const sq    = deriv * deriv;

    // Ventana integradora
    s.sum        -= s.win[s.head];
    s.win[s.head] = sq;
    s.sum        += sq;
    s.head        = (s.head + 1) % s.win.length;
    const integrated = s.sum / s.win.length;

    // Calentamiento: calibra umbral sin detectar
    if (s.warmup > 0) {
      s.warmup--;
      if (integrated > s.thresh) s.thresh = integrated * 0.75;
      return;
    }

    s.thresh *= 0.99;

    const now = sample.t;
    if (integrated > s.thresh && (now - s.lastPeakT) > 250) {
      rPeakTimesRef.current.push(now);
      if (rPeakTimesRef.current.length > 10)
        rPeakTimesRef.current.shift();
      s.lastPeakT        = now;
      s.thresh           = integrated * 0.75;
      peakIdxRef.current = writeIdxRef.current;  // índice exacto del pico
    }
  }

  function calcBpm(peaks) {
    if (peaks.length < 2) return "--";
    const intervals = [];
    for (let i = 1; i < peaks.length; i++)
      intervals.push(peaks[i] - peaks[i - 1]);
    const avgRR = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return Math.round(60000 / avgRR);
  }

  // ── Mismo interfaz que useWebSocket ─────────────────
  const getBuffer = useCallback(() => {
    const buf = bufferRef.current;
    const idx = writeIdxRef.current;
    return [...buf.slice(idx), ...buf.slice(0, idx)];
  }, []);

  return { metrics, getBuffer };
}