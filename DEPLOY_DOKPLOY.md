# Desplegar FotoLab Studio en Dokploy desde GitHub

La opción recomendada para **FotoLab Studio 2.1** es crear un servicio de tipo **Application** con método **Dockerfile**. No requiere PostgreSQL, almacenamiento persistente ni Redis.

El editor con textos, formas, nodos y marcas por lote utiliza el mismo despliegue. Las fuentes de Google están incluidas en `static/fonts/` con sus licencias: el navegador las carga desde el propio dominio. No se necesita conexión a Google Fonts, Node.js en producción ni un proceso de compilación del frontend.

## 0. Requisitos

- Un servidor con Dokploy instalado y acceso al panel administrativo.
- Una cuenta de GitHub y un repositorio nuevo, por ejemplo `fotolab-studio`.
- Un dominio o subdominio que apunte por DNS al servidor (ej. `fotos.tudominio.com`). Puedes usar un dominio temporal de Dokploy durante las pruebas.
- Capacidad de al menos **1 GB de RAM disponible para el contenedor**; para fotos grandes y el servidor completo, más RAM es recomendable.
- HTTPS antes de ingresar la contraseña o enviar fotos. **HTTP Basic no cifra la contraseña por sí mismo.**

## 1. Subir el proyecto a GitHub

1. Descomprime el ZIP y entra en la carpeta donde están `Dockerfile`, `app.py` y `requirements.txt`.
2. Crea en GitHub un repositorio vacío llamado, por ejemplo, `fotolab-studio`.
3. Desde la terminal, ejecuta (sustituye `TU_USUARIO`):

```bash
git init
git add .
git commit -m "FotoLab Studio 2.1: despliegue de producción en Dokploy"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/fotolab-studio.git
git push -u origin main
```

**Importante:** no subas `.env`, credenciales, fotos privadas ni archivos grandes. `.gitignore` y `.dockerignore` ya están preparados.

## 2. Configurar Application en Dokploy (recomendado)

1. Ve a **Projects → Create Project** (si aún no tienes proyecto).
2. Dentro del proyecto, haz clic en **Create Service → Application**; asigna el nombre `fotolab-studio`.
3. En la pestaña **General**, conecta el proveedor **GitHub** (para repositorios privados, autoriza el acceso al repositorio), elige el repositorio y la rama `main`.
4. En **Build**, selecciona **Dockerfile**. Define **Build Path** `/` (raíz del repositorio) y **Dockerfile Path** `Dockerfile`, según aparezcan los campos en tu versión de Dokploy.
5. En **Environment**, agrega estas variables (**no** dentro de GitHub):

| Variable | Valor | Obligatoria |
|---|---|---|
| `APP_BASIC_USER` | `editor` o el usuario que elijas | Sí |
| `APP_BASIC_PASSWORD` | Contraseña privada aleatoria de **16+ caracteres** | Sí |
| `APP_ENV` | `production` (ya viene definida en Dockerfile) | Recomendado dejarla |
| `WEB_CONCURRENCY` | `1` | No |
| `GUNICORN_TIMEOUT` | `120` | No |

Genera una contraseña segura, por ejemplo con:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Se requiere autenticación para entrar al editor y llamar a las rutas de exportación y limpieza. La ruta `/api/health` no la requiere.

6. En **Domains**, agrega el dominio deseado y configura el **Container Port = 5000**, el protocolo HTTP hacia el contenedor y **HTTPS/Let's Encrypt** hacia visitantes. El TLS termina en el proxy de Dokploy.
7. Asegúrate de tener un registro DNS **A** del dominio apuntando a la IP de tu VPS y que los puertos 80/443 sean accesibles por el proxy de Dokploy.
8. Configura recursos recomendados: **1 GB RAM / 1–2 vCPU** como punto de partida. Gunicorn usa un worker por defecto para reducir picos de memoria.
9. Pulsa **Deploy**. Revisa la pestaña **Deployments** y luego **Logs** si aparece algún error.
10. En el navegador, abre `https://fotos.tudominio.com/`: debe aparecer un diálogo de usuario y contraseña antes de mostrar el editor.
11. En **General**, activa **Auto Deploy** si deseas que un nuevo push a `main` dispare un despliegue. Verifica la integración/webhook de GitHub que solicita tu versión de Dokploy.

**Monitoreo:** `/api/health` devuelve JSON y estado HTTP 200 sin autenticación. El Dockerfile incluye un `HEALTHCHECK` que consulta esa ruta cada 30 segundos.

## 3. Alternativa: Docker Compose en Dokploy

Si deseas usar un servicio **Compose** en lugar de **Application**:

1. Crea **Create Service → Compose**, y elige **Docker Compose** (no Docker Stack/Swarm, porque esta configuración compila `build:`).
2. Configura GitHub como origen, rama `main` y **Compose File** `docker-compose.dokploy.yml`.
3. En las variables de entorno, establece `APP_BASIC_USER`, `APP_BASIC_PASSWORD` y, si procede, `WEB_CONCURRENCY=1`.
4. En **Domains**, añade el dominio usando el servicio **`fotolab`** y su **puerto 5000**. No edites las etiquetas de Traefik a mano: deja que Dokploy administre el dominio.
5. Despliega y verifica el healthcheck.

El Compose para Dokploy **no expone el puerto al host**; únicamente usa `expose: 5000` para que el proxy lo encuentre. Para probar en una PC existe un archivo distinto: `compose.yaml`.

## 4. Pruebas locales con Docker Compose

En una computadora con Docker y Docker Compose:

```bash
cp .env.example .env
# Edita .env y establece una APP_BASIC_PASSWORD robusta (mín. 16 caracteres).
docker compose up --build -d
docker compose ps
curl -fsS http://127.0.0.1:5000/api/health
```

Abre `http://127.0.0.1:5000` y escribe las credenciales. El Compose local **solo vincula el puerto a 127.0.0.1**. Para apagarlo:

```bash
docker compose down
```

### Actualizar una instalación existente

En Dokploy, publica primero los commits en la rama configurada (normalmente `main`) y ejecuta **Deploy**, o espera al Auto Deploy. La incorporación de textos, formas y lotes no necesita nuevas variables de entorno ni migraciones. Conserva `static/fonts/` y sus licencias en el repositorio para que se incluyan en la imagen.

En una instalación local con Compose, una vez actualizado el código:

```bash
docker compose up --build -d
docker compose ps
curl -fsS http://127.0.0.1:5000/api/health
```

No reemplaces un `.env` existente con `.env.example`. Recarga la página después del despliegue; los módulos JavaScript y la plantilla deben corresponder a la misma revisión. En ejecución local con Python también es necesario reiniciar el servidor tras actualizar las plantillas.

## 5. Verificación funcional después del despliegue

- Acceso sin contraseña a `/` → **401 Unauthorized**.
- Acceso con contraseña a `/` → carga el editor.
- `GET /api/health` → `200` y `"ok": true`.
- Subir foto JPG/PNG/WebP, aplicar recorte, redimensionar, desenfocar, stickers y exportar.
- Descargar el original limpio y revisar que no conserve datos EXIF/GPS/ICC.
- Elegir Texto, pulsar en una posición de la imagen y escribir directamente. Confirmar con Listo o Ctrl/Cmd+Enter; volver a editar con un clic y comprobar Esc y Deshacer/Rehacer.
- Comprobar las ocho fuentes, los iconos de las seis formas, la opacidad del relleno/borde, las capas y el redimensionado mediante nodos, también con zoom y rotación.
- Verificar que `/static/fonts/Inter.ttf` y `/static/js/elements-core.js` responden con las credenciales del editor. Las solicitudes de fuentes deben ir al mismo dominio; se conserva la política `font-src 'self'`.
- Abrir `/lotes`, cargar varias fotos y un logo, aplicar ajustes generales y excepciones, y descargar el ZIP. Los presets se guardan en el navegador y origen actuales, no en el servidor.
- Probar desde móvil y desde HTTPS.
- Comprobar que al reiniciar no se pierden archivos del servidor: **no se guardan imágenes**, pero el trabajo que no se haya descargado sí se pierde al recargar la página.

## 6. Reglas de privacidad y seguridad

- **Edición visual:** se procesa en el navegador. **Exportar** y **limpiar original** envían la imagen al backend desplegado para reencodificación; por ello el servidor sí recibe la fotografía en esas operaciones.
- Las fotos se procesan en memoria y se devuelven como descarga. No se guardan en base de datos ni en carpeta de fotografías. Los proxies ajenos o configuraciones externas pueden tener sus propios logs/retención.
- **No inicies sesión por HTTP público.** Configura HTTPS antes de escribir la contraseña.
- No compartas credenciales ni dejes la aplicación abierta si el servidor es público. HTTP Basic presenta el diálogo nativo del navegador, no un formulario propio.
- El contenedor usa usuario no privilegiado, root filesystem de solo lectura en Compose, capacidades restringidas y `/tmp` temporal.
- Los límites actuales son **45 MB por petición**, formatos JPG/PNG/WebP y **35 millones de píxeles** en el backend. El editor individual admite hasta 30 MB por foto inicial y optimiza a 4200 px por lado. El lote admite hasta 50 fotos de 42 MB por archivo y procesa una a la vez; el PNG intermedio también debe caber en 42 MB. El ZIP del navegador se limita a 512 MB.
- Si esperas usuarios simultáneos, agrega un control de acceso externo, límites de tasa en Traefik y dimensionamiento de recursos. Elevar `WEB_CONCURRENCY` incrementa la memoria necesaria.
- Mantén la imagen base y las dependencias actualizadas. Revisa y ejecuta el workflow GitHub Actions en cada cambio importante.
- Si quitas o desactivas `APP_ENV=production`, también desactivas la obligación de configurar credenciales; **no lo hagas en un servidor público**.

## 7. Resolución de problemas

| Síntoma | Qué revisar |
|---|---|
| El contenedor se detiene inmediatamente | Revisa `APP_BASIC_USER` y `APP_BASIC_PASSWORD` (mín. 16 caracteres). |
| Error 502 Bad Gateway | El dominio debe apuntar al puerto de contenedor **5000**, y Gunicorn debe estar arriba. |
| El navegador solicita credenciales repetidamente | Usuario/contraseña incorrectos o secretos cambiados en Dokploy. |
| Las fotos grandes tardan o fallan | Revisa RAM disponible, límites de carga, workers y logs. |
| Fallo de HTTPS | DNS A correcto, certificado y puertos 80/443 operativos. |
| Cambios en GitHub no se publican | Verifica rama `main`, permisos del proveedor y Auto Deploy/webhook. |
| No aparecen iconos, edición directa o nodos nuevos | Confirma que se reconstruyó la imagen con la revisión esperada y recarga la página. Con Python local, reinicia el servidor para actualizar las plantillas. |
| Una fuente no carga o se bloquea la exportación | Comprueba que los TTF de `static/fonts/` están en la imagen y responden desde el mismo dominio. Revisa respuestas 401/404 y conserva sus licencias. |

Documentación oficial consultada: [Dokploy Applications](https://docs.dokploy.com/docs/core/applications), [Going Production](https://docs.dokploy.com/docs/core/applications/going-production), [Compose Domains](https://docs.dokploy.com/docs/core/docker-compose/domains).
