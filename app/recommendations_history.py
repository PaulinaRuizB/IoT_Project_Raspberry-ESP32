
from datetime import datetime, timezone, timedelta

from app.database import get_connection

from app.recommendations import (evaluate_measurement, valid_number,)


# ============================================
# 1. CONFIGURACION GENERAL
# ============================================

MAX_MEASUREMENT_AGE = timedelta(minutes=10)


# ============================================
# 2. TABLA DE RECOMENDACIONES
# ============================================

def initialize_recommendation_history():

    with get_connection() as connection:

        connection.execute("""
            CREATE TABLE IF NOT EXISTS recommendations (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                node_id TEXT NOT NULL,
                farm_id INTEGER NOT NULL,
 
                first_measurement_id INTEGER NOT NULL,
                last_measurement_id INTEGER NOT NULL,

                code TEXT NOT NULL,
                severity TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                variable TEXT NOT NULL,

                value REAL NOT NULL,
                threshold REAL NOT NULL,

                created_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                closed_at TEXT,

                decision TEXT
                    CHECK (decision IN ('accepted', 'rejected')),

                rejection_reason TEXT,

                decided_by INTEGER,
                decided_at TEXT,

                FOREIGN KEY (node_id)
                    REFERENCES nodes(node_id),

                FOREIGN KEY (farm_id)
                    REFERENCES farms(id),

                FOREIGN KEY (first_measurement_id)
                    REFERENCES measurements(id),

                FOREIGN KEY (last_measurement_id)
                    REFERENCES measurements(id),

                FOREIGN KEY (decided_by)
                    REFERENCES users(id),

                CHECK (
                    (
                        decision IS NULL
                        AND rejection_reason IS NULL
                        AND decided_by IS NULL
                        AND decided_at IS NULL
                    )
                    OR
                    (
                        decision = 'accepted'
                        AND rejection_reason IS NULL
                        AND decided_by IS NOT NULL
                        AND decided_at IS NOT NULL
                    )
                    OR
                    (
                        decision = 'rejected'
                        AND rejection_reason IS NOT NULL
                        AND length(trim(rejection_reason))
                            BETWEEN 1 AND 700
                        AND decided_by IS NOT NULL
                        AND decided_at IS NOT NULL
                    )
                )
            )
        """)

        # Solo puede existir una recomendacion
        # activa del mismo tipo por nodo y finca.

        connection.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS
                idx_active_recommendation
            ON recommendations(
                node_id, farm_id, code
            )
            WHERE closed_at IS NULL
        """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS
                idx_recommendations_farm
            ON recommendations(farm_id, id)
        """)


# ============================================
# EVALUAR Y REGISTRAR RECOMENDACIONES
# ============================================

def sync_recommendations(connection,measurement_id,measurement):
    
    node_id = measurement["node_id"]
    timestamp = measurement["timestamp"]

    # 1. Identificar la finca del nodo.
    node = connection.execute("""
        SELECT farm_id
        FROM nodes
        WHERE node_id = ?
    """, (node_id,)).fetchone()

    # No generar recomendaciones para
    # nodos no registrados.
    if node is None:
        return

    farm_id = node["farm_id"]

    # 2. Evaluar las reglas agricolas.
    detected = evaluate_measurement(measurement)

    detected_codes = {
        item["code"] for item in detected
    }

    # 3. Buscar recomendaciones abiertas.
    active = connection.execute("""
        SELECT id, code
        FROM recommendations
        WHERE node_id = ?
          AND farm_id = ?
          AND closed_at IS NULL
    """, (node_id, farm_id)).fetchall()

    active_by_code = {
        row["code"]: row["id"]
        for row in active
    }

    # 4. Validar las lecturas de los sensores.
    soil_valid = valid_number(
        measurement.get("soil_moisture_pct"),
        0, 100
    )

    temperature_valid = valid_number(
        measurement.get("temperature_c"),
        -50, 100
    )

    humidity_valid = valid_number(
        measurement.get("humidity_pct"),
        0, 100
    )

    can_evaluate = {
        "SOIL_LOW": soil_valid,
        "SOIL_HIGH": soil_valid,

        "TEMPERATURE_LOW": temperature_valid,
        "TEMPERATURE_HIGH": temperature_valid,

        "HUMIDITY_LOW": humidity_valid,
        "HUMIDITY_HIGH": humidity_valid,

        "HOT_DRY_AIR": (
            temperature_valid and humidity_valid
        )
    }

    # 5. Cerrar recomendaciones cuando
    # la condicion deja de cumplirse.
    for code, recommendation_id in active_by_code.items():

        if (
            code not in detected_codes
            and can_evaluate.get(code, False)
        ):

            connection.execute("""
                UPDATE recommendations
                SET closed_at = ?
                WHERE id = ?
            """, (
                timestamp,
                recommendation_id
            ))

    # 6. Crear o actualizar recomendaciones.
    for item in detected:

        code = item["code"]

        if code in active_by_code:

            # La recomendacion ya existe.
            # Actualizamos la ultima medicion,
            # conservando la decision del agricultor.

            connection.execute("""
                UPDATE recommendations
                SET last_measurement_id = ?,
                    last_seen_at = ?
                WHERE id = ?
            """, (
                measurement_id,
                timestamp,
                active_by_code[code]
            ))

        else:

            # Se detecto una nueva condicion.

            connection.execute("""
                INSERT INTO recommendations (
                    node_id,
                    farm_id,
                    first_measurement_id,
                    last_measurement_id,
                    code,
                    severity,
                    title,
                    message,
                    variable,
                    value,
                    threshold,
                    created_at,
                    last_seen_at
                )
                VALUES (
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?
                )
            """, (
                node_id,
                farm_id,
                measurement_id,
                measurement_id,
                code,
                item["severity"],
                item["title"],
                item["message"],
                item["variable"],
                item["value"],
                item["threshold"],
                timestamp,
                timestamp
            ))

# ============================================
# 4. CONSULTAR RECOMENDACIONES ACTIVAS
# ============================================

def get_active_recommendations(node_id,measurement_id,farm_id=None):

    query = """
        SELECT
            id,
            code,
            decision,
            rejection_reason,
            decided_at
        FROM recommendations
        WHERE node_id = ?
          AND closed_at IS NULL
          AND first_measurement_id <= ?
          AND last_measurement_id >= ?
    """

    params = [
        node_id,
        measurement_id,
        measurement_id
    ]

    if farm_id is not None:

        query += " AND farm_id = ?"
        params.append(farm_id)

    with get_connection() as connection:

        rows = connection.execute(
            query, params
        ).fetchall()

        return {
            row["code"]: dict(row)
            for row in rows
        }


# ============================================
# 5. REGISTRAR DECISION DEL AGRICULTOR
# ============================================

def save_recommendation_decision(recommendation_id,decision, reason,current_user):

    if decision not in ("accepted", "rejected"):
        raise ValueError("Decision no valida.")

    if decision == "rejected":

        reason = (reason or "").strip()

        if not reason:
            raise ValueError(
                "Debe indicar el motivo del rechazo."
            )

        if len(reason) > 700:
            raise ValueError(
                "El motivo no puede superar "
                "los 700 caracteres."
            )

    else:
        reason = None

    now = datetime.now(timezone.utc)

    with get_connection() as connection:

        # Evita que dos usuarios registren
        # decisiones simultaneas incompatibles.
        connection.execute("BEGIN IMMEDIATE")

        recommendation = connection.execute("""
            SELECT recommendations.*
            FROM recommendations
            JOIN nodes
                ON recommendations.node_id = nodes.node_id
               AND recommendations.farm_id = nodes.farm_id
            WHERE recommendations.id = ?
        """, (recommendation_id,)).fetchone()

        if recommendation is None:
            raise LookupError(
                "Recomendacion no encontrada."
            )

        # Validar permisos por finca.
        if current_user["role"] == "farmer":

            if (
                recommendation["farm_id"]
                != current_user["farm_id"]
            ):
                raise LookupError(
                    "Recomendacion no encontrada."
                )

        elif current_user["role"] != "admin":

            raise LookupError(
                "Recomendacion no encontrada."
            )

        # No modificar decisiones anteriores.
        if recommendation["decision"] is not None:
            raise RuntimeError(
                "Esta recomendacion ya tiene "
                "una decision registrada."
            )

        # No aceptar decisiones sobre una
        # condicion que ya fue cerrada.
        if recommendation["closed_at"] is not None:
            raise RuntimeError(
                "Esta recomendacion ya no esta activa."
            )

        # Verificar que la recomendacion
        # corresponde a la ultima medicion.
        latest = connection.execute("""
            SELECT id, timestamp
            FROM measurements
            WHERE node_id = ?
            ORDER BY id DESC
            LIMIT 1
        """, (
            recommendation["node_id"],
        )).fetchone()

        if (
            latest is None
            or latest["id"]
            != recommendation["last_measurement_id"]
        ):
            raise RuntimeError(
                "La recomendacion requiere "
                "una medicion valida y reciente."
            )

        try:

            timestamp = datetime.fromisoformat(
                latest["timestamp"].replace(
                    "Z", "+00:00"
                )
            )

            if timestamp.tzinfo is None:
                raise ValueError()

            age = now - timestamp

        except (ValueError, TypeError, AttributeError):

            raise RuntimeError(
                "La fecha de la medicion no es valida."
            )

        if (
            age < timedelta(0)
            or age > MAX_MEASUREMENT_AGE
        ):

            raise RuntimeError(
                "La medicion esta desactualizada."
            )

        # Guardar decision.
        connection.execute("""
            UPDATE recommendations
            SET decision = ?,
                rejection_reason = ?,
                decided_by = ?,
                decided_at = ?
            WHERE id = ?
        """, (
            decision,
            reason,
            current_user["id"],
            now.isoformat(),
            recommendation_id
        ))

        return {
            "id": recommendation_id,
            "decision": decision,
            "rejection_reason": reason,
            "decided_by": current_user["id"],
            "decided_at": now.isoformat()
        }


# ============================================
# 6. CONSULTAR HISTORIAL
# ============================================

def get_recommendation_history(
    farm_id=None,
    node_id=None,
    limit=50
):

    query = """
        SELECT
            recommendations.*,
            farms.name AS farm_name,
            users.username AS decided_by_username

        FROM recommendations

        JOIN farms
            ON recommendations.farm_id = farms.id

        LEFT JOIN users
            ON recommendations.decided_by = users.id

        WHERE 1 = 1
    """

    params = []

    if farm_id is not None:

        query += " AND recommendations.farm_id = ?"
        params.append(farm_id)

    if node_id is not None:

        query += " AND recommendations.node_id = ?"
        params.append(node_id)

    query += " ORDER BY recommendations.id DESC LIMIT ?"

    params.append(limit)

    with get_connection() as connection:

        rows = connection.execute(
            query, params
        ).fetchall()

        return [dict(row) for row in rows]
