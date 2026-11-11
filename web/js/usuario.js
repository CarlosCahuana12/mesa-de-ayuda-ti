// =========================================================
// PÁGINA: MIS TICKETS (usuario.html)
// El usuario solo ve SUS tickets.
// =========================================================

const yo = requerirSesion(["usuario"]);
construirLayout(yo, "mis-tickets");

const busqueda = document.getElementById("busqueda");
const filtroEstado = document.getElementById("filtroEstado");
const tabla = document.getElementById("tablaTickets");

// Llenamos el filtro de estados
filtroEstado.innerHTML += ESTADOS.map(e => `<option>${e}</option>`).join("");

function misTickets() {
  return db.tickets
    .filter(t => t.usuarioId === yo.id)
    .sort((a, b) => new Date(b.actualizado) - new Date(a.actualizado));
}

function pintarResumen() {
  const lista = misTickets();
  const abiertos = lista.filter(estaAbierto).length;
  const porConfirmar = lista.filter(t => t.estado === "Resuelto").length;
  const cerrados = lista.filter(t => t.estado === "Cerrado").length;

  document.getElementById("kpis").innerHTML =
    tarjetaKPI(lista.length, "Total de tickets", "kpi-azul") +
    tarjetaKPI(abiertos, "Abiertos", "kpi-morado") +
    tarjetaKPI(porConfirmar, "Esperan tu confirmación", "kpi-amarillo") +
    tarjetaKPI(cerrados, "Cerrados", "kpi-verde");
}

function ticketsFiltrados() {
  const texto = busqueda.value.trim().toLowerCase();
  const estado = filtroEstado.value;
  return misTickets().filter(t =>
    (!estado || t.estado === estado) &&
    (!texto || (t.codigo + " " + t.asunto).toLowerCase().includes(texto))
  );
}

function pintarTabla() {
  const lista = ticketsFiltrados();

  if (!lista.length) {
    tabla.innerHTML = `<tr><td colspan="6" class="vacio">No se encontraron tickets</td></tr>`;
    return;
  }

  tabla.innerHTML = lista.map(t => `
    <tr class="fila-clic" data-id="${t.id}">
      <td><span class="codigo">${t.codigo}</span></td>
      <td>${escaparHTML(t.asunto)}</td>
      <td>${t.categoria}<small>${t.subcategoria}</small></td>
      <td>${etiquetaEstado(t.estado)}</td>
      <td>${t.tecnicoId ? nombreUsuario(t.tecnicoId) : '<span class="tenue">Por asignar</span>'}</td>
      <td>${tiempoRelativo(t.actualizado)}</td>
    </tr>`).join("");

  tabla.querySelectorAll(".fila-clic").forEach(fila => {
    fila.addEventListener("click", () => location.href = "ticket.html?id=" + fila.dataset.id);
  });
}

busqueda.addEventListener("input", pintarTabla);
filtroEstado.addEventListener("change", pintarTabla);

document.getElementById("btnExportar").addEventListener("click", () => {
  exportarExcel(filasParaExcel(ticketsFiltrados()), "mis-tickets");
});

pintarResumen();
pintarTabla();
