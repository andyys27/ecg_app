# cd backend
# Run: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    # BT_PORT="/dev/rfcomm0"
# Activate vEnv: source venv/bin/activate       // Linux
# Activate vEnv: .\.venv\Scripts\Activate.ps1   // Windows
                # $env:BT_PORT="COM8"

                # sudo rfcomm connect 0 D4:E9:F4:E3:3F:C2
                # sudo rfcomm connect 0 00:70:07:1E:16:EA
# COM Bluetooht activos PowerShell: Get-CimInstance -ClassName Win32_SerialPort | Select-Object DeviceID, Name

# npx wscat -c ws://localhost:8000/ws

# main.py - Versión Nube (Render, Railway o AWS)
import asyncio
import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from filters import ECGProcessor  # Conservamos tu lógica DSP intacta

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("ecg.cloud")

app = FastAPI(title="ECG Cloud Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Almacenamiento aislado para el modo CSV offline
offline_processors: dict[int, ECGProcessor] = {}

def get_offline_processor(fs) -> ECGProcessor:
    if fs not in offline_processors:
        proc = ECGProcessor()
        proc.initialize_filters(fs)
        offline_processors[fs] = proc
    return offline_processors[fs]

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

@app.get("/")
def root():
    return {"status": "online", "mode": "cloud_relay", "desc": "Pipeline multi-usuario activo"}

@app.post("/process-csv", response_model=CsvWindowResponse)
def process_csv(req: CsvWindowRequest):
    fs = req.fs
    if req.reset and fs in offline_processors:
        proc = ECGProcessor()
        proc.initialize_filters(fs)
        offline_processors[fs] = proc
    else:
        proc = get_offline_processor(fs)

    raw_signals = req.raw if req.raw else [0.0]
    val_min = float(min(raw_signals))
    val_max = float(max(raw_signals))

    esp32_packet = {
        "raw":    req.raw, "rpeaks": [], "bpm": 0.0,
        "color":  "NONE", "t": req.t, "min": val_min, "max": val_max,
    }
    packet = proc.process_window(esp32_packet)

    if not packet or "status" in packet:
        return CsvWindowResponse(
            raw=req.raw, filtered=req.raw, bpm=0.0, peaks=[],
            color="NONE", t=req.t, min=val_min, max=val_max
        ) 
    return CsvWindowResponse(
        raw=packet["raw"], filtered=packet["filtered"], bpm=packet["bpm"],
        peaks=packet["peaks"], color=packet["color"], t=packet["t"], min=packet["min"], max=packet["max"]
    )

# ── PIPELINE WEBSOCKET REAL-TIME EN LA NUBE ──
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    
    # ¡MAGIA MULTI-USUARIO! Instanciamos un procesador único por CADA pestaña/usuario que se conecte
    user_processor = ECGProcessor()
    user_processor.initialize_filters(300) # 300Hz por defecto de tu hardware
    
    log.info("Nuevo cliente conectado. Instanciando pipeline DSP dedicado.")

    try:
        while True:
            # Escuchamos la muestra cruda enviada desde el Bluetooth del navegador del usuario
            message = await ws.receive_text()
            data = json.loads(message)
            
            raw_sample = float(data.get("raw", 0.0))

            # Procesamos la muestra individual en su entorno aislado
            packet = user_processor.process_single_sample(raw_sample)
            
            if packet:
                # Se lo regresamos instantáneamente al navegador para que lo dibuje
                await ws.send_text(json.dumps(packet))
                
    except WebSocketDisconnect:
        log.info("Cliente desconectado de la sesión en la nube.")
    except Exception as e:
        log.error(f"Error procesando muestra en la nube: {e}")