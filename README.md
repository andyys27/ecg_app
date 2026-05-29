# 🫀 ECG Digital Monitoring System

**Un sistema integral de adquisición, procesamiento y visualización de señales electrocardiográficas en tiempo real**

Proyecto académico del curso *Diseño de Sistemas de Bioinstrumentación* que integra electrónica analógica (ECG embebido) con procesamiento digital avanzado y una interfaz web interactiva. El sistema detecta automáticamente los complejos QRS, calcula métricas cardíacas y almacena el historial de sesiones.

---

## ⚡ Características Principales

**Adquisición en Tiempo Real**
- Conexión inalámbrica con ESP32 vía WebSocket
- Frecuencia de muestreo: 300 Hz
- Conversión analógica-digital de 12 bits

**Procesamiento Avanzado de Señales**
- Algoritmo **Pan-Tompkins** causal y optimizado para detección de picos R
- Filtrado adaptativo IIR de banda (0.5-45 Hz)
- Calibración automática de umbrales
- Manejo de ruido y artefactos

**Cálculo de Métricas Cardíacas**
- Frecuencia cardíaca (BPM) con validación fisiológica
- Intervalos R-R instantáneos y promediados
- Detección de estados: Normal, Elevado, Taquicardia, Bradicardia
- Contador de latidos totales (QRS)

**Interfaz Web**
- Dashboard reactivo con visualización dual (cruda + filtrada)
- Gráficos animados con Chart.js y Recharts
- Modo de validación con base de datos MIT-BIH
- Autenticación segura con Supabase
- Historial de sesiones persistente

**Modos de Operación**
- **Modo Conectado:** Datos en vivo desde el ESP32
- **Modo Offline:** Validación con registros estándar MIT-BIH
- **Modo Sesión:** Captura y almacenamiento de datos

---

## 🏗️ Arquitectura del Proyecto

```
ecg-monitoring-system/
├── backend/                    # Procesamiento de señales (Python)
│   ├── main.py                 # Servidor Flask/API principal
│   ├── pan_tompkins.py         # Detección de picos R 
│   ├── filters.py              # Diseño de filtros IIR
│   ├── metrics.py              # Cálculo de BPM e intervalos R-R
│   └── reader.py               # Lectura de datos CSV/DAT
│
├── ecg_main/                   # Firmware embebido
│   └── ecg_main.ino            # Código Arduino para ESP32
│
├── frontend/                   # Interfaz web (React + Vite)
│   ├── src/
│   │   ├── pages/              # Vistas principales
│   │   │   ├── Landing.jsx     # Página de inicio
│   │   │   ├── Login.jsx       # Autenticación
│   │   │   ├── Register.jsx    # Registro de usuarios
│   │   │   ├── Dashboard.jsx   # Panel de control
│   │   │   └── Monitor.jsx     # Monitor en tiempo real
│   │   ├── components/         # Componentes reutilizables
│   │   │   ├── LiveChart.jsx   # Gráfico ECG en vivo
│   │   │   └── StatsPanel.jsx  # Panel de estadísticas
│   │   ├── hooks/              # Custom React hooks
│   │   │   ├── useBluetooth.js # Conexión BLE
│   │   │   └── useOfflineECG.js # Modo validación
│   │   ├── context/            # Context API
│   │   │   └── AuthContext.jsx # Estado de autenticación
│   │   ├── lib/                # Utilidades
│   │   │   └── supabase.js     # Cliente Supabase
│   │   ├── App.jsx             # Componente raíz
│   │   └── main.jsx            # Punto de entrada
│   ├── public/                 # Datos MIT-BIH para demo
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── .env                    # Variables de entorno
│
├── data/                       # Base de datos de referencia
│   └── mitbih/                 # MIT-BIH Arrhythmia Database
│       ├── 100.dat / 100.hea   
│       ├── 106.dat / 106.hea
│       ├── 119.dat / 119.hea
│       ├── 208.dat / 208.hea
│       └── convert.py          # Script de conversión
│
├── .gitignore
└── README.md
```

### Flujo de Datos

```
ESP32 (ADC 300 Hz)
    ↓
Comunicación BLE/WebSocket
    ↓
Backend (Filtrado + Pan-Tompkins)
    ↓
Métricas (BPM, RR, Umbrales)
    ↓
Frontend (WebSocket)
    ↓
Dashboard (Gráficos + Stats)
    ↓
Supabase (Persistencia)
```

---

## 📋 Requisitos Previos

### Hardware
- **ESP32** (DevKit o compatible)
- **Circuito ECG analógico** (amplificador, filtros, offset)
- Cable USB-C para programación y alimentación

### Software Requerido

**Sistema Operativo:**
- Linux, macOs o Windows

**Lenguajes y Herramientas:**
| Componente | Requisito 
|-----------|----------|
| **Python** | Backend |
| **Node.js** | Frontend |
| **npm/yarn** | Gestor de paquetes | 
| **Arduino IDE / PlatformIO** | Programación ESP32 |
| **Git** | Control de versiones | 

**Dependencias Principales:**

*Backend (Python):*
```
numpy>=1.21.0
scipy>=1.7.0
flask>=2.0.0
flask-cors>=3.0.10
```

*Frontend (Node.js):*
```
react@18+
vite@4+
@supabase/supabase-js@2+
recharts
tabler-icons
```

*Hardware (Arduino):*
```
Arduino ESP32 Board Support
BLE support (nativo en ESP32)
WiFi support (nativo en ESP32)
```

---

## 🚀 Instalación y Configuración

### 1. Clonar el Repositorio

```bash
git clone https://github.com/tu-usuario/ecg-monitoring-system.git
cd ecg-monitoring-system
```

### 2. Configurar Backend (Python)

```bash
# Crear entorno virtual
python3 -m venv venv

# Activar entorno
# En Linux/macOS:
source venv/bin/activate
# En Windows:
venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt
```

**Crear `requirements.txt` en la raíz del proyecto:**
```
numpy==1.24.3
scipy==1.11.1
flask==2.3.2
flask-cors==4.0.0
```

### 3. Configurar Frontend (React)

```bash
cd frontend

# Instalar dependencias
npm install

# Crear archivo .env.local (copiar desde .env)
cp .env .env.local

# Configurar variables de Supabase
# Editar .env.local con tus credenciales:
# VITE_SUPABASE_URL=tu_url
# VITE_SUPABASE_ANON_KEY=tu_key
```

### 4. Configurar ESP32

#### Opción A: Con Arduino IDE
1. Descargar [Arduino IDE](https://www.arduino.cc/en/software)
2. Instalar soporte para ESP32:
   - Archivo → Preferencias → URLs adicionales para Gestor de Tarjetas
   - Agregar: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
3. Herramientas → Placa → Buscar "ESP32" e instalar
4. Abrir `ecg_main/ecg_main.ino`
5. Seleccionar puerto COM y subir código

#### Opción B: Con PlatformIO
```bash
# Instalar PlatformIO CLI
pip install platformio

# Entrar al directorio del proyecto
cd ecg_main

# Compilar y subir a ESP32
pio run -t upload
```

### 5. Configurar Base de Datos (Supabase)

1. Crear cuenta en [Supabase](https://supabase.com)
2. Crear nuevo proyecto
3. Crear tabla `sessions`:
   ```sql
   CREATE TABLE sessions (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     user_id UUID NOT NULL REFERENCES auth.users(id),
     start_time TIMESTAMP DEFAULT NOW(),
     end_time TIMESTAMP,
     avg_bpm FLOAT,
     max_bpm FLOAT,
     min_bpm FLOAT,
     total_beats INT,
     data JSONB,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

---

## 📖 Instrucciones de Uso

### Ejecución del Backend

```bash
# Desde la raíz del proyecto
python3 backend/main.py

# El servidor estará disponible en http://localhost:5000
```

### Ejecución del Frontend

```bash
cd frontend

# Desarrollo (hot-reload)
npm run dev
# Acceder a http://localhost:5173

# Producción
npm run build
npm run preview
```

### Flujo de Usuario

#### 1. **Registro e Inicio de Sesión**
```
Landing Page → Sign Up → Verificar Email → Login → Dashboard
```

#### 2. **Conectar ESP32 (Modo Bluetooth)**
```
Monitor → Escanear Dispositivos → Seleccionar ESP32 → Conectar
→ Se muestra conexión activa en la UI
```

#### 3. **Iniciar Sesión de Monitoreo**
```
Monitor → [ESP32 conectado] → Iniciar Sesión
→ Comienza captura en tiempo real
→ Se visualizan:
   • Gráfico dual (crudo + filtrado)
   • BPM actual
   • Intervalos R-R
   • Contador de picos
   • Estado cardíaco
```

#### 4. **Modo de Validación (Sin Hardware)**
```
Monitor → [Desconectado] → Seleccionar Registro MIT-BIH
→ Simula adquisición real → Valida algoritmo Pan-Tompkins
```

#### 5. **Finalizar Sesión**
```
Monitor → [Sesión activa] → Terminar
→ Datos se guardan en Supabase
→ Disponibles en Dashboard histórico
```

### Ejemplos de Comandos

#### Ejecutar Backend con Depuración
```bash
FLASK_ENV=development FLASK_DEBUG=1 python3 backend/main.py
```

#### Validar Algoritmo Pan-Tompkins
```bash
python3 backend/main.py --validate mitbih/100.dat
```

#### Procesar Registro MIT-BIH Offline
```python
from backend.reader import ECGReader
from backend.pan_tompkins import PanTompkinsOnline
from backend.metrics import ECGMetricsCalculator

# Cargar datos
reader = ECGReader("data/mitbih/100.dat")
signal = reader.read_lead(0)

# Procesar
detector = PanTompkinsOnline(fs=360)
detector.calibrate_thresholds(signal[:360])

metrics_calc = ECGMetricsCalculator()
peaks = []

for sample in signal:
    is_peak = detector.process_sample(sample)
    if is_peak:
        peaks.append(len(peaks))  # timestamp

# Métricas
print(f"Total picos detectados: {len(peaks)}")
print(f"BPM promedio: {metrics_calc.last_bpm:.1f}")
```

---

## 🛠️ Tecnologías Utilizadas

### Backend
[![Python](https://img.shields.io/badge/Python-3.9+-blue?logo=python&logoColor=white)](https://www.python.org/)
[![NumPy](https://img.shields.io/badge/NumPy-1.24+-013243?logo=numpy)](https://numpy.org/)
[![SciPy](https://img.shields.io/badge/SciPy-1.11+-blueviolet?logo=scipy)](https://scipy.org/)
[![Flask](https://img.shields.io/badge/Flask-2.3+-green?logo=flask)](https://flask.palletsprojects.com/)

**Bibliotecas clave:**
- **NumPy/SciPy:** Procesamiento numérico y filtrado de señales
- **Flask:** API REST y WebSocket

### Frontend
[![React](https://img.shields.io/badge/React-18+-61dafb?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-4+-646cff?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-BaaS-1db854?logo=supabase&logoColor=white)](https://supabase.com/)

**Bibliotecas clave:**
- **Recharts:** Gráficos de ECG interactivos
- **Tabler Icons:** Iconografía profesional
- **Supabase JS:** Autenticación y base de datos
- **Context API:** Gestión de estado global

### Hardware
[![Arduino](https://img.shields.io/badge/Arduino-ESP32-00979d?logo=arduino&logoColor=white)](https://www.espressif.com/en/products/socs/esp32)

**Protocolos:**
- **BLE (Bluetooth Low Energy):** Comunicación inalámbrica eficiente
- **WebSocket:** Streaming de datos en tiempo real
- **ADC 12-bit @ 300 Hz:** Conversión analógica-digital

### Infraestructura
- **Base de Datos:** PostgreSQL (Supabase)
- **Autenticación:** JWT + Session Management
- **Hosting:** Compatible con Vercel, Netlify, AWS

---

## 📊 Algoritmo Pan-Tompkins (Referencia)

El sistema implementa el algoritmo de detección de picos R propuesto por Pan & Tompkins, adaptado para operación causal en tiempo real:

**Pasos:**
1. **Derivada de 5 puntos:** Acentúa pendientes del complejo QRS
2. **Elevación al cuadrado:** Amplifica picos
3. **Media móvil de integración (~150ms):** Suavizado temporal
4. **Umbralización adaptativa:** Basada en SPKI (pico de señal) y NPKI (pico de ruido)
5. **Período refractario:** Mínimo 200 ms entre latidos para evitar detecciones falsas

**Umbral adaptativo:**
```
threshold = NPKI + 0.25 * (SPKI - NPKI)
```

---

## 🔐 Seguridad

**Autenticación:**
- Registro y login con Supabase Auth
- Tokens JWT seguros
- Gestión de sesiones

**Privacidad de Datos:**
- Datos sensibles encriptados en tránsito (HTTPS)
- CORS configurado para dominios específicos
- Validación de entrada en backend

**Firmware:**
- OTA (Over-The-Air) updates preparado en ESP32
- Bootloader seguro

---

## 📈 Roadmap

- [ ] Exportar datos a PDF / HL7 ECG
- [ ] Análisis de variabilidad cardíaca (HRV)
- [ ] Detección automática de arritmias (AF, VT, etc.)
- [ ] Integración con base de datos clínica DICOM
- [ ] App móvil nativa (React Native)
- [ ] Modelo ML de clasificación de ritmos

---

## 📝 Licencia

Este proyecto está bajo licencia **MIT**.

---

## 📚 Referencias

- **Pan & Tompkins (1985):** "A Real-Time QRS Detection Algorithm" - IEEE Transactions on Biomedical Engineering
- **MIT-BIH Arrhythmia Database:** [PhysioNet](https://www.physionet.org/content/mitdb/1.0.0/)
- **ESP32 Documentation:** [Espressif](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/)
- **Supabase Docs:** [Supabase](https://supabase.com/docs)
