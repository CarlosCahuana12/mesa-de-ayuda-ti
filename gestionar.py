"""
HERRAMIENTA DE ADMINISTRACIÓN (línea de comandos)
-------------------------------------------------
    python gestionar.py cuentas-iniciales           Crea las cuentas de cuentas-iniciales.csv (equipo de TI)
    python gestionar.py crear-admin                 Crea otra cuenta de administrador (te pide los datos)
    python gestionar.py importar-usuarios usuarios.csv
                                                    Carga a todos los usuarios de una vez
    python gestionar.py respaldo                    Copia de seguridad de la base de datos
    python gestionar.py restablecer-clave correo@empresa.com
                                                    Nueva contraseña temporal para alguien

Formato de usuarios.csv (se puede crear en Excel → Guardar como → CSV UTF-8):
    nombre;correo;area;rol
    Ana Torres;ana.torres@empresa.com;Contabilidad;usuario
    Carlos Quispe;carlos.quispe@empresa.com;TI;tecnico
(rol puede ser: usuario, tecnico o admin)
"""
import csv
import getpass
import secrets
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

from werkzeug.security import generate_password_hash

import config
from basedatos import ahora_iso, conectar, guardar_config, inicializar, leer_config

ROLES = ("usuario", "tecnico", "admin")


def clave_temporal():
    letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(letras) for _ in range(12))


def crear_admin():
    print("=== Crear cuenta del Jefe de TI ===")
    nombre = input("Nombre completo: ").strip()
    correo = input("Correo del trabajo: ").strip().lower()
    while True:
        clave = getpass.getpass("Contraseña (mínimo 10 caracteres, letras y números): ")
        if len(clave) >= 10 and not clave.isalpha() and not clave.isdigit():
            if getpass.getpass("Repite la contraseña: ") == clave:
                break
            print("No coinciden. Intenta de nuevo.")
        else:
            print("Muy débil. Intenta de nuevo.")
    con = conectar()
    try:
        con.execute("""INSERT INTO usuarios (nombre, correo, area, rol, clave_hash, creado)
                       VALUES (?, ?, 'TI', 'admin', ?, ?)""", (nombre, correo, generate_password_hash(clave), ahora_iso()))
        con.commit()
        print(f"✅ Listo. {nombre} ya puede entrar como Jefe de TI.")
    except sqlite3.IntegrityError:
        print("⚠️ Ya existe un usuario con ese correo.")
    con.close()


def importar_usuarios(ruta_csv):
    ruta = Path(ruta_csv)
    texto = ruta.read_text(encoding="utf-8-sig")
    separador = ";" if texto.count(";") >= texto.count(",") else ","
    filas = list(csv.DictReader(texto.splitlines(), delimiter=separador))

    con = conectar()
    cfg = leer_config(con)
    areas = set(cfg["areas"])
    salida = []
    creados = omitidos = 0
    for numero, fila in enumerate(filas, start=2):
        fila = {(k or "").strip().lower(): (v or "").strip() for k, v in fila.items()}
        nombre, correo = fila.get("nombre", ""), fila.get("correo", "").lower()
        area, rol = fila.get("area", ""), (fila.get("rol") or "usuario").lower()
        if not nombre or "@" not in correo or rol not in ROLES:
            print(f"  Fila {numero}: datos incompletos o rol no válido → omitida")
            omitidos += 1
            continue
        if con.execute("SELECT 1 FROM usuarios WHERE correo = ?", (correo,)).fetchone():
            print(f"  Fila {numero}: {correo} ya existe → omitida")
            omitidos += 1
            continue
        clave = clave_temporal()
        con.execute("""INSERT INTO usuarios (nombre, correo, area, rol, clave_hash, debe_cambiar_clave, creado)
                       VALUES (?, ?, ?, ?, ?, 1, ?)""", (nombre, correo, area, rol, generate_password_hash(clave), ahora_iso()))
        if area:
            areas.add(area)
        salida.append({"nombre": nombre, "correo": correo, "clave_temporal": clave})
        creados += 1
    guardar_config(con, "areas", sorted(areas))
    con.commit()
    con.close()

    if salida and len(salida) <= 5:
        print("\n  Contraseñas temporales:")
        for fila in salida:
            print(f"   - {fila['nombre']:<22} {fila['correo']:<32} {fila['clave_temporal']}")
    if salida:
        archivo = ruta.with_name(f"claves-temporales-{datetime.now():%Y%m%d-%H%M}.csv")
        with archivo.open("w", encoding="utf-8-sig", newline="") as f:
            escritor = csv.DictWriter(f, fieldnames=["nombre", "correo", "clave_temporal"], delimiter=";")
            escritor.writeheader()
            escritor.writerows(salida)
        print(f"\n✅ {creados} usuarios creados, {omitidos} omitidos.")
        print(f"📄 Contraseñas temporales en: {archivo}")
        print("   Entrégalas de forma privada y BORRA ese archivo cuando termines.")
        print("   Cada persona deberá cambiarla al entrar por primera vez.")
    else:
        print(f"\nNo se creó ningún usuario ({omitidos} omitidos).")


def respaldo():
    """Copia segura aunque el sistema esté funcionando. Conserva los últimos 30 respaldos."""
    config.CARPETA_RESPALDOS.mkdir(parents=True, exist_ok=True)
    destino = config.CARPETA_RESPALDOS / f"mesa_ayuda-{datetime.now():%Y%m%d-%H%M%S}.db"
    origen = conectar()
    copia = sqlite3.connect(destino)
    origen.backup(copia)
    copia.close()
    origen.close()
    if config.CARPETA_ADJUNTOS.exists():
        shutil.make_archive(str(destino.with_suffix("")) + "-adjuntos", "zip", config.CARPETA_ADJUNTOS)
    antiguos = sorted(config.CARPETA_RESPALDOS.glob("mesa_ayuda-*.db"))[:-30]
    for archivo in antiguos:
        archivo.unlink()
        zip_adj = Path(str(archivo.with_suffix("")) + "-adjuntos.zip")
        if zip_adj.exists():
            zip_adj.unlink()
    print(f"✅ Respaldo creado: {destino}")


def restablecer_clave(correo):
    con = conectar()
    clave = clave_temporal()
    cambiados = con.execute("UPDATE usuarios SET clave_hash = ?, debe_cambiar_clave = 1 WHERE correo = ?",
                            (generate_password_hash(clave), correo.lower())).rowcount
    con.commit()
    con.close()
    print(f"✅ Contraseña temporal de {correo}: {clave}" if cambiados else "⚠️ No existe ese correo")


if __name__ == "__main__":
    inicializar()
    comando = sys.argv[1] if len(sys.argv) > 1 else ""
    if comando == "crear-admin":
        crear_admin()
    elif comando == "cuentas-iniciales":
        importar_usuarios(Path(__file__).resolve().parent / "cuentas-iniciales.csv")
    elif comando == "importar-usuarios" and len(sys.argv) > 2:
        importar_usuarios(sys.argv[2])
    elif comando == "respaldo":
        respaldo()
    elif comando == "restablecer-clave" and len(sys.argv) > 2:
        restablecer_clave(sys.argv[2])
    else:
        print(__doc__)
