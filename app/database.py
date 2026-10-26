
import sqlite3
from pathlib import Path

# Ruta principal del proyecto
BASE_DIR = Path(__file__).resolve().parent.parent

# Archivo donde se almacenarán las mediciones
DATABASE_PATH = BASE_DIR / "iot_data.db"


def initialize_database():
    """Crea la base de datos y la tabla de mediciones si no existen."""

    with sqlite3.connect(DATABASE_PATH) as connection:
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

def save_measurement( #inserta una nueva lectura en SQlite 
    node_id,
    timestamp,
    soil_moisture_pct,
    temperature_c,
    humidity_pct
):
    """Guarda una medición enviada por un nodo IoT."""

    connection = sqlite3.connect(DATABASE_PATH)

    try:
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

        connection.commit()
        return cursor.lastrowid

    finally:
        connection.close()



def get_measurements(limit=50, node_id=None):
    """Devuelve mediciones recientes, opcionalmente filtradas por nodo."""

    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row

    try:
        if node_id is None:
            rows = connection.execute("""
                SELECT *
                FROM measurements
                ORDER BY id DESC
                LIMIT ?
            """, (limit,)).fetchall()
        else:
            rows = connection.execute("""
                SELECT *
                FROM measurements
                WHERE node_id = ?
                ORDER BY id DESC
                LIMIT ?
            """, (node_id, limit)).fetchall()

        return [dict(row) for row in rows]

    finally:
        connection.close()


def get_latest_measurement(node_id=None):
    """Devuelve la medición más reciente, opcionalmente por nodo."""

    measurements = get_measurements(limit=1, node_id=node_id)

    if measurements:
        return measurements[0]

    return None


def get_node_ids():
    """Devuelve los identificadores de nodos registrados."""

    connection = sqlite3.connect(DATABASE_PATH)

    try:
        rows = connection.execute("""
            SELECT DISTINCT node_id
            FROM measurements
            ORDER BY node_id
        """).fetchall()

        return [row[0] for row in rows]

    finally:
        connection.close()
