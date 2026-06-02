# metrics.py
import numpy as np
from collections import deque

# Calcula frecuencia cardiaca y metricas estadisticas basadas en intervalos R-R
class ECGMetricsCalculator:
    def __init__(self, history_len = 10):
        self.r_peaks_timestamps = deque(maxlen=history_len)
        self.total_beats = 0
        self.last_bpm = 0.0
        self.last_peak_time = None

    # Registra un nuevo pico y recalcula las metricas
    def register_peak(self, timestamp_ms) -> dict:
        self.total_beats += 1
        self.r_peaks_timestamps.append(timestamp_ms)
        self.last_peak_time = timestamp_ms
        
        if len(self.r_peaks_timestamps) < 2:
            return {"bpm": 0, "rr_interval": 0, "total_beats": self.total_beats}

        # Calcular todos los intervalos R-R actuales en el historial 
        timestamps_arr = np.array(self.r_peaks_timestamps)
        rr_intervals_ms = np.diff(timestamps_arr)
        rr_intervals_sec = rr_intervals_ms / 1000.0

        # Filtrar valores fuera de limites fisiologicos normales (30 a 200 BPM)
        valid_rr = rr_intervals_sec[(rr_intervals_sec >= 0.3) & (rr_intervals_sec <= 2.0)]

        if len(valid_rr) == 0:
            return {"bpm": round(self.last_bpm, 1), "rr_interval": int(rr_intervals_ms[-1]), "total_beats": self.total_beats}

        # Medidas estadisticas basicas
        avg_rr_sec = np.mean(valid_rr)
        calculated_bpm = 60.0 / avg_rr_sec
        self.last_bpm = calculated_bpm

        return {
            "bpm": round(calculated_bpm, 1),
            "rr_interval": int(rr_intervals_ms[-1]), # Ultimo intervalo en ms
            "total_beats": self.total_beats,
        }
    
    # Control de timeout
    def check_timeout(self, current_timestamp_ms) -> float:
        if self.last_peak_time is not None:
            elapsed_ms = current_timestamp_ms - self.last_peak_time
            
            # Si pasan más de 5000 ms sin picos, la FC cae a 0
            if elapsed_ms > 5000:
                self.last_bpm = 0.0
                
        return round(self.last_bpm, 1)

    @staticmethod
    def bpm_to_color(bpm: float) -> str:
        if bpm <= 0:   return "NONE"
        if bpm < 60:   return "BLUE"
        if bpm < 100:  return "GREEN"
        if bpm <= 140: return "YELLOW"
        return "RED"