import { useEffect, useRef } from "react";

// Theme style
const COLORS = {
    background: "#0a0f0a",
    grid:       "#1a2e1a",
    signal:     "#00ff88",
    rPeak:      "#ff4444",
    text:       "#4a7a4a",
};

// Visible samples in the graph
const VISIBLE_SAMPLES = 1500; // 3 seconds at 500 Hz

export default function LiveChart({ getBuffer, lastRPeak }) {
    const canvasRef = useRef(null);
    const rafRef = useRef(null); 

    useEffect(() => {
        const canvas  = canvasRef.current;
        const ctx  = canvas.getContext("2d");

        // Adjust resolution for high-DPI screens
        function resize() {
            const rect    = canvas.getBoundingClientRect();
            canvas.width  = rect.width  * window.devicePixelRatio;
            canvas.height = rect.height * window.devicePixelRatio;
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        }
        resize();
        window.addEventListener("resize", resize);

        // Main drawing function
        function draw() {
            const W = canvas.getBoundingClientRect().width;
            const H = canvas.getBoundingClientRect().height;

            // 1. Clear canvas
            ctx.fillStyle = COLORS.background;
            ctx.fillRect(0, 0, W, H);

            // 2. Draw grid
            drawGrid(ctx, W, H);

            // 3. Get visible samples from buffer
            const buffer  = getBuffer();
            const slice   = buffer.slice(-VISIBLE_SAMPLES);
            const n       = slice.length;
            if (n < 2) {
                rafRef.current = requestAnimationFrame(draw);
                return;
            }

            // 4. Normalize ECG values to fit in canvas height with some padding
            // Find min and max in the slice for dynamic scaling
            let min = Infinity, max = -Infinity;
            for (let i = 0; i < n; i++) {
                if (slice[i].ecg < min) min = slice[i].ecg;
                if (slice[i].ecg > max) max = slice[i].ecg;
            }
            const range = max - min || 1;       // avoid division by zero if flat signal
            const padding = H * 0.1;            // 10% vertical padding on top and bottom

            // Function to convert ECG value to Y coordinate
            const toY = (v) =>
                H - padding - ((v - min) / range) * (H - 2 * padding);

            // 5. Draw ECG signal
            ctx.beginPath();
            ctx.strokeStyle = COLORS.signal;
            ctx.lineWidth   = 1.5;
            ctx.shadowColor = COLORS.signal;
            ctx.shadowBlur  = 4; 

            for (let i = 0; i < n; i++) {
                const x = (i / (n - 1)) * W;
                const y = toY(slice[i].ecg);
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;

            // 6. Mark R-peaks on the graph
            if (lastRPeak) {
                ctx.fillStyle = COLORS.rPeak;
                for (let i = 0; i < n; i++) {
                    if (Math.abs(slice[i].t - lastRPeak) < 10) {
                        const x = (i / (n - 1)) * W;
                        const y = toY(slice[i].ecg);
                        ctx.beginPath();
                        ctx.arc(x, y, 5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }

            // 7. Timestamp in corner
            ctx.fillStyle = COLORS.text;
            ctx.font = "11px monospace";
            ctx.fillText(`${VISIBLE_SAMPLES / 500}s  |  500 Hz`, 10, H - 8);

            rafRef.current = requestAnimationFrame(draw);
        }

        // Paper style grid drawing function
        function drawGrid(ctx, W, H) {
            // Small grid every 20px
            ctx.strokeStyle = COLORS.grid;
            ctx.lineWidth   = 0.5;
            for (let x = 0; x < W; x += 20) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
            }
            for (let y = 0; y < H; y += 20) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
            }
            // Thick lines every 100px (large squares of the ECG paper)
            ctx.strokeStyle = "#1f3d1f";
            ctx.lineWidth   = 1;
            for (let x = 0; x < W; x += 100) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
            }
            for (let y = 0; y < H; y += 100) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
            }
        }

        // Start the animation loop
        rafRef.current = requestAnimationFrame(draw);

        // Cleanup: cancel the loop when unmounting the component
        return () => {
            cancelAnimationFrame(rafRef.current);
            window.removeEventListener("resize", resize);
        };
    }, [getBuffer, lastRPeak]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                width: "100%",
                height: "220px",
                borderRadius: "8px",
                display: "block",
            }}
        />
    );
}