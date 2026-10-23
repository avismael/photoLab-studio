# FotoLab Studio 2.1 — Flask + Docker + Dokploy

Editor fotográfico web moderno con recorte, resizing, corrección de color, desenfoque selectivo, emojis, stickers de imagen y eliminación de metadatos. Esta versión integra **configuración de producción para despliegue automático desde GitHub mediante Dokploy**.

**Guía completa paso a paso:** [DEPLOY_DOKPLOY.md](DEPLOY_DOKPLOY.md).

## Inicio rápido: Docker y GitHub

- Crea un repositorio GitHub con los archivos de esta carpeta **en la raíz**.
- Crea un servicio **Application** en Dokploy, enlaza GitHub y usa el **Dockerfile** de la raíz.
- Añade los secretos `APP_BASIC_USER` y `APP_BASIC_PASSWORD` (mínimo 16 caracteres) desde la pestaña **Environment** de Dokploy.
- Configura un dominio **HTTPS** con puerto interno `5000` y despliega.
- Prueba `GET /api/health` (no pide contraseña) y abre el editor mediante el dominio para acceder con contraseña.

> **Protección activada por defecto en Docker:** el contenedor ejecuta `APP_ENV=production` y **rechaza arrancar sin usuario y contraseña**. Nunca publiques el editor por HTTP sin TLS. Los archivos `.env` quedan fuera de Git y Docker.

## Funciones del editor

- **Ajustes:** brillo, contraste, saturación, temperatura, matiz, suavizado y presets.
- **Recorte:** libre, original, 1:1, 4:3, 16:9, 3:4; selección arrastrable y editable.
- **Redimensionado:** ancho y alto en píxeles, bloqueo de proporción y tamaños porcentuales.
- **Desenfoque:** pincel local ajustable por tamaño e intensidad.
- **Emojis y stickers:** biblioteca de emojis y stickers JPG/PNG/WebP propios; mover, escalar, girar y eliminar.
- **Historial:** deshacer/rehacer, comparación con original y zoom.
- **Exportación:** PNG, JPG, WebP; Pillow reencodifica sin conservar EXIF, GPS, XMP ni ICC.
- **Privacidad:** descargar una copia limpia de la imagen original (sin aplicar los cambios de edición).
- **UI:** adaptable a pantallas de escritorio, tabletas y móviles; sin librerías de JavaScript externas.

## Marcas de agua por lotes

Abre **Marcas por lote** en la cabecera del editor, o visita `/lotes`.

1. Añade hasta **50 fotografías** JPG, PNG o WebP. Conviene agrupar horizontales/panorámicas o verticales.
2. Carga un logo (PNG transparente recomendado, hasta 10 MB). Los logos mayores de 2048 px se reducen conservando su proporción.
3. Configura anclaje, tamaño, margen y opacidad. El tamaño corresponde al **ancho del logo como porcentaje del lado corto** de la foto; se limita si es necesario para que quepa completo. El margen también usa el lado corto.
4. Los controles editan **Todo el lote** o **Solo esta fotografía**, según el selector. Arrastrar el logo o moverlo con las flechas del teclado personaliza la foto seleccionada. Mayús + flechas mueve con pasos mayores.
5. **Usar estos ajustes en todo el lote** copia los ajustes del ámbito elegido; si es una foto personalizada, la convierte en referencia del lote. Las excepciones de las demás fotos se conservan. **Restablecer esta fotografía** elimina su excepción.
6. Revisa las miniaturas con la marca aplicada. Elige JPG, PNG o WebP y descarga un ZIP con nombres únicos.

Los presets guardan el logo y los ajustes en el almacenamiento **local de este navegador y origen**. Guardar el mismo nombre reemplaza el preset. Puedes cargarlos o eliminarlos desde el panel; borrar los datos del navegador también los elimina. No guardan las fotografías ni las excepciones del lote.

### Límites y privacidad del lote

- Se mantiene la resolución original y se respeta la orientación EXIF. Hasta 42 MB y 35 millones de píxeles por foto. Los límites de memoria/Canvas del navegador pueden ser menores en móviles.
- La edición y las miniaturas se preparan en el navegador. Cada imagen marcada se envía secuencialmente a `/api/export` como PNG sin pérdidas y el backend la reencodifica sin EXIF, GPS, XMP ni ICC. El servidor no almacena las fotos.
- El PNG de transporte también debe caber en 42 MB; una imagen muy detallada puede superar ese límite aunque su JPG original sea pequeño. Se informa del error por archivo y se continúa con los demás.
- El ZIP se construye localmente (ZIP32, método STORE: las imágenes ya están comprimidas), sin CDN ni dependencias de JavaScript. Máximo **512 MB** de resultados; si se alcanza, se detiene y debes dividir el lote. Los resultados comprimidos del ZIP permanecen en memoria hasta la descarga; no se mantienen 50 fotos decodificadas a la vez.
- Cancelar descarta el ZIP parcial y conserva el lote y sus ajustes. Los errores de archivos individuales se muestran en el panel; el ZIP incluye los resultados correctos. Al recargar o salir se pierde el lote, pero se conservan los presets guardados.

### Pruebas de lotes

Además de `pytest -q`, ejecuta con Node.js 22 o posterior (sin instalar paquetes npm):

```bash
npm test
```

Comprueba geometría proporcional, anclajes, presets, nombres únicos, cancelación y un ZIP de 50 entradas validado con `zipfile` de Python. La CI ejecuta estas pruebas junto con las del backend.

## Arquitectura

```text
FotoLab_Studio_Dokploy/
├── Dockerfile                     # Imagen Python 3.12 no-root + healthcheck
├── gunicorn.conf.py              # Servidor WSGI y control de concurrencia
├── compose.yaml                  # Pruebas Docker locales (solo localhost)
├── docker-compose.dokploy.yml    # Alternativa Dokploy Compose
├── .env.example                  # Variables sin secretos reales
├── .dockerignore                 # Contexto de build reducido
├── .gitignore                    # Evita publicar credenciales y cachés
├── .github/workflows/ci.yml      # Test Python y smoke test Docker en GitHub
├── DEPLOY_DOKPLOY.md             # Instrucciones detalladas
├── app.py                        # UI, autenticación, cabeceras, API y salud
├── image_pipeline.py             # Reencodificación segura con Pillow
├── requirements.txt
├── templates/index.html
├── static/css/styles.css
├── static/js/editor.js
├── tests/                         # Pruebas HTTP y de limpieza de imágenes
├── docs/capturas/                # Capturas del editor
├── iniciar_windows.bat           # Ejecución local sin Docker
└── iniciar_linux_mac.sh          # Ejecución local sin Docker
```

## Desarrollo local con Python

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

En modo de desarrollo (sin `APP_ENV=production`), el servidor escucha únicamente en `127.0.0.1:5000` y no exige autenticación. **No ejecutes el servidor de desarrollo de Flask en producción**: Docker usa Gunicorn.

Para ejecutar la suite de pruebas:

```bash
pip install pytest
pytest -q
```

## Notas importantes

- **Las imágenes no quedan almacenadas en el servidor**, pero sí se transfieren al servidor mediante HTTPS al utilizar exportación o limpieza del original. La edición sobre Canvas ocurre en el navegador.
- Las imágenes incrustadas en contenido visual (texto, matrículas, caras) no se eliminan mediante la limpieza de metadatos.
- Hay límites deliberados para archivos y dimensiones; el backend comprueba formato real y decodificación.
- Deshacer/rehacer se mantiene **solo durante la sesión del navegador**; al recargar la página se pierde el trabajo sin descargar.
- Diseñado inicialmente para uso personal/equipos pequeños con 1 worker de Gunicorn. Para una plataforma pública multiusuario se necesitarían cuentas, cuotas y limitación de tráfico.

## Documentación oficial de Dokploy

- [Aplicaciones](https://docs.dokploy.com/docs/core/applications)
- [Buenas prácticas de producción](https://docs.dokploy.com/docs/core/applications/going-production)
- [Dominios para Compose](https://docs.dokploy.com/docs/core/docker-compose/domains)
