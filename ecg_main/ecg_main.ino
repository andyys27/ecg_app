#include "BluetoothSerial.h"

BluetoothSerial SerialBT;
 
const int PIN_SIGNAL = 32;
const int FS = 300;

hw_timer_t* timer = nullptr;
portMUX_TYPE timerMux = portMUX_INITIALIZER_UNLOCKED;
volatile bool hayMuestra = false;

// ISR
void IRAM_ATTR onTimer() {
    hayMuestra = true;
}

void setup() {
    Serial.begin(115200);
    analogReadResolution(12);             // 0–4095
    analogSetAttenuation(ADC_11db);       // Rango 0–3.3 V en GPIO32

    // Bluetooth
    SerialBT.begin("ESP32_Equipo2");

    // Timer configurado a FS Hz
    timer = timerBegin(1000000);
    timerAttachInterrupt(timer, &onTimer);
    timerAlarm(timer, 1000000 / FS, true, 0);

    Serial.println("FIRMWARE DE STREAMING INICIADO");
}

void loop() {
    // 1. Adquisición de datos desde la ISR
    if (hayMuestra) {
        portENTER_CRITICAL(&timerMux); // Protege las variables compartidas
        hayMuestra = false;
        portEXIT_CRITICAL(&timerMux);

        // Adquisicion inmediata
        int raw = analogRead(PIN_SIGNAL);
        unsigned long time = millis();

        // Transmision inmediata muestra por muestra en txt
        SerialBT.print(time);
        SerialBT.print(",");
        SerialBT.println(raw);

            // Debug Serial
        Serial.printf("Time:%4lu  Raw:%4d\n", time, raw);
    }
}