# 🎫 Mesa de Ayuda TI — Mesa de ayuda
## Guía de instalación y lanzamiento

Sistema de tickets para el área de TI de una empresa: Python + Flask, con base de datos SQLite.
Se instala en el **servidor físico de la empresa** o en el **NAS** (QNAP de la oficina: `INSTALAR-EN-QNAP.md`)
y funciona dentro de la red de la oficina.
Todos los datos (tickets, adjuntos y respaldos) quedan **en ese servidor**, no en internet.

---

## 1. Lo que necesitas

| Qué | Detalle |
|---|---|
| **El servidor de la empresa** | Windows Server 2016 o superior (o Windows 10/11). Si es Linux, mira la sección 2b. Usa muy pocos recursos: 1 GB de RAM y 2 GB de disco libres alcanzan para años de tickets. |
| **IP fija o nombre en la red** | Pídelo a quien administre la red (ej.: `192.168.1.50` o `SERVIDOR-TI`). |
| **Python 3.12 o superior** | Descárgalo de python.org. Al instalarlo **marca "Add python.exe to PATH"**. |
| **Internet solo para instalar** | Después, el sistema funciona sin internet (salvo el correo y el login con Microsoft). |

---

## 2. Instalación (una sola vez, unos 10 minutos)

1. Copia la carpeta `mesa-ayuda-ti` al servidor, por ejemplo en `C:\MesaAyuda`.
2. Abre `.env.ejemplo` con el Bloc de notas, cambia **`URL_SISTEMA`** por la dirección del servidor
   (ej.: `http://192.168.1.50:8080`) y guárdalo como **`.env`**.
3. Revisa `cuentas-iniciales.csv` con el Bloc de notas. Ya trae las dos cuentas del equipo de TI:
   - **Administrador:** `tecnologia@empresa.com` (Laura Rojas, Jefe de TI)
   - **Analista de soporte:** `analista@empresa.com` (Carlos Quispe)
4. Doble clic en **`instalar.bat`**. Instala todo, ejecuta las pruebas, crea las dos cuentas
   y **muestra en pantalla sus contraseñas temporales**: anótalas. Al entrar por primera vez,
   cada uno elegirá su propia contraseña.
   Después borra el archivo `claves-temporales-....csv` que se crea en la carpeta.
5. Doble clic en **`iniciar.bat`**. **No cierres esa ventana:** si se cierra, el sistema se apaga
   (en el paso 4 de esta guía lo dejamos como servicio para que no dependa de la ventana).
6. Abre en el navegador la dirección que aparece en la ventana (ej.: `http://192.168.1.50:8080`).

### Permitir que las demás PCs entren (firewall)

Abre **CMD como administrador** en el servidor y ejecuta:

```
netsh advfirewall firewall add rule name="Mesa de Ayuda TI" dir=in action=allow protocol=TCP localport=8080
```

Pruébalo desde otra PC de la oficina abriendo la misma dirección.

### 2b. Si el servidor es Linux

```
sudo apt install python3 python3-venv          # (o el equivalente de tu distribución)
sudo useradd -r -m mesaayuda
sudo cp -r mesa-ayuda-ti /opt/ && sudo chown -R mesaayuda /opt/mesa-ayuda-ti
cd /opt/mesa-ayuda-ti
sudo -u mesaayuda python3 -m venv .venv
sudo -u mesaayuda .venv/bin/pip install -r requirements.txt
sudo -u mesaayuda cp .env.ejemplo .env          # edítalo con nano
sudo -u mesaayuda .venv/bin/python pruebas.py
sudo -u mesaayuda .venv/bin/python gestionar.py cuentas-iniciales
sudo cp mesa-ayuda.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now mesa-ayuda
```

Los respaldos diarios los hace el propio sistema (sección 6).

---

## 3. Roles y permisos

| Rol | Puede |
|---|---|
| **Usuario** | Crear tickets, ver solo los suyos, chatear con TI, calificar la atención, leer guías. |
| **Analista de soporte** | Tomar y atender tickets, poner en espera, resolver, transferir, notas internas, escribir guías. |
| **Administrador** | **Control total:** todo lo anterior + asignar, reportes, configuración, auditoría, y **crear o quitar usuarios, analistas y otros administradores**. |

- Puede haber **varios administradores**. El sistema no deja quitar ni desactivar al **último** administrador.
- El administrador cambia roles, áreas, nombres y correos en **Configuración → Usuarios**.
  Si el área no existe, elige **"➕ Nueva área..."** en el desplegable y créala ahí mismo.
- Solo se aceptan **correos corporativos** (los dominios de `DOMINIOS_PERMITIDOS` en `.env`).
- **Eliminar usuarios:** si la persona no tiene tickets, se borra por completo. Si tiene historial,
  se retira del sistema (ya no puede entrar), pero sus tickets se conservan para los reportes.
  Si vuelve a la empresa, agrégala con el mismo correo y recupera su historial.
  No se puede eliminar a un analista con tickets abiertos (primero se reasignan).
- El administrador también tiene **"Mi bandeja"** para atender tickets como un analista.
- **Tema claro / oscuro:** cada persona lo elige con el botón 🌙/☀️ de la barra superior y se guarda en su cuenta.

### Cambio de administrador (cuando el Jefe de TI se retira)

1. El administrador actual entra a **Configuración → Usuarios** y cambia el rol de su sucesor a **Administrador**.
2. En su propia fila aparece **"🚪 Darme de baja"** (si es el único administrador, aparece bloqueado 🔒).
3. Elige a quién pasarle sus tickets abiertos, escribe **BAJA** y confirma.
4. Su sesión se cierra, ya no puede entrar y su historial se conserva. El nuevo administrador recibe un aviso
   y queda con el control total. Si luego se suma otro administrador, él también podrá darse de baja.

---

## 4. Cargar a los usuarios

**Opción A, desde el sistema (la más fácil):** entra como administrador a **Configuración → Usuarios →
📥 Importar lista de trabajadores**. Descarga la plantilla o usa tu propio Excel (columnas Nombre, Correo, Área y Rol),
elige el archivo, revisa la vista previa y pulsa **Importar**. Al final descarga el Excel con las contraseñas temporales,
entrégalas de forma privada y borra ese archivo.

**Opción B, desde la consola del servidor:**

1. Abre `plantilla-usuarios.csv` en Excel y llena una fila por persona:
   `nombre`, `correo`, `area` y `rol` (`usuario`, `tecnico` o `admin`).
2. Guárdalo como **CSV UTF-8** con el nombre `usuarios.csv`.
3. En la carpeta del sistema, abre CMD y ejecuta:
   ```
   .venv\Scripts\activate
   python gestionar.py importar-usuarios usuarios.csv
   ```
4. Se crea el archivo `claves-temporales-FECHA.csv` con la contraseña temporal de cada persona.
   Entrégalas **de forma privada** (por ejemplo, en un sobre o por chat individual) y **borra ese archivo**.
   Cada persona deberá cambiar su contraseña la primera vez que entre.

**Opción C, uno por uno:** en el sistema, entra a **Configuración → Usuarios → Agregar usuario**.

> ¿Alguien olvidó su contraseña? Entra a Configuración → Usuarios → **Nueva contraseña**.

---

## 5. Que encienda solo al prender el servidor

En **CMD como administrador** (cambia la ruta si la instalaste en otra carpeta):

```
schtasks /create /tn "Mesa de Ayuda TI" /tr "C:\MesaAyuda\iniciar.bat" /sc onstart /ru SYSTEM /rl highest
```

Así, aunque el servidor se reinicie por actualizaciones de Windows, el sistema vuelve a funcionar solo.

---

## 6. Respaldos automáticos (muy importante)

Todos los tickets están en `datos\mesa_ayuda.db` y los adjuntos en `datos\adjuntos\`.
**El sistema hace un respaldo solo, todos los días a las 19:00** (se cambia con `RESPALDO_HORA` en `.env`).
Las copias quedan en la carpeta `respaldos\` y se guardan las últimas 30.

**Guárdalos fuera del servidor:** si el disco del servidor falla, se pierden los respaldos que están en el
mismo disco. Lo ideal es enviarlos al **NAS** con `CARPETA_RESPALDOS` en `.env`
(ver la última sección de `INSTALAR-EN-NAS.md`).

Respaldo manual en cualquier momento: doble clic en `respaldo.bat`.

**Restaurar un respaldo:** detén el sistema, reemplaza `datos\mesa_ayuda.db` por el archivo del respaldo
(cámbiale el nombre a `mesa_ayuda.db`) y vuelve a iniciarlo.

---

## 7. Plan de lanzamiento recomendado

| Semana | Qué hacer |
|---|---|
| **1. Piloto** | Ustedes dos + un área pequeña (5-8 personas). Anota dudas y errores. |
| **2. Ajustes** | Corrige lo que salió en el piloto. Escribe 5-10 guías en la Base de conocimiento. |
| **3. Lanzamiento** | Carga a todos los usuarios. Envía un correo con la dirección del sistema y un instructivo corto. |
| **4. Regla nueva** | Desde ese día, **los problemas por WhatsApp se responden con: "Por favor, crea tu ticket en …"**. Sin esta regla, la gente seguirá usando WhatsApp. |

Consejo: que el Jefe de TI anuncie el sistema. Si lo comunica la jefatura, la gente lo adopta más rápido.

---

## 8. Activar más adelante

### Inicio de sesión con Microsoft 365
1. El administrador de Microsoft 365 registra la aplicación (ver `SOLICITUD-MICROSOFT365.md`).
2. Te entrega 3 datos: **ID de inquilino**, **ID de cliente** y **secreto de cliente**.
3. Ponlos en `.env` (`MS_ID_INQUILINO`, `MS_ID_CLIENTE`, `MS_SECRETO_CLIENTE`) y reinicia el sistema.
4. Aparecerá el botón **"Iniciar sesión con Microsoft 365"**. Cuando todos lo usen sin problemas,
   cambia `PERMITIR_CLAVE_LOCAL=no` para que solo se entre con Microsoft.

⚠️ Microsoft exige **HTTPS** (dirección con `https://`) para el inicio de sesión, salvo en `localhost`.
Dentro de la oficina se puede lograr con un certificado interno: coordínalo con quien administra la red.
Mientras tanto, el inicio con correo y contraseña funciona sin problema.

### Correos automáticos
Completa la sección `SMTP_...` de `.env` con un buzón como `soporte@empresa.com` y reinicia el sistema.
Con Microsoft 365, el administrador debe habilitar **"SMTP autenticado"** para ese buzón.
Mientras no esté configurado, las notificaciones siguen funcionando dentro del sistema (la campana 🔔).

---

## 9. Problemas comunes

| Problema | Solución |
|---|---|
| Otras PCs no pueden entrar | Revisa el firewall (paso 2) y que usen la IP correcta. |
| "No hay conexión con el servidor" | La ventana de `iniciar.bat` se cerró o el servidor se apagó. |
| Las horas del SLA no cuadran | Revisa `ZONA_HORARIA` en `.env` y el horario en Configuración. |
| Un usuario no puede entrar | Revisa en Configuración que esté **activo** y genérale una nueva contraseña. |
| Quiero ver qué pasó | Configuración → **Auditoría** muestra todo lo que se hizo y quién lo hizo. |

---

## 10. Para seguir aprendiendo: cómo está hecho

```
mesa-ayuda-ti/
├── app.py          Rutas de la API: qué puede pedir cada página y quién tiene permiso
├── logica.py       Reglas del negocio: estados, SLA en horario laboral, notificaciones
├── basedatos.py    Tablas de la base de datos (SQLite)
├── correo.py       Envío de correos
├── config.py       Lee la configuración del archivo .env
├── servidor.py     Enciende el sistema (Waitress)
├── Dockerfile      Para instalarlo en un NAS o con Docker
├── docker-compose.yml
├── gestionar.py    Herramientas: crear admin, importar usuarios, respaldos
├── pruebas.py      94 pruebas automáticas de seguridad y del flujo de un ticket
└── web/            Las páginas (HTML, CSS y JavaScript). El logo está en web/img/
```

**Regla de oro:** las páginas web solo **muestran**; el **servidor decide y valida**.
Por eso, aunque alguien modifique el JavaScript en su navegador, no puede ver tickets ajenos
ni cambiar estados sin permiso.

Cada vez que cambies algo en `app.py` o `logica.py`, ejecuta `python pruebas.py`.

**Cambiar el logo o los colores:** reemplaza `web/img/logo.png` (fondo transparente) y edita
los colores `--azul` y `--rojo` al inicio de `web/css/estilos.css`.
