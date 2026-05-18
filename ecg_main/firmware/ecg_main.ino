#include "ble_server.h"
#include <ArduinoJson.h>

// Parametros de muestreo
static const int PIN_ADC = 34;
static const int FS = 500;              // Frecuencia de muestreo (500 Hz) 

// Timer
hw_timer_t* sampleTimer = nullptr;
volatile bool sampleReady = false;
void IRAM_ATTR onTimer(){ sampleReady = true; }

// Setup 
void setup(){
    Serial.begin(115200);
    analogReadResolution(12);
    pinMode(PIN_ADC, INPUT);

    // BLE
    bleBegin("ECG-ESP32");

    // Timer a 500 Hz
    sampleTimer = timerBegin(500);              
    timerAttachInterrupt(sampleTimer, &onTimer);
    timerAlarm(sampleTimer, 500, true, 0);    

    Serial.println("[OK] Raw data acquisition ready.");
}

// Loop
void loop(){
    if(!sampleReady) return;
    sampleReady = false;

    // 1. Leer ADC (12-bit)
    int raw = analogRead(PIN_ADC);

    // 2. Enviar raw data por BLE cada SEND_EVERY muestras
    static int sampleCount = 0;
    static const int SEND_EVERY = 5;

    sampleCount++;
    if (sampleCount % SEND_EVERY == 0) {
        StaticJsonDocument<64> doc;
        doc["t"] = millis();
        doc["raw"] = raw;

        char buf[64];
        serializeJson(doc, buf);
        bleSend(buf);
    }
}
