// =========================================================
// DATOS DEL SISTEMA (MAQUETA)
// ---------------------------------------------------------
// En la versión final, todo esto vendrá de la base de datos
// a través del backend (Python + Flask).
// Por ahora se guarda en el navegador con localStorage.
//
// Lo que el Laura Rojas puede cambiar desde "Configuración"
// (usuarios, categorías, horario, SLA, feriados) también
// se guarda en la base, no aquí.
// =========================================================

// v3 porque cambió la estructura de los datos
const CLAVE_DB = "mesaAyudaTI_demo_v2";

// ---------- Valores fijos del sistema ----------
// Nombre que se muestra en el sistema
const NOMBRE_SISTEMA = "Mesa de Ayuda TI";

const ESTADOS = ["Nuevo", "Asignado", "En proceso", "En espera", "Resuelto", "Cerrado"];
// La línea de progreso no muestra "En espera" (es una pausa dentro de "En proceso")
const ESTADOS_LINEA = ["Nuevo", "Asignado", "En proceso", "Resuelto", "Cerrado"];
const PRIORIDADES = ["Alta", "Media", "Baja"];
const ROLES = { usuario: "Usuario", tecnico: "Analista de soporte", admin: "Administrador" };
const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const MOTIVOS_ESPERA = [
  "Esperando respuesta del usuario",
  "Esperando repuesto o equipo",
  "Esperando al proveedor",
  "Otro"
];

// ---------- Respuestas rápidas para los analistas ----------
const RESPUESTAS_RAPIDAS = [
  { titulo: "Saludo / en camino", texto: "Hola, ya recibí tu ticket. Voy en camino a revisarlo." },
  { titulo: "Conexión remota", texto: "Hola, voy a conectarme remotamente a tu equipo. Por favor, déjalo encendido y acepta la solicitud cuando aparezca." },
  { titulo: "Pedir más información", texto: "Para ayudarte mejor, ¿podrías enviarme una captura del error y decirme desde cuándo ocurre?" },
  { titulo: "Reiniciar equipo", texto: "Por favor, guarda tu trabajo, reinicia el equipo y avísame si el problema continúa." },
  { titulo: "Esperando repuesto", texto: "El problema requiere un repuesto. Ya lo solicitamos y te avisaremos apenas llegue." },
  { titulo: "Confirmar solución", texto: "Ya realicé la corrección. ¿Puedes confirmar si todo funciona bien?" }
];

// ---------- Configuración inicial (editable desde la página Configuración) ----------
const CONFIG_INICIAL = {
  horario: { dias: [1, 2, 3, 4, 5], inicio: "08:00", fin: "17:30" },
  // SLA en MINUTOS LABORALES (solo cuentan dentro del horario de atención)
  sla: {
    respuesta: { Alta: 30, Media: 240, Baja: 480 },   // 30 min · 4 h · 1 día laboral
    solucion:  { Alta: 240, Media: 960, Baja: 2400 }  // 4 h · 2 días · 5 días laborales
  },
  autocierreHoras: 48,
  // Feriados nacionales de Perú 2026 (verifica con el calendario oficial)
  feriados: [
    { fecha: "2026-01-01", nombre: "Año Nuevo" },
    { fecha: "2026-04-02", nombre: "Jueves Santo" },
    { fecha: "2026-04-03", nombre: "Viernes Santo" },
    { fecha: "2026-05-01", nombre: "Día del Trabajo" },
    { fecha: "2026-06-07", nombre: "Batalla de Arica y Día de la Bandera" },
    { fecha: "2026-06-29", nombre: "San Pedro y San Pablo" },
    { fecha: "2026-07-23", nombre: "Día de la Fuerza Aérea del Perú" },
    { fecha: "2026-07-28", nombre: "Fiestas Patrias" },
    { fecha: "2026-07-29", nombre: "Fiestas Patrias" },
    { fecha: "2026-08-06", nombre: "Batalla de Junín" },
    { fecha: "2026-08-30", nombre: "Santa Rosa de Lima" },
    { fecha: "2026-10-08", nombre: "Combate de Angamos" },
    { fecha: "2026-11-01", nombre: "Día de Todos los Santos" },
    { fecha: "2026-12-08", nombre: "Inmaculada Concepción" },
    { fecha: "2026-12-09", nombre: "Batalla de Ayacucho" },
    { fecha: "2026-12-25", nombre: "Navidad" }
  ]
};

const AREAS_INICIALES = [
  "Administración", "Almacén", "Contabilidad", "Gerencia", "Logística", "Recursos Humanos", "Ventas", "TI"
];

const CATEGORIAS_INICIALES = {
  "Hardware": ["Computador / Laptop", "Impresora / Escáner", "Monitor, teclado o mouse", "Teléfono / Celular", "Otro"],
  "Software y Aplicaciones": ["Sistema de la empresa", "Microsoft Office / Outlook", "Teams", "Instalación de programa", "Otro"],
  "Red y Conectividad": ["Sin internet", "Internet lento", "Wi-Fi", "VPN / Acceso remoto", "Otro"],
  "Accesos y Seguridad": ["Restablecer contraseña", "Crear o dar de baja usuario", "Permisos de carpetas", "Correo sospechoso / Virus", "Otro"]
};

// ---------- Usuarios de prueba ----------
// En la versión real, nombre y correo vendrán de la cuenta Microsoft;
// el sistema solo guardará el rol, el área y si está activo.
const USUARIOS_INICIALES = [
  { id: 1,  nombre: "Ana Torres",     correo: "ana.torres@empresa.com",     area: "Contabilidad",     rol: "usuario", activo: true },
  { id: 2,  nombre: "Luis Ramos",     correo: "luis.ramos@empresa.com",     area: "Ventas",           rol: "usuario", activo: true },
  { id: 3,  nombre: "Rosa Mendoza",   correo: "rosa.mendoza@empresa.com",   area: "Recursos Humanos", rol: "usuario", activo: true },
  { id: 4,  nombre: "Pedro Vargas",   correo: "pedro.vargas@empresa.com",   area: "Logística",        rol: "usuario", activo: true },
  { id: 5,  nombre: "Lucía Flores",   correo: "lucia.flores@empresa.com",   area: "Administración",   rol: "usuario", activo: true },
  { id: 6,  nombre: "Miguel Rojas",   correo: "miguel.rojas@empresa.com",   area: "Almacén",          rol: "usuario", activo: true },
  { id: 7,  nombre: "Carmen Díaz",    correo: "carmen.diaz@empresa.com",    area: "Gerencia",         rol: "usuario", activo: true },
  { id: 8,  nombre: "Diego Paredes",  correo: "diego.paredes@empresa.com",  area: "Ventas",           rol: "usuario", activo: true },
  { id: 9,  nombre: "Sofía Chávez",   correo: "sofia.chavez@empresa.com",   area: "Contabilidad",     rol: "usuario", activo: true },
  { id: 12, nombre: "Raúl Medina",    correo: "raul.medina@empresa.com",    area: "Almacén",          rol: "usuario", activo: false },
  { id: 10, nombre: "Carlos Quispe",  correo: "analista@empresa.com",  area: "TI",               rol: "tecnico", activo: true },
  { id: 20, nombre: "Laura Rojas", correo: "tecnologia@empresa.com",  area: "TI",               rol: "admin",   activo: true }
];

// ---------- Base de conocimiento ----------
const ARTICULOS_INICIALES = [
  {
    id: 1, categoria: "Accesos y Seguridad", subcategoria: "Restablecer contraseña",
    titulo: "Cómo cambiar o recuperar mi contraseña de Microsoft 365",
    contenido: "1. Entra a office.com y haz clic en \"Iniciar sesión\".\n2. Escribe tu correo del trabajo y elige \"¿Olvidó su contraseña?\".\n3. Sigue los pasos: te enviarán un código a tu celular o correo alternativo.\n4. Crea una contraseña nueva de al menos 12 caracteres, con mayúsculas, números y símbolos.\n\nSi tu cuenta está bloqueada o no tienes celular registrado, crea un ticket en la categoría \"Accesos y Seguridad\"."
  },
  {
    id: 2, categoria: "Red y Conectividad", subcategoria: "Sin internet",
    titulo: "No tengo internet: qué revisar antes de reportar",
    contenido: "1. Revisa si tus compañeros de al lado tienen internet. Si nadie tiene, repórtalo como urgente.\n2. Si usas cable, verifica que esté bien conectado y que la luz del puerto parpadee.\n3. Si usas Wi-Fi, desactívalo y vuelve a activarlo.\n4. Reinicia el equipo.\n\nSi sigue sin funcionar, crea un ticket indicando tu ubicación."
  },
  {
    id: 3, categoria: "Hardware", subcategoria: "Impresora / Escáner",
    titulo: "La impresora no imprime",
    contenido: "1. Verifica que la impresora esté encendida y sin luces de error.\n2. Revisa que tenga papel y que no haya hojas atascadas.\n3. Apágala, espera 10 segundos y enciéndela.\n4. En tu computador, revisa que hayas elegido la impresora correcta.\n\nSi aparece un mensaje de tóner o la luz naranja sigue parpadeando, crea un ticket."
  },
  {
    id: 4, categoria: "Red y Conectividad", subcategoria: "VPN / Acceso remoto",
    titulo: "Cómo conectarme a la VPN desde casa",
    contenido: "1. Conéctate primero a tu internet de casa.\n2. Abre el programa de VPN de la empresa (icono en la barra de tareas).\n3. Inicia sesión con tu correo y contraseña del trabajo.\n4. Espera a que diga \"Conectado\" antes de abrir los sistemas.\n\nSi no tienes el programa instalado, solicítalo con un ticket."
  },
  {
    id: 5, categoria: "Accesos y Seguridad", subcategoria: "Correo sospechoso / Virus",
    titulo: "Recibí un correo sospechoso, ¿qué hago?",
    contenido: "1. No abras adjuntos ni hagas clic en enlaces.\n2. Desconfía de correos que piden contraseñas, pagos urgentes o datos bancarios.\n3. Revisa la dirección del remitente: a veces imita a una empresa conocida.\n4. Repórtalo con un ticket en \"Correo sospechoso / Virus\" y luego elimínalo.\n\nSi ya hiciste clic o escribiste tu contraseña, crea el ticket de inmediato."
  },
  {
    id: 6, categoria: "Software y Aplicaciones", subcategoria: "Teams",
    titulo: "Teams: no me escuchan o no escucho en las reuniones",
    contenido: "1. En la reunión, haz clic en \"Más\" (…) → \"Configuración del dispositivo\".\n2. Elige el micrófono y el altavoz correctos (por ejemplo, tus audífonos).\n3. Revisa que el micrófono no esté silenciado en Teams ni en los audífonos.\n4. Cierra Teams por completo y vuelve a abrirlo.\n\nSi el problema continúa, crea un ticket en \"Teams\"."
  }
].map(a => ({ ...a, autorId: 10, fecha: new Date(Date.now() - 20 * 86400000).toISOString(), vistas: 0, utiles: 0 }));

// =========================================================
// "BASE DE DATOS" EN EL NAVEGADOR
// =========================================================
function cargarDB() {
  try {
    const texto = localStorage.getItem(CLAVE_DB);
    if (texto) return JSON.parse(texto);
  } catch (error) {
    console.warn("No se pudo leer la base de datos local", error);
  }
  const db = datosIniciales();
  guardarDB(db);
  return db;
}

function guardarDB(db) {
  try {
    localStorage.setItem(CLAVE_DB, JSON.stringify(db));
  } catch (error) {
    console.warn("No se pudo guardar la base de datos local", error);
  }
}

function reiniciarDB() {
  try { localStorage.removeItem(CLAVE_DB); } catch (error) {}
}

// ---------- Ayudantes para crear tickets de ejemplo ----------
function hace(minutos) {
  return new Date(Date.now() - minutos * 60000).toISOString();
}
function msj(autorId, texto, minutos, interno = false) {
  return { autorId, texto, fecha: hace(minutos), interno };
}
function evento(texto, minutos) {
  return { sistema: true, texto, fecha: hace(minutos) };
}
function completarTicket(t) {
  return {
    ubicacion: "", adjunto: null, prioridad: null, tecnicoId: null,
    atendido: null, resuelto: null, cerrado: null,
    inicioAtencion: null, tiempoAtencionMs: 0, esperas: [],
    calificacion: null, comentarioCalificacion: "", alertaSLA: null,
    ...t
  };
}

// ---------- Historial de los últimos 2 meses (para que los reportes tengan datos) ----------
function generarHistorial() {
  let semilla = 42;
  const azar = () => { semilla = (semilla * 16807) % 2147483647; return (semilla - 1) / 2147483646; };
  const elegir = (lista) => lista[Math.floor(azar() * lista.length)];
  const entre = (min, max) => Math.round(min + azar() * (max - min));

  const casos = [
    ["Hardware", "Computador / Laptop", "La computadora se reinicia sola", "Se actualizó el controlador de video."],
    ["Hardware", "Impresora / Escáner", "El escáner no envía al correo", "Se reconfiguró el servidor de correo del escáner."],
    ["Hardware", "Monitor, teclado o mouse", "El teclado tiene teclas que no funcionan", "Se reemplazó el teclado."],
    ["Hardware", "Impresora / Escáner", "Atasco de papel en la impresora", "Se retiró el papel atascado de la bandeja 2."],
    ["Software y Aplicaciones", "Microsoft Office / Outlook", "Outlook no descarga correos", "Se reparó el perfil de Outlook."],
    ["Software y Aplicaciones", "Sistema de la empresa", "Error al generar reporte en el sistema", "Se limpió la caché del sistema y se volvió a generar."],
    ["Software y Aplicaciones", "Instalación de programa", "Instalar Zoom para reunión con cliente", "Programa instalado."],
    ["Software y Aplicaciones", "Teams", "Teams no muestra las notificaciones", "Se reinstaló Teams."],
    ["Red y Conectividad", "Wi-Fi", "El Wi-Fi se desconecta a cada rato", "Se actualizó el controlador de la tarjeta Wi-Fi."],
    ["Red y Conectividad", "VPN / Acceso remoto", "No conecta la VPN desde casa", "Se renovó el certificado de la VPN."],
    ["Red y Conectividad", "Internet lento", "Internet lento en el almacén", "Se reinició el punto de acceso del almacén."],
    ["Accesos y Seguridad", "Restablecer contraseña", "Olvidé mi contraseña del sistema", "Se generó una contraseña temporal."],
    ["Accesos y Seguridad", "Permisos de carpetas", "Necesito acceso a la carpeta de Ventas", "Permiso de lectura otorgado con autorización del jefe de área."],
    ["Accesos y Seguridad", "Correo sospechoso / Virus", "Me llegó un correo raro pidiendo mi clave", "Se bloqueó el remitente y se revisó el equipo."],
    ["Accesos y Seguridad", "Crear o dar de baja usuario", "Crear usuario para nuevo practicante", "Usuario creado con su correo y accesos básicos."]
  ];
  const comentarios = ["", "", "Muy rápido, gracias", "Excelente atención", "Todo bien", "Tardó un poco pero se resolvió", "Muy amable"];
  const usuarios = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const lista = [];
  for (let i = 0; i < 46; i++) {
    const [categoria, subcategoria, asunto, solucion] = elegir(casos);
    const usuarioId = elegir(usuarios);
    const tecnicoId = azar() < 0.6 ? 10 : 20;
    const prioridad = elegir(["Alta", "Media", "Media", "Baja", "Baja"]);
    const minCreado = entre(3 * 1440, 62 * 1440);
    const minAtendido = minCreado - entre(5, prioridad === "Alta" ? 50 : 300);
    const minResuelto = minAtendido - entre(15, 400);
    const minCerrado = minResuelto - entre(30, 900);
    const calificacion = azar() < 0.8 ? elegir([5, 5, 5, 4, 4, 4, 3, 2]) : null;
    const tecnico = tecnicoId === 10 ? "Carlos Quispe" : "Laura Rojas";
    const usuario = USUARIOS_INICIALES.find(u => u.id === usuarioId).nombre;

    lista.push(completarTicket({
      usuarioId, categoria, subcategoria, asunto, descripcion: asunto + ".",
      estado: "Cerrado", prioridad, tecnicoId,
      creado: hace(minCreado), actualizado: hace(minCerrado),
      atendido: hace(minAtendido), resuelto: hace(minResuelto), cerrado: hace(minCerrado),
      tiempoAtencionMs: (minAtendido - minResuelto) * 60000,
      calificacion, comentarioCalificacion: calificacion ? elegir(comentarios) : "",
      mensajes: [
        evento("Ticket creado", minCreado),
        msj(usuarioId, asunto + ".", minCreado),
        evento(`${tecnico} tomó el ticket con prioridad ${prioridad} e inició la atención`, minAtendido),
        msj(tecnicoId, "✅ Solución: " + solucion, minResuelto),
        evento(`${tecnico} cambió el estado a "Resuelto"`, minResuelto),
        evento(`${usuario} cambió el estado a "Cerrado"`, minCerrado),
        ...(calificacion ? [evento(`${usuario} calificó la atención con ${calificacion} ★`, minCerrado)] : [])
      ]
    }));
  }
  return lista.sort((a, b) => new Date(a.creado) - new Date(b.creado));
}

// ---------- Tickets recientes (los que están en curso) ----------
function ticketsRecientes() {
  return [
    completarTicket({
      usuarioId: 1, categoria: "Hardware", subcategoria: "Impresora / Escáner",
      asunto: "La impresora del 2do piso no imprime",
      descripcion: "Desde esta mañana mando a imprimir y no sale nada. La luz naranja parpadea.",
      ubicacion: "2do piso - Contabilidad",
      estado: "Cerrado", prioridad: "Media", tecnicoId: 10,
      creado: hace(2880), actualizado: hace(2600), atendido: hace(2850), resuelto: hace(2700), cerrado: hace(2600),
      tiempoAtencionMs: 150 * 60000, calificacion: 5, comentarioCalificacion: "¡Muy rápido, gracias Carlos!",
      mensajes: [
        evento("Ticket creado", 2880),
        msj(1, "Desde esta mañana mando a imprimir y no sale nada. La luz naranja parpadea.", 2880),
        evento("Laura Rojas asignó el ticket a Carlos Quispe con prioridad Media", 2870),
        evento('Carlos Quispe cambió el estado a "En proceso"', 2850),
        msj(10, "Hola Ana, voy en camino a revisarla.", 2850),
        msj(10, "✅ Solución: Había un atasco de papel en la bandeja 2. Ya quedó funcionando.", 2700),
        evento('Carlos Quispe cambió el estado a "Resuelto"', 2700),
        evento('Ana Torres cambió el estado a "Cerrado"', 2600),
        evento("Ana Torres calificó la atención con 5 ★", 2600)
      ]
    }),
    completarTicket({
      usuarioId: 2, categoria: "Accesos y Seguridad", subcategoria: "Restablecer contraseña",
      asunto: "No puedo entrar a mi correo",
      descripcion: "Me dice que mi contraseña es incorrecta y tengo una reunión con un cliente en 1 hora.",
      estado: "Resuelto", prioridad: "Alta", tecnicoId: 20,
      creado: hace(1500), actualizado: hace(1450), atendido: hace(1480), resuelto: hace(1450),
      tiempoAtencionMs: 30 * 60000,
      mensajes: [
        evento("Ticket creado", 1500),
        msj(2, "Me dice que mi contraseña es incorrecta y tengo una reunión con un cliente en 1 hora.", 1500),
        evento("Laura Rojas tomó el ticket con prioridad Alta", 1495),
        evento('Laura Rojas cambió el estado a "En proceso"', 1480),
        msj(20, "La cuenta se había bloqueado por varios intentos fallidos.", 1460, true),
        msj(20, "✅ Solución: Te envié una contraseña temporal a tu celular. Al entrar te pedirá cambiarla.", 1450),
        evento('Laura Rojas cambió el estado a "Resuelto"', 1450)
      ]
    }),
    completarTicket({
      usuarioId: 3, categoria: "Software y Aplicaciones", subcategoria: "Instalación de programa",
      asunto: "Instalar lector de PDF en mi equipo",
      descripcion: "Necesito un programa para abrir y firmar documentos PDF de los nuevos contratos.",
      ubicacion: "Laptop RH-04",
      estado: "En espera", prioridad: "Baja", tecnicoId: 10,
      creado: hace(600), actualizado: hace(280), atendido: hace(300),
      tiempoAtencionMs: 20 * 60000,
      esperas: [{ inicio: hace(280), fin: null, motivo: "Esperando respuesta del usuario" }],
      mensajes: [
        evento("Ticket creado", 600),
        msj(3, "Necesito un programa para abrir y firmar documentos PDF de los nuevos contratos.", 600),
        evento("Laura Rojas asignó el ticket a Carlos Quispe con prioridad Baja", 580),
        evento('Carlos Quispe cambió el estado a "En proceso"', 300),
        msj(10, "Hola Rosa, ¿a qué hora puedo conectarme remotamente a tu laptop?", 285),
        evento("Carlos Quispe puso el ticket en espera: Esperando respuesta del usuario", 280)
      ]
    }),
    completarTicket({
      usuarioId: 1, categoria: "Red y Conectividad", subcategoria: "Internet lento",
      asunto: "El internet está muy lento en Contabilidad",
      descripcion: "Todas las computadoras del área van lentas al abrir el sistema y las páginas web.",
      ubicacion: "2do piso - Contabilidad",
      estado: "En proceso", prioridad: "Media", tecnicoId: 20,
      creado: hace(400), actualizado: hace(350), atendido: hace(350), inicioAtencion: hace(350),
      mensajes: [
        evento("Ticket creado", 400),
        msj(1, "Todas las computadoras del área van lentas al abrir el sistema y las páginas web.", 400),
        evento("Laura Rojas tomó el ticket con prioridad Media", 390),
        evento('Laura Rojas cambió el estado a "En proceso"', 350),
        msj(20, "Estamos revisando el switch del 2do piso. Te aviso apenas tenga novedades.", 350)
      ]
    }),
    completarTicket({
      usuarioId: 2, categoria: "Software y Aplicaciones", subcategoria: "Sistema de la empresa",
      asunto: "El sistema de facturación se cierra solo",
      descripcion: "Cada vez que intento emitir una factura el sistema se cierra. No puedo facturar a los clientes.",
      ubicacion: "PC VEN-02", adjunto: "captura-error.png",
      estado: "Asignado", prioridad: "Alta", tecnicoId: 10,
      creado: hace(45), actualizado: hace(40),
      mensajes: [
        evento("Ticket creado", 45),
        msj(2, "Cada vez que intento emitir una factura el sistema se cierra. No puedo facturar a los clientes.", 45),
        evento("Laura Rojas asignó el ticket a Carlos Quispe con prioridad Alta", 40)
      ]
    }),
    completarTicket({
      usuarioId: 3, categoria: "Hardware", subcategoria: "Computador / Laptop",
      asunto: "Mi laptop no enciende",
      descripcion: "La dejé cargando toda la noche y hoy no prende. No hace ningún sonido.",
      ubicacion: "Laptop RH-02",
      estado: "Asignado", prioridad: "Media", tecnicoId: 20,
      creado: hace(90), actualizado: hace(85),
      mensajes: [
        evento("Ticket creado", 90),
        msj(3, "La dejé cargando toda la noche y hoy no prende. No hace ningún sonido.", 90),
        evento("Laura Rojas tomó el ticket con prioridad Media", 85)
      ]
    }),
    completarTicket({
      usuarioId: 1, categoria: "Accesos y Seguridad", subcategoria: "Permisos de carpetas",
      asunto: "Necesito acceso a la carpeta compartida de Finanzas",
      descripcion: "Mi jefe me pidió revisar los reportes mensuales que están en la carpeta de Finanzas.",
      estado: "Nuevo", creado: hace(20), actualizado: hace(20),
      mensajes: [
        evento("Ticket creado", 20),
        msj(1, "Mi jefe me pidió revisar los reportes mensuales que están en la carpeta de Finanzas.", 20)
      ]
    }),
    completarTicket({
      usuarioId: 8, categoria: "Red y Conectividad", subcategoria: "Wi-Fi",
      asunto: "No conecta el Wi-Fi en la sala de reuniones",
      descripcion: "Tengo una presentación en 30 minutos y la laptop no detecta la red de la sala.",
      ubicacion: "Sala de reuniones B",
      estado: "Nuevo", creado: hace(8), actualizado: hace(8),
      mensajes: [
        evento("Ticket creado", 8),
        msj(8, "Tengo una presentación en 30 minutos y la laptop no detecta la red de la sala.", 8)
      ]
    })
  ];
}

// =========================================================
// ARMADO DE LA BASE INICIAL
// =========================================================
function datosIniciales() {
  const tickets = [...generarHistorial(), ...ticketsRecientes()];
  tickets.forEach((t, i) => {
    t.id = i + 1;
    t.codigo = "TKC-" + String(i + 1).padStart(4, "0");
  });

  // Para escribir las notificaciones de ejemplo, buscamos los tickets por asunto
  const porAsunto = (texto) => tickets.find(t => t.asunto === texto && t.estado !== "Cerrado") || tickets.find(t => t.asunto === texto);
  const tWifi = porAsunto("No conecta el Wi-Fi en la sala de reuniones");
  const tFinanzas = porAsunto("Necesito acceso a la carpeta compartida de Finanzas");
  const tFacturacion = porAsunto("El sistema de facturación se cierra solo");
  const tLaptop = porAsunto("Mi laptop no enciende");
  const tCorreo = porAsunto("No puedo entrar a mi correo");
  const tInternet = porAsunto("El internet está muy lento en Contabilidad");
  const tPdf = porAsunto("Instalar lector de PDF en mi equipo");

  const n = (usuarioId, t, texto, minutos, leida = false) =>
    ({ id: "n" + t.id + "-" + usuarioId + "-" + minutos, usuarioId, ticketId: t.id, texto, fecha: hace(minutos), leida });

  const notificaciones = [
    n(1, tInternet, `Tu ticket ${tInternet.codigo} ahora está: En proceso`, 350),
    n(2, tCorreo, `Tu ticket ${tCorreo.codigo} ahora está: Resuelto`, 1450),
    n(3, tPdf, `TI respondió tu ticket ${tPdf.codigo}`, 285),
    n(3, tPdf, `Tu ticket ${tPdf.codigo} está en espera: Esperando respuesta del usuario`, 280),
    n(10, tFacturacion, `Se te asignó ${tFacturacion.codigo}: ${tFacturacion.asunto}`, 40),
    n(20, tLaptop, `Se te asignó ${tLaptop.codigo}: ${tLaptop.asunto}`, 85),
    n(20, tFinanzas, `Nuevo ticket ${tFinanzas.codigo} de Ana Torres: ${tFinanzas.asunto}`, 20),
    n(20, tWifi, `Nuevo ticket ${tWifi.codigo} de Diego Paredes: ${tWifi.asunto}`, 8)
  ];

  return {
    config: JSON.parse(JSON.stringify(CONFIG_INICIAL)),
    usuarios: JSON.parse(JSON.stringify(USUARIOS_INICIALES)),
    areas: [...AREAS_INICIALES],
    categorias: JSON.parse(JSON.stringify(CATEGORIAS_INICIALES)),
    articulos: JSON.parse(JSON.stringify(ARTICULOS_INICIALES)),
    tickets,
    notificaciones,
    auditoria: [],
    contador: tickets.length
  };
}
