// src/hooks/useBluetooth.js
import { useState, useRef, useCallback } from "react";

const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const BUFFER_SIZE = 2000;

export function useBluetooth() {
    const bufferRef = useRef(Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
    const writeIdxRef = useRef(0);
    const rPeakTimesRef = useRef([]);
    const [metrics, setMetrics] = useState({
        bpm: "--",
        color: "NONE",
        min: 0,
        max: 0,
        lastRPeak: null,
        connected: false,
        sampleCount: 0,
        mode: "bluetooth",
    });

    const deviceRef = useRef(null);
    const sampleCountRef = useRef(0);

    // Handler de datos entrantes por BLE
    const handleNotification = useCallback((event) => {
        const decoder = new TextDecoder();
        const raw = decoder.decode(event.target.value);

        let data;
        try { data = JSON.parse(raw); }
        catch { return; }

        const bpmValue = Number(data.bpm ?? NaN);
        const baseTime = typeof data.t === "number" ? data.t : Date.now();
        const sampleInterval = 1000 / 300; // 300 Hz (ECG)

        let lastPeak = null;
        // Si el ESP32 envía la señal completa en 'ecg' la guardamos en el buffer
        if (Array.isArray(data.ecg)) {
            const ecgSamples = data.ecg;
            ecgSamples.forEach((sample, i) => {
                const idx = writeIdxRef.current;
                bufferRef.current[idx] = {
                    t: baseTime + i * sampleInterval,
                    ecg: Number(sample) || 0,
                };
                writeIdxRef.current = (idx + 1) % BUFFER_SIZE;
            });
            sampleCountRef.current += ecgSamples.length;
        }
        // Si el ESP32 envía picos detectados en 'rpeaks', los incorporamos al registro de picos
        else if (Array.isArray(data.rpeaks)) {
            const peaks = data.rpeaks.map((p) => Number(p)).filter((n) => !isNaN(n));
            if (peaks.length > 0) {
                // Mantener una lista de tiempos de R-peaks (ms)
                rPeakTimesRef.current = [...rPeakTimesRef.current, ...peaks].slice(-200);
                lastPeak = peaks[peaks.length - 1];
            }
        }

        setMetrics((prev) => ({
            ...prev,
            bpm:         bpmValue > 0 ? Math.round(bpmValue) : prev.bpm,
            color:       typeof data.color === "string" ? data.color : prev.color,
            min:         typeof data.min === "number" ? data.min : prev.min,
            max:         typeof data.max === "number" ? data.max : prev.max,
            lastRPeak:   lastPeak ?? prev.lastRPeak,
            sampleCount: sampleCountRef.current,
        }));
    }, []);

    // Conectar al ESP32 por BLE (requiere gesto del usuario → botón)
    const connect = useCallback(async () => {
        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ name: "ESP32-Equipo2" }],
                optionalServices: [SERVICE_UUID],
            });

            deviceRef.current = device;
            device.addEventListener("gattserverdisconnected", () => {
                setMetrics((prev) => ({ ...prev, connected: false }));
            });

            const server  = await device.gatt.connect();
            const service = await server.getPrimaryService(SERVICE_UUID);
            const char    = await service.getCharacteristic(CHARACTERISTIC_UUID);

            await char.startNotifications();
            char.addEventListener("characteristicvaluechanged", handleNotification);

            setMetrics((prev) => ({ ...prev, connected: true }));
            console.log("[BLE] Conectado a", device.name);

        } catch (err) {
            console.error("[BLE] Error:", err);
        }
    }, [handleNotification]);

    const disconnect = useCallback(() => {
        if (deviceRef.current?.gatt.connected) {
            deviceRef.current.gatt.disconnect();
        }
        setMetrics((prev) => ({ ...prev, connected: false }));
    }, []);

    const getBuffer = useCallback(() => {
        const buf = bufferRef.current;
        const idx = writeIdxRef.current;
        return [...buf.slice(idx), ...buf.slice(0, idx)];
    }, []);

    return { metrics, getBuffer, connect, disconnect };
}