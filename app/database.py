
import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from contextlib import contextmanager

# Ruta principal del proyecto
BASE_DIR = Path(__file__).resolve().parent.parent

# Archivo donde se almacenan los datos
DATABASE_PATH = BASE_DIR / "iot_data.db"


@contextmanager
def get_connection():
    """Administra una conexión segura con SQLite."""

    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")

    try:
        yield connection
        connection.commit()

    except Exception:
        connection.rollback()
        raise

    finally:
        connection.close()


def initialize_database():
    """
    Inicializa la base de datos.

    Crea las tablas necesarias y registra las fincas y nodos
    existentes sin eliminar las mediciones almacenadas.
    """

    with get_connection() as connection:

        # 1. Tabla de mediciones
        # Se conserva la estructura que ya utilizábamos.
        connection.execute("""
            CREATE TABLE IF NOT EXISTS measurements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                soil_moisture_pct REAL,
                temperature_c REAL,
                humidity_pct REAL
            )
        """)

        # 2. Tabla de fincas
        connection.execute("""
            CREATE TABLE IF NOT EXISTS farms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                location TEXT,
                created_at TEXT NOT NULL
            )
        """)

        # 3. Tabla de nodos
        # Cada finca tendrá un nodo en nuestro prototipo.
        connection.execute("""
            CREATE TABLE IF NOT EXISTS nodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id TEXT NOT NULL UNIQUE,
                farm_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,

                FOREIGN KEY (farm_id)
                    REFERENCES farms(id)
            )
        """)

        # 4. Tabla de usuarios
        connection.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,

                role TEXT NOT NULL
                    CHECK (role IN ('admin', 'farmer')),

                farm_id INTEGER,
                is_active INTEGER NOT NULL DEFAULT 1
                    CHECK (is_active IN (0, 1)),

                created_at TEXT NOT NULL,

                FOREIGN KEY (farm_id)
                    REFERENCES farms(id),

                CHECK (
                    (role = 'admin' AND farm_id IS NULL)
                    OR
                    (role = 'farmer' AND farm_id IS NOT NULL)
                )
            )
        """)

        # 5. Tabla de sesiones
        connection.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,

                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
        """)

        # Índices para acelerar las consultas
        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_measurements_node_timestamp
            ON measurements(node_id, timestamp)
        """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_sessions_user
            ON sessions(user_id)
        """)

        # 6. Registrar las fincas y nodos del prototipo
        # INSERT OR IGNORE evita duplicar registros al reiniciar.
        existing_nodes = [
            ("ESP32_TEST", "Finca 01"),
            ("ESP32_TEST_02", "Finca 02"),
            ("ESP32C6_01", "Finca 03"),
        ]

        current_time = datetime.now(timezone.utc).isoformat()

        for node_id, farm_name in existing_nodes:

            connection.execute("""
                INSERT OR IGNORE INTO farms (name, created_at)
                VALUES (?, ?)
            """, (farm_name, current_time))

            farm = connection.execute("""
                SELECT id
                FROM farms
                WHERE name = ?
            """, (farm_name,)).fetchone()

            connection.execute("""
                INSERT OR IGNORE INTO nodes (
                    node_id,
                    farm_id,
                    created_at
                )
                VALUES (?, ?, ?)
            """, (node_id, farm["id"], current_time))


def save_measurement(
    node_id,
    timestamp,
    soil_moisture_pct,
    temperature_c,
    humidity_pct
):
    """Guarda una medición enviada por un nodo IoT."""

    with get_connection() as connection:

        cursor = connection.execute("""
            INSERT INTO measurements (
                node_id,
                timestamp,
                soil_moisture_pct,
                temperature_c,
                humidity_pct
            )
            VALUES (?, ?, ?, ?, ?)
        """, (
            node_id,
            timestamp,
            soil_moisture_pct,
            temperature_c,
            humidity_pct
        ))

        return cursor.lastrowid



def get_measurements(limit=50, node_id=None, farm_id=None):
    """
    Devuelve mediciones recientes.

    Si se proporciona farm_id, limita los resultados
    a los nodos asociados a esa finca.
    """

    with get_connection() as connection:

        if farm_id is None:
            query = """
                SELECT *
                FROM measurements
            """
            params = []

        else:
            query = """
                SELECT measurements.*
                FROM measurements
                JOIN nodes
                    ON measurements.node_id = nodes.node_id
                WHERE nodes.farm_id = ?
            """
            params = [farm_id]

        if node_id is not None:
            if farm_id is None:
                query += " WHERE node_id = ?"
            else:
                query += " AND measurements.node_id = ?"

            params.append(node_id)

        query += " ORDER BY measurements.id DESC LIMIT ?"
        params.append(limit)

        rows = connection.execute(
            query,
            params
        ).fetchall()

        return [dict(row) for row in rows]


def get_latest_measurement(node_id=None, farm_id=None):
    """Devuelve la medición más reciente según los permisos."""

    measurements = get_measurements(
        limit=1,
        node_id=node_id,
        farm_id=farm_id
    )

    if measurements:
        return measurements[0]

    return None

def get_node_ids(farm_id=None):
    """Devuelve todos los nodos o solamente los de una finca."""

    with get_connection() as connection:

        if farm_id is None:
            rows = connection.execute("""
                SELECT node_id
                FROM nodes
                ORDER BY node_id
            """).fetchall()

        else:
            rows = connection.execute("""
                SELECT node_id
                FROM nodes
                WHERE farm_id = ?
                ORDER BY node_id
            """, (farm_id,)).fetchall()

        return [row["node_id"] for row in rows]

#A partir de acá las funciones son para el inicio de sesión

def get_user_by_username(username):
    """Busca un usuario por su nombre de usuario."""

    with get_connection() as connection:
        row = connection.execute("""
            SELECT
                id,
                username,
                password_hash,
                role,
                farm_id,
                is_active,
                created_at
            FROM users
            WHERE username = ?
        """, (username,)).fetchone()

        return dict(row) if row else None


def create_session(user_id, token_hash, expires_at):
    """Registra una nueva sesión para un usuario."""

    created_at = datetime.now(timezone.utc).isoformat()

    with get_connection() as connection:
        cursor = connection.execute("""
            INSERT INTO sessions (
                user_id,
                token_hash,
                expires_at,
                created_at
            )
            VALUES (?, ?, ?, ?)
        """, (
            user_id,
            token_hash,
            expires_at,
            created_at
        ))

        return cursor.lastrowid


def get_session_user(token_hash):
    """
    Busca una sesión válida y devuelve los datos
    del usuario asociado.
    """

    current_time = datetime.now(timezone.utc).isoformat()

    with get_connection() as connection:
        row = connection.execute("""
            SELECT
                users.id,
                users.username,
                users.role,
                users.farm_id,
                users.is_active,
                farms.name AS farm_name,
                sessions.id AS session_id
            FROM sessions
            JOIN users
                ON sessions.user_id = users.id
            LEFT JOIN farms
                ON users.farm_id = farms.id
            WHERE sessions.token_hash = ?
                AND sessions.expires_at > ?
                AND users.is_active = 1
        """, (
            token_hash,
            current_time
        )).fetchone()

        return dict(row) if row else None


def delete_session(token_hash):
    """Elimina una sesión al cerrar sesión."""

    with get_connection() as connection:
        connection.execute("""
            DELETE FROM sessions
            WHERE token_hash = ?
        """, (token_hash,))


def delete_expired_sessions():
    """Elimina las sesiones que ya han vencido."""

    current_time = datetime.now(timezone.utc).isoformat()

    with get_connection() as connection:
        cursor = connection.execute("""
            DELETE FROM sessions
            WHERE expires_at <= ?
        """, (current_time,))

        return cursor.rowcount

#para administrar las cuentas desde admin

def get_all_users():
    """Devuelve todos los usuarios con el nombre de su finca.

    No incluye los hashes de las contraseñas.
    """

    with get_connection() as connection:
        rows = connection.execute("""
            SELECT
                users.id,
                users.username,
                users.role,
                users.farm_id,
                farms.name AS farm_name,
                users.is_active,
                users.created_at
            FROM users
            LEFT JOIN farms
                ON users.farm_id = farms.id
            ORDER BY users.id ASC
        """).fetchall()

        return [
            {
                **dict(row),
                "is_active": bool(row["is_active"])
            }
            for row in rows
        ]


def create_farmer_user(username, password_hash, farm_id):
    """
    Registra un nuevo agricultor en la base de datos.
    """

    from datetime import datetime, timezone

    created_at = datetime.now(timezone.utc).isoformat()

    with get_connection() as connection:

        # Comprobar que la finca existe
        farm = connection.execute(
            "SELECT id, name FROM farms WHERE id = ?",
            (farm_id,)
        ).fetchone()

        if farm is None:
            raise ValueError("La finca seleccionada no existe.")

        # Comprobar que el usuario no esté registrado
        existing_user = connection.execute(
            "SELECT id FROM users WHERE username = ?",
            (username,)
        ).fetchone()

        if existing_user is not None:
            raise ValueError("Ese nombre de usuario ya está registrado.")

        # Guardar el nuevo agricultor
        cursor = connection.execute(
            """
            INSERT INTO users (
                username,
                password_hash,
                role,
                farm_id,
                is_active,
                created_at
            )
            VALUES (?, ?, 'farmer', ?, 1, ?)
            """,
            (username, password_hash, farm_id, created_at)
        )

        return {
            "id": cursor.lastrowid,
            "username": username,
            "role": "farmer",
            "farm_id": farm_id,
            "farm_name": farm["name"],
            "is_active": True,
            "created_at": created_at
        }

def update_farmer_user(user_id, username, farm_id):
    """
    Actualiza el nombre de usuario y la finca asignada
    a una cuenta de agricultor.
    """

    with get_connection() as connection:

        # 1. Comprobar que el usuario existe y es agricultor
        user = connection.execute(
            """
            SELECT id, role
            FROM users
            WHERE id = ?
            """,
            (user_id,)
        ).fetchone()

        if user is None:
            raise ValueError("El usuario no existe.")

        if user["role"] != "farmer":
            raise ValueError(
                "Solo se pueden editar cuentas de agricultores."
            )

        # 2. Comprobar que la finca existe
        farm = connection.execute(
            "SELECT id, name FROM farms WHERE id = ?",
            (farm_id,)
        ).fetchone()

        if farm is None:
            raise ValueError("La finca seleccionada no existe.")

        # 3. Comprobar que el nombre no esté usado por otro usuario
        existing_user = connection.execute(
            """
            SELECT id
            FROM users
            WHERE username = ? AND id != ?
            """,
            (username, user_id)
        ).fetchone()

        if existing_user is not None:
            raise ValueError(
                "Ese nombre de usuario ya está registrado."
            )

        # 4. Actualizar los datos
        connection.execute(
            """
            UPDATE users
            SET username = ?, farm_id = ?
            WHERE id = ?
            """,
            (username, farm_id, user_id)
        )

        return {
            "id": user_id,
            "username": username,
            "role": "farmer",
            "farm_id": farm_id,
            "farm_name": farm["name"]
        }

def set_farmer_user_status(user_id, is_active):
    """
    Activa o desactiva una cuenta de agricultor.

    Cuando se desactiva, elimina sus sesiones activas
    para impedir que siga utilizando una sesión anterior.
    """

    with get_connection() as connection:

        # 1. Comprobar que el usuario existe
        user = connection.execute(
            """
            SELECT id, role
            FROM users
            WHERE id = ?
            """,
            (user_id,)
        ).fetchone()

        if user is None:
            raise ValueError("El usuario no existe.")

        # 2. Evitar modificar cuentas administradoras
        if user["role"] != "farmer":
            raise ValueError(
                "Solo se pueden modificar cuentas de agricultores."
            )

        # 3. Actualizar el estado
        connection.execute(
            """
            UPDATE users
            SET is_active = ?
            WHERE id = ?
            """,
            (int(is_active), user_id)
        )

        # 4. Si se desactiva, eliminar sus sesiones
        if not is_active:
            connection.execute(
                """
                DELETE FROM sessions
                WHERE user_id = ?
                """,
                (user_id,)
            )

        return {
            "id": user_id,
            "is_active": bool(is_active)
        }


def reset_farmer_password(user_id: int, password_hash: str):
    """
    Actualiza la contraseña de un agricultor e invalida
    todas sus sesiones anteriores.

    Ambas operaciones se realizan dentro de una
    misma transacción.
    """

    with get_connection() as connection:

        # 1. Comprobar que el usuario existe
        user = connection.execute(
            """
            SELECT id, username, role
            FROM users
            WHERE id = ?
            """,
            (user_id,)
        ).fetchone()

        if user is None:
            raise ValueError("El usuario no existe.")

        # 2. Evitar modificar cuentas administradoras
        if user["role"] != "farmer":
            raise ValueError(
                "Solo se pueden restablecer contraseñas "
                "de agricultores."
            )

        # 3. Actualizar el hash de la contraseña
        connection.execute(
            """
            UPDATE users
            SET password_hash = ?
            WHERE id = ?
            """,
            (password_hash, user_id)
        )

        # 4. Invalidar todas las sesiones anteriores
        connection.execute(
            """
            DELETE FROM sessions
            WHERE user_id = ?
            """,
            (user_id,)
        )

        return {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"]
        }
#---------------------------------------------------------
# Para cambiar el usuario y la contraseña del administrador

def get_user_credentials(user_id: int):
    """
    Obtiene los datos necesarios para verificar las credenciales
    de un usuario. Incluye el hash, nunca la contraseña original.
    """

    with get_connection() as connection:
        row = connection.execute("""
            SELECT id, username, role, password_hash
            FROM users
            WHERE id = ?
        """, (user_id,)).fetchone()

        return dict(row) if row else None


def update_admin_username(user_id: int, username: str):
    """
    Actualiza el nombre de usuario de una cuenta administradora.
    """

    with get_connection() as connection:

        # 1. Comprobar que el usuario existe y es administrador.
        user = connection.execute("""
            SELECT id, role
            FROM users
            WHERE id = ?
        """, (user_id,)).fetchone()

        if user is None:
            raise ValueError("La cuenta no existe.")

        if user["role"] != "admin":
            raise ValueError("Esta operación solo está disponible para administradores.")

        # 2. Comprobar que el nuevo nombre no esté ocupado.
        existing_user = connection.execute("""
            SELECT id
            FROM users
            WHERE username = ? AND id != ?
        """, (username, user_id)).fetchone()

        if existing_user is not None:
            raise ValueError("Ese nombre de usuario ya está registrado.")

        # 3. Actualizar el nombre.
        connection.execute("""
            UPDATE users
            SET username = ?
            WHERE id = ?
        """, (username, user_id))

        return {
            "id": user_id,
            "username": username,
            "role": "admin"
        }


def update_admin_password(user_id: int, password_hash: str):
    """
    Actualiza la contraseña de un administrador e invalida
    todas sus sesiones anteriores.
    """

    with get_connection() as connection:

        # 1. Comprobar que la cuenta existe y es administradora.
        user = connection.execute("""
            SELECT id, username, role
            FROM users
            WHERE id = ?
        """, (user_id,)).fetchone()

        if user is None:
            raise ValueError("La cuenta no existe.")

        if user["role"] != "admin":
            raise ValueError("Esta operación solo está disponible para administradores.")

        # 2. Guardar el nuevo hash de contraseña.
        connection.execute("""
            UPDATE users
            SET password_hash = ?
            WHERE id = ?
        """, (password_hash, user_id))

        # 3. Eliminar todas las sesiones anteriores.
        connection.execute("""
            DELETE FROM sessions
            WHERE user_id = ?
        """, (user_id,))

        return {
            "id": user["id"],
            "username": user["username"],
            "role": "admin"
        }