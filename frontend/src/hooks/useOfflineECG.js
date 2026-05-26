import { useState, useEffect, useRef, useCallback } from "react";

const BUFFER_SIZE   = 3000;   
const PLAYBACK_RATE = 1.0;
const WINDOW_SIZE   = 20;   

export function useOfflineECG(csvPath) {
    // Buffers circulares
    const rawBufRef  = useRef(new Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
    const filtBufRef = useRef(new Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
    const writeIdxRef   = useRef(0);
    const rPeakTimesRef = useRef([]);

    // Estado de reproduccion
    const samplesRef  = useRef([]);   // [{ t: ms, ecg: float }]
    const playIdxRef  = useRef(0);
    const intervalRef = useRef(null); 
    const fsRef       = useRef(300);

    const [metrics, setMetrics] = useState({
        bpm: 0, color: "NONE", min: 0, max: 0,
        lastRPeak: null, connected: false, sampleCount: 0, mode: "offline",
    });

    // Cargar CSV cuando cambia csvPath
    useEffect(() => {
        // Detener el intervalo anterior inmediatamente
        clearInterval(intervalRef.current);
        intervalRef.current = null;

        // Reset de buffers y estado
        rawBufRef.current  = new Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 });
        filtBufRef.current = new Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 });
        writeIdxRef.current   = 0;
        rPeakTimesRef.current = [];
        playIdxRef.current    = 0;
        samplesRef.current    = [];

        setMetrics({
            bpm: "--", color: "NONE", min: 0, max: 0,
            lastRPeak: null, connected: false, sampleCount: 0, mode: "offline",
        });

        // Petición HTTP al endpoint POST de FastAPI para resetear filtros del archivo previo
        fetch("http://localhost:8000/process-csv", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ raw: new Array(10).fill(2000), fs: 300, reset: true })
        }).catch(() => console.warn("[Offline] No se pudo inicializar reset en backend"));

        // Cargar el archivo estatico
        fetch(csvPath)
            .then(res => {
                if (!res.ok) throw new Error(`No se pudo cargar ${csvPath}`);
                return res.text();
            })
            .then(text => {
                const lines   = text.trim().split("\n");
                const samples = [];

                for (let i = 1; i < lines.length; i++) {
                    const parts = lines[i].split(",");
                    if (parts.length < 2) continue;
                    const t = Number(parts[0]);
                    const v = Number(parts[1]);
                    if (isNaN(t) || isNaN(v)) continue;

                    // Normalizar tiempo a ms:
                    const tMs = t < 10000 ? Math.round(t * 1000) : t;
                    samples.push({ t: tMs, ecg: v });
                }

                if (samples.length < WINDOW_SIZE) {
                    console.error("[Offline] CSV demasiado corto o mal formateado");
                    return;
                }

                // Detectar FS del CSV midiendo el intervalo promedio
                const ivals = [];
                for (let i = 1; i < Math.min(100, samples.length); i++)
                    ivals.push(samples[i].t - samples[i - 1].t);
                const avgMs = ivals.reduce((a, b) => a + b, 0) / ivals.length;
                fsRef.current = Math.round(1000 / avgMs);

                samplesRef.current = samples;
                setMetrics(prev => ({ ...prev, connected: true }));
                console.log(
                    `[Offline] ${samples.length} muestras · FS: ${fsRef.current} Hz · ` +
                    `duración: ${((samples.at(-1).t - samples[0].t) / 1000).toFixed(1)} s`
                );
            })
            .catch(err => console.error("[Offline] Error CSV:", err));

        return () => {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        };
    }, [csvPath]);

    // Arrancar el simulador 
    // Bucle de streaming hacia el backend (CORREGIDO con async)
    useEffect(() => {
        const waitId = setInterval(() => {
            if (samplesRef.current.length < WINDOW_SIZE) return;
            clearInterval(waitId);

            const fs = fsRef.current;
            // Intervalo en ms que durará cada ciclo de envío
            const windowMs = Math.round((WINDOW_SIZE / fs) * 1000 / PLAYBACK_RATE);

            // AGREGAMOS 'async' AQUÍ ABAJO:
            intervalRef.current = setInterval(async () => {
                const samples = samplesRef.current;
                const start   = playIdxRef.current;
                const end     = start + WINDOW_SIZE;
                const slice   = samples.slice(start, end);

                if (slice.length < WINDOW_SIZE) {
                    playIdxRef.current = 0; // Bucle infinito al terminar el archivo
                    return;
                }
                playIdxRef.current = end < samples.length ? end : 0;

                const rawArray = slice.map(s => s.ecg);
                const baseT    = slice[0].t;

                try {
                    // Petición HTTP POST enviando la ventana cruda al backend
                    const response = await fetch("http://localhost:8000/process-csv", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            raw: rawArray,
                            fs: fs,
                            t: baseT,
                            reset: false
                        })
                    });

                    if (!response.ok) return;
                    const packet = await response.json();

                    const resRaw  = packet.raw      ?? [];
                    const resFilt = packet.filtered ?? [];
                    const peaks   = packet.peaks    ?? [];
                    const len     = Math.min(resRaw.length, resFilt.length);
                    
                    if (len === 0) return;

                    const sampleInterval = 1000 / fs;

                    // Volcar los arreglos sincronizados en los buffers circulares
                    for (let i = 0; i < len; i++) {
                        const idx = writeIdxRef.current;
                        const tSample = baseT + i * sampleInterval;
                        rawBufRef.current[idx]  = { t: tSample, ecg: Number(resRaw[i])  || 0 };
                        filtBufRef.current[idx] = { t: tSample, ecg: Number(resFilt[i]) || 0 };
                        writeIdxRef.current = (idx + 1) % BUFFER_SIZE;
                    }

                    // Convertir los índices de picos retornados a marcas de tiempo ms
                    if (peaks.length > 0) {
                        const peakTimes = peaks.map(pi => baseT + pi * sampleInterval);
                        rPeakTimesRef.current = [...rPeakTimesRef.current, ...peakTimes].slice(-50);
                    }

                    setMetrics(prev => ({
                        ...prev,
                        bpm:         packet.bpm > 0 ? packet.bpm : (prev.bpm === "--" ? 0 : prev.bpm),
                        color:       packet.color ?? "NONE",
                        min:         packet.min,
                        max:         packet.max,
                        lastRPeak:   rPeakTimesRef.current.at(-1) ?? prev.lastRPeak,
                        sampleCount: prev.sampleCount + len,
                    }));

                } catch (err) {
                    console.warn("[Offline] Error de comunicación con FastAPI:", err);
                }

            }, windowMs);
        }, 100);

        return () => {
            clearInterval(waitId);
            clearInterval(intervalRef.current);
        };
    }, [csvPath]);         // Verificar el csvPath

    // API
    const getBuffer = useCallback((type = "filtered") => {
        const buf = type === "raw" ? rawBufRef.current : filtBufRef.current;
        const idx = writeIdxRef.current;
        return [...buf.slice(idx), ...buf.slice(0, idx)];
    }, []);

    const getRPeaks = useCallback(() => [...rPeakTimesRef.current], []);

    return { metrics, getBuffer, getRPeaks };
}