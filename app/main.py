
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
    get_all_users,
    create_farmer_user,
    update_farmer_user, 
    set_farmer_user_status,
    reset_farmer_password,
)

#conectarse al archivo de autenticación
from app.auth import router as auth_router
from app.auth import get_current_user, require_admin
from app.security import hash_password

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

#Modelo para crear usuarios agricultores
class CreateFarmerInput(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)
    farm_id: int = Field(gt=0)

# Modelo para actualizar usuarios agricultores
class UpdateFarmerInput(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    farm_id: int = Field(gt=0)

# Modelo para restablecer la contraseña de un agricultor
class ResetPasswordInput(BaseModel):
    password: str = Field(min_length=6, max_length=128)

# Modelo para activar o desactivar agricultores
class UpdateFarmerStatusInput(BaseModel):
    is_active: bool

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

#creación de usuarios nuevos desde admin

@app.get("/api/admin/users")
def list_users(
    admin: dict = Depends(require_admin)
):
    """
    Devuelve todos los usuarios registrados.
    Solo pueden acceder los administradores.
    """

    return get_all_users()

@app.put("/api/admin/users/{user_id}")
def edit_farmer(user_id: int, data: UpdateFarmerInput, admin=Depends(require_admin)):
    """
    Actualiza el nombre de usuario y la finca
    asignada a un agricultor.
    """

    # Evitar nombres vacíos o con espacios al inicio y al final
    username = data.username.strip()

    if len(username) < 3:
        raise HTTPException(
            status_code=400,
            detail="El nombre de usuario debe tener al menos 3 caracteres."
        )

    try:
        updated_user = update_farmer_user(
            user_id=user_id,
            username=username,
            farm_id=data.farm_id
        )

        return {
            "message": "Usuario actualizado correctamente.",
            "user": updated_user
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

@app.patch("/api/admin/users/{user_id}/status")
def change_farmer_status(
    user_id: int,
    data: UpdateFarmerStatusInput,
    admin=Depends(require_admin)
):
    """
    Activa o desactiva una cuenta de agricultor.
    """

    try:
        updated_user = set_farmer_user_status(
            user_id=user_id,
            is_active=data.is_active
        )

        return {
            "message": (
                "Cuenta activada correctamente."
                if data.is_active
                else "Cuenta desactivada correctamente."
            ),
            "user": updated_user
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )



# CREACIÓN DE USUARIOS - ADMINISTRADOR

@app.post("/api/admin/users", status_code=201)
def create_user(
    user_data: CreateFarmerInput,
    admin: dict = Depends(require_admin)
):
    """
    Registra un nuevo agricultor.
    Solo pueden acceder los administradores.
    """

    # Generar hash seguro de la contraseña
    password_hash = hash_password(user_data.password)

    try:
        new_user = create_farmer_user(
            username=user_data.username.strip(),
            password_hash=password_hash,
            farm_id=user_data.farm_id
        )

        return {
            "message": "Usuario agricultor creado correctamente.",
            "user": new_user
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        ) from error


# RESTABLECIMIENTO DE CONTRASEÑAS - ADMINISTRADOR

@app.put("/api/admin/users/{user_id}/password")
def reset_user_password(
    user_id: int,
    data: ResetPasswordInput,
    admin: dict = Depends(require_admin)
):
    """
    Restablece la contraseña de un agricultor.

    Solo pueden realizar esta operación los administradores.
    La contraseña se almacena mediante Argon2id y se
    invalidan todas las sesiones anteriores del agricultor.
    """

    # 1. Evitar contraseñas vacías o compuestas solo por espacios
    if not data.password.strip():
        raise HTTPException(
            status_code=400,
            detail="La contraseña no puede estar vacía."
        )

    # 2. Generar un nuevo hash mediante Argon2id
    password_hash = hash_password(data.password)

    # 3. Actualizar contraseña e invalidar sesiones
    try:
        updated_user = reset_farmer_password(
            user_id=user_id,
            password_hash=password_hash
        )

        return {
            "message": "Contraseña restablecida correctamente. El usuario deberá iniciar sesión nuevamente.",
            "user": updated_user
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        ) from error
