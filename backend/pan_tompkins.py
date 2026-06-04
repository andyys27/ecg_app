from collections import deque
import numpy as np

class PanTompkinsOnline:
    def __init__(self, fs = 300):
        self.fs = fs
        self.reset()
    
    # Reinicia por completo los buffers manteniendo la compatibilidad de variables
    def reset(self):
        # Buffer para derivada (lo dejamos de tamaño 5 por si tu código lo busca, pero usaremos 2 puntos)
        self.deriv_buffer = deque(maxlen=5)
        self.prev_sample = None
        
        # Ventana de integración en movimiento (~12% fisiológicos exactos de tu .ino)
        self.mvi_len = max(1, int(0.12 * self.fs))  
        self.mvi_buffer = deque([0.0] * self.mvi_len, maxlen=self.mvi_len)
        self.mvi_sum = 0.0
        
        # Para evaluar el flanco de subida (integ[i] > thresh && integ[i-1] <= thresh)
        self.prev_mvi_val = 0.0
        
        # Historial de los últimos 2 segundos para calcular el maxInt dinámico en tiempo real
        # Esto evita que el umbral se caiga a cero durante los ritmos lentos
        self.mvi_history = deque([0.0] * (self.fs * 2), maxlen=(self.fs * 2))
        
        # Umbrales adaptativos originales
        self.spki = 0.0         # Estimación del pico de señal
        self.npki = 0.0         # Estimación del pico de ruido
        self.threshold = 0.0
        
        # Periodo refractario (25% de FS idéntico al .ino)
        self.refractory_samples = int(0.25 * self.fs)
        self.samples_since_last_peak = self.refractory_samples + 1
        self.is_calibrated = True

    # Calibra los umbrales iniciales usando un fragmento (adaptado al 35% del .ino)
    def calibrate_thresholds(self, signal_chunk: list[float]):
        if len(signal_chunk) < self.fs:
            return
        
        diff = np.diff(signal_chunk)
        squared = diff * diff
        mvi_approx = np.convolve(squared, np.ones(self.mvi_len)/self.mvi_len, mode='valid')
        
        if len(mvi_approx) > 0:
            self.spki = float(np.max(mvi_approx))   
            self.threshold = (self.spki * 35) / 100  # 35% como tu .ino
            self.is_calibrated = True

    # Procesa la muestra filtrada actual y retorna un BOOLEANO estricto (True/False)
    def process_sample(self, filtered_sample: float) -> bool:
        self.samples_since_last_peak += 1
        
        # Mantener el buffer original por si las moscas
        self.deriv_buffer.append(filtered_sample)
        
        if self.prev_sample is None:
            self.prev_sample = filtered_sample
            return False

        # 1. Derivada al cuadrado (Diferencia simple de 2 puntos del .ino)
        d = filtered_sample - self.prev_sample
        self.prev_sample = filtered_sample
        squared = float(d * d)
        
        # 2. Ventana de integración móvil optimizada
        self.mvi_sum += squared - self.mvi_buffer[0]
        self.mvi_buffer.append(squared)
        mvi_val = self.mvi_sum / self.mvi_len
        
        # Guardar en el historial para buscar el máximo de forma continua
        self.mvi_history.append(mvi_val)
        max_int = max(self.mvi_history)
        
        # 3. Umbral adaptativo del .ino (35% del máximo absoluto reciente)
        self.threshold = (max_int * 35) / 100 if max_int > 0 else 0
        self.spki = max_int # Sincronizamos spki con maxInt
        
        # 4. Detección de picos por FLANCO DE SUBIDA + PERIODO REFRACTARIO
        is_r_peak = False
        if (mvi_val > self.threshold and self.prev_mvi_val <= self.threshold and 
            self.samples_since_last_peak > self.refractory_samples):
            
            is_r_peak = True
            self.samples_since_last_peak = 0
            
        # Guardar el valor actual para el flanco de la siguiente muestra
        self.prev_mvi_val = mvi_val

        return is_r_peak
    
    # Procesa un vector completo de datos usando la réplica exacta por bloques del .ino
    def process_batch(self, filtered_signal: list[float]) -> list[int]:
        buf_len = len(filtered_signal)
        if buf_len < 2:
            return []
            
        deriv_sq = np.zeros(buf_len)
        diff = np.diff(filtered_signal)
        deriv_sq[1:] = diff * diff
        
        win = max(1, int(self.fs * 12 / 100))
        integ = np.zeros(buf_len)
        running_sum = 0.0
        for i in range(buf_len):
            running_sum += deriv_sq[i]
            if i >= win: running_sum -= deriv_sq[i - win]
            integ[i] = running_sum / win
            
        max_int = np.max(integ) if buf_len > 0 else 0
        thresh = (max_int * 35) / 100 if max_int > 0 else 0
        
        self.threshold = thresh
        self.spki = max_int
        
        refractory = int(self.fs * 25 / 100)
        last_peak = -refractory - 1
        peaks = []
        
        for i in range(1, buf_len - 1):
            if integ[i] > thresh and integ[i - 1] <= thresh and (i - last_peak) > refractory:
                peaks.append(i)
                last_peak = i
                
        return peaks