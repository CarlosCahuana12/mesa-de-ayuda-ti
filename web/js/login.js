// =========================================================
// PÁGINA: INICIO DE SESIÓN (index.html)
// - Con Microsoft 365 (cuando TI lo active en el servidor)
// - Con correo y contraseña
// =========================================================

const ERRORES = {
  "expirada": "Tu sesión expiró. Vuelve a iniciar sesión.",
  "microsoft": "No se pudo iniciar sesión con Microsoft. Intenta de nuevo.",
  "microsoft-no-configurado": "El inicio con Microsoft todavía no está activado.",
  "dominio": "Ese correo no pertenece a la empresa.",
  "no-registrado": "Tu cuenta no está registrada. Comunícate con TI.",
  "desactivado": "Tu usuario está desactivado. Comunícate con TI."
};

function mostrarError(texto) {
  const caja = document.getElementById("mensajeError");
  caja.textContent = texto;
  caja.hidden = !texto;
}

async function iniciarPagina() {
  const parametros = new URLSearchParams(location.search);
  const codigo = parametros.get("error") || (parametros.has("expirada") ? "expirada" : null);
  if (codigo) mostrarError(ERRORES[codigo] || "No se pudo iniciar sesión.");

  const publico = await api("/api/publico");

  // Si ya tiene sesión abierta, lo llevamos directo a su página
  if (publico.sesion) {
    location.href = publico.sesion.debeCambiarClave ? "cambiar-clave.html" : paginaInicio(publico.sesion);
    return;
  }

  document.getElementById("nombreSistema").textContent = publico.nombre;
  if (publico.dominios && publico.dominios.length) {
    document.getElementById("textoDominio").textContent = "(" + publico.dominios.map(d => "@" + d).join(" o ") + ")";
    document.getElementById("correo").placeholder = "nombre@" + publico.dominios[0];
  } else {
    document.getElementById("textoDominio").textContent = "";
  }
  document.title = "Iniciar sesión - " + publico.nombre;
  // Sistema recién instalado: se crea la cuenta del Administrador
  if (publico.instalacion) {
    document.getElementById("formInstalacion").hidden = false;
    document.getElementById("bloqueCodigoInst").hidden = !publico.pideCodigo;
    document.querySelector(".nota-corporativa").hidden = true;
    if (publico.dominios && publico.dominios.length) document.getElementById("instCorreo").placeholder = "nombre@" + publico.dominios[0];
    document.getElementById("instNombre").focus();
    return;
  }
  document.getElementById("btnMicrosoft").hidden = !publico.microsoft;
  document.getElementById("formLogin").hidden = !publico.claveLocal;
  document.getElementById("separador").hidden = !(publico.microsoft && publico.claveLocal);
  if (publico.claveLocal) document.getElementById("correo").focus();
}

document.getElementById("formLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = document.getElementById("btnEntrar");
  boton.disabled = true;
  boton.textContent = "Entrando...";
  mostrarError("");
  try {
    const respuesta = await api("/api/login", {
      metodo: "POST",
      datos: {
        correo: document.getElementById("correo").value.trim(),
        clave: document.getElementById("clave").value
      }
    });
    location.href = respuesta.debeCambiarClave ? "cambiar-clave.html" : paginaInicio(respuesta);
  } catch (error) {
    mostrarError(error.message);
    document.getElementById("clave").value = "";
    document.getElementById("clave").focus();
    boton.disabled = false;
    boton.textContent = "Entrar";
  }
});

document.getElementById("formInstalacion").addEventListener("submit", async (e) => {
  e.preventDefault();
  mostrarError("");
  const clave = document.getElementById("instClave").value;
  if (clave !== document.getElementById("instClave2").value) return mostrarError("Las contraseñas no coinciden.");
  const boton = document.getElementById("btnInstalar");
  boton.disabled = true;
  boton.textContent = "Creando tu cuenta...";
  try {
    const respuesta = await api("/api/instalacion", {
      metodo: "POST",
      datos: {
        codigo: document.getElementById("instCodigo").value.trim(),
        nombre: document.getElementById("instNombre").value.trim(),
        correo: document.getElementById("instCorreo").value.trim(),
        area: document.getElementById("instArea").value.trim(),
        clave
      }
    });
    location.href = paginaInicio(respuesta);
  } catch (error) {
    mostrarError(error.message);
    boton.disabled = false;
    boton.textContent = "⭐ Crear cuenta de Administrador y entrar";
  }
});

iniciarPagina();
