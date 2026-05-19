import numpy as np
from scipy.signal import butter, sosfilt, iirnotch, filtfilt, savgol_filter, find_peaks
from collections import deque

# Diseño de fitros
def bandpass(fs, low = 0.5, high = 150.0, order = 4):
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
    def __init__(self, fs = 300, buffer_seconds = 5):
        self.fs = fs
        self.buf_size = fs * buffer_seconds

        # Buffers circulares
        self.raw_buf  = deque([0.0] * self.buf_size, maxlen=self.buf_size)
        self.filt_buf = deque([0.0] * self.buf_size, maxlen=self.buf_size)

        # Filtros
        self.sos_bp = bandpass(fs)
        self.b_notch, self.a_notch = notch(fs)
        self.sg_win, self.sg_poly  = savgol()

        # Estado de picos
        self.last_peak_idx  = -1
        self.last_bpm       = 0.0
        self.sample_count   = 0

        # Periodo refractario ~250 ms
        self.refractory = int(fs * 0.25)

    # API publica
    def push(self, raw_value) -> dict:
        # Recibe una muestra cruda y devuelve el paquete que se enviara al frontend por WebSocket
        self.raw_buf.append(float(raw_value))
        self.sample_count += 1

        # Filtrar el buffer completo
        raw_arr  = np.array(self.raw_buf)
        filtered = self.apply_filters(raw_arr)

        # Actualizar buffer filtrado
        latest_filtered = float(filtered[-1])
        self.filt_buf.append(latest_filtered)

        # Deteccion de picos cada FS muestras
        peaks, bpm = [], self.last_bpm
        if self.sample_count % self.fs == 0:
            peaks, bpm = self.detect_peaks(filtered)
            self.last_bpm = bpm

        color = bpm_to_color(bpm)

        return {
            "raw":      raw_value,
            "filtered": round(latest_filtered, 2),
            "bpm":      round(bpm, 1),
            "peaks":    peaks,          # indices relativos al buffer actual
            "color":    color,
        }

    def snapshot(self, n = 300) -> dict:
        # Devuelve los ultimos n puntos de ambas senales
        raw_arr  = list(self.raw_buf)[-n:]
        filt_arr = list(self.filt_buf)[-n:]
        return {"raw": raw_arr, "filtered": filt_arr}

    # Metodos internos
    def apply_filters(self, signal) -> np.ndarray:
        # 1. Pasa-banda
        bp = sosfilt(self.sos_bp, signal)

        # 2. Notch 60 Hz
        notched = filtfilt(self.b_notch, self.a_notch, bp)

        # 3. Suavizado Savitzky-Golay
        smoothed = savgol_filter(notched, self.sg_win, self.sg_poly)
        return smoothed

    def detect_peaks(self, filtered):
        # Detecta picos R con find_peaks
        sig_range = filtered.max() - filtered.min()
        if sig_range < 50:
            return [], self.last_bpm

        height_thresh = filtered.min() + sig_range * 0.60

        peaks, _ = find_peaks(
            filtered,
            height   = height_thresh,
            distance = self.refractory,
        )

        if len(peaks) < 2:
            return peaks.tolist(), self.last_bpm

        # BPM promedio de los ultimos intervalos R-R
        rr_intervals = np.diff(peaks) / self.fs      
        mean_rr      = float(np.mean(rr_intervals))
        bpm          = 60.0 / mean_rr if mean_rr > 0 else 0.0

        # Sanitizar. Rango fisiológico 20–300 BPM
        bpm = bpm if 20 < bpm < 300 else self.last_bpm

        return peaks.tolist(), bpm


# Utilidades
def bpm_to_color(bpm: float) -> str:
    if bpm <= 0:   return "NONE"
    if bpm < 60:   return "BLUE"
    if bpm < 100:  return "GREEN"
    if bpm <= 140: return "YELLOW"
    return "RED"