import asyncio
import logging
import time
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
            # Abrir el puerto, readline() buscara el \n
            self.ser = serial.Serial(self.port, self.baudrate, timeout=1)
        except serial.SerialException as e:
            log.error(f"No se pudo abrir {self.port}: {e}")
            return

        log.info("Conectado al ESP32. Leyendo datos…")

        loop = asyncio.get_event_loop()
        start_time = time.time()

        # Contador para detectar si el puerto esta abierto
        empty_reads_streak = 0

        while self.running:
            try:
                raw_bytes = await loop.run_in_executor(None, self.ser.readline)
                chunk = raw_bytes.decode("utf-8", errors="ignore").strip()
                
                if not chunk:
                    empty_reads_streak += 1
                    if empty_reads_streak % 5 == 0:
                        log.info(f"Esperando datos en {self.port}...")
                    continue

                # Parseo inmediato del formato
                parts = [p.strip() for p in chunk.split(",") if p.strip()]

                try:
                    # CASO 1. El ESP32 envía el formato compuesto "timestamp,voltaje"
                    if len(parts) == 2:
                        t_val = int(parts[0])
                        raw_val = float(parts[1])
                    elif len(parts) == 1:
                        t_val = int((time.time() - start_time) * 1000) 
                        raw_val = float(parts[0])
                    else:
                        log.warning(f"Estructura de paquete desconocida: {chunk!r}")
                        continue

                    empty_reads_streak = 0

                    data = {
                        "t": t_val,
                        "raw": raw_val
                    }
                    await queue.put(data)

                except ValueError:
                    log.warning(f"Error de casteo numerico en fragmento: {chunk!r}")
                    continue

            except serial.SerialException as e:
                log.error(f"Error de puerto serie: {e}")
                await asyncio.sleep(2)
            except Exception as e:
                log.exception(f"Error inesperado en BTReader: {e}")
                await asyncio.sleep(1)

    def stop(self) -> None:
        self.running = False
        if self.ser and self.ser.is_open:
            self.ser.close()
            log.info("Puerto BT cerrado.")