// ecg_main/ecg_main.ino
#include "BluetoothSerial.h"
#include <ArduinoJSON.h>

BluetoothSerial SerialBT;
 
// Pines de ECG y Leds
const int PIN_SIGNAL = 32;
const int LED_AZUL = 2;
const int LED_VERDE = 4;
const int LED_AMARILLO = 5;
const int LED_ROJO = 18;

// Muestreo
const int FS = 100;
const int BUF_SIZE = 300;       // 3 segundos de ventana
const int DEAD_SAMPLES = 20;    // Muestras minimas entre picos

// Buffer
volatile int buf[BUF_SIZE];
volatile int idxISR = 0;
volatile bool bufListo = false;
volatile bool muestrear = true;

// Timer
hw_timer_t* timer = nullptr;

// ISR
volatile bool  hayMuestra  = false;
void IRAM_ATTR onTimer() {hayMuestra = true;}   // Avisa: loop() lee el ADC

// Helpers de LED
void setLeds(bool az, bool vd, bool am, bool ro) {
    digitalWrite(LED_AZUL, az ? HIGH:LOW);
    digitalWrite(LED_VERDE, vd ? HIGH:LOW);
    digitalWrite(LED_AMARILLO, am ? HIGH:LOW);
    digitalWrite(LED_ROJO, ro ? HIGH:LOW);
}

// Deteccion de picos con histeresis
float calcularBPM(volatile int* datos, int n, int umbAlto, int umbBajo) {
    int pico1 = -1; int pico2 = -1;
    bool arriba = false;

    for (int i = 0; i < n; i++) {
        int v = datos[i];
        if (!arriba && v > umbAlto) {
            arriba = true;
            if (pico1 == -1) {pico1 = i;} 
            else if ((i - pico1) > DEAD_SAMPLES) {pico2 = i; break;}
        } else if (arriba && v < umbBajo) {arriba = false;}
    }
    if (pico1 == -1 || pico2 == -1) return 0.0f;
    int deltaMuestras = pico2 - pico1;
    float periodoS = (float)deltaMuestras / FS;
    return 60.0f / periodoS;    // BPM
}

void setup() {
    Serial.begin(115200);
    analogReadResolution(12);             // 0–4095
    analogSetAttenuation(ADC_11db);       // Rango 0–3.3 V en GPIO32

    // Leds
    int leds[] = {LED_AZUL, LED_VERDE, LED_AMARILLO, LED_ROJO};
    for (int pin:leds) { pinMode(pin, OUTPUT); }
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
    // Adquisicion\
    if (hayMuestra && !bufListo) {
        hayMuestra = false;
        buf[idxISR] = analogRead(PIN_SIGNAL);
        idxISR++;
        if (idxISR >= BUF_SIZE) {
            idxISR   = 0;
            bufListo = true;
        }
    }

    // Procesamiento
    if (!bufListo) return;
    bufListo = false;

    // Rango de la ventana (para debug)
    int minVal = 4095, maxVal = 0;
    for (int i = 0; i < BUF_SIZE; i++) {
        if (buf[i] < minVal) minVal = buf[i];
        if (buf[i] > maxVal) maxVal = buf[i];
    }

    // Umbrales adaptativos basados en la ventana actual
    int rango = maxVal - minVal;
    int umbAlto = (rango > 200) ? minVal + (int)(rango * 0.70f) : 1600;
    int umbBajo = (rango > 200) ? minVal + (int)(rango * 0.40f) : 1500;

    float bpm = calcularBPM(buf, BUF_SIZE, umbAlto, umbBajo);
    // Leds
    if (bpm > 0   && bpm < 60 ) setLeds(true,  false, false, false);
    else if (bpm >= 60 && bpm < 100) setLeds(false, true,  false, false);
    else if (bpm >= 100&& bpm <=140) setLeds(false, false, true,  false);
    else if (bpm > 140) setLeds(false, false, false, true );
    else setLeds(false, false, false, false);

    // Clasificacion de color
    const char* color =
        (bpm > 0 && bpm < 60 ) ? "BLUE"   :
        (bpm >= 60 && bpm < 100) ? "GREEN"  :
        (bpm >= 100&& bpm <=140) ? "YELLOW" :
        (bpm > 140 ) ? "RED" : "NONE";

    // JSON a Bluetooth
    if (SerialBT.hasClient()) {
        StaticJsonDocument<8192> doc;
        doc["t"] = millis();
        doc["bpm"] = (int)bpm;
        doc["color"] = color;
        doc["min"] = minVal;
        doc["max"] = maxVal;
        JsonArray ecg = doc.createNestedArray("ecg");
        for (int i = 0; i < BUF_SIZE; i++) {ecg.add(buf[i]);}
        char jsonBuf[8192];
        serializeJson(doc, jsonBuf, sizeof(jsonBuf));
        SerialBT.println(jsonBuf);
    }

    // Debug Serial
    Serial.printf("Min:%4d  Max:%4d  UmbH:%4d  UmbL:%4d  BPM:%5.1f  [%s]\n",
                  minVal, maxVal, umbAlto, umbBajo, bpm, color);
}