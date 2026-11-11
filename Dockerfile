# =========================================================
# Mesa de Ayuda TI - Mesa de ayuda (imagen para Docker / NAS)
# Funciona en NAS Synology (Container Manager), QNAP (Container Station)
# y en cualquier servidor con Docker.
# =========================================================
FROM python:3.12-slim

ENV PYTHONUTF8=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=America/Lima

WORKDIR /app

# Primero las librerías (así Docker las reutiliza si solo cambia el código)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Revisa que todo funcione antes de terminar la imagen (usa una base temporal)
RUN python pruebas.py > /dev/null && rm -rf datos __pycache__

# Carpetas que se conectan con el disco del NAS (ver docker-compose.yml).
# Se usa el usuario del contenedor por defecto para evitar problemas de permisos
# con las carpetas compartidas del NAS; Docker igual aísla la aplicación del resto del equipo.
RUN mkdir -p /app/datos /app/respaldos

EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/publico', timeout=4)"

CMD ["python", "servidor.py"]
