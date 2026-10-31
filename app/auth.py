
import secrets
import hashlib

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response

from app.database import (
    get_user_by_username,
    create_session,
    get_session_user,
    delete_session,
    delete_expired_sessions,
)

from app.security import verify_password


# Configuración de sesiones
SESSION_COOKIE_NAME = "iot_session"
SESSION_DURATION_HOURS = 12

# Router de autenticación
router = APIRouter(prefix="/api/auth", tags=["Autenticación"])


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
