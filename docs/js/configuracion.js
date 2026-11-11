// =========================================================
// PÁGINA: CONFIGURACIÓN (configuracion.html) — solo Jefe de TI
// Usuarios, categorías, áreas, horario, SLA, feriados y auditoría.
// Cada cambio queda registrado en la auditoría.
// =========================================================

const yo = requerirSesion(["admin"]);
construirLayout(yo, "configuracion");

// ---------- Pestañas ----------
function abrirPestana(nombre) {
  document.querySelectorAll(".pestana").forEach(p => p.classList.toggle("activa", p.dataset.tab === nombre));
  document.querySelectorAll(".panel-tab").forEach(s => s.hidden = s.id !== "tab-" + nombre);
  history.replaceState(null, "", "#" + nombre);
}
document.querySelectorAll(".pestana").forEach(p => p.addEventListener("click", () => abrirPestana(p.dataset.tab)));
if (location.hash) abrirPestana(location.hash.slice(1));

function guardarYAuditar(modulo, accion) {
  registrarAuditoria(yo, modulo, accion);
  guardar();
  mostrarAviso("✅ Cambios guardados");
  pintarAuditoria();
}

// =========================================================
// USUARIOS
// =========================================================
const buscarUsr = document.getElementById("buscarUsuario");
const filtroRol = document.getElementById("filtroRol");
filtroRol.innerHTML += Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");

function opcionesAreas(seleccion) {
  return db.areas.map(a => `<option ${a === seleccion ? "selected" : ""}>${escaparHTML(a)}</option>`).join("") +
    '<option value="__nueva__">➕ Nueva área...</option>';
}

// Pide el nombre de una área nueva, la guarda y la devuelve (o null si se cancela)
function crearAreaNueva() {
  const nombre = (prompt("Nombre de la nueva área o departamento (ej: Marketing):") || "").trim();
  if (!nombre) return null;
  const existente = db.areas.find(a => a.toLowerCase() === nombre.toLowerCase());
  if (existente) return existente;
  db.areas.push(nombre);
  db.areas.sort((a, b) => a.localeCompare(b));
  guardarYAuditar("Áreas", `creó el área ${nombre}`);
  pintarAreas();
  return nombre;
}

const DOMINIO = "empresa.com";
function opcionesRoles(seleccion) {
  return Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === seleccion ? "selected" : ""}>${v}</option>`).join("");
}

function pintarUsuarios() {
  const texto = buscarUsr.value.trim().toLowerCase();
  const lista = db.usuarios
    .filter(u => !u.eliminado)
    .filter(u => !filtroRol.value || u.rol === filtroRol.value)
    .filter(u => !texto || (u.nombre + " " + u.correo).toLowerCase().includes(texto))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const vigentes = db.usuarios.filter(u => !u.eliminado);
  const activos = vigentes.filter(u => u.activo);
  document.getElementById("resumenUsuarios").textContent =
    `${activos.length} activos · ${activos.filter(u => u.rol === "tecnico").length} analistas · ${vigentes.length - activos.length} inactivos`;

  // "Darme de baja" solo se habilita si hay OTRO administrador activo que tome el mando
  const hayOtroAdmin = db.usuarios.some(x => x.id !== yo.id && x.rol === "admin" && x.activo && !x.eliminado);

  document.getElementById("tablaUsuarios").innerHTML = lista.map(u => {
    const tickets = db.tickets.filter(t => t.usuarioId === u.id).length;
    const esYo = u.id === yo.id;
    return `
      <tr class="${u.activo ? "" : "inactivo"}">
        <td><strong>${escaparHTML(u.nombre)}</strong>${esYo ? ' <small>(tú)</small>' : ""}
          <button class="enlace" data-editar-usuario="${u.id}" title="Editar nombre y correo">✏️</button></td>
        <td>${escaparHTML(u.correo)}</td>
        <td><select data-area="${u.id}" aria-label="Área">${opcionesAreas(u.area)}</select></td>
        <td><select data-rol="${u.id}" aria-label="Rol" ${esYo ? "disabled" : ""}>${opcionesRoles(u.rol)}</select></td>
        <td>${tickets}</td>
        <td><label class="interruptor"><input type="checkbox" data-activo="${u.id}" ${u.activo ? "checked" : ""} ${esYo ? "disabled" : ""}><span></span></label></td>
        <td>${esYo
            ? (hayOtroAdmin
                ? `<button class="enlace enlace-peligro" id="btnDarmeDeBaja">🚪 Darme de baja</button>`
                : `<span class="tenue bloqueado" title="Primero nombra a otro administrador">🔒 Darme de baja<br><small>requiere otro administrador</small></span>`)
            : `<button class="enlace enlace-peligro" data-eliminar-usuario="${u.id}">🗑️ Eliminar</button>`}</td>
      </tr>`;
  }).join("") || `<tr><td colspan="6" class="vacio">Sin resultados</td></tr>`;

  // Siempre debe quedar al menos un administrador activo
  const quedaOtroAdmin = (id) => db.usuarios.some(x => x.id !== id && x.rol === "admin" && x.activo);

  document.querySelectorAll("[data-editar-usuario]").forEach(b => b.addEventListener("click", () => {
    const u = buscarUsuario(Number(b.dataset.editarUsuario));
    const nombre = prompt("Nombre completo:", u.nombre);
    if (nombre === null) return;
    const correo = prompt("Correo:", u.correo);
    if (correo === null) return;
    if (correo.trim() && db.usuarios.some(x => x.id !== u.id && x.correo.toLowerCase() === correo.trim().toLowerCase())) {
      return mostrarAviso("⚠️ Ya existe otro usuario con ese correo");
    }
    if (nombre.trim()) u.nombre = nombre.trim();
    if (correo.trim()) u.correo = correo.trim().toLowerCase();
    guardarYAuditar("Usuarios", `editó los datos de ${u.nombre}`);
    pintarUsuarios();
  }));

  const btnBaja = document.getElementById("btnDarmeDeBaja");
  if (btnBaja) btnBaja.addEventListener("click", abrirDarmeDeBaja);

  document.querySelectorAll("[data-eliminar-usuario]").forEach(b => b.addEventListener("click", () => {
    const u = buscarUsuario(Number(b.dataset.eliminarUsuario));
    if (u.rol === "admin" && !quedaOtroAdmin(u.id)) return mostrarAviso("⚠️ Debe quedar al menos un administrador activo");
    const abiertos = db.tickets.filter(t => t.tecnicoId === u.id && estaAbierto(t)).length;
    if (abiertos) return mostrarAviso(`⚠️ ${u.nombre} tiene ${abiertos} ticket(s) abiertos asignados. Reasígnalos primero.`);
    const historial = db.tickets.filter(t => t.usuarioId === u.id || t.tecnicoId === u.id).length;
    const aviso = historial
      ? `Tiene ${historial} ticket(s) en el historial: se conservarán, pero ya no podrá entrar al sistema.`
      : "No tiene tickets: se borrará por completo.";
    if (!confirm(`¿Eliminar a ${u.nombre} (${u.correo})?\n\n${aviso}\n\nSi vuelve a la empresa, puedes agregarlo otra vez con el mismo correo.`)) return;
    if (historial) {
      u.eliminado = true;
      u.activo = false;
    } else {
      db.usuarios = db.usuarios.filter(x => x.id !== u.id);
      db.notificaciones = db.notificaciones.filter(n => n.usuarioId !== u.id);
    }
    guardarYAuditar("Usuarios", `eliminó a ${u.nombre} (${u.correo})${historial ? "; se conserva su historial" : ""}`);
    mostrarAviso(`🗑️ ${u.nombre} fue eliminado`);
    pintarUsuarios();
    pintarAreas();
  }));

  document.querySelectorAll("[data-area]").forEach(sel => sel.addEventListener("change", () => {
    const u = buscarUsuario(Number(sel.dataset.area));
    if (sel.value === "__nueva__") {
      const nueva = crearAreaNueva();
      if (!nueva) return pintarUsuarios();
      sel.innerHTML = opcionesAreas(nueva);
    }
    u.area = sel.value;
    guardarYAuditar("Usuarios", `cambió el área de ${u.nombre} a ${u.area}`);
  }));

  document.querySelectorAll("[data-rol]").forEach(sel => sel.addEventListener("change", () => {
    const u = buscarUsuario(Number(sel.dataset.rol));
    if (u.rol === "admin" && sel.value !== "admin" && !quedaOtroAdmin(u.id)) {
      sel.value = "admin";
      return mostrarAviso("⚠️ Debe quedar al menos un administrador activo");
    }
    if (u.rol === "tecnico" && sel.value !== "tecnico") {
      const abiertos = db.tickets.filter(t => t.tecnicoId === u.id && estaAbierto(t)).length;
      if (abiertos && !confirm(`${u.nombre} tiene ${abiertos} tickets abiertos. Tendrás que reasignarlos. ¿Continuar?`)) {
        sel.value = u.rol;
        return;
      }
    }
    u.rol = sel.value;
    guardarYAuditar("Usuarios", `cambió el rol de ${u.nombre} a ${ROLES[u.rol]}`);
    pintarUsuarios();
  }));

  document.querySelectorAll("[data-activo]").forEach(chk => chk.addEventListener("change", () => {
    const u = buscarUsuario(Number(chk.dataset.activo));
    if (u.rol === "admin" && !chk.checked && !quedaOtroAdmin(u.id)) {
      chk.checked = true;
      return mostrarAviso("⚠️ Debe quedar al menos un administrador activo");
    }
    u.activo = chk.checked;
    guardarYAuditar("Usuarios", `${u.activo ? "activó" : "desactivó"} a ${u.nombre}`);
    pintarUsuarios();
  }));
}

document.getElementById("nuevoArea").innerHTML = opcionesAreas();
document.getElementById("nuevoRol").innerHTML = opcionesRoles("usuario");

document.getElementById("nuevoArea").addEventListener("change", (e) => {
  if (e.target.value !== "__nueva__") return;
  e.target.innerHTML = opcionesAreas(crearAreaNueva() || db.areas[0]);
});

document.getElementById("formUsuario").addEventListener("submit", (e) => {
  e.preventDefault();
  const correo = document.getElementById("nuevoCorreo").value.trim().toLowerCase();
  if (!correo.endsWith("@" + DOMINIO)) {
    mostrarAviso(`⚠️ Usa el correo corporativo (@${DOMINIO})`);
    return;
  }
  const anterior = db.usuarios.find(u => u.correo.toLowerCase() === correo);
  if (anterior && !anterior.eliminado) {
    mostrarAviso("⚠️ Ya existe un usuario con ese correo");
    return;
  }
  if (anterior) {
    // Vuelve a la empresa: se recupera con su historial
    Object.assign(anterior, {
      nombre: document.getElementById("nuevoNombre").value.trim(),
      area: document.getElementById("nuevoArea").value,
      rol: document.getElementById("nuevoRol").value,
      activo: true, eliminado: false
    });
    guardarYAuditar("Usuarios", `volvió a agregar a ${anterior.nombre} (recuperó su historial)`);
    e.target.reset();
    return pintarUsuarios();
  }
  const nuevo = {
    id: Math.max(0, ...db.usuarios.map(u => u.id)) + 1,
    nombre: document.getElementById("nuevoNombre").value.trim(),
    correo,
    area: document.getElementById("nuevoArea").value,
    rol: document.getElementById("nuevoRol").value,
    activo: true
  };
  db.usuarios.push(nuevo);
  guardarYAuditar("Usuarios", `agregó a ${nuevo.nombre} como ${ROLES[nuevo.rol]}`);
  e.target.reset();
  pintarUsuarios();
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
// En la maqueta la importación se hace en el navegador (en la versión real la hace el servidor)
const ROLES_IMPORTACION = {
  "": "usuario", "usuario": "usuario", "trabajador": "usuario", "colaborador": "usuario",
  "tecnico": "tecnico", "analista": "tecnico", "analista de soporte": "tecnico", "soporte": "tecnico",
  "admin": "admin", "administrador": "admin", "jefe de ti": "admin"
};
function claveDemo() {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(12)), n => letras[n % letras.length]).join("");
}
function importarLocal(filas, simular) {
  const vistos = new Set();
  const resultado = filas.map(f => {
    const nombre = String(f.nombre || "").replace(/\s+/g, " ").trim();
    const correo = String(f.correo || "").trim().toLowerCase();
    const area = String(f.area || "").replace(/\s+/g, " ").trim();
    const rol = ROLES_IMPORTACION[sinTildes(String(f.rol || "").replace(/\s+/g, " "))];
    const item = { fila: f.fila, nombre, correo, area, rol: rol || "" };
    const previo = db.usuarios.find(u => u.correo.toLowerCase() === correo);
    let motivo = "";
    if (nombre.length < 3) motivo = "Falta el nombre";
    else if (!/^[^\s@]+@[^\s@]+$/.test(correo)) motivo = "Correo no válido";
    else if (!correo.endsWith("@" + DOMINIO)) motivo = `Usa el correo corporativo (@${DOMINIO})`;
    else if (!rol) motivo = `Rol «${f.rol}» no válido (usa Usuario, Analista o Administrador)`;
    else if (vistos.has(correo)) motivo = "Correo repetido en la lista";
    else if (previo && !previo.eliminado) motivo = "Ya está registrado";
    if (motivo) return { ...item, estado: "omitir", motivo };
    vistos.add(correo);
    return { ...item, estado: previo ? "recuperar" : "crear" };
  });
  if (simular) return { filas: resultado };
  resultado.filter(r => r.estado !== "omitir").forEach(r => {
    const previo = db.usuarios.find(u => u.correo.toLowerCase() === r.correo);
    if (previo) Object.assign(previo, { nombre: r.nombre, area: r.area, rol: r.rol, activo: true, eliminado: false });
    else db.usuarios.push({ id: Math.max(0, ...db.usuarios.map(u => u.id)) + 1, nombre: r.nombre, correo: r.correo, area: r.area, rol: r.rol, activo: true });
    if (r.area && !db.areas.includes(r.area)) { db.areas.push(r.area); db.areas.sort((a, b) => a.localeCompare(b)); }
    r.claveTemporal = claveDemo();
  });
  guardarYAuditar("Usuarios", `importó ${resultado.filter(r => r.claveTemporal).length} usuario(s) desde una lista`);
  return { filas: resultado };
}



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
  const r = importarLocal(filasImportar, false);
  if (!r) { e.target.disabled = false; e.target.textContent = "📥 Importar"; return; }
  pintarUsuarios(); pintarAreas();
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
      "Contraseña temporal": f.claveTemporal, "Dirección del sistema": "http://IP-DEL-NAS:8090"
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
    const r = importarLocal(filas, true);
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
function pintarCategorias() {
  document.getElementById("listaCategorias").innerHTML = Object.entries(db.categorias).map(([cat, subs]) => {
    const usados = db.tickets.filter(t => t.categoria === cat).length;
    return `
      <div class="bloque-categoria">
        <div class="bloque-cabecera">
          <strong>${escaparHTML(cat)}</strong>
          <small class="tenue">${usados} tickets</small>
          <button class="enlace" data-borrar-cat="${escaparHTML(cat)}">Eliminar categoría</button>
        </div>
        <div class="chips">
          ${subs.map(s => `<span class="chip">${escaparHTML(s)} <button class="quitar" data-cat="${escaparHTML(cat)}" data-sub="${escaparHTML(s)}" aria-label="Quitar">×</button></span>`).join("")}
        </div>
        <form class="form-linea" data-form-sub="${escaparHTML(cat)}">
          <input type="text" placeholder="Nuevo tipo de problema" required>
          <button type="submit" class="btn btn-secundario btn-chico">➕ Agregar</button>
        </form>
      </div>`;
  }).join("");

  document.querySelectorAll("[data-form-sub]").forEach(f => f.addEventListener("submit", (e) => {
    e.preventDefault();
    const cat = f.dataset.formSub;
    const valor = f.querySelector("input").value.trim();
    if (db.categorias[cat].includes(valor)) return mostrarAviso("Ya existe");
    // "Otro" siempre queda al final
    const lista = db.categorias[cat].filter(s => s !== "Otro");
    db.categorias[cat] = [...lista, valor, ...(db.categorias[cat].includes("Otro") ? ["Otro"] : [])];
    guardarYAuditar("Categorías", `agregó "${valor}" en ${cat}`);
    pintarCategorias();
  }));

  document.querySelectorAll(".quitar").forEach(b => b.addEventListener("click", () => {
    const { cat, sub } = b.dataset;
    if (db.categorias[cat].length === 1) return mostrarAviso("La categoría necesita al menos un tipo");
    db.categorias[cat] = db.categorias[cat].filter(s => s !== sub);
    guardarYAuditar("Categorías", `quitó "${sub}" de ${cat}`);
    pintarCategorias();
  }));

  document.querySelectorAll("[data-borrar-cat]").forEach(b => b.addEventListener("click", () => {
    const cat = b.dataset.borrarCat;
    if (!confirm(`¿Eliminar la categoría "${cat}"? Los tickets antiguos la conservarán.`)) return;
    delete db.categorias[cat];
    guardarYAuditar("Categorías", `eliminó la categoría ${cat}`);
    pintarCategorias();
  }));
}

document.getElementById("formCategoria").addEventListener("submit", (e) => {
  e.preventDefault();
  const nombre = document.getElementById("nuevaCategoria").value.trim();
  if (db.categorias[nombre]) return mostrarAviso("Ya existe esa categoría");
  db.categorias[nombre] = ["Otro"];
  guardarYAuditar("Categorías", `creó la categoría ${nombre}`);
  e.target.reset();
  pintarCategorias();
});

function pintarAreas() {
  document.getElementById("listaAreas").innerHTML = db.areas.map(a => {
    const personas = db.usuarios.filter(u => u.area === a && !u.eliminado).length;
    return `<span class="chip">${escaparHTML(a)} <small>(${personas})</small>
      ${personas ? "" : `<button class="quitar" data-area-borrar="${escaparHTML(a)}" aria-label="Quitar">×</button>`}</span>`;
  }).join("");
  document.querySelectorAll("[data-area-borrar]").forEach(b => b.addEventListener("click", () => {
    db.areas = db.areas.filter(a => a !== b.dataset.areaBorrar);
    guardarYAuditar("Áreas", `eliminó el área ${b.dataset.areaBorrar}`);
    pintarAreas();
  }));
}

document.getElementById("formArea").addEventListener("submit", (e) => {
  e.preventDefault();
  const nombre = document.getElementById("nuevaArea").value.trim();
  if (db.areas.includes(nombre)) return mostrarAviso("Ya existe esa área");
  db.areas.push(nombre);
  db.areas.sort((a, b) => a.localeCompare(b));
  guardarYAuditar("Áreas", `creó el área ${nombre}`);
  e.target.reset();
  pintarAreas();
  document.getElementById("nuevoArea").innerHTML = opcionesAreas();
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

document.getElementById("formHorario").addEventListener("submit", (e) => {
  e.preventDefault();
  const dias = [...document.querySelectorAll("#diasSemana input:checked")].map(i => Number(i.value));
  const inicio = document.getElementById("horaInicio").value;
  const fin = document.getElementById("horaFin").value;
  if (!dias.length) return mostrarAviso("Elige al menos un día");
  if (horaAMinutos(fin) <= horaAMinutos(inicio)) return mostrarAviso("La hora de fin debe ser mayor que la de inicio");

  const sla = { respuesta: {}, solucion: {} };
  let error = false;
  document.querySelectorAll("[data-sla]").forEach(input => {
    sla[input.dataset.sla][input.dataset.p] = Math.round(Number(input.value) * 60);
  });
  PRIORIDADES.forEach(p => { if (sla.respuesta[p] > sla.solucion[p]) error = true; });
  if (error) return mostrarAviso("La respuesta no puede ser mayor que la solución");

  db.config.horario = { dias, inicio, fin };
  db.config.sla = sla;
  db.config.autocierreHoras = Number(document.getElementById("autocierre").value);
  guardarYAuditar("Horario y SLA", `actualizó el horario (${textoHorario()}) y los tiempos de SLA`);
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
    db.config.feriados = cfg().feriados.filter(x => x !== f);
    guardarYAuditar("Feriados", `eliminó el feriado ${f.nombre} (${f.fecha})`);
    pintarFeriados();
  }));
}

document.getElementById("formFeriado").addEventListener("submit", (e) => {
  e.preventDefault();
  const fecha = document.getElementById("fechaFeriado").value;
  const nombre = document.getElementById("nombreFeriado").value.trim();
  if (cfg().feriados.some(f => f.fecha === fecha)) return mostrarAviso("Esa fecha ya está registrada");
  db.config.feriados.push({ fecha, nombre });
  guardarYAuditar("Feriados", `agregó el feriado ${nombre} (${fecha})`);
  e.target.reset();
  pintarFeriados();
});

// =========================================================
// AUDITORÍA
// =========================================================
let limiteAuditoria = 50;
const buscarAud = document.getElementById("buscarAuditoria");

function auditoriaFiltrada() {
  const texto = buscarAud.value.trim().toLowerCase();
  return listaAuditoria().filter(a => !texto || (a.modulo + " " + a.accion).toLowerCase().includes(texto));
}

function pintarAuditoria() {
  const lista = auditoriaFiltrada();
  const tabla = document.getElementById("tablaAuditoria");
  tabla.innerHTML = lista.slice(0, limiteAuditoria).map(a => `
    <tr>
      <td style="white-space: nowrap;">${formatearFecha(a.fecha)}</td>
      <td>${a.ticketId ? `<a href="ticket.html?id=${a.ticketId}" class="codigo">${a.modulo}</a>` : `<span class="etiqueta estado-asignado">${a.modulo}</span>`}</td>
      <td>${escaparHTML(a.accion)}</td>
    </tr>`).join("") + filaMostrarMas(3, Math.min(limiteAuditoria, lista.length), lista.length);

  const mas = tabla.querySelector("[data-mostrar-mas]");
  if (mas) mas.addEventListener("click", () => { limiteAuditoria += 50; pintarAuditoria(); });
}

buscarAud.addEventListener("input", () => { limiteAuditoria = 50; pintarAuditoria(); });
document.getElementById("btnExportarAuditoria").addEventListener("click", () => {
  const filas = auditoriaFiltrada().map(a => ({ "Fecha": formatearFecha(a.fecha), "Ticket / módulo": a.modulo, "Acción": a.accion }));
  exportarExcel(filas, "auditoria-" + fechaISOLocal(new Date()));
});

// =========================================================
pintarUsuarios();
pintarCategorias();
pintarAreas();
pintarHorario();
pintarFeriados();
pintarAuditoria();

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
    // Maqueta: misma lógica que el servidor real
    if (!db.usuarios.some(x => x.id !== yo.id && x.rol === "admin" && x.activo && !x.eliminado)) {
      return mostrarAviso("⚠️ Primero nombra a otro administrador");
    }
    const sucesor = buscarUsuario(Number(datos.transferirA));
    misAbiertos.forEach(t => transferirTicket(t, sucesor.id, yo, `Baja de ${yo.nombre} del sistema`));
    const conHistorial = db.tickets.some(t => t.usuarioId === yo.id || t.tecnicoId === yo.id);
    if (conHistorial) { yo.eliminado = true; yo.activo = false; }
    else db.usuarios = db.usuarios.filter(x => x.id !== yo.id);
    db.usuarios.filter(x => x.rol === "admin" && x.activo).forEach(a =>
      crearNotificacion(a.id, `${yo.nombre} se dio de baja del sistema. Ahora tú administras ${NOMBRE_SISTEMA}.`, null));
    registrarAuditoria(yo, "Usuarios", `se dio de baja como administrador${sucesor ? "; sus tickets pasaron a " + sucesor.nombre : ""}`);
    guardar();
    try { localStorage.removeItem(CLAVE_SESION); } catch (error) {}
    fondo.remove();
    mostrarAviso("👋 Te diste de baja. ¡Gracias por tu trabajo!");
    setTimeout(() => location.href = "index.html", 1800);
  });
}
