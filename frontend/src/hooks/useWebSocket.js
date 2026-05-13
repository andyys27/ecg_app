import { useState, useEffect, useRef, useCallback } from "react";

// Size of circular buffer visible in the graph (4 seconds at 500 Hz)
const BUFFER_SIZE = 2000;

// Change IP for the one printed by the ESP32 on Serial at startup
const ESP32_IP = "192.168.1.100";
const WS_URL = `ws://${ESP32_IP}:81`;

export function useWebSocket() {
    // Circular buffer of samples for the graph
    // Using useRef to avoid re-rendering on every sample
    const bufferRef = useRef(Array(BUFFER_SIZE).fill({ t: 0, ecg: 0 }));
    const writeIdxRef = useRef(0);

    // State that does triggers re-render (updated to 30 fps)
    const [metrics, setMetrics] = useState({
        bpm: "--",
        lastRPeak: null,
        connected: false,
        sampleCount: 0,
    });

    // Internal counters and timestamps for BPM calculation
    const sampleCountRef = useRef(0);
    const rPeakTimesRef = useRef([]);       // Timestamps of detected R-peaks for BPM calculation

    // WebSocket reference to manage connection
    const wsRef = useRef(null);

    // Function to handle incoming WebSocket messages
    const handleMessage = useCallback((event) => {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch {
            return;     // Ignore non-JSON messages
        }

        // 1. Write in circular buffer (no re-render)
        const idx = writeIdxRef.current;
        bufferRef.current[idx] = { t: data.t, ecg: data.ecg };
        writeIdxRef.current = (idx + 1) % BUFFER_SIZE;
        sampleCountRef.current++;

        // 2. If R-peak detected, record its timestamp
        if (data.rPeak && data.bpm > 30 && data.bpm < 220) {
            rPeakTimesRef.current.push(data.t);
            // Keep only the last 10 R-peak times for BPM calculation
            if (rPeakTimesRef.current.length > 10) {
                rPeakTimesRef.current.shift();
            }
        }

        // 3. Throttle: update React state every 16 ms (60 fps)
        if (sampleCountRef.current % 8 === 0) {
            // Calculate BPM from R-peak intervals
            let avgBpm = "--";
            const peaks = rPeakTimesRef.current;
            if (peaks.length >= 2) {
                const intervals = [];
                for (let i = 1; i < peaks.length; i++) {
                    intervals.push(peaks[i] - peaks[i - 1]);
                }   
                const avgRR = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                avgBpm = Math.round(60000 / avgRR);
            }
            
            setMetrics((prev) => ({
                ...prev,
                bpm: avgBpm,
                lastRPeak: data.rPeak ? data.t : prev.lastRPeak,
                sampleCount: sampleCountRef.current,
            }));
        }
    }, []);

    // Connect when starting the hook, reconnect on disconnect
    useEffect(() => {
        let reconnectTimeout;

        function connect() {
            const ws = new WebSocket(WS_URL);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log("[WS] Conectado al ESP32");
                setMetrics((prev) => ({ ...prev, connected: true }));
            };

            ws.onmessage = handleMessage;

            ws.onclose = () => {
                console.warn("[WS] Desconectado, reintentando en 2s...");
                setMetrics((prev) => ({ ...prev, connected: false }));
                reconnectTimeout = setTimeout(connect, 2000);
            };

            ws.onerror = (err) => {
                console.error("[WS] Error:", err);
                ws.close(); // Trigger reconnection logic on error
            };
        }
            
        connect();

        // Cleanup on unmount
        return () => {
            clearTimeout(reconnectTimeout);
            if (wsRef.current) wsRef.current.close();
        };
    }, [handleMessage]);
    
    const getBuffer = useCallback(() => {
        const buf = bufferRef.current;
        const idx = writeIdxRef.current;
        return [...buf.slice(idx), ...buf.slice(0, idx)];
    }, []);
    
    return { metrics, getBuffer };
}