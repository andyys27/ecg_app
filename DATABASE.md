# Documentación Técnica del Sistema de Datos: OndaVital
---

## 1. Arquitectura General y Flujo de Datos

Este módulo especifica la arquitectura de persistencia para **OndaVital**, diseñado para la adquisición y almacenamiento de señales electrocardiográficas (ECG) en tiempo real. 

El sistema procesa datos biomédicos en el frontend (detección de picos R y cálculo de BPM) y los persiste de forma estructurada en un entorno relacional administrado en **Supabase (PostgreSQL)**.

---

## 2. Estructura de Tablas (DDL Oficial)

```sql
-- 1. TABLA: PROFILES (Ficha Fisiológica)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    edad INT4 CHECK (edad >= 0 AND edad < 130),
    sexo TEXT CHECK (sexo IN ('Masculino', 'Femenino', 'Otro')),
    peso_kg NUMERIC(5,2),
    altura_cm NUMERIC(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA: SESSIONS (Historial de Monitoreo)
CREATE TABLE public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    fecha TIMESTAMPTZ DEFAULT NOW(),
    duracion_seg INT4 NOT NULL DEFAULT 0,
    modo TEXT NOT NULL CHECK (modo IN ('websocket', 'offline')),
    registro_mitbih TEXT DEFAULT NULL
);

-- 3. TABLA: ECG_MEASUREMENTS (Métricas Clínicas y Diagnóstico)
CREATE TABLE public.ecg_measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    bpm_promedio NUMERIC(5,1) DEFAULT NULL,
    estado TEXT NOT NULL,
    notas TEXT DEFAULT NULL,
    total_beats INT4 DEFAULT 0,
    
    CONSTRAINT ecg_measurements_estado_check CHECK (
        estado IN ('normal', 'taquicardia', 'bradicardia', 'elevado', 'muerte', 'indefinido')
    )
);