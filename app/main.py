from fastapi import FastAPI

app = FastAPI(title="IoT Server") #se crea una instancia 


@app.get("/") #Decorador = le dice a FastAPI la petición del cliente 
def root():
    return {
        "message": "IoT Server funcionando",
        "status": "online"
    }


@app.get("/api/status")
def status():
    return {
        "server": "IoT Server",
        "status": "online",
        "version": "1.0.0"
    }
