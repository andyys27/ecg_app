#pragma once
#include <math.h>

// Filtros IIR (Biquads) e implementacion Pan-Tompkins
struct Biquad {
    float b0,b1,b2,a1,a2;       // Coeficientes feedforward (b) y feedback (a)
    float w1=0, w2=0;           // Estados (elementos de retraso)

    float process(float x){
        float y = b0*x + w1;    // Salida actual basada en la entrada y el estado
        w1 = b1*x - a1*y + w2;  // Actualizar w1 para la siguiente muestra
        w2 = b2*x - a2*y;       // Actualizar w2 para la siguiente muestra
        return y;
    }
};

// Notch 60 Hz, Q=30 
Biquad makeNotch(float fs, float freq, float Q){
    float w0 = 2*M_PI*freq/fs;      // Frecuencia angular normalizada
    float alpha = sin(w0)/(2*Q);    // Coeficiente del filtro notch
    float c = cos(w0);              // Coeficiente de coseno para el filtro notch
    float a0 = 1 + alpha;           // Coeficiente de normalizacion

    // Coeficientes para la estructura biquad del filtro notch
    Biquad b;
    // Coeficientes feedforward para el filtro notch
    b.b0 = 1 / a0; 
    b.b1 = -2 * c / a0; 
    b.b2 = 1 / a0;    
    // Coeficientes feedback para el filtro notch
    b.a1 = -2 * c / a0; 
    b.a2 = (1 - alpha) / a0;        
    return b;
}

// Highpass 0.5 Hz 
Biquad makeHP(float fs, float fc){
    float w = 2*M_PI*fc/fs;             // Frecuencia angular normalizada para el filtro highpass
    float k = tan(w/2);                 // Pre-warping para la transformada bilineal
    float k2 = k*k;                     // Cuadrado de k para los coeficientes
    float a0 = 1 + sqrt(2)*k + k2;      // Coeficiente de normalizacion

    // Coeficientes para la estructura biquad
    Biquad b;
    // Coeficientes feedforward para el filtro highpass
    b.b0 = 1 / a0; 
    b.b1 = -2 / a0; 
    b.b2 = 1 / a0;       
    // Coeficientes feedback para el filtro highpass
    b.a1 = 2 * (k2 - 1) / a0; 
    b.a2 = (1 - sqrt(2) * k + k2) / a0;     
    return b;
}

// Lowpass 40 Hz
Biquad makeLP(float fs, float fc){
    float w = 2*M_PI*fc/fs;         // Frecuencia angular normalizada para el filtro lowpass
    float k = tan(w/2);             // Pre-warping para la transformada bilineal
    float k2 = k*k;                 // Cuadrado de k para los coeficientes
    float a0 = 1 + sqrt(2)*k + k2;  // Coeficiente de normalizacion

    // Coeficientes para la estructura biquad
    Biquad b;
    // Coeficientes feedforward para el filtro lowpass
    b.b0 = k2 / a0; 
    b.b1 = 2 * k2 / a0; 
    b.b2 = k2 / a0;       
    // Coeficientes feedback para el filtro lowpass
    b.a1 = 2 * (k2 - 1) / a0; 
    b.a2 = (1 - sqrt(2) * k + k2) / a0;     
    return b;
}