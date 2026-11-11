"""
CONFIGURACIÓN DEL SISTEMA
-------------------------
Los valores se leen del archivo .env (copia .env.ejemplo como .env y edítalo).
Así las contraseñas y claves NO quedan escritas dentro del código.
"""
import os
import secrets
from pathlib import Path

CARPETA = Path(__file__).resolve().parent


def _cargar_env():
    """Lee el archivo .env (líneas CLAVE=valor) y lo pone en las variables de entorno."""
    archivo = CARPETA / ".env"
    if not archivo.exists():
        return
    for linea in archivo.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, valor = linea.split("=", 1)
        os.environ.setdefault(clave.strip(), valor.strip().strip('"').strip("'"))


_cargar_env()


def _texto(nombre, defecto=""):
    return os.environ.get(nombre, defecto).strip()


def _si_no(nombre, defecto=False):
    valor = _texto(nombre, "si" if defecto else "no").lower()
    return valor in ("si", "sí", "true", "1", "yes")


# ---------- General ----------
NOMBRE_SISTEMA = _texto("NOMBRE_SISTEMA", "Mesa de Ayuda TI")
URL_SISTEMA = _texto("URL_SISTEMA", "http://localhost:8080").rstrip("/")
PUERTO = int(_texto("PUERTO", "8080"))
ZONA_HORARIA = _texto("ZONA_HORARIA", "America/Lima")
USA_HTTPS = URL_SISTEMA.startswith("https://")

# Clave secreta para firmar las sesiones. Si no existe, se crea una y se guarda.
_archivo_secreto = CARPETA / "datos" / ".clave_secreta"
CLAVE_SECRETA = _texto("CLAVE_SECRETA")
if not CLAVE_SECRETA:
    _archivo_secreto.parent.mkdir(parents=True, exist_ok=True)
    if not _archivo_secreto.exists():
        _archivo_secreto.write_text(secrets.token_hex(32), encoding="utf-8")
    CLAVE_SECRETA = _archivo_secreto.read_text(encoding="utf-8").strip()

# ---------- Archivos ----------
RUTA_BD = Path(_texto("RUTA_BD", str(CARPETA / "datos" / "mesa_ayuda.db")))
CARPETA_ADJUNTOS = Path(_texto("CARPETA_ADJUNTOS", str(CARPETA / "datos" / "adjuntos")))
CARPETA_RESPALDOS = Path(_texto("CARPETA_RESPALDOS", str(CARPETA / "respaldos")))
TAMANO_MAXIMO_ADJUNTO_MB = int(_texto("TAMANO_MAXIMO_ADJUNTO_MB", "10"))
# Respaldo automático diario a esta hora (formato 24 h). Vacío = desactivado.
RESPALDO_HORA = _texto("RESPALDO_HORA", "19:00")
EXTENSIONES_PERMITIDAS = {"png", "jpg", "jpeg", "gif", "webp", "pdf", "txt", "log", "docx", "xlsx", "zip"}

# ---------- Inicio de sesión ----------
# Contraseña local: correo + contraseña guardada (cifrada) en el sistema.
PERMITIR_CLAVE_LOCAL = _si_no("PERMITIR_CLAVE_LOCAL", True)
# Código opcional para la primera configuración (pantalla "Crear cuenta de administrador").
# Si lo dejas vacío, el primero que abra el sistema recién instalado será el administrador.
CODIGO_INSTALACION = os.environ.get("CODIGO_INSTALACION", "").strip()

# Microsoft 365 (Entra ID): se activa solo si estos tres valores existen.
MS_ID_INQUILINO = _texto("MS_ID_INQUILINO")      # Directory (tenant) ID
MS_ID_CLIENTE = _texto("MS_ID_CLIENTE")          # Application (client) ID
MS_SECRETO_CLIENTE = _texto("MS_SECRETO_CLIENTE")  # Client secret
MICROSOFT_ACTIVO = bool(MS_ID_INQUILINO and MS_ID_CLIENTE and MS_SECRETO_CLIENTE)
# Si alguien entra con Microsoft y no está registrado, ¿se crea solo como "usuario"?
CREAR_USUARIOS_MICROSOFT = _si_no("CREAR_USUARIOS_MICROSOFT", True)
# Solo se aceptan correos de estos dominios (separados por coma). Vacío = cualquiera del inquilino.
DOMINIOS_PERMITIDOS = [d.strip().lower() for d in _texto("DOMINIOS_PERMITIDOS").split(",") if d.strip()]

# ---------- Correo saliente (SMTP) ----------
SMTP_SERVIDOR = _texto("SMTP_SERVIDOR")           # ej: smtp.office365.com
SMTP_PUERTO = int(_texto("SMTP_PUERTO", "587"))
SMTP_USUARIO = _texto("SMTP_USUARIO")
SMTP_CLAVE = _texto("SMTP_CLAVE")
SMTP_REMITENTE = _texto("SMTP_REMITENTE", SMTP_USUARIO)
CORREO_ACTIVO = bool(SMTP_SERVIDOR and SMTP_REMITENTE)
