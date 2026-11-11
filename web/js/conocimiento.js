// =========================================================
// PÁGINA: BASE DE CONOCIMIENTO (conocimiento.html)
// - Todos pueden buscar y leer guías.
// - El equipo de TI puede crear, editar y eliminar artículos.
// =========================================================

const yo = requerirSesion();
const esEquipoTI = yo.rol !== "usuario";
construirLayout(yo, "conocimiento");

const busqueda = document.getElementById("busqueda");
const form = document.getElementById("formArticulo");
const selCat = document.getElementById("artCategoria");
const selSub = document.getElementById("artSubcategoria");
let categoriaActiva = "";
let editandoId = null;

document.getElementById("btnCrearTicket").hidden = esEquipoTI;

function quitarTildes(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

async function recargar() {
  await intentar(cargarEstado);
  pintarChips();
  pintarArticulos();
}

// ---------- Filtro por categoría (chips) ----------
function pintarChips() {
  const categorias = ["", ...Object.keys(db.categorias)];
  document.getElementById("chips").innerHTML = categorias.map(c => {
    const cantidad = c ? db.articulos.filter(a => a.categoria === c).length : db.articulos.length;
    return `<button class="chip ${c === categoriaActiva ? "activo" : ""}" data-cat="${escaparHTML(c)}">${escaparHTML(c || "Todas")} (${cantidad})</button>`;
  }).join("");
  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      categoriaActiva = chip.dataset.cat;
      pintarChips();
      pintarArticulos();
    });
  });
}

// ---------- Lista de artículos ----------
function pintarArticulos() {
  const palabras = quitarTildes(busqueda.value.trim()).split(/\s+/).filter(Boolean);
  const lista = db.articulos
    .filter(a => !categoriaActiva || a.categoria === categoriaActiva)
    .filter(a => {
      const texto = quitarTildes(a.titulo + " " + a.contenido + " " + a.subcategoria);
      return palabras.every(p => texto.includes(p));
    })
    .sort((a, b) => b.vistas - a.vistas);

  document.getElementById("sinResultados").hidden = lista.length > 0;

  document.getElementById("listaArticulos").innerHTML = lista.map(a => `
    <details class="tarjeta articulo" data-id="${a.id}">
      <summary>
        <span class="articulo-titulo">${escaparHTML(a.titulo)}</span>
        <small class="tenue">${escaparHTML(a.categoria)}${a.subcategoria ? " › " + escaparHTML(a.subcategoria) : ""} · 👁 ${a.vistas} · 👍 ${a.utiles}</small>
      </summary>
      <div class="articulo-cuerpo">
        <p>${escaparHTML(a.contenido).replace(/\n/g, "<br>")}</p>
        <div class="articulo-pie">
          <span class="tenue">${a.autorId ? "Escrito por " + escaparHTML(nombreUsuario(a.autorId)) + " · " : ""}${formatearFecha(a.fecha)}</span>
          <div>
            <button class="btn btn-secundario btn-chico" data-util="${a.id}">👍 Me sirvió</button>
            ${esEquipoTI ? `
              <button class="btn btn-secundario btn-chico" data-editar="${a.id}">✏️ Editar</button>
              <button class="btn btn-secundario btn-chico" data-eliminar="${a.id}">🗑️ Eliminar</button>` : ""}
          </div>
        </div>
      </div>
    </details>`).join("");

  // Contamos una vista cuando se abre el artículo
  document.querySelectorAll(".articulo").forEach(el => {
    el.addEventListener("toggle", () => {
      if (el.open) api(`/api/articulos/${el.dataset.id}/vista`, { metodo: "POST" }).catch(() => {});
    });
  });

  document.querySelectorAll("[data-util]").forEach(b => b.addEventListener("click", async () => {
    b.disabled = true;
    await intentar(() => api(`/api/articulos/${b.dataset.util}/util`, { metodo: "POST" }));
    b.textContent = "¡Gracias! 👍";
  }));

  document.querySelectorAll("[data-editar]").forEach(b => b.addEventListener("click", () => abrirFormulario(Number(b.dataset.editar))));

  document.querySelectorAll("[data-eliminar]").forEach(b => b.addEventListener("click", async () => {
    const a = db.articulos.find(x => x.id === Number(b.dataset.eliminar));
    if (!confirm(`¿Eliminar el artículo "${a.titulo}"?`)) return;
    if (await intentar(() => api(`/api/articulos/${a.id}`, { metodo: "DELETE" }))) {
      mostrarAviso("🗑️ Artículo eliminado");
      recargar();
    }
  }));
}

// ---------- Crear / editar (solo TI) ----------
function llenarSubcategorias(valor = "") {
  const subs = db.categorias[selCat.value] || [];
  selSub.innerHTML = '<option value="">(General)</option>' +
    subs.map(s => `<option ${s === valor ? "selected" : ""}>${escaparHTML(s)}</option>`).join("");
}

function abrirFormulario(id = null) {
  editandoId = id;
  const a = id ? db.articulos.find(x => x.id === id) : null;
  document.getElementById("tituloForm").textContent = a ? "Editar artículo" : "Nuevo artículo";
  selCat.innerHTML = Object.keys(db.categorias).map(c => `<option ${a && a.categoria === c ? "selected" : ""}>${escaparHTML(c)}</option>`).join("");
  llenarSubcategorias(a ? a.subcategoria : "");
  document.getElementById("artTitulo").value = a ? a.titulo : "";
  document.getElementById("artContenido").value = a ? a.contenido : "";
  form.hidden = false;
  document.getElementById("artTitulo").focus();
}

if (esEquipoTI) {
  const btnNuevo = document.getElementById("btnNuevoArticulo");
  btnNuevo.hidden = false;
  btnNuevo.addEventListener("click", () => abrirFormulario());
  selCat.addEventListener("change", () => llenarSubcategorias());
  document.getElementById("btnCancelarArticulo").addEventListener("click", () => { form.hidden = true; });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const datos = {
      categoria: selCat.value,
      subcategoria: selSub.value,
      titulo: document.getElementById("artTitulo").value.trim(),
      contenido: document.getElementById("artContenido").value.trim()
    };
    const ruta = editandoId ? `/api/articulos/${editandoId}` : "/api/articulos";
    if (await intentar(() => api(ruta, { metodo: editandoId ? "PUT" : "POST", datos }))) {
      form.hidden = true;
      mostrarAviso("✅ Artículo guardado");
      recargar();
    }
  });
}

busqueda.addEventListener("input", pintarArticulos);
pintarChips();
pintarArticulos();
