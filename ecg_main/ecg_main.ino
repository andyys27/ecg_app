#include "filters.h"
#include "pan_tompkins.h"
#include "wifi_ws.h"
#include <ArduinoJson.h>

// Parameters of adquisition and processing
static const int PIN_ADC = 34;
static const int FS = 500;              // Sampling frequency (500 Hz)
static const int NOTCH_FREQ = 60;       // Notch filter frequency (60 Hz)
static const float NOTCH_Q = 30.0f;     // Notch filter quality factor
static const float HP_FREQ = 0.5f;      // High-pass filter cutoff frequency (0.5 Hz)
static const float LP_FREQ = 40.0f;     // Low-pass filter

// Instance of filters and Pan-Tompkins algorithm
Biquad notchFilt, hpFilt, lpFilt;  // Filter instances
PanTompkins pt;             

// DC offset 
float dcEstimate = 2048;   // ADC 12-bit centered 

// Hardware timer for sampling
hw_timer_t* sampleTimer = nullptr;
volatile bool sampleReady = false;
void IRAM_ATTR onTimer(){ 
    sampleReady = true; 
}

// Setup 
void setup(){
    Serial.begin(115200);
    analogReadResolution(12);
    pinMode(PIN_ADC, INPUT);

    // Build filters
    notchFilt = makeNotch(FS, NOTCH_FREQ, NOTCH_Q);
    hpFilt = makeHP(FS, HP_FREQ);
    lpFilt = makeLP(FS, LP_FREQ);

    // WiFi and WebSocket server
    wifiWsBegin();

    // Timer at 500 Hz
    sampleTimer = timerBegin(500);              
    timerAttachInterrupt(sampleTimer, &onTimer);
    timerAlarm(sampleTimer, 500, true, 0);    

    Serial.println("[OK] Pipeline listo.");
}

// Loop
void loop(){
    wifiWsLoop();
    if(!sampleReady) return;
    sampleReady = false;

    // 1. Read ADC
    float raw = analogRead(PIN_ADC);

    // 2. Remove DC (First-order IIR, long τ)
    dcEstimate = 0.999f * dcEstimate + 0.001f * raw;
    float x = raw - dcEstimate;

    // 3. Filters
    float xN = notchFilt.process(x);
    float xH = hpFilt.process(xN);
    float xL = lpFilt.process(xH);

    // 4. Pan-Tompkins
    float bpm = pt.update(xL);
    bool rPeak = (bpm > 0);

    // 5. Send WebSocket as JSON every N samples
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
    wsBroadcast(buf);   
}
