from collections import deque
import numpy as np

# Implementacion en tiempo real y causal de Pan-Tompkins
class PanTompkinsOnline:
    def __init__(self, fs = 300):
        self.fs = fs
        self.reset()
    
    # Reinicia por completo los buffers y umbrales para un nuevo flujo 
    def reset(self):
        # Buffer para derivada 
        self.deriv_buffer = deque(maxlen=5)
        
        # Ventana de integración en movimiento (~150ms fisiológicos)
        self.mvi_len = int(0.15 * self.fs)  
        self.mvi_buffer = deque([0.0] * self.mvi_len, maxlen=self.mvi_len)
        self.mvi_sum = 0.0
        
        # Umbrales adaptativos
        self.spki = 0.0         # Estimación del pico de señal
        self.npki = 0.0         # Estimación del pico de ruido
        self.threshold = 0.0
        
        # Periodo refractario (200ms mínimos entre latidos)
        self.refractory_samples = int(0.20 * self.fs)
        self.samples_since_last_peak = self.refractory_samples
        self.is_calibrated = False

    # Calibra los umbrales iniciales usando un fragmento    
    def calibrate_thresholds(self, signal_chunk: list[float]):
        if len(signal_chunk) < self.fs:
            return
        
        # Simulamos el MVI en el bloque de calibración para estimar magnitudes
        diff = np.diff(signal_chunk)
        squared = diff * diff
        mvi_approx = np.convolve(squared, np.ones(self.mvi_len)/self.mvi_len, mode='valid')
        
        if len(mvi_approx) > 0:
            self.spki = float(np.max(mvi_approx) * 0.5)   # El pico de señal esperado
            self.npki = float(np.mean(mvi_approx) * 0.1)  # El ruido base esperado
            self.threshold = self.npki + 0.25 * (self.spki - self.npki)
            self.is_calibrated = True

    # Procesa la muestra filtrada actual y retorna True si es un pico R
    def process_sample(self, filtered_sample: float) -> bool:
        self.samples_since_last_peak += 1
        self.deriv_buffer.append(filtered_sample)
        
        if len(self.deriv_buffer) < 5:
            return False

        # 1. Derivada de 5 puntos (Formula de Pan-Tompkins)
        # y[n] = (2x[n] + x[n-1] - x[n-3] - 2x[n-4]) / 8
        d = (2 * self.deriv_buffer[4] + self.deriv_buffer[3] - 
             self.deriv_buffer[1] - 2 * self.deriv_buffer[0]) / 8.0
        
        # 2. Elevar al cuadrado
        squared = d * d
        
        # 3. Ventana de integración movil optimizada
        self.mvi_sum += squared - self.mvi_buffer[0]
        self.mvi_buffer.append(squared)
        mvi_val = self.mvi_sum / self.mvi_len

        if not self.is_calibrated and mvi_val > 0.01:
            self.spki = mvi_val
            self.threshold = 0.5 * self.spki
            self.is_calibrated = True

        # 4. Umbralizacion adaptativa dinamica
        is_r_peak = False
        if mvi_val > self.threshold and self.samples_since_last_peak > self.refractory_samples:
            # Pico detectado
            is_r_peak = True
            self.samples_since_last_peak = 0
            # Ajustar umbral de senal
            self.spki = 0.125 * mvi_val + 0.875 * self.spki
        else:
            # Deteccion de ruido
            self.npki = 0.125 * mvi_val + 0.875 * self.npki

        # Actualizar umbral adaptativo
        self.threshold = self.npki + 0.25 * (self.spki - self.npki)

        return is_r_peak
    
    # Procesa un vector completo de datos 
    def process_batch(self, filtered_signal: list[float]) -> list[int]:
        self.reset()
        
        # Calibrar usando un fragmento inicial 
        calibration_window = filtered_signal[:int(2 * self.fs)]
        self.calibrate_thresholds(calibration_window)
        
        peaks = []
        for idx, sample in enumerate(filtered_signal):
            if self.process_sample(sample):
                peaks.append(idx)
                
        return peaks