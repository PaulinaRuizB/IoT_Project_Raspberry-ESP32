
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


def get_measurements(limit=50): #recupera hasta 50 mediciones
    """Devuelve las mediciones más recientes primero."""

    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row

    try:
        rows = connection.execute("""
            SELECT *
            FROM measurements
            ORDER BY id DESC
            LIMIT ?
        """, (limit,)).fetchall()

        return [dict(row) for row in rows]

    finally:
        connection.close()


def get_latest_measurement(): #devuelve la última medición o none si no hay datos 
    """Devuelve la medición más reciente, si existe."""

    measurements = get_measurements(limit=1)

    if measurements:
        return measurements[0]

    return None
