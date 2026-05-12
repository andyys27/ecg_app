import { useState, useEffect, useRef, useCallback } from "react";

const BUFFER_SIZE = 2000;   // 2000 visible samples (~5.5s at 360 Hz)
const OFFLINE_FS = 360;     // MIT-BIH es a 360 Hz
const PLAYBACK_RATE = 1.0;  // 1.0 = real time

export function useOfflineECG(csvPath) {
    const bufferRef = useRef(Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
    const writeIdxRef = useRef(0);
    const samplesRef = useRef([]);      
    const playIdxRef = useRef(0);       
    const intervalRef = useRef(null);
    const rPeakTimesRef = useRef([]);

    const [metrics, setMetrics] = useState({
        bpm: "--",
        lastRPeak: null,
        connected: false,
        sampleCount: 0,
        mode: "offline",
    });

    // Load ECG samples from CSV on mount
    useEffect(() => {
        fetch(csvPath)
        .then((res) => {
            if (!res.ok) throw new Error(`No se pudo cargar ${csvPath}`);
            return res.text();
        })
        .then((text) => {
            const lines   = text.trim().split("\n");
            const samples = [];

        // Skip header
        for (let i = 1; i < lines.length; i++) {
            const [t, v] = lines[i].split(",").map(Number);
            if (!isNaN(t) && !isNaN(v)) {
                samples.push({ t: t * 1000, ecg: v }); // t en ms para consistencia con ESP32
            }
        }

        samplesRef.current = samples;
        setMetrics((prev) => ({ ...prev, connected: true }));
            console.log(`[Offline] ${samples.length} loaded samples of ${csvPath}`);
        })
        .catch((err) => console.error("[Offline] Error loading CSV:", err));
    }, [csvPath]);

    // Simulate real-time streaming of ECG data
    useEffect(() => {
        // Interval to push samples to buffer at the correct rate
        const intervalMs = (1000 / OFFLINE_FS) / PLAYBACK_RATE;
        let sampleCount = 0;

        intervalRef.current = setInterval(() => {
            const samples = samplesRef.current;
            if (samples.length === 0) return;

            // Read next sample and write to circular buffer
            const sample = samples[playIdxRef.current];
            playIdxRef.current = (playIdxRef.current + 1) % samples.length;

            // Write sample to circular buffer
            const idx = writeIdxRef.current;
            bufferRef.current[idx] = { t: sample.t, ecg: sample.ecg };
            writeIdxRef.current = (idx + 1) % BUFFER_SIZE;
            sampleCount++;

            // Detect R-peak using a simple Pan-Tompkins-like method
            detectRPeak(sample, rPeakTimesRef);

            // Update metrics every 6 samples (~16 ms at 360 Hz)
            if (sampleCount % 6 === 0) {
                const avgBpm = calcBpm(rPeakTimesRef.current);
                setMetrics((prev) => ({
                    ...prev,
                    bpm: avgBpm,
                    sampleCount: prev.sampleCount + 6,
                    lastRPeak: rPeakTimesRef.current.at(-1) ?? prev.lastRPeak,
                }));
            }
        }, intervalMs);

        return () => clearInterval(intervalRef.current);
    }, []);

    // R-peak detection and BPM calculation adapted for offline data
    const ptStateRef = useRef({ prev: 0, sum: 0, win: new Array(22).fill(0), head: 0, thresh: 0, lastPeakT: 0 });

    function detectRPeak(sample, rPeakTimesRef) {
        const s = ptStateRef.current;
        const deriv = sample.ecg - s.prev;
        s.prev = sample.ecg;
        const sq = deriv * deriv;

        // Ventana integradora
        s.sum -= s.win[s.head];
        s.win[s.head] = sq;
        s.sum += sq;
        s.head = (s.head + 1) % s.win.length;
        const integrated = s.sum / s.win.length;

        s.thresh *= 0.99;

        const now = sample.t;
        if (integrated > s.thresh && (now - s.lastPeakT) > 250) {
            rPeakTimesRef.current.push(now);
            if (rPeakTimesRef.current.length > 10) rPeakTimesRef.current.shift();
                s.lastPeakT = now;
            s.thresh    = integrated * 0.75;
        }
    }

    function calcBpm(peaks) {
        if (peaks.length < 2) return "--";
            const intervals = [];
        for (let i = 1; i < peaks.length; i++) {
            intervals.push(peaks[i] - peaks[i - 1]);
        }
        const avgRR = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        return Math.round(60000 / avgRR);
    }

    // Same interface as useWebSocket: return metrics and a function to get the current buffer
    const getBuffer = useCallback(() => {
        const buf = bufferRef.current;
        const idx = writeIdxRef.current;
        return [...buf.slice(idx), ...buf.slice(0, idx)];
    }, []);

    return { metrics, getBuffer };
}