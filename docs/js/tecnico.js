// =========================================================
// PÁGINA: BANDEJA DEL ANALISTA DE SOPORTE (tecnico.html)
// - Ve sus tickets asignados
// - Puede TOMAR tickets libres sin esperar al jefe
// - Ve su rendimiento y el cronómetro de atención
// =========================================================

const yo = requerirSesion(["tecnico", "admin"]);
construirLayout(yo, "asignados");
window.addEventListener("hashchange", () => marcarMenuPorHash("asignados"));
marcarMenuPorHash("asignados");

const busqueda = document.getElementById("busqueda");
const filtroVista = document.getElementById("filtroVista");
const tabla = document.getElementById("tablaTickets");
let limiteFilas = 25;

function misAsignados() {
  return db.tickets.filter(t => t.tecnicoId === yo.id);
}

function disponibles() {
  return db.tickets.filter(t => !t.tecnicoId && estaAbierto(t)).sort(ordenarPorUrgencia);
}

function esDeHoy(iso) {
  return iso && fechaISOLocal(iso) === fechaISOLocal(new Date());
}

// =========================================================
// 1. MI RENDIMIENTO
// =========================================================
function pintarResumen() {
  const lista = misAsignados();
  const abiertos = lista.filter(estaAbierto);
  const hace30 = Date.now() - 30 * 86400000;
  const ultimos30 = lista.filter(t => t.resuelto && new Date(t.resuelto) > hace30);

  const promAtencion = promedio(ultimos30.filter(t => t.tiempoAtencionMs).map(t => t.tiempoAtencionMs / 60000));
  const calificados = ultimos30.filter(t => t.calificacion);
  const promCalif = promedio(calificados.map(t => t.calificacion));

  document.getElementById("kpis").innerHTML =
    tarjetaKPI(disponibles().length, "Disponibles para tomar", "kpi-morado") +
    tarjetaKPI(lista.filter(t => t.estado === "Asignado").length, "Por atender", "kpi-azul") +
    tarjetaKPI(lista.filter(t => t.estado === "En proceso").length, "En proceso", "kpi-amarillo") +
    tarjetaKPI(lista.filter(t => t.estado === "En espera").length, "En espera", "kpi-gris") +
    tarjetaKPI(abiertos.filter(t => infoSLA(t).vencido).length, "Con SLA vencido", "kpi-rojo") +
    tarjetaKPI(lista.filter(t => esDeHoy(t.resuelto)).length, "Resueltos hoy", "kpi-verde") +
    tarjetaKPI(promAtencion === null ? "—" : minutosATexto(promAtencion), "Mi tiempo promedio de atención (30 días)", "kpi-azul") +
    tarjetaKPI(promCalif === null ? "—" : promCalif.toFixed(1) + " ★", `Mi satisfacción (${calificados.length} encuestas)`, "kpi-amarillo");
}

// =========================================================
// 2. LO QUE ESTOY ATENDIENDO AHORA (con cronómetro en vivo)
// =========================================================
function pintarAtendiendo() {
  const activos = misAsignados().filter(t => t.estado === "En proceso").sort(ordenarPorUrgencia);
  const caja = document.getElementById("atendiendo");

  if (!activos.length) {
    caja.innerHTML = "";
    return;
  }

  caja.innerHTML = `
    <div class="tarjeta">
      <div class="tarjeta-cabecera"><h2>▶ Atendiendo ahora</h2></div>
      ${activos.map(t => `
        <a class="atendiendo" href="ticket.html?id=${t.id}">
          <div>
            <span class="codigo">${t.codigo}</span> ${etiquetaPrioridad(t.prioridad)} ${etiquetaSLA(t)}
            <div><strong>${escaparHTML(t.asunto)}</strong></div>
            <small class="tenue">${nombreUsuario(t.usuarioId)} · ${t.categoria}</small>
          </div>
          <div class="crono-grande">
            <small>Tiempo de atención</small>
            <span data-crono="${t.id}">${formatoCrono(tiempoAtencionMs(t))}</span>
          </div>
        </a>`).join("")}
    </div>`;
}

// =========================================================
// 3. MIS TICKETS
// =========================================================
function pintarTabla() {
  const texto = busqueda.value.trim().toLowerCase();
  let lista = misAsignados();
  if (filtroVista.value === "abiertos") lista = lista.filter(estaAbierto);
  if (filtroVista.value === "espera") lista = lista.filter(t => t.estado === "En espera");
  if (filtroVista.value === "resueltos") lista = lista.filter(t => t.estado === "Resuelto");
  if (texto) {
    lista = lista.filter(t =>
      (t.codigo + " " + t.asunto + " " + nombreUsuario(t.usuarioId)).toLowerCase().includes(texto));
  }
  if (filtroVista.value === "todos") lista.sort((a, b) => new Date(b.creado) - new Date(a.creado));
  else lista.sort(ordenarPorUrgencia);

  if (!lista.length) {
    tabla.innerHTML = `<tr><td colspan="7" class="vacio">🎉 No tienes tickets en esta vista</td></tr>`;
    return;
  }

  tabla.innerHTML = lista.slice(0, limiteFilas).map(t => {
    const solicitante = buscarUsuario(t.usuarioId);
    return `
      <tr class="fila-clic" data-id="${t.id}">
        <td><span class="codigo">${t.codigo}</span></td>
        <td>${escaparHTML(t.asunto)}<small>${t.categoria} · ${t.subcategoria}</small></td>
        <td>${solicitante.nombre}<small>${solicitante.area}</small></td>
        <td>${etiquetaPrioridad(t.prioridad)}</td>
        <td>${etiquetaEstado(t.estado)}</td>
        <td>${etiquetaSLA(t)}</td>
        <td>${etiquetaAtencion(t)}</td>
      </tr>`;
  }).join("") + filaMostrarMas(7, Math.min(limiteFilas, lista.length), lista.length);

  tabla.querySelectorAll(".fila-clic").forEach(fila => {
    fila.addEventListener("click", () => location.href = "ticket.html?id=" + fila.dataset.id);
  });
  const mas = tabla.querySelector("[data-mostrar-mas]");
  if (mas) mas.addEventListener("click", () => { limiteFilas += 25; pintarTabla(); });
}

// =========================================================
// 4. TICKETS DISPONIBLES (tomar sin esperar asignación)
// =========================================================
function pintarDisponibles() {
  const lista = disponibles();
  const caja = document.getElementById("listaDisponibles");

  if (!lista.length) {
    caja.innerHTML = '<p class="vacio">No hay tickets esperando. ¡Buen trabajo! 🎉</p>';
    return;
  }

  caja.innerHTML = lista.map(t => {
    const solicitante = buscarUsuario(t.usuarioId);
    return `
      <div class="pendiente">
        <div>
          <span class="codigo">${t.codigo}</span> · ${etiquetaSLA(t)}
          <div><a href="ticket.html?id=${t.id}"><strong>${escaparHTML(t.asunto)}</strong></a></div>
          <small class="tenue">${solicitante.nombre} (${solicitante.area}) · ${t.categoria} › ${t.subcategoria}</small>
        </div>
        <div class="pendiente-acciones">
          <select data-prioridad="${t.id}" aria-label="Prioridad">
            <option value="">Prioridad</option>
            ${PRIORIDADES.map(p => `<option>${p}</option>`).join("")}
          </select>
          <button class="btn btn-primario btn-chico" data-tomar="${t.id}">✋ Tomar ticket</button>
        </div>
      </div>`;
  }).join("");

  caja.querySelectorAll("[data-tomar]").forEach(boton => {
    boton.addEventListener("click", () => {
      const id = Number(boton.dataset.tomar);
      const prioridad = caja.querySelector(`[data-prioridad="${id}"]`).value;
      if (!prioridad) {
        mostrarAviso("Primero elige la prioridad del ticket");
        return;
      }

      // Volvemos a leer los datos: quizá tu compañero lo tomó hace un segundo
      refrescarDB();
      const t = buscarTicket(id);
      if (t.tecnicoId) {
        mostrarAviso(`⚠️ ${nombreUsuario(t.tecnicoId)} ya tomó este ticket`);
        pintarTodo();
        return;
      }

      tomarTicket(t, yo, prioridad);
      location.href = "ticket.html?id=" + t.id;
    });
  });
}

// =========================================================
// 5. AYUDA DEL SLA (con los tiempos configurados por el jefe)
// =========================================================
function pintarAyudaSLA() {
  const s = cfg().sla;
  const usos = { Alta: "El usuario no puede trabajar o afecta a varias personas", Media: "Le molesta, pero puede seguir trabajando", Baja: "Solicitudes, instalaciones, consultas" };
  document.getElementById("tablaSLA").innerHTML = `
    <tr><th>Prioridad</th><th>Respuesta</th><th>Solución</th><th>Cuándo usarla</th></tr>
    ${PRIORIDADES.map(p => `
      <tr>
        <td>${etiquetaPrioridad(p)}</td>
        <td>${duracionLaboral(s.respuesta[p])}</td>
        <td>${duracionLaboral(s.solucion[p])}</td>
        <td>${usos[p]}</td>
      </tr>`).join("")}`;
  document.getElementById("horarioSLA").textContent = textoHorario();
}

// =========================================================
function pintarTodo() {
  pintarResumen();
  pintarAtendiendo();
  pintarTabla();
  pintarDisponibles();
  pintarNotificaciones(yo);
}

busqueda.addEventListener("input", () => { limiteFilas = 25; pintarTabla(); });
filtroVista.addEventListener("change", () => { limiteFilas = 25; pintarTabla(); });

pintarAyudaSLA();
pintarTodo();

// Los colores del SLA cambian con el tiempo: repintamos cada minuto
setInterval(() => { pintarResumen(); pintarTabla(); }, 60000);

// Si en otra pestaña alguien crea o cambia un ticket, lo mostramos al instante
// (prueba: abre el sistema en 2 pestañas, una como usuario y otra como analista)
window.addEventListener("storage", (evento) => {
  if (evento.key !== CLAVE_DB) return;
  const antes = disponibles().length;
  refrescarDB();
  pintarTodo();
  if (disponibles().length > antes) mostrarAviso("🔔 ¡Llegó un nuevo ticket!");
});
