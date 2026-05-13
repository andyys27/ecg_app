// src/hooks/useBluetooth.js
import { useState, useRef, useCallback } from "react";

const SERVICE_UUID        = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const BUFFER_SIZE         = 2000;

export function useBluetooth() {
    const bufferRef    = useRef(Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
    const writeIdxRef  = useRef(0);
    const rPeakTimesRef = useRef([]);

    const [metrics, setMetrics] = useState({
        bpm: "--", ppm: "--",
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
        const raw     = decoder.decode(event.target.value);

        let data;
        try { data = JSON.parse(raw); }
        catch { return; }

        // Escribir en buffer circular
        const idx = writeIdxRef.current;
        bufferRef.current[idx] = { t: data.t, ecg: data.ecg ?? 0 };
        writeIdxRef.current = (idx + 1) % BUFFER_SIZE;
        sampleCountRef.current++;

        // Actualizar métricas cada notificación (ya viene throttleado desde el ESP32)
        setMetrics((prev) => ({
            ...prev,
            ppm:         data.ppm > 0 ? Math.round(data.ppm) : prev.ppm,
            bpm:         data.ppm > 0 ? Math.round(data.ppm) : prev.bpm,
            sampleCount: sampleCountRef.current,
        }));
    }, []);

    // Conectar al ESP32 por BLE (requiere gesto del usuario → botón)
    const connect = useCallback(async () => {
        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ name: "ECG-ESP32" }],
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