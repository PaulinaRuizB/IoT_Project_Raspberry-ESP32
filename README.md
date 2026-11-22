# Servidor IoT Agrícola — Raspberry Pi y ESP32

## 1. Objetivo del proyecto

Este proyecto busca convertir una Raspberry Pi 4 en el nodo central de un sistema IoT para monitoreo y apoyo a la toma de decisiones agrícolas.

La Raspberry Pi funcionará como servidor local encargado de:

- Recibir mediciones provenientes de múltiples nodos ESP32.
- Validar y almacenar las mediciones.
- Consultar el historial de datos.
- Proporcionar una API para la comunicación entre componentes.
- Alojar un dashboard web personalizado.
- Generar recomendaciones agrícolas a partir de reglas y datos.
- Procesar imágenes de plantas.
- Registrar las decisiones del agricultor.
- Funcionar localmente sin depender permanentemente de Internet.

Los nodos ESP32 medirán variables como humedad del suelo, temperatura y humedad ambiental.

## 2. Arquitectura del proyecto

La arquitectura de software actual es:

    Raspberry Pi 4
    │
    └── IoT Server
         │
         ├── FastAPI
         │    ├── GET /api/status
         │    ├── POST /api/measurements
         │    ├── GET /api/measurements
         │    └── GET /api/measurements/latest
         │
         ├── SQLite
         │    └── iot_data.db
         │         └── measurements
         │
         └── Componentes futuros
              ├── Autenticación
              ├── Recomendaciones agrícolas
              ├── Análisis de imágenes
              └── Registro de decisiones

Arquitectura prevista de hardware:

    ESP32 - Nodo 1 ──┐
    ESP32 - Nodo 2 ──┼
    ESP32 - Nodo 3 ──┘
                         │
                         ▼
                    Raspberry Pi 4
                         │
                         ▼
                  API + Base de datos
                         │
                         ▼
                      Dashboard

La API y la base de datos ya están implementadas. La comunicación con los nodos físicos, el dashboard y los demás componentes se desarrollarán posteriormente.

La tecnología de comunicación con los ESP32 deberá seleccionarse según el alcance, la disponibilidad de conectividad y las condiciones del terreno. MQTT y LoRa son alternativas que se podrán evaluar; todavía no están implementadas en el proyecto.

## 3. Entorno actual

### Hardware

- Raspberry Pi 4.
- Computador de desarrollo con Windows y Visual Studio Code.

### Sistema operativo

- Raspberry Pi OS.
- Acceso remoto mediante SSH.

### Software

- Python.
- Entorno virtual de Python (`venv`).
- FastAPI.
- Uvicorn.
- Pydantic.
- SQLite.
- Git y GitHub.

### Red

- Conexión local mediante Wi-Fi.
- Puerto del servidor: TCP 8000.
- Última dirección IP conocida de la Raspberry Pi: `192.168.80.25`.

## 4. Estructura actual del proyecto

Estructura:

    iot_server/
    ├── app/
    │   ├── main.py
    │   └── database.py
        └── auth.py
        └── create_admin.py
        └── create_farmer.py
        └──recommendations.py
        └──recommendations_history.py
        └──security.py
    ├──static/
        └──app.js
        └──index.html
        └──styles.css 
    ├── iot_data.db
    ├── .gitignore
    ├── config.yaml
    ├── Dockerfile
    ├── run.sh
    └── README.md

### 4.1 Diagrama Sistema: 

![alt text](<Diagrama sistema Agriasistente.png>)

## 5. Entorno virtual de Python

Para activar el entorno virtual desde la raíz del proyecto:

    source venv/bin/activate

El servidor utiliza el puerto TCP 8000. Desde un dispositivo conectado a la misma red se puede acceder mediante:

    http://IP_DE_LA_RASPBERRY:8000

La documentación interactiva de FastAPI está disponible en:

    http://IP_DE_LA_RASPBERRY:8000/docs

## Pruebas realizadas

### Prueba 001 — Acceso mediante SSH

**Estado: COMPLETADA**

Se confirmó el acceso remoto a la Raspberry Pi desde el computador de desarrollo.

### Prueba 002 — Configuración del nuevo sistema operativo

**Estado: COMPLETADA**

Se instaló un sistema operativo independiente de Home Assistant OS y se configuró el acceso al proyecto.

### Prueba 003 — Ejecución de FastAPI

**Estado: COMPLETADA**

Se inició el servidor mediante Uvicorn y se confirmó el acceso a sus rutas desde la red local.

### Prueba 004 — Endpoints básicos

**Estado: COMPLETADA**

Se comprobaron las rutas `/` y `/api/status`.

### Prueba 005 — Creación de SQLite

**Estado: COMPLETADA**

Se inicializó la base de datos y se verificó la existencia de la tabla `measurements`.

### Prueba 006 — Guardado de una medición de prueba

**Estado: COMPLETADA**

Se guardó una medición ficticia con identificador de nodo `ESP32_TEST`, humedad del suelo de 42.5 %, temperatura de 25.8 °C y humedad ambiental de 68 %.

### Prueba 007 — Consulta de datos almacenados

**Estado: COMPLETADA**

Se recuperó la medición guardada y se confirmó que la base de datos devolvía sus valores.

### Prueba 008 — API de mediciones

**Estado: COMPLETADA**

Se probaron el endpoint POST para registrar mediciones y los endpoints GET para consultar el historial y la última medición mediante `/docs`.

Las pruebas se realizaron con datos de ejemplo; todavía no se han recibido lecturas de un ESP32 físico.

### Prueba 009 - Interfaz intuitiva dashboard 

Se hizo la primera versión del dashboard intuitivo para agricultores con la siguiente información: 

- Saludo de bienvenida. 
- Selección de nodos. 
- Vista de datos de prueba organizados en tarjetas. 
- Vista de recomendaciones. 

### Prueba 010 - Sensor BMP280 y comunicación con ESP32C6

Se hizo la primera prueba de enviar un dato al servidor (raspberry) por medio de un sensor BMP280 de temperatura y una ESP32C6. Por ahora, funciona de forma local con la dirección IP. Se actualizan los datos en el dashboard cada 5 segundos.  

### Prueba 011 Implementación de inicios de sesión

Se implementó una interfaz de inición de sesión con usuario y contraseña, en donde al ingresar como administrador se muestran todos los nodos (fincas) y al ingresar como agricultor solo se muestra una. 

### Prueba 012 Implementación de un nodo completo y recomendaciones

Se agregaron los sensores de temperatura (BMP280), humedad ambiental (dht11) y humedad del suelo (sonda yl100) junto con las recomendaciones al agricultor según las variables tomadas. 

## 11. Limitaciones actuales

- No se ha implementado MQTT.
- El mecanismo de comunicación de campo entre nodos y Raspberry Pi sigue pendiente de selección y validación.
- No se ha incorporado análisis de imágenes.
- No se han realizado pruebas completas de campo sin Internet.

El servidor actual es una base funcional para continuar el desarrollo, pero todavía no es un sistema completo listo para desplegar en una explotación agrícola.

# Estado actual del desarrollo

Hasta esta etapa se cuenta con:

- Servidor FastAPI funcionando en Raspberry Pi.
- Base de datos SQLite inicializada.
- Recepción y almacenamiento de mediciones.
- Registro de fincas y nodos.
- Sistema de autenticación con Argon2.
- Gestión de sesiones mediante cookies.
- Roles de administrador y agricultor.
- Asociación de usuarios con fincas.
- Pruebas de inicio de sesión, cierre de sesión y separación de datos.
- Inicios de sesión con cuentas de administrador y agricultor. El primero puede agregar, editar, desactivar o cambiar información de las demas cuentas. 
- Un nodo completo funcionando con temperatura, humedad ambiental y humedad del suelo junto con recomendaciones. 
- Recomendaciones e historial según los datos. 

