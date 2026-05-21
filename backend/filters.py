import numpy as np
from scipy.signal import butter, sosfilt, iirnotch, filtfilt, savgol_filter, find_peaks, lfilter
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

# Procesamiento de ECG
class ECGProcessor:
    def __init__(self):
        self.fs = 0.0
        self.fs_calculated = False 

        # Buffers temporales para calcular la FS
        self.timestamps = []
        self.required_sampled_fs = 250.0

        # Buffers circulares para almacenar la historia de senales
        self.raw_history  = deque(maxlen=1000)
        self.filt_history = deque(maxlen=1000)

        # Filtros
        self.sos_bp = None
        self.b_notch, self.a_notch = None, None

        # Ultimo BPM conocido
        self.last_bpm   = 0.0
        self.last_color = "NONE"

    # Configura los filtros y los buffers una vez que tenemos la FS calculada
    def initialize_filters(self, fs):
        self.fs = fs
        self.sos_bp = bandpass(fs)
        self.b_notch, self.a_notch = notch(fs)

        # Redimensionar buffers para la nueva FS
        new_maxlen = int(fs * 10)   
        self.raw_history  = deque(list(self.raw_history), maxlen=new_maxlen)
        self.filt_history = deque(list(self.filt_history), maxlen=new_maxlen)

        self.fs_calculated = True
        print(f"[ECG] Filtros inicializados dinámicamente a {fs:.2f} Hz")

    # Procesa un nuevo paquete de datos del ESP32
    def process_window(self, esp32_packet) -> dict:
        raw_list  = esp32_packet.get("raw", [])
        current_t = esp32_packet.get("t", 0)

        if not raw_list:
            return {}

        # 1. Logica de calculo de FS
        if not self.fs_calculated:
            self.timestamps.append(current_time)
            self.raw_history.extend(raw_list)

            if(len(self.timestamps) >= self.required_sampled_fs):
                total_duration = self.timestamps[-1] - self.timestamps[0]
                if total_duration > 0:
                    samples_per_packet = len(raw_list)
                    avg_packet_period = total_duration / (len(self.timestamps) - 1)
                    calculated_fs = samples_per_packet / avg_packet_period
                    self.initialize_filters(calculated_fs)
                else:
                    return {"status": "CALIBRATING_CLOCK"}
            else:
                return {"status": "CALIBRATING_CLOCK"}

        #  2. Procesamiento
        raw_arr = np.array(raw_list, dtype=float)
        filtered = self.apply_filters(raw_arr)

        # Picos R
        esp_peaks = esp32_packet.get("rpeaks", [])
        peaks = esp_peaks if esp_peaks else peaks = self.detect_peaks(filtered)

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
            "t":        current_t,
            "min":      int(raw_arr.min()),
            "max":      round(self.fs, 2)
        }

    # Metodos internos
    def apply_filters(self, signal) -> np.ndarray:
        if not self.fs_calculated:
            return signal

        # 1. Pasa-banda
        bp = sosfilt(self.sos_bp, signal)

        # 2. Notch 60 Hz
        if len(signal) > 15:
            notched = filtfilt(self.b_notch, self.a_notch, bp)
        else:
            notched = lfilter(self.b_notch, self.a_notch, bp)

        # 3. Suavizado Savitzky-Golay
        smoothed = savgol_filter(notched, window_length=7, polyorder=3)
        return smoothed

    # Detecta picos R en la senal
    def detect_peaks(self, filtered):
        if not self.fs_calculated: return []

        sig_range = filtered.max() - filtered.min()
        if sig_range < 50:
            return []

        height_thresh = filtered.min() + sig_range * 0.60
        refractory    = int(self.fs * 0.25)
 
        peaks, _ = find_peaks(filtered, height=height_thresh, distance=refractory)
        return peaks.tolist()
    
    def snapshot(self, n=300):
        return {
            "raw": list(self.raw_history)[-n:],
            "filtered": list(self.filt_history)[-n:],
        }

# Utilidades
def bpm_to_color(bpm) -> str:
    if bpm <= 0:   return "NONE"
    if bpm < 60:   return "BLUE"
    if bpm < 100:  return "GREEN"
    if bpm <= 140: return "YELLOW"
    return "RED"