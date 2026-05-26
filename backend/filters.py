import numpy as np
from scipy.signal import butter, sosfilt, iirnotch, find_peaks, sosfilt_zi
from collections import deque

# Diseño de fitros
def bandpass(fs, low = 0.5, high = 45.0, order = 4):
    # Butterworth pasa-banda
    nyq = fs / 2
    lowcut = low / nyq
    highcut = high / nyq
    return butter(order, [lowcut, highcut], btype="band", output="sos")

def notch_sos(fs, freq = 60.0, Q = 30.0):
    # IIR notch para ruido de linea
    w0 = freq / (fs / 2)
    b, a = iirnotch(w0, Q)
    sos = np.array([[b[0], b[1], b[2], a[0], a[1], a[2]]])
    return sos

# Procesamiento de ECG
class ECGProcessor:
    def __init__(self):
        self.fs = 0.0
        self.fs_calculated = False 

        # Buffers temporales para calcular la FS
        self.timestamps = []
        self.required_packets_for_fs = 5

        # Buffers circulares para almacenar la historia de senales
        self.raw_history  = deque(maxlen=1000)
        self.filt_history = deque(maxlen=1000)

        # Filtros
        self.sos_bp = None
        self.sos_nt = None

        # Vectores de estado
        self.zi_bp = None
        self.zi_nt = None

        # Historial de picos R globales
        self.r_peaks_history = deque(maxlen=100)
        self.total_samples_processed = 0

        # Ultimo BPM conocido
        self.last_bpm   = 0.0
        self.last_color = "NONE"

    # Configura los filtros y los buffers una vez que tenemos la FS calculada
    def initialize_filters(self, fs):
        self.fs = fs
        self.sos_bp = bandpass(fs)
        self.sos_nt = notch_sos(fs)

        # Inicializar las condiciones iniciales
        self.zi_bp = sosfilt_zi(self.sos_bp)
        self.zi_nt = sosfilt_zi(self.sos_nt)

        # Redimensionar buffers para almacenar 10 s de senal
        new_maxlen = int(fs * 10)   
        self.raw_history  = deque(list(self.raw_history), maxlen=new_maxlen)
        self.filt_history = deque(list(self.filt_history), maxlen=new_maxlen)

        self.total_samples_processed = 0
        self.fs_calculated = True
        print(f"[ECG] Filtros con memoria inicializados a {fs:.2f} Hz")

    # Procesa un nuevo paquete de datos del ESP32
    def process_window(self, esp32_packet) -> dict:
        raw_list  = esp32_packet.get("raw", [])
        current_t = esp32_packet.get("t", 0)
        n_samples = len(raw_list)

        if not raw_list:
            return {}

        # 1. Logica de calculo de FS para modo online
        if not self.fs_calculated:
            self.timestamps.append(current_t)
            self.raw_history.extend(raw_list)

            if(len(self.timestamps) >= self.required_packets_for_fs):
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

        if filtered is None:
            filtered = raw_arr

        start_sample_idx = self.total_samples_processed

        # Actualizar historial de senales de forma inmediata
        self.raw_history.extend(raw_list)
        self.filt_history.extend(filtered.tolist())

        # Conteo absoluto de muestras para tracking temporal interno
        self.total_samples_processed += n_samples

        # 3. Deteccion de picos R y calculo de BPM (Offline)
        esp_peaks = esp32_packet.get("rpeaks", [])
        bpm = float(esp32_packet.get("bpm", 0.0))
        
        if esp_peaks or bpm > 0:
            # Modo Online: Usar el calculo del firmware
            peaks = esp_peaks
            if bpm > 0: self.last_bpm = bpm
            bpm = self.last_bpm
        else:
            # Modo Offline. Calcular usando la ventana de Scipy
            peaks = self.detect_offline_peaks_in_window(start_sample_idx, n_samples)
            bpm = self.calculate_offline_bpm()

        color = esp32_packet.get("color", bpm_to_color(bpm))
        self.last_color = color

        return {
            "raw":      raw_list,
            "filtered": [round(v, 2) for v in filtered],
            "bpm":      round(bpm, 1),
            "peaks":    peaks,          
            "color":    color,
            "t":        current_t,
            "min":      float(raw_arr.min()),
            "max":      float(raw_arr.max()),
        }

    # Metodos internos
    def apply_filters(self, signal) -> np.ndarray:
        if not self.fs_calculated or self.sos_bp is None or self.sos_nt is None:
            return signal
        try:
            signal_clean = np.asarray(signal, dtype=float)
            
            # 1. Pasa-banda arrastrando las condiciones de ventana anterior
            bp, self.zi_bp = sosfilt(self.sos_bp, signal_clean, zi=self.zi_bp)

            # 2. Notch 60 Hz arrastrando estados continuos
            notched, self.zi_nt = sosfilt(self.sos_nt, bp, zi=self.zi_nt)

            return notched
        except Exception as e:
            print(f"[Filtros] Error en procesamiento matemático: {e}")
            return signal

    # Detecta picos R en la senal
    def detect_offline_peaks_in_window(self, start_idx, n_samples):
        history_len = len(self.filt_history)
        if history_len < int(self.fs * 2):
            return []

        hist_arr = np.array(self.filt_history)
        sig_range = hist_arr.max() - hist_arr.min()
        if sig_range < 0.1:
            return []

        # Umbral adaptativo basado en el comportamiento de la senal
        height_thresh = hist_arr.min() + sig_range * 0.65
        refractory    = int(self.fs * 0.25)
    
        # Busqueda de picos en todo el historial
        all_peaks, _ = find_peaks(hist_arr, height=height_thresh, distance=refractory)

        local_peaks = []
        for p in all_peaks:
            global_samples_pos = self.total_samples_processed - history_len + p     # Checar p

            if len(self.r_peaks_history) == 0 or global_samples_pos > self.r_peaks_history[-1]:
                self.r_peaks_history.append(global_samples_pos)

            if start_idx <= global_samples_pos < (start_idx + n_samples):
                local_idx = global_samples_pos - start_idx
                local_peaks.append(int(local_idx))

        # Imprime en consola para monitorear si el algoritmo está encontrando picos globales
        if local_peaks:
            print(f"[SciPy Offline] Picos detectados en ventana: {local_peaks} | Total picos en historial: {len(self.r_peaks_history)}")
        return local_peaks
    
    # Calcula la frecuencia cardiaca usando los ultimos intervalos RR registrados en el historial
    def calculate_offline_bpm(self) -> float:
        if len(self.r_peaks_history) < 2:
            return self.last_bpm
        
        # Extraer los ultimos 10 intervalos estables
        peaks = list(self.r_peaks_history)[-10:]
        intervals_in_samples = np.diff(peaks)

        # Convertir intervalos de muestras a tiempo
        intervals_sec = intervals_in_samples / self.fs

        # Filtrar artefactos fisiologicos atipicos (menor a 30 bpm o mayor a 200 bpm)
        valid_intervals = intervals_sec[(intervals_sec > 0.3) & (intervals_sec < 2.0)]

        if len(valid_intervals) == 0:
            return self.last_bpm
        
        # Calculo estadistico (Media de los intervalos RR)
        avg_rr_sec = np.mean(valid_intervals)
        calculated_bpm = 60.0 / avg_rr_sec

        self.last_bpm = calculated_bpm
        return self.last_bpm

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