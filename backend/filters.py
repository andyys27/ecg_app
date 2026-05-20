import numpy as np
from scipy.signal import butter, sosfilt, iirnotch, filtfilt, savgol_filter, find_peaks
from collections import deque

# Diseño de fitros
def bandpass(fs, low = 0.5, high = 45.0, order = 4):
    # Butterworth pasa-banda
    nyq = fs / 2
    lowcut = low / nyq
    highcut = high / nyq
    return butter(order, [lowcut, highcut], btype="band", output="sos")

def notch(fs, freq = 60.0, Q = 30.0):
    # IIR notch para ruido de linea
    w0 = freq / (fs / 2)
    b_notch, a_notch = iirnotch(w0, Q)
    return b_notch, a_notch

def savgol(window = 7, poly = 3):
    # Savitzky-Golay para suavizado
    return window, poly

# Procesamiento de ECG
class ECGProcessor:
    # Buffer circular para las ultimas N muestras 
    def __init__(self, fs = 300):
        self.fs = fs

        # Buffers circulares
        self.raw_history  = deque(maxlen=fs * 10)
        self.filt_history = deque(maxlen=fs * 10)

        # Filtros
        self.sos_bp = bandpass(fs)
        self.b_notch, self.a_notch = notch(fs)

        # Ultimo BPM conocido
        self.last_bpm        = 0.0
        self.last_color: str = "NONE"

    # API publica
    def process_window(self, esp32_packet) -> dict:
        raw_list  = esp32_packet.get("raw", [])
        if not raw_list:
            return {}
        raw_arr = np.array(raw_list, dtype=float)

        # Filtros
        filtered = self.apply_filters(raw_arr)

        # Picos R
        esp_peaks = esp32_packet.get("rpeaks", [])
        if esp_peaks:
            peaks = esp_peaks
        else:
            peaks = self.detect_peaks(filtered)

        # BPM
        bpm = float(esp32_packet.get("bpm", 0.0))
        if bpm > 0:
            self.last_bpm = bpm
        else:
            bpm = self.last_bpm
 
        color = esp32_packet.get("color", bpm_to_color(bpm))
        self.last_color = color

        # Actualizar historial
        self.raw_history.extend(raw_list)
        self.filt_history.extend(filtered.tolist())

        return {
            "raw":      raw_list,
            "filtered": [round(v, 2) for v in filtered],
            "bpm":      round(bpm, 1),
            "peaks":    peaks,          
            "color":    color,
            "t":        esp32_packet.get("t", 0),
            "min":      esp32_packet.get("min", int(raw_arr.min())),
            "max":      esp32_packet.get("max", int(raw_arr.max())),
        }

    # Devuelve los ultimos n puntos de ambas senales
    def snapshot(self, n = 300) -> dict:
        return {
            "raw":      list(self.raw_history)[-n:],
            "filtered": list(self.filt_history)[-n:],
        }

    # Metodos internos
    def apply_filters(self, signal) -> np.ndarray:
        # 1. Pasa-banda
        bp = sosfilt(self.sos_bp, signal)

        # 2. Notch 60 Hz
        notched = filtfilt(self.b_notch, self.a_notch, bp)

        # 3. Suavizado Savitzky-Golay
        smoothed = savgol_filter(notched, window_length=7, polyorder=3)
        return smoothed

    # Detecta picos R en la senal
    def detect_peaks(self, filtered):
        sig_range = filtered.max() - filtered.min()
        if sig_range < 50:
            return []

        height_thresh = filtered.min() + sig_range * 0.60
        refractory    = int(self.fs * 0.25)
 
        peaks, _ = find_peaks(filtered, height=height_thresh, distance=refractory)
        return peaks.tolist()


# Utilidades
def bpm_to_color(bpm) -> str:
    if bpm <= 0:   return "NONE"
    if bpm < 60:   return "BLUE"
    if bpm < 100:  return "GREEN"
    if bpm <= 140: return "YELLOW"
    return "RED"