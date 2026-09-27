# Servidor IoT - Raspberry Pi

## 1. Objetivo del proyecto

Este proyecto tiene como objetivo convertir una Raspberry Pi 4 en el nodo
principal de un sistema IoT capaz de comunicarse con múltiples nodos ESP32.

La Raspberry Pi ejecutará un servidor IoT encargado de:

- Recibir información de los ESP32.
- Procesar y almacenar datos.
- Enviar comandos a los ESP32.
- Gestionar diferentes nodos IoT.
- Proporcionar una API.
- Proporcionar un dashboard web.
- Gestionar autenticación de usuarios.

La comunicación entre la Raspberry Pi y los ESP32 se realizará principalmente
mediante MQTT.

---

## 2. Arquitectura general

La arquitectura prevista es:

    Raspberry Pi 4
    │
    ├── Home Assistant
    │
    ├── MQTT Broker
    │
    └── IoT Server
         │
         ├── API
         ├── Dashboard
         ├── Autenticación
         ├── Base de datos
         └── MQTT
              │
              ├── ESP32 - Nodo 1
              ├── ESP32 - Nodo 2
              └── ESP32 - Nodo 3
---

## 3. Entorno actual

Hardware:

- Raspberry Pi 4

Sistema operativo:

- Home Assistant OS

Arquitectura:

- aarch64

Conectividad:

- Wi-Fi

Dirección IP local actual:

- 192.168.80.16

---

## 4. Estructura inicial del proyecto

La aplicación se encuentra en:

    /addons/iot_server

Actualmente contiene:

    iot_server/
    ├── config.yaml
    ├── Dockerfile
    ├── run.sh
    └── README.md

---

## 5. Conceptos importantes

### 5.1 Home Assistant OS

Home Assistant OS es el sistema operativo que administra la Raspberry Pi
y proporciona el entorno necesario para ejecutar Home Assistant y sus
Apps.

### 5.2 App

Una App de Home Assistant es un servicio empaquetado para que el sistema
pueda construirlo, ejecutarlo y administrarlo.

Nuestra App IoT será administrada por Home Assistant OS/Supervisor, pero
su aplicación será diseñada para funcionar independientemente de
Home Assistant.

### 5.3 Docker

Docker permite ejecutar aplicaciones dentro de contenedores.

Un contenedor proporciona un entorno aislado para ejecutar nuestra
aplicación y sus dependencias.

### 5.4 Imagen

Una imagen de Docker es la plantilla utilizada para crear un contenedor.

El Dockerfile contiene las instrucciones necesarias para construir esta
imagen.

### 5.5 Puerto

Un puerto permite identificar diferentes servicios que funcionan dentro
de un mismo dispositivo.

En este proyecto:

    192.168.80.16:8123
        Home Assistant

    192.168.80.16:8000
        Servidor IoT

El puerto 8000 será utilizado inicialmente por nuestro servidor web.

---

## 6. config.yaml

El archivo config.yaml contiene la información que Home Assistant
Supervisor necesita para identificar y administrar nuestra App.

Configuración actual:

    name: IoT Server
    version: "1.0.0"
    slug: iot_server
    description: Servidor IoT personalizado para Raspberry Pi
    arch:
      - aarch64
    startup: services
    boot: auto
    ports:
      8000/tcp: 8000

### Parámetros

#### name

Nombre visible de la App.

#### version

Versión actual de la App.

#### slug

Identificador interno de la App.

#### description

Descripción de la función de la App.

#### arch

Arquitectura de hardware soportada.

La Raspberry Pi utiliza aarch64.

#### startup

Indica que la App funciona como un servicio.

#### boot

Con `auto`, la App debe iniciarse automáticamente.

#### ports

Define la relación entre el puerto utilizado por el contenedor
y el puerto expuesto en la Raspberry Pi.

En este proyecto:

    8000/tcp: 8000

significa que el puerto TCP 8000 de la App será expuesto como
puerto 8000 de la Raspberry Pi.

---

## 7. Dockerfile

El Dockerfile contiene las instrucciones para construir la imagen
de Docker de nuestra App.

Contenido actual:

    FROM python:3.12-alpine

    WORKDIR /app

    COPY run.sh /app/run.sh

    RUN chmod +x /app/run.sh

    CMD ["/app/run.sh"]

### Instrucciones utilizadas

#### FROM

Define la imagen base.

Utilizamos Python 3.12 sobre Alpine Linux.

#### WORKDIR

Define el directorio de trabajo dentro del contenedor.

#### COPY

Copia archivos desde el proyecto hacia el contenedor.

#### RUN

Ejecuta un comando durante la construcción de la imagen.

En este caso se utiliza chmod para dar permiso de ejecución a run.sh.

#### CMD

Define el comando que se ejecutará cuando se inicie el contenedor.

---

## 8. run.sh

Este archivo es un script de Linux utilizado para iniciar nuestra
aplicación.

Contenido actual:

    #!/bin/sh

    python3 -m http.server 8000 --bind 0.0.0.0

Actualmente no ejecuta todavía FastAPI ni MQTT.

Su objetivo inicial es crear un servidor HTTP mínimo que permita
comprobar que la App se construye, inicia automáticamente y puede
recibir conexiones mediante el puerto 8000.

---

## 9. Plan de desarrollo

El proyecto se desarrollará progresivamente:

1. Crear la App mínima.
2. Construir la imagen Docker.
3. Iniciar automáticamente la App.
4. Comprobar el puerto 8000.
5. Comprobar acceso desde otro computador.
6. Sustituir el servidor HTTP de prueba por FastAPI.
7. Crear la API.
8. Crear el dashboard web.
9. Implementar autenticación.
10. Implementar base de datos.
11. Implementar MQTT.
12. Crear comunicación con ESP32.
13. Implementar múltiples nodos.
14. Implementar sensores y actuadores.
15. Implementar almacenamiento histórico.
16. Implementar configuración y administración de nodos.

Cada etapa deberá probarse antes de pasar a la siguiente.

---

## 10. Registro de pruebas

### Prueba 001 - Acceso mediante SSH

Estado: CORRECTO

Se confirmó el acceso mediante SSH al entorno Terminal & SSH.

### Prueba 002 - Acceso al directorio /addons

Estado: CORRECTO

Se confirmó que /addons existe y puede utilizarse para desarrollar
la App local.

### Prueba 003 - Creación del proyecto

Estado: CORRECTO

Se creó:

    /addons/iot_server

### Prueba 004 - config.yaml

Estado: CORRECTO

Se creó y verificó el archivo config.yaml.

### Prueba 005 - Dockerfile

Estado: CORRECTO

Se creó y verificó el Dockerfile.

### Prueba 006 - run.sh

Estado: CORRECTO

Se creó y verificó el script de inicio.

### Prueba 007 - Construcción de la App

Estado: PENDIENTE

### Prueba 008 - Inicio automático

Estado: ✅ Completada

Resultado:
La aplicación IoT Server fue detectada por Home Assistant
Supervisor, instalada, construida y ejecutada correctamente.

El servidor HTTP de prueba es accesible mediante:

http://192.168.80.16:8000

Home Assistant no es necesario para acceder al servidor.
