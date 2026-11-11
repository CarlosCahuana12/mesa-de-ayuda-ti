"""
INICIAR EL SISTEMA EN PRODUCCIÓN
--------------------------------
Usa Waitress, un servidor estable que funciona en Windows y Linux.

    python servidor.py

Luego abre en el navegador:  http://NOMBRE-O-IP-DEL-SERVIDOR:8080
"""
import socket

from waitress import serve

import config
from app import app, iniciar_vigilante, registro

if __name__ == "__main__":
    iniciar_vigilante()
    try:
        ip = socket.gethostbyname(socket.gethostname())
    except OSError:
        ip = "IP-DEL-SERVIDOR"
    registro.info("=" * 60)
    registro.info("%s funcionando", config.NOMBRE_SISTEMA)
    registro.info("En este equipo:     http://localhost:%s", config.PUERTO)
    registro.info("Desde la red:       http://%s:%s", ip, config.PUERTO)
    registro.info("Correo:             %s", "activo" if config.CORREO_ACTIVO else "desactivado (configúralo en .env)")
    registro.info("Login con Microsoft: %s", "activo" if config.MICROSOFT_ACTIVO else "pendiente (configúralo en .env)")
    registro.info("Respaldo diario:    %s", f"{config.RESPALDO_HORA} h en {config.CARPETA_RESPALDOS}" if config.RESPALDO_HORA else "desactivado")
    registro.info("Para detenerlo presiona Ctrl + C")
    registro.info("=" * 60)
    serve(app, host="0.0.0.0", port=config.PUERTO, threads=8)
