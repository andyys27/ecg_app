# OndaVital — Sistema de Monitoreo ECG con ESP32

Plataforma de bioinstrumentación para adquisición, procesamiento y visualización en tiempo real de señales electrocardiográficas (ECG). El sistema integra un circuito analógico de electrocardiografía construido físicamente con una ESP32 como microcontrolador, un backend de procesamiento de señal en Python y una interfaz web interactiva con React.

---

## Descripción general

Este repositorio contiene la parte **digital** del sistema. La señal fisiológica es capturada mediante electrodos y procesada analógicamente por el circuito ECG (filtros, amplificadores de instrumentación, etc.). La señal ya acondicionada entra al ADC de la ESP32, que la transmite vía Bluetooth Serial a la computadora. A partir de ahí, el backend Python realiza el filtrado digital, la detección de complejos QRS y el cálculo de métricas clínicas; la interfaz web las muestra en tiempo real.

La aplicación también soporta un **modo offline** para reproducir registros del dataset MIT-BIH Arrhythmia Database, lo que permite probar y validar los algoritmos sin necesidad del hardware físico.

---

## Arquitectura del sistema

```
Electrodos → Circuito ECG analógico → ESP32 (ADC + BT Serial)
                                           │
                                    Bluetooth (SPP)
                                           │
                              ┌────────────▼─────────────┐
                              │     Backend Python        │
                              │   FastAPI + WebSocket     │
                              │                           │
                              │  BTReader → ECGProcessor  │
                              │  Filtros → Pan-Tompkins   │
                              │  Métricas (BPM, R-R)      │
                              └────────────┬─────────────┘
                                           │
                                    WebSocket / HTTP
                                           │
                              ┌────────────▼─────────────┐
                              │     Frontend React        │
                              │   Vite + Supabase         │
                              │                           │
                              │  Monitor → LiveChart      │
                              │  Dashboard → Historial    │
                              │  Autenticación de usuario │
                              └──────────────────────────┘
```

---

## Estructura del repositorio

```
ecg_app/
├── backend/
│   ├── main.py          # Servidor FastAPI: WebSocket + endpoints REST
│   ├── reader.py        # BTReader: lectura asíncrona del puerto Bluetooth
│   ├── filters.py       # Filtros digitales y orquestador ECGProcessor
│   ├── pan_tompkins.py  # Detector de picos R (algoritmo Pan-Tompkins online)
│   └── metrics.py       # Cálculo de BPM e intervalos R-R
├── data/
│   └── mitbih/
│       ├── 100.dat / 100.hea   
│       ├── 106.dat / 106.hea
│       ├── 119.dat / 119.hea
│       ├── 208.dat / 208.hea
│       └── convert.py   # Conversión de registros MIT-BIH a CSV
└── frontend/
    └── src/
        ├── components/
        │   ├── LiveChart.jsx    # Canvas de visualización ECG en tiempo real
        │   └── StatsPanel.jsx  # Panel de métricas clínicas
        ├── context/
        │   └── AuthContext.jsx  # Proveedor de autenticación (Supabase)
        ├── hooks/
        │   ├── useBluetooth.js  # Hook WebSocket (modo online)
        │   └── useOfflineECG.js # Hook CSV offline (modo MIT-BIH)
        ├── lib/
        │   └── supabase.js      # Cliente Supabase
        └── pages/
            ├── Landing.jsx    # Página de inicio
            ├── Login.jsx      # Inicio de sesión
            ├── Register.jsx   # Registro de usuario (2 pasos + perfil médico)
            ├── Dashboard.jsx  # Historial de sesiones clínicas
            └── Monitor.jsx    # Monitor ECG principal
```

---

## Requisitos previos

### Backend
- Python 3.10+
- Puerto Bluetooth Serial vinculado a la ESP32

### Frontend
- Node.js 18+
- Cuenta en [Supabase](https://supabase.com) con las tablas `profiles`, `sessions` y `ecg_measurements`

---

## Instalación y ejecución

### Clonar el Repositorio

```bash
git clone https://github.com/andyys27/ecg_app.git
cd ecg_app
```

### 1. Backend

```bash
cd backend

# Crear y activar entorno virtual
python -m venv venv

# Linux/macOS
source venv/bin/activate

# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1

# Instalar dependencias
pip install fastapi uvicorn pyserial scipy numpy

# Configurar variables de entorno (opcional, hay valores por defecto)
export BT_PORT="/dev/rfcomm0"   # Linux
$env:BT_PORT="COM8"           # Windows PowerShell

# Iniciar servidor
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Conexión Bluetooth en Linux:**
```bash
sudo rfcomm connect 0 <MAC_ADDRESS_ESP32>
```

**Listar puertos COM activos en Windows:**
```powershell
Get-CimInstance -ClassName Win32_SerialPort | Select-Object DeviceID, Name
```

### 2. Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Configurar variables de entorno
# Crear archivo .env en /frontend con:
VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<tu-anon-key>

# Iniciar en modo desarrollo
npm run dev
```

---

## Modos de operación

### Modo Online (ESP32 + Bluetooth)
La ESP32 transmite muestras en el formato `timestamp_ms,valor_adc` a 115200 baud. El `BTReader` las lee de forma asíncrona y las pone en una cola que alimenta el procesador de señal. Los resultados se difunden a todos los clientes WebSocket conectados en tiempo real.

Formato de paquete enviado por la ESP32:
```
<timestamp_ms>,<raw_adc_value>\n
```

### Modo Offline (MIT-BIH)
Permite cargar registros del dataset MIT-BIH Arrhythmia Database en formato CSV. El frontend envía ventanas de 20 muestras al endpoint `/process-csv` del backend, que aplica los mismos filtros y detector de picos, y devuelve la señal procesada para reproducirla en la interfaz.

Registros incluidos por defecto:
- `100.csv` — Ritmo sinusal normal
- `106.csv` — Contracciones ventriculares prematuras
- `119.csv` — Bigeminismo
- `208.csv` — Arritmia mixta

**Convertir un nuevo registro MIT-BIH a CSV:**
```bash
cd data/mitbih
pip install wfdb
python convert.py 100   # Genera 100.csv
```

---

## Procesamiento de señal

### Pipeline (muestra por muestra)

1. **Filtro pasa-banda Butterworth** (orden 4, 0.5–40 Hz) — elimina deriva de línea base y ruido de alta frecuencia.
2. **Filtro notch IIR** (60 Hz, Q=30) — rechaza la interferencia de la red eléctrica.
3. **Detector Pan-Tompkins** (implementación online) — derivada al cuadrado + ventana de integración móvil (12% de Fs) + umbral adaptativo (35% del máximo reciente) + periodo refractario (25% de Fs).
4. **Cálculo de métricas** — BPM promediado sobre los últimos 10 intervalos R-R válidos dentro del rango fisiológico (30–200 BPM). Timeout de señal a los 5 s sin picos.

### Frecuencia de muestreo
- Predeterminada: **300 Hz** (configurable con la variable de entorno `ECG_FS`)
- Historial circular: 10 segundos de señal cruda y filtrada

## Algoritmo Pan-Tompkins 

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

## API del backend

| Endpoint | Método | Descripción |
|---|---|---|
| `/` | GET | Estado del servidor y clientes conectados |
| `/ws` | WebSocket | Stream en tiempo real (muestra a muestra) |
| `/snapshot` | GET | Últimas `n` muestras del buffer (defecto: 300) |
| `/process-csv` | POST | Procesa una ventana offline y retorna señal filtrada + picos |

### Esquema del paquete WebSocket (salida del backend)

```json
{
  "t": 12345,
  "raw": 2048.0,
  "filtered": 0.42,
  "is_r_peak": false,
  "bpm": 72.5,
  "rr_interval": 827,
  "total_beats": 14,
  "color": "GREEN"
}
```

Clasificación de color por BPM:

| Color | Rango | Interpretación |
|---|---|---|
| NONE | 0 | Sin señal |
| BLUE | < 60 bpm | Bradicardia |
| GREEN | 60–99 bpm | Normal |
| YELLOW | 100–140 bpm | Taquicardia leve |
| RED | > 140 bpm | Alerta crítica |

---

## Funcionalidades de la interfaz

- **Landing** — Página de presentación con acceso a demo offline sin cuenta.
- **Autenticación** — Registro en dos pasos con perfil médico (edad, sexo, peso, altura) almacenado en Supabase.
- **Monitor** — Visualizador ECG con doble canal (señal cruda + filtrada), marcadores de pico R, indicador de BPM en tiempo real con código de color, timer de sesión clínica y selector de registros MIT-BIH para modo offline.
- **Dashboard** — Historial de sesiones con estado clínico (normal, bradicardia, taquicardia, elevado), BPM promedio, duración y modal de detalle por sesión.

---

## Variables de entorno

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `BT_PORT` | `""` (vacío) | Puerto COM/rfcomm de la ESP32 |
| `ECG_FS` | `300` | Frecuencia de muestreo en Hz |
| `VITE_SUPABASE_URL` | — | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | — | Clave anónima pública de Supabase |

---

## Tecnologías utilizadas

### Backend
[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Framework-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Uvicorn](https://img.shields.io/badge/Uvicorn-ASGI-499848?logo=python&logoColor=white)](https://www.uvicorn.org/)
[![SciPy](https://img.shields.io/badge/SciPy-1.11+-8CAAE6?logo=scipy&logoColor=white)](https://scipy.org/)
[![NumPy](https://img.shields.io/badge/NumPy-1.24+-013243?logo=numpy&logoColor=white)](https://numpy.org/)
[![PySerial](https://img.shields.io/badge/PySerial-UART-yellow?logo=python&logoColor=black)](https://pyserial.readthedocs.io/)
[![WebSockets](https://img.shields.io/badge/WebSockets-Real--time-black?logo=socket.io)](https://fastapi.tiangolo.com/advanced/websockets/)

### Frontend
[![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5+-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20DB-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Canvas API](https://img.shields.io/badge/Canvas_API-Rendering-A10000?logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![React Router](https://img.shields.io/badge/React_Router-v6-CA4245?logo=react-router&logoColor=white)](https://reactrouter.com/)

### Algoritmos
[![Detección](https://img.shields.io/badge/Pan--Tompkins-QRS_Detection-orange)](#)
[![Filtro](https://img.shields.io/badge/Butterworth-Band--pass-blue)](#)
[![Notch](https://img.shields.io/badge/IIR_Notch-50%2F60Hz_Removal-red)](#)

### Hardware
[![ESP32](https://img.shields.io/badge/Hardware-ESP32-E7352C?logo=espressif&logoColor=white)](https://www.espressif.com/)
[![Bluetooth](https://img.shields.io/badge/Bluetooth-Serial_SPP-0082FC?logo=bluetooth&logoColor=white)](#)
[![ADC](https://img.shields.io/badge/ADC-12--bit_(0--3.3V)-gray)](#)

---

## Roadmap

- [ ] Exportar datos a PDF / HL7 ECG
- [ ] Análisis de variabilidad cardíaca (HRV)
- [ ] Detección automática de arritmias (AF, VT, etc.)
- [ ] Integración con base de datos clínica DICOM
- [ ] App móvil nativa (React Native)
- [ ] Modelo ML de clasificación de ritmos

---

## Consideraciones clínicas

> **Aviso:** Este sistema es un prototipo académico de bioinstrumentación. No está certificado para uso diagnóstico clínico. Los resultados deben interpretarse únicamente en contexto de investigación o educación.

--- 

## Referencias

- **Pan & Tompkins (1985):** "A Real-Time QRS Detection Algorithm" - IEEE Transactions on Biomedical Engineering
- **MIT-BIH Arrhythmia Database:** [PhysioNet](https://www.physionet.org/content/mitdb/1.0.0/)
- **ESP32 Documentation:** [Espressif](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/)
- **Supabase Docs:** [Supabase](https://supabase.com/docs)
