# Run: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# Activate vEnv: source venv/bin/activate

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from filters import ECGProcessor
from reader import BTReader, FakeBTReader

# Configuracion de logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("ecg.server")

BT_PORT  = os.getenv("BT_PORT", "")             # Puerto Bluetooth
ECG_FS   = int(os.getenv("ECG_FS",   "300"))    # Fs de la ESO32
BUF_SIZE = int(os.getenv("BUF_SIZE", "300"))    # Tamano del buffer de la ESP32

# Estado global
sample_queue: asyncio.Queue = asyncio.Queue(maxsize=20)

# Procesadores
processor         : ECGProcessor = ECGProcessor()
offline_processors: dict[int, ECGProcessor] = {}

# Retorna un ECGProcessor para el fs indicado
def get_offline_processor(fs) -> ECGProcessor:
    if fs not in offline_processors:
        log.info(f"[Offline] Creando ECGProcessor para fs={fs} Hz")
        proc = ECGProcessor()
        proc.initialize_filters(fs)
        offline_processors[fs] = proc
    return offline_processors[fs]

# Clientes WebSocket conectados
ws_clients: set[WebSocket] = set()

# Modelos Pydantic para el endpoint offline
class CsvWindowRequest(BaseModel):
    raw:   list[float] = Field(..., min_length=10, max_length=5000)
    fs:    int         = Field(..., ge=50, le=2000)
    t:     int         = Field(default=0, ge=0)
    reset: bool        = Field(default=False)

class CsvWindowResponse(BaseModel):
    raw:      list[float]
    filtered: list[float]
    bpm:      float
    peaks:    list[int]
    color:    str
    t:        int
    min:      float
    max:      float       

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
    proc_task = asyncio.create_task(process_and_broadcast())

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

# Tarea de procesamiento y broadcast (online)
async def process_and_broadcast() -> None:
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
        "offline_processors": list(offline_processors.keys()),
    }

@app.get("/snapshot")
def snapshot(n: int = 300):
    # Devuelve los ultimos n puntos de ambas senales
    return processor.snapshot(n)

# Procesa una ventana de muestras del CSV offline
@app.post("/process-csv", response_model=CsvWindowResponse)
def process_csv(req: CsvWindowRequest):
    fs = req.fs

    # 1. Resetear procesador si el frontend cambio de archivo
    if req.reset and fs in offline_processors:
        log.info(f"[Offline] Reset completo del procesador y filtros para fs={fs}")
        proc = ECGProcessor()
        proc.initialize_filters(fs)
        offline_processors[fs] = proc
    else:
        proc = get_offline_processor(fs)

    # 2. Validacion de seguridad para min y max
    raw_signals = req.raw if req.raw else [0.0]
    val_min = float(min(raw_signals))
    val_max = float(max(raw_signals))

    # 3. Construir el paquete en el formato que espera process_window()
    esp32_packet = {
        "raw":    req.raw,
        "rpeaks": [],       
        "bpm":    0.0,      
        "color":  "NONE",
        "t":      req.t,
        "min":    val_min,
        "max":    val_max,
    }

    packet = proc.process_window(esp32_packet)

    # 4. Retornar al diccionario de control
    if not packet or "status" in packet:
        return CsvWindowResponse(
            raw=req.raw, filtered=req.raw, bpm=0.0, peaks=[],
            color="NONE", t=req.t, min=val_min, max=val_max
        ) 

    return CsvWindowResponse(
        raw      = packet["raw"],
        filtered = packet["filtered"],
        bpm      = packet["bpm"],
        peaks    = packet["peaks"],
        color    = packet["color"],
        t        = packet["t"],
        min      = packet["min"],
        max      = packet["max"],
    )

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
            # Mantener viva la conexion recibiendo pings del cliente
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ws_clients.discard(ws)
        log.info(f"Cliente desconectado. Total: {len(ws_clients)}")