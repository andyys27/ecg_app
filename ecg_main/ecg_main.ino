#include "ble_server.h"
#include <ArduinoJson.h>

// Parametros
static const int  PIN_ADC     = 34;
static const int  FS          = 200;        // Hz de muestreo
static const int  SEND_EVERY  = 5;          // Enviar 1 de cada 5 muestras → 40 paquetes/s

// Deteccion de picos
static const int  UMBRAL_HIGH = 2800;       // ADC 12-bit: ~2.25 V  (ajustar según offset)
static const int  UMBRAL_LOW  = 1500;       // Histeresis para no rebotar

static unsigned long lastPeakMs   = 0;
static float         currentPPM   = 0.0f;
static bool          overThresh   = false;  // Maquina de estados simple

// Timer ISR
hw_timer_t*    sampleTimer  = nullptr;
volatile bool  sampleReady  = false;

void IRAM_ATTR onTimer() { sampleReady = true; }

void setup() {
    Serial.begin(115200);
    analogReadResolution(12);           // 0–4095
    analogSetAttenuation(ADC_11db);     // Rango 0–3.3 V en GPIO34
    pinMode(PIN_ADC, INPUT);

    // BLE
    bleBegin("ECG-ESP32");

    // Timer a FS Hz
    sampleTimer = timerBegin(1000000);              // contador a 1 MHz
    timerAttachInterrupt(sampleTimer, &onTimer);
    timerAlarm(sampleTimer, 1000000 / FS, true, 0); // disparo cada 1/FS segundos

    Serial.printf("[OK] Adquisición a %d Hz lista.\n", FS);
}

void loop() {
    if (!sampleReady) return;
    sampleReady = false;

    // 1. Leer ADC
    int raw = analogRead(PIN_ADC);

    // 2. Deteccion de pico con histeresis
    //    Sube por encima de UMBRAL_HIGH → detecta flanco ascendente → mide período
    if (!overThresh && raw >= UMBRAL_HIGH) {
        overThresh = true;

        unsigned long now = millis();
        if (lastPeakMs > 0) {
            float periodoS = (now - lastPeakMs) / 1000.0f;
            // Solo registrar si el período es fisiológicamente posible (20–300 ppm)
            if (periodoS > 0.2f && periodoS < 3.0f) {
                currentPPM = 60.0f / periodoS;
            }
        }
        lastPeakMs = now;
    } else if (overThresh && raw < UMBRAL_LOW) {
        overThresh = false;   // Resetea cuando baja: listo para el siguiente pico
    }

    // 3. Enviar cada SEND_EVERY muestras
    static int count = 0;
    if (++count % SEND_EVERY != 0) return;

    // Clasificación por color
    const char* color;
    if      (currentPPM <= 0  )  color = "NONE";
    else if (currentPPM <  60 )  color = "BLUE";
    else if (currentPPM <= 100)  color = "GREEN";
    else if (currentPPM <= 140)  color = "YELLOW";
    else                         color = "RED";

    // Serializar y enviar
    StaticJsonDocument<96> doc;
    doc["t"]     = millis();
    doc["raw"]   = raw;
    doc["ppm"]   = (int)currentPPM;
    doc["color"] = color;

    char buf[96];
    serializeJson(doc, buf);
    bleSend(buf);

    // Debug serial
    Serial.printf("raw=%4d  ppm=%5.1f  %s\n", raw, currentPPM, color);
}