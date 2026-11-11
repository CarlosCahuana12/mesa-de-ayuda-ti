# Mesa de Ayuda TI en tu NAS QNAP TS-x64: paso a paso

Tu NAS (QNAP TS-x64, Intel Celeron de 4 núcleos) puede ejecutar el sistema con **Container Station**.
Los tickets, adjuntos y respaldos quedan **dentro del NAS**, en la oficina.

Tiempo total: unos 20 minutos. Necesitas una PC conectada a la misma red que el NAS.

---

## Paso 1. Entrar al NAS

1. Instala **Qfinder Pro** en tu PC (https://www.qnap.com/es-es/utilities) y ábrelo.
   Te muestra el NAS y su **dirección IP**, por ejemplo `192.168.1.50`. **Anótala.**
2. Haz doble clic en el NAS y entra con el usuario administrador del NAS.

> Si el NAS es nuevo, Qfinder te guía para inicializarlo (crear el usuario y el volumen de discos).

## Paso 2. Darle una IP fija (para que la dirección no cambie)

1. **Panel de control → Red y conmutador virtual → Interfaces**.
2. En el adaptador conectado: **Editar → IPv4 → Usar dirección IP estática**.
3. Deja la misma IP que tiene ahora (o una libre que te indique quien administra la red) y guarda.

## Paso 3. Instalar Container Station

1. Abre **App Center**, busca **Container Station** e instálalo.
2. Al abrirlo por primera vez te pide una carpeta: deja la que propone, **`Container`**, y pulsa **Iniciar**.

## Paso 4. Subir el sistema al NAS

1. En tu PC, descomprime `mesa-ayuda-ti.zip`. Te queda la carpeta **`mesa-ayuda-ti`**.
2. En el NAS abre **File Station** y entra a la carpeta compartida **`Container`**.
3. Pulsa **Cargar → Carpeta** y elige la carpeta `mesa-ayuda-ti`.
4. Comprueba que quede así: **`Container / mesa-ayuda-ti / app.py`**, con `app.py` dentro de `mesa-ayuda-ti`
   y no en otra subcarpeta.

## Paso 5. Encender el sistema

1. Abre **Container Station → Aplicaciones** (en versiones antiguas: **Crear → Crear aplicación**) → **Crear**.
2. **Nombre de la aplicación:** `mesa-ayuda`
3. En el recuadro de texto, borra lo que haya y **pega todo el contenido** del archivo
   **`docker-compose-qnap.yml`**. Ábrelo con el Bloc de notas para copiarlo.
4. Pulsa **Validar** y luego **Crear**.
5. Espera 1 o 2 minutos: la primera vez descarga Python y las librerías.
   En **Contenedores** debe aparecer **`mesa-ayuda`** en verde (**En ejecución**).

> ¿Algo falla? En Contenedores → `mesa-ayuda` → **Registros** (Logs) verás el mensaje. Mándame una captura.

## Paso 6. Crear tu cuenta de Administrador

1. En el navegador abre **`http://IP-DEL-NAS:8090`**, por ejemplo `http://192.168.1.50:8090`.
2. Como es la primera vez, aparece **"⭐ Primera vez"**.
3. Escribe tu nombre, tu correo @empresa.com, el área y una contraseña.
   Pulsa **Crear cuenta de Administrador y entrar**. Ya estás dentro.

> Si el administrador debe ser **Laura Rojas**, que él haga este paso, o créalo tú y luego dale el rol en
> **Configuración → Usuarios**.

## Paso 7. Agregar al equipo

- En **Configuración → Usuarios → Agregar usuario**: al guardar te muestra una **contraseña temporal**.
  Pásasela a la persona; al entrar por primera vez, elige la suya.
- Carlos (Analista de soporte): agrégalo con el rol **Analista de soporte**.
- Para 40 personas de una vez: **importar desde Excel** (ver `LEEME.md`, sección 4).

## Paso 8. Usarlo desde PCs y celulares

- Cualquier PC o celular **conectado al Wi-Fi o a la red de la oficina** entra a `http://IP-DEL-NAS:8090`.
- En el celular: ábrelo en Chrome → menú ⋮ → **Agregar a la pantalla principal**. Queda con el logo, como una app.
- Fuera de la oficina **no** funciona, y así es más seguro. Si después lo necesitas, se puede hacer con una VPN.

---

## Respaldos (muy importante)

- El sistema hace **un respaldo automático todos los días a las 19:00**, en `Container/mesa-ayuda-ti/respaldos/`,
  y guarda los últimos 30.
- Para protegerte de una falla del NAS, instala **HBS 3 (Hybrid Backup Sync)** desde el App Center
  y programa una copia diaria de `Container/mesa-ayuda-ti` a un **disco USB** o a la nube.

## Actualizar el sistema más adelante

1. Container Station → Contenedores → `mesa-ayuda` → **Detener**.
2. En File Station, reemplaza los archivos de `Container/mesa-ayuda-ti`.
   **No borres** las carpetas `datos` ni `respaldos`: ahí están los tickets.
3. Vuelve a **Iniciar** el contenedor.

## Problemas comunes

| Problema | Solución |
|---|---|
| No abre `http://IP:8090` | Revisa que el contenedor esté **En ejecución** y que uses el puerto **8090**, no 8080. |
| El contenedor se detiene solo | Mira los **Registros**. Suele ser que la carpeta no quedó en `Container/mesa-ayuda-ti`. |
| "No se puede conectar" desde el celular | El celular debe estar en el **Wi-Fi de la oficina**, no con datos móviles. |
| Olvidé mi contraseña de administrador | Contenedores → `mesa-ayuda` → **Terminal** (`sh`) → `python gestionar.py restablecer-clave tu@empresa.com` |
