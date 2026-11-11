# 🗄️ Instalar Mesa de Ayuda TI en un NAS

Sí se puede: el sistema funciona dentro del NAS con **Docker**, sin necesitar otra PC encendida.
La base de datos, los adjuntos y los respaldos quedan en el disco del NAS.

---

## ¿Mi NAS sirve?

| Marca | Qué necesita | Cómo saberlo |
|---|---|---|
| **Synology** | **Container Manager** (antes "Docker") | Centro de paquetes → busca "Container Manager". Si aparece, sirve. Suele estar en los modelos "+" (DS224+, DS923+, DS1522+...). |
| **QNAP** | **Container Station** | App Center → busca "Container Station". |
| **Otros (TrueNAS, Asustor, UGREEN...)** | Soporte de Docker / contenedores | Revisa el manual del modelo. |

Recursos: con **1 GB de RAM libre** es suficiente para 40-200 usuarios.

> ⚠️ **Lo que NO se debe hacer:** dejar el programa en un servidor Windows y poner la base de datos
> en una carpeta compartida del NAS (`\\NAS\...`). SQLite no funciona bien a través de la red y la
> base de datos se puede dañar. O el sistema completo va **dentro** del NAS (esta guía), o va en el
> servidor y el NAS se usa **solo para los respaldos** (ver al final).

---

## Instalación en Synology (Container Manager)

1. **Instala Container Manager** desde el Centro de paquetes.
2. Con **File Station**, crea la carpeta `docker/mesa-ayuda-ti` y sube ahí **todo el contenido** del ZIP.
3. En esa carpeta, copia `.env.ejemplo` como **`.env`** y edítalo (botón derecho → Abrir con Editor de texto):
   - `URL_SISTEMA=http://IP-DEL-NAS:8080` (ej.: `http://192.168.1.20:8080`)
   - Revisa `ZONA_HORARIA=America/Lima`
4. Abre **Container Manager → Proyecto → Crear**:
   - Nombre del proyecto: `mesa-ayuda`
   - Ruta: `/docker/mesa-ayuda-ti`
   - Origen: **"Usar docker-compose.yml existente"**
   - Siguiente → Siguiente → **Listo**. La primera vez tarda unos minutos (descarga Python e instala todo).
5. **Crea las cuentas iniciales** (el equipo de TI):
   - Container Manager → **Contenedor** → `mesa-ayuda` → **Acción → Abrir terminal** → Crear → `bash`
   - Escribe: `python gestionar.py cuentas-iniciales`
   - **Anota las contraseñas temporales** que aparecen y luego escribe:
     `rm -f claves-temporales-*.csv`
6. Abre en el navegador `http://IP-DEL-NAS:8080`. ¡Listo!

**Firewall del NAS:** si está activado, permite el puerto **8080** en
Panel de control → Seguridad → Firewall.

## Instalación en QNAP (Container Station)

> **Guía detallada para el QNAP TS-x64 de la oficina:** `INSTALAR-EN-QNAP.md` (con `docker-compose-qnap.yml`).

1. Instala **Container Station** desde el App Center.
2. Sube la carpeta a `/Container/mesa-ayuda-ti` y crea el `.env` igual que en el paso 3 de Synology.
3. Container Station → **Aplicaciones → Crear** → pega el contenido de `docker-compose.yml`
   (o, si usas SSH: `cd /share/Container/mesa-ayuda-ti && docker compose up -d --build`).
4. Crea las cuentas: `docker exec -it mesa-ayuda python gestionar.py cuentas-iniciales`

---

## Uso diario

| Tarea | Cómo |
|---|---|
| **Respaldos** | Automáticos todos los días a las 19:00 (`RESPALDO_HORA` en `.env`), en la carpeta `respaldos/`. |
| **Respaldo fuera del NAS** | Activa **Hyper Backup** (Synology) o **HBS 3** (QNAP) para copiar `docker/mesa-ayuda-ti` a un disco USB o a la nube. |
| **Ver errores** | Container Manager → Contenedor → `mesa-ayuda` → **Registro**. |
| **Reiniciar** | Container Manager → Proyecto → `mesa-ayuda` → Acción → Reiniciar. |
| **Actualizar a una versión nueva** | Reemplaza los archivos (¡sin borrar `datos/`, `respaldos/` ni `.env`!) y en Proyecto → Acción → **Construir**. |
| **Usuarios** | Igual que siempre: desde el sistema, en Configuración → Usuarios. |
| **Comandos** | Terminal del contenedor: `python gestionar.py respaldo`, `python gestionar.py restablecer-clave correo@empresa.com` |

---

## Alternativa: servidor Windows + NAS solo para respaldos

Si prefieres dejar el sistema en el servidor Windows, usa el NAS para guardar los respaldos:

1. En el NAS, crea una carpeta compartida (ej.: `respaldos`) y un usuario con permiso de escritura.
2. En el `.env` del servidor: `CARPETA_RESPALDOS=\\NAS-OFICINA\respaldos\mesa-ayuda`
3. El servicio del sistema debe ejecutarse con una cuenta de Windows que tenga acceso a esa carpeta
   (la cuenta SYSTEM no puede entrar a carpetas de red).

Así, si el servidor falla, los tickets están a salvo en el NAS.
