"""
PRUEBAS AUTOMÁTICAS DEL SERVIDOR
--------------------------------
Revisan que las reglas de seguridad y el flujo de un ticket funcionen.
Usan una base de datos temporal, así que NO tocan los datos reales.

    python pruebas.py

Ejecútalas cada vez que cambies algo en app.py o logica.py.
"""
import io
import os
import sqlite3
import tempfile
from pathlib import Path

# Base de datos temporal (antes de importar la aplicación)
temporal = Path(tempfile.mkdtemp())
os.environ["RUTA_BD"] = str(temporal / "prueba.db")
os.environ["CARPETA_ADJUNTOS"] = str(temporal / "adjuntos")
os.environ["CLAVE_SECRETA"] = "prueba"
os.environ["DOMINIOS_PERMITIDOS"] = "empresa.com"

from werkzeug.security import generate_password_hash  # noqa: E402

from app import app  # noqa: E402
from basedatos import ahora_iso, conectar  # noqa: E402
import logica  # noqa: E402

CABECERA = {"X-Mesa-Ayuda": "1"}
aprobadas = 0


def revisar(condicion, descripcion):
    global aprobadas
    if not condicion:
        raise AssertionError("FALLÓ: " + descripcion)
    aprobadas += 1
    print("  ✔", descripcion)


def crear_usuario(nombre, correo, rol, clave="Clave12345"):
    con = conectar()
    con.execute("INSERT INTO usuarios (nombre, correo, area, rol, clave_hash, creado) VALUES (?, ?, 'Ventas', ?, ?, ?)",
                (nombre, correo, rol, generate_password_hash(clave), ahora_iso()))
    con.commit()
    uid = con.execute("SELECT id FROM usuarios WHERE correo = ?", (correo,)).fetchone()[0]
    con.close()
    return uid


def cliente(correo, clave="Clave12345"):
    c = app.test_client()
    r = c.post("/api/login", json={"correo": correo, "clave": clave}, headers=CABECERA)
    assert r.status_code == 200, r.json
    return c


def post(c, ruta, datos=None):
    return c.post(ruta, json=datos or {}, headers=CABECERA)


print("\n0. Primera vez: crear el Administrador desde el navegador")
nuevo = app.test_client()
revisar(nuevo.get("/api/publico").json["instalacion"] is True, "Sistema vacío: pide crear el Administrador")
revisar(post(nuevo, "/api/instalacion", {"nombre": "Yo", "correo": "x@empresa.com", "clave": "Clave12345"}).status_code == 400,
        "Instalación exige nombre completo")
revisar(post(nuevo, "/api/instalacion", {"nombre": "Laura Rojas", "correo": "y@gmail.com", "clave": "Clave12345"}).status_code == 400,
        "Instalación exige correo corporativo")
revisar(post(nuevo, "/api/instalacion", {"nombre": "Laura Rojas", "correo": "y@empresa.com", "clave": "corta"}).status_code == 400,
        "Instalación exige contraseña de 8 caracteres")
r = post(nuevo, "/api/instalacion", {"nombre": "Laura Rojas", "correo": "Laura@Empresa.com", "area": "TI", "clave": "Clave12345"})
revisar(r.status_code == 200 and r.json["rol"] == "admin", "Se crea el Administrador y entra directo")
revisar(nuevo.get("/api/estado").json["yo"]["rol"] == "admin", "El instalador queda con sesión de Administrador")
otro = app.test_client()
revisar(otro.get("/api/publico").json["instalacion"] is False, "Con un usuario ya no aparece la instalación")
revisar(post(otro, "/api/instalacion", {"nombre": "Intruso Malo", "correo": "i@empresa.com", "clave": "Clave12345"}).status_code == 409,
        "Nadie más puede volverse Administrador por esa vía")
con0 = conectar()
con0.execute("DELETE FROM notificaciones"); con0.execute("DELETE FROM auditoria"); con0.execute("DELETE FROM usuarios")
con0.commit(); con0.close()

print("\n1. Inicio de sesión")
ana = crear_usuario("Ana Torres", "ana@empresa.com", "usuario")
luis = crear_usuario("Luis Ramos", "luis@empresa.com", "usuario")
carlos = crear_usuario("Carlos Quispe", "carlos@empresa.com", "tecnico")
maria = crear_usuario("María Huamán", "maria@empresa.com", "tecnico")
jefe = crear_usuario("Jorge Salazar", "jorge@empresa.com", "admin")

anonimo = app.test_client()
revisar(anonimo.get("/api/estado").status_code == 401, "Sin sesión no se ven datos")
revisar(post(anonimo, "/api/login", {"correo": "ana@empresa.com", "clave": "mala"}).status_code == 401, "Contraseña incorrecta rechazada")
revisar(anonimo.post("/api/login", json={"correo": "ana@empresa.com", "clave": "Clave12345"}).status_code == 403,
        "Peticiones sin la cabecera de seguridad son rechazadas (CSRF)")
c_ana, c_luis, c_carlos, c_maria, c_jefe = (cliente(x) for x in
    ("ana@empresa.com", "luis@empresa.com", "carlos@empresa.com", "maria@empresa.com", "jorge@empresa.com"))
revisar(c_ana.get("/api/estado").json["yo"]["nombre"] == "Ana Torres", "Ana inicia sesión")

print("\n2. Crear ticket")
datos = {"categoria": "Hardware", "subcategoria": "Impresora / Escáner", "asunto": "No imprime",
         "descripcion": "La impresora no responde", "ubicacion": "2do piso",
         "adjunto": (io.BytesIO(b"captura de prueba"), "captura.png")}
r = c_ana.post("/api/tickets", data=datos, headers=CABECERA, content_type="multipart/form-data")
revisar(r.status_code == 201 and r.json["codigo"] == "TKC-0001", "Ana crea TKC-0001 con adjunto")
tid = r.json["id"]
malo = c_ana.post("/api/tickets", data={**{k: v for k, v in datos.items() if k != "adjunto"}, "adjunto": (io.BytesIO(b"x"), "virus.exe")},
                  headers=CABECERA, content_type="multipart/form-data")
revisar(malo.status_code == 400, "Archivos .exe no se permiten")
revisar(post(c_ana, "/api/tickets").status_code == 400, "Un ticket sin datos se rechaza")

print("\n3. Privacidad")
revisar(c_luis.get(f"/api/tickets/{tid}").status_code == 403, "Luis NO ve el ticket de Ana")
revisar(len(c_luis.get("/api/estado").json["tickets"]) == 0, "La lista de Luis no incluye tickets ajenos")
revisar("correo" not in [u for u in c_luis.get("/api/estado").json["usuarios"] if u["id"] == ana][0],
        "Un usuario no ve los correos de los demás")
adjunto = c_ana.get(f"/api/tickets/{tid}").json["adjunto"]
revisar(c_ana.get(f"/api/adjuntos/{adjunto['id']}").status_code == 200, "Ana descarga su adjunto")
revisar(c_luis.get(f"/api/adjuntos/{adjunto['id']}").status_code == 403, "Luis NO descarga el adjunto de Ana")
revisar(c_carlos.get(f"/api/tickets/{tid}").status_code == 200, "Los analistas ven tickets libres")

print("\n4. Tomar ticket (y evitar duplicados)")
revisar(post(c_ana, f"/api/tickets/{tid}/tomar", {"prioridad": "Alta"}).status_code == 403, "Un usuario no puede tomar tickets")
r = post(c_carlos, f"/api/tickets/{tid}/tomar", {"prioridad": "Media"})
revisar(r.status_code == 200 and r.json["estado"] == "En proceso" and r.json["tecnicoId"] == carlos, "Carlos toma el ticket")
r = post(c_maria, f"/api/tickets/{tid}/tomar", {"prioridad": "Alta"})
revisar(r.status_code == 409, "María no puede tomarlo después (409: ya fue tomado)")
revisar(c_maria.get(f"/api/tickets/{tid}").status_code == 403, "María ya no ve el ticket de Carlos")

print("\n5. Chat y notas internas")
post(c_carlos, f"/api/tickets/{tid}/mensajes", {"texto": "Nota solo para TI", "interno": True})
post(c_carlos, f"/api/tickets/{tid}/mensajes", {"texto": "Hola Ana, voy en camino"})
mensajes_ana = [m["texto"] for m in c_ana.get(f"/api/tickets/{tid}").json["mensajes"]]
revisar("Hola Ana, voy en camino" in mensajes_ana, "Ana ve la respuesta de TI")
revisar("Nota solo para TI" not in mensajes_ana, "Ana NO recibe las notas internas")
post(c_ana, f"/api/tickets/{tid}/mensajes", {"texto": "Truco", "interno": True})
revisar(not [m for m in c_jefe.get(f"/api/tickets/{tid}").json["mensajes"] if m.get("texto") == "Truco" and m.get("interno")],
        "Un usuario no puede crear notas internas")

print("\n6. En espera y reactivación automática")
r = post(c_carlos, f"/api/tickets/{tid}/estado", {"estado": "En espera", "motivo": "Esperando respuesta del usuario"})
revisar(r.json["estado"] == "En espera", "Carlos pone el ticket en espera")
r = post(c_ana, f"/api/tickets/{tid}/mensajes", {"texto": "Ya estoy en mi puesto"})
revisar(r.json["estado"] == "En proceso", "La respuesta de Ana reactiva el ticket")
revisar(r.json["esperas"][0]["fin"] is not None, "La pausa quedó cerrada (no cuenta en el SLA)")

print("\n7. Permisos de estado")
revisar(post(c_ana, f"/api/tickets/{tid}/estado", {"estado": "Cerrado"}).status_code == 403, "Ana no puede cerrar mientras está en proceso")
revisar(post(c_maria, f"/api/tickets/{tid}/estado", {"estado": "Resuelto"}).status_code == 403, "María no cambia tickets de Carlos")
r = post(c_carlos, f"/api/tickets/{tid}/estado", {"estado": "Resuelto", "solucion": "Se cambió el tóner"})
revisar(r.json["estado"] == "Resuelto" and any("Se cambió el tóner" in m.get("texto", "") for m in r.json["mensajes"]),
        "Carlos resuelve y deja la solución")
revisar(post(c_ana, f"/api/tickets/{tid}/calificar", {"puntos": 5}).status_code == 400, "No se califica antes de cerrar")
revisar(post(c_ana, f"/api/tickets/{tid}/estado", {"estado": "Cerrado"}).json["estado"] == "Cerrado", "Ana confirma y cierra")
revisar(post(c_luis, f"/api/tickets/{tid}/calificar", {"puntos": 1}).status_code == 403, "Luis no puede calificar tickets ajenos")
r = post(c_ana, f"/api/tickets/{tid}/calificar", {"puntos": 4, "comentario": "Rápido"})
revisar(r.json["calificacion"] == 4, "Ana califica con 4 estrellas")
revisar(post(c_ana, f"/api/tickets/{tid}/calificar", {"puntos": 1}).status_code == 400, "No se puede calificar dos veces")
revisar(r.json["tiempoAtencionMs"] >= 0 and r.json["inicioAtencion"] is None, "El cronómetro se detuvo al resolver")

print("\n8. Jefe de TI")
r = c_luis.post("/api/tickets", data={k: v for k, v in datos.items() if k != "adjunto"}, headers=CABECERA)
tid2 = r.json["id"]
revisar(post(c_carlos, f"/api/tickets/{tid2}/asignar", {"tecnicoId": maria, "prioridad": "Alta"}).status_code == 403,
        "Un analista no puede asignar")
r = post(c_jefe, f"/api/tickets/{tid2}/asignar", {"tecnicoId": maria, "prioridad": "Alta"})
revisar(r.json["tecnicoId"] == maria and r.json["estado"] == "Asignado", "El jefe asigna a María")
revisar(post(c_carlos, "/api/usuarios", {"nombre": "X", "correo": "x@e.com", "rol": "admin"}).status_code == 403,
        "Un analista no puede crear usuarios")
r = post(c_jefe, "/api/usuarios", {"nombre": "Elena Ruiz", "correo": "elena@empresa.com", "area": "Ventas", "rol": "usuario"})
clave = r.json["claveTemporal"]
revisar(len(clave) == 12, "El jefe crea un usuario con contraseña temporal")
c_elena = cliente("elena@empresa.com", clave)
revisar(c_elena.get("/api/estado").json["yo"]["debeCambiarClave"], "Elena debe cambiar su contraseña al entrar")
revisar(post(c_elena, "/api/cambiar-clave", {"actual": clave, "nueva": "corta"}).status_code == 400, "Se rechazan contraseñas débiles")
revisar(post(c_elena, "/api/cambiar-clave", {"actual": clave, "nueva": "NuevaClave2026"}).status_code == 200, "Elena cambia su contraseña")
r = c_jefe.patch(f"/api/usuarios/{luis}", json={"activo": False}, headers=CABECERA)
revisar(c_luis.get("/api/estado").status_code == 401, "Un usuario desactivado pierde el acceso al instante")
revisar(c_jefe.patch(f"/api/usuarios/{jefe}", json={"rol": "usuario"}, headers=CABECERA).status_code == 400,
        "El jefe no puede quitarse su propio rol")
revisar(c_carlos.get("/api/auditoria").status_code == 403, "Solo el jefe ve la auditoría")
revisar(any("Elena" in a["accion"] for a in c_jefe.get("/api/auditoria").json["registros"]), "La auditoría registra los cambios")

print("\n8b. Control total del administrador")
r = c_ana.post("/api/tickets", data={k: v for k, v in datos.items() if k != "adjunto"}, headers=CABECERA)
tid3 = r.json["id"]
r = post(c_jefe, f"/api/tickets/{tid3}/tomar", {"prioridad": "Alta"})
revisar(r.status_code == 200 and r.json["tecnicoId"] == jefe, "El administrador también puede tomar y atender tickets")
r = post(c_jefe, f"/api/tickets/{tid3}/transferir", {"tecnicoId": carlos, "motivo": "Es de hardware"})
revisar(r.status_code == 200, "El administrador puede transferir su ticket a un analista")
r = post(c_jefe, f"/api/tickets/{tid3}/asignar", {"tecnicoId": jefe, "prioridad": "Media"})
revisar(r.json["tecnicoId"] == jefe, "El administrador puede asignarse un ticket a sí mismo")
revisar(c_jefe.patch(f"/api/usuarios/{jefe}", json={"activo": False}, headers=CABECERA).status_code == 400,
        "El administrador no puede desactivarse a sí mismo")
r = post(c_jefe, "/api/usuarios", {"nombre": "Segundo Admin", "correo": "admin2@empresa.com", "area": "TI", "rol": "admin"})
revisar(r.status_code == 200, "El administrador puede crear otro administrador")
c_admin2 = cliente("admin2@empresa.com", r.json["claveTemporal"])
admin2 = c_admin2.get("/api/estado").json["yo"]["id"]
revisar(c_admin2.get("/api/auditoria").status_code == 200, "El segundo administrador tiene control total")
revisar(c_admin2.patch(f"/api/usuarios/{jefe}", json={"rol": "tecnico"}, headers=CABECERA).status_code == 200,
        "Un administrador puede cambiar el rol de otro administrador")
revisar(c_admin2.patch(f"/api/usuarios/{jefe}", json={"rol": "admin"}, headers=CABECERA).status_code == 200,
        "...y devolvérselo")
c_jefe.patch(f"/api/usuarios/{admin2}", json={"activo": False}, headers=CABECERA)
con_tmp = conectar(); con_tmp.execute("UPDATE usuarios SET rol = 'tecnico' WHERE id = ?", (jefe,)); con_tmp.commit()
con_tmp.execute("UPDATE usuarios SET rol = 'admin', activo = 1 WHERE id = ?", (admin2,)); con_tmp.commit(); con_tmp.close()
c_admin2 = cliente("admin2@empresa.com", r.json["claveTemporal"])
revisar(c_admin2.patch(f"/api/usuarios/{admin2}", json={"activo": False}, headers=CABECERA).status_code == 400,
        "No se puede desactivar al último administrador")
con_tmp = conectar(); con_tmp.execute("UPDATE usuarios SET rol = 'admin' WHERE id = ?", (jefe,)); con_tmp.commit(); con_tmp.close()
r = c_jefe.patch(f"/api/usuarios/{carlos}", json={"nombre": "Carlos Q.", "correo": "cq@empresa.com"}, headers=CABECERA)
revisar(r.status_code == 200 and cliente("cq@empresa.com").get("/api/estado").json["yo"]["nombre"] == "Carlos Q.",
        "El administrador puede corregir nombre y correo")
revisar(c_jefe.patch(f"/api/usuarios/{carlos}", json={"correo": "ana@empresa.com"}, headers=CABECERA).status_code == 400,
        "No se permiten correos repetidos")

print("\n8c. Correo corporativo y eliminar usuarios")
revisar(post(c_jefe, "/api/usuarios", {"nombre": "Externo", "correo": "x@gmail.com", "rol": "usuario"}).status_code == 400,
        "Solo se aceptan correos corporativos")
r = post(c_jefe, "/api/usuarios", {"nombre": "Temporal", "correo": "temporal@empresa.com", "area": "Marketing", "rol": "usuario"})
temporal = [u for u in c_jefe.get("/api/estado").json["usuarios"] if u["correo"] == "temporal@empresa.com"][0]["id"]
revisar(c_carlos.delete(f"/api/usuarios/{temporal}", headers=CABECERA).status_code == 403, "Un analista no puede eliminar usuarios")
r = c_jefe.delete(f"/api/usuarios/{temporal}", headers=CABECERA)
revisar(r.json.get("resultado") == "borrado", "Un usuario sin historial se borra por completo")
revisar(not [u for u in c_jefe.get("/api/estado").json["usuarios"] if u["id"] == temporal], "...y ya no aparece en el sistema")
revisar(c_jefe.delete(f"/api/usuarios/{jefe}", headers=CABECERA).status_code == 400, "El administrador no puede eliminarse a sí mismo")
tid4 = c_ana.post("/api/tickets", data={k: v for k, v in datos.items() if k != "adjunto"}, headers=CABECERA).json["id"]
post(c_jefe, f"/api/tickets/{tid4}/asignar", {"tecnicoId": carlos, "prioridad": "Baja"})
revisar(c_jefe.delete(f"/api/usuarios/{carlos}", headers=CABECERA).status_code == 400,
        "No se elimina a un analista con tickets abiertos (primero se reasignan)")
r = c_jefe.delete(f"/api/usuarios/{ana}", headers=CABECERA)
revisar(r.json.get("resultado") == "retirado", "Un usuario con tickets se retira, pero se conserva su historial")
revisar(c_ana.get("/api/estado").status_code == 401, "El usuario eliminado ya no puede entrar")
revisar(c_jefe.get(f"/api/tickets/{tid}").json["usuarioId"] == ana, "Sus tickets siguen en el historial")
r = post(c_jefe, "/api/usuarios", {"nombre": "Ana Torres", "correo": "ana@empresa.com", "area": "Ventas", "rol": "usuario"})
revisar(r.status_code == 200, "Si vuelve a la empresa, se recupera con su mismo historial")
revisar(len(cliente("ana@empresa.com", r.json["claveTemporal"]).get("/api/estado").json["tickets"]) >= 1, "...y ve sus tickets antiguos")

print("\n8d. TI registra tickets (llamadas, WhatsApp)")
sin_adjunto = {k: v for k, v in datos.items() if k != "adjunto"}
r = c_carlos.post("/api/tickets", data={**sin_adjunto, "solicitanteId": str(luis)}, headers=CABECERA)
revisar(r.status_code == 400, "No se registran tickets a nombre de un usuario desactivado")
r = c_carlos.post("/api/tickets", data={**sin_adjunto, "solicitanteId": str(ana), "prioridad": "Alta", "tomar": "si"}, headers=CABECERA)
revisar(r.status_code == 201 and r.json["tomado"], "El analista registra un ticket a nombre de Ana y lo atiende al instante")
t5 = c_ana.get(f"/api/tickets/{r.json['id']}").json
revisar(t5["usuarioId"] == ana and t5["tecnicoId"] == carlos and t5["estado"] == "En proceso", "Ana lo ve como suyo, atendido por Carlos")
revisar(any("a nombre de Ana Torres" in m["texto"] for m in t5["mensajes"] if m.get("sistema")), "Queda registrado quién lo creó")
r = c_jefe.post("/api/tickets", data=sin_adjunto, headers=CABECERA)
revisar(r.status_code == 201 and c_jefe.get(f"/api/tickets/{r.json['id']}").json["usuarioId"] == jefe,
        "El administrador puede crear un ticket para sí mismo")
r = c_ana.post("/api/tickets", data={**sin_adjunto, "solicitanteId": str(carlos), "prioridad": "Alta", "tomar": "si"}, headers=CABECERA)
t6 = c_ana.get(f"/api/tickets/{r.json['id']}").json
revisar(t6["usuarioId"] == ana and t6["prioridad"] is None and t6["tecnicoId"] is None,
        "Un usuario no puede crear a nombre de otro ni elegir prioridad")

print("\n8e. Sucesión: el administrador se da de baja")
con_tmp = conectar()
for fila in con_tmp.execute("SELECT id FROM usuarios WHERE rol = 'admin' AND id != ?", (jefe,)).fetchall():
    con_tmp.execute("UPDATE usuarios SET activo = 0 WHERE id = ?", (fila["id"],))   # dejamos a Jorge como único admin
con_tmp.commit(); con_tmp.close()
revisar(post(c_jefe, "/api/mi-cuenta/baja", {"confirmacion": "BAJA"}).status_code == 400,
        "Si es el único administrador, NO puede darse de baja")
revisar(post(c_carlos, "/api/mi-cuenta/baja", {"confirmacion": "BAJA"}).status_code == 403, "Un analista no usa esta opción")
revisar(c_jefe.patch(f"/api/usuarios/{carlos}", json={"rol": "admin"}, headers=CABECERA).status_code == 200,
        "El jefe nombra administrador a Carlos")
tid7 = c_ana.post("/api/tickets", data=sin_adjunto, headers=CABECERA).json["id"]
post(c_jefe, f"/api/tickets/{tid7}/tomar", {"prioridad": "Media"})
revisar(post(c_jefe, "/api/mi-cuenta/baja", {"confirmacion": "no"}).status_code == 400, "Pide escribir BAJA para confirmar")
revisar(post(c_jefe, "/api/mi-cuenta/baja", {"confirmacion": "BAJA"}).status_code == 400,
        "Si tiene tickets abiertos, debe elegir a quién pasarlos")
r = post(c_jefe, "/api/mi-cuenta/baja", {"confirmacion": "BAJA", "transferirA": carlos})
revisar(r.status_code == 200, "Con otro administrador activo, el jefe se da de baja")
revisar(c_jefe.get("/api/estado").status_code == 401, "Su sesión se cierra y ya no puede entrar")
revisar(c_carlos.get(f"/api/tickets/{tid7}").json["tecnicoId"] == carlos, "Sus tickets abiertos pasaron a Carlos")
estado_carlos = c_carlos.get("/api/estado").json
revisar(estado_carlos["yo"]["rol"] == "admin" and any("se dio de baja" in n["texto"] for n in estado_carlos["notificaciones"]),
        "Carlos queda como administrador y recibe el aviso")
revisar(post(c_carlos, "/api/mi-cuenta/baja", {"confirmacion": "BAJA", "transferirA": jefe}).status_code == 400,
        "Carlos, ahora único administrador, no puede darse de baja")
revisar(any("se dio de baja" in a["accion"] for a in c_carlos.get("/api/auditoria").json["registros"]), "Queda en la auditoría")

print("\n8c. Importar lista de trabajadores")
lista = [
    {"nombre": "Rosa Mendoza", "correo": "rosa@empresa.com", "area": "Marketing", "rol": "Usuario"},
    {"nombre": "Pedro Vargas", "correo": "Pedro@Empresa.com", "area": "Logística", "rol": ""},
    {"nombre": "Lucía Flores", "correo": "lucia@empresa.com", "area": "TI", "rol": "Analista de soporte"},
    {"nombre": "Repetida", "correo": "rosa@empresa.com", "area": "", "rol": "usuario"},
    {"nombre": "Externo Gmail", "correo": "x@gmail.com", "area": "", "rol": "usuario"},
    {"nombre": "Ana Torres", "correo": "ana@empresa.com", "area": "", "rol": "usuario"},
    {"nombre": "Rol Raro", "correo": "raro@empresa.com", "area": "", "rol": "gerente"},
]
revisar(post(c_ana, "/api/usuarios/importar", {"filas": lista}).status_code == 403, "Un usuario no puede importar")
r = post(c_carlos, "/api/usuarios/importar", {"filas": lista, "simular": True})
estados = [f["estado"] for f in r.json["filas"]]
revisar(r.status_code == 200 and estados == ["crear", "crear", "crear", "omitir", "omitir", "omitir", "omitir"],
        "La revisión marca qué se crea y qué se omite (repetidos, otro dominio, ya registrados, rol inválido)")
revisar(conectar().execute("SELECT COUNT(*) FROM usuarios WHERE correo = 'rosa@empresa.com'").fetchone()[0] == 0,
        "La revisión no crea a nadie")
r = post(c_carlos, "/api/usuarios/importar", {"filas": lista})
creados = [f for f in r.json["filas"] if f.get("claveTemporal")]
revisar(len(creados) == 3, "Se crean 3 usuarios con su contraseña temporal")
fila_lucia = conectar().execute("SELECT rol, debe_cambiar_clave FROM usuarios WHERE correo = 'lucia@empresa.com'").fetchone()
revisar(fila_lucia[0] == "tecnico" and fila_lucia[1] == 1, "«Analista de soporte» queda como analista y debe cambiar su clave")
pedro = next(f for f in creados if f["correo"] == "pedro@empresa.com")
c_pedro = app.test_client()
revisar(post(c_pedro, "/api/login", {"correo": "pedro@empresa.com", "clave": pedro["claveTemporal"]}).json["debeCambiarClave"] is True,
        "Un importado entra con su contraseña temporal y se le pide cambiarla")
revisar("Marketing" in c_carlos.get("/api/estado").json["areas"], "Las áreas nuevas de la lista se agregan solas")

print("\n9. Horario laboral (Lima: lunes a viernes 08:00 a 17:30)")
con = conectar()
cfg = logica.leer_config(con)
revisar(logica.minutos_laborales("2026-10-16T22:00:00Z", "2026-10-19T14:00:00Z", cfg) == 90,
        "Viernes 17:00 → lunes 09:00 = 1 h 30 min laborales")
revisar(logica.minutos_laborales("2026-10-07T22:00:00Z", "2026-10-09T14:00:00Z", cfg) == 90,
        "El feriado del 8 de octubre no cuenta")
revisar(logica.minutos_laborales("2026-10-17T15:00:00Z", "2026-10-19T01:00:00Z", cfg) == 0, "El fin de semana no cuenta")

print("\n10. Cierre automático y alertas de SLA")
con.execute("UPDATE tickets SET estado = 'Resuelto', resuelto = '2026-01-01T00:00:00.000Z' WHERE id = ?", (tid2,))
con.commit()
logica.revisiones_automaticas(con)
revisar(con.execute("SELECT estado FROM tickets WHERE id = ?", (tid2,)).fetchone()[0] == "Cerrado",
        "Un ticket resuelto sin respuesta en 48 h se cierra solo")
con.close()

print(f"\n✅ Todas las pruebas pasaron ({aprobadas} revisiones)\n")
