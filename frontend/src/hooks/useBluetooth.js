// VERIFICAR LA FLUIDEZ DE LA APLICACION EN FRONTEND PARA VER SI CAMBIAR A UTILIZAR MUESTRA A MUESTRA EN LUGAR DE VENTANAS

import { useState, useRef, useCallback, use } from "react";

// Constantes
const BUFFER_SIZE = 3000;   // 300 Hz x 10 s
const FS          = 300;    // Debe coincidir con ECG_FS del backend

export function useBluetooth() {
    // Buffers circulares
    const rawBufRef      = useRef(new Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
    const filtBufRef     = useRef(new Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
    const writeIdxRef    = useRef(0);
    const sampleCountRef = useRef(0);

    const bleFragmentRef = useRef("");

    // Picos R acumulados (timestamps en ms)
    const rPeakTimesRef = useRef([]);
    
    const deviceRef = useRef(null);
    const wsRef     = useRef(null);     // WebSocket al backend Python

    const [metrics, setMetrics] = useState({
        bpm:         "--",
        color:       "NONE",
        min:         0,
        max:         0,
        lastRPeak:   null,
        connected:   false,
        sampleCount: 0,
        mode:        "websocket", // "websocket | ble-direct"
    });

    // Procesador de paquetes del backend
    const handlePacket = useCallback((packet) => {
        // Snapshot inicial al conectarse
        if (packet.type === "snapshot") {
            const raw  = packet.raw      ?? [];
            const filt = packet.filtered ?? [];
            const len  = Math.min(raw.length, filt.length);

            // Re poblar el buffer circular hacia atras
            const now = Date.now();
            const sampleInterval = 1000 / FS;

            for (let i = 0; i < len; i++) {
                const idx = writeIdxRef.current;
                const tEst = now - (len - i) * sampleInterval;
                rawBufRef.current[idx]  = { t: tEst, ecg: Number(raw[i])  || 0 };
                filtBufRef.current[idx] = { t: tEst, ecg: Number(filt[i]) || 0 };
                writeIdxRef.current = (idx + 1) % BUFFER_SIZE;
            }
            sampleCountRef.current += len;
            return;
        }

        // Paquete normal de ventana
        const raw   = packet.raw      ?? [];
        const filt  = packet.filtered ?? [];
        const peaks = packet.peaks    ?? [];

        const baseT = typeof packet.t === "number" ? packet.t : Date.now();
        const sampleInterval = 1000 / FS    // ms entre muestras

        // Volcar la ventana completa en el buffer circular
        const len = Math.min(raw.length, filt.length);
        for (let i = 0; i < len; i++) {
            const idx = writeIdxRef.current
            rawBufRef.current[idx] = {
                t:   baseT + i * sampleInterval,
                ecg: Number(raw[i]) || 0,
            };
            filtBufRef.current[idx] = {
                t:   baseT + i * sampleInterval,
                ecg: Number(filt[i]) || 0,
            };
            writeIdxRef.current = (idx + 1) % BUFFER_SIZE;
        }
        sampleCountRef.current += len;

        // Convertir indices de picos a timestamps 
        if (peaks.length > 0) {
            const peakTime = peaks.map(idx => baseT + idx * sampleInterval);
            rPeakTimesRef.current = [...rPeakTimesRef.current, ...peakTime].slice(-50);
        }

        const bpmValue = Number(packet.bpm ?? NaN);

        setMetrics(prev => ({
            ...prev,
            bpm:         bpmValue > 0 ? Math.round(bpmValue) : prev.bpm,
            color:       typeof packet.color === "string" ? packet.color : prev.color,
            min:         typeof packet.color === "number" ? packet.min : prev.min,
            max:         typeof packet.color === "number" ? packet.max : prev.max,
            lastRPeak:   rPeakTimesRef.current.at(-1) ?? prev.lastRPeak,
            sampleCount: sampleCountRef.current,
        }));
    }, []);

    // Backend en localhost (dev) o Railway (prod)
    const connectWS = useCallback((url = "ws://localhost:8000/ws") => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;
        
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            setMetrics(prev => ({...prev, connected: true, mode: "websocket"}));
            console.log("[WS] Conectado a", url);
        };

        ws.onmessage = (event) => {
            try {
                const packet = JSON.parse(event.data);
                handlePacket(packet);
            } catch {
                console.warn("[WS] JSON invalido:", event.data.slice(0, 80));
            }
        };

        ws.onclose = () => {
            setMetrics(prev => ({ ...prev, connected: false}));
            console.log("[WS] Desconectado");
        }

        ws.onerror = (err) => console.error("[WS] Error:", err);
    }, [handlePacket]);

    const disconnectWS = useCallback(() => {
        wsRef.current?.close();
        setMetrics(prev => ({ ...prev, connected: false}))
    }, []);

    // Conexion BLE directa
    const BLE_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
    const BLE_CHAR    = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

    const handleBLENotification = useCallback((event) => {
        const text = new TextDecoder().decode(event.target.value);

        bleFragmentRef.current += text;
        if (!bleFragmentRef.current.endsWith("}")) return;

        try {
            const packet = JSON.parse(bleFragmentRef.current);
            bleFragmentRef.current = "";

            const withFilt = { ...packet, filtered: packet.raw ?? [] };
            handlePacket(withFilt);
        } catch {
            bleFragmentRef.current = "";
        }
    }, [handlePacket]);

    const connectBLE = useCallback(async () => {
        try {
            const device = await navigator.bluetooth.requestDevice({
                filters:          [{ name: "ESP32_Equipo2" }],
                optionalServices: [BLE_SERVICE],
            });
            deviceRef.current = device;

            device.addEventListener("gattserverdisconnected", () => {
                setMetrics(prev => ({ ...prev, connected: false }));
            });

            const server  = await device.gatt.connect();
            const service = await server.getPrimaryService(BLE_SERVICE);
            const char    = await service.getCharacteristic(BLE_CHAR);

            await char.startNotifications();
            char.addEventListener("characteristicvaluechanged", handleBLENotification);

            setMetrics(prev => ({ ...prev, connected: true, mode: "ble-direct" }));
            console.log("[BLE] Conectado a", device.name);
        } catch (err) {
            console.error("[BLE] Error:", err);
        }
    }, [handleBLENotification]);

    const disconnectBLE = useCallback(() => {
        if (deviceRef.current?.gatt.connected) deviceRef.current.gatt.disconnect();
        setMetrics(prev => ({ ...prev, connected: false }));
    }, []);

    // Lectura del buffer
    const getBuffer = useCallback((type = "filtered") => {
        const buf = type === "raw" ? rawBufRef.current : filtBufRef.current;
        const idx = writeIdxRef.current
        return [...buf.slice(idx), ...buf.slice(0, idx)];
    }, []);

    const getRPeaks = useCallback(() => [...rPeakTimesRef.current], []);

    return {
        metrics,
        getBuffer,
        getRPeaks,
        connectWS,
        disconnectWS,
        connectBLE,
        disconnectBLE,
    };
}