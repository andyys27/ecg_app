import numpy as np
from scipy.signal import butter, iirnotch, sosfilt_zi, sosfilt
from collections import deque

from pan_tompkins import PanTompkinsOnline
from metrics import ECGMetricsCalculator

# Aplica filtros sincronos muestra por muestra arrastrando condiciones iniciales
class LiveECGFilter:
    def __init__(self, fs = 300):
        self.fs = fs
        nyq = fs / 2

        # Butterworth Pasa-Banda (0.5 - 40 Hz)
        self.sos_bp = butter(4, [0.5 / nyq, 40 / nyq], btype="band", output="sos")
        self.zi_bp = sosfilt_zi(self.sos_bp)

        # Notch (60 Hz)
        w0 = 60 / nyq
        b, a = iirnotch(w0, Q = 30)
        self.sos_nt = np.array([[b[0], b[1], b[2], a[0], a[1], a[2]]])
        self.zi_nt = sosfilt_zi(self.sos_nt)

    def process_sample(self, raw_sample):
        bp_filtered, self.zi_bp = sosfilt(self.sos_bp, [raw_sample], zi=self.zi_bp)
        notch_filtered, self.zi_nt = sosfilt(self.sos_nt, bp_filtered, zi=self.zi_nt)
        return float(notch_filtered[0])
    
# Procesamiento de ECG
class ECGProcessor:
    def __init__(self):
        self.fs = 300
        self.filter = None
        self.detector = None
        self.metrics = None

        # Historiales circulares para la visualizacion de snapshots
        self.raw_history = deque(maxlen=3000)
        self.filt_history = deque(maxlen=3000)

        # Inicializacion inmediata por defecto
        self.initialize_filters(self.fs)

    def initialize_filters(self, fs):
        self.fs = fs
        self.filter = LiveECGFilter(fs=fs)
        self.detector = PanTompkinsOnline(fs=fs)
        self.metrics = ECGMetricsCalculator(history_len=10)
        
        maxlen = int(fs * 10) # 10 segundos de historial
        self.raw_history = deque(list(self.raw_history), maxlen=maxlen)
        self.filt_history = deque(list(self.filt_history), maxlen=maxlen)

    # Procesa una unica muestra proveniente del streaming del ESP32 (Modo Online)
    def process_single_sample(self, sample_packet: dict) -> dict:
        raw_val = float(sample_packet["raw"])
        t_ms = sample_packet["t"]

        # Guardar en historial
        self.raw_history.append(raw_val)

        # 1. Filtrar muestra
        filtered_val = self.filter.process_sample(raw_val)
        self.filt_history.append(filtered_val)

        # 2. Evaluar pico R
        is_r_peak = self.detector.process_sample(filtered_val)
        
        # 3. Metricas inter-latido
        bpm = self.metrics.last_bpm
        rr_interval = 0
        total_beats = self.metrics.total_beats

        if is_r_peak:
            res = self.metrics.register_peak(t_ms)
            bpm = res["bpm"]
            rr_interval = res["rr_interval"]
            total_beats = res["total_beats"]

        color = self.metrics.bpm_to_color(bpm)

        return {
            "t": t_ms,
            "raw": raw_val,
            "filtered": round(filtered_val, 2),
            "is_r_peak": is_r_peak,
            "bpm": round(bpm, 1),
            "rr_interval": rr_interval,
            "total_beats": total_beats,
            "color": color,
            "min": float(min(self.raw_history)) if self.raw_history else raw_val,
            "max": float(max(self.raw_history)) if self.raw_history else raw_val
        }

    # Mantiene compatibilidad con el endpoint de analitica de CSVs (Modo Offline)
    def process_window(self, esp32_packet: dict) -> dict:
        raw_list = esp32_packet.get("raw", [])
        t_base = esp32_packet.get("t", 0)
        
        if not raw_list:
            return {}

        filtered_list = []
        peaks_indices = []
        ms_per_sample = 1000.0 / self.fs

        # Procesamos iterativamente el lote completo simulando el paso del tiempo por muestra
        for idx, raw_val in enumerate(raw_list):
            t_sample = int(t_base + (idx * ms_per_sample))
            res = self.process_single_sample({"raw": raw_val, "t": t_sample})
            
            filtered_list.append(res["filtered"])
            if res["is_r_peak"]:
                peaks_indices.append(idx)

        last_bpm = self.metrics.last_bpm

        return {
            "raw": raw_list,
            "filtered": filtered_list,
            "bpm": round(last_bpm, 1),
            "peaks": peaks_indices,
            "color": self.metrics.bpm_to_color(last_bpm),
            "t": t_base,
            "min": float(min(raw_list)),
            "max": float(max(raw_list)),
        }

    def snapshot(self, n=300):
        return {
            "raw": list(self.raw_history)[-n:],
            "filtered": list(self.filt_history)[-n:],
        }