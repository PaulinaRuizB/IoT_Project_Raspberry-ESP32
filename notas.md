## Formato JSON para iniciar sesión: 
{
  "username": "iot_admin",
  "password": "IWA123456789"
}

{
  "decision": "rejected",
  "reason": "El suelo fue regado recientemente."
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

### Nombre y contraseña de red raspberry como AP
Nombre: IoT_Finca
Contraseña: 12345678

### Comprobar el funcionamiento del backend:

curl http://127.0.0.1:8000/api/status

### Para entrar a sqlite: 
sqlite3 iot_data.db

### consultar tablas: .table

consulta farms: 

SELECT
    farms.id,
    farms.name,
    nodes.node_id
FROM farms
JOIN nodes
    ON nodes.farm_id = farms.id
ORDER BY farms.id;

### Para compilar:
python -m py_compile app/main.py app/recommendations.py

### Para reiniciar el servicio: 
sudo systemctl restart iot-server.service
sudo systemctl status iot-server.service --no-pager


## NOTA PARA MI: 

Seguir con: 

1. Definir el cambio de red de la raspberry de forma que pueda conectarse a la red disponible o que si no encuentra haga su propio AP (y que no se dañe nada de lo que tengo :c) - CREO QUE LISTO.

2. Gestionar los nodos de las fincas - (cambiar nombres y permitir agregar nuevas fincas y nodos). 

3. Añadir las tarjetas de recomendaciones - LISTO.

4. Añadir más sensores y nodos y adjuntarlos a las fincas y a las recomendaciones. - LISTO. 

5. Configurar el wifi en la esp32. 

6. Añadir acciones del agricultor. 
