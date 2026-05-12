#pragma once
#include <Arduino.h>

// Pan-Tompkins algorithm for R-peak detection in ECG signals
struct PanTompkins {
    static const int WIN = 30;      // ~60ms to 500Hz
    float window[WIN] = {};         // Buffer for the moving average in Pan-Tompkins
    int head = 0;                   // Head index for the circular buffer
    float sum = 0;                  // Acumulated sum for the moving average
    float threshold = 0;            // Adaptive threshold for peak detection in Pan-Tompkins
    unsigned long lastPeakMs = 0;   // Timestamp of the last detected R-peak for refractory period calculation
    float bpm = 0;                  // Calculated beats per minute based on detected peaks

    float update(float filtered){
        // 1.Derivative
        static float prev = 0;          // Previous sample for derivative calculation
        float deriv = filtered - prev;  // Derivative to enhance the slope of the QRS complex
        prev = filtered;                // Update previous sample for the next iteration

        // 2. Squaring to enhance peaks
        float sq = deriv * deriv;

        // 3. Moving average
        sum -= window[head];            // Remove the oldest value from the sum
        window[head] = sq;              // Add the new squared value to the buffer
        sum += sq;                      // Update the sum with the new value
        head = (head + 1) % WIN;        // Move the head index in a circular manner
        float integrated = sum / WIN;   // Integrated signalfor peak detection

        // 4. Adaptive thresholding
        threshold *= 0.99f;

        // 5. Peak detection with refractory period
        unsigned long now = millis();   // Current timestamp for refractory period calculation
        // Detect a peak if the integrated signal exceeds the threshold and the refractory period has passed
        if(integrated > threshold && (now - lastPeakMs) > 250){
            bpm = 60000.0f / (now - lastPeakMs);
            lastPeakMs = now;
            threshold = integrated * 0.75f; // Update threshold 
            return bpm;   
        }
        return -1;        // -1 = no peak detected
    }

    // Reset the state of the Pan-Tompkins algorithm
    void reset() {
        memset(window, 0, sizeof(window)); 
        head = 0; 
        sum = 0.0f; 
        threshold = 0.0f; 
        lastPeakMs = 0;
    }
};