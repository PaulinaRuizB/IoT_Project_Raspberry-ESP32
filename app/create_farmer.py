
from getpass import getpass
from datetime import datetime, timezone

from app.database import get_connection
from app.security import hash_password


def create_farmer():
    print("\n=== Crear usuario agricultor ===\n")

    username = input("Nombre de usuario: ").strip()

    if not username:
        print("Error: el nombre de usuario no puede estar vacío.")
        return

    password = getpass("Contraseña: ")

    if len(password) < 12:
        print("Error: la contraseña debe tener al menos 12 caracteres.")
        return

    confirmation = getpass("Confirmar contraseña: ")

    if password != confirmation:
        print("Error: las contraseñas no coinciden.")
        return

    try:
        farm_id = int(input("ID de la finca (1, 2 o 3): "))
    except ValueError:
        print("Error: debes ingresar un número.")
        return

    with get_connection() as connection:

        # 1. Comprobar que la finca existe
        farm = connection.execute(
            "SELECT id, name FROM farms WHERE id = ?",
            (farm_id,)
        ).fetchone()

        if farm is None:
            print("Error: la finca seleccionada no existe.")
            return

        # 2. Comprobar que el usuario no esté registrado
        existing_user = connection.execute(
            "SELECT id FROM users WHERE username = ?",
            (username,)
        ).fetchone()

        if existing_user is not None:
            print("Error: ese nombre de usuario ya está registrado.")
            return

        # 3. Generar el hash seguro de la contraseña
        password_hash = hash_password(password)

        # 4. Registrar fecha y hora de creación
        created_at = datetime.now(timezone.utc).isoformat()

        # 5. Guardar el usuario en la base de datos
        connection.execute(
            """
            INSERT INTO users (
                username,
                password_hash,
                role,
                farm_id,
                is_active,
                created_at
            )
            VALUES (?, ?, 'farmer', ?, 1, ?)
            """,
            (username, password_hash, farm_id, created_at)
        )

    print("\n¡Usuario agricultor creado correctamente!")
    print(f"Usuario: {username}")
    print(f"Finca asignada: {farm['name']}")


if __name__ == "__main__":
    create_farmer()
