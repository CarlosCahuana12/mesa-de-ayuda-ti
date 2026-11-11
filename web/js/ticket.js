// =========================================================
// PÁGINA: DETALLE DEL TICKET (ticket.html?id=...)
// La usan los 3 roles, pero cada uno ve acciones distintas.
// El ticket (con su chat) se pide al servidor y se actualiza
// solo cada 20 segundos.
// =========================================================

const yo = requerirSesion();
const esEquipoTI = yo.rol !== "usuario";
const idTicket = Number(new URLSearchParams(location.search).get("id"));
let t = null;

const menuActivo = { usuario: "mis-tickets", tecnico: "asignados", admin: "todos" }[yo.rol];
construirLayout(yo, menuActivo);

// Para el usuario: ¿está mostrando el formulario de calificación?
let mostrandoEncuesta = false;

async function iniciarTicket() {
  try {
    t = await api("/api/tickets/" + idTicket);
  } catch (error) {
    document.getElementById("sinAcceso").hidden = false;
    document.getElementById("btnVolverInicio").href = paginaInicio(yo);
    return;
  }
  document.getElementById("vistaTicket").hidden = false;
  document.title = t.codigo + " - " + NOMBRE_SISTEMA;
  configurarChat();
  pintarTodo();
  revisarNotificaciones();
  setInterval(actualizarDesdeServidor, 20000);
}

// Trae cambios hechos por otras personas (mensajes nuevos, cambios de estado)
async function actualizarDesdeServidor() {
  const nuevo = await api("/api/tickets/" + idTicket).catch(() => null);
  if (!nuevo) return;
  const cambioEstado = nuevo.estado !== t.estado || nuevo.tecnicoId !== t.tecnicoId;
  const mensajesNuevos = nuevo.mensajes.length !== t.mensajes.length;
  t = nuevo;
  sincronizar();
  if (mensajesNuevos) pintarMensajes();
  if (cambioEstado) {
    pintarCabecera();
    pintarAcciones();
  }
  pintarInfo();
}

// Recibe el ticket actualizado que devuelve el servidor después de una acción
function aplicar(respuesta, aviso) {
  if (!respuesta) return false;
  if (respuesta.sinAcceso) {
    location.href = paginaInicio(yo);
    return false;
  }
  t = respuesta;
  if (aviso) mostrarAviso(aviso);
  pintarTodo();
  return true;
}

// Mantiene la copia de la lista general al día (la usan los cronómetros)
function sincronizar() {
  const i = db.tickets.findIndex(x => x.id === t.id);
  if (i >= 0) db.tickets[i] = t;
  else db.tickets.push(t);
}

function pintarTodo() {
  sincronizar();
  pintarCabecera();
  pintarMensajes();
  pintarInfo();
  pintarAcciones();
}

function horasParaAutocierre() {
  const limite = new Date(t.resuelto).getTime() + cfg().autocierreHoras * 3600000;
  return Math.max(0, (limite - Date.now()) / 3600000);
}

function esperaActual() {
  return (t.esperas || []).find(e => !e.fin);
}

// ---------- Cabecera con línea de progreso ----------
function pintarCabecera() {
  const enEspera = t.estado === "En espera";
  const posicion = ESTADOS_LINEA.indexOf(enEspera ? "En proceso" : t.estado);
  const pasos = ESTADOS_LINEA.map((estado, i) => {
    const clase = i < posicion ? "hecho" : i === posicion ? "actual" : "";
    const texto = enEspera && estado === "En proceso" ? "⏸ En espera" : estado;
    return `<div class="paso ${clase} ${enEspera && i === posicion ? "pausado" : ""}">${texto}</div>`;
  }).join("");

  document.getElementById("cabecera").innerHTML = `
    <a href="${paginaInicio(yo)}" class="volver">← Volver</a>
    <div class="cabecera-ticket">
      <div>
        <span class="codigo">${t.codigo}</span>
        <h2>${escaparHTML(t.asunto)}</h2>
      </div>
      <div>${etiquetaEstado(t.estado)} ${esEquipoTI ? etiquetaPrioridad(t.prioridad) : ""}</div>
    </div>
    <div class="pasos">${pasos}</div>`;
}

// ---------- Mensajes del chat ----------
function pintarMensajes() {
  const caja = document.getElementById("mensajes");
  // (el servidor nunca le manda al usuario las notas internas)
  caja.innerHTML = t.mensajes.map(m => {
    if (m.sistema) {
      return `<div class="evento">• ${escaparHTML(m.texto)} · ${formatearFecha(m.fecha)}</div>`;
    }
    const autor = buscarUsuario(m.autorId) || { nombre: "Usuario", rol: "usuario" };
    const propio = m.autorId === yo.id;
    return `
      <div class="mensaje ${propio ? "propio" : ""} ${m.interno ? "interno" : ""}">
        <div class="avatar avatar-chico">${iniciales(autor.nombre)}</div>
        <div class="burbuja">
          <div class="burbuja-cabecera">
            <strong>${escaparHTML(autor.nombre)}</strong>
            ${autor.rol !== "usuario" ? '<span class="tag-ti">TI</span>' : ""}
            ${m.interno ? '<span class="tag-interno">🔒 Nota interna</span>' : ""}
            <small>${formatearFecha(m.fecha)}</small>
          </div>
          <p>${escaparHTML(m.texto).replace(/\n/g, "<br>")}</p>
        </div>
      </div>`;
  }).join("");

  caja.scrollTop = caja.scrollHeight;

  // Puede escribir: el usuario dueño, el analista asignado o el jefe (si no está cerrado)
  const puedeEscribir = t.estado !== "Cerrado" && (yo.rol !== "tecnico" || t.tecnicoId === yo.id);  // el admin puede escribir siempre
  document.getElementById("formMensaje").hidden = !puedeEscribir;
  document.getElementById("chatCerrado").hidden = puedeEscribir;
  document.getElementById("chatCerrado").textContent = t.estado === "Cerrado"
    ? "🔒 Este ticket está cerrado. Si el problema vuelve, crea un ticket nuevo."
    : "✋ Toma este ticket para poder escribir en el chat.";
}

function configurarChat() {
  const form = document.getElementById("formMensaje");
  const campo = document.getElementById("textoMensaje");
  const chkInterno = document.getElementById("chkInterno");
  document.getElementById("opcionInterna").hidden = !esEquipoTI;

  // Respuestas rápidas (solo equipo de TI)
  const selRapida = document.getElementById("respuestaRapida");
  selRapida.hidden = !esEquipoTI;
  selRapida.innerHTML += RESPUESTAS_RAPIDAS.map((r, i) => `<option value="${i}">${r.titulo}</option>`).join("");
  selRapida.addEventListener("change", () => {
    if (selRapida.value === "") return;
    campo.value = RESPUESTAS_RAPIDAS[Number(selRapida.value)].texto;
    selRapida.value = "";
    campo.focus();
  });

  // Enter envía, Shift + Enter hace salto de línea
  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const texto = campo.value.trim();
    if (!texto) return;
    const estabaEnEspera = t.estado === "En espera";
    const boton = form.querySelector("button[type=submit]");
    boton.disabled = true;
    const respuesta = await intentar(() => enviarMensaje(t, texto, esEquipoTI && chkInterno.checked));
    boton.disabled = false;
    if (!respuesta) return;
    campo.value = "";
    chkInterno.checked = false;
    const reactivado = estabaEnEspera && respuesta.estado === "En proceso";
    aplicar(respuesta, reactivado ? "Tu respuesta reactivó el ticket ▶" : null);
  });
}

// ---------- Información del ticket ----------
function pintarInfo() {
  const solicitante = buscarUsuario(t.usuarioId) || { nombre: "—", area: "" };
  const datos = [
    ["Categoría", `${escaparHTML(t.categoria)}<br><small class="tenue">${escaparHTML(t.subcategoria)}</small>`],
    ["Solicitante", `${escaparHTML(solicitante.nombre)}<br><small class="tenue">${escaparHTML(solicitante.area)}${solicitante.correo ? " · " + escaparHTML(solicitante.correo) : ""}</small>`],
    ["Técnico asignado", t.tecnicoId ? escaparHTML(nombreUsuario(t.tecnicoId)) : '<span class="tenue">Por asignar</span>'],
    ["Equipo o ubicación", t.ubicacion ? escaparHTML(t.ubicacion) : '<span class="tenue">—</span>'],
    ["Adjunto", t.adjunto
      ? `<a href="/api/adjuntos/${t.adjunto.id}">📎 ${escaparHTML(t.adjunto.nombre)}</a> <small class="tenue">(${Math.ceil(t.adjunto.tamano / 1024)} KB)</small>`
      : '<span class="tenue">—</span>'],
    ["Creado", formatearFecha(t.creado)],
    ["Última actualización", formatearFecha(t.actualizado)]
  ];

  if (esEquipoTI) {
    datos.splice(2, 0,
      ["Prioridad", etiquetaPrioridad(t.prioridad)],
      ["SLA de respuesta", etiquetaSLADetalle(slaRespuesta(t))],
      ["SLA de solución", etiquetaSLADetalle(slaSolucion(t))],
      ["Tiempo de atención", etiquetaAtencion(t)]
    );
    if (t.esperas && t.esperas.length) {
      datos.splice(6, 0, ["Tiempo en espera (laboral)", `${duracionLaboral(minutosEnEspera(t))}
        <br><small class="tenue">${t.esperas.length} ${t.esperas.length === 1 ? "pausa" : "pausas"}</small>`]);
    }
  }
  if (t.calificacion) {
    datos.push(["Calificación", `${estrellas(t.calificacion)}${t.comentarioCalificacion ? `<br><small class="tenue">"${escaparHTML(t.comentarioCalificacion)}"</small>` : ""}`]);
  }

  document.getElementById("info").innerHTML =
    datos.map(([titulo, valor]) => `<div><dt>${titulo}</dt><dd>${valor}</dd></div>`).join("");
}

// ---------- Acciones según el rol ----------
function pintarAcciones() {
  const caja = document.getElementById("acciones");
  if (yo.rol === "admin") {
    // El administrador atiende como analista si el ticket es suyo o está libre,
    // y además siempre tiene el panel de gestión (asignar, prioridad, cualquier estado)
    const gestion = document.getElementById("accionesGestion");
    const atiende = !t.tecnicoId || t.tecnicoId === yo.id;
    caja.hidden = !atiende;
    if (atiende) pintarAccionesTecnico(caja);
    gestion.hidden = false;
    return pintarAccionesAdmin(gestion);
  }
  if (yo.rol === "tecnico") return pintarAccionesTecnico(caja);
  pintarAccionesUsuario(caja);
}

// ===== JEFE DE TI =====
function pintarAccionesAdmin(caja) {
  caja.innerHTML = `
    <h2>⚙️ Gestión del ticket</h2>
    <div class="campo">
      <label for="selTecnico">Técnico</label>
      <select id="selTecnico">
        <option value="">-- Selecciona --</option>
        ${listaTecnicos().map(tec => `<option value="${tec.id}" ${tec.id === t.tecnicoId ? "selected" : ""}>${escaparHTML(nombreConRol(tec))}</option>`).join("")}
      </select>
    </div>
    <div class="campo">
      <label for="selPrioridad">Prioridad</label>
      <select id="selPrioridad">
        <option value="">-- Selecciona --</option>
        ${PRIORIDADES.map(p => `<option ${p === t.prioridad ? "selected" : ""}>${p}</option>`).join("")}
      </select>
      <p class="ayuda">${PRIORIDADES.map(p => `${p}: ${duracionLaboral(cfg().sla.respuesta[p])}`).join(" · ")} (respuesta, horas laborales)</p>
    </div>
    <button class="btn btn-primario btn-bloque" id="btnAsignar">Guardar asignación</button>
    <hr class="separador">
    <div class="campo">
      <label for="selEstado">Cambiar estado</label>
      <select id="selEstado">
        ${ESTADOS.map(e => `<option ${e === t.estado ? "selected" : ""}>${e}</option>`).join("")}
      </select>
    </div>
    <div class="campo" id="campoMotivoAdmin" hidden>
      <label for="selMotivoAdmin">Motivo de la espera</label>
      <select id="selMotivoAdmin">${MOTIVOS_ESPERA.map(m => `<option>${m}</option>`).join("")}</select>
    </div>
    <button class="btn btn-secundario btn-bloque" id="btnEstado">Actualizar estado</button>`;

  const selEstado = document.getElementById("selEstado");
  selEstado.addEventListener("change", () => {
    document.getElementById("campoMotivoAdmin").hidden = selEstado.value !== "En espera";
  });

  document.getElementById("btnAsignar").addEventListener("click", async () => {
    const tecnicoId = Number(document.getElementById("selTecnico").value);
    const prioridad = document.getElementById("selPrioridad").value;
    if (!tecnicoId || !prioridad) return mostrarAviso("Elige un técnico y una prioridad");
    aplicar(await intentar(() => asignarTicket(t, tecnicoId, prioridad)), "✅ Asignación guardada");
  });

  document.getElementById("btnEstado").addEventListener("click", async () => {
    const nuevo = selEstado.value;
    if (nuevo === t.estado) return;
    aplicar(await intentar(() => cambiarEstado(t, nuevo, document.getElementById("selMotivoAdmin").value)), "✅ Estado actualizado");
  });
}

// ===== ANALISTA DE SOPORTE =====
function pintarAccionesTecnico(caja) {

  // A) Ticket libre: el analista lo puede tomar sin esperar al jefe
  if (!t.tecnicoId) {
    caja.innerHTML = `
      <h2>📥 Ticket disponible</h2>
      <p class="tenue">Nadie lo ha tomado todavía. Clasifícalo y empieza a atenderlo.</p>
      <div class="campo">
        <label for="selPrioridadTomar">Prioridad</label>
        <select id="selPrioridadTomar">
          <option value="">-- Selecciona --</option>
          ${PRIORIDADES.map(p => `<option>${p}</option>`).join("")}
        </select>
        <p class="ayuda">Alta: no puede trabajar · Media: le molesta · Baja: solicitud o consulta</p>
      </div>
      <button class="btn btn-primario btn-bloque" id="btnTomar">✋ Tomar e iniciar atención</button>`;

    document.getElementById("btnTomar").addEventListener("click", async () => {
      const prioridad = document.getElementById("selPrioridadTomar").value;
      if (!prioridad) return mostrarAviso("Primero elige la prioridad");
      try {
        aplicar(await tomarTicket(t, prioridad), "✅ Ticket tomado. ¡El cronómetro empezó!");
      } catch (error) {
        // Si un compañero lo tomó un segundo antes, el servidor responde 409
        mostrarAviso("⚠️ " + error.message);
        if (error.codigo === 409) setTimeout(() => location.href = "tecnico.html", 1800);
      }
    });
    return;
  }

  // B) Ticket asignado a mí
  let html = "<h2>🛠️ Acciones</h2>";

  if (t.estado === "Asignado") {
    html += `
      <p class="tenue">Al iniciar la atención se cumple el SLA de respuesta y empieza tu cronómetro.</p>
      <button class="btn btn-primario btn-bloque" data-estado="En proceso">▶ Iniciar atención</button>`;
  } else if (t.estado === "En proceso") {
    html += `
      <div class="crono-grande crono-centro">
        <small>Tiempo de atención</small>
        <span data-crono="${t.id}">${formatoCrono(tiempoAtencionMs(t))}</span>
      </div>
      <button class="btn btn-exito btn-bloque" data-estado="Resuelto">✔ Marcar como resuelto</button>
      <details class="desplegable">
        <summary>⏸ Poner en espera</summary>
        <p class="ayuda">Pausa el SLA de solución y tu cronómetro mientras esperas algo que no depende de ti.</p>
        <select id="selMotivo">${MOTIVOS_ESPERA.map(m => `<option>${m}</option>`).join("")}</select>
        <button class="btn btn-secundario btn-bloque" id="btnEspera">⏸ Poner en espera</button>
      </details>`;
  } else if (t.estado === "En espera") {
    const espera = esperaActual();
    html += `
      <div class="caja-espera">
        <strong>⏸ En espera</strong>
        <span>${espera ? escaparHTML(espera.motivo) : ""}</span>
        <small class="tenue">Desde ${espera ? tiempoRelativo(espera.inicio) : ""}. El SLA de solución está pausado.</small>
      </div>
      <button class="btn btn-primario btn-bloque" data-estado="En proceso">▶ Reanudar atención</button>
      <button class="btn btn-exito btn-bloque" data-estado="Resuelto">✔ Marcar como resuelto</button>`;
  } else if (t.estado === "Resuelto") {
    html += `
      <p class="tenue">Esperando que el usuario confirme la solución.
        Si no responde, se cerrará solo en ${minutosATexto(horasParaAutocierre() * 60)}.</p>
      <button class="btn btn-exito btn-bloque" id="btnCerrar">🔒 Cerrar ticket</button>
      <button class="btn btn-secundario btn-bloque" data-estado="En proceso">↩ Volver a "En proceso"</button>`;
  } else {
    html += `<p class="tenue">Ticket cerrado. Tiempo total de atención: <strong>${formatoCrono(tiempoAtencionMs(t))}</strong></p>`;
  }

  // Transferir a un compañero (por ejemplo, si no es su especialidad)
  const companeros = listaTecnicos().filter(x => x.id !== yo.id);
  if (["Asignado", "En proceso", "En espera"].includes(t.estado) && companeros.length) {
    html += `
      <hr class="separador">
      <div class="campo">
        <label for="selTransferir">Transferir a un compañero</label>
        <select id="selTransferir">
          <option value="">-- Selecciona --</option>
          ${companeros.map(c => `<option value="${c.id}">${escaparHTML(nombreConRol(c))}</option>`).join("")}
        </select>
      </div>
      <button class="btn btn-secundario btn-bloque" id="btnTransferir">🔁 Transferir</button>`;
  }

  caja.innerHTML = html;

  // Botones que cambian el estado
  caja.querySelectorAll("[data-estado]").forEach(boton => {
    boton.addEventListener("click", async () => {
      const nuevo = boton.dataset.estado;
      let solucion = null;
      if (nuevo === "Resuelto") {
        solucion = prompt("Describe brevemente la solución (el usuario la verá):");
        if (solucion === null) return;
      }
      boton.disabled = true;
      aplicar(await intentar(() => cambiarEstado(t, nuevo, null, solucion)), "✅ Estado actualizado");
      boton.disabled = false;
    });
  });

  const btnEspera = document.getElementById("btnEspera");
  if (btnEspera) {
    btnEspera.addEventListener("click", async () => {
      aplicar(await intentar(() => cambiarEstado(t, "En espera", document.getElementById("selMotivo").value)), "⏸ Ticket en espera");
    });
  }

  // Cerrar sin esperar al usuario (por ejemplo, si confirmó por teléfono)
  const btnCerrar = document.getElementById("btnCerrar");
  if (btnCerrar) {
    btnCerrar.addEventListener("click", async () => {
      if (!confirm("¿Cerrar el ticket sin esperar la confirmación del usuario?")) return;
      aplicar(await intentar(() => cambiarEstado(t, "Cerrado")), "🔒 Ticket cerrado");
    });
  }

  const btnTransferir = document.getElementById("btnTransferir");
  if (btnTransferir) {
    btnTransferir.addEventListener("click", async () => {
      const nuevoId = Number(document.getElementById("selTransferir").value);
      if (!nuevoId) return mostrarAviso("Elige a qué compañero transferir");
      const motivo = prompt("Motivo de la transferencia (nota interna, opcional):");
      if (motivo === null) return;
      const respuesta = await intentar(() => transferirTicket(t, nuevoId, motivo.trim()));
      if (respuesta) location.href = "tecnico.html";
    });
  }
}

// ===== USUARIO =====
function pintarAccionesUsuario(caja) {
  const propio = t.usuarioId === yo.id;

  // Encuesta: al confirmar la solución o si quedó pendiente de calificar
  if (propio && (mostrandoEncuesta || (t.estado === "Cerrado" && !t.calificacion))) {
    const alCerrar = t.estado === "Resuelto";
    caja.innerHTML = `
      <h2>⭐ ¿Cómo te atendimos?</h2>
      <p class="tenue">Tu opinión nos ayuda a mejorar. ${alCerrar ? "Es opcional." : ""}</p>
      <div class="selector-estrellas" id="selectorEstrellas">
        ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-valor="${n}" aria-label="${n} estrellas">★</button>`).join("")}
      </div>
      <p class="ayuda" id="textoEstrellas">Elige de 1 a 5 estrellas</p>
      <textarea id="comentarioEncuesta" placeholder="Comentario (opcional)" maxlength="500" style="min-height: 70px;"></textarea>
      <button class="btn btn-exito btn-bloque" id="btnEnviarEncuesta">${alCerrar ? "Cerrar ticket" : "Enviar calificación"}</button>
      ${alCerrar ? '<button class="btn btn-secundario btn-bloque" id="btnCancelarEncuesta">← Volver</button>' : ""}`;

    let puntos = 0;
    const textos = ["", "Muy mala", "Mala", "Regular", "Buena", "¡Excelente!"];
    const botones = caja.querySelectorAll("#selectorEstrellas button");
    botones.forEach(b => b.addEventListener("click", () => {
      puntos = Number(b.dataset.valor);
      botones.forEach(x => x.classList.toggle("marcada", Number(x.dataset.valor) <= puntos));
      document.getElementById("textoEstrellas").textContent = textos[puntos];
    }));

    document.getElementById("btnEnviarEncuesta").addEventListener("click", async () => {
      if (!alCerrar && !puntos) return mostrarAviso("Elige cuántas estrellas");
      let respuesta = t;
      if (alCerrar) {
        respuesta = await intentar(() => cambiarEstado(t, "Cerrado"));
        if (!respuesta) return;
        t = respuesta;
      }
      if (puntos) {
        respuesta = await intentar(() => calificarTicket(t, puntos, document.getElementById("comentarioEncuesta").value.trim()));
        if (!respuesta) return pintarTodo();
      }
      mostrandoEncuesta = false;
      aplicar(respuesta, puntos ? "🎉 ¡Gracias por tu calificación!" : "✅ Ticket cerrado");
    });

    const cancelar = document.getElementById("btnCancelarEncuesta");
    if (cancelar) cancelar.addEventListener("click", () => { mostrandoEncuesta = false; pintarAcciones(); });
    return;
  }

  if (t.estado === "Resuelto") {
    caja.innerHTML = `
      <h2>🤔 ¿Se solucionó tu problema?</h2>
      <p class="tenue">TI marcó este ticket como resuelto. Confírmalo para cerrarlo.</p>
      <p class="tenue"><small>Si no respondes, se cerrará solo en ${minutosATexto(horasParaAutocierre() * 60)}.</small></p>
      <button class="btn btn-exito btn-bloque" id="btnConfirmar">👍 Sí, se solucionó</button>
      <button class="btn btn-secundario btn-bloque" id="btnReabrir">👎 Aún tengo el problema</button>`;

    document.getElementById("btnConfirmar").addEventListener("click", () => {
      mostrandoEncuesta = true;
      pintarAcciones();
    });
    document.getElementById("btnReabrir").addEventListener("click", async () => {
      if (aplicar(await intentar(() => cambiarEstado(t, "En proceso")), "Ticket reabierto. Cuéntanos qué sigue fallando en el chat.")) {
        document.getElementById("textoMensaje").focus();
      }
    });
    return;
  }

  if (t.estado === "Cerrado") {
    caja.innerHTML = `
      <h2>✅ Ticket cerrado</h2>
      <p class="tenue">Cerrado el ${formatearFecha(t.cerrado)}.</p>
      <p>Tu calificación: ${estrellas(t.calificacion)}</p>`;
    return;
  }

  if (t.estado === "En espera") {
    const espera = esperaActual();
    const motivo = espera ? espera.motivo : "";
    caja.innerHTML = `
      <h2>⏸ Tu ticket está en espera</h2>
      <div class="caja-espera"><span>${escaparHTML(motivo)}</span></div>
      <p class="tenue">${motivo === "Esperando respuesta del usuario"
        ? "El técnico necesita información tuya. Respóndele en el chat y el ticket se reactivará solo."
        : "Seguimos pendientes y te avisaremos apenas haya novedades."}</p>`;
    return;
  }

  const fueraHorario = !enHorarioLaboral();
  caja.innerHTML = `
    <h2>📌 Estado: ${t.estado}</h2>
    <p class="tenue">${{
      "Nuevo": "Recibimos tu ticket. Pronto lo revisará el equipo de TI.",
      "Asignado": "Tu ticket ya tiene un técnico asignado.",
      "En proceso": "El técnico está trabajando en tu caso."
    }[t.estado]}</p>
    ${fueraHorario ? `<p class="nota">🌙 Estamos fuera del horario de atención. Lo revisaremos ${textoProximaApertura()}</p>` : ""}
    <p class="tenue">Te avisaremos en la campana 🔔 y por correo cuando haya novedades.</p>`;
}

iniciarTicket();
