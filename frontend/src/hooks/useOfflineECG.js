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
    const fsRef       = useRef(360);

    const [metrics, setMetrics] = useState({
        bpm: "--", color: "NONE", min: 0, max: 0,
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
    useEffect(() => {
        // Esperar a que samplesRef se pueble
        const waitId = setInterval(() => {
            if (samplesRef.current.length < WINDOW_SIZE) return;
            clearInterval(waitId);

            const fs       = fsRef.current;
            const windowMs = Math.round((WINDOW_SIZE / fs) * 1000 / PLAYBACK_RATE);

            intervalRef.current = setInterval(() => {
                const samples = samplesRef.current;
                const start   = playIdxRef.current;
                const end     = start + WINDOW_SIZE;
                const slice   = samples.slice(start, end);

                if (slice.length < WINDOW_SIZE) {
                    // Fin del CSV → reiniciar
                    playIdxRef.current = 0;
                    return;
                }
                playIdxRef.current = end < samples.length ? end : 0;

                const raw    = slice.map(s => s.ecg);
                // baseT: timestamp real del CSV
                const baseT  = slice[0].t;

                // Rango de ventana
                const minVal = Math.min(...raw);
                const maxVal = Math.max(...raw);
                const range  = maxVal - minVal;

                // Umbral adaptativo e histeresis
                const umbAlto = range > 200 ? minVal + range * 0.70 : (minVal + maxVal) / 2 + 100;
                const umbBajo = range > 200 ? minVal + range * 0.40 : (minVal + maxVal) / 2 - 100;

                const peaks  = [];
                let   arriba = false;
                const refract = Math.floor(fs * 0.25);
                let   lastP   = -refract - 1;

                for (let i = 0; i < raw.length; i++) {
                    if (!arriba && raw[i] > umbAlto && (i - lastP) > refract) {
                        arriba = true;
                        peaks.push(i);
                        lastP = i;
                    } else if (arriba && raw[i] < umbBajo) {
                        arriba = false;
                    }
                }

                // BPM de los ultimos dos picos de la ventana
                let bpm = 0;
                if (peaks.length >= 2) {
                    const rrSamples = peaks[peaks.length - 1] - peaks[peaks.length - 2];
                    bpm = Math.round(60 / (rrSamples / fs));
                    // Sanitizar
                    if (bpm < 20 || bpm > 300) bpm = 0;
                }

                const color =
                    bpm > 0   && bpm < 60  ? "BLUE"   :
                    bpm >= 60 && bpm < 100 ? "GREEN"  :
                    bpm >= 100&& bpm <=140 ? "YELLOW" :
                    bpm > 140              ? "RED"    : "NONE";

                // Volcar en buffers 
                const sampleInterval = 1000 / fs;
                for (let i = 0; i < raw.length; i++) {
                    const idx = writeIdxRef.current;
                    const tSample = baseT + i * sampleInterval;
                    rawBufRef.current[idx]  = { t: tSample, ecg: raw[i] };
                    // En offline no hay backend que filtre; filtBuf = raw
                    filtBufRef.current[idx] = { t: tSample, ecg: raw[i] };
                    writeIdxRef.current = (idx + 1) % BUFFER_SIZE;
                }

                // Picos R
                if (peaks.length > 0) {
                    const peakTimes = peaks.map(pi => baseT + pi * sampleInterval);
                    rPeakTimesRef.current = [...rPeakTimesRef.current, ...peakTimes].slice(-50);
                }

                setMetrics(prev => ({
                    ...prev,
                    bpm:         bpm > 0 ? bpm : prev.bpm,
                    color,
                    min:         minVal,
                    max:         maxVal,
                    lastRPeak:   rPeakTimesRef.current.at(-1) ?? prev.lastRPeak,
                    sampleCount: prev.sampleCount + raw.length,
                }));

            }, windowMs);
        }, 100);

        return () => {
            clearInterval(waitId);
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        };
    }, [csvPath]); 

    // API
    const getBuffer = useCallback((type = "filtered") => {
        const buf = type === "raw" ? rawBufRef.current : filtBufRef.current;
        const idx = writeIdxRef.current;
        return [...buf.slice(idx), ...buf.slice(0, idx)];
    }, []);

    const getRPeaks = useCallback(() => [...rPeakTimesRef.current], []);

    return { metrics, getBuffer, getRPeaks };
}