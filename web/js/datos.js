// =========================================================
// VALORES FIJOS DEL SISTEMA
// ---------------------------------------------------------
// Los datos reales (tickets, usuarios, configuración) ahora
// vienen del servidor. Aquí solo quedan las listas fijas.
// =========================================================

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

// Respuestas rápidas para los analistas (puedes editarlas aquí)
const RESPUESTAS_RAPIDAS = [
  { titulo: "Saludo / en camino", texto: "Hola, ya recibí tu ticket. Voy en camino a revisarlo." },
  { titulo: "Conexión remota", texto: "Hola, voy a conectarme remotamente a tu equipo. Por favor, déjalo encendido y acepta la solicitud cuando aparezca." },
  { titulo: "Pedir más información", texto: "Para ayudarte mejor, ¿podrías enviarme una captura del error y decirme desde cuándo ocurre?" },
  { titulo: "Reiniciar equipo", texto: "Por favor, guarda tu trabajo, reinicia el equipo y avísame si el problema continúa." },
  { titulo: "Esperando repuesto", texto: "El problema requiere un repuesto. Ya lo solicitamos y te avisaremos apenas llegue." },
  { titulo: "Confirmar solución", texto: "Ya realicé la corrección. ¿Puedes confirmar si todo funciona bien?" }
];
