// =========================================================
// PÁGINA: CAMBIAR CONTRASEÑA (cambiar-clave.html)
// Obligatoria la primera vez que alguien entra con su clave temporal.
// =========================================================

const yo = requerirSesion();
const obligatorio = yo.debeCambiarClave;

if (obligatorio) {
  document.getElementById("textoIntro").textContent =
    `¡Bienvenido/a, ${yo.nombre.split(" ")[0]}! Es tu primer ingreso: por seguridad, elige tu propia contraseña antes de continuar.`;
  document.getElementById("btnCancelar").textContent = "Salir";
  document.getElementById("btnCancelar").addEventListener("click", (e) => { e.preventDefault(); cerrarSesion(); });
} else {
  document.getElementById("btnCancelar").href = paginaInicio(yo);
}

document.getElementById("formClave").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = document.getElementById("mensajeError");
  const nueva = document.getElementById("nueva").value;
  if (nueva !== document.getElementById("repetir").value) {
    error.textContent = "Las contraseñas nuevas no coinciden";
    error.hidden = false;
    return;
  }
  try {
    await api("/api/cambiar-clave", { metodo: "POST", datos: { actual: document.getElementById("actual").value, nueva } });
    mostrarAviso("✅ Contraseña actualizada");
    setTimeout(() => location.href = paginaInicio(yo), 900);
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  }
});
