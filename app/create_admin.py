
import sqlite3
from datetime import datetime, timezone
from getpass import getpass #recibir contraseñas sin mostrarlas

from database import DATABASE_PATH
from security import hash_password #proteger contraseña usando Argon


def create_admin():
    print("\n=== Crear administrador del IoT Server ===\n")

    username = input("Nombre de usuario: ").strip()

    if not username:
        print("Error: el nombre de usuario no puede estar vacío.")
        return

    password = getpass("Contraseña: ")
    confirm_password = getpass("Confirma la contraseña: ")

    if len(password) < 12:
        print("Error: utiliza una contraseña de al menos 12 caracteres.")
        return

    if password != confirm_password:
        print("Error: las contraseñas no coinciden.")
        return

    connection = sqlite3.connect(DATABASE_PATH)

    try:
        existing_user = connection.execute(
            "SELECT id FROM users WHERE username = ?",
            (username,)
        ).fetchone()

        if existing_user:
            print(f"Error: el usuario '{username}' ya existe.")
            return

        password_hash = hash_password(password)
        created_at = datetime.now(timezone.utc).isoformat()

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
            VALUES (?, ?, 'admin', NULL, 1, ?)
            """,
            (username, password_hash, created_at)
        )

        connection.commit()

        print(f"\n¡Administrador '{username}' creado correctamente!")

    except sqlite3.Error as error:
        connection.rollback()
        print(f"Error al crear el administrador: {error}")

    finally:
        connection.close()


if __name__ == "__main__":
    create_admin()
