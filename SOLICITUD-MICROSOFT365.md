# Solicitud al administrador de Microsoft 365

**Asunto:** Registro de aplicación en Entra ID para Mesa de Ayuda TI (mesa de ayuda)

Hola,

El área de TI implementó un sistema interno de tickets (Mesa de Ayuda TI) y queremos que los
colaboradores entren con su cuenta de Microsoft 365, sin una contraseña adicional.
Para eso necesitamos tu apoyo con lo siguiente:

## 1. Registrar la aplicación (inicio de sesión)

En **portal.azure.com → Microsoft Entra ID → Registros de aplicaciones → Nuevo registro**:

| Campo | Valor |
|---|---|
| Nombre | `Mesa de Ayuda TI - Mesa de ayuda` |
| Tipos de cuenta | Solo las cuentas de este directorio organizativo (inquilino único) |
| URI de redirección | Plataforma **Web**: `https://DIRECCION-DEL-SISTEMA/login/microsoft/respuesta` |

Luego, en **Certificados y secretos → Nuevo secreto de cliente** (vigencia de 24 meses).

**Permisos:** solo `User.Read` (delegado), que viene por defecto. El sistema únicamente lee
el **nombre** y el **correo** de la persona que inicia sesión. No accede a correos, archivos ni calendarios.

**Necesitamos que nos envíes de forma segura:**
- ID de directorio (inquilino)
- ID de aplicación (cliente)
- Valor del secreto de cliente y su fecha de vencimiento

> Nota: Microsoft exige que la dirección del sistema use **HTTPS**. Necesitaremos coordinar un certificado
> para el servidor interno (por ejemplo, de la CA interna de la empresa) o un nombre de dominio con certificado.

## 2. Buzón para notificaciones por correo (opcional, pero recomendado)

Un buzón como `tecnologia@empresa.com` (puede ser un buzón compartido con licencia o un usuario de servicio)
con **SMTP autenticado** habilitado (Centro de administración de Microsoft 365 → Usuarios → Correo →
Administrar aplicaciones de correo electrónico → *SMTP autenticado*).

Se usará solo para enviar avisos automáticos: "Recibimos tu ticket", "TI respondió tu ticket", etc.

---

Quedo atento a cualquier consulta.
Gracias,

**[Tu nombre]**
Área de Tecnología de la Información
