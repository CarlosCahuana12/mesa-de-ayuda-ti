// =========================================================
// FUNCIONES COMPARTIDAS POR TODAS LAS PÁGINAS
// ---------------------------------------------------------
// Sesión, horario laboral, SLA, estados, notificaciones,
// auditoría, exportación a Excel y piezas visuales.
// Se carga después de datos.js y antes del JS de cada página.
// =========================================================

const db = cargarDB();
const CLAVE_SESION = "mesaAyudaTI_demo_sesion";

function guardar() {
  guardarDB(db);
}

function cfg() {
  return db.config;
}

// Vuelve a leer la base de datos (por si otra pestaña o persona la cambió)
function refrescarDB() {
  Object.assign(db, cargarDB());
}

// =========================================================
// SESIÓN
// En la versión real, esto lo hará el inicio de sesión
// con Microsoft (Entra ID). Aquí solo lo simulamos.
// =========================================================
function usuarioActual() {
  let id = null;
  try { id = Number(localStorage.getItem(CLAVE_SESION)); } catch (error) {}
  return db.usuarios.find(u => u.id === id && u.activo) || null;
}

function iniciarSesion(id) {
  try { localStorage.setItem(CLAVE_SESION, id); } catch (error) {}
  location.href = paginaInicio(buscarUsuario(id));
}

function cerrarSesion() {
  try { localStorage.removeItem(CLAVE_SESION); } catch (error) {}
  location.href = "index.html";
}

function paginaInicio(usuario) {
  return { usuario: "usuario.html", tecnico: "tecnico.html", admin: "admin.html" }[usuario.rol];
}

// Protege la página: si no hay sesión o el rol no tiene permiso, redirige.
function requerirSesion(rolesPermitidos) {
  const usuario = usuarioActual();
  if (!usuario) {
    location.href = "index.html";
    throw new Error("Sin sesión");
  }
  if (rolesPermitidos && !rolesPermitidos.includes(usuario.rol)) {
    location.href = paginaInicio(usuario);
    throw new Error("Sin permiso");
  }
  return usuario;
}

// =========================================================
// BÚSQUEDAS
// =========================================================
function buscarUsuario(id) { return db.usuarios.find(u => u.id === id); }
function nombreUsuario(id) { const u = buscarUsuario(id); return u ? u.nombre : "—"; }
// Equipo que atiende tickets: analistas y administradores
function listaTecnicos() { return db.usuarios.filter(u => (u.rol === "tecnico" || u.rol === "admin") && u.activo); }
function nombreConRol(u) { return u.rol === "admin" ? `${u.nombre} (Administrador)` : u.nombre; }
function buscarTicket(id) { return db.tickets.find(t => t.id === id); }
function estaAbierto(t) { return !["Resuelto", "Cerrado"].includes(t.estado); }

// El usuario solo ve los suyos; el técnico ve sus asignados y los libres
function puedeVerTicket(usuario, ticket) {
  if (usuario.rol === "admin") return true;
  if (usuario.rol === "tecnico") return ticket.tecnicoId === usuario.id || !ticket.tecnicoId;
  return ticket.usuarioId === usuario.id;
}

// =========================================================
// FORMATOS
// =========================================================
function formatearFecha(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
  });
}

// Fecha local en formato 2026-10-17 (sin problemas de zona horaria)
function fechaISOLocal(fecha) {
  const d = new Date(fecha);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function minutosATexto(minutos) {
  const min = Math.round(Math.abs(minutos));
  if (min < 60) return min + " min";
  const horas = Math.floor(min / 60);
  if (horas < 24) return horas + " h" + (min % 60 ? " " + (min % 60) + " min" : "");
  const dias = Math.floor(horas / 24);
  return dias + (dias === 1 ? " día" : " días");
}

// Para tiempos laborales: nunca habla de "días" (un día laboral no son 24 h)
function duracionLaboral(minutos) {
  const min = Math.round(Math.abs(minutos));
  if (min < 60) return min + " min";
  const horas = Math.floor(min / 60);
  return horas + " h" + (min % 60 ? " " + (min % 60) + " min" : "");
}

function tiempoRelativo(iso) {
  const min = (Date.now() - new Date(iso).getTime()) / 60000;
  return min < 1 ? "ahora" : "hace " + minutosATexto(min);
}

// Evita que alguien escriba código HTML en un mensaje y rompa la página
function escaparHTML(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML;
}

// "En proceso" -> "en-proceso" (para usarlo como clase CSS)
function aClase(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-");
}

function iniciales(nombre) {
  // Solo palabras con mayúscula: "Jefe de TI" -> "JT"
  const palabras = nombre.split(" ").filter(p => p && p[0] === p[0].toUpperCase());
  return (palabras.length ? palabras : nombre.split(" ")).map(p => p[0]).slice(0, 2).join("");
}

function etiquetaEstado(estado) {
  const icono = estado === "En espera" ? "⏸ " : "";
  return `<span class="etiqueta estado-${aClase(estado)}">${icono}${estado}</span>`;
}

function etiquetaPrioridad(prioridad) {
  return prioridad
    ? `<span class="etiqueta prioridad-${aClase(prioridad)}">${prioridad}</span>`
    : `<span class="etiqueta sin-clasificar">Sin clasificar</span>`;
}

function estrellas(n) {
  if (!n) return '<span class="tenue">Sin calificar</span>';
  return `<span class="estrellas-fijas" title="${n} de 5">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
}

// =========================================================
// HORARIO LABORAL
// El SLA solo cuenta minutos dentro del horario de atención:
// no cuenta noches, fines de semana ni feriados.
// =========================================================
function horaAMinutos(texto) {
  const [h, m] = texto.split(":").map(Number);
  return h * 60 + m;
}

function esFeriado(fecha) {
  return cfg().feriados.some(f => f.fecha === fechaISOLocal(fecha));
}

function esDiaLaboral(fecha) {
  return cfg().horario.dias.includes(new Date(fecha).getDay()) && !esFeriado(fecha);
}

// Devuelve [apertura, cierre] de un día
function ventanaDelDia(dia) {
  const apertura = new Date(dia);
  apertura.setHours(0, horaAMinutos(cfg().horario.inicio), 0, 0);
  const cierre = new Date(dia);
  cierre.setHours(0, horaAMinutos(cfg().horario.fin), 0, 0);
  return [apertura, cierre];
}

// Minutos laborales entre dos fechas
function minutosLaborales(desde, hasta) {
  desde = new Date(desde);
  hasta = new Date(hasta);
  if (!(hasta > desde)) return 0;

  let total = 0;
  const dia = new Date(desde);
  dia.setHours(0, 0, 0, 0);
  let vueltas = 0;
  while (dia < hasta && vueltas++ < 800) {
    if (esDiaLaboral(dia)) {
      const [apertura, cierre] = ventanaDelDia(dia);
      const inicio = Math.max(apertura, desde);
      const fin = Math.min(cierre, hasta);
      if (fin > inicio) total += (fin - inicio) / 60000;
    }
    dia.setDate(dia.getDate() + 1);
  }
  return total;
}

function enHorarioLaboral(fecha = new Date()) {
  if (!esDiaLaboral(fecha)) return false;
  const [apertura, cierre] = ventanaDelDia(fecha);
  return fecha >= apertura && fecha < cierre;
}

function proximaApertura(desde = new Date()) {
  if (enHorarioLaboral(desde)) return desde;
  const dia = new Date(desde);
  dia.setHours(0, 0, 0, 0);
  for (let i = 0; i < 30; i++) {
    if (esDiaLaboral(dia)) {
      const [apertura] = ventanaDelDia(dia);
      if (apertura > desde) return apertura;
    }
    dia.setDate(dia.getDate() + 1);
  }
  return null;
}

function textoProximaApertura() {
  const f = proximaApertura();
  if (!f) return "";
  const esHoy = fechaISOLocal(f) === fechaISOLocal(new Date());
  const hora = f.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
  return esHoy ? `hoy a las ${hora}` : `el ${DIAS_SEMANA[f.getDay()].toLowerCase()} ${f.getDate()} a las ${hora}`;
}

function textoHorario() {
  const { dias, inicio, fin } = cfg().horario;
  const ordenados = [...dias].sort();
  let textoDias;
  if (ordenados.join() === "1,2,3,4,5") textoDias = "Lunes a viernes";
  else if (ordenados.join() === "1,2,3,4,5,6") textoDias = "Lunes a sábado";
  else textoDias = ordenados.map(d => DIAS_SEMANA[d]).join(", ");
  return `${textoDias}, de ${inicio} a ${fin}`;
}

// =========================================================
// SLA (acuerdo de nivel de servicio)
// - Respuesta: desde que se crea hasta que se empieza a atender.
// - Solución:  desde que se crea hasta que se resuelve,
//              descontando el tiempo "En espera".
// Ambos en minutos laborales.
// =========================================================
function minutosEnEspera(t) {
  return (t.esperas || []).reduce((suma, e) => suma + minutosLaborales(e.inicio, e.fin || new Date()), 0);
}

function evaluarSLA(usados, limite, terminado, pausa) {
  if (terminado) {
    const ok = usados <= limite;
    return { clase: ok ? "sla-ok" : "sla-vencido", texto: ok ? "Cumplido" : "Incumplido", cumplido: ok, vencido: !ok, terminado: true };
  }
  const restante = limite - usados;
  const r = restante < 0
    ? { clase: "sla-vencido", texto: "Vencido hace " + duracionLaboral(restante), vencido: true }
    : { clase: restante < limite * 0.25 ? "sla-riesgo" : "sla-ok", texto: "Quedan " + duracionLaboral(restante) };
  if (pausa) {
    r.texto += " ⏸";
    r.pausa = pausa;
  }
  return r;
}

function slaRespuesta(t) {
  if (!t.prioridad) return null;
  const usados = minutosLaborales(t.creado, t.atendido || new Date());
  const pausa = !t.atendido && !enHorarioLaboral() ? "Fuera de horario" : null;
  return evaluarSLA(usados, cfg().sla.respuesta[t.prioridad], !!t.atendido, pausa);
}

function slaSolucion(t) {
  if (!t.prioridad) return null;
  const usados = minutosLaborales(t.creado, t.resuelto || new Date()) - minutosEnEspera(t);
  let pausa = null;
  if (t.estado === "En espera") pausa = "Ticket en espera";
  else if (!t.resuelto && !enHorarioLaboral()) pausa = "Fuera de horario";
  return evaluarSLA(usados, cfg().sla.solucion[t.prioridad], !!t.resuelto, pausa);
}

// Para las tablas: muestra el SLA que importa en este momento
function infoSLA(t) {
  if (!t.prioridad) {
    const espera = minutosLaborales(t.creado, new Date());
    return { clase: "sla-pendiente", texto: "Por clasificar · " + duracionLaboral(espera) };
  }
  if (!t.atendido) {
    const r = slaRespuesta(t);
    return { ...r, texto: "Respuesta: " + r.texto };
  }
  const s = slaSolucion(t);
  return { ...s, texto: "Solución: " + s.texto };
}

function etiquetaSLA(t) {
  const sla = infoSLA(t);
  const ayuda = sla.pausa ? `Pausado: ${sla.pausa}` : "Tiempo en horario laboral";
  return `<span class="etiqueta ${sla.clase}" title="${ayuda}">⏱ ${sla.texto}</span>`;
}

function etiquetaSLADetalle(sla) {
  if (!sla) return '<span class="tenue">Sin prioridad</span>';
  const ayuda = sla.pausa ? ` <small class="tenue">(${sla.pausa})</small>` : "";
  return `<span class="etiqueta ${sla.clase}">⏱ ${sla.texto}</span>${ayuda}`;
}

// Orden de atención: sin clasificar y Alta primero; luego los más antiguos
function ordenarPorUrgencia(a, b) {
  const peso = { Alta: 0, Media: 1, Baja: 2 };
  const pa = a.prioridad ? peso[a.prioridad] : -1;
  const pb = b.prioridad ? peso[b.prioridad] : -1;
  if (pa !== pb) return pa - pb;
  return new Date(a.creado) - new Date(b.creado);
}

// =========================================================
// TIEMPO DE ATENCIÓN (cronómetro, en tiempo real)
// Corre solo en "En proceso". Se pausa en espera, al resolver
// o al transferir. Si se reabre, sigue sumando.
// =========================================================
function tiempoAtencionMs(t) {
  const corriendo = t.inicioAtencion ? Date.now() - new Date(t.inicioAtencion).getTime() : 0;
  return (t.tiempoAtencionMs || 0) + corriendo;
}

function pausarCronometro(t) {
  if (!t.inicioAtencion) return;
  t.tiempoAtencionMs = tiempoAtencionMs(t);
  t.inicioAtencion = null;
}

function formatoCrono(ms) {
  const totalSeg = Math.floor(ms / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
}

function etiquetaAtencion(t) {
  if (!t.atendido) return '<span class="tenue">Sin iniciar</span>';
  if (t.inicioAtencion) {
    return `<span class="crono activo">⏱ <span data-crono="${t.id}">${formatoCrono(tiempoAtencionMs(t))}</span></span>`;
  }
  const pausado = t.estado === "En espera" ? " ⏸" : "";
  return `<span class="crono">⏱ ${formatoCrono(tiempoAtencionMs(t))}${pausado}</span>`;
}

function actualizarCronos() {
  document.querySelectorAll("[data-crono]").forEach(el => {
    const t = buscarTicket(Number(el.dataset.crono));
    if (t) el.textContent = formatoCrono(tiempoAtencionMs(t));
  });
}

// =========================================================
// ACCIONES SOBRE TICKETS
// =========================================================
function siguienteCodigo() {
  db.contador += 1;
  return "TKC-" + String(db.contador).padStart(4, "0");
}

function agregarEvento(t, texto) {
  const ahora = new Date().toISOString();
  t.mensajes.push({ sistema: true, texto, fecha: ahora });
  t.actualizado = ahora;
}

function crearNotificacion(usuarioId, texto, ticketId) {
  db.notificaciones.push({
    id: "n" + Date.now() + Math.floor(Math.random() * 100000),
    usuarioId, texto, ticketId,
    fecha: new Date().toISOString(),
    leida: false
  });
}

function notificarAdmins(texto, ticketId) {
  db.usuarios.filter(u => u.rol === "admin" && u.activo).forEach(a => crearNotificacion(a.id, texto, ticketId));
}

function asignarTicket(t, tecnicoId, prioridad, quien) {
  const cambioTecnico = t.tecnicoId !== tecnicoId;
  if (cambioTecnico) pausarCronometro(t);
  t.tecnicoId = tecnicoId;
  t.prioridad = prioridad;
  if (t.estado === "Nuevo") t.estado = "Asignado";

  agregarEvento(t, `${quien.nombre} asignó el ticket a ${nombreUsuario(tecnicoId)} con prioridad ${prioridad}`);
  if (cambioTecnico) {
    crearNotificacion(tecnicoId, `Se te asignó ${t.codigo}: ${t.asunto}`, t.id);
    crearNotificacion(t.usuarioId, `Tu ticket ${t.codigo} fue asignado a ${nombreUsuario(tecnicoId)}`, t.id);
  }
  guardar();
}

// El analista toma un ticket libre: se lo asigna, pone la prioridad
// y empieza la atención de inmediato (sin esperar al jefe)
function tomarTicket(t, tecnico, prioridad) {
  const ahora = new Date().toISOString();
  t.tecnicoId = tecnico.id;
  t.prioridad = prioridad;
  t.estado = "En proceso";
  t.atendido = t.atendido || ahora;
  t.inicioAtencion = ahora;

  agregarEvento(t, `${tecnico.nombre} tomó el ticket con prioridad ${prioridad} e inició la atención`);
  crearNotificacion(t.usuarioId, `${tecnico.nombre} está atendiendo tu ticket ${t.codigo}`, t.id);
  notificarAdmins(`${tecnico.nombre} tomó ${t.codigo} (prioridad ${prioridad})`, t.id);
  guardar();
}

function cerrarEspera(t, fecha) {
  const abierta = (t.esperas || []).find(e => !e.fin);
  if (abierta) abierta.fin = fecha;
}

// El analista pasa el ticket a un compañero
function transferirTicket(t, nuevoTecnicoId, quien, motivo) {
  const ahora = new Date().toISOString();
  pausarCronometro(t);
  if (t.estado === "En espera") cerrarEspera(t, ahora);
  t.tecnicoId = nuevoTecnicoId;
  t.estado = "Asignado";

  agregarEvento(t, `${quien.nombre} transfirió el ticket a ${nombreUsuario(nuevoTecnicoId)}`);
  if (motivo) {
    t.mensajes.push({ autorId: quien.id, texto: "🔁 Motivo de la transferencia: " + motivo, fecha: ahora, interno: true });
  }
  crearNotificacion(nuevoTecnicoId, `${quien.nombre} te transfirió ${t.codigo}: ${t.asunto}`, t.id);
  notificarAdmins(`${quien.nombre} transfirió ${t.codigo} a ${nombreUsuario(nuevoTecnicoId)}`, t.id);
  guardar();
}

// motivo: solo se usa al pasar a "En espera"
function cambiarEstado(t, nuevoEstado, quien, motivo) {
  const ahora = new Date().toISOString();
  if (t.estado === "En espera" && nuevoEstado !== "En espera") cerrarEspera(t, ahora);
  t.estado = nuevoEstado;

  // Cronómetro: corre solo en "En proceso"
  if (nuevoEstado === "En proceso") {
    if (!t.inicioAtencion) t.inicioAtencion = ahora;
    if (!t.atendido) t.atendido = ahora;
    t.resuelto = null;
    t.cerrado = null;
  } else {
    pausarCronometro(t);
  }

  if (nuevoEstado === "En espera") {
    t.esperas = t.esperas || [];
    t.esperas.push({ inicio: ahora, fin: null, motivo: motivo || "Otro" });
  }
  if (nuevoEstado === "Resuelto") t.resuelto = ahora;
  if (nuevoEstado === "Cerrado") {
    t.resuelto = t.resuelto || ahora;
    t.cerrado = ahora;
  }

  const texto = nuevoEstado === "En espera"
    ? `${quien.nombre} puso el ticket en espera: ${motivo || "Otro"}`
    : `${quien.nombre} cambió el estado a "${nuevoEstado}"`;
  agregarEvento(t, texto);

  if (quien.id !== t.usuarioId) {
    const aviso = nuevoEstado === "En espera"
      ? `Tu ticket ${t.codigo} está en espera: ${motivo}`
      : `Tu ticket ${t.codigo} ahora está: ${nuevoEstado}`;
    crearNotificacion(t.usuarioId, aviso, t.id);
  } else if (t.tecnicoId) {
    crearNotificacion(t.tecnicoId, `${quien.nombre} marcó ${t.codigo} como: ${nuevoEstado}`, t.id);
  }
  guardar();
}

function calificarTicket(t, puntos, comentario, quien) {
  t.calificacion = puntos;
  t.comentarioCalificacion = comentario;
  agregarEvento(t, `${quien.nombre} calificó la atención con ${puntos} ★`);
  if (t.tecnicoId) crearNotificacion(t.tecnicoId, `${quien.nombre} calificó ${t.codigo} con ${puntos} ★`, t.id);
  guardar();
}

// =========================================================
// REVISIONES AUTOMÁTICAS (al abrir cualquier página)
// En la versión real, el servidor las hará cada minuto.
// =========================================================
function revisionesAutomaticas() {
  const ahora = Date.now();

  db.tickets.forEach(t => {
    // 1. Cierre automático si el usuario no confirma
    if (t.estado === "Resuelto" && t.resuelto) {
      const limite = new Date(t.resuelto).getTime() + cfg().autocierreHoras * 3600000;
      if (ahora > limite) {
        t.estado = "Cerrado";
        t.cerrado = new Date().toISOString();
        agregarEvento(t, `Cerrado automáticamente: no hubo respuesta en ${cfg().autocierreHoras} h`);
        crearNotificacion(t.usuarioId, `Tu ticket ${t.codigo} se cerró automáticamente`, t.id);
      }
    }

    // 2. Alerta de SLA vencido (una vez por etapa: respuesta y solución)
    if (estaAbierto(t) && t.prioridad) {
      const etapa = t.atendido ? "solucion" : "respuesta";
      if (infoSLA(t).vencido && t.alertaSLA !== etapa) {
        t.alertaSLA = etapa;
        const texto = `⚠️ SLA de ${etapa === "solucion" ? "solución" : "respuesta"} vencido en ${t.codigo}`;
        notificarAdmins(texto, t.id);
        if (t.tecnicoId) crearNotificacion(t.tecnicoId, texto, t.id);
      }
    }
  });
  guardar();
}

// =========================================================
// AUDITORÍA: quién cambió qué y cuándo
// =========================================================
function registrarAuditoria(quien, modulo, accion) {
  db.auditoria.push({ fecha: new Date().toISOString(), usuarioId: quien.id, modulo, accion });
}

// Une los eventos de todos los tickets con los cambios de configuración
function listaAuditoria() {
  const deTickets = db.tickets.flatMap(t =>
    t.mensajes.filter(m => m.sistema).map(m => ({ fecha: m.fecha, modulo: t.codigo, ticketId: t.id, accion: m.texto })));
  const deConfig = db.auditoria.map(a => ({ ...a, accion: `${nombreUsuario(a.usuarioId)}: ${a.accion}` }));
  return [...deTickets, ...deConfig].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

// =========================================================
// EXPORTAR A EXCEL
// Usa la librería SheetJS si está cargada; si no hay internet,
// descarga un CSV (solo la primera hoja) que también abre Excel.
// =========================================================
function filasParaExcel(lista) {
  return lista.map(t => {
    const sr = slaRespuesta(t);
    const ss = slaSolucion(t);
    return {
      "Código": t.codigo,
      "Asunto": t.asunto,
      "Categoría": t.categoria,
      "Subcategoría": t.subcategoria,
      "Estado": t.estado,
      "Prioridad": t.prioridad || "Sin clasificar",
      "Solicitante": nombreUsuario(t.usuarioId),
      "Área": (buscarUsuario(t.usuarioId) || {}).area || "",
      "Técnico": t.tecnicoId ? nombreUsuario(t.tecnicoId) : "Sin asignar",
      "Creado": formatearFecha(t.creado),
      "Atendido": formatearFecha(t.atendido),
      "Resuelto": formatearFecha(t.resuelto),
      "Cerrado": formatearFecha(t.cerrado),
      "SLA respuesta": sr ? sr.texto.replace(" ⏸", "") : "",
      "SLA solución": ss ? ss.texto.replace(" ⏸", "") : "",
      "Tiempo de atención": t.atendido ? formatoCrono(tiempoAtencionMs(t)) : "",
      "Tiempo en espera (laboral)": t.esperas && t.esperas.length ? duracionLaboral(minutosEnEspera(t)) : "",
      "Calificación": t.calificacion || "",
      "Comentario": t.comentarioCalificacion || ""
    };
  });
}

// hojasExtra: [{ nombre: "Rendimiento", filas: [...] }]
function exportarExcel(filas, nombreArchivo, hojasExtra = []) {
  if (!filas.length) {
    mostrarAviso("No hay tickets para exportar");
    return;
  }
  if (window.XLSX) {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), "Tickets");
    hojasExtra.forEach(h => {
      if (h.filas.length) XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(h.filas), h.nombre);
    });
    XLSX.writeFile(libro, nombreArchivo + ".xlsx");
  } else {
    const columnas = Object.keys(filas[0]);
    const lineas = [columnas.join(";")].concat(
      filas.map(f => columnas.map(c => `"${String(f[c] ?? "").replace(/"/g, '""')}"`).join(";"))
    );
    const archivo = new Blob(["﻿" + lineas.join("\n")], { type: "text/csv;charset=utf-8" });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(archivo);
    enlace.download = nombreArchivo + ".csv";
    enlace.click();
  }
  mostrarAviso("📥 Archivo descargado");
}

// =========================================================
// PIEZAS VISUALES REUTILIZABLES
// =========================================================
function mostrarAviso(texto) {
  const aviso = document.createElement("div");
  aviso.className = "aviso";
  aviso.textContent = texto;
  document.body.appendChild(aviso);
  setTimeout(() => aviso.classList.add("visible"), 10);
  setTimeout(() => {
    aviso.classList.remove("visible");
    setTimeout(() => aviso.remove(), 300);
  }, 2800);
}

function tarjetaKPI(valor, texto, clase = "") {
  return `<div class="kpi ${clase}"><span class="kpi-valor">${valor}</span><span class="kpi-texto">${texto}</span></div>`;
}

// Gráfico de barras horizontales hecho solo con HTML y CSS
function graficoBarras(datos) {
  if (!datos.length) return '<p class="vacio">Sin datos en este periodo</p>';
  const maximo = Math.max(1, ...datos.map(d => d.valor));
  return datos.map(d => `
    <div class="barra-fila">
      <span class="barra-etiqueta">${d.etiqueta}</span>
      <div class="barra-pista"><div class="barra-relleno ${d.clase || ""}" style="width:${(d.valor / maximo) * 100}%"></div></div>
      <span class="barra-valor">${d.valor}</span>
    </div>`).join("");
}

// Fila "Mostrar más" para tablas largas (empresas con muchos tickets)
function filaMostrarMas(columnas, mostrados, total) {
  if (mostrados >= total) return "";
  return `<tr><td colspan="${columnas}" class="mostrar-mas">
    <button class="btn btn-secundario btn-chico" data-mostrar-mas>Mostrar más (${mostrados} de ${total})</button>
  </td></tr>`;
}

function porcentaje(parte, total) {
  return total ? Math.round((parte / total) * 100) + "%" : "—";
}

function promedio(lista) {
  return lista.length ? lista.reduce((a, b) => a + b, 0) / lista.length : null;
}

// =========================================================
// MENÚ LATERAL Y BARRA SUPERIOR
// =========================================================
const MENUS = {
  usuario: [
    { href: "usuario.html",      icono: "📋", texto: "Mis tickets",          clave: "mis-tickets" },
    { href: "nuevo-ticket.html", icono: "➕", texto: "Nuevo ticket",         clave: "nuevo" },
    { href: "conocimiento.html", icono: "📚", texto: "Base de conocimiento", clave: "conocimiento" }
  ],
  tecnico: [
    { href: "tecnico.html",             icono: "🛠️", texto: "Mi bandeja",           clave: "asignados" },
    { href: "tecnico.html#disponibles", icono: "📥", texto: "Tickets disponibles",  clave: "disponibles" },
    { href: "nuevo-ticket.html",        icono: "➕", texto: "Nuevo ticket",         clave: "nuevo" },
    { href: "conocimiento.html",        icono: "📚", texto: "Base de conocimiento", clave: "conocimiento" }
  ],
  admin: [
    { href: "admin.html",             icono: "📊", texto: "Panel y reportes",     clave: "panel" },
    { href: "tecnico.html",           icono: "🛠️", texto: "Mi bandeja",           clave: "asignados" },
    { href: "nuevo-ticket.html",      icono: "➕", texto: "Nuevo ticket",         clave: "nuevo" },
    { href: "admin.html#sin-asignar", icono: "📥", texto: "Sin asignar",          clave: "sin-asignar" },
    { href: "admin.html#todos",       icono: "🗂️", texto: "Todos los tickets",    clave: "todos" },
    { href: "conocimiento.html",      icono: "📚", texto: "Base de conocimiento", clave: "conocimiento" },
    { href: "configuracion.html",     icono: "⚙️", texto: "Configuración",        clave: "configuracion" }
  ]
};

function construirLayout(usuario, paginaActiva) {
  const menu = document.getElementById("menu");
  menu.innerHTML = `
    <div class="marca"><div class="marca-logo"><img src="img/logo.png" alt="Logo"></div><div class="marca-texto">${escaparHTML(NOMBRE_SISTEMA)}<small>Mesa de ayuda</small></div></div>
    <nav>
      ${MENUS[usuario.rol].map(m => `
        <a href="${m.href}" class="${m.clave === paginaActiva ? "activo" : ""}">
          <span class="menu-icono">${m.icono}</span>${m.texto}
        </a>`).join("")}
    </nav>
    <div class="pie-menu">
      <p class="horario-menu">🕗 ${textoHorario()}</p>
      <button class="btn btn-fantasma btn-chico" id="btnReiniciar">↺ Reiniciar datos demo</button>
    </div>`;

  document.getElementById("btnReiniciar").addEventListener("click", () => {
    if (confirm("¿Borrar los cambios y volver a los datos de ejemplo?")) {
      reiniciarDB();
      location.reload();
    }
  });

  const barra = document.getElementById("barra");
  barra.innerHTML = `
    <button class="boton-menu" id="btnMenu" aria-label="Abrir menú">☰</button>
    <h1>${document.body.dataset.titulo || ""}</h1>
    <span class="indicador-horario" id="indHorario"></span>
    <div class="reloj" title="Hora actual">
      <strong id="relojHora"></strong>
      <small id="relojFecha"></small>
    </div>
    <button class="btn-icono btn-tema" id="btnTema" title="Cambiar tema claro / oscuro"></button>
    <div class="campana">
      <button class="btn-icono" id="btnCampana" aria-label="Notificaciones">🔔<span class="contador" id="contadorNotif"></span></button>
      <div class="panel-notif" id="panelNotif"></div>
    </div>
    <div class="perfil">
      <div class="avatar">${iniciales(usuario.nombre)}</div>
      <div class="perfil-texto"><strong>${usuario.nombre}</strong><small>${ROLES[usuario.rol]}</small></div>
    </div>
    <button class="btn btn-secundario btn-chico" id="btnSalir">Salir</button>`;

  document.getElementById("btnSalir").addEventListener("click", cerrarSesion);
  document.getElementById("btnTema").addEventListener("click", alternarTema);
  // Cada persona conserva su tema en cualquier computadora
  if (usuario.tema && usuario.tema !== temaActual()) aplicarTema(usuario.tema);
  pintarBotonesTema();
  prepararMenuMovil(menu);
  document.getElementById("btnCampana").addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("panelNotif").classList.toggle("visible");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".campana")) document.getElementById("panelNotif").classList.remove("visible");
  });

  pintarNotificaciones(usuario);
  actualizarReloj();
}

// ---------- Reloj e indicador de horario ----------
function actualizarReloj() {
  const hora = document.getElementById("relojHora");
  if (!hora) return;
  const ahora = new Date();
  hora.textContent = ahora.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  document.getElementById("relojFecha").textContent =
    ahora.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

  const indicador = document.getElementById("indHorario");
  const abierto = enHorarioLaboral(ahora);
  indicador.className = "indicador-horario " + (abierto ? "abierto" : "cerrado");
  indicador.textContent = abierto ? "🟢 En horario" : "🌙 Fuera de horario";
  indicador.title = abierto ? textoHorario() : `Atención: ${textoHorario()}. Reabre ${textoProximaApertura()}`;
}

setInterval(() => {
  actualizarReloj();
  actualizarCronos();
}, 1000);

// Resalta en el menú la sección actual según el # de la dirección
function marcarMenuPorHash(claveInicial) {
  const actual = location.hash.slice(1) || claveInicial;
  document.querySelectorAll("#menu nav a").forEach(a => {
    const [pagina, clave] = a.getAttribute("href").split("#");
    if (!location.pathname.endsWith(pagina)) return;
    a.classList.toggle("activo", (clave || claveInicial) === actual);
  });
}

function pintarNotificaciones(usuario) {
  const mias = db.notificaciones
    .filter(n => n.usuarioId === usuario.id)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const sinLeer = mias.filter(n => !n.leida).length;

  const contador = document.getElementById("contadorNotif");
  contador.textContent = sinLeer > 99 ? "99+" : sinLeer;
  contador.style.display = sinLeer ? "flex" : "none";

  const panel = document.getElementById("panelNotif");
  panel.innerHTML = `
    <div class="panel-notif-cabecera">
      <strong>Notificaciones</strong>
      ${sinLeer ? '<button class="enlace" id="btnLeerTodas">Marcar todas como leídas</button>' : ""}
    </div>
    ${mias.length
      ? mias.slice(0, 20).map(n => `
        <a href="${n.ticketId ? "ticket.html?id=" + n.ticketId : "#"}" class="notif ${n.leida ? "" : "no-leida"}" data-id="${n.id}">
          <span>${escaparHTML(n.texto)}</span>
          <small>${tiempoRelativo(n.fecha)}</small>
        </a>`).join("")
      : '<p class="vacio">No tienes notificaciones</p>'}`;

  panel.querySelectorAll(".notif").forEach(enlace => {
    enlace.addEventListener("click", () => {
      const n = db.notificaciones.find(x => x.id === enlace.dataset.id);
      if (n) { n.leida = true; guardar(); }
    });
  });

  const botonLeer = document.getElementById("btnLeerTodas");
  if (botonLeer) {
    botonLeer.addEventListener("click", (e) => {
      e.stopPropagation();
      mias.forEach(n => n.leida = true);
      guardar();
      pintarNotificaciones(usuario);
    });
  }
}

// =========================================================
// Al abrir cualquier página revisamos cierres automáticos y SLA.
// (Funciona aunque las funciones estén definidas más arriba o abajo:
//  JavaScript "sube" las declaraciones de función al inicio.)
// =========================================================
revisionesAutomaticas();

// =========================================================
// TEMA CLARO / OSCURO
// =========================================================
function temaActual() {
  return document.documentElement.dataset.tema === "oscuro" ? "oscuro" : "claro";
}

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  try { localStorage.setItem("tema", tema); } catch (error) {}
  pintarBotonesTema();
}

function pintarBotonesTema() {
  const oscuro = temaActual() === "oscuro";
  document.querySelectorAll(".btn-tema").forEach(b => {
    b.textContent = oscuro ? "☀️" : "🌙";
    b.title = oscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
  });
}

function alternarTema() {
  const nuevo = temaActual() === "oscuro" ? "claro" : "oscuro";
  aplicarTema(nuevo);
  const u = typeof usuarioActual === "function" && usuarioActual();
  if (u) { u.tema = nuevo; guardar(); }
}

document.addEventListener("DOMContentLoaded", () => {
  const flotante = document.getElementById("btnTemaFlotante");
  if (flotante) flotante.addEventListener("click", alternarTema);
  pintarBotonesTema();
});

// =========================================================
// MENÚ EN CELULAR: botón ✕, tocar fuera para cerrar y
// se cierra solo al elegir una opción
// =========================================================
function prepararMenuMovil(menu) {
  const marca = menu.querySelector(".marca");
  if (marca && !marca.querySelector(".cerrar-menu")) {
    marca.insertAdjacentHTML("beforeend", '<button class="cerrar-menu" type="button" aria-label="Cerrar menú">✕</button>');
  }
  let fondo = document.getElementById("fondoMenu");
  if (!fondo) {
    fondo = document.createElement("div");
    fondo.id = "fondoMenu";
    fondo.className = "fondo-menu";
    document.body.appendChild(fondo);
  }
  const abrir = () => { menu.classList.add("abierto"); document.body.classList.add("menu-visible"); };
  const cerrar = () => { menu.classList.remove("abierto"); document.body.classList.remove("menu-visible"); };
  cerrar();
  document.getElementById("btnMenu").addEventListener("click", () => menu.classList.contains("abierto") ? cerrar() : abrir());
  menu.querySelector(".cerrar-menu").addEventListener("click", cerrar);
  fondo.addEventListener("click", cerrar);
  menu.querySelectorAll("nav a").forEach(a => a.addEventListener("click", cerrar));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
}
