
# app/recommendations.py

from dataclasses import dataclass, asdict
from math import isfinite


# ============================================
# 1. CONFIGURACION DE UMBRALES
# ============================================

@dataclass(frozen=True)
class RecommendationConfig:
    """
    Umbrales provisionales para pruebas.

    Deben ajustarse al cultivo y al suelo
    antes de emplearse para decisiones reales.
    """

    # Humedad del suelo (% relativo calibrado)
    soil_low_pct: float = 30.0
    soil_high_pct: float = 85.0

    # Temperatura ambiental (C)
    temperature_low_c: float = 15.0
    temperature_high_c: float = 32.0

    # Humedad ambiental (%)
    humidity_low_pct: float = 40.0
    humidity_high_pct: float = 85.0


# ============================================
# 2. ESTRUCTURA DE RECOMENDACIONES
# ============================================

@dataclass(frozen=True)
class Recommendation:

    code: str
    severity: str
    title: str
    message: str
    variable: str
    value: float
    threshold: float

    def to_dict(self):
        return asdict(self)


# ============================================
# 3. VALIDAR MEDICIONES
# ============================================

def valid_number(value, minimum, maximum):
    """
    Comprueba que el valor sea numerico,
    finito y pertenezca al rango permitido.
    """

    if isinstance(value, bool):
        return False

    if not isinstance(value, (int, float)):
        return False

    return (
        isfinite(value)
        and minimum <= value <= maximum
    )


# ============================================
# 4. EVALUAR MEDICIONES
# ============================================

def evaluate_measurement(
    measurement: dict,
    config: RecommendationConfig = None
) -> list[dict]:

    if config is None:
        config = RecommendationConfig()

    # Validar configuracion.
    if not (
        0 <= config.soil_low_pct
        < config.soil_high_pct <= 100
    ):
        raise ValueError("Umbrales de suelo invalidos")

    if not (
        -50 <= config.temperature_low_c
        < config.temperature_high_c <= 100
    ):
        raise ValueError("Umbrales de temperatura invalidos")

    if not (
        0 <= config.humidity_low_pct
        < config.humidity_high_pct <= 100
    ):
        raise ValueError("Umbrales de humedad invalidos")

    recommendations = []

    soil = measurement.get("soil_moisture_pct")
    temperature = measurement.get("temperature_c")
    humidity = measurement.get("humidity_pct")

    soil_valid = valid_number(soil, 0, 100)
    temp_valid = valid_number(temperature, -50, 100)
    humidity_valid = valid_number(humidity, 0, 100)

    # ========================================
    # 4.1. HUMEDAD DEL SUELO
    # ========================================

    if soil_valid:

        if soil < config.soil_low_pct:

            recommendations.append(
                Recommendation(
                    code="SOIL_LOW",
                    severity="warning",
                    title="Humedad del suelo baja",
                    message=(
                        "Inspeccione el suelo y evalue "
                        "si el cultivo necesita riego."
                    ),
                    variable="soil_moisture_pct",
                    value=soil,
                    threshold=config.soil_low_pct
                ).to_dict()
            )

        elif soil > config.soil_high_pct:

            recommendations.append(
                Recommendation(
                    code="SOIL_HIGH",
                    severity="warning",
                    title="Humedad del suelo elevada",
                    message=(
                        "Revise las condiciones de "
                        "drenaje y verifique si existe "
                        "exceso de agua en el suelo."
                    ),
                    variable="soil_moisture_pct",
                    value=soil,
                    threshold=config.soil_high_pct
                ).to_dict()
            )

    # ========================================
    # 4.2. TEMPERATURA
    # ========================================

    if temp_valid:

        if temperature < config.temperature_low_c:

            recommendations.append(
                Recommendation(
                    code="TEMPERATURE_LOW",
                    severity="warning",
                    title="Temperatura baja",
                    message=(
                        "Revise las condiciones termicas "
                        "del cultivo y posibles signos "
                        "de estres por frio."
                    ),
                    variable="temperature_c",
                    value=temperature,
                    threshold=config.temperature_low_c
                ).to_dict()
            )

        elif temperature > config.temperature_high_c:

            recommendations.append(
                Recommendation(
                    code="TEMPERATURE_HIGH",
                    severity="warning",
                    title="Temperatura elevada",
                    message=(
                        "Inspeccione las condiciones "
                        "termicas del cultivo y evalue "
                        "posibles medidas de proteccion."
                    ),
                    variable="temperature_c",
                    value=temperature,
                    threshold=config.temperature_high_c
                ).to_dict()
            )

    # ========================================
    # 4.3. HUMEDAD AMBIENTAL
    # ========================================

    if humidity_valid:

        if humidity < config.humidity_low_pct:

            recommendations.append(
                Recommendation(
                    code="HUMIDITY_LOW",
                    severity="info",
                    title="Humedad ambiental baja",
                    message=(
                        "Revise las condiciones de "
                        "sequedad ambiental y observe "
                        "posibles signos de estres "
                        "hidrico en el cultivo."
                    ),
                    variable="humidity_pct",
                    value=humidity,
                    threshold=config.humidity_low_pct
                ).to_dict()
            )

        elif humidity > config.humidity_high_pct:

            recommendations.append(
                Recommendation(
                    code="HUMIDITY_HIGH",
                    severity="info",
                    title="Humedad ambiental elevada",
                    message=(
                        "Inspeccione la ventilacion "
                        "y observe el estado de hojas "
                        "y frutos ante condiciones "
                        "que podrian favorecer "
                        "algunas enfermedades."
                    ),
                    variable="humidity_pct",
                    value=humidity,
                    threshold=config.humidity_high_pct
                ).to_dict()
            )

    # ========================================
    # 4.4. CONDICIONES COMBINADAS
    # ========================================

    if temp_valid and humidity_valid:

        if (
            temperature > config.temperature_high_c
            and humidity < config.humidity_low_pct
        ):

            recommendations.append(
                Recommendation(
                    code="HOT_DRY_AIR",
                    severity="warning",
                    title="Ambiente caluroso y seco",
                    message=(
                        "La temperatura elevada y "
                        "la humedad ambiental baja "
                        "podrian incrementar la demanda "
                        "de agua del cultivo. Revise "
                        "las condiciones de las plantas "
                        "y la humedad del suelo."
                    ),
                    variable="temperature_c",
                    value=temperature,
                    threshold=config.temperature_high_c
                ).to_dict()
            )

    return recommendations
