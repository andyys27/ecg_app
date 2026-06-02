import { useState, useRef, useCallback } from "react";

const BUFFER_SIZE = 3000;
const FS = 300;
const SAMPLE_TIME = 1000 / FS;

export function useBluetooth() {
  // Buffers circulares
  const rawBufRef = useRef(new Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
  const filtBufRef = useRef(new Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
  const writeIdxRef = useRef(0);
  const sampleCountRef = useRef(0);
  const rPeakTimesRef = useRef([]);

  // Gestión de offsets de beats entre sesiones
  const globalBeatsRef = useRef(0);
  const beatsOffsetRef = useRef(0);

  const wsRef = useRef(null);

  const [metrics, setMetrics] = useState({
    bpm: "--",
    color: "NONE",
    rr_interval: "--",
    total_beats: 0,
    lastRPeak: null,
    connected: false,
    sampleCount: 0,
    mode: "websocket",
  });

  // Pipeline de procesamiento en tiempo real
  const handlePacket = useCallback((packet) => {
    const idx = writeIdxRef.current;

    // Generación de base de tiempo lineal continua
    const lastIdx = (idx - 1 + BUFFER_SIZE) % BUFFER_SIZE;
    const lastT = rawBufRef.current[lastIdx]?.t || Date.now();
    const currentT = lastT + SAMPLE_TIME;

    // Inserción directa en buffers circulares (O(1))
    rawBufRef.current[idx] = { t: currentT, ecg: Number(packet.raw) || 0 };
    filtBufRef.current[idx] = { t: currentT, ecg: Number(packet.filtered) || 0 };

    writeIdxRef.current = (idx + 1) % BUFFER_SIZE;
    sampleCountRef.current += 1;

    // Guardamos el conteo global absoluto del backend
    if (packet.total_beats !== undefined) {
      globalBeatsRef.current = packet.total_beats;
    }

    // Marcador de picos R
    if (packet.is_r_peak === true) {
      rPeakTimesRef.current = [...rPeakTimesRef.current, currentT].slice(-50);
    }

    // Throttling de UI
    if (sampleCountRef.current % 15 === 0 || packet.is_r_peak === true) {
      const bpmValue = Number(packet.bpm ?? NaN);

      setMetrics((prev) => ({
        ...prev,
        // BPM: mostrar el valor actual del JSON, incluso si es 0
        bpm:
          !isNaN(bpmValue)
            ? bpmValue > 0
              ? Math.round(bpmValue)
              : 0
            : prev.bpm,
        color: typeof packet.color === "string" ? packet.color : prev.color,
        rr_interval:
          packet.rr_interval !== undefined ? packet.rr_interval : prev.rr_interval,
        // total_beats: aplicar offset para que comience en 0 al iniciar sesión
        total_beats:
          packet.total_beats !== undefined
            ? Math.max(0, packet.total_beats - beatsOffsetRef.current)
            : prev.total_beats,
        lastRPeak: packet.is_r_peak ? currentT : prev.lastRPeak,
        sampleCount: sampleCountRef.current,
      }));
    }
  }, []);

  // Resetear offset de beats (se llama desde Monitor al iniciar sesión)
  const resetSessionBeats = useCallback(() => {
    beatsOffsetRef.current = globalBeatsRef.current;
    console.log(
      `[ResetBeats] Offset establecido a ${beatsOffsetRef.current}, próximo total_beats mostrará 0`
    );
  }, []);

  // Conexión y ciclo de vida del WebSocket
  const connectWS = useCallback(
    (url = "ws://localhost:8000/ws") => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      console.log("[WS] Intentando conectar a:", url);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setMetrics((prev) => ({ ...prev, connected: true, mode: "websocket" }));
        console.log("[WS] Canal de instrumentación abierto.");
      };

      ws.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          handlePacket(packet);
        } catch (e) {
          // Ignora errores de parseo
        }
      };

      ws.onclose = () => {
        setMetrics((prev) => ({
          ...prev,
          connected: false,
          bpm: "--",
          color: "NONE",
        }));
        console.log("[WS] Canal cerrado.");
      };

      ws.onerror = (err) => {
        console.error("[WS] Error crítico de red:", err);
      };
    },
    [handlePacket]
  );

  const disconnectWS = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setMetrics((prev) => ({
      ...prev,
      connected: false,
      bpm: "--",
      color: "NONE",
    }));
  }, []);

  // Extracción segura de datos ordenados para el canvas del LiveChart
  const getBuffer = useCallback((type = "filtered") => {
    const buf = type === "raw" ? rawBufRef.current : filtBufRef.current;
    const idx = writeIdxRef.current;
    return [...buf.slice(idx), ...buf.slice(0, idx)];
  }, []);

  const getRPeaks = useCallback(() => [...rPeakTimesRef.current], []);

  return {
    metrics,
    getBuffer,
    getRPeaks,
    connectWS,
    disconnectWS,
    resetSessionBeats,
  };
}