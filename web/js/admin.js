// =========================================================
// PÁGINA: PANEL Y REPORTES DEL JEFE DE TI (admin.html)
// Ve todo, asigna técnico y prioridad, y saca reportes.
// =========================================================

const yo = requerirSesion(["admin"]);
construirLayout(yo, "panel");
window.addEventListener("hashchange", () => marcarMenuPorHash("panel"));
marcarMenuPorHash("panel");

// =========================================================
// 1. AHORA MISMO (no depende del periodo)
// =========================================================
function pintarAhora() {
  const abiertos = db.tickets.filter(estaAbierto);
  document.getElementById("kpisAhora").innerHTML =
    tarjetaKPI(abiertos.length, "Tickets abiertos", "kpi-azul") +
    tarjetaKPI(db.tickets.filter(t => !t.tecnicoId && estaAbierto(t)).length, "Sin asignar", "kpi-morado") +
    tarjetaKPI(abiertos.filter(t => t.estado === "En proceso").length, "En proceso", "kpi-amarillo") +
    tarjetaKPI(abiertos.filter(t => t.estado === "En espera").length, "En espera", "kpi-gris") +
    tarjetaKPI(abiertos.filter(t => infoSLA(t).vencido).length, "Con SLA vencido", "kpi-rojo") +
    tarjetaKPI(db.tickets.filter(t => t.estado === "Resuelto").length, "Esperan confirmación", "kpi-verde");
}

// =========================================================
// 2. BANDEJA SIN ASIGNAR
// =========================================================
function opcionesTecnicos() {
  return listaTecnicos().map(tec => {
    const carga = db.tickets.filter(t => t.tecnicoId === tec.id && estaAbierto(t)).length;
    return `<option value="${tec.id}">${escaparHTML(nombreConRol(tec))} (${carga} abiertos)</option>`;
  }).join("");
}

function pintarSinAsignar() {
  const lista = db.tickets.filter(t => !t.tecnicoId && estaAbierto(t)).sort(ordenarPorUrgencia);
  const caja = document.getElementById("listaSinAsignar");

  if (!lista.length) {
    caja.innerHTML = '<p class="vacio">🎉 Todos los tickets están asignados</p>';
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
          <select data-tecnico="${t.id}" aria-label="Técnico">
            <option value="">Técnico</option>
            ${opcionesTecnicos()}
          </select>
          <button class="btn btn-primario btn-chico" data-asignar="${t.id}">Asignar</button>
        </div>
      </div>`;
  }).join("");

  caja.querySelectorAll("[data-asignar]").forEach(boton => {
    boton.addEventListener("click", async () => {
      const id = Number(boton.dataset.asignar);
      const prioridad = caja.querySelector(`[data-prioridad="${id}"]`).value;
      const tecnicoId = Number(caja.querySelector(`[data-tecnico="${id}"]`).value);
      if (!prioridad || !tecnicoId) {
        mostrarAviso("Elige prioridad y técnico");
        return;
      }
      boton.disabled = true;
      const t = await intentar(() => asignarTicket({ id }, tecnicoId, prioridad));
      if (t) mostrarAviso(`✅ ${t.codigo} asignado a ${nombreUsuario(tecnicoId)}`);
      await intentar(cargarEstado);
      pintarTodo();
    });
  });
}

// =========================================================
// 3. REPORTES POR PERIODO
// =========================================================
const selPeriodo = document.getElementById("selPeriodo");
const fechaDesde = document.getElementById("fechaDesde");
const fechaHasta = document.getElementById("fechaHasta");

fechaHasta.value = fechaISOLocal(new Date());
fechaDesde.value = fechaISOLocal(new Date(Date.now() - 30 * 86400000));

// Devuelve [desde, hasta] como fechas
function rangoPeriodo() {
  const hoy = new Date();
  const finHoy = new Date(hoy); finHoy.setHours(23, 59, 59, 999);
  switch (selPeriodo.value) {
    case "7":  return [new Date(Date.now() - 7 * 86400000), finHoy];
    case "30": return [new Date(Date.now() - 30 * 86400000), finHoy];
    case "mes": return [new Date(hoy.getFullYear(), hoy.getMonth(), 1), finHoy];
    case "mes-anterior": return [new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1), new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59)];
    case "rango": {
      const desde = new Date(fechaDesde.value + "T00:00:00");
      const hasta = new Date(fechaHasta.value + "T23:59:59");
      return [desde, hasta];
    }
    default: return [new Date(0), finHoy];
  }
}

function enPeriodo(iso) {
  if (!iso) return false;
  const [desde, hasta] = rangoPeriodo();
  const f = new Date(iso);
  return f >= desde && f <= hasta;
}

// Tickets CREADOS dentro del periodo
function ticketsDelPeriodo() {
  return db.tickets.filter(t => enPeriodo(t.creado));
}

// Indicadores de un grupo de tickets (se reutiliza por analista)
function calcularIndicadores(creados, todosDelTecnico = db.tickets) {
  const resueltos = todosDelTecnico.filter(t => enPeriodo(t.resuelto));
  const conRespuesta = creados.filter(t => t.prioridad && t.atendido);
  const respuestaOk = conRespuesta.filter(t => slaRespuesta(t).cumplido);
  const solucionOk = resueltos.filter(t => t.prioridad && slaSolucion(t).cumplido);
  const tiempos = resueltos.filter(t => t.tiempoAtencionMs).map(t => t.tiempoAtencionMs / 60000);
  const calificados = resueltos.filter(t => t.calificacion);
  const promCalif = promedio(calificados.map(t => t.calificacion));
  const primeraRespuesta = promedio(conRespuesta.map(t => minutosLaborales(t.creado, t.atendido)));

  return {
    creados: creados.length,
    resueltos: resueltos.length,
    slaRespuesta: porcentaje(respuestaOk.length, conRespuesta.length),
    slaSolucion: porcentaje(solucionOk.length, resueltos.filter(t => t.prioridad).length),
    atencion: tiempos.length ? minutosATexto(promedio(tiempos)) : "—",
    respuesta: primeraRespuesta === null ? "—" : duracionLaboral(primeraRespuesta),
    satisfaccion: promCalif === null ? "—" : promCalif.toFixed(1) + " ★",
    encuestas: calificados.length
  };
}

function pintarPeriodo() {
  const [desde, hasta] = rangoPeriodo();
  const creados = ticketsDelPeriodo();
  const ind = calcularIndicadores(creados);

  document.getElementById("textoPeriodo").textContent = selPeriodo.value === "todo"
    ? `Todo el historial · ${creados.length} tickets`
    : `Del ${desde.toLocaleDateString("es-PE")} al ${hasta.toLocaleDateString("es-PE")} · ${creados.length} tickets creados`;

  document.getElementById("kpisPeriodo").innerHTML =
    tarjetaKPI(ind.creados, "Tickets creados", "kpi-azul") +
    tarjetaKPI(ind.resueltos, "Tickets resueltos", "kpi-verde") +
    tarjetaKPI(ind.slaRespuesta, "Cumplimiento SLA de respuesta", "kpi-verde") +
    tarjetaKPI(ind.slaSolucion, "Cumplimiento SLA de solución", "kpi-verde") +
    tarjetaKPI(ind.respuesta, "Tiempo prom. de respuesta (laboral)", "kpi-amarillo") +
    tarjetaKPI(ind.atencion, "Tiempo prom. de atención", "kpi-azul") +
    tarjetaKPI(ind.satisfaccion, `Satisfacción (${ind.encuestas} encuestas)`, "kpi-amarillo");

  // Rendimiento por analista
  document.getElementById("tablaRendimiento").innerHTML = listaTecnicos().map(tec => {
    const suyos = db.tickets.filter(t => t.tecnicoId === tec.id);
    const r = calcularIndicadores(suyos.filter(t => enPeriodo(t.creado)), suyos);
    const abiertos = suyos.filter(estaAbierto);
    const vencidos = abiertos.filter(t => infoSLA(t).vencido).length;
    return `
      <tr>
        <td><strong>${tec.nombre}</strong></td>
        <td>${abiertos.length}${vencidos ? ` <span class="etiqueta sla-vencido">${vencidos} vencidos</span>` : ""}</td>
        <td>${r.resueltos}</td>
        <td>${r.slaRespuesta}</td>
        <td>${r.slaSolucion}</td>
        <td>${r.atencion}</td>
        <td>${r.satisfaccion} <small>${r.encuestas} encuestas</small></td>
      </tr>`;
  }).join("");

  // Gráficos
  const contar = (lista, clave) => lista.reduce((acc, t) => { const k = clave(t); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const top = (conteo, n) => Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, n).map(([etiqueta, valor]) => ({ etiqueta, valor }));

  const porCategoria = contar(creados, t => t.categoria);
  document.getElementById("graficoCategorias").innerHTML = creados.length
    ? graficoBarras(Object.keys(db.categorias).map(c => ({ etiqueta: c, valor: porCategoria[c] || 0 })))
    : graficoBarras([]);
  document.getElementById("graficoSubcategorias").innerHTML = graficoBarras(top(contar(creados, t => t.subcategoria), 6));
  document.getElementById("graficoAreas").innerHTML = graficoBarras(top(contar(creados, t => buscarUsuario(t.usuarioId).area), 6));
  const porPrioridad = contar(creados, t => t.prioridad || "Sin clasificar");
  document.getElementById("graficoPrioridades").innerHTML = creados.length
    ? graficoBarras(["Alta", "Media", "Baja", "Sin clasificar"].map(p => ({ etiqueta: p, valor: porPrioridad[p] || 0, clase: p === "Alta" ? "rojo" : "" })))
    : graficoBarras([]);

  // Comentarios de la encuesta
  const comentarios = db.tickets
    .filter(t => t.calificacion && t.comentarioCalificacion && enPeriodo(t.cerrado))
    .sort((a, b) => new Date(b.cerrado) - new Date(a.cerrado))
    .slice(0, 6);
  document.getElementById("comentarios").innerHTML = comentarios.length
    ? comentarios.map(t => `
        <a class="comentario" href="ticket.html?id=${t.id}">
          ${estrellas(t.calificacion)} <span>"${escaparHTML(t.comentarioCalificacion)}"</span>
          <small class="tenue">${nombreUsuario(t.usuarioId)} sobre ${t.tecnicoId ? nombreUsuario(t.tecnicoId) : "TI"} · ${t.codigo}</small>
        </a>`).join("")
    : '<p class="vacio">Sin comentarios en este periodo</p>';
}

selPeriodo.addEventListener("change", () => {
  const rango = selPeriodo.value === "rango";
  fechaDesde.hidden = !rango;
  fechaHasta.hidden = !rango;
  pintarPeriodo();
});
fechaDesde.addEventListener("change", pintarPeriodo);
fechaHasta.addEventListener("change", pintarPeriodo);

document.getElementById("btnExportarReporte").addEventListener("click", () => {
  const rendimiento = listaTecnicos().map(tec => {
    const suyos = db.tickets.filter(t => t.tecnicoId === tec.id);
    const r = calcularIndicadores(suyos.filter(t => enPeriodo(t.creado)), suyos);
    return {
      "Analista": tec.nombre,
      "Abiertos ahora": suyos.filter(estaAbierto).length,
      "Resueltos": r.resueltos,
      "SLA respuesta": r.slaRespuesta,
      "SLA solución": r.slaSolucion,
      "Tiempo prom. atención": r.atencion,
      "Satisfacción": r.satisfaccion,
      "Encuestas": r.encuestas
    };
  });
  const [desde, hasta] = rangoPeriodo();
  const nombre = selPeriodo.value === "todo"
    ? "reporte-tickets-historico"
    : `reporte-tickets-${fechaISOLocal(desde)}-a-${fechaISOLocal(hasta)}`;
  exportarExcel(filasParaExcel(ticketsDelPeriodo()), nombre, [{ nombre: "Rendimiento", filas: rendimiento }]);
});

// =========================================================
// 4. TODOS LOS TICKETS (con filtros y "mostrar más")
// =========================================================
const busqueda = document.getElementById("busqueda");
const filtros = {
  estado: document.getElementById("filtroEstado"),
  categoria: document.getElementById("filtroCategoria"),
  prioridad: document.getElementById("filtroPrioridad"),
  tecnico: document.getElementById("filtroTecnico"),
  area: document.getElementById("filtroArea")
};
let limiteFilas = 25;

filtros.estado.innerHTML += ESTADOS.map(e => `<option>${e}</option>`).join("");
filtros.categoria.innerHTML += Object.keys(db.categorias).map(c => `<option>${c}</option>`).join("");
filtros.prioridad.innerHTML += PRIORIDADES.map(p => `<option>${p}</option>`).join("") + '<option value="ninguna">Sin clasificar</option>';
filtros.tecnico.innerHTML += listaTecnicos().map(tec => `<option value="${tec.id}">${tec.nombre}</option>`).join("") + '<option value="ninguno">Sin asignar</option>';
filtros.area.innerHTML += db.areas.map(a => `<option>${a}</option>`).join("");

function ticketsFiltrados() {
  const texto = busqueda.value.trim().toLowerCase();
  const f = Object.fromEntries(Object.entries(filtros).map(([k, el]) => [k, el.value]));
  return db.tickets.filter(t => {
    if (f.estado && t.estado !== f.estado) return false;
    if (f.categoria && t.categoria !== f.categoria) return false;
    if (f.prioridad === "ninguna" && t.prioridad) return false;
    if (f.prioridad && f.prioridad !== "ninguna" && t.prioridad !== f.prioridad) return false;
    if (f.tecnico === "ninguno" && t.tecnicoId) return false;
    if (f.tecnico && f.tecnico !== "ninguno" && t.tecnicoId !== Number(f.tecnico)) return false;
    if (f.area && buscarUsuario(t.usuarioId).area !== f.area) return false;
    if (texto && !(t.codigo + " " + t.asunto + " " + nombreUsuario(t.usuarioId)).toLowerCase().includes(texto)) return false;
    return true;
  }).sort((a, b) => new Date(b.creado) - new Date(a.creado));
}

function pintarTabla() {
  const lista = ticketsFiltrados();
  const tabla = document.getElementById("tablaTickets");

  if (!lista.length) {
    tabla.innerHTML = `<tr><td colspan="7" class="vacio">No se encontraron tickets</td></tr>`;
    return;
  }

  tabla.innerHTML = lista.slice(0, limiteFilas).map(t => {
    const solicitante = buscarUsuario(t.usuarioId);
    return `
      <tr class="fila-clic" data-id="${t.id}">
        <td><span class="codigo">${t.codigo}</span><small>${formatearFecha(t.creado)}</small></td>
        <td>${escaparHTML(t.asunto)}<small>${t.categoria}</small></td>
        <td>${solicitante.nombre}<small>${solicitante.area}</small></td>
        <td>${t.tecnicoId ? nombreUsuario(t.tecnicoId) : '<span class="tenue">Sin asignar</span>'}</td>
        <td>${etiquetaPrioridad(t.prioridad)}</td>
        <td>${etiquetaEstado(t.estado)}</td>
        <td>${etiquetaSLA(t)}</td>
      </tr>`;
  }).join("") + filaMostrarMas(7, Math.min(limiteFilas, lista.length), lista.length);

  tabla.querySelectorAll(".fila-clic").forEach(fila => {
    fila.addEventListener("click", () => location.href = "ticket.html?id=" + fila.dataset.id);
  });
  const mas = tabla.querySelector("[data-mostrar-mas]");
  if (mas) mas.addEventListener("click", () => { limiteFilas += 25; pintarTabla(); });
}

busqueda.addEventListener("input", () => { limiteFilas = 25; pintarTabla(); });
Object.values(filtros).forEach(el => el.addEventListener("change", () => { limiteFilas = 25; pintarTabla(); }));

document.getElementById("btnExportar").addEventListener("click", () => {
  exportarExcel(filasParaExcel(ticketsFiltrados()), "lista-tickets-" + fechaISOLocal(new Date()));
});

// =========================================================
function pintarTodo() {
  pintarAhora();
  pintarSinAsignar();
  pintarPeriodo();
  pintarTabla();
  pintarNotificaciones(yo);
}

pintarTodo();

// Cada minuto traemos los cambios del servidor
setInterval(async () => {
  if (await intentar(cargarEstado) === null) return;
  pintarAhora();
  pintarSinAsignar();
  pintarTabla();
}, 60000);
