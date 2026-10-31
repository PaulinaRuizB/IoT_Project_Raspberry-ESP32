
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
