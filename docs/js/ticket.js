// =========================================================
// PÁGINA: DETALLE DEL TICKET (ticket.html?id=...)
// La usan los 3 roles, pero cada uno ve acciones distintas.
// =========================================================

const yo = requerirSesion();
const esEquipoTI = yo.rol !== "usuario";
const idTicket = Number(new URLSearchParams(location.search).get("id"));
const t = buscarTicket(idTicket);

const menuActivo = { usuario: "mis-tickets", tecnico: "asignados", admin: "todos" }[yo.rol];
construirLayout(yo, menuActivo);

// Para el usuario: ¿está mostrando el formulario de calificación?
let mostrandoEncuesta = false;

if (!t || !puedeVerTicket(yo, t)) {
  document.getElementById("sinAcceso").hidden = false;
  document.getElementById("btnVolverInicio").href = paginaInicio(yo);
} else {
  document.getElementById("vistaTicket").hidden = false;
  document.title = t.codigo + " - " + NOMBRE_SISTEMA;

  // Al abrir el ticket, sus notificaciones se marcan como leídas
  db.notificaciones
    .filter(n => n.usuarioId === yo.id && n.ticketId === t.id)
    .forEach(n => n.leida = true);
  guardar();

  configurarChat();
  pintarTodo();
}

function pintarTodo() {
  pintarCabecera();
  pintarMensajes();
  pintarInfo();
  pintarAcciones();
  pintarNotificaciones(yo);
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
  // El usuario no ve las notas internas del equipo de TI
  const visibles = t.mensajes.filter(m => esEquipoTI || !m.interno);

  caja.innerHTML = visibles.map(m => {
    if (m.sistema) {
      return `<div class="evento">• ${escaparHTML(m.texto)} · ${formatearFecha(m.fecha)}</div>`;
    }
    const autor = buscarUsuario(m.autorId) || { nombre: "Usuario eliminado", rol: "usuario" };
    const propio = m.autorId === yo.id;
    return `
      <div class="mensaje ${propio ? "propio" : ""} ${m.interno ? "interno" : ""}">
        <div class="avatar avatar-chico">${iniciales(autor.nombre)}</div>
        <div class="burbuja">
          <div class="burbuja-cabecera">
            <strong>${autor.nombre}</strong>
            ${autor.rol !== "usuario" ? '<span class="tag-ti">TI</span>' : ""}
            ${m.interno ? '<span class="tag-interno">🔒 Nota interna</span>' : ""}
            <small>${formatearFecha(m.fecha)}</small>
          </div>
          <p>${escaparHTML(m.texto).replace(/\n/g, "<br>")}</p>
        </div>
      </div>`;
  }).join("");

  caja.scrollTop = caja.scrollHeight;

  const cerrado = t.estado === "Cerrado";
  document.getElementById("formMensaje").hidden = cerrado;
  document.getElementById("chatCerrado").hidden = !cerrado;
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

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const texto = campo.value.trim();
    if (!texto) return;
    const interno = esEquipoTI && chkInterno.checked;

    t.mensajes.push({ autorId: yo.id, texto, fecha: new Date().toISOString(), interno });
    t.actualizado = new Date().toISOString();

    if (!interno) {
      if (yo.rol === "usuario") {
        if (t.tecnicoId) crearNotificacion(t.tecnicoId, `${yo.nombre} respondió en ${t.codigo}`, t.id);
        else notificarAdmins(`${yo.nombre} agregó información en ${t.codigo}`, t.id);

        // Si TI estaba esperando la respuesta del usuario, el ticket se reanuda solo
        const espera = esperaActual();
        if (t.estado === "En espera" && espera && espera.motivo === "Esperando respuesta del usuario") {
          cambiarEstado(t, "En proceso", yo);
          mostrarAviso("Tu respuesta reactivó el ticket ▶");
        }
      } else {
        crearNotificacion(t.usuarioId, `TI respondió tu ticket ${t.codigo}`, t.id);
      }
    }

    guardar();
    campo.value = "";
    chkInterno.checked = false;
    pintarTodo();
  });
}

// ---------- Información del ticket ----------
function pintarInfo() {
  const solicitante = buscarUsuario(t.usuarioId);
  const datos = [
    ["Categoría", `${t.categoria}<br><small class="tenue">${t.subcategoria}</small>`],
    ["Solicitante", `${solicitante.nombre}<br><small class="tenue">${solicitante.area} · ${solicitante.correo}</small>`],
    ["Técnico asignado", t.tecnicoId ? nombreUsuario(t.tecnicoId) : '<span class="tenue">Por asignar</span>'],
    ["Equipo o ubicación", t.ubicacion ? escaparHTML(t.ubicacion) : '<span class="tenue">—</span>'],
    ["Adjunto", t.adjunto ? "📎 " + escaparHTML(t.adjunto) : '<span class="tenue">—</span>'],
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
    // y además siempre tiene el panel de gestión
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
        ${listaTecnicos().map(tec => `<option value="${tec.id}" ${tec.id === t.tecnicoId ? "selected" : ""}>${nombreConRol(tec)}</option>`).join("")}
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

  document.getElementById("btnAsignar").addEventListener("click", () => {
    const tecnicoId = Number(document.getElementById("selTecnico").value);
    const prioridad = document.getElementById("selPrioridad").value;
    if (!tecnicoId || !prioridad) {
      mostrarAviso("Elige un técnico y una prioridad");
      return;
    }
    asignarTicket(t, tecnicoId, prioridad, yo);
    mostrarAviso("✅ Asignación guardada");
    pintarTodo();
  });

  document.getElementById("btnEstado").addEventListener("click", () => {
    const nuevo = selEstado.value;
    if (nuevo === t.estado) return;
    cambiarEstado(t, nuevo, yo, document.getElementById("selMotivoAdmin").value);
    mostrarAviso("✅ Estado actualizado");
    pintarTodo();
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

    document.getElementById("btnTomar").addEventListener("click", () => {
      const prioridad = document.getElementById("selPrioridadTomar").value;
      if (!prioridad) {
        mostrarAviso("Primero elige la prioridad");
        return;
      }
      // ¿Un compañero lo tomó mientras lo leías?
      const versionActual = cargarDB().tickets.find(x => x.id === t.id);
      if (versionActual && versionActual.tecnicoId) {
        mostrarAviso(`⚠️ ${nombreUsuario(versionActual.tecnicoId)} ya tomó este ticket`);
        setTimeout(() => location.href = "tecnico.html", 1500);
        return;
      }
      tomarTicket(t, yo, prioridad);
      mostrarAviso("✅ Ticket tomado. ¡El cronómetro empezó!");
      pintarTodo();
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
          ${companeros.map(c => `<option value="${c.id}">${nombreConRol(c)}</option>`).join("")}
        </select>
      </div>
      <button class="btn btn-secundario btn-bloque" id="btnTransferir">🔁 Transferir</button>`;
  }

  caja.innerHTML = html;

  // Botones que cambian el estado
  caja.querySelectorAll("[data-estado]").forEach(boton => {
    boton.addEventListener("click", () => {
      const nuevo = boton.dataset.estado;
      if (nuevo === "Resuelto") {
        const solucion = prompt("Describe brevemente la solución (el usuario la verá):");
        if (solucion === null) return;
        if (solucion.trim()) {
          t.mensajes.push({ autorId: yo.id, texto: "✅ Solución: " + solucion.trim(), fecha: new Date().toISOString(), interno: false });
        }
      }
      cambiarEstado(t, nuevo, yo);
      mostrarAviso("✅ Estado actualizado");
      pintarTodo();
    });
  });

  const btnEspera = document.getElementById("btnEspera");
  if (btnEspera) {
    btnEspera.addEventListener("click", () => {
      cambiarEstado(t, "En espera", yo, document.getElementById("selMotivo").value);
      mostrarAviso("⏸ Ticket en espera");
      pintarTodo();
    });
  }

  // Cerrar sin esperar al usuario (por ejemplo, si confirmó por teléfono)
  const btnCerrar = document.getElementById("btnCerrar");
  if (btnCerrar) {
    btnCerrar.addEventListener("click", () => {
      if (!confirm("¿Cerrar el ticket sin esperar la confirmación del usuario?")) return;
      cambiarEstado(t, "Cerrado", yo);
      mostrarAviso("🔒 Ticket cerrado");
      pintarTodo();
    });
  }

  const btnTransferir = document.getElementById("btnTransferir");
  if (btnTransferir) {
    btnTransferir.addEventListener("click", () => {
      const nuevoId = Number(document.getElementById("selTransferir").value);
      if (!nuevoId) {
        mostrarAviso("Elige a qué compañero transferir");
        return;
      }
      const motivo = prompt("Motivo de la transferencia (nota interna, opcional):");
      if (motivo === null) return;
      transferirTicket(t, nuevoId, yo, motivo.trim());
      location.href = "tecnico.html";
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
      <textarea id="comentarioEncuesta" placeholder="Comentario (opcional)" style="min-height: 70px;"></textarea>
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

    document.getElementById("btnEnviarEncuesta").addEventListener("click", () => {
      if (!alCerrar && !puntos) {
        mostrarAviso("Elige cuántas estrellas");
        return;
      }
      if (alCerrar) cambiarEstado(t, "Cerrado", yo);
      if (puntos) calificarTicket(t, puntos, document.getElementById("comentarioEncuesta").value.trim(), yo);
      mostrandoEncuesta = false;
      mostrarAviso(puntos ? "🎉 ¡Gracias por tu calificación!" : "✅ Ticket cerrado");
      pintarTodo();
    });

    const cancelar = document.getElementById("btnCancelarEncuesta");
    if (cancelar) cancelar.addEventListener("click", () => { mostrandoEncuesta = false; pintarTodo(); });
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
    document.getElementById("btnReabrir").addEventListener("click", () => {
      cambiarEstado(t, "En proceso", yo);
      mostrarAviso("Ticket reabierto. Cuéntanos qué sigue fallando en el chat.");
      pintarTodo();
      document.getElementById("textoMensaje").focus();
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
