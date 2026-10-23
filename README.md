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
