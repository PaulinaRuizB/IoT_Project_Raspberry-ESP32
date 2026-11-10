## Formato JSON para iniciar sesión: 
{
  "username": "iot_admin",
  "password": "IWA123456789"
}

### Contraseñas: 

user: Administrador
123456

Agricultor 1 - ESP32_TEST
123456

Agricultor 2 - ESP32_TEST_02
123456

Agricultor 3 - ESP32C6_01 (nodo con sensores)
123456

## Para cambiar de red con la raspberry: 

### ¿Cómo agregar otra red?
Por ejemplo, para guardar una red llamada MiNuevaRed:
    sudo nmcli device wifi connect "MiNuevaRed" password "MiContraseña"

Esto crea un perfil de conexión que queda guardado para futuros reinicios.

3. ¿Cómo cambiar las prioridades?
Podemos consultar las conexiones guardadas:
nmcli connection show

  nmcli connection show

Y establecer prioridades:

  sudo nmcli connection modify "MiNuevaRed" connection.autoconnect yes

  sudo nmcli connection modify "MiNuevaRed" connection.autoconnect-priority 20