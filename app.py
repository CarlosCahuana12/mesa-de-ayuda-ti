"""
SERVIDOR DE LA MESA DE AYUDA TI (Flask)
---------------------------------------
- Entrega las páginas web (carpeta web/)
- Ofrece la API (/api/...) que usan esas páginas para leer y guardar datos
- Controla quién puede ver y hacer qué

Para ejecutarlo en producción usa:  python servidor.py
"""
import json
import logging
import secrets
import threading
import time
import uuid
from functools import wraps
from pathlib import Path

from flask import Flask, abort, jsonify, redirect, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

import config
import logica
from basedatos import ahora_iso, bd, cerrar_bd, conectar, guardar_config, inicializar, leer_config
from logica import ErrorNegocio, auditar, buscar_ticket, exigir_ver

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
registro = logging.getLogger("mesa-ayuda")

CARPETA_WEB = Path(__file__).resolve().parent / "web"

app = Flask(__name__, static_folder=None)
app.config.update(
    SECRET_KEY=config.CLAVE_SECRETA,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=config.USA_HTTPS,
    PERMANENT_SESSION_LIFETIME=60 * 60 * 10,   # la sesión dura 10 horas (una jornada)
    MAX_CONTENT_LENGTH=(config.TAMANO_MAXIMO_ADJUNTO_MB + 1) * 1024 * 1024,
)
app.teardown_appcontext(cerrar_bd)


# =========================================================
# RESPUESTAS DE ERROR
# =========================================================
@app.errorhandler(ErrorNegocio)
def error_negocio(error):
    return jsonify(error=error.mensaje), error.codigo


@app.errorhandler(413)
def archivo_grande(_error):
    return jsonify(error=f"El archivo supera los {config.TAMANO_MAXIMO_ADJUNTO_MB} MB"), 413


# =========================================================
# SEGURIDAD
# =========================================================
@app.before_request
def proteger_api():
    """Las peticiones que cambian datos deben venir de nuestras propias páginas (protección CSRF)."""
    if request.path.startswith("/api/") and request.method not in ("GET", "HEAD"):
        if request.headers.get("X-Mesa-Ayuda") != "1":
            abort(403)


@app.after_request
def cabeceras_seguridad(respuesta):
    respuesta.headers["X-Content-Type-Options"] = "nosniff"
    respuesta.headers["X-Frame-Options"] = "DENY"
    respuesta.headers["Referrer-Policy"] = "same-origin"
    if request.path.startswith("/api/"):
        respuesta.headers["Cache-Control"] = "no-store"
    return respuesta


def usuario_sesion():
    usuario_id = session.get("usuario_id")
    if not usuario_id:
        return None
    u = bd().execute("SELECT * FROM usuarios WHERE id = ? AND activo = 1", (usuario_id,)).fetchone()
    return dict(u) if u else None


def requiere(*roles):
    """Decorador: exige sesión iniciada y (opcional) uno de los roles indicados."""
    def decorador(funcion):
        @wraps(funcion)
        def envoltura(*args, **kwargs):
            usuario = usuario_sesion()
            if not usuario:
                return jsonify(error="Tu sesión expiró. Vuelve a iniciar sesión."), 401
            if roles and usuario["rol"] not in roles:
                return jsonify(error="No tienes permiso para esto"), 403
            return funcion(usuario, *args, **kwargs)
        return envoltura
    return decorador


def datos_json():
    return request.get_json(silent=True) or {}


def guardar_y_responder(respuesta):
    bd().commit()
    return respuesta


# =========================================================
# CONVERTIR FILAS DE LA BASE AL FORMATO QUE USAN LAS PÁGINAS
# =========================================================
def ticket_a_json(con, t, usuario, con_mensajes=False):
    esperas = con.execute("SELECT inicio, fin, motivo FROM esperas WHERE ticket_id = ? ORDER BY id", (t["id"],)).fetchall()
    adjunto = con.execute("SELECT id, nombre_original, tamano FROM adjuntos WHERE ticket_id = ? ORDER BY id LIMIT 1", (t["id"],)).fetchone()
    datos = {
        "id": t["id"], "codigo": t["codigo"], "usuarioId": t["usuario_id"],
        "categoria": t["categoria"], "subcategoria": t["subcategoria"],
        "asunto": t["asunto"], "descripcion": t["descripcion"], "ubicacion": t["ubicacion"],
        "estado": t["estado"], "prioridad": t["prioridad"], "tecnicoId": t["tecnico_id"],
        "creado": t["creado"], "actualizado": t["actualizado"],
        "atendido": t["atendido"], "resuelto": t["resuelto"], "cerrado": t["cerrado"],
        "inicioAtencion": t["inicio_atencion"], "tiempoAtencionMs": t["tiempo_atencion_ms"],
        "calificacion": t["calificacion"], "comentarioCalificacion": t["comentario_calificacion"],
        "alertaSLA": t["alerta_sla"],
        "esperas": [dict(e) for e in esperas],
        "adjunto": {"id": adjunto["id"], "nombre": adjunto["nombre_original"], "tamano": adjunto["tamano"]} if adjunto else None,
    }
    if usuario["rol"] == "usuario":
        datos.pop("alertaSLA")
    if con_mensajes:
        filas = con.execute("SELECT * FROM mensajes WHERE ticket_id = ? ORDER BY id", (t["id"],)).fetchall()
        mensajes = []
        for m in filas:
            if m["interno"] and usuario["rol"] == "usuario":
                continue   # el usuario nunca recibe las notas internas
            if m["autor_id"] is None:
                mensajes.append({"sistema": True, "texto": m["texto"], "fecha": m["fecha"]})
            else:
                mensajes.append({"autorId": m["autor_id"], "texto": m["texto"], "fecha": m["fecha"], "interno": bool(m["interno"])})
        datos["mensajes"] = mensajes
    return datos


def usuario_a_json(u, para):
    datos = {"id": u["id"], "nombre": u["nombre"], "area": u["area"], "rol": u["rol"],
             "activo": bool(u["activo"]), "eliminado": bool(u["eliminado"])}
    if para["rol"] != "usuario" or para["id"] == u["id"]:
        datos["correo"] = u["correo"]
    return datos


def tickets_visibles(con, usuario):
    if usuario["rol"] == "admin":
        return con.execute("SELECT * FROM tickets ORDER BY id").fetchall()
    if usuario["rol"] == "tecnico":
        return con.execute("""SELECT * FROM tickets WHERE tecnico_id = ?
                              OR (tecnico_id IS NULL AND estado NOT IN ('Resuelto', 'Cerrado')) ORDER BY id""",
                           (usuario["id"],)).fetchall()
    return con.execute("SELECT * FROM tickets WHERE usuario_id = ? ORDER BY id", (usuario["id"],)).fetchall()


def notificaciones_de(con, usuario):
    filas = con.execute("SELECT * FROM notificaciones WHERE usuario_id = ? ORDER BY id DESC LIMIT 30", (usuario["id"],)).fetchall()
    sin_leer = con.execute("SELECT COUNT(*) FROM notificaciones WHERE usuario_id = ? AND leida = 0", (usuario["id"],)).fetchone()[0]
    return [{"id": n["id"], "ticketId": n["ticket_id"], "texto": n["texto"], "fecha": n["fecha"], "leida": bool(n["leida"])}
            for n in filas], sin_leer


def articulo_a_json(a):
    return {"id": a["id"], "categoria": a["categoria"], "subcategoria": a["subcategoria"], "titulo": a["titulo"],
            "contenido": a["contenido"], "autorId": a["autor_id"], "fecha": a["fecha"], "vistas": a["vistas"], "utiles": a["utiles"]}


# =========================================================
# PÁGINAS WEB
# =========================================================
@app.get("/")
def inicio():
    return send_from_directory(CARPETA_WEB, "index.html")


@app.get("/<path:ruta>")
def archivos_web(ruta):
    if ruta.startswith("api/"):
        abort(404)
    return send_from_directory(CARPETA_WEB, ruta)


# =========================================================
# INICIO DE SESIÓN
# =========================================================
@app.get("/api/publico")
def datos_publicos():
    """Datos para la pantalla de inicio de sesión (y si ya hay una sesión abierta)."""
    u = usuario_sesion()
    sesion = {"rol": u["rol"], "debeCambiarClave": bool(u["debe_cambiar_clave"])} if u else None
    instalacion = bd().execute("SELECT 1 FROM usuarios LIMIT 1").fetchone() is None
    return jsonify(nombre=config.NOMBRE_SISTEMA, microsoft=config.MICROSOFT_ACTIVO,
                   claveLocal=config.PERMITIR_CLAVE_LOCAL, sesion=sesion, dominios=config.DOMINIOS_PERMITIDOS,
                   instalacion=instalacion, pideCodigo=bool(config.CODIGO_INSTALACION))


@app.post("/api/instalacion")
def instalacion():
    """Primera vez: crea la cuenta del Administrador desde el navegador.
    Solo funciona mientras no exista ningún usuario en el sistema."""
    datos = datos_json()
    if config.CODIGO_INSTALACION and not secrets.compare_digest(
            str(datos.get("codigo") or "").strip(), config.CODIGO_INSTALACION):
        raise ErrorNegocio("El código de instalación no es correcto", 403)
    nombre = " ".join(str(datos.get("nombre") or "").split())[:80]
    correo = str(datos.get("correo") or "").strip().lower()
    area = " ".join(str(datos.get("area") or "TI").split())[:60] or "TI"
    clave = str(datos.get("clave") or "")
    if len(nombre) < 3:
        raise ErrorNegocio("Escribe tu nombre completo")
    validar_correo_corporativo(correo)
    if len(clave) < 8:
        raise ErrorNegocio("La contraseña debe tener al menos 8 caracteres")

    con = bd()
    if con.in_transaction:
        con.commit()
    con.execute("BEGIN IMMEDIATE")   # evita que dos personas se vuelvan administrador a la vez
    if con.execute("SELECT 1 FROM usuarios LIMIT 1").fetchone():
        con.rollback()
        raise ErrorNegocio("El sistema ya tiene administrador. Inicia sesión.", 409)
    cur = con.execute(
        "INSERT INTO usuarios (nombre, correo, area, rol, clave_hash, debe_cambiar_clave, creado) "
        "VALUES (?, ?, ?, 'admin', ?, 0, ?)",
        (nombre, correo, area, generate_password_hash(clave), ahora_iso()))
    admin = {"id": cur.lastrowid, "nombre": nombre}
    areas = leer_config(con).get("areas") or []
    if area not in areas:
        guardar_config(con, "areas", sorted(areas + [area]))
    logica.auditar(con, admin, "Usuarios", "instaló el sistema y creó la cuenta de Administrador")
    logica.notificar(con, admin["id"], None,
                     f"¡Bienvenido! Eres el administrador de {config.NOMBRE_SISTEMA}. "
                     "Agrega a tu equipo en Configuración → Usuarios.", correo=False)
    con.commit()
    session.clear()
    session.permanent = True
    session["usuario_id"] = admin["id"]
    return jsonify(rol="admin", debeCambiarClave=False)


# Pequeña protección contra intentos de adivinar contraseñas
_intentos = {}


def _demasiados_intentos(clave):
    ahora = time.time()
    recientes = [t for t in _intentos.get(clave, []) if ahora - t < 900]
    _intentos[clave] = recientes
    return len(recientes) >= 8


@app.post("/api/login")
def login():
    if not config.PERMITIR_CLAVE_LOCAL:
        raise ErrorNegocio("Usa el botón de Microsoft para iniciar sesión", 403)
    datos = datos_json()
    correo = (datos.get("correo") or "").strip().lower()
    clave = datos.get("clave") or ""
    llave = f"{request.remote_addr}|{correo}"
    if _demasiados_intentos(llave):
        raise ErrorNegocio("Demasiados intentos. Espera 15 minutos o pide ayuda a TI.", 429)

    u = bd().execute("SELECT * FROM usuarios WHERE correo = ?", (correo,)).fetchone()
    if not u or not u["clave_hash"] or not check_password_hash(u["clave_hash"], clave):
        _intentos.setdefault(llave, []).append(time.time())
        raise ErrorNegocio("Correo o contraseña incorrectos", 401)
    if not u["activo"]:
        raise ErrorNegocio("Tu usuario está desactivado. Comunícate con TI.", 403)

    _intentos.pop(llave, None)
    session.clear()
    session.permanent = True
    session["usuario_id"] = u["id"]
    return jsonify(rol=u["rol"], debeCambiarClave=bool(u["debe_cambiar_clave"]))


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.post("/api/cambiar-clave")
@requiere()
def cambiar_clave(yo):
    datos = datos_json()
    nueva = datos.get("nueva") or ""
    if not check_password_hash(yo["clave_hash"] or "", datos.get("actual") or ""):
        raise ErrorNegocio("La contraseña actual no es correcta")
    if len(nueva) < 10 or nueva.isalpha() or nueva.isdigit():
        raise ErrorNegocio("La nueva contraseña debe tener al menos 10 caracteres, con letras y números")
    bd().execute("UPDATE usuarios SET clave_hash = ?, debe_cambiar_clave = 0 WHERE id = ?", (generate_password_hash(nueva), yo["id"]))
    auditar(bd(), yo, "Usuarios", "cambió su contraseña")
    return guardar_y_responder(jsonify(ok=True))


# ---------- Microsoft 365 (se activa al completar .env) ----------
def _cliente_microsoft():
    import msal
    return msal.ConfidentialClientApplication(
        config.MS_ID_CLIENTE,
        authority=f"https://login.microsoftonline.com/{config.MS_ID_INQUILINO}",
        client_credential=config.MS_SECRETO_CLIENTE,
    )


@app.get("/login/microsoft")
def login_microsoft():
    if not config.MICROSOFT_ACTIVO:
        return redirect("/index.html?error=microsoft-no-configurado")
    flujo = _cliente_microsoft().initiate_auth_code_flow(["User.Read"], redirect_uri=f"{config.URL_SISTEMA}/login/microsoft/respuesta")
    session["flujo_ms"] = flujo
    return redirect(flujo["auth_uri"])


@app.get("/login/microsoft/respuesta")
def login_microsoft_respuesta():
    if not config.MICROSOFT_ACTIVO:
        return redirect("/index.html")
    try:
        resultado = _cliente_microsoft().acquire_token_by_auth_code_flow(session.pop("flujo_ms", {}), request.args)
    except ValueError:
        return redirect("/index.html?error=microsoft")
    if "id_token_claims" not in resultado:
        registro.warning("Error de Microsoft: %s", resultado.get("error_description"))
        return redirect("/index.html?error=microsoft")

    datos = resultado["id_token_claims"]
    correo = (datos.get("preferred_username") or datos.get("email") or "").lower()
    if config.DOMINIOS_PERMITIDOS and correo.split("@")[-1] not in config.DOMINIOS_PERMITIDOS:
        return redirect("/index.html?error=dominio")

    con = bd()
    u = con.execute("SELECT * FROM usuarios WHERE correo = ?", (correo,)).fetchone()
    if not u:
        if not config.CREAR_USUARIOS_MICROSOFT:
            return redirect("/index.html?error=no-registrado")
        con.execute("INSERT INTO usuarios (nombre, correo, area, rol, creado) VALUES (?, ?, '', 'usuario', ?)",
                    (datos.get("name") or correo, correo, ahora_iso()))
        u = con.execute("SELECT * FROM usuarios WHERE correo = ?", (correo,)).fetchone()
        auditar(con, dict(u), "Usuarios", "se registró con su cuenta de Microsoft")
        con.commit()
    if not u["activo"] or u["eliminado"]:
        return redirect("/index.html?error=desactivado")

    session.clear()
    session.permanent = True
    session["usuario_id"] = u["id"]
    return redirect({"usuario": "/usuario.html", "tecnico": "/tecnico.html", "admin": "/admin.html"}[u["rol"]])


# =========================================================
# ESTADO GENERAL (lo que cada página necesita para dibujarse)
# =========================================================
@app.get("/api/estado")
@requiere()
def estado(yo):
    con = bd()
    cfg = leer_config(con)
    notificaciones, sin_leer = notificaciones_de(con, yo)
    return jsonify(
        yo=usuario_a_json(yo, yo) | {"debeCambiarClave": bool(yo["debe_cambiar_clave"]), "claveLocal": bool(yo["clave_hash"]),
                                     "tema": yo["tema"]},
        config={k: cfg[k] for k in ("horario", "sla", "autocierreHoras", "feriados")},
        categorias=cfg["categorias"],
        areas=cfg["areas"],
        usuarios=[usuario_a_json(u, yo) for u in con.execute("SELECT * FROM usuarios ORDER BY nombre").fetchall()],
        tickets=[ticket_a_json(con, t, yo) for t in tickets_visibles(con, yo)],
        notificaciones=notificaciones,
        sinLeer=sin_leer,
        articulos=[articulo_a_json(a) for a in con.execute("SELECT * FROM articulos ORDER BY vistas DESC").fetchall()],
        microsoft=config.MICROSOFT_ACTIVO,
    )


@app.post("/api/preferencias")
@requiere()
def guardar_preferencias(yo):
    tema = datos_json().get("tema")
    if tema not in ("claro", "oscuro"):
        raise ErrorNegocio("Tema no válido")
    bd().execute("UPDATE usuarios SET tema = ? WHERE id = ?", (tema, yo["id"]))
    return guardar_y_responder(jsonify(ok=True))


@app.get("/api/notificaciones")
@requiere()
def notificaciones(yo):
    lista, sin_leer = notificaciones_de(bd(), yo)
    return jsonify(notificaciones=lista, sinLeer=sin_leer)


@app.post("/api/notificaciones/leer")
@requiere()
def leer_notificaciones(yo):
    datos = datos_json()
    if datos.get("todas"):
        bd().execute("UPDATE notificaciones SET leida = 1 WHERE usuario_id = ?", (yo["id"],))
    else:
        for nid in datos.get("ids", [])[:100]:
            bd().execute("UPDATE notificaciones SET leida = 1 WHERE id = ? AND usuario_id = ?", (int(nid), yo["id"]))
    return guardar_y_responder(jsonify(ok=True))


# =========================================================
# TICKETS
# =========================================================
def responder_ticket(yo, ticket_id):
    """Guarda los cambios y devuelve el ticket actualizado (con su chat)."""
    con = bd()
    con.commit()
    t = buscar_ticket(con, ticket_id)
    if not logica.puede_ver(yo, t):
        return jsonify(ok=True, sinAcceso=True)
    return jsonify(ticket_a_json(con, t, yo, con_mensajes=True))


@app.get("/api/tickets/<int:ticket_id>")
@requiere()
def ver_ticket(yo, ticket_id):
    con = bd()
    t = buscar_ticket(con, ticket_id)
    exigir_ver(yo, t)
    # Al abrir el ticket, sus notificaciones se marcan como leídas
    con.execute("UPDATE notificaciones SET leida = 1 WHERE usuario_id = ? AND ticket_id = ?", (yo["id"], ticket_id))
    con.commit()
    return jsonify(ticket_a_json(con, t, yo, con_mensajes=True))


@app.post("/api/tickets")
@requiere()
def nuevo_ticket(yo):
    """Los usuarios crean sus tickets. El equipo de TI también puede crearlos,
    para sí mismo o a nombre de alguien (ej.: le llamaron o escribieron por WhatsApp)."""
    con = bd()
    formulario = request.form
    solicitante = yo
    tomar = False
    prioridad = None
    if yo["rol"] in logica.AGENTES:
        solicitante_id = int(formulario.get("solicitanteId") or yo["id"])
        fila = con.execute("SELECT * FROM usuarios WHERE id = ? AND activo = 1 AND eliminado = 0", (solicitante_id,)).fetchone()
        if not fila:
            raise ErrorNegocio("Elige un solicitante válido")
        solicitante = dict(fila)
        prioridad = formulario.get("prioridad") or None
        if prioridad and prioridad not in logica.PRIORIDADES:
            raise ErrorNegocio("Prioridad no válida")
        tomar = formulario.get("tomar") == "si"
        if tomar and not prioridad:
            raise ErrorNegocio("Para atenderlo ahora, elige la prioridad")

    ticket_id = logica.crear_ticket(con, solicitante, formulario,
                                    registrado_por=yo if yo["rol"] in logica.AGENTES else None,
                                    avisar_equipo=not tomar)

    archivo = request.files.get("adjunto")
    if archivo and archivo.filename:
        nombre_original = secure_filename(archivo.filename) or "archivo"
        extension = nombre_original.rsplit(".", 1)[-1].lower() if "." in nombre_original else ""
        if extension not in config.EXTENSIONES_PERMITIDAS:
            con.rollback()
            raise ErrorNegocio("Tipo de archivo no permitido. Usa imágenes, PDF, Word, Excel, TXT o ZIP.")
        config.CARPETA_ADJUNTOS.mkdir(parents=True, exist_ok=True)
        nombre_guardado = f"{uuid.uuid4().hex}.{extension}"
        ruta = config.CARPETA_ADJUNTOS / nombre_guardado
        archivo.save(ruta)
        con.execute("""INSERT INTO adjuntos (ticket_id, nombre_original, nombre_guardado, tamano, subido_por, fecha)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (ticket_id, nombre_original, nombre_guardado, ruta.stat().st_size, yo["id"], ahora_iso()))
    if tomar:
        logica.tomar_ticket(con, yo, ticket_id, prioridad)
    elif prioridad:
        con.execute("UPDATE tickets SET prioridad = ? WHERE id = ?", (prioridad, ticket_id))
        logica.agregar_evento(con, ticket_id, f"{yo['nombre']} clasificó el ticket con prioridad {prioridad}")
    con.commit()
    t = buscar_ticket(con, ticket_id)
    return jsonify(id=ticket_id, codigo=t["codigo"], tomado=tomar), 201


@app.get("/api/adjuntos/<int:adjunto_id>")
@requiere()
def descargar_adjunto(yo, adjunto_id):
    con = bd()
    a = con.execute("SELECT * FROM adjuntos WHERE id = ?", (adjunto_id,)).fetchone()
    if not a:
        abort(404)
    exigir_ver(yo, buscar_ticket(con, a["ticket_id"]))
    return send_from_directory(config.CARPETA_ADJUNTOS, a["nombre_guardado"], download_name=a["nombre_original"], as_attachment=True)


@app.post("/api/tickets/<int:ticket_id>/mensajes")
@requiere()
def nuevo_mensaje(yo, ticket_id):
    datos = datos_json()
    logica.agregar_mensaje(bd(), yo, ticket_id, datos.get("texto"), datos.get("interno"))
    return responder_ticket(yo, ticket_id)


@app.post("/api/tickets/<int:ticket_id>/tomar")
@requiere("tecnico", "admin")
def tomar(yo, ticket_id):
    logica.tomar_ticket(bd(), yo, ticket_id, datos_json().get("prioridad"))
    return responder_ticket(yo, ticket_id)


@app.post("/api/tickets/<int:ticket_id>/asignar")
@requiere("admin")
def asignar(yo, ticket_id):
    datos = datos_json()
    logica.asignar_ticket(bd(), yo, ticket_id, int(datos.get("tecnicoId") or 0), datos.get("prioridad"))
    return responder_ticket(yo, ticket_id)


@app.post("/api/tickets/<int:ticket_id>/estado")
@requiere()
def estado_ticket(yo, ticket_id):
    datos = datos_json()
    t = buscar_ticket(bd(), ticket_id)
    exigir_ver(yo, t)
    logica.cambiar_estado(bd(), yo, ticket_id, datos.get("estado"), datos.get("motivo"), datos.get("solucion"))
    return responder_ticket(yo, ticket_id)


@app.post("/api/tickets/<int:ticket_id>/transferir")
@requiere("tecnico", "admin")
def transferir(yo, ticket_id):
    datos = datos_json()
    logica.transferir_ticket(bd(), yo, ticket_id, int(datos.get("tecnicoId") or 0), datos.get("motivo"))
    return responder_ticket(yo, ticket_id)


@app.post("/api/tickets/<int:ticket_id>/calificar")
@requiere("usuario")
def calificar(yo, ticket_id):
    datos = datos_json()
    logica.calificar(bd(), yo, ticket_id, datos.get("puntos"), datos.get("comentario"))
    return responder_ticket(yo, ticket_id)


# =========================================================
# BASE DE CONOCIMIENTO
# =========================================================
def _datos_articulo(cfg):
    datos = datos_json()
    categoria = logica._texto_limpio(datos.get("categoria"), 80, "Categoría")
    if categoria not in cfg["categorias"]:
        raise ErrorNegocio("Categoría no válida")
    return (categoria,
            logica._texto_limpio(datos.get("subcategoria"), 80, "Tipo", obligatorio=False),
            logica._texto_limpio(datos.get("titulo"), 150, "Título"),
            logica._texto_limpio(datos.get("contenido"), 10000, "Contenido"))


@app.post("/api/articulos")
@requiere("tecnico", "admin")
def crear_articulo(yo):
    con = bd()
    categoria, sub, titulo, contenido = _datos_articulo(leer_config(con))
    con.execute("INSERT INTO articulos (categoria, subcategoria, titulo, contenido, autor_id, fecha) VALUES (?, ?, ?, ?, ?, ?)",
                (categoria, sub, titulo, contenido, yo["id"], ahora_iso()))
    auditar(con, yo, "Conocimiento", f'creó el artículo "{titulo}"')
    return guardar_y_responder(jsonify(ok=True))


@app.put("/api/articulos/<int:articulo_id>")
@requiere("tecnico", "admin")
def editar_articulo(yo, articulo_id):
    con = bd()
    categoria, sub, titulo, contenido = _datos_articulo(leer_config(con))
    if not con.execute("UPDATE articulos SET categoria = ?, subcategoria = ?, titulo = ?, contenido = ? WHERE id = ?",
                       (categoria, sub, titulo, contenido, articulo_id)).rowcount:
        abort(404)
    auditar(con, yo, "Conocimiento", f'editó el artículo "{titulo}"')
    return guardar_y_responder(jsonify(ok=True))


@app.delete("/api/articulos/<int:articulo_id>")
@requiere("tecnico", "admin")
def borrar_articulo(yo, articulo_id):
    con = bd()
    a = con.execute("SELECT titulo FROM articulos WHERE id = ?", (articulo_id,)).fetchone()
    if not a:
        abort(404)
    con.execute("DELETE FROM articulos WHERE id = ?", (articulo_id,))
    auditar(con, yo, "Conocimiento", f'eliminó el artículo "{a["titulo"]}"')
    return guardar_y_responder(jsonify(ok=True))


@app.post("/api/articulos/<int:articulo_id>/<accion>")
@requiere()
def contar_articulo(yo, articulo_id, accion):
    columna = {"vista": "vistas", "util": "utiles"}.get(accion)
    if not columna:
        abort(404)
    bd().execute(f"UPDATE articulos SET {columna} = {columna} + 1 WHERE id = ?", (articulo_id,))
    return guardar_y_responder(jsonify(ok=True))


# =========================================================
# CONFIGURACIÓN (solo Jefe de TI)
# =========================================================
def _clave_temporal():
    # Fácil de dictar: sin letras confusas (0/O, 1/l)
    letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(letras) for _ in range(12))


@app.post("/api/usuarios")
@requiere("admin")
def crear_usuario(yo):
    con = bd()
    datos = datos_json()
    nombre = logica._texto_limpio(datos.get("nombre"), 120, "Nombre")
    correo = logica._texto_limpio(datos.get("correo"), 150, "Correo").lower()
    validar_correo_corporativo(correo)
    rol = datos.get("rol")
    if rol not in logica.ROLES:
        raise ErrorNegocio("Rol no válido")
    clave = _clave_temporal()
    existente = con.execute("SELECT * FROM usuarios WHERE correo = ?", (correo,)).fetchone()
    if existente and not existente["eliminado"]:
        raise ErrorNegocio("Ya existe un usuario con ese correo")
    if existente:
        # Vuelve a la empresa alguien que fue eliminado: se recupera con su historial
        con.execute("""UPDATE usuarios SET nombre = ?, area = ?, rol = ?, activo = 1, eliminado = 0,
                       clave_hash = ?, debe_cambiar_clave = 1 WHERE id = ?""",
                    (nombre, datos.get("area") or "", rol, generate_password_hash(clave), existente["id"]))
        auditar(con, yo, "Usuarios", f"volvió a agregar a {nombre} como {logica.ROLES[rol]} (recuperó su historial)")
    else:
        con.execute("""INSERT INTO usuarios (nombre, correo, area, rol, clave_hash, debe_cambiar_clave, creado)
                       VALUES (?, ?, ?, ?, ?, 1, ?)""",
                    (nombre, correo, datos.get("area") or "", rol, generate_password_hash(clave), ahora_iso()))
        auditar(con, yo, "Usuarios", f"agregó a {nombre} como {logica.ROLES[rol]}")
    return guardar_y_responder(jsonify(claveTemporal=clave))


# ---------- Importar una lista de trabajadores (Excel o CSV) ----------
_ROLES_IMPORTACION = {
    "": "usuario", "usuario": "usuario", "trabajador": "usuario", "colaborador": "usuario",
    "tecnico": "tecnico", "analista": "tecnico", "analista de soporte": "tecnico", "soporte": "tecnico",
    "admin": "admin", "administrador": "admin", "jefe de ti": "admin",
}
MAXIMO_IMPORTACION = 1000


def _sin_tildes(texto):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


@app.post("/api/usuarios/importar")
@requiere("admin")
def importar_usuarios(yo):
    """Revisa (simular=True) o crea de una vez los usuarios de una lista.
    Cada fila: nombre, correo, area, rol. Devuelve el resultado de cada fila y,
    al crear, la contraseña temporal de cada persona."""
    datos = datos_json()
    filas = datos.get("filas")
    simular = bool(datos.get("simular"))
    if not isinstance(filas, list) or not filas:
        raise ErrorNegocio("La lista está vacía")
    if len(filas) > MAXIMO_IMPORTACION:
        raise ErrorNegocio(f"Máximo {MAXIMO_IMPORTACION} personas por importación")

    con = bd()
    existentes = {r["correo"].lower(): dict(r) for r in con.execute("SELECT * FROM usuarios")}
    vistos = set()
    resultado = []
    for numero, fila in enumerate(filas, start=1):
        fila = fila if isinstance(fila, dict) else {}
        nombre = " ".join(str(fila.get("nombre") or "").split())[:120]
        correo = str(fila.get("correo") or "").strip().lower()
        area = " ".join(str(fila.get("area") or "").split())[:60]
        rol_texto = _sin_tildes(" ".join(str(fila.get("rol") or "").split()).lower())
        item = {"fila": fila.get("fila") or numero, "nombre": nombre, "correo": correo, "area": area}
        rol = _ROLES_IMPORTACION.get(rol_texto)
        try:
            if len(nombre) < 3:
                raise ErrorNegocio("Falta el nombre")
            validar_correo_corporativo(correo)
            if rol is None:
                raise ErrorNegocio(f"Rol «{fila.get('rol')}» no válido (usa Usuario, Analista o Administrador)")
            if correo in vistos:
                raise ErrorNegocio("Correo repetido en la lista")
            previo = existentes.get(correo)
            if previo and not previo["eliminado"]:
                raise ErrorNegocio("Ya está registrado")
        except ErrorNegocio as e:
            resultado.append(item | {"estado": "omitir", "motivo": str(e), "rol": rol or ""})
            continue
        vistos.add(correo)
        item |= {"rol": rol, "estado": "recuperar" if previo else "crear"}
        resultado.append(item)

    validos = [r for r in resultado if r["estado"] != "omitir"]
    if simular or not validos:
        return jsonify(filas=resultado, simulacion=True)

    areas = set(leer_config(con).get("areas") or [])
    for r in validos:
        clave = _clave_temporal()
        if r["estado"] == "recuperar":
            con.execute("""UPDATE usuarios SET nombre = ?, area = ?, rol = ?, activo = 1, eliminado = 0,
                           clave_hash = ?, debe_cambiar_clave = 1 WHERE id = ?""",
                        (r["nombre"], r["area"], r["rol"], generate_password_hash(clave), existentes[r["correo"]]["id"]))
        else:
            con.execute("""INSERT INTO usuarios (nombre, correo, area, rol, clave_hash, debe_cambiar_clave, creado)
                           VALUES (?, ?, ?, ?, ?, 1, ?)""",
                        (r["nombre"], r["correo"], r["area"], r["rol"], generate_password_hash(clave), ahora_iso()))
        r["claveTemporal"] = clave
        if r["area"]:
            areas.add(r["area"])
    guardar_config(con, "areas", sorted(areas))
    auditar(con, yo, "Usuarios", f"importó {len(validos)} usuario(s) desde una lista"
            + (f"; {len(resultado) - len(validos)} fila(s) omitidas" if len(resultado) > len(validos) else ""))
    return guardar_y_responder(jsonify(filas=resultado, simulacion=False))


def validar_correo_corporativo(correo):
    if "@" not in correo or "." not in correo.split("@")[-1]:
        raise ErrorNegocio("Correo no válido")
    if config.DOMINIOS_PERMITIDOS and correo.split("@")[-1] not in config.DOMINIOS_PERMITIDOS:
        dominios = " o ".join("@" + d for d in config.DOMINIOS_PERMITIDOS)
        raise ErrorNegocio(f"Usa el correo corporativo ({dominios})")


def _hay_otro_admin(con, usuario_id):
    return con.execute("SELECT 1 FROM usuarios WHERE rol = 'admin' AND activo = 1 AND eliminado = 0 AND id != ?",
                       (usuario_id,)).fetchone() is not None


def _retirar_usuario(con, u, quien, motivo=""):
    """Si la persona tiene historial (tickets, mensajes, guías) se retira del sistema pero su nombre
    queda en el historial; si no tiene nada, se borra por completo. Devuelve 'retirado' o 'borrado'."""
    usuario_id = u["id"]
    tiene_historial = any(con.execute(consulta, (usuario_id,)).fetchone()[0] for consulta in (
        "SELECT COUNT(*) FROM tickets WHERE usuario_id = ?",
        "SELECT COUNT(*) FROM tickets WHERE tecnico_id = ?",
        "SELECT COUNT(*) FROM mensajes WHERE autor_id = ?",
        "SELECT COUNT(*) FROM articulos WHERE autor_id = ?",
        "SELECT COUNT(*) FROM adjuntos WHERE subido_por = ?",
    ))
    if tiene_historial:
        con.execute("UPDATE usuarios SET activo = 0, eliminado = 1, clave_hash = NULL WHERE id = ?", (usuario_id,))
        con.execute("UPDATE notificaciones SET leida = 1 WHERE usuario_id = ?", (usuario_id,))
        resultado = "retirado"
    else:
        con.execute("DELETE FROM notificaciones WHERE usuario_id = ?", (usuario_id,))
        con.execute("UPDATE auditoria SET usuario_id = NULL WHERE usuario_id = ?", (usuario_id,))
        con.execute("DELETE FROM usuarios WHERE id = ?", (usuario_id,))
        resultado = "borrado"
    # Si la persona se borró a sí misma, la auditoría queda sin autor (pero con su nombre en el texto)
    autor = quien if quien and con.execute("SELECT 1 FROM usuarios WHERE id = ?", (quien["id"],)).fetchone() else None
    texto = motivo or (f"eliminó a {u['nombre']} ({u['correo']})" +
                       ("; se conserva su historial" if resultado == "retirado" else " definitivamente"))
    auditar(con, autor, "Usuarios", texto)
    return resultado


@app.delete("/api/usuarios/<int:usuario_id>")
@requiere("admin")
def eliminar_usuario(yo, usuario_id):
    """El administrador elimina a otra persona (para sí mismo existe "Darme de baja")."""
    con = bd()
    u = con.execute("SELECT * FROM usuarios WHERE id = ? AND eliminado = 0", (usuario_id,)).fetchone()
    if not u:
        abort(404)
    if usuario_id == yo["id"]:
        raise ErrorNegocio('Para retirarte usa "Darme de baja"')
    if u["rol"] == "admin" and not _hay_otro_admin(con, usuario_id):
        raise ErrorNegocio("Debe quedar al menos un administrador activo")
    abiertos = con.execute("SELECT COUNT(*) FROM tickets WHERE tecnico_id = ? AND estado NOT IN ('Resuelto', 'Cerrado')",
                           (usuario_id,)).fetchone()[0]
    if abiertos:
        raise ErrorNegocio(f"{u['nombre']} tiene {abiertos} ticket(s) abiertos asignados. Reasígnalos primero.")
    return guardar_y_responder(jsonify(resultado=_retirar_usuario(con, u, yo)))


@app.post("/api/mi-cuenta/baja")
@requiere("admin")
def darme_de_baja(yo):
    """Sucesión: un administrador se retira del sistema. Solo se permite si queda OTRO administrador
    activo, que asume el mando. Sus tickets abiertos pasan a la persona que él elija."""
    con = bd()
    datos = datos_json()
    if not _hay_otro_admin(con, yo["id"]):
        raise ErrorNegocio("Primero nombra a otro administrador. Si te das de baja, el sistema quedaría sin administrador.")
    if (datos.get("confirmacion") or "").strip().upper() != "BAJA":
        raise ErrorNegocio('Escribe BAJA para confirmar')

    abiertos = con.execute("SELECT id FROM tickets WHERE tecnico_id = ? AND estado NOT IN ('Resuelto', 'Cerrado')",
                           (yo["id"],)).fetchall()
    sucesor = None
    if abiertos:
        sucesor = con.execute("SELECT * FROM usuarios WHERE id = ? AND rol IN ('tecnico', 'admin') AND activo = 1 "
                              "AND eliminado = 0 AND id != ?", (int(datos.get("transferirA") or 0), yo["id"])).fetchone()
        if not sucesor:
            raise ErrorNegocio("Elige a quién pasarle tus tickets abiertos")
        for fila in abiertos:
            logica.transferir_ticket(con, yo, fila["id"], sucesor["id"], f"Baja de {yo['nombre']} del sistema")

    detalle = f"; sus {len(abiertos)} ticket(s) abiertos pasaron a {sucesor['nombre']}" if sucesor else ""
    resultado = _retirar_usuario(con, yo, yo, f"{yo['nombre']} ({yo['correo']}) se dio de baja como administrador{detalle}")
    for admin in con.execute("SELECT id FROM usuarios WHERE rol = 'admin' AND activo = 1 AND eliminado = 0").fetchall():
        logica.notificar(con, admin["id"], None, f"{yo['nombre']} se dio de baja del sistema. Ahora tú administras {config.NOMBRE_SISTEMA}.")
    con.commit()
    session.clear()
    return jsonify(resultado=resultado)


@app.patch("/api/usuarios/<int:usuario_id>")
@requiere("admin")
def editar_usuario(yo, usuario_id):
    con = bd()
    u = con.execute("SELECT * FROM usuarios WHERE id = ? AND eliminado = 0", (usuario_id,)).fetchone()
    if not u:
        abort(404)
    datos = datos_json()

    # Siempre debe quedar al menos un administrador activo
    quita_admin = u["rol"] == "admin" and (
        ("rol" in datos and datos["rol"] != "admin") or ("activo" in datos and not datos["activo"]))
    if quita_admin:
        otros = con.execute("SELECT COUNT(*) FROM usuarios WHERE rol = 'admin' AND activo = 1 AND eliminado = 0 AND id != ?", (usuario_id,)).fetchone()[0]
        if otros == 0:
            raise ErrorNegocio("Debe quedar al menos un administrador activo")

    if "nombre" in datos:
        nombre = logica._texto_limpio(datos["nombre"], 120, "Nombre")
        con.execute("UPDATE usuarios SET nombre = ? WHERE id = ?", (nombre, usuario_id))
        auditar(con, yo, "Usuarios", f"cambió el nombre de {u['nombre']} a {nombre}")
    if "correo" in datos:
        correo = logica._texto_limpio(datos["correo"], 150, "Correo").lower()
        validar_correo_corporativo(correo)
        if con.execute("SELECT 1 FROM usuarios WHERE correo = ? AND id != ?", (correo, usuario_id)).fetchone():
            raise ErrorNegocio("Ya existe otro usuario con ese correo")
        con.execute("UPDATE usuarios SET correo = ? WHERE id = ?", (correo, usuario_id))
        auditar(con, yo, "Usuarios", f"cambió el correo de {u['nombre']} a {correo}")
    if "area" in datos:
        con.execute("UPDATE usuarios SET area = ? WHERE id = ?", (datos["area"], usuario_id))
        auditar(con, yo, "Usuarios", f"cambió el área de {u['nombre']} a {datos['area']}")
    if "rol" in datos:
        if usuario_id == yo["id"]:
            raise ErrorNegocio("No puedes cambiar tu propio rol")
        if datos["rol"] not in logica.ROLES:
            raise ErrorNegocio("Rol no válido")
        con.execute("UPDATE usuarios SET rol = ? WHERE id = ?", (datos["rol"], usuario_id))
        auditar(con, yo, "Usuarios", f"cambió el rol de {u['nombre']} a {logica.ROLES[datos['rol']]}")
    if "activo" in datos:
        if usuario_id == yo["id"]:
            raise ErrorNegocio("No puedes desactivarte a ti mismo")
        con.execute("UPDATE usuarios SET activo = ? WHERE id = ?", (int(bool(datos["activo"])), usuario_id))
        auditar(con, yo, "Usuarios", f"{'activó' if datos['activo'] else 'desactivó'} a {u['nombre']}")
    return guardar_y_responder(jsonify(ok=True))


@app.post("/api/usuarios/<int:usuario_id>/restablecer-clave")
@requiere("admin")
def restablecer_clave(yo, usuario_id):
    con = bd()
    u = con.execute("SELECT * FROM usuarios WHERE id = ? AND eliminado = 0", (usuario_id,)).fetchone()
    if not u:
        abort(404)
    clave = _clave_temporal()
    con.execute("UPDATE usuarios SET clave_hash = ?, debe_cambiar_clave = 1 WHERE id = ?", (generate_password_hash(clave), usuario_id))
    auditar(con, yo, "Usuarios", f"restableció la contraseña de {u['nombre']}")
    return guardar_y_responder(jsonify(claveTemporal=clave))


@app.put("/api/config/horario")
@requiere("admin")
def guardar_horario(yo):
    datos = datos_json()
    horario, sla, autocierre = datos.get("horario") or {}, datos.get("sla") or {}, datos.get("autocierreHoras")
    try:
        dias = sorted({int(d) for d in horario["dias"]})
        assert dias and all(0 <= d <= 6 for d in dias)
        inicio, fin = horario["inicio"], horario["fin"]
        assert logica._hora_a_minutos(fin) > logica._hora_a_minutos(inicio)
        sla_limpio = {tipo: {p: int(sla[tipo][p]) for p in logica.PRIORIDADES} for tipo in ("respuesta", "solucion")}
        assert all(v > 0 for tipo in sla_limpio.values() for v in tipo.values())
        autocierre = int(autocierre)
        assert 1 <= autocierre <= 720
    except (KeyError, ValueError, TypeError, AssertionError):
        raise ErrorNegocio("Revisa los datos del horario y del SLA")
    con = bd()
    guardar_config(con, "horario", {"dias": dias, "inicio": inicio, "fin": fin})
    guardar_config(con, "sla", sla_limpio)
    guardar_config(con, "autocierreHoras", autocierre)
    auditar(con, yo, "Horario y SLA", f"actualizó el horario ({inicio} a {fin}) y los tiempos de SLA")
    return guardar_y_responder(jsonify(ok=True))


@app.put("/api/config/<clave>")
@requiere("admin")
def guardar_lista(yo, clave):
    """Guarda feriados, categorías o áreas completos."""
    valor = datos_json().get("valor")
    con = bd()
    if clave == "feriados":
        if not isinstance(valor, list) or not all(isinstance(f, dict) and f.get("fecha") and f.get("nombre") for f in valor):
            raise ErrorNegocio("Feriados no válidos")
        valor = sorted(({"fecha": str(f["fecha"])[:10], "nombre": str(f["nombre"])[:100]} for f in valor), key=lambda f: f["fecha"])
    elif clave == "categorias":
        if not isinstance(valor, dict) or not valor or not all(isinstance(v, list) and v for v in valor.values()):
            raise ErrorNegocio("Cada categoría necesita al menos un tipo de problema")
        valor = {str(k)[:80]: [str(s)[:80] for s in v] for k, v in valor.items()}
    elif clave == "areas":
        if not isinstance(valor, list):
            raise ErrorNegocio("Áreas no válidas")
        valor = sorted({str(a)[:80] for a in valor if str(a).strip()})
    else:
        abort(404)
    guardar_config(con, clave, valor)
    auditar(con, yo, clave.capitalize(), datos_json().get("descripcion") or f"actualizó {clave}")
    return guardar_y_responder(jsonify(ok=True))


@app.get("/api/auditoria")
@requiere("admin")
def ver_auditoria(yo):
    con = bd()
    buscar = f"%{(request.args.get('buscar') or '').strip()}%"
    limite = min(int(request.args.get("limite", 50)), 5000)
    filas = con.execute(
        """SELECT * FROM (
             SELECT m.fecha, t.codigo AS modulo, t.id AS ticket_id, m.texto AS accion
               FROM mensajes m JOIN tickets t ON t.id = m.ticket_id WHERE m.autor_id IS NULL
             UNION ALL
             SELECT a.fecha, a.modulo, NULL, COALESCE(u.nombre, 'Sistema') || ': ' || a.accion
               FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
           ) WHERE modulo LIKE ? OR accion LIKE ? ORDER BY fecha DESC LIMIT ?""",
        (buscar, buscar, limite + 1)).fetchall()
    return jsonify(
        registros=[{"fecha": f["fecha"], "modulo": f["modulo"], "ticketId": f["ticket_id"], "accion": f["accion"]} for f in filas[:limite]],
        hayMas=len(filas) > limite)


# =========================================================
# REVISIONES AUTOMÁTICAS EN SEGUNDO PLANO
# =========================================================
def _vigilante():
    """Cada minuto: cierres automáticos y alertas de SLA.
    Una vez al día (RESPALDO_HORA): copia de seguridad de la base de datos y los adjuntos."""
    from datetime import datetime
    import gestionar
    ultimo_respaldo = None
    while True:
        try:
            con = conectar()
            logica.revisiones_automaticas(con)
            con.close()
        except Exception:
            registro.exception("Error en las revisiones automáticas")
        try:
            ahora = datetime.now(logica.ZONA)
            if config.RESPALDO_HORA and ahora.strftime("%H:%M") >= config.RESPALDO_HORA and ultimo_respaldo != ahora.date():
                ya_existe = any(config.CARPETA_RESPALDOS.glob(f"mesa_ayuda-{ahora:%Y%m%d}-*.db"))
                if not ya_existe:
                    gestionar.respaldo()
                    registro.info("Respaldo automático del día creado en %s", config.CARPETA_RESPALDOS)
                ultimo_respaldo = ahora.date()
        except Exception:
            registro.exception("No se pudo crear el respaldo automático")
        time.sleep(60)


def iniciar_vigilante():
    threading.Thread(target=_vigilante, daemon=True, name="vigilante").start()


inicializar()

if __name__ == "__main__":
    # Solo para desarrollo. En producción usa: python servidor.py
    iniciar_vigilante()
    app.run(debug=True, port=config.PUERTO)
