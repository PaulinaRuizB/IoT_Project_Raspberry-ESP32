## 6. API implementada

### 1. Consultar el estado

Método: `GET`

Ruta:

    /api/status

Devuelve información básica del servidor, por ejemplo:

    {
      "server": "IoT Server",
      "status": "online",
      "version": "1.0.0"
    }

### 1. 2. Registrar una medición

Método: `POST`

Ruta:

    /api/measurements

Ejemplo del cuerpo JSON:

    {
      "node_id": "ESP32_TEST_02",
      "soil_moisture_pct": 55.2,
      "temperature_c": 26.4,
      "humidity_pct": 71.0
    }

Campos:

- `node_id`: identificador del nodo.
- `soil_moisture_pct`: humedad del suelo expresada como porcentaje.
- `temperature_c`: temperatura en grados Celsius.
- `humidity_pct`: humedad ambiental expresada como porcentaje.

La API valida los datos mediante un modelo de Pydantic antes de ejecutar la operación de almacenamiento.

Si la operación tiene éxito, el endpoint devuelve el estado HTTP `201 Created` y el identificador del registro creado.

La fecha y hora se generan en el servidor y se almacenan en formato ISO 8601 con zona horaria UTC.

### 1. 3. Consultar mediciones

Método: `GET`

Ruta:

    /api/measurements

Devuelve el historial de mediciones. Por defecto, devuelve hasta 50 registros.

Se puede especificar una cantidad:

    /api/measurements?limit=10

El parámetro `limit` acepta valores entre 1 y 500.

### 1. 4. Consultar la medición más reciente

Método: `GET`

Ruta:

    /api/measurements/latest

Devuelve la última medición registrada.

Si todavía no existen registros, la API devuelve un error HTTP `404 Not Found`.

## 2. Base de datos SQLite

### 2.1. Estructura de la tabla

| Columna | Tipo SQL | Descripción |
|---|---|---|
| `id` | `INTEGER` | Identificador único autoincremental. |
| `node_id` | `TEXT` | Identificador del nodo IoT. |
| `timestamp` | `TEXT` | Fecha y hora de la medición. |
| `soil_moisture_pct` | `REAL` | Humedad del suelo. |
| `temperature_c` | `REAL` | Temperatura en grados Celsius. |
| `humidity_pct` | `REAL` | Humedad ambiental. |

### 2.2. Funciones de `database.py`

- `initialize_database()`: crea la tabla si todavía no existe.
- `save_measurement(...)`: inserta una medición y devuelve su identificador.
- `get_measurements(limit=50)`: consulta las mediciones más recientes.
- `get_latest_measurement()`: devuelve la última medición o `None` si no hay registros.

## 3. Validación de las mediciones

El modelo `MeasurementInput` de `main.py` utiliza Pydantic para comprobar la estructura y los valores recibidos.

Reglas actuales:

- `node_id`: texto de 1 a 50 caracteres.
- `soil_moisture_pct`: valor entre 0 y 100.
- `temperature_c`: valor entre -50 y 100 °C.
- `humidity_pct`: valor entre 0 y 100.