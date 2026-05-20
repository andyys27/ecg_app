# Run: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from filters import ECGProcessor
from reader import BTReader, FakeBTReader

# Configuracion
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("ecg.server")

BT_PORT  = os.getenv("BT_PORT", "")
ECG_FS   = int(os.getenv("ECG_FS",   "300"))
BUF_SIZE = int(os.getenv("BUF_SIZE", "300"))

# Estado global
sample_queue: asyncio.Queue = asyncio.Queue(maxsize=20)
processor   : ECGProcessor  = ECGProcessor(fs=ECG_FS)

# Clientes WebSocket conectados
ws_clients: set[WebSocket] = set()

# Arranca BTReader en background al iniciar
@asynccontextmanager
async def lifespan(app: FastAPI):
    if BT_PORT:
        reader = BTReader(port=BT_PORT)
        log.info(f"Modo hardware: {BT_PORT}")
    else:
        reader = FakeBTReader(fs=ECG_FS, buf_size=BUF_SIZE, freq_hz=1.2)
        log.info("Modo demo: FakeBTReader activo")

    # Lector de BT
    bt_task = asyncio.create_task(reader.start(sample_queue))
    # Procesador y broadcast
    proc_task = asyncio.create_task(_process_and_broadcast())

    yield

    reader.stop()
    bt_task.cancel()
    proc_task.cancel()


app = FastAPI(title="ECG Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Tarea de procesamiento y broadcast
async def _process_and_broadcast() -> None:
    while True:
        esp32_packet = await sample_queue.get()

        packet = processor.process_window(esp32_packet)
        if not packet:
            continue

        if ws_clients:
            msg = json.dumps(packet)
            dead = set()
            for ws in ws_clients:
                try:
                    await ws.send_text(msg)
                except Exception:
                    dead.add(ws)
            ws_clients -= dead


# Endpoints
@app.get("/")
def root():
    return {
        "status": "ok",
        "mode":   "hardware" if BT_PORT else "demo",
        "fs":     ECG_FS,
        "clients": len(ws_clients),
    }

@app.get("/snapshot")
def snapshot(n: int = 300):
    # Devuelve los ultimos n puntos de ambas senales
    return processor.snapshot(n)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.add(ws)
    log.info(f"Cliente conectado. Total: {len(ws_clients)}")

    # Al conectarse, envía un snapshot para poblar la gráfica de inmediato
    snap = processor.snapshot(300)
    await ws.send_text(json.dumps({"type": "snapshot", **snap}))

    try:
        while True:
            # Mantener viva la conexión recibiendo pings del cliente
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ws_clients.discard(ws)
        log.info(f"Cliente desconectado. Total: {len(ws_clients)}")