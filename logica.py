"""
REGLAS DEL NEGOCIO
------------------
Aquí vive todo lo que el sistema "decide": quién puede hacer qué,
cómo cambian los estados, el SLA en horario laboral, las notificaciones
y las revisiones automáticas. Las páginas web solo muestran;
el servidor es el que valida y guarda.
"""
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import config
from basedatos import ahora_iso, leer_config, leer_fecha
from correo import enviar_correo

ZONA = ZoneInfo(config.ZONA_HORARIA)

ESTADOS = ["Nuevo", "Asignado", "En proceso", "En espera", "Resuelto", "Cerrado"]
PRIORIDADES = ["Alta", "Media", "Baja"]
MOTIVOS_ESPERA = ["Esperando respuesta del usuario", "Esperando repuesto o equipo", "Esperando al proveedor", "Otro"]
ROLES = {"usuario": "Usuario", "tecnico": "Analista de soporte", "admin": "Administrador"}
# Quiénes pueden atender tickets: los analistas y también los administradores
AGENTES = ("tecnico", "admin")

# Cambios de estado que puede hacer el analista en SUS tickets
TRANSICIONES_TECNICO = {
    "Asignado": {"En proceso"},
    "En proceso": {"En espera", "Resuelto"},
    "En espera": {"En proceso", "Resuelto"},
    "Resuelto": {"Cerrado", "En proceso"},
}
# Cambios que puede hacer el usuario en SUS tickets
TRANSICIONES_USUARIO = {
    "Resuelto": {"Cerrado", "En proceso"},   # confirmar o reabrir
}


class ErrorNegocio(Exception):
    """Error que se muestra al usuario (por ejemplo: 'No tienes permiso')."""
    def __init__(self, mensaje, codigo=400):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.codigo = codigo


# =========================================================
# HORARIO LABORAL Y SLA
# =========================================================
def _hora_a_minutos(texto):
    h, m = texto.split(":")
    return int(h) * 60 + int(m)


def _a_local(fecha):
    if isinstance(fecha, str):
        fecha = leer_fecha(fecha)
    return fecha.astimezone(ZONA)


def es_dia_laboral(dia, cfg):
    dia_js = (dia.weekday() + 1) % 7  # en JavaScript el domingo es 0
    feriados = {f["fecha"] for f in cfg["feriados"]}
    return dia_js in cfg["horario"]["dias"] and dia.isoformat() not in feriados


def minutos_laborales(desde, hasta, cfg):
    desde, hasta = _a_local(desde), _a_local(hasta)
    if hasta <= desde:
        return 0
    inicio = _hora_a_minutos(cfg["horario"]["inicio"])
    fin = _hora_a_minutos(cfg["horario"]["fin"])
    total = 0.0
    dia = desde.date()
    while dia <= hasta.date():
        if es_dia_laboral(dia, cfg):
            medianoche = datetime.combine(dia, time(0), tzinfo=ZONA)
            apertura = medianoche + timedelta(minutes=inicio)
            cierre = medianoche + timedelta(minutes=fin)
            a, b = max(apertura, desde), min(cierre, hasta)
            if b > a:
                total += (b - a).total_seconds() / 60
        dia += timedelta(days=1)
    return total


def minutos_en_espera(esperas, cfg):
    ahora = datetime.now(timezone.utc)
    return sum(minutos_laborales(e["inicio"], e["fin"] or ahora, cfg) for e in esperas)


def sla_vencido(t, esperas, cfg):
    """¿El ticket abierto ya pasó su tiempo? Devuelve 'respuesta', 'solucion' o None."""
    if not t["prioridad"] or t["estado"] in ("Resuelto", "Cerrado"):
        return None
    ahora = datetime.now(timezone.utc)
    if not t["atendido"]:
        usados = minutos_laborales(t["creado"], ahora, cfg)
        return "respuesta" if usados > cfg["sla"]["respuesta"][t["prioridad"]] else None
    usados = minutos_laborales(t["creado"], ahora, cfg) - minutos_en_espera(esperas, cfg)
    return "solucion" if usados > cfg["sla"]["solucion"][t["prioridad"]] else None


# =========================================================
# AYUDANTES
# =========================================================
def buscar_ticket(con, ticket_id):
    t = con.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
    if not t:
        raise ErrorNegocio("El ticket no existe", 404)
    return t


def nombre(con, usuario_id):
    fila = con.execute("SELECT nombre FROM usuarios WHERE id = ?", (usuario_id,)).fetchone()
    return fila["nombre"] if fila else "—"


def puede_ver(usuario, t):
    if usuario["rol"] == "admin":
        return True
    if usuario["rol"] == "tecnico":
        return t["tecnico_id"] == usuario["id"] or t["tecnico_id"] is None
    return t["usuario_id"] == usuario["id"]


def exigir_ver(usuario, t):
    if not puede_ver(usuario, t):
        raise ErrorNegocio("No tienes permiso para ver este ticket", 403)


def agregar_evento(con, ticket_id, texto):
    ahora = ahora_iso()
    con.execute("INSERT INTO mensajes (ticket_id, autor_id, texto, interno, fecha) VALUES (?, NULL, ?, 0, ?)",
                (ticket_id, texto, ahora))
    con.execute("UPDATE tickets SET actualizado = ? WHERE id = ?", (ahora, ticket_id))


def notificar(con, usuario_id, ticket_id, texto, correo=True):
    """Crea la notificación en el portal y (opcional) envía un correo."""
    con.execute("INSERT INTO notificaciones (usuario_id, ticket_id, texto, fecha) VALUES (?, ?, ?, ?)",
                (usuario_id, ticket_id, texto, ahora_iso()))
    if correo:
        destino = con.execute("SELECT correo FROM usuarios WHERE id = ? AND activo = 1", (usuario_id,)).fetchone()
        if destino:
            enviar_correo(destino["correo"], texto, texto, ticket_id)


def notificar_rol(con, rol, ticket_id, texto, correo=True, excepto=None):
    for u in con.execute("SELECT id FROM usuarios WHERE rol = ? AND activo = 1", (rol,)).fetchall():
        if u["id"] != excepto:
            notificar(con, u["id"], ticket_id, texto, correo)


def auditar(con, usuario, modulo, accion):
    con.execute("INSERT INTO auditoria (fecha, usuario_id, modulo, accion) VALUES (?, ?, ?, ?)",
                (ahora_iso(), usuario["id"] if usuario else None, modulo, accion))


def _pausar_cronometro(con, t):
    if not t["inicio_atencion"]:
        return
    trabajado = (datetime.now(timezone.utc) - leer_fecha(t["inicio_atencion"])).total_seconds() * 1000
    con.execute("UPDATE tickets SET tiempo_atencion_ms = tiempo_atencion_ms + ?, inicio_atencion = NULL WHERE id = ?",
                (int(trabajado), t["id"]))


def _cerrar_espera(con, ticket_id):
    con.execute("UPDATE esperas SET fin = ? WHERE ticket_id = ? AND fin IS NULL", (ahora_iso(), ticket_id))


def _texto_limpio(valor, maximo, campo, obligatorio=True):
    texto = (valor or "").strip()
    if obligatorio and not texto:
        raise ErrorNegocio(f"Falta: {campo}")
    if len(texto) > maximo:
        raise ErrorNegocio(f"{campo} es demasiado largo (máximo {maximo} caracteres)")
    return texto


# =========================================================
# ACCIONES SOBRE TICKETS
# =========================================================
def crear_ticket(con, usuario, datos, registrado_por=None, avisar_equipo=True):
    """Crea un ticket a nombre de "usuario" (el solicitante).
    registrado_por: alguien de TI que lo registra en nombre del usuario (ej.: le llamaron por teléfono)."""
    cfg = leer_config(con)
    categoria = _texto_limpio(datos.get("categoria"), 80, "Categoría")
    subcategoria = _texto_limpio(datos.get("subcategoria"), 80, "Tipo de problema")
    if categoria not in cfg["categorias"] or subcategoria not in cfg["categorias"][categoria]:
        raise ErrorNegocio("Categoría o tipo de problema no válido")
    asunto = _texto_limpio(datos.get("asunto"), 120, "Asunto")
    descripcion = _texto_limpio(datos.get("descripcion"), 5000, "Descripción")
    ubicacion = _texto_limpio(datos.get("ubicacion"), 120, "Ubicación", obligatorio=False)

    ahora = ahora_iso()
    cursor = con.execute(
        """INSERT INTO tickets (usuario_id, categoria, subcategoria, asunto, descripcion, ubicacion, creado, actualizado)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (usuario["id"], categoria, subcategoria, asunto, descripcion, ubicacion, ahora, ahora))
    ticket_id = cursor.lastrowid
    codigo = f"TKC-{ticket_id:04d}"
    con.execute("UPDATE tickets SET codigo = ? WHERE id = ?", (codigo, ticket_id))
    a_nombre_de_otro = registrado_por and registrado_por["id"] != usuario["id"]
    if a_nombre_de_otro:
        agregar_evento(con, ticket_id, f"Ticket creado por {registrado_por['nombre']} a nombre de {usuario['nombre']}")
    else:
        agregar_evento(con, ticket_id, "Ticket creado")
    con.execute("INSERT INTO mensajes (ticket_id, autor_id, texto, interno, fecha) VALUES (?, ?, ?, 0, ?)",
                (ticket_id, (registrado_por or usuario)["id"], descripcion, ahora))

    if a_nombre_de_otro:
        notificar(con, usuario["id"], ticket_id, f"{registrado_por['nombre']} registró el ticket {codigo} a tu nombre: {asunto}")
    else:
        notificar(con, usuario["id"], ticket_id, f"Recibimos tu ticket {codigo}: {asunto}")
    if avisar_equipo:
        quien = registrado_por["id"] if registrado_por else None
        notificar_rol(con, "admin", ticket_id, f"Nuevo ticket {codigo} de {usuario['nombre']}: {asunto}", excepto=quien)
        notificar_rol(con, "tecnico", ticket_id, f"Nuevo ticket disponible {codigo}: {asunto}", excepto=quien)
    return ticket_id


def tomar_ticket(con, tecnico, ticket_id, prioridad):
    if tecnico["rol"] not in AGENTES:
        raise ErrorNegocio("Solo el equipo de TI puede tomar tickets", 403)
    if prioridad not in PRIORIDADES:
        raise ErrorNegocio("Elige una prioridad válida")
    ahora = ahora_iso()
    # La condición "tecnico_id IS NULL" evita que dos analistas tomen el mismo ticket a la vez
    cambiados = con.execute(
        """UPDATE tickets SET tecnico_id = ?, prioridad = ?, estado = 'En proceso',
               atendido = COALESCE(atendido, ?), inicio_atencion = ?, actualizado = ?
           WHERE id = ? AND tecnico_id IS NULL AND estado NOT IN ('Resuelto', 'Cerrado')""",
        (tecnico["id"], prioridad, ahora, ahora, ahora, ticket_id)).rowcount
    if not cambiados:
        t = buscar_ticket(con, ticket_id)
        raise ErrorNegocio(f"{nombre(con, t['tecnico_id'])} ya tomó este ticket", 409)
    t = buscar_ticket(con, ticket_id)
    agregar_evento(con, ticket_id, f"{tecnico['nombre']} tomó el ticket con prioridad {prioridad} e inició la atención")
    notificar(con, t["usuario_id"], ticket_id, f"{tecnico['nombre']} está atendiendo tu ticket {t['codigo']}")
    notificar_rol(con, "admin", ticket_id, f"{tecnico['nombre']} tomó {t['codigo']} (prioridad {prioridad})", correo=False)


def asignar_ticket(con, admin, ticket_id, tecnico_id, prioridad):
    if admin["rol"] != "admin":
        raise ErrorNegocio("Solo el Jefe de TI puede asignar", 403)
    if prioridad not in PRIORIDADES:
        raise ErrorNegocio("Elige una prioridad válida")
    tecnico = con.execute("SELECT * FROM usuarios WHERE id = ? AND rol IN ('tecnico', 'admin') AND activo = 1", (tecnico_id,)).fetchone()
    if not tecnico:
        raise ErrorNegocio("Elige a alguien del equipo de TI")
    t = buscar_ticket(con, ticket_id)
    cambia_tecnico = t["tecnico_id"] != tecnico["id"]
    if cambia_tecnico:
        _pausar_cronometro(con, t)
    nuevo_estado = "Asignado" if t["estado"] == "Nuevo" else t["estado"]
    if cambia_tecnico and t["estado"] == "En proceso":
        nuevo_estado = "Asignado"  # el nuevo analista debe iniciar su atención
    con.execute("UPDATE tickets SET tecnico_id = ?, prioridad = ?, estado = ? WHERE id = ?",
                (tecnico["id"], prioridad, nuevo_estado, ticket_id))
    agregar_evento(con, ticket_id, f"{admin['nombre']} asignó el ticket a {tecnico['nombre']} con prioridad {prioridad}")
    if cambia_tecnico:
        if tecnico["id"] != admin["id"]:
            notificar(con, tecnico["id"], ticket_id, f"Se te asignó {t['codigo']}: {t['asunto']}")
        notificar(con, t["usuario_id"], ticket_id, f"Tu ticket {t['codigo']} fue asignado a {tecnico['nombre']}")


def transferir_ticket(con, tecnico, ticket_id, nuevo_id, motivo):
    t = buscar_ticket(con, ticket_id)
    if tecnico["rol"] not in AGENTES or t["tecnico_id"] != tecnico["id"]:
        raise ErrorNegocio("Solo puedes transferir tus propios tickets", 403)
    if t["estado"] not in ("Asignado", "En proceso", "En espera"):
        raise ErrorNegocio("Este ticket ya no se puede transferir")
    nuevo = con.execute("SELECT * FROM usuarios WHERE id = ? AND rol IN ('tecnico', 'admin') AND activo = 1", (nuevo_id,)).fetchone()
    if not nuevo or nuevo["id"] == tecnico["id"]:
        raise ErrorNegocio("Elige a un compañero válido")
    motivo = _texto_limpio(motivo, 500, "Motivo", obligatorio=False)

    _pausar_cronometro(con, t)
    if t["estado"] == "En espera":
        _cerrar_espera(con, ticket_id)
    con.execute("UPDATE tickets SET tecnico_id = ?, estado = 'Asignado' WHERE id = ?", (nuevo["id"], ticket_id))
    agregar_evento(con, ticket_id, f"{tecnico['nombre']} transfirió el ticket a {nuevo['nombre']}")
    if motivo:
        con.execute("INSERT INTO mensajes (ticket_id, autor_id, texto, interno, fecha) VALUES (?, ?, ?, 1, ?)",
                    (ticket_id, tecnico["id"], "🔁 Motivo de la transferencia: " + motivo, ahora_iso()))
    notificar(con, nuevo["id"], ticket_id, f"{tecnico['nombre']} te transfirió {t['codigo']}: {t['asunto']}")
    notificar_rol(con, "admin", ticket_id, f"{tecnico['nombre']} transfirió {t['codigo']} a {nuevo['nombre']}", correo=False)


def cambiar_estado(con, quien, ticket_id, nuevo, motivo=None, solucion=None):
    t = buscar_ticket(con, ticket_id)
    actual = t["estado"]
    if nuevo not in ESTADOS or nuevo == actual:
        raise ErrorNegocio("Estado no válido")

    # ¿Tiene permiso para este cambio?
    if quien["rol"] == "usuario":
        if t["usuario_id"] != quien["id"] or nuevo not in TRANSICIONES_USUARIO.get(actual, set()):
            raise ErrorNegocio("No puedes hacer este cambio", 403)
    elif quien["rol"] == "tecnico":
        if t["tecnico_id"] != quien["id"] or nuevo not in TRANSICIONES_TECNICO.get(actual, set()):
            raise ErrorNegocio("No puedes hacer este cambio", 403)
    if nuevo in ("Asignado", "En proceso", "En espera", "Resuelto") and not t["tecnico_id"]:
        raise ErrorNegocio("Primero asigna el ticket a un analista")
    if nuevo == "En espera":
        if motivo not in MOTIVOS_ESPERA:
            raise ErrorNegocio("Elige el motivo de la espera")

    ahora = ahora_iso()
    if actual == "En espera":
        _cerrar_espera(con, ticket_id)

    cambios = {"estado": nuevo}
    if nuevo == "En proceso":
        cambios.update(inicio_atencion=t["inicio_atencion"] or ahora, atendido=t["atendido"] or ahora,
                       resuelto=None, cerrado=None)
    else:
        _pausar_cronometro(con, t)
    if nuevo == "En espera":
        con.execute("INSERT INTO esperas (ticket_id, inicio, motivo) VALUES (?, ?, ?)", (ticket_id, ahora, motivo))
    if nuevo == "Resuelto":
        cambios["resuelto"] = ahora
    if nuevo == "Cerrado":
        cambios.update(resuelto=t["resuelto"] or ahora, cerrado=ahora)

    columnas = ", ".join(f"{k} = ?" for k in cambios)
    con.execute(f"UPDATE tickets SET {columnas} WHERE id = ?", (*cambios.values(), ticket_id))

    if nuevo == "Resuelto" and solucion and solucion.strip():
        con.execute("INSERT INTO mensajes (ticket_id, autor_id, texto, interno, fecha) VALUES (?, ?, ?, 0, ?)",
                    (ticket_id, quien["id"], "✅ Solución: " + _texto_limpio(solucion, 3000, "Solución"), ahora))

    texto = (f"{quien['nombre']} puso el ticket en espera: {motivo}" if nuevo == "En espera"
             else f"{quien['nombre']} cambió el estado a \"{nuevo}\"")
    agregar_evento(con, ticket_id, texto)

    if quien["id"] != t["usuario_id"]:
        aviso = (f"Tu ticket {t['codigo']} está en espera: {motivo}" if nuevo == "En espera"
                 else f"Tu ticket {t['codigo']} ahora está: {nuevo}")
        notificar(con, t["usuario_id"], ticket_id, aviso)
    elif t["tecnico_id"]:
        notificar(con, t["tecnico_id"], ticket_id, f"{quien['nombre']} marcó {t['codigo']} como: {nuevo}")


def agregar_mensaje(con, autor, ticket_id, texto, interno):
    t = buscar_ticket(con, ticket_id)
    exigir_ver(autor, t)
    if t["estado"] == "Cerrado":
        raise ErrorNegocio("El ticket está cerrado")
    if autor["rol"] == "tecnico" and t["tecnico_id"] != autor["id"]:
        raise ErrorNegocio("Toma el ticket antes de escribir en él", 403)
    texto = _texto_limpio(texto, 5000, "Mensaje")
    interno = bool(interno) and autor["rol"] != "usuario"
    con.execute("INSERT INTO mensajes (ticket_id, autor_id, texto, interno, fecha) VALUES (?, ?, ?, ?, ?)",
                (ticket_id, autor["id"], texto, int(interno), ahora_iso()))
    con.execute("UPDATE tickets SET actualizado = ? WHERE id = ?", (ahora_iso(), ticket_id))
    if interno:
        return

    if autor["rol"] == "usuario":
        if t["tecnico_id"]:
            notificar(con, t["tecnico_id"], ticket_id, f"{autor['nombre']} respondió en {t['codigo']}")
        else:
            notificar_rol(con, "admin", ticket_id, f"{autor['nombre']} agregó información en {t['codigo']}", correo=False)
        # Si TI esperaba la respuesta del usuario, el ticket se reanuda solo
        espera = con.execute("SELECT motivo FROM esperas WHERE ticket_id = ? AND fin IS NULL", (ticket_id,)).fetchone()
        if t["estado"] == "En espera" and espera and espera["motivo"] == "Esperando respuesta del usuario":
            _cerrar_espera(con, ticket_id)
            con.execute("UPDATE tickets SET estado = 'En proceso', inicio_atencion = ? WHERE id = ?", (ahora_iso(), ticket_id))
            agregar_evento(con, ticket_id, f"{autor['nombre']} respondió: el ticket vuelve a \"En proceso\"")
    else:
        notificar(con, t["usuario_id"], ticket_id, f"TI respondió tu ticket {t['codigo']}")


def calificar(con, usuario, ticket_id, puntos, comentario):
    t = buscar_ticket(con, ticket_id)
    if t["usuario_id"] != usuario["id"]:
        raise ErrorNegocio("Solo quien creó el ticket puede calificarlo", 403)
    if t["estado"] != "Cerrado":
        raise ErrorNegocio("Primero se debe cerrar el ticket")
    if t["calificacion"]:
        raise ErrorNegocio("Este ticket ya fue calificado")
    if not isinstance(puntos, int) or not 1 <= puntos <= 5:
        raise ErrorNegocio("La calificación debe ser de 1 a 5 estrellas")
    comentario = _texto_limpio(comentario, 500, "Comentario", obligatorio=False)
    con.execute("UPDATE tickets SET calificacion = ?, comentario_calificacion = ? WHERE id = ?", (puntos, comentario, ticket_id))
    agregar_evento(con, ticket_id, f"{usuario['nombre']} calificó la atención con {puntos} ★")
    if t["tecnico_id"]:
        notificar(con, t["tecnico_id"], ticket_id, f"{usuario['nombre']} calificó {t['codigo']} con {puntos} ★", correo=False)


# =========================================================
# REVISIONES AUTOMÁTICAS (cada minuto, en segundo plano)
# =========================================================
def revisiones_automaticas(con):
    cfg = leer_config(con)
    ahora = datetime.now(timezone.utc)

    # 1. Cierre automático si el usuario no confirma la solución
    limite = (ahora - timedelta(hours=cfg["autocierreHoras"])).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    for t in con.execute("SELECT * FROM tickets WHERE estado = 'Resuelto' AND resuelto < ?", (limite,)).fetchall():
        con.execute("UPDATE tickets SET estado = 'Cerrado', cerrado = ? WHERE id = ?", (ahora_iso(), t["id"]))
        agregar_evento(con, t["id"], f"Cerrado automáticamente: no hubo respuesta en {cfg['autocierreHoras']} h")
        notificar(con, t["usuario_id"], t["id"], f"Tu ticket {t['codigo']} se cerró automáticamente")

    # 2. Alertas de SLA vencido (una por etapa)
    abiertos = con.execute("SELECT * FROM tickets WHERE estado NOT IN ('Resuelto', 'Cerrado') AND prioridad IS NOT NULL").fetchall()
    for t in abiertos:
        esperas = con.execute("SELECT inicio, fin FROM esperas WHERE ticket_id = ?", (t["id"],)).fetchall()
        etapa = sla_vencido(t, esperas, cfg)
        if etapa and t["alerta_sla"] != etapa:
            con.execute("UPDATE tickets SET alerta_sla = ? WHERE id = ?", (etapa, t["id"]))
            texto = f"⚠️ SLA de {'solución' if etapa == 'solucion' else 'respuesta'} vencido en {t['codigo']}: {t['asunto']}"
            notificar_rol(con, "admin", t["id"], texto)
            if t["tecnico_id"]:
                notificar(con, t["tecnico_id"], t["id"], texto)
    con.commit()
