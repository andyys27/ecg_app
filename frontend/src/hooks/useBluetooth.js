import { useState, useRef, useCallback } from "react";

const BUFFER_SIZE = 3000;       // 300 Hz x 10 segundos de almacenamiento
const FS          = 300;        // Frecuencia de muestreo síncrona con el backend
const SAMPLE_TIME = 1000 / FS;  // ~3.33ms por muestra

export function useBluetooth() {
    // Buffers circulares basados en referencias (Evitan re-renders destructivos)
    const rawBufRef      = useRef(new Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
    const filtBufRef     = useRef(new Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
    const writeIdxRef    = useRef(0);
    const sampleCountRef = useRef(0);
    const rPeakTimesRef  = useRef([]);

    const bleFragmentRef = useRef("");
    
    const deviceRef = useRef(null);
    const wsRef     = useRef(null);

    const [metrics, setMetrics] = useState({
        bpm:         "--",
        color:       "NONE",
        rr_interval: "-",
        total_beats: 0,
        lastRPeak:   null,
        connected:   false,
        sampleCount: 0,
        mode:        "websocket",
    });

    // Pipeline unificado de procesamiento de paquetes
    const handlePacket = useCallback((packet) => {
        
        // CASO A: SNAPSHOT INICIAL 
        if (packet.type === "snapshot" || Array.isArray(packet.raw)) {
            const rawArr  = packet.raw      ?? [];
            const filtArr = packet.filtered ?? [];
            const len     = Math.min(rawArr.length, filtArr.length);

            const now = Date.now();
            
            for (let i = 0; i < len; i++) {
                const idx = writeIdxRef.current;
                const tEst = now - (len - i) * SAMPLE_TIME;
                
                rawBufRef.current[idx]  = { t: tEst, ecg: Number(rawArr[i])  || 0 };
                filtBufRef.current[idx] = { t: tEst, ecg: Number(filtArr[i]) || 0 };
                writeIdxRef.current     = (idx + 1) % BUFFER_SIZE;
            }
            sampleCountRef.current += len;
            return;
        }

        // CASO B: STREAMING EN TIEMPO REAL 
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

            // REVISAr EL -50 QUE PUEDE ESTABLECER EL LIMITE AAAAAAAAAAAAAAA

            // Gestión síncrona del marcador de picos R
            if (packet.is_r_peak === true) {
                rPeakTimesRef.current = [...rPeakTimesRef.current, currentT].slice(-50);
            }

            // ESTRANGULAMIENTO DE UI (Throttling):
            // Forzamos el renderizado solo cada 15 muestras (~20Hz) o inmediatamente si ocurre un QRS.
            if (sampleCountRef.current % 15 === 0 || packet.is_r_peak === true) {
                const bpmValue = Number(packet.bpm ?? NaN);
                
                setMetrics(prev => ({
                    ...prev,
                    bpm:         bpmValue > 0 ? Math.round(bpmValue) : prev.bpm,
                    color:       typeof packet.color === "string" ? packet.color : prev.color,
                    rr_interval: packet.rr_interval !== undefined ? packet.rr_interval : prev.rr_interval,
                    total_beats: packet.total_beats !== undefined ? (packet.total_beats - beatsOffsetRef.current) : prev.total_beats,                    lastRPeak:   packet.is_r_peak ? currentT : prev.lastRPeak,
                    lastRPeak:   packet.is_r_peak ? currentT : prev.lastRPeak,
                    sampleCount: sampleCountRef.current,
                }));
            }
        }
    }, []);

    const resetSessionBeats = useCallback(() => {
        beatsOffsetRef.current = globalBeatsRef.current;
        setMetrics(prev => ({ ...prev, total_beats: 0 }));
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
            setMetrics(prev => ({ ...prev, connected: false, bpm: 0, color: "NONE" }));
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
        setMetrics(prev => ({ ...prev, connected: false, bpm: 0, color: "NONE" }));
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