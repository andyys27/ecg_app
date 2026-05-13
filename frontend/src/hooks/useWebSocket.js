import { useState, useEffect, useRef, useCallback } from "react";

const BUFFER_SIZE = 2000;
const ESP32_IP    = "192.168.1.100";
const WS_URL      = `ws://${ESP32_IP}:81`;

export function useWebSocket(enabled = true) {
  const bufferRef     = useRef(Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
  const writeIdxRef   = useRef(0);
  const sampleCountRef = useRef(0);
  const rPeakTimesRef = useRef([]);
  const wsRef         = useRef(null);

  const [metrics, setMetrics] = useState({
    bpm:        "--",
    lastRPeak:  null,
    rPeakIdx:   null,
    connected:  false,
    sampleCount: 0,
  });

  const handleMessage = useCallback((event) => {
    let data;
    try { data = JSON.parse(event.data); }
    catch { return; }

    // Escribir en buffer circular
    const idx = writeIdxRef.current;
    bufferRef.current[idx] = { t: data.t, ecg: data.ecg };
    writeIdxRef.current    = (idx + 1) % BUFFER_SIZE;
    sampleCountRef.current++;

    // Registrar R-peak con índice exacto del buffer
    let newRPeakIdx = null;
    if (data.rPeak && data.bpm > 30 && data.bpm < 220) {
      rPeakTimesRef.current.push(data.t);
      if (rPeakTimesRef.current.length > 10)
        rPeakTimesRef.current.shift();
      newRPeakIdx = writeIdxRef.current;
    }

    // Throttle a ~60fps
    if (sampleCountRef.current % 8 === 0) {
      let avgBpm = "--";
      const peaks = rPeakTimesRef.current;
      if (peaks.length >= 2) {
        const intervals = [];
        for (let i = 1; i < peaks.length; i++)
          intervals.push(peaks[i] - peaks[i - 1]);
        const avgRR = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        avgBpm = Math.round(60000 / avgRR);
      }

      setMetrics((prev) => ({
        ...prev,
        bpm:         avgBpm,
        lastRPeak:   data.rPeak ? data.t : prev.lastRPeak,
        rPeakIdx:    newRPeakIdx ?? prev.rPeakIdx,
        sampleCount: sampleCountRef.current,
      }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let reconnectTimeout;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WS] Conectado al ESP32");
        setMetrics((prev) => ({ ...prev, connected: true }));
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        console.warn("[WS] Desconectado, reintentando en 2s...");
        setMetrics((prev) => ({ ...prev, connected: false }));
        reconnectTimeout = setTimeout(connect, 2000);
      };

      ws.onerror = (err) => {
        console.error("[WS] Error:", err);
        ws.close();
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, [handleMessage, enabled]);

  const getBuffer = useCallback(() => {
    const buf = bufferRef.current;
    const idx = writeIdxRef.current;
    return [...buf.slice(idx), ...buf.slice(0, idx)];
  }, []);

  return { metrics, getBuffer };
}