"""
BASE DE DATOS (SQLite)
----------------------
SQLite guarda todo en un solo archivo: datos/mesa_ayuda.db
Para 40-200 usuarios es más que suficiente. Si algún día crecen mucho,
se puede pasar a SQL Server o PostgreSQL con las mismas tablas.
"""
import json
import sqlite3
from datetime import datetime, timezone

from flask import g

import config

ESQUEMA = """
CREATE TABLE IF NOT EXISTS usuarios (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre              TEXT NOT NULL,
    correo              TEXT NOT NULL UNIQUE COLLATE NOCASE,
    area                TEXT NOT NULL DEFAULT '',
    rol                 TEXT NOT NULL DEFAULT 'usuario' CHECK (rol IN ('usuario', 'tecnico', 'admin')),
    activo              INTEGER NOT NULL DEFAULT 1,
    eliminado           INTEGER NOT NULL DEFAULT 0,   -- retirado del sistema (se conserva su historial)
    tema                TEXT,                          -- preferencia: 'claro' u 'oscuro'
    clave_hash          TEXT,
    debe_cambiar_clave  INTEGER NOT NULL DEFAULT 0,
    creado              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo                  TEXT UNIQUE,
    usuario_id              INTEGER NOT NULL REFERENCES usuarios(id),
    categoria               TEXT NOT NULL,
    subcategoria            TEXT NOT NULL,
    asunto                  TEXT NOT NULL,
    descripcion             TEXT NOT NULL,
    ubicacion               TEXT NOT NULL DEFAULT '',
    estado                  TEXT NOT NULL DEFAULT 'Nuevo',
    prioridad               TEXT CHECK (prioridad IN ('Alta', 'Media', 'Baja')),
    tecnico_id              INTEGER REFERENCES usuarios(id),
    creado                  TEXT NOT NULL,
    actualizado             TEXT NOT NULL,
    atendido                TEXT,
    resuelto                TEXT,
    cerrado                 TEXT,
    inicio_atencion         TEXT,
    tiempo_atencion_ms      INTEGER NOT NULL DEFAULT 0,
    calificacion            INTEGER CHECK (calificacion BETWEEN 1 AND 5),
    comentario_calificacion TEXT NOT NULL DEFAULT '',
    alerta_sla              TEXT
);

-- Mensajes del chat. autor_id NULL = evento del sistema ("Ticket creado", "cambió el estado"...)
CREATE TABLE IF NOT EXISTS mensajes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id  INTEGER NOT NULL REFERENCES tickets(id),
    autor_id   INTEGER REFERENCES usuarios(id),
    texto      TEXT NOT NULL,
    interno    INTEGER NOT NULL DEFAULT 0,
    fecha      TEXT NOT NULL
);

-- Pausas "En espera" (para descontarlas del SLA de solución)
CREATE TABLE IF NOT EXISTS esperas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id  INTEGER NOT NULL REFERENCES tickets(id),
    inicio     TEXT NOT NULL,
    fin        TEXT,
    motivo     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS adjuntos (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id        INTEGER NOT NULL REFERENCES tickets(id),
    nombre_original  TEXT NOT NULL,
    nombre_guardado  TEXT NOT NULL,
    tamano           INTEGER NOT NULL,
    subido_por       INTEGER NOT NULL REFERENCES usuarios(id),
    fecha            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notificaciones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
    ticket_id   INTEGER REFERENCES tickets(id),
    texto       TEXT NOT NULL,
    fecha       TEXT NOT NULL,
    leida       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS articulos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria     TEXT NOT NULL,
    subcategoria  TEXT NOT NULL DEFAULT '',
    titulo        TEXT NOT NULL,
    contenido     TEXT NOT NULL,
    autor_id      INTEGER REFERENCES usuarios(id),
    fecha         TEXT NOT NULL,
    vistas        INTEGER NOT NULL DEFAULT 0,
    utiles        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS auditoria (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha       TEXT NOT NULL,
    usuario_id  INTEGER REFERENCES usuarios(id),
    modulo      TEXT NOT NULL,
    accion      TEXT NOT NULL
);

-- Configuración editable (horario, SLA, feriados, categorías, áreas) en formato JSON
CREATE TABLE IF NOT EXISTS configuracion (
    clave  TEXT PRIMARY KEY,
    valor  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_usuario ON tickets(usuario_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tecnico ON tickets(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_tickets_estado  ON tickets(estado);
CREATE INDEX IF NOT EXISTS idx_mensajes_ticket ON mensajes(ticket_id);
CREATE INDEX IF NOT EXISTS idx_esperas_ticket  ON esperas(ticket_id);
CREATE INDEX IF NOT EXISTS idx_notif_usuario   ON notificaciones(usuario_id, leida);
"""

# ---------- Valores iniciales ----------
CONFIG_INICIAL = {
    "horario": {"dias": [1, 2, 3, 4, 5], "inicio": "08:00", "fin": "17:30"},
    # Minutos LABORALES
    "sla": {
        "respuesta": {"Alta": 30, "Media": 240, "Baja": 480},
        "solucion": {"Alta": 240, "Media": 960, "Baja": 2400},
    },
    "autocierreHoras": 48,
    # Feriados nacionales de Perú 2026 (revísalos cada año en Configuración)
    "feriados": [
        {"fecha": "2026-01-01", "nombre": "Año Nuevo"},
        {"fecha": "2026-04-02", "nombre": "Jueves Santo"},
        {"fecha": "2026-04-03", "nombre": "Viernes Santo"},
        {"fecha": "2026-05-01", "nombre": "Día del Trabajo"},
        {"fecha": "2026-06-07", "nombre": "Batalla de Arica y Día de la Bandera"},
        {"fecha": "2026-06-29", "nombre": "San Pedro y San Pablo"},
        {"fecha": "2026-07-23", "nombre": "Día de la Fuerza Aérea del Perú"},
        {"fecha": "2026-07-28", "nombre": "Fiestas Patrias"},
        {"fecha": "2026-07-29", "nombre": "Fiestas Patrias"},
        {"fecha": "2026-08-06", "nombre": "Batalla de Junín"},
        {"fecha": "2026-08-30", "nombre": "Santa Rosa de Lima"},
        {"fecha": "2026-10-08", "nombre": "Combate de Angamos"},
        {"fecha": "2026-11-01", "nombre": "Día de Todos los Santos"},
        {"fecha": "2026-12-08", "nombre": "Inmaculada Concepción"},
        {"fecha": "2026-12-09", "nombre": "Batalla de Ayacucho"},
        {"fecha": "2026-12-25", "nombre": "Navidad"},
    ],
    "categorias": {
        "Hardware": ["Computador / Laptop", "Impresora / Escáner", "Monitor, teclado o mouse", "Teléfono / Celular", "Otro"],
        "Software y Aplicaciones": ["Sistema de la empresa", "Microsoft Office / Outlook", "Teams", "Instalación de programa", "Otro"],
        "Red y Conectividad": ["Sin internet", "Internet lento", "Wi-Fi", "VPN / Acceso remoto", "Otro"],
        "Accesos y Seguridad": ["Restablecer contraseña", "Crear o dar de baja usuario", "Permisos de carpetas", "Correo sospechoso / Virus", "Otro"],
    },
    "areas": ["Administración", "Almacén", "Contabilidad", "Gerencia", "Logística", "Recursos Humanos", "Ventas", "TI"],
}

ARTICULOS_INICIALES = [
    ("Accesos y Seguridad", "Restablecer contraseña", "Cómo cambiar o recuperar mi contraseña de Microsoft 365",
     "1. Entra a office.com y haz clic en \"Iniciar sesión\".\n2. Escribe tu correo del trabajo y elige \"¿Olvidó su contraseña?\".\n3. Sigue los pasos: te enviarán un código a tu celular o correo alternativo.\n4. Crea una contraseña nueva de al menos 12 caracteres, con mayúsculas, números y símbolos.\n\nSi tu cuenta está bloqueada o no tienes celular registrado, crea un ticket en la categoría \"Accesos y Seguridad\"."),
    ("Red y Conectividad", "Sin internet", "No tengo internet: qué revisar antes de reportar",
     "1. Revisa si tus compañeros de al lado tienen internet. Si nadie tiene, repórtalo como urgente.\n2. Si usas cable, verifica que esté bien conectado y que la luz del puerto parpadee.\n3. Si usas Wi-Fi, desactívalo y vuelve a activarlo.\n4. Reinicia el equipo.\n\nSi sigue sin funcionar, crea un ticket indicando tu ubicación."),
    ("Hardware", "Impresora / Escáner", "La impresora no imprime",
     "1. Verifica que la impresora esté encendida y sin luces de error.\n2. Revisa que tenga papel y que no haya hojas atascadas.\n3. Apágala, espera 10 segundos y enciéndela.\n4. En tu computador, revisa que hayas elegido la impresora correcta.\n\nSi aparece un mensaje de tóner o la luz naranja sigue parpadeando, crea un ticket."),
    ("Red y Conectividad", "VPN / Acceso remoto", "Cómo conectarme a la VPN desde casa",
     "1. Conéctate primero a tu internet de casa.\n2. Abre el programa de VPN de la empresa (icono en la barra de tareas).\n3. Inicia sesión con tu correo y contraseña del trabajo.\n4. Espera a que diga \"Conectado\" antes de abrir los sistemas.\n\nSi no tienes el programa instalado, solicítalo con un ticket."),
    ("Accesos y Seguridad", "Correo sospechoso / Virus", "Recibí un correo sospechoso, ¿qué hago?",
     "1. No abras adjuntos ni hagas clic en enlaces.\n2. Desconfía de correos que piden contraseñas, pagos urgentes o datos bancarios.\n3. Revisa la dirección del remitente: a veces imita a una empresa conocida.\n4. Repórtalo con un ticket en \"Correo sospechoso / Virus\" y luego elimínalo.\n\nSi ya hiciste clic o escribiste tu contraseña, crea el ticket de inmediato."),
    ("Software y Aplicaciones", "Teams", "Teams: no me escuchan o no escucho en las reuniones",
     "1. En la reunión, haz clic en \"Más\" (…) → \"Configuración del dispositivo\".\n2. Elige el micrófono y el altavoz correctos (por ejemplo, tus audífonos).\n3. Revisa que el micrófono no esté silenciado en Teams ni en los audífonos.\n4. Cierra Teams por completo y vuelve a abrirlo.\n\nSi el problema continúa, crea un ticket en \"Teams\"."),
]


# ---------- Fechas ----------
def ahora_iso():
    """Fecha y hora actual en UTC, mismo formato que JavaScript: 2026-10-18T23:30:00.000Z"""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def leer_fecha(texto):
    return datetime.fromisoformat(texto.replace("Z", "+00:00"))


# ---------- Conexión ----------
def conectar():
    config.RUTA_BD.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(config.RUTA_BD, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")   # permite leer mientras otro escribe
    con.execute("PRAGMA busy_timeout = 15000")
    return con


def bd():
    """Conexión de la petición actual (se cierra sola al terminar)."""
    if "bd" not in g:
        g.bd = conectar()
    return g.bd


def cerrar_bd(_error=None):
    con = g.pop("bd", None)
    if con is not None:
        con.close()


def inicializar():
    """Crea las tablas y los valores iniciales si no existen. Se puede ejecutar varias veces."""
    con = conectar()
    con.executescript(ESQUEMA)
    # Actualización de bases creadas con versiones anteriores
    columnas = {fila[1] for fila in con.execute("PRAGMA table_info(usuarios)")}
    if "eliminado" not in columnas:
        con.execute("ALTER TABLE usuarios ADD COLUMN eliminado INTEGER NOT NULL DEFAULT 0")
    if "tema" not in columnas:
        con.execute("ALTER TABLE usuarios ADD COLUMN tema TEXT")
    for clave, valor in CONFIG_INICIAL.items():
        con.execute("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)",
                    (clave, json.dumps(valor, ensure_ascii=False)))
    if con.execute("SELECT COUNT(*) FROM articulos").fetchone()[0] == 0:
        for categoria, sub, titulo, contenido in ARTICULOS_INICIALES:
            con.execute("INSERT INTO articulos (categoria, subcategoria, titulo, contenido, fecha) VALUES (?, ?, ?, ?, ?)",
                        (categoria, sub, titulo, contenido, ahora_iso()))
    con.commit()
    con.close()


# ---------- Configuración ----------
def leer_config(con):
    filas = con.execute("SELECT clave, valor FROM configuracion").fetchall()
    return {f["clave"]: json.loads(f["valor"]) for f in filas}


def guardar_config(con, clave, valor):
    con.execute("INSERT INTO configuracion (clave, valor) VALUES (?, ?) "
                "ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
                (clave, json.dumps(valor, ensure_ascii=False)))
