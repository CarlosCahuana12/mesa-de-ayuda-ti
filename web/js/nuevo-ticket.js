// =========================================================
// PÁGINA: NUEVO TICKET (nuevo-ticket.html)
// El usuario NO elige la prioridad: la asigna TI.
// Mientras escribe, le sugerimos artículos de la base de
// conocimiento por si puede resolverlo solo.
// =========================================================

const yo = requerirSesion();
const esTI = yo.rol !== "usuario";   // analistas y administradores también registran tickets
construirLayout(yo, "nuevo");

const formulario = document.getElementById("formulario");
const selCategoria = document.getElementById("categoria");
const selSubcategoria = document.getElementById("subcategoria");
const campoAsunto = document.getElementById("asunto");

// ---------- Solicitante ----------
// El usuario siempre es él mismo. TI puede elegir a cualquier usuario activo.
const selSolicitante = document.getElementById("solicitante");
const selPrioridadTI = document.getElementById("prioridadTI");
const chkTomar = document.getElementById("tomarTI");

function solicitanteActual() {
  return esTI ? buscarUsuario(Number(selSolicitante.value)) : yo;
}

function pintarSolicitante() {
  const s = solicitanteActual();
  document.getElementById("datosSolicitante").textContent =
    `${s.nombre} · ${s.area || "Sin área"}${s.correo ? " · " + s.correo : ""}`;
}

if (esTI) {
  document.getElementById("bloqueTI").hidden = false;
  const otros = db.usuarios
    .filter(u => u.activo && !u.eliminado && u.id !== yo.id)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  selSolicitante.innerHTML = `<option value="${yo.id}">Yo mismo (${escaparHTML(yo.nombre)})</option>` +
    otros.map(u => `<option value="${u.id}">${escaparHTML(u.nombre)} · ${escaparHTML(u.area || "Sin área")}</option>`).join("");
  selSolicitante.addEventListener("change", pintarSolicitante);
  chkTomar.addEventListener("change", () => {
    if (chkTomar.checked && !selPrioridadTI.value) selPrioridadTI.focus();
  });
}
pintarSolicitante();
document.getElementById("horarioAtencion").textContent = textoHorario();

// Llenamos las categorías
selCategoria.innerHTML = '<option value="">-- Selecciona --</option>' +
  Object.keys(db.categorias).map(c => `<option>${c}</option>`).join("");

// Cuando cambia la categoría, mostramos sus subcategorías
selCategoria.addEventListener("change", () => {
  const subcategorias = db.categorias[selCategoria.value] || [];
  selSubcategoria.innerHTML = '<option value="">-- Selecciona --</option>' +
    subcategorias.map(s => `<option>${s}</option>`).join("");
  selSubcategoria.disabled = subcategorias.length === 0;
  mostrarSugerencias();
});
selSubcategoria.addEventListener("change", mostrarSugerencias);
campoAsunto.addEventListener("input", mostrarSugerencias);

// ---------- Sugerencias de la base de conocimiento ----------
function quitarTildes(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function mostrarSugerencias() {
  const palabras = quitarTildes(campoAsunto.value).split(/\W+/).filter(p => p.length > 3);

  const conPuntaje = db.articulos.map(a => {
    let puntos = 0;
    if (selSubcategoria.value && a.subcategoria === selSubcategoria.value) puntos += 3;
    else if (selCategoria.value && a.categoria === selCategoria.value) puntos += 1;
    const texto = quitarTildes(a.titulo + " " + a.contenido);
    palabras.forEach(p => { if (texto.includes(p)) puntos += 1; });
    return { a, puntos };
  }).filter(x => x.puntos >= 2).sort((x, y) => y.puntos - x.puntos).slice(0, 3);

  const caja = document.getElementById("sugerencias");
  caja.hidden = conPuntaje.length === 0;
  caja.innerHTML = `
    <div class="sugerencias">
      <strong>💡 Quizá esto te ayude a resolverlo ahora mismo:</strong>
      ${conPuntaje.map(({ a }) => `
        <details>
          <summary>${escaparHTML(a.titulo)}</summary>
          <p>${escaparHTML(a.contenido).replace(/\n/g, "<br>")}</p>
        </details>`).join("")}
      <small class="tenue">Si no se soluciona, continúa con tu ticket.</small>
    </div>`;
}

// ---------- Enviar el ticket al servidor ----------
formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const boton = formulario.querySelector("button[type=submit]");
  const archivo = document.getElementById("adjunto").files[0];
  if (archivo && archivo.size > 10 * 1024 * 1024) {
    mostrarAviso("⚠️ El archivo supera los 10 MB");
    return;
  }

  const datos = new FormData();
  datos.append("categoria", selCategoria.value);
  datos.append("subcategoria", selSubcategoria.value);
  datos.append("asunto", campoAsunto.value.trim());
  datos.append("descripcion", document.getElementById("descripcion").value.trim());
  datos.append("ubicacion", document.getElementById("ubicacion").value.trim());
  if (archivo) datos.append("adjunto", archivo);
  if (esTI) {
    if (chkTomar.checked && !selPrioridadTI.value) {
      mostrarAviso("Elige la prioridad para atenderlo ahora");
      return selPrioridadTI.focus();
    }
    datos.append("solicitanteId", selSolicitante.value);
    datos.append("prioridad", selPrioridadTI.value);
    if (chkTomar.checked) datos.append("tomar", "si");
  }

  boton.disabled = true;
  boton.textContent = "Enviando...";
  const ticket = await intentar(() => api("/api/tickets", { metodo: "POST", formulario: datos }));
  boton.disabled = false;
  boton.textContent = "Enviar ticket";
  if (!ticket) return;
  if (ticket.tomado) {
    location.href = "ticket.html?id=" + ticket.id;   // TI empieza a atenderlo de inmediato
    return;
  }

  // Mostramos la confirmación
  formulario.hidden = true;
  document.getElementById("confirmacion").hidden = false;
  document.getElementById("codigoNuevo").textContent = ticket.codigo;
  document.getElementById("verTicket").href = "ticket.html?id=" + ticket.id;

  if (!enHorarioLaboral()) {
    const aviso = document.getElementById("avisoHorario");
    aviso.hidden = false;
    aviso.textContent = `🌙 Estamos fuera del horario de atención (${textoHorario()}). Revisaremos tu ticket ${textoProximaApertura()}`;
  }
});
