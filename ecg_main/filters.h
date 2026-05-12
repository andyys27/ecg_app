#pragma once
#include <math.h>

// IIR Filters (Biquads) and Pan-Tompkins implementation
struct Biquad {
    float b0,b1,b2,a1,a2;       // Feedforward (b) and feedback (a) coefficients
    float w1=0, w2=0;           // States (delay elements)

    float process(float x){
        float y = b0*x + w1;    // Actual output based on input and state
        w1 = b1*x - a1*y + w2;  // Update w1 for next sample
        w2 = b2*x - a2*y;       // Update w2 for next sample
        return y;
    }
};

// Notch 60 Hz, Q=30 
Biquad makeNotch(float fs, float freq, float Q){
    float w0 = 2*M_PI*freq/fs;      // Normalized angular frequency
    float alpha = sin(w0)/(2*Q);    // Notch filter coefficients using standard formula
    float c = cos(w0);              // osine coefficient for filter coefficients
    float a0 = 1 + alpha;           // Normalization coefficient

    // Coefficients for the biquad structure
    Biquad b;
    // Feedforward coefficients for the notch filter
    b.b0 = 1 / a0; 
    b.b1 = -2 * c / a0; 
    b.b2 = 1 / a0;    
    // Feedback coefficients for the notch filter
    b.a1 = -2 * c / a0; 
    b.a2 = (1 - alpha) / a0;        
    return b;
}

// Highpass 0.5 Hz 
Biquad makeHP(float fs, float fc){
    float w = 2*M_PI*fc/fs;             // Normalized angular frequency for the highpass filter
    float k = tan(w/2);                 // Pre-warping for bilinear transform
    float k2 = k*k;                     // Square of k for the coefficients
    float a0 = 1 + sqrt(2)*k + k2;      // Normalization coefficient

    // Coefficients for the biquad structure
    Biquad b;
    // Feedforward coefficients for the highpass filter 
    b.b0 = 1 / a0; 
    b.b1 = -2 / a0; 
    b.b2 = 1 / a0;       
    // Feedback coefficients for the highpass filter        
    b.a1 = 2 * (k2 - 1) / a0; 
    b.a2 = (1 - sqrt(2) * k + k2) / a0;     
    return b;
}

// Lowpass 40 Hz
Biquad makeLP(float fs, float fc){
    float w = 2*M_PI*fc/fs;         // Normalized angular frequency for the lowpass filter
    float k = tan(w/2);             // Pre-warping for bilinear transform
    float k2 = k*k;                 // Square of k for the coefficients
    float a0 = 1 + sqrt(2)*k + k2;  // Normalization coefficient

    // Coefficients for the biquad structure
    Biquad b;
    // Feedforward coefficients for the lowpass filter
    b.b0 = k2 / a0; 
    b.b1 = 2 * k2 / a0; 
    b.b2 = k2 / a0;       
    // Feedback coefficients for the lowpass filter
    b.a1 = 2 * (k2 - 1) / a0; 
    b.a2 = (1 - sqrt(2) * k + k2) / a0;     
    return b;
}