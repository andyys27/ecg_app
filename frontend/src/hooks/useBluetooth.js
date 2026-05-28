import { useState, useRef, useCallback } from "react";

const BUFFER_SIZE = 3000;   // 300 Hz x 10 segundos de almacenamiento
const FS          = 300;    // Frecuencia de muestreo síncrona con el backend
const SAMPLE_TIME = 1000 / FS; // ~3.33ms por muestra

export function useBluetooth() {
    // Buffers circulares basados en referencias (Evitan re-renders destructivos)
    const rawBufRef      = useRef(new Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
    const filtBufRef     = useRef(new Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
    const writeIdxRef    = useRef(0);
    const sampleCountRef = useRef(0);

    const bleFragmentRef = useRef("");
    const rPeakTimesRef  = useRef([]);
    
    const deviceRef = useRef(null);
    const wsRef     = useRef(null);

    const [metrics, setMetrics] = useState({
        bpm:         "--",
        color:       "NONE",
        min:         0,
        max:         0,
        lastRPeak:   null,
        connected:   false,
        sampleCount: 0,
        mode:        "websocket",
    });

    // Pipeline unificado de procesamiento de paquetes
    const handlePacket = useCallback((packet) => {
        
        // ── CASO A: SNAPSHOT INICIAL (Formato Vectorial/Array) ──
        if (packet.type === "snapshot" || Array.isArray(packet.raw)) {
            const rawArr  = packet.raw      ?? [];
            const filtArr = packet.filtered ?? [];
            const len     = Math.min(rawArr.length, filtArr.length);

            const now = Date.now();
            
            for (let i = 0; i < len; i++) {
                const idx = writeIdxRef.current;
                // Reconstrucción retrógrada del vector de tiempo absoluto
                const tEst = now - (len - i) * SAMPLE_TIME;
                
                rawBufRef.current[idx]  = { t: tEst, ecg: Number(rawArr[i])  || 0 };
                filtBufRef.current[idx] = { t: tEst, ecg: Number(filtArr[i]) || 0 };
                writeIdxRef.current     = (idx + 1) % BUFFER_SIZE;
            }
            sampleCountRef.current += len;
            return;
        }

        // ── CASO B: STREAMING EN TIEMPO REAL (Formato Escalar Muestra a Muestra) ──
        if (typeof packet.raw === "number" || typeof packet.filtered === "number") {
            const idx = writeIdxRef.current;
            
            // Generación de base de tiempo lineal continua para evitar desfases con el Canvas
            const lastIdx  = (idx - 1 + BUFFER_SIZE) % BUFFER_SIZE;
            const lastT    = rawBufRef.current[lastIdx]?.t || Date.now();
            const currentT = lastT + SAMPLE_TIME;

            // Inserción directa en buffers circulares (O(1))
            rawBufRef.current[idx]  = { t: currentT, ecg: Number(packet.raw) || 0 };
            filtBufRef.current[idx] = { t: currentT, ecg: Number(packet.filtered) || 0 };
            
            writeIdxRef.current = (idx + 1) % BUFFER_SIZE;
            sampleCountRef.current += 1;

            // Gestión síncrona del marcador de picos R
            if (packet.is_r_peak === true) {
                rPeakTimesRef.current = [...rPeakTimesRef.current, currentT].slice(-50);
            }

            // 🧠 ESTRANGULAMIENTO DE UI (Throttling):
            // Actualizar el estado de React a 300Hz colapsa la app.
            // Forzamos el renderizado solo cada 15 muestras (~20Hz) o inmediatamente si ocurre un QRS.
            if (sampleCountRef.current % 15 === 0 || packet.is_r_peak === true) {
                const bpmValue = Number(packet.bpm ?? NaN);
                
                setMetrics(prev => ({
                    ...prev,
                    bpm:         bpmValue > 0 ? Math.round(bpmValue) : prev.bpm,
                    color:       typeof packet.color === "string" ? packet.color : prev.color,
                    min:         typeof packet.min === "number" ? packet.min : prev.min,
                    max:         typeof packet.max === "number" ? packet.max : prev.max,
                    lastRPeak:   packet.is_r_peak ? currentT : prev.lastRPeak,
                    sampleCount: sampleCountRef.current,
                }));
            }
        }
    }, []);

    // Conexión y ciclo de vida del WebSocket
    const connectWS = useCallback((url = "ws://localhost:8000/ws") => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;
        
        console.log("[WS] Intentando conectar a:", url);
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            setMetrics(prev => ({ ...prev, connected: true, mode: "websocket" }));
            console.log("[WS] Canal de instrumentación abierto.");
        };

        ws.onmessage = (event) => {
            try {
                const packet = JSON.parse(event.data);
                handlePacket(packet);
            } catch {
                // Ignora strings de control vacíos
            }
        };

        ws.onclose = () => {
            setMetrics(prev => ({ ...prev, connected: false }));
            console.log("[WS] Canal cerrado.");
        };

        ws.onerror = (err) => {
            console.error("[WS] Error crítico de red:", err);
        };
    }, [handlePacket]);

    const disconnectWS = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setMetrics(prev => ({ ...prev, connected: false }));
    }, []);

    // Conexión Directa mediante Web Bluetooth API
    const BLE_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
    const BLE_CHAR    = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

    const handleBLENotification = useCallback((event) => {
        const text = new TextDecoder().decode(event.target.value);
        bleFragmentRef.current += text;
        
        if (!bleFragmentRef.current.endsWith("}")) return;

        try {
            const packet = JSON.parse(bleFragmentRef.current);
            bleFragmentRef.current = "";
            // Adaptamos la inyección cruda del firmware para que pase por el pipeline
            const sample = { ...packet, filtered: packet.filtered ?? packet.raw ?? 0 };
            handlePacket(sample);
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
            console.log("[BLE] Enlazado con", device.name);
        } catch (err) {
            console.error("[BLE] Error en emparejamiento:", err);
        }
    }, [handleBLENotification]);

    const disconnectBLE = useCallback(() => {
        if (deviceRef.current?.gatt.connected) {
            deviceRef.current.gatt.disconnect();
        }
        setMetrics(prev => ({ ...prev, connected: false }));
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
        connectBLE,
        disconnectBLE,
    };
}