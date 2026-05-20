import asyncio
import json
import logging
import serial
import serial.tools.list_ports
from typing import Optional

log = logging.getLogger("bt.reader")

def list_bt_ports() -> list[str]:
    # Devuelve los puertos serie disponibles
    ports = serial.tools.list_ports.comports()
    return [p.device for p in ports]


class BTReader:
    # Lector asíncrono del ESP32 por Bluetooth Serial
    # reader = BTReader(port="COM5")            Windows
    # reader = BTReader(port="/dev/rfcomm0")    Linux
    def __init__(self, port: str, baudrate: int = 115200):
        self.port     = port
        self.baudrate = baudrate
        self.ser: Optional[serial.Serial] = None
        self.running = False

    # Ciclo principal 
    async def start(self, queue: asyncio.Queue) -> None:
        self.running = True
        log.info(f"Abriendo puerto BT: {self.port} @ {self.baudrate}")

        try:
            self.ser = serial.Serial(self.port, self.baudrate, timeout=1)
        except serial.SerialException as e:
            log.error(f"No se pudo abrir {self.port}: {e}")
            return

        log.info("Conectado al ESP32. Leyendo datos…")

        loop = asyncio.get_event_loop()
        fragment = ""           

        while self.running:
            try:
                raw_bytes = await loop.run_in_executor(None, self.ser.readline)
                chunk = raw_bytes.decode("utf-8", errors="ignore").strip()

                if not chunk:
                    continue

                fragment += chunk

                # Intentar parsear solo si el fragmento acumulado parece completo
                if not fragment.startswith("{"):
                    log.debug(f"Fragmento descartado (no JSON): {fragment!r}")
                    fragment = ""
                    continue

                if not fragment.endswith("}"):
                    # Incompleto: seguir acumulando
                    continue

                data = json.loads(fragment)
                fragment = ""       # Reset acumulador

                # Validar campos requeridos del firmware
                if "raw" not in data or not isinstance(data["raw"], list):
                    log.debug(f"Paquete inválido (sin array 'raw'): {list(data.keys())}")
                    continue

                if len(data["raw"]) == 0:
                    log.debug("Array 'raw' vacío, ignorado")
                    continue

                await queue.put(data)

            except json.JSONDecodeError:
                log.debug(f"JSON incompleto o corrupto, descartando: {fragment[:80]!r}")
                fragment = ""   
            except serial.SerialException as e:
                log.error(f"Error de puerto serie: {e}")
                fragment = ""
                await asyncio.sleep(2)
            except Exception as e:
                log.exception(f"Error inesperado en BTReader: {e}")
                fragment = ""
                await asyncio.sleep(1)

    def stop(self) -> None:
        self.running = False
        if self.ser and self.ser.is_open:
            self.ser.close()
            log.info("Puerto BT cerrado.")


# Modo de prueba sin ESP32
class FakeBTReader:
    def __init__(self, fs = 300, buf_size = 300, freq_hz = 1.2):
        self.fs       = fs
        self.buf_size = buf_size
        self.freq_hz  = freq_hz
        self.running  = False

    async def start(self, queue: asyncio.Queue) -> None:
        self.running = True
        log.info(f"FakeBTReader: senoidal {self.freq_hz} Hz, {self.buf_size} muestras @ {self.fs} Hz")

        import math

        window_s = self.buf_size / self.fs     # duracion de cada ventana en segundos
        t_offset = 0.0                         # tiempo acumulado

        while self.running:
            # Generar una ventana completa de buf_size muestras
            raw = []
            for i in range(self.buf_size):
                t = t_offset + i / self.fs
                v_volt = 1.65 + 1.60 * math.sin(2 * math.pi * self.freq_hz * t)
                sample = int(max(0, min(4095, v_volt / 3.3 * 4095)))
                raw.append(sample)

            t_offset += window_s

            # Detectar picos simples
            umbral = 2800
            rpeaks = []
            for i in range(1, len(raw)):
                if raw[i - 1] < umbral <= raw[i]:
                    rpeaks.append(i)

            bpm = 0.0
            if len(rpeaks) >= 2:
                delta = rpeaks[-1] - rpeaks[-2]
                bpm   = 60.0 / (delta / self.fs)

            color = (
                "BLUE"   if 0 < bpm < 60   else
                "GREEN"  if bpm < 100       else
                "YELLOW" if bpm <= 140      else
                "RED"    if bpm > 140       else "NONE"
            )

            await queue.put({
                "t":      int(t_offset * 1000),
                "bpm":    round(bpm, 1),
                "color":  color,
                "min":    min(raw),
                "max":    max(raw),
                "rpeaks": rpeaks,
                "raw":    raw,
            })

            await asyncio.sleep(window_s)

    def stop(self) -> None:
        self.running = False