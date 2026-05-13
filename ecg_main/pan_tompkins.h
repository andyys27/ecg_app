#pragma once
#include <Arduino.h>

// Algoritmo Pan-Tompkins para deteccion de picos R en ECG
struct PanTompkins {
    static const int WIN = 30;      // ~60ms to 500Hz
    float window[WIN] = {};         // Buffer circular para el promedio movil de la señal integrada
    int head = 0;                   // Head index para el buffer circular
    float sum = 0;                  // Suma acumulada para el promedio móvil
    float threshold = 0;            // Threshold adaptativo para la deteccion de picos en Pan-Tompkins
    unsigned long lastPeakMs = 0;   // Timestamp del ultimo pico R detectado para el calculo del periodo de refraccion
    float bpm = 0;                  // Latido por minuto calculado basado en los picos detectados

    float update(float filtered){
        // 1.Derivada
        static float prev = 0;          // Muestra previa para calcular la derivada
        float deriv = filtered - prev;  // Derivada simple 
        prev = filtered;                // Actualizar muestra anterior para la siguiente iteracion

        // 2. Cuadrado
        float sq = deriv * deriv;

        // 3. Promedio movil
        sum -= window[head];            // Eliminar el valor mas antiguo del buffer de la suma
        window[head] = sq;              // Agregar el nuevo valor al buffer
        sum += sq;                      // Agregar el nuevo valor a la suma acumulada
        head = (head + 1) % WIN;        // Mover el indice de la cabeza en una manera circular
        float integrated = sum / WIN;   // Senal integrada para deteccion de picos

        // 4. Threshold adaptativo 
        threshold *= 0.99f;

        // 5. Deteccion de picos con periodo de refraccion
        unsigned long now = millis();   // Timestamp actual 
        // Detectar un pico si la senal integrada excede el umbral y el periodo de refraccion ha pasado
        if(integrated > threshold && (now - lastPeakMs) > 250){
            bpm = 60000.0f / (now - lastPeakMs);
            lastPeakMs = now;
            threshold = integrated * 0.75f; // Actualizar el umbral 
            return bpm;   
        }
        return -1;        // -1 = no se detecto pico R en esta muestra
    }

    // Funcion para resetear el estado del algoritmo
    void reset() {
        memset(window, 0, sizeof(window)); 
        head = 0; 
        sum = 0.0f; 
        threshold = 0.0f; 
        lastPeakMs = 0;
    }
};