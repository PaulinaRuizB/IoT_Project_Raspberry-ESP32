# 6. API implementada

El servidor utiliza **FastAPI** para recibir solicitudes HTTP, validar información y permitir la comunicación entre los nodos ESP32, la base de datos y la aplicación web.

La documentación interactiva de la API está disponible en:

```text
http://IP_DE_LA_RASPBERRY:8000/docs
```

## 6.1. Consultar el estado del servidor

**Método:** `GET`

**Ruta:**

```text/api/status
```

Devuelve información básica sobre el estado del servidor.

Ejemplo de respuesta:

```json
{
  "server": "IoT Server",
  "status": "online",
  "version": "1.0.0"
}
```

Este endpoint permite comprobar que el servidor está funcionando correctamente.

## 6.2. Registrar una medición

**Método:** `POST`

**Ruta:**

```tex /api/measurements
```

Permite que los nodos ESP32 envíen sus mediciones al servidor Raspberry Pi.

Ejemplo del cuerpo JSON:

```json
{
  "node_id": "ESP32_TEST_02",
  "soil_moisture_pct": 55.2,
  "temperature_c": 26.4,
  "humidity_pct": 71.0
}
```

Campos:

- `node_id`: identificador del nodo IoT.
- `soil_moisture_pct`: humedad del suelo expresada como porcentaje.
- `temperature_c`: temperatura en grados Celsius.
- `humidity_pct`: humedad ambiental expresada como porcentaje.

La API valida los datos mediante un modelo de Pydantic antes de ejecutar la operación de almacenamiento.

Si la operación tiene éxito, el endpoint devuelve el estado HTTP `201 Created` y el identificador del registro creado.

La fecha y hora se generan en el servidor y se almacenan en formato ISO 8601 con zona horaria UTC.

**Nota de seguridad:** actualmente este endpoint permite recibir mediciones sin una sesión de usuario, ya que está destinado a la comunicación con los ESP32. La autenticación independiente de los dispositivos IoT está pendiente de implementación.

## 6.3. Consultar mediciones

**Método:** `GET`

**Ruta:**

```text
/api/measurements
```

Devuelve el historial de mediciones. Por defecto, devuelve hasta 50 registros.

Se puede especificar una cantidad:

```text
/api/measurements?limit=10
```

También se puede filtrar por nodo:

```text
/api/measurements?node_id=ESP32_TEST
```

El parámetro `limit` acepta valores entre 1 y 500.

La consulta puede recibir los siguientes parámetros:

- `limit`: cantidad máxima de registros.
- `node_id`: identificador del nodo que se desea consultar.

El acceso requiere una sesión autenticada. Los administradores pueden consultar todas las fincas, mientras que los agricultores solamente pueden consultar las mediciones correspondientes a su finca.

## 6.4. Consultar la medición más reciente

**Método:** `GET`

**Ruta:**

```text
/api/measurements/latest
```

Devuelve la última medición registrada.

También permite consultar la medición más reciente de un nodo específico:

```text
/api/measurements/latest?node_id=ESP32_TEST
```

Si todavía no existen registros para el nodo solicitado, la API devuelve un error HTTP `404 Not Found`.

Esta ruta requiere autenticación y respeta los permisos de acceso por finca.

## 6.5. Consultar los nodos registrados

**Método:** `GET`

**Ruta:**

```text
/api/nodes
```

Devuelve la lista de identificadores de los nodos registrados en el sistema.

Ejemplo de respuesta para un administrador:

```json
[
  "ESP32C6_01",
  "ESP32_TEST",
  "ESP32_TEST_02"
]
```

Los agricultores solamente reciben los nodos asociados a su finca.

Este endpoint permite que la aplicación web genere un selector de dispositivos y muestre la información correspondiente al nodo seleccionado.

# 7. Base de datos SQLite

El servidor utiliza **SQLite** como sistema de gestión de bases de datos.

Se eligió porque es ligero, no necesita un servidor de base de datos independiente y permite almacenar información localmente en la Raspberry Pi. Esto facilita que el sistema pueda funcionar incluso cuando no existe conexión a Internet.

El archivo principal de la base de datos es:

```text
iot_data.db
```

Su ubicación dentro del proyecto es:

```text
/local_apps/iot_server/iot_data.db
```

## 7.1. Estructura de las tablas

La base de datos contiene las siguientes tablas:

### Tabla `measurements`

Almacena las mediciones recibidas de los nodos ESP32.

| Columna | Tipo SQL | Descripción |
|---|---|---|
| `id` | INTEGER | Identificador único autoincremental. |
| `node_id` | TEXT | Identificador del nodo IoT. |
| `timestamp` | TEXT | Fecha y hora de la medición. |
| `soil_moisture_pct` | REAL | Humedad del suelo. |
| `temperature_c` | REAL | Temperatura en grados Celsius. |
| `humidity_pct` | REAL | Humedad ambiental. |

Los campos de humedad del suelo y humedad ambiental permiten valores nulos cuando el sensor correspondiente no está disponible.

### Tabla `farms`

Almacena la información de las fincas registradas.

| Columna | Tipo SQL | Descripción |
|---|---|---|
| `id` | INTEGER | Identificador único de la finca. |
| `name` | TEXT | Nombre de la finca. |
| `location` | TEXT | Ubicación de la finca. |
| `created_at` | TEXT | Fecha de creación del registro. |

### Tabla `nodes`

Relaciona los nodos IoT con las fincas a las que pertenecen.

| Columna | Tipo SQL | Descripción |
|---|---|---|
| `id` | INTEGER | Identificador interno del registro. |
| `node_id` | TEXT | Identificador del dispositivo ESP32. |
| `farm_id` | INTEGER | Identificador de la finca asociada. |
| `created_at` | TEXT | Fecha de registro del nodo. |

La relación entre `nodes` y `farms` permite que una finca tenga varios nodos de medición.

### Tabla `users`

Almacena las cuentas de los usuarios que pueden acceder a la aplicación.

| Columna | Tipo SQL | Descripción |
|---|---|---|
| `id` | INTEGER | Identificador único del usuario. |
| `username` | TEXT | Nombre de usuario. |
| `password_hash` | TEXT | Hash de la contraseña. |
| `role` | TEXT | Rol del usuario: `admin` o `farmer`. |
| `farm_id` | INTEGER | Finca asignada al agricultor. |
| `is_active` | INTEGER | Indica si la cuenta está activa. |
| `created_at` | TEXT | Fecha de creación de la cuenta. |

Reglas de relación:

- Los usuarios con rol `admin` no tienen una finca asignada (`farm_id = NULL`).
- Los usuarios con rol `farmer` deben tener una finca asignada.
- Un administrador puede gestionar información de todas las fincas.
- Un agricultor solamente puede consultar la información de su propia finca.

### Tabla `sessions`

Almacena las sesiones activas de los usuarios.

| Columna | Tipo SQL | Descripción |
|---|---|---|
| `id` | INTEGER | Identificador único de la sesión. |
| `user_id` | INTEGER | Usuario al que pertenece la sesión. |
| `token_hash` | TEXT | Hash del token de sesión. |
| `expires_at` | TEXT | Fecha y hora de expiración. |
| `created_at` | TEXT | Fecha de creación de la sesión. |

La tabla permite gestionar el inicio y cierre de sesión, verificar la validez de las sesiones y controlar su expiración.

## 7.2. Funciones de `database.py`

El archivo `app/database.py` contiene las funciones encargadas de interactuar con SQLite.

Funciones principales:

- `initialize_database()`: crea las tablas necesarias si todavía no existen y registra los datos iniciales.
- `save_measurement(...)`: inserta una medición y devuelve su identificador.
- `get_measurements(limit=50, node_id=None, farm_id=None)`: consulta las mediciones, con filtros opcionales por nodo y finca.
- `get_latest_measurement(node_id=None, farm_id=None)`: devuelve la medición más reciente según los filtros establecidos.
- `get_node_ids(farm_id=None)`: devuelve los nodos registrados, con la posibilidad de filtrar por finca.

Funciones relacionadas con usuarios y sesiones:

- `get_user_by_username(username)`: busca un usuario mediante su nombre de usuario.
- `create_session(user_id, token_hash, expires_at)`: registra una nueva sesión.
- `get_session_user(token_hash)`: verifica una sesión y recupera la información del usuario asociado.
- `delete_session(token_hash)`: elimina una sesión al cerrar sesión.
- `delete_expired_sessions()`: elimina las sesiones expiradas.

## 7.3. Datos iniciales de prueba

Se registraron tres fincas y tres nodos para validar el funcionamiento del sistema:

| ID | Finca | Nodo asociado |
|---|---|---|
| 1 | Finca 01 | ESP32_TEST |
| 2 | Finca 02 | ESP32_TEST_02 |
| 3 | Finca 03 | ESP32C6_01 |

Estos registros permiten probar la separación de datos entre fincas antes de desplegar los dispositivos físicos.

# 8. Validación de las mediciones

El modelo `MeasurementInput` de `main.py` utiliza Pydantic para comprobar la estructura y los valores recibidos.

Reglas actuales:

- `node_id`: texto de 1 a 50 caracteres.
- `soil_moisture_pct`: valor entre 0 y 100.
- `temperature_c`: valor entre -50 y 100 °C.
- `humidity_pct`: valor entre 0 y 100.

Los campos de humedad pueden ser opcionales, mientras que la temperatura es obligatoria en el modelo actual.

La validación evita almacenar mediciones con formatos incorrectos o valores fuera de los límites establecidos.

# 9. Sistema de autenticación y gestión de usuarios

Se implementó un sistema de autenticación utilizando FastAPI, SQLite y Argon2.

Su propósito es permitir que diferentes usuarios accedan a la aplicación y que cada agricultor pueda consultar exclusivamente la información de su finca.

## 9.1. Roles de usuario

Actualmente existen dos roles:

**Administrador (`admin`)**

- Puede consultar los nodos de todas las fincas.
- Puede consultar las mediciones de todas las fincas.
- Está destinado a la administración general del sistema.

**Agricultor (`farmer`)**

- Tiene una finca asignada.
- Puede consultar únicamente los nodos de su finca.
- Puede consultar únicamente las mediciones de su finca.

La autorización se realiza en el servidor, no solamente desde la interfaz web. Esto evita que un usuario pueda acceder a información de otra finca modificando directamente los parámetros de una solicitud HTTP.

## 9.2. Protección de contraseñas con Argon2

El archivo `app/security.py` contiene las funciones encargadas de proteger las contraseñas.

Se utiliza Argon2 mediante la biblioteca `argon2-cffi`.

Funciones principales:

- `hash_password(password)`: genera un hash de la contraseña.
- `verify_password(password, stored_hash)`: comprueba si una contraseña coincide con el hash almacenado.
- `needs_rehash(stored_hash)`: comprueba si el hash necesita actualizarse según los parámetros actuales.

La configuración actual de Argon2 utiliza:

- `time_cost = 3`
- `memory_cost = 65536`
- `parallelism = 2`

## 9.3. Gestión de sesiones

El archivo `app/auth.py` contiene la lógica de autenticación.

Cuando un usuario inicia sesión:

1. El servidor busca su nombre de usuario en SQLite.
2. Verifica la contraseña mediante Argon2.
3. Comprueba que la cuenta esté activa.
4. Genera un token aleatorio de sesión.
5. Calcula el hash SHA-256 del token y almacena ese hash en SQLite.
6. Envía el token original al navegador mediante una cookie HTTP.

La cookie utiliza las siguientes propiedades:

- `HttpOnly`: impide que JavaScript acceda directamente al token.
- `SameSite=Lax`: ayuda a reducir determinados riesgos de solicitudes entre sitios.
- `Max-Age`: establece una duración de 12 horas.
- `Secure=False`: configuración temporal para el entorno local HTTP. Debe cambiarse a `True` cuando se implemente HTTPS.

El servidor almacena el hash del token, no el token original.

## 9.4. Endpoints de autenticación

### Iniciar sesión

**Método:** `POST`

**Ruta:**

```text
/api/auth/login
```

Recibe las credenciales del usuario y, si son correctas, crea una sesión.

Ejemplo del cuerpo JSON:

```json
{
  "username": "usuario",
  "password": "contraseña"
}
```

### Consultar usuario autenticado

**Método:** `GET`

**Ruta:**

```text
/api/auth/me
```

Devuelve información del usuario que tiene la sesión activa:

- Identificador.
- Nombre de usuario.
- Rol.
- Identificador de la finca.
- Nombre de la finca.

### Cerrar sesión

**Método:** `POST`

**Ruta:**

```text
/api/auth/logout
```

Elimina la sesión correspondiente de SQLite y borra la cookie del navegador.

## 9.5. Dependencias de autorización

Se implementaron funciones que permiten controlar el acceso a las rutas de la API:

- `get_current_user(request)`: recupera y valida al usuario de la sesión actual.
- `require_authenticated_user(request)`: exige que exista una sesión válida.
- `require_admin(request)`: exige que el usuario tenga el rol de administrador.

En las rutas protegidas se utiliza `Depends(get_current_user)`, una dependencia de FastAPI que verifica la sesión antes de ejecutar la operación solicitada.

## 9.6. Creación de usuarios

Se implementaron dos scripts:

**`app/create_admin.py`**

Permite crear una cuenta de administrador desde la terminal.

**`app/create_farmer.py`**

Permite crear cuentas de agricultores asociadas a una finca existente.

El script de agricultores:

1. Solicita un nombre de usuario.
2. Solicita y confirma una contraseña.
3. Verifica que tenga al menos 12 caracteres.
4. Comprueba que la finca seleccionada exista.
5. Comprueba que el nombre de usuario no esté registrado.
6. Genera el hash Argon2.
7. Guarda el usuario con el rol `farmer` y su `farm_id`.

Comandos de ejecución:

```bash
python -m app.create_admin
```

```bash
python -m app.create_farmer
```
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
- Filtrado de nodos y mediciones según los permisos del usuario.
- Pruebas de inicio de sesión, cierre de sesión y separación de datos.