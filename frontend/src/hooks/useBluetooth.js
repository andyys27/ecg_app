// useBluetooth.js
import { useState, useRef, useCallback } from "react";

const BUFFER_SIZE = 3000;
const FS = 300;
const SAMPLE_TIME = 1000 / FS;

// ⚠️ Configura los UUIDs que use tu ESP32 en su código de Bluetooth BLE
const BLE_SERVICE_UUID = "6e400001-b5a3-f393-e0a2-e4326c1153e1"; // UART Service común
const BLE_CHAR_UUID    = "6e400003-b5a3-f393-e0a2-e4326c1153e1"; // TX Characteristic

export function useBluetooth() {
  const rawBufRef = useRef(new Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
  const filtBufRef = useRef(new Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
  const writeIdxRef = useRef(0);
  const sampleCountRef = useRef(0);
  const rPeakTimesRef = useRef([]);

  const globalBeatsRef = useRef(0);
  const beatsOffsetRef = useRef(0);

  const wsRef = useRef(null);
  const bleDeviceRef = useRef(null);

  const [metrics, setMetrics] = useState({
    bpm: "--",
    color: "NONE",
    rr_interval: "--",
    total_beats: 0,
    lastRPeak: null,
    connected: false, // Será verdadero solo cuando WS y BLE estén listos
    sampleCount: 0,
    mode: "websocket",
  });

  // Maneja la respuesta limpia devuelta por la nube
  const handlePacket = useCallback((packet) => {
    const idx = writeIdxRef.current;
    const lastIdx = (idx - 1 + BUFFER_SIZE) % BUFFER_SIZE;
    const lastT = rawBufRef.current[lastIdx]?.t || Date.now();
    const currentT = lastT + SAMPLE_TIME;

    rawBufRef.current[idx] = { t: currentT, ecg: Number(packet.raw) || 0 };
    filtBufRef.current[idx] = { t: currentT, ecg: Number(packet.filtered) || 0 };

    writeIdxRef.current = (idx + 1) % BUFFER_SIZE;
    sampleCountRef.current += 1;

    if (packet.total_beats !== undefined) globalBeatsRef.current = packet.total_beats;
    if (packet.is_r_peak === true) rPeakTimesRef.current = [...rPeakTimesRef.current, currentT].slice(-50);

    if (sampleCountRef.current % 15 === 0 || packet.is_r_peak === true) {
      const bpmValue = Number(packet.bpm ?? NaN);
      setMetrics((prev) => ({
        ...prev,
        bpm: !isNaN(bpmValue) ? (bpmValue > 0 ? Math.round(bpmValue) : 0) : prev.bpm,
        color: typeof packet.color === "string" ? packet.color : prev.color,
        rr_interval: packet.rr_interval !== undefined ? packet.rr_interval : prev.rr_interval,
        total_beats: packet.total_beats !== undefined ? Math.max(0, packet.total_beats - beatsOffsetRef.current) : prev.total_beats,
        lastRPeak: packet.is_r_peak ? currentT : prev.lastRPeak,
        sampleCount: sampleCountRef.current,
      }));
    }
  }, []);

  const resetSessionBeats = useCallback(() => {
    beatsOffsetRef.current = globalBeatsRef.current;
  }, []);

  // 1. Conectar al WebSocket de la Nube
  const connectWS = useCallback((url) => {
    return new Promise((resolve, reject) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return resolve();

      console.log("[Nube] Abriendo puente WebSocket...");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[Nube] WebSocket conectado con éxito.");
        resolve();
      };
      ws.onmessage = (event) => {
        try {
          handlePacket(json.parse(event.data));
        } catch (e) {}
      };
      ws.onerror = (err) => reject(err);
      ws.onclose = () => {
        setMetrics((prev) => ({ ...prev, connected: false, bpm: "--", color: "NONE" }));
      };
    });
  }, [handlePacket]);

  // 2. Conectar al dispositivo Bluetooth físico del usuario (Browser API)
  const connectBluetooth = useCallback(async () => {
    try {
      console.log("[WebBluetooth] Buscando sensores cercanos...");
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true, // Cambiar por filters: [{ name: 'TuDispositivo' }] si deseas restringirlo
        optionalServices: [BLE_SERVICE_UUID]
      });

      bleDeviceRef.current = device;
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(BLE_SERVICE_UUID);
      const characteristic = await service.getCharacteristic(BLE_CHAR_UUID);

      device.ongattserverdisconnected = () => {
        console.warn("[WebBluetooth] Sensor desconectado.");
        setMetrics((prev) => ({ ...prev, connected: false }));
      };

      // Escuchar las ráfagas de datos que mande el dispositivo físico
      await characteristic.startNotifications();
      characteristic.addEventListener("characteristicvaluechanged", (event) => {
        const value = event.target.value;
        
        // Decodificación de texto plano (si el ESP32 manda strings tipo "2344\n")
        const decoder = new TextDecoder("utf-8");
        const chunk = decoder.decode(value).trim();
        
        const parts = chunk.split(",");
        const rawVal = parts.length === 2 ? parseFloat(parts[1]) : parseFloat(parts[0]);

        if (!isNaN(rawVal)) {
          // RETRANSMISIÓN INMEDIATA A LA NUBE PARA SU FILTRADO
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ raw: rawVal }));
          }
        }
      });

      setMetrics((prev) => ({ ...prev, connected: true }));
      console.log("[WebBluetooth] Enlace completo: Sensor -> Navegador -> Nube activado.");

    } catch (err) {
      console.error("[WebBluetooth] Error en emparejamiento:", err);
      if (wsRef.current) wsRef.current.close();
      throw err;
    }
  }, []);

  const disconnectAll = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    if (bleDeviceRef.current?.gatt.connected) bleDeviceRef.current.gatt.disconnect();
    setMetrics((prev) => ({ ...prev, connected: false, bpm: "--", color: "NONE" }));
  }, []);

  const getBuffer = useCallback((type = "filtered") => {
    const buf = type === "raw" ? rawBufRef.current : filtBufRef.current;
    const idx = writeIdxRef.current;
    return [...buf.slice(idx), ...buf.slice(0, idx)];
  }, []);

  const getRPeaks = useCallback(() => [...rPeakTimesRef.current], []);

  return {
    metrics, getBuffer, getRPeaks,
    connectWS, connectBluetooth, disconnectAll, resetSessionBeats,
  };
}