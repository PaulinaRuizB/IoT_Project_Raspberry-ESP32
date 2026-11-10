
import secrets
import hashlib

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, Field

from app.database import (
    get_user_by_username,
    create_session,
    get_session_user,
    delete_session,
    delete_expired_sessions,
    get_user_credentials,
    update_admin_username,
    update_admin_password,
)

from app.security import verify_password, hash_password


# Configuración de sesiones
SESSION_COOKIE_NAME = "iot_session"
SESSION_DURATION_HOURS = 12

# Router de autenticación
router = APIRouter(prefix="/api/auth", tags=["Autenticación"])

# ========================================
# MODELOS PARA MODIFICAR LA CUENTA ADMIN
# ========================================

class UpdateMyUsernameInput(BaseModel):
    username: str = Field(min_length=3, max_length=50)


class ChangeMyPasswordInput(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


def hash_token(token: str) -> str:
    """Genera el hash SHA-256 de un token de sesión."""

    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def get_current_user(request: Request):
    """
    Comprueba la cookie de sesión y devuelve
    los datos del usuario autenticado.
    """

    token = request.cookies.get(SESSION_COOKIE_NAME)

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Debes iniciar sesión."
        )

    token_hash = hash_token(token)
    user = get_session_user(token_hash)

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="La sesión no es válida o ha expirado."
        )

    return user


def require_authenticated_user(request: Request):
    """Permite el acceso a cualquier usuario autenticado."""

    return get_current_user(request)


def require_admin(request: Request):
    """Permite el acceso únicamente a administradores."""

    user = get_current_user(request)

    if user["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="No tienes permisos para realizar esta operación."
        )

    return user

#Un visitante que intenta consultar las fincas recibe 401.
#Un agricultor que intenta acceder a la administración recibe 403.
#Un administrador autenticado puede continuar.

@router.post("/login")
def login(request: Request, response: Response, credentials: dict):
    """Inicia sesión y crea una cookie segura."""

    username = credentials.get("username", "").strip()
    password = credentials.get("password", "")

    if not username or not password:
        raise HTTPException(
            status_code=400,
            detail="Debes proporcionar usuario y contraseña."
        )

    user = get_user_by_username(username)

    if user is None or not verify_password(
        password,
        user["password_hash"]
    ):
        raise HTTPException(
            status_code=401,
            detail="Usuario o contraseña incorrectos."
        )

    if not user["is_active"]:
        raise HTTPException(
            status_code=403,
            detail="Esta cuenta está desactivada."
        )

    # Limpiar sesiones vencidas
    delete_expired_sessions()

    # Generar token aleatorio
    token = secrets.token_urlsafe(32)
    token_hash = hash_token(token)

    # Definir vencimiento
    expires_at = (
        datetime.now(timezone.utc)
        + timedelta(hours=SESSION_DURATION_HOURS)
    ).isoformat()

    # Guardar el hash en SQLite
    create_session(
        user_id=user["id"],
        token_hash=token_hash,
        expires_at=expires_at
    )

    # Crear cookie en el navegador
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_DURATION_HOURS * 60 * 60,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/"
    )

    return {
        "message": "Inicio de sesión correcto.",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
            "farm_id": user["farm_id"]
        }
    }


@router.get("/me")
def read_current_user(request: Request):
    """Devuelve los datos del usuario conectado."""

    user = get_current_user(request)

    return {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "farm_id": user["farm_id"],
        "farm_name": user["farm_name"]
    }


@router.post("/logout")
def logout(request: Request, response: Response):
    """Cierra la sesión actual."""

    token = request.cookies.get(SESSION_COOKIE_NAME)

    if token:
        token_hash = hash_token(token)
        delete_session(token_hash)

    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=False,
        samesite="lax"
    )

    return {
        "message": "Sesión cerrada correctamente."
    }

# ========================================
# MODIFICAR NOMBRE DE USUARIO DEL ADMIN
# ========================================

@router.put("/me/username")
def update_my_username(
    data: UpdateMyUsernameInput,
    admin: dict = Depends(require_admin)
):
    """
    Permite al administrador cambiar su propio nombre de usuario.
    """

    username = data.username.strip()

    if len(username) < 3:
        raise HTTPException(
            status_code=400,
            detail="El nombre de usuario debe tener al menos 3 caracteres."
        )

    try:
        updated_user = update_admin_username(
            user_id=admin["id"],
            username=username
        )

        return {
            "message": "Nombre de usuario actualizado correctamente.",
            "user": updated_user
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        ) from error


# ========================================
# CAMBIAR CONTRASEÑA DEL ADMIN
# ========================================

@router.put("/me/password")
def change_my_password(
    data: ChangeMyPasswordInput,
    response: Response,
    admin: dict = Depends(require_admin)
):
    """
    Permite al administrador cambiar su contraseña.
    Comprueba la contraseña actual e invalida las sesiones anteriores.
    """

    # 1. Evitar contraseñas nuevas vacías.
    if not data.new_password.strip():
        raise HTTPException(
            status_code=400,
            detail="La nueva contraseña no puede estar vacía."
        )

    # 2. Recuperar el hash de la contraseña actual.
    credentials = get_user_credentials(admin["id"])

    if credentials is None:
        raise HTTPException(
            status_code=404,
            detail="No se encontró la cuenta administradora."
        )

    # 3. Verificar la contraseña actual.
    if not verify_password(
        data.current_password,
        credentials["password_hash"]
    ):
        raise HTTPException(
            status_code=400,
            detail="La contraseña actual es incorrecta."
        )

    # 4. Evitar establecer exactamente la misma contraseña.
    if verify_password(
        data.new_password,
        credentials["password_hash"]
    ):
        raise HTTPException(
            status_code=400,
            detail="La nueva contraseña debe ser diferente a la actual."
        )

    # 5. Generar el hash seguro de la nueva contraseña.
    new_password_hash = hash_password(data.new_password)

    try:
        updated_user = update_admin_password(
            user_id=admin["id"],
            password_hash=new_password_hash
        )

        # 6. Eliminar la cookie de sesión del navegador actual.
        response.delete_cookie(
            key=SESSION_COOKIE_NAME,
            path="/",
            httponly=True,
            secure=False,
            samesite="lax"
        )

        return {
            "message": "Contraseña actualizada correctamente. Debes iniciar sesión nuevamente.",
            "user": updated_user
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        ) from error