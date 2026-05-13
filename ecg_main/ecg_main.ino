#include "filters.h"
#include "pan_tompkins.h"
#include "ble_server.h"
#include <ArduinoJson.h>

// Parametros de procesamiento
static const int PIN_ADC = 34;
static const int FS = 500;              // Frecuencia de muestreo (500 Hz)
static const int NOTCH_FREQ = 60;       // Frecuencia del filtro notch (60 Hz)
static const float NOTCH_Q = 30.0f;     // Factor de calidad del filtro notch
static const float HP_FREQ = 0.5f;      // Frecuencia de corte del filtro pasa-alto (0.5 Hz)
static const float LP_FREQ = 40.0f;     // Frecuencia de corte del filtro pasa-bajo

// Instancias
Biquad notchFilt, hpFilt, lpFilt;  // Instancias de filtros 
PanTompkins pt;             

float dcEstimate = 2048;   // ADC 12-bit centroide 

// Timer
hw_timer_t* sampleTimer = nullptr;
volatile bool sampleReady = false;
void IRAM_ATTR onTimer(){ sampleReady = true; }

// Setup 
void setup(){
    Serial.begin(115200);
    analogReadResolution(12);
    pinMode(PIN_ADC, INPUT);

    // Inicializar filtros
    notchFilt = makeNotch(FS, NOTCH_FREQ, NOTCH_Q);
    hpFilt = makeHP(FS, HP_FREQ);
    lpFilt = makeLP(FS, LP_FREQ);

    // BLE
    bleBegin("ECG-ESP32");

    // Timer a 500 Hz
    sampleTimer = timerBegin(500);              
    timerAttachInterrupt(sampleTimer, &onTimer);
    timerAlarm(sampleTimer, 500, true, 0);    

    Serial.println("[OK] Pipeline listo.");
}

// Loop
void loop(){
    if(!sampleReady) return;
    sampleReady = false;

    // 1. Leer ADC
    float raw = analogRead(PIN_ADC);

    // 2. Remover DC 
    dcEstimate = 0.999f * dcEstimate + 0.001f * raw;
    float x = raw - dcEstimate;

    // 3. Filtros
    float xN = notchFilt.process(x);
    float xH = hpFilt.process(xN);
    float xL = lpFilt.process(xH);

    // 4. Pan-Tompkins
    float bpm = pt.update(xL);
    bool rPeak = (bpm > 0);

    // 5. Enviar por BLE cada SEND_EVERY muestras
    static int sampleCount = 0;
    static const int SEND_EVERY = 5;

    sampleCount++;
        if (sampleCount % SEND_EVERY == 0) {
        StaticJsonDocument<128> doc;
        doc["t"] = millis();
        doc["raw"] = (int)raw;
        doc["ecg"] = xL;
        if(rPeak){
            doc["bpm"] = bpm;
            doc["rPeak"] = true;
        }

        char buf[128];
        serializeJson(doc, buf);
        bleSend(buf);  
        }
}
