#include "BluetoothSerial.h"
#include <ArduinoJson.h>

BluetoothSerial SerialBT;
 
// Pines de ECG y Leds
const int PIN_SIGNAL = 32;
const int LED_AZUL = 2;
const int LED_VERDE = 4;
const int LED_AMARILLO = 15;
const int LED_ROJO = 18;

// Muestreo
const int FS = 300;
const int BUF_SIZE = 300;                       // 1 segundo de ventana a 300 Hz
const int DEAD_SAMPLES = (FS * 75) / 1000;      // Muestras mínimas entre picos

// Buffer compartido con ISR
volatile int buf[BUF_SIZE];
volatile int idxISR = 0;
volatile bool bufListo = false;

// Copia local para procesar sin bloquear la ISR
int bufProcesamiento[BUF_SIZE];

// Timer y Mutex para sección crítica
hw_timer_t* timer = nullptr;
portMUX_TYPE timerMux = portMUX_INITIALIZER_UNLOCKED;

// ISR ultra rápida
volatile bool hayMuestra = false;
void IRAM_ATTR onTimer() {
    hayMuestra = true;
}

// Helpers de LED
void setLeds(bool az, bool vd, bool am, bool ro) {
    digitalWrite(LED_AZUL, az ? HIGH:LOW);
    digitalWrite(LED_VERDE, vd ? HIGH:LOW);
    digitalWrite(LED_AMARILLO, am ? HIGH:LOW);
    digitalWrite(LED_ROJO, ro ? HIGH:LOW);
}

void setup() {
    Serial.begin(115200);
    analogReadResolution(12);             // 0–4095
    analogSetAttenuation(ADC_11db);       // Rango 0–3.3 V en GPIO32

    // Leds
    int leds[] = {LED_AZUL, LED_VERDE, LED_AMARILLO, LED_ROJO};
    for (int pin : leds) { pinMode(pin, OUTPUT); }
    setLeds(false, false, false, false);

    // Bluetooth
    SerialBT.begin("ESP32_Equipo2");

    // Timer a FS Hz
    timer = timerBegin(1000000);
    timerAttachInterrupt(timer, &onTimer);
    timerAlarm(timer, 1000000 / FS, true, 0);

    Serial.println("ECG INICIADO");
}

void loop() {
    // 1. Adquisición de datos desde la ISR
    if (hayMuestra && !bufListo) {
        portENTER_CRITICAL(&timerMux); // Protege las variables compartidas
        hayMuestra = false;
        buf[idxISR] = analogRead(PIN_SIGNAL);
        idxISR++;
        if (idxISR >= BUF_SIZE) {
            idxISR = 0;
            bufListo = true;
            // Clonamos el buffer a uno local para liberar al principal de inmediato
            memcpy(bufProcesamiento, (const void*)buf, sizeof(buf));
        }
        portEXIT_CRITICAL(&timerMux);
    }

    // Procesamiento solo cuando el buffer local esté lleno
    if (!bufListo) return;
    
    // Resetear bandera de listo para que la ISR vuelva a llenar el buffer principal
    portENTER_CRITICAL(&timerMux);
    bufListo = false;
    portEXIT_CRITICAL(&timerMux);

    // 2. Rango de la ventana (usando buffer local)
    int minVal = 4095, maxVal = 0;
    for (int i = 0; i < BUF_SIZE; i++) {
        if (bufProcesamiento[i] < minVal) minVal = bufProcesamiento[i];
        if (bufProcesamiento[i] > maxVal) maxVal = bufProcesamiento[i];
    }

    // Umbrales adaptativos
    int rango = maxVal - minVal;
    int umbAlto = (rango > 200) ? minVal + (int)(rango * 0.70f) : 1600;
    int umbBajo = (rango > 200) ? minVal + (int)(rango * 0.40f) : 1500;

    // Pan-Tompkins simplificado (Variables estáticas en memoria global, no en el Stack)
    static long deriv_sq[BUF_SIZE];
    static long integ[BUF_SIZE];

    // Derivada al cuadrado
    int prev = bufProcesamiento[0];
    deriv_sq[0] = 0;
    for (int i = 1; i < BUF_SIZE; i++) {
        int d = bufProcesamiento[i] - prev;
        prev = bufProcesamiento[i];
        deriv_sq[i] = (long)d * (long)d;
    }

    // Ventana integradora
    int win = FS * 12 / 100; if (win < 1) win = 1;
    long sum = 0;
    for (int i = 0; i < BUF_SIZE; i++) {
        sum += deriv_sq[i];
        if (i >= win) sum -= deriv_sq[i - win];
        integ[i] = sum / win;
    }

    // Umbral adaptativo simple
    long maxInt = 0;
    for (int i = 0; i < BUF_SIZE; i++) if (integ[i] > maxInt) maxInt = integ[i];
    long thresh = maxInt > 0 ? (maxInt * 35) / 100 : 0;

    // Detección de picos
    const int refractory = FS * 25 / 100; 
    int lastPeak = -refractory - 1;
    int peakCount = 0;
    int peakIdxs[64]; 
    for (int i = 1; i < BUF_SIZE - 1; i++) {
        if (integ[i] > thresh && integ[i - 1] <= thresh && (i - lastPeak) > refractory) {
            if (peakCount < 64) peakIdxs[peakCount++] = i;
            lastPeak = i;
        }
    }

    // Calcular BPM
    float bpm = 0.0f;
    if (peakCount >= 2) {
        int p1 = peakIdxs[peakCount - 2];
        int p2 = peakIdxs[peakCount - 1];
        int deltaSamples = p2 - p1;
        float periodS = (float)deltaSamples / (float)FS;
        if (periodS > 0) bpm = 60.0f / periodS;
    }

    // Leds según bpm
    if (bpm > 0 && bpm < 60 ) setLeds(true, false, false, false);
    else if (bpm >= 60 && bpm < 100) setLeds(false, true, false, false);
    else if (bpm >= 100 && bpm <= 140) setLeds(false, false, true, false);
    else if (bpm > 140) setLeds(false, false, false, true);
    else setLeds(false, false, false, false);

    const char* color =
        (bpm > 0 && bpm < 60 ) ? "BLUE"   :
        (bpm >= 60 && bpm < 100) ? "GREEN"  :
        (bpm >= 100 && bpm <= 140) ? "YELLOW" :
        (bpm > 140 ) ? "RED" : "NONE";

    unsigned long now = millis();

    // Transmisión JSON a Bluetooth
    if (SerialBT.hasClient()) {
        // Reservamos memoria de manera segura para el JSON
        StaticJsonDocument<4096> doc;
        doc["t"] = now;
        doc["bpm"] = (int)bpm;
        doc["color"] = color;
        doc["min"] = minVal;
        doc["max"] = maxVal;
        
        JsonArray peaks = doc.createNestedArray("rpeaks");
        for (int k = 0; k < peakCount; k++) {
            int idx = peakIdxs[k];
            long t_peak = (long)now - (long)((BUF_SIZE - 1 - idx) * 1000L / FS);
            peaks.add(t_peak);
        }
        
        JsonArray ecg = doc.createNestedArray("ecg");
        for (int i = 0; i < BUF_SIZE; i++) {
            ecg.add(bufProcesamiento[i]);
        }
        
        // Enviamos directo al Bluetooth y agregamos el salto de línea al final
        serializeJson(doc, SerialBT);
        SerialBT.println(); 
    }

    // Debug Serial
    Serial.printf("Min:%4d  Max:%4d  UmbH:%4d  UmbL:%4d  BPM:%5.1f  [%s]\n",
                  minVal, maxVal, umbAlto, umbBajo, bpm, color);
}