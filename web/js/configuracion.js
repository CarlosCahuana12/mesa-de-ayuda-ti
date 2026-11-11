// =========================================================
// PÁGINA: CONFIGURACIÓN (configuracion.html) — solo Jefe de TI
// Usuarios, categorías, áreas, horario, SLA, feriados y auditoría.
// Todo se guarda en el servidor y queda en la auditoría.
// =========================================================

const yo = requerirSesion(["admin"]);
construirLayout(yo, "configuracion");

// ---------- Pestañas ----------
function abrirPestana(nombre) {
  if (!document.getElementById("tab-" + nombre)) return;
  document.querySelectorAll(".pestana").forEach(p => p.classList.toggle("activa", p.dataset.tab === nombre));
  document.querySelectorAll(".panel-tab").forEach(s => s.hidden = s.id !== "tab-" + nombre);
  history.replaceState(null, "", "#" + nombre);
  if (nombre === "auditoria") pintarAuditoria();
}
document.querySelectorAll(".pestana").forEach(p => p.addEventListener("click", () => abrirPestana(p.dataset.tab)));

async function recargar() {
  await intentar(cargarEstado);
  pintarUsuarios();
  pintarCategorias();
  pintarAreas();
  pintarHorario();
  pintarFeriados();
}

// Guarda una lista completa (feriados, categorías o áreas)
async function guardarLista(clave, valor, descripcion) {
  const ok = await intentar(() => api("/api/config/" + clave, { metodo: "PUT", datos: { valor, descripcion } }));
  if (ok) mostrarAviso("✅ Cambios guardados");
  await recargar();
}

// Ventana para mostrar una contraseña temporal una sola vez
function mostrarClaveTemporal(nombre, clave) {
  const fondo = document.createElement("div");
  fondo.className = "modal-fondo";
  fondo.innerHTML = `
    <div class="modal">
      <h2>🔑 Contraseña temporal</h2>
      <p>Entrégale esta contraseña a <strong>${escaparHTML(nombre)}</strong> de forma privada.
        Al entrar, el sistema le pedirá cambiarla.</p>
      <p class="clave-temporal" id="claveTemporal">${escaparHTML(clave)}</p>
      <p class="ayuda">⚠️ No se volverá a mostrar. Si se pierde, genera una nueva.</p>
      <button class="btn btn-secundario" id="btnCopiarClave">📋 Copiar</button>
      <button class="btn btn-primario" id="btnCerrarModal">Listo</button>
    </div>`;
  document.body.appendChild(fondo);
  document.getElementById("btnCopiarClave").addEventListener("click", () => {
    navigator.clipboard?.writeText(clave).then(() => mostrarAviso("Copiada"), () => {});
  });
  document.getElementById("btnCerrarModal").addEventListener("click", () => fondo.remove());
}

// =========================================================
// USUARIOS
// =========================================================
const buscarUsr = document.getElementById("buscarUsuario");
const filtroRol = document.getElementById("filtroRol");
filtroRol.innerHTML += Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");

function opcionesAreas(seleccion) {
  const areas = seleccion && !db.areas.includes(seleccion) ? [seleccion, ...db.areas] : db.areas;
  return '<option value="">(Sin área)</option>' +
    areas.map(a => `<option ${a === seleccion ? "selected" : ""}>${escaparHTML(a)}</option>`).join("") +
    '<option value="__nueva__">➕ Nueva área...</option>';
}

// Pide el nombre de una área nueva, la guarda y la devuelve (o null si se cancela)
async function crearAreaNueva() {
  const nombre = (prompt("Nombre de la nueva área o departamento (ej: Marketing):") || "").trim();
  if (!nombre) return null;
  const existente = db.areas.find(a => a.toLowerCase() === nombre.toLowerCase());
  if (existente) return existente;
  const ok = await intentar(() => api("/api/config/areas", {
    metodo: "PUT", datos: { valor: [...db.areas, nombre], descripcion: `creó el área ${nombre}` }
  }));
  if (!ok) return null;
  await intentar(cargarEstado);
  pintarAreas();
  mostrarAviso(`✅ Área "${nombre}" creada`);
  return nombre;
}
function opcionesRoles(seleccion) {
  return Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === seleccion ? "selected" : ""}>${v}</option>`).join("");
}

function pintarUsuarios() {
  const texto = buscarUsr.value.trim().toLowerCase();
  const lista = db.usuarios
    .filter(u => !u.eliminado)
    .filter(u => !filtroRol.value || u.rol === filtroRol.value)
    .filter(u => !texto || (u.nombre + " " + u.correo).toLowerCase().includes(texto));

  const vigentes = db.usuarios.filter(u => !u.eliminado);
  const activos = vigentes.filter(u => u.activo);
  const sinArea = activos.filter(u => !u.area).length;
  document.getElementById("resumenUsuarios").textContent =
    `${activos.length} activos · ${activos.filter(u => u.rol === "tecnico").length} analistas · ${vigentes.length - activos.length} inactivos` +
    (sinArea ? ` · ⚠️ ${sinArea} sin área` : "");

  // "Darme de baja" solo se habilita si hay OTRO administrador activo que tome el mando
  const hayOtroAdmin = db.usuarios.some(x => x.id !== yo.id && x.rol === "admin" && x.activo && !x.eliminado);

  document.getElementById("tablaUsuarios").innerHTML = lista.map(u => {
    const tickets = db.tickets.filter(t => t.usuarioId === u.id).length;
    const esYo = u.id === yo.id;
    return `
      <tr class="${u.activo ? "" : "inactivo"}">
        <td><strong>${escaparHTML(u.nombre)}</strong>${esYo ? " <small>(tú)</small>" : ""}
          <button class="enlace" data-editar-usuario="${u.id}" title="Editar nombre y correo">✏️</button></td>
        <td>${escaparHTML(u.correo)}</td>
        <td><select data-area="${u.id}" aria-label="Área">${opcionesAreas(u.area)}</select></td>
        <td><select data-rol="${u.id}" aria-label="Rol" ${esYo ? "disabled" : ""}>${opcionesRoles(u.rol)}</select></td>
        <td>${tickets}</td>
        <td><label class="interruptor"><input type="checkbox" data-activo="${u.id}" ${u.activo ? "checked" : ""} ${esYo ? "disabled" : ""}><span></span></label></td>
        <td class="acciones-usuario">
          <button class="enlace" data-clave="${u.id}">🔑 Nueva contraseña</button>
          ${esYo
            ? (hayOtroAdmin
                ? `<button class="enlace enlace-peligro" id="btnDarmeDeBaja">🚪 Darme de baja</button>`
                : `<span class="tenue bloqueado" title="Primero nombra a otro administrador">🔒 Darme de baja<br><small>requiere otro administrador</small></span>`)
            : `<button class="enlace enlace-peligro" data-eliminar-usuario="${u.id}">🗑️ Eliminar</button>`}
        </td>
      </tr>`;
  }).join("") || `<tr><td colspan="7" class="vacio">Sin resultados</td></tr>`;

  const editar = async (id, cambios) => {
    if (await intentar(() => api("/api/usuarios/" + id, { metodo: "PATCH", datos: cambios }))) mostrarAviso("✅ Cambios guardados");
    await recargar();
  };

  document.querySelectorAll("[data-editar-usuario]").forEach(b => b.addEventListener("click", () => {
    const u = buscarUsuario(Number(b.dataset.editarUsuario));
    const nombre = prompt("Nombre completo:", u.nombre);
    if (nombre === null) return;
    const correo = prompt("Correo:", u.correo);
    if (correo === null) return;
    const cambios = {};
    if (nombre.trim() && nombre.trim() !== u.nombre) cambios.nombre = nombre.trim();
    if (correo.trim() && correo.trim().toLowerCase() !== u.correo) cambios.correo = correo.trim();
    if (Object.keys(cambios).length) editar(u.id, cambios);
  }));

  document.querySelectorAll("[data-area]").forEach(sel => sel.addEventListener("change", async () => {
    let area = sel.value;
    if (area === "__nueva__") {
      area = await crearAreaNueva();
      if (!area) return pintarUsuarios();
    }
    editar(sel.dataset.area, { area });
  }));

  const btnBaja = document.getElementById("btnDarmeDeBaja");
  if (btnBaja) btnBaja.addEventListener("click", abrirDarmeDeBaja);

  document.querySelectorAll("[data-eliminar-usuario]").forEach(b => b.addEventListener("click", async () => {
    const u = buscarUsuario(Number(b.dataset.eliminarUsuario));
    const tickets = db.tickets.filter(t => t.usuarioId === u.id || t.tecnicoId === u.id).length;
    const aviso = tickets
      ? `Tiene ${tickets} ticket(s) en el historial: se conservarán, pero ya no podrá entrar al sistema.`
      : "No tiene tickets: se borrará por completo.";
    if (!confirm(`¿Eliminar a ${u.nombre} (${u.correo})?\n\n${aviso}\n\nSi vuelve a la empresa, puedes agregarlo otra vez con el mismo correo.`)) return;
    const r = await intentar(() => api("/api/usuarios/" + u.id, { metodo: "DELETE" }));
    if (!r) return;
    mostrarAviso(r.resultado === "borrado" ? `🗑️ ${u.nombre} fue eliminado` : `🗑️ ${u.nombre} fue eliminado (su historial se conserva)`);
    await recargar();
  }));

  document.querySelectorAll("[data-rol]").forEach(sel => sel.addEventListener("change", () => {
    const u = buscarUsuario(Number(sel.dataset.rol));
    if (u.rol === "tecnico" && sel.value !== "tecnico") {
      const abiertos = db.tickets.filter(t => t.tecnicoId === u.id && estaAbierto(t)).length;
      if (abiertos && !confirm(`${u.nombre} tiene ${abiertos} tickets abiertos. Tendrás que reasignarlos. ¿Continuar?`)) {
        sel.value = u.rol;
        return;
      }
    }
    editar(u.id, { rol: sel.value });
  }));

  document.querySelectorAll("[data-activo]").forEach(chk => chk.addEventListener("change", () => editar(chk.dataset.activo, { activo: chk.checked })));

  document.querySelectorAll("[data-clave]").forEach(b => b.addEventListener("click", async () => {
    const u = buscarUsuario(Number(b.dataset.clave));
    if (!confirm(`¿Generar una contraseña temporal nueva para ${u.nombre}? La anterior dejará de funcionar.`)) return;
    const r = await intentar(() => api(`/api/usuarios/${u.id}/restablecer-clave`, { metodo: "POST" }));
    if (r) mostrarClaveTemporal(u.nombre, r.claveTemporal);
  }));
}

document.getElementById("nuevoArea").addEventListener("change", async (e) => {
  if (e.target.value !== "__nueva__") return;
  const area = await crearAreaNueva();
  e.target.innerHTML = opcionesAreas(area || "");
});

document.getElementById("formUsuario").addEventListener("submit", async (e) => {
  e.preventDefault();
  const datos = {
    nombre: document.getElementById("nuevoNombre").value.trim(),
    correo: document.getElementById("nuevoCorreo").value.trim(),
    area: document.getElementById("nuevoArea").value,
    rol: document.getElementById("nuevoRol").value
  };
  const r = await intentar(() => api("/api/usuarios", { metodo: "POST", datos }));
  if (!r) return;
  e.target.reset();
  await recargar();
  mostrarClaveTemporal(datos.nombre, r.claveTemporal);
});

// =========================================================
// IMPORTAR LISTA DE TRABAJADORES (Excel o CSV)
// =========================================================
// Nombres de columna que se reconocen (sin tildes y en minúsculas)
const COLUMNAS_IMPORTAR = {
  nombre: ["nombre", "nombres y apellidos", "apellidos y nombres", "nombre completo", "trabajador", "colaborador", "empleado"],
  nombres: ["nombres"],
  apellidos: ["apellidos", "apellido"],
  correo: ["correo", "email", "e-mail", "correo electronico", "correo corporativo", "mail"],
  area: ["area", "departamento", "gerencia", "unidad"],
  rol: ["rol", "perfil", "tipo de usuario", "tipo"]
};
let filasImportar = [];

function sinTildes(texto) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function leerFilasDeHoja(hoja) {
  const tabla = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "", raw: false });
  // La fila de títulos es la primera que tenga una columna de correo
  const indiceTitulos = tabla.findIndex(f => f.some(c => COLUMNAS_IMPORTAR.correo.includes(sinTildes(c))));
  if (indiceTitulos < 0) throw new Error("No encontré la columna «Correo». Revisa que la primera fila tenga los títulos.");
  const titulos = tabla[indiceTitulos].map(sinTildes);
  const columna = (clave) => titulos.findIndex(t => COLUMNAS_IMPORTAR[clave].includes(t));
  const c = Object.fromEntries(Object.keys(COLUMNAS_IMPORTAR).map(k => [k, columna(k)]));
  if (c.nombre < 0 && c.nombres < 0) throw new Error("No encontré la columna «Nombre».");
  const valor = (fila, i) => (i >= 0 ? String(fila[i] ?? "").trim() : "");

  return tabla.slice(indiceTitulos + 1)
    .map((fila, i) => ({
      fila: indiceTitulos + i + 2,
      nombre: valor(fila, c.nombre) || [valor(fila, c.nombres), valor(fila, c.apellidos)].filter(Boolean).join(" "),
      correo: valor(fila, c.correo),
      area: valor(fila, c.area),
      rol: valor(fila, c.rol)
    }))
    .filter(f => f.nombre || f.correo);   // ignora filas vacías
}

const ESTADO_IMPORTAR = {
  crear: '<span class="etiqueta etiqueta-ok">✅ Se creará</span>',
  recuperar: '<span class="etiqueta etiqueta-info">♻️ Vuelve (recupera su historial)</span>',
  omitir: '<span class="etiqueta etiqueta-error">⚠️ Omitida</span>'
};

function tablaImportar(filas, conClave) {
  return `
    <div class="tabla-contenedor">
      <table class="tabla tabla-importar">
        <thead><tr><th>Fila</th><th>Nombre</th><th>Correo</th><th>Área</th><th>Rol</th><th>${conClave ? "Contraseña temporal" : "Resultado"}</th></tr></thead>
        <tbody>${filas.map(f => `
          <tr class="${f.estado === "omitir" ? "fila-omitida" : ""}">
            <td>${f.fila}</td>
            <td>${escaparHTML(f.nombre || "—")}</td>
            <td>${escaparHTML(f.correo || "—")}</td>
            <td>${escaparHTML(f.area || "—")}</td>
            <td>${f.rol ? escaparHTML(ROLES[f.rol]) : "—"}</td>
            <td>${conClave && f.claveTemporal
              ? `<code class="clave-chica">${escaparHTML(f.claveTemporal)}</code>`
              : ESTADO_IMPORTAR[f.estado] + (f.motivo ? `<br><small class="tenue">${escaparHTML(f.motivo)}</small>` : "")}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function pintarRevisionImportar(filas) {
  const validas = filas.filter(f => f.estado !== "omitir").length;
  const omitidas = filas.length - validas;
  const caja = document.getElementById("resultadoImportar");
  caja.innerHTML = `
    <div class="resumen-importar">
      <strong>Revisión del archivo:</strong> ${filas.length} fila(s) ·
      <span class="texto-ok">${validas} se crearán</span>${omitidas ? ` · <span class="texto-error">${omitidas} con problemas (se omitirán)</span>` : ""}
    </div>
    ${tablaImportar(filas, false)}
    <div class="acciones-importar">
      <button type="button" class="btn btn-secundario" id="btnCancelarImportar">Cancelar</button>
      <button type="button" class="btn btn-primario" id="btnConfirmarImportar" ${validas ? "" : "disabled"}>📥 Importar ${validas} usuario(s)</button>
    </div>`;
  document.getElementById("btnCancelarImportar").addEventListener("click", limpiarImportar);
  document.getElementById("btnConfirmarImportar").addEventListener("click", confirmarImportar);
}

function limpiarImportar() {
  filasImportar = [];
  document.getElementById("resultadoImportar").innerHTML = "";
  document.getElementById("archivoImportar").value = "";
}

async function confirmarImportar(e) {
  e.target.disabled = true;
  e.target.textContent = "Importando…";
  const r = await intentar(() => api("/api/usuarios/importar", { metodo: "POST", datos: { filas: filasImportar } }));
  if (!r) { e.target.disabled = false; e.target.textContent = "📥 Importar"; return; }
  await recargar();
  const creados = r.filas.filter(f => f.claveTemporal);
  const caja = document.getElementById("resultadoImportar");
  caja.innerHTML = `
    <div class="resumen-importar exito">
      ✅ <strong>${creados.length} usuario(s) creados.</strong>
      Descarga las contraseñas temporales y entrégalas <strong>de forma privada</strong>.
      Cada persona elegirá su propia contraseña al entrar por primera vez.
      <br><small>⚠️ Las contraseñas no se volverán a mostrar. Cuando termines de entregarlas, borra el archivo descargado.</small>
    </div>
    <div class="acciones-importar">
      <button type="button" class="btn btn-primario" id="btnDescargarClaves">⬇️ Descargar contraseñas (Excel)</button>
      <button type="button" class="btn btn-secundario" id="btnTerminarImportar">Listo</button>
    </div>
    ${tablaImportar(r.filas, true)}`;
  document.getElementById("btnDescargarClaves").addEventListener("click", () => {
    const filas = creados.map(f => ({
      "Nombre": f.nombre, "Correo": f.correo, "Área": f.area, "Rol": ROLES[f.rol],
      "Contraseña temporal": f.claveTemporal, "Dirección del sistema": location.origin
    }));
    const libro = XLSX.utils.book_new();
    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja["!cols"] = [{ wch: 28 }, { wch: 32 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(libro, hoja, "Accesos");
    XLSX.writeFile(libro, `accesos-mesa-de-ayuda-${new Date().toISOString().slice(0, 10)}.xlsx`);
  });
  document.getElementById("btnTerminarImportar").addEventListener("click", limpiarImportar);
}

document.getElementById("archivoImportar").addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const caja = document.getElementById("resultadoImportar");
  caja.innerHTML = '<p class="tenue">Leyendo el archivo…</p>';
  try {
    const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
    const filas = leerFilasDeHoja(libro.Sheets[libro.SheetNames[0]]);
    if (!filas.length) throw new Error("El archivo no tiene personas debajo de los títulos.");
    const r = await api("/api/usuarios/importar", { metodo: "POST", datos: { filas, simular: true } });
    filasImportar = filas;
    pintarRevisionImportar(r.filas);
  } catch (error) {
    caja.innerHTML = `<p class="nota nota-error">⚠️ ${escaparHTML(error.message || "No se pudo leer el archivo.")}</p>`;
    e.target.value = "";
  }
});

document.getElementById("btnPlantilla").addEventListener("click", () => {
  const libro = XLSX.utils.book_new();
  const hoja = XLSX.utils.aoa_to_sheet([
    ["Nombre", "Correo", "Área", "Rol"],
    ["Ana Torres", "ana.torres@" + "empresa.com", "Contabilidad", "Usuario"],
    ["Luis Ramos", "luis.ramos@" + "empresa.com", "Ventas", "Usuario"],
    ["Carlos Quispe", "analista@" + "empresa.com", "TI", "Analista"]
  ]);
  hoja["!cols"] = [{ wch: 30 }, { wch: 34 }, { wch: 20 }, { wch: 16 }];
  const ayuda = XLSX.utils.aoa_to_sheet([
    ["Cómo llenar la plantilla"],
    ["1. Una fila por persona. Borra los ejemplos."],
    ["2. Correo: el correo corporativo de la persona."],
    ["3. Área: si no existe en el sistema, se crea sola."],
    ["4. Rol: Usuario, Analista o Administrador. Si lo dejas vacío, será Usuario."],
    ["5. Guarda el archivo y súbelo en Configuración → Usuarios → Importar lista."]
  ]);
  ayuda["!cols"] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(libro, hoja, "Trabajadores");
  XLSX.utils.book_append_sheet(libro, ayuda, "Instrucciones");
  XLSX.writeFile(libro, "plantilla-trabajadores.xlsx");
});

buscarUsr.addEventListener("input", pintarUsuarios);
filtroRol.addEventListener("change", pintarUsuarios);

// =========================================================
// CATEGORÍAS Y ÁREAS
// =========================================================
function copiaCategorias() {
  return JSON.parse(JSON.stringify(db.categorias));
}

function pintarCategorias() {
  const entradas = Object.entries(db.categorias);
  document.getElementById("listaCategorias").innerHTML = entradas.map(([cat, subs], i) => {
    const usados = db.tickets.filter(t => t.categoria === cat).length;
    return `
      <div class="bloque-categoria">
        <div class="bloque-cabecera">
          <strong>${escaparHTML(cat)}</strong>
          <small class="tenue">${usados} tickets</small>
          <button class="enlace" data-borrar-cat="${i}">Eliminar categoría</button>
        </div>
        <div class="chips">
          ${subs.map((s, j) => `<span class="chip">${escaparHTML(s)} <button class="quitar" data-cat="${i}" data-sub="${j}" aria-label="Quitar">×</button></span>`).join("")}
        </div>
        <form class="form-linea" data-form-sub="${i}">
          <input type="text" placeholder="Nuevo tipo de problema" maxlength="80" required>
          <button type="submit" class="btn btn-secundario btn-chico">➕ Agregar</button>
        </form>
      </div>`;
  }).join("");

  document.querySelectorAll("[data-form-sub]").forEach(f => f.addEventListener("submit", (e) => {
    e.preventDefault();
    const [cat] = entradas[Number(f.dataset.formSub)];
    const valor = f.querySelector("input").value.trim();
    const nuevas = copiaCategorias();
    if (nuevas[cat].includes(valor)) return mostrarAviso("Ya existe");
    // "Otro" siempre queda al final
    const tieneOtro = nuevas[cat].includes("Otro");
    nuevas[cat] = [...nuevas[cat].filter(s => s !== "Otro"), valor, ...(tieneOtro ? ["Otro"] : [])];
    guardarLista("categorias", nuevas, `agregó "${valor}" en ${cat}`);
  }));

  document.querySelectorAll(".quitar[data-sub]").forEach(b => b.addEventListener("click", () => {
    const [cat, subs] = entradas[Number(b.dataset.cat)];
    if (subs.length === 1) return mostrarAviso("La categoría necesita al menos un tipo");
    const sub = subs[Number(b.dataset.sub)];
    const nuevas = copiaCategorias();
    nuevas[cat] = nuevas[cat].filter(s => s !== sub);
    guardarLista("categorias", nuevas, `quitó "${sub}" de ${cat}`);
  }));

  document.querySelectorAll("[data-borrar-cat]").forEach(b => b.addEventListener("click", () => {
    const [cat] = entradas[Number(b.dataset.borrarCat)];
    if (entradas.length === 1) return mostrarAviso("Debe quedar al menos una categoría");
    if (!confirm(`¿Eliminar la categoría "${cat}"? Los tickets antiguos la conservarán.`)) return;
    const nuevas = copiaCategorias();
    delete nuevas[cat];
    guardarLista("categorias", nuevas, `eliminó la categoría ${cat}`);
  }));
}

document.getElementById("formCategoria").addEventListener("submit", (e) => {
  e.preventDefault();
  const nombre = document.getElementById("nuevaCategoria").value.trim();
  if (db.categorias[nombre]) return mostrarAviso("Ya existe esa categoría");
  const nuevas = copiaCategorias();
  nuevas[nombre] = ["Otro"];
  e.target.reset();
  guardarLista("categorias", nuevas, `creó la categoría ${nombre}`);
});

function pintarAreas() {
  document.getElementById("listaAreas").innerHTML = db.areas.map((a, i) => {
    const personas = db.usuarios.filter(u => u.area === a && !u.eliminado).length;
    return `<span class="chip">${escaparHTML(a)} <small>(${personas})</small>
      ${personas ? "" : `<button class="quitar" data-area-borrar="${i}" aria-label="Quitar">×</button>`}</span>`;
  }).join("");
  document.querySelectorAll("[data-area-borrar]").forEach(b => b.addEventListener("click", () => {
    const area = db.areas[Number(b.dataset.areaBorrar)];
    guardarLista("areas", db.areas.filter(a => a !== area), `eliminó el área ${area}`);
  }));
  document.getElementById("nuevoArea").innerHTML = opcionesAreas("");
}

document.getElementById("formArea").addEventListener("submit", (e) => {
  e.preventDefault();
  const nombre = document.getElementById("nuevaArea").value.trim();
  if (db.areas.includes(nombre)) return mostrarAviso("Ya existe esa área");
  e.target.reset();
  guardarLista("areas", [...db.areas, nombre], `creó el área ${nombre}`);
});

// =========================================================
// HORARIO Y SLA
// =========================================================
function pintarHorario() {
  const c = cfg();
  // Lunes primero, domingo al final
  document.getElementById("diasSemana").innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => `
    <label class="dia"><input type="checkbox" value="${d}" ${c.horario.dias.includes(d) ? "checked" : ""}> ${DIAS_SEMANA[d].slice(0, 3)}</label>`).join("");
  document.getElementById("horaInicio").value = c.horario.inicio;
  document.getElementById("horaFin").value = c.horario.fin;
  document.getElementById("autocierre").value = c.autocierreHoras;
  document.getElementById("tablaConfigSLA").innerHTML = PRIORIDADES.map(p => `
    <tr>
      <td>${etiquetaPrioridad(p)}</td>
      <td><input type="number" step="0.25" min="0.25" data-sla="respuesta" data-p="${p}" value="${c.sla.respuesta[p] / 60}" required></td>
      <td><input type="number" step="0.5" min="0.5" data-sla="solucion" data-p="${p}" value="${c.sla.solucion[p] / 60}" required></td>
    </tr>`).join("");
}

document.getElementById("formHorario").addEventListener("submit", async (e) => {
  e.preventDefault();
  const dias = [...document.querySelectorAll("#diasSemana input:checked")].map(i => Number(i.value));
  const inicio = document.getElementById("horaInicio").value;
  const fin = document.getElementById("horaFin").value;
  if (!dias.length) return mostrarAviso("Elige al menos un día");
  if (horaAMinutos(fin) <= horaAMinutos(inicio)) return mostrarAviso("La hora de fin debe ser mayor que la de inicio");

  const sla = { respuesta: {}, solucion: {} };
  document.querySelectorAll("[data-sla]").forEach(input => {
    sla[input.dataset.sla][input.dataset.p] = Math.round(Number(input.value) * 60);
  });
  if (PRIORIDADES.some(p => sla.respuesta[p] > sla.solucion[p])) return mostrarAviso("La respuesta no puede ser mayor que la solución");

  const ok = await intentar(() => api("/api/config/horario", {
    metodo: "PUT",
    datos: { horario: { dias, inicio, fin }, sla, autocierreHoras: Number(document.getElementById("autocierre").value) }
  }));
  if (!ok) return;
  mostrarAviso("✅ Horario y SLA guardados");
  await recargar();
  construirLayout(yo, "configuracion");
});

// =========================================================
// FERIADOS
// =========================================================
function pintarFeriados() {
  const lista = [...cfg().feriados].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const hoy = fechaISOLocal(new Date());
  document.getElementById("tablaFeriados").innerHTML = lista.map(f => {
    const fecha = new Date(f.fecha + "T12:00:00");
    return `
      <tr class="${f.fecha < hoy ? "inactivo" : ""}">
        <td>${fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}</td>
        <td>${DIAS_SEMANA[fecha.getDay()]}</td>
        <td>${escaparHTML(f.nombre)}</td>
        <td><button class="enlace" data-borrar-feriado="${f.fecha}">Eliminar</button></td>
      </tr>`;
  }).join("") || `<tr><td colspan="4" class="vacio">Sin feriados</td></tr>`;

  document.querySelectorAll("[data-borrar-feriado]").forEach(b => b.addEventListener("click", () => {
    const f = cfg().feriados.find(x => x.fecha === b.dataset.borrarFeriado);
    guardarLista("feriados", cfg().feriados.filter(x => x !== f), `eliminó el feriado ${f.nombre} (${f.fecha})`);
  }));
}

document.getElementById("formFeriado").addEventListener("submit", (e) => {
  e.preventDefault();
  const fecha = document.getElementById("fechaFeriado").value;
  const nombre = document.getElementById("nombreFeriado").value.trim();
  if (cfg().feriados.some(f => f.fecha === fecha)) return mostrarAviso("Esa fecha ya está registrada");
  e.target.reset();
  guardarLista("feriados", [...cfg().feriados, { fecha, nombre }], `agregó el feriado ${nombre} (${fecha})`);
});

// =========================================================
// AUDITORÍA (la arma el servidor)
// =========================================================
let limiteAuditoria = 50;
const buscarAud = document.getElementById("buscarAuditoria");

async function pedirAuditoria(limite) {
  const parametros = new URLSearchParams({ buscar: buscarAud.value.trim(), limite });
  return api("/api/auditoria?" + parametros);
}

async function pintarAuditoria() {
  const datos = await intentar(() => pedirAuditoria(limiteAuditoria));
  if (!datos) return;
  const tabla = document.getElementById("tablaAuditoria");
  tabla.innerHTML = datos.registros.map(a => `
    <tr>
      <td style="white-space: nowrap;">${formatearFecha(a.fecha)}</td>
      <td>${a.ticketId ? `<a href="ticket.html?id=${a.ticketId}" class="codigo">${escaparHTML(a.modulo)}</a>` : `<span class="etiqueta estado-asignado">${escaparHTML(a.modulo)}</span>`}</td>
      <td>${escaparHTML(a.accion)}</td>
    </tr>`).join("") || `<tr><td colspan="3" class="vacio">Sin actividad</td></tr>`;

  if (datos.hayMas) {
    tabla.innerHTML += `<tr><td colspan="3" class="mostrar-mas"><button class="btn btn-secundario btn-chico" data-mostrar-mas>Mostrar más</button></td></tr>`;
    tabla.querySelector("[data-mostrar-mas]").addEventListener("click", () => { limiteAuditoria += 50; pintarAuditoria(); });
  }
}

let esperaBusqueda = null;
buscarAud.addEventListener("input", () => {
  clearTimeout(esperaBusqueda);
  esperaBusqueda = setTimeout(() => { limiteAuditoria = 50; pintarAuditoria(); }, 300);
});

document.getElementById("btnExportarAuditoria").addEventListener("click", async () => {
  const datos = await intentar(() => pedirAuditoria(5000));
  if (!datos) return;
  const filas = datos.registros.map(a => ({ "Fecha": formatearFecha(a.fecha), "Ticket / módulo": a.modulo, "Acción": a.accion }));
  exportarExcel(filas, "auditoria-" + fechaISOLocal(new Date()));
});

// =========================================================
document.getElementById("nuevoRol").innerHTML = opcionesRoles("usuario");
pintarUsuarios();
pintarCategorias();
pintarAreas();
pintarHorario();
pintarFeriados();
abrirPestana(location.hash ? location.hash.slice(1) : "usuarios");

// =========================================================
// SUCESIÓN: "DARME DE BAJA" (solo administradores)
// Se habilita cuando existe otro administrador activo.
// Los tickets abiertos pasan a quien elijas y tu sesión se cierra.
// =========================================================
function abrirDarmeDeBaja() {
  const otrosAdmins = db.usuarios.filter(x => x.id !== yo.id && x.rol === "admin" && x.activo && !x.eliminado);
  const equipo = listaTecnicos().filter(x => x.id !== yo.id);
  const misAbiertos = db.tickets.filter(t => t.tecnicoId === yo.id && estaAbierto(t));

  const fondo = document.createElement("div");
  fondo.className = "modal-fondo";
  fondo.innerHTML = `
    <div class="modal modal-peligro" role="dialog" aria-modal="true" aria-labelledby="tituloBaja">
      <div class="modal-cabecera">
        <div class="modal-icono">🚪</div>
        <div>
          <h2 id="tituloBaja">Darme de baja</h2>
          <p>Vas a retirarte de ${escaparHTML(NOMBRE_SISTEMA)}</p>
        </div>
        <button class="modal-cerrar" id="btnCerrarBaja" aria-label="Cerrar">✕</button>
      </div>

      <div class="modal-cuerpo">
        <ul class="lista-efectos">
          <li><span>🔒</span> Ya no podrás entrar al sistema.</li>
          <li><span>🗂️</span> Tu historial (tickets, mensajes y guías) se conserva.</li>
          <li><span>👤</span> Quedará a cargo: <strong>${otrosAdmins.map(a => escaparHTML(a.nombre)).join(", ")}</strong></li>
        </ul>

        ${misAbiertos.length ? `
          <div class="campo">
            <label for="sucesorTickets">Tienes ${misAbiertos.length} ticket(s) abiertos. ¿A quién se los pasas?</label>
            <select id="sucesorTickets">
              ${equipo.map(x => `<option value="${x.id}" ${x.id === otrosAdmins[0].id ? "selected" : ""}>${escaparHTML(nombreConRol(x))}</option>`).join("")}
            </select>
          </div>` : ""}

        <div class="campo campo-confirmar">
          <label for="confirmaBaja">Para confirmar, escribe <code>BAJA</code></label>
          <input type="text" id="confirmaBaja" autocomplete="off" placeholder="BAJA">
        </div>
      </div>

      <div class="modal-pie">
        <button class="btn btn-secundario" id="btnCancelarBaja">Cancelar</button>
        <button class="btn btn-peligro" id="btnConfirmarBaja" disabled>🚪 Darme de baja</button>
      </div>
    </div>`;
  document.body.appendChild(fondo);

  const campo = document.getElementById("confirmaBaja");
  const boton = document.getElementById("btnConfirmarBaja");
  campo.addEventListener("input", () => { boton.disabled = campo.value.trim().toUpperCase() !== "BAJA"; });
  campo.focus();
  const cerrar = () => { fondo.remove(); document.removeEventListener("keydown", conEscape); };
  const conEscape = (e) => { if (e.key === "Escape") cerrar(); };
  document.addEventListener("keydown", conEscape);
  fondo.addEventListener("click", (e) => { if (e.target === fondo) cerrar(); });
  document.getElementById("btnCancelarBaja").addEventListener("click", cerrar);
  document.getElementById("btnCerrarBaja").addEventListener("click", cerrar);

  boton.addEventListener("click", async () => {
    const selector = document.getElementById("sucesorTickets");
    const datos = { confirmacion: campo.value.trim(), transferirA: selector ? Number(selector.value) : null };
    const r = await intentar(() => api("/api/mi-cuenta/baja", { metodo: "POST", datos }));
    if (!r) return;
    fondo.remove();
    mostrarAviso("👋 Te diste de baja. ¡Gracias por tu trabajo!");
    setTimeout(() => location.href = "index.html", 1800);
  });
}
