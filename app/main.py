
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query, Depends
from pydantic import BaseModel, Field
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.database import (
    initialize_database,
    save_measurement,
    get_measurements,
    get_latest_measurement,
    get_node_ids,
)

#conectarse al archivo de autenticación
from app.auth import router as auth_router
from app.auth import get_current_user

app = FastAPI(title="IoT Server")
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
app.include_router(auth_router) 


app.mount(
    "/static",
    StaticFiles(directory=STATIC_DIR),
    name="static"
)

# Modelo que define los datos que debe enviar un nodo IoT
class MeasurementInput(BaseModel):
    node_id: str = Field(min_length=1, max_length=50)
    soil_moisture_pct: float | None = Field(default=None,ge=0,le=100)
    temperature_c: float = Field(ge=-50, le=100)
    humidity_pct: float | None = Field(default=None, ge=0, le=100)

# Crear la tabla al iniciar la aplicación
@app.on_event("startup")
def startup_event():
    initialize_database()


@app.get("/")
def root():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/status")
def status():
    return {
        "server": "IoT Server",
        "status": "online",
        "version": "1.0.0"
    }


# Recibir y guardar una medición
@app.post("/api/measurements", status_code=201) #recibe los datos y los guarda en SQLite con fecha y hora del server
def create_measurement(measurement: MeasurementInput):
    timestamp = datetime.now(timezone.utc).isoformat()

    try:
        measurement_id = save_measurement(
            node_id=measurement.node_id,
            timestamp=timestamp,
            soil_moisture_pct=measurement.soil_moisture_pct,
            temperature_c=measurement.temperature_c,
            humidity_pct=measurement.humidity_pct,
        )
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail="No fue posible guardar la medición."
        ) from error

    return {
        "message": "Medición guardada correctamente",
        "id": measurement_id,
        "node_id": measurement.node_id,
        "timestamp": timestamp,
    }


# Consultar el historial de mediciones
@app.get("/api/measurements")
def list_measurements(
    limit: int = Query(default=50, ge=1, le=500),
    node_id: str | None = Query(default=None, min_length=1, max_length=50),
    current_user: dict = Depends(get_current_user)
):
    # Los administradores pueden consultar todas las fincas.
    # Los agricultores solamente pueden consultar su propia finca.
    farm_id = (
        current_user["farm_id"]
        if current_user["role"] == "farmer"
        else None
    )

    return get_measurements(limit=limit, node_id=node_id, farm_id=farm_id )

# Consultar la medición más reciente
@app.get("/api/measurements/latest")
def latest_measurement(
    node_id: str | None = Query(default=None, min_length=1, max_length=50),
    current_user: dict = Depends(get_current_user)
):
    farm_id = (
        current_user["farm_id"]
        if current_user["role"] == "farmer"
        else None
    )

    measurement = get_latest_measurement(
        node_id=node_id,
        farm_id=farm_id
    )

    if measurement is None:
        raise HTTPException(
            status_code=404,
            detail="Todavía no hay mediciones registradas para este nodo."
        )

    return measurement

@app.get("/api/nodes")
def list_nodes(
    current_user: dict = Depends(get_current_user)
):
    farm_id = (
        current_user["farm_id"]
        if current_user["role"] == "farmer"
        else None
    )

    return get_node_ids(farm_id=farm_id)