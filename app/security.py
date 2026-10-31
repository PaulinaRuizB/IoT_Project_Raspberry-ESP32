
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError


# Configuración del algoritmo Argon2id
password_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=2
)


def hash_password(password: str) -> str:
    """
    Convierte una contraseña en un hash seguro.

    El resultado se almacena en SQLite,
    nunca la contraseña original.
    """

    return password_hasher.hash(password)


def verify_password(password: str, stored_hash: str) -> bool:
    """
    Comprueba si una contraseña coincide con un hash almacenado.
    """

    try:
        return password_hasher.verify(stored_hash, password)

    except (VerifyMismatchError, VerificationError):
        return False


def needs_rehash(stored_hash: str) -> bool:
    """
    Comprueba si un hash necesita actualizarse
    con los parámetros actuales de seguridad.
    """

    return password_hasher.check_needs_rehash(stored_hash)
