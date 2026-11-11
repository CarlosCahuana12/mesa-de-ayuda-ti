// =========================================================
// PÁGINA: INICIO DE SESIÓN (index.html)
// =========================================================

// Si ya inició sesión, lo mandamos directo a su página
const sesion = usuarioActual();
if (sesion) location.href = paginaInicio(sesion);

// Mostrar u ocultar la lista de cuentas de prueba
document.getElementById("btnMicrosoft").addEventListener("click", () => {
  const cuentas = document.getElementById("cuentas");
  cuentas.hidden = !cuentas.hidden;
});

// Dibujamos las cuentas agrupadas por rol
const grupos = [
  ["usuario", "👤 Usuarios de la empresa"],
  ["tecnico", "🛠️ Analistas de soporte TI"],
  ["admin", "⭐ Administrador (Jefe de TI)"]
];

document.getElementById("listaCuentas").innerHTML = grupos.map(([rol, titulo]) => `
  <p class="grupo-cuentas">${titulo}</p>
  ${db.usuarios.filter(u => u.activo).filter(u => u.rol === rol).map(u => `
    <button class="cuenta" data-id="${u.id}">
      <div class="avatar avatar-chico">${iniciales(u.nombre)}</div>
      <div><strong>${u.nombre}</strong><small>${u.correo} · ${u.area}</small></div>
    </button>`).join("")}
`).join("");

document.querySelectorAll(".cuenta").forEach(boton => {
  boton.addEventListener("click", () => iniciarSesion(Number(boton.dataset.id)));
});
