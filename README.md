# FotoLab Studio 2.1 — Flask + Docker + Dokploy

Editor fotográfico web con recorte, redimensionado, corrección de color, desenfoque selectivo, textos editables sobre la imagen, formas, capas, emojis, stickers y eliminación de metadatos. Incluye **marcas de agua por lotes de hasta 50 fotografías** y configuración de producción para despliegue desde GitHub mediante Dokploy.

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
- **Texto:** varias líneas, ocho fuentes de Google alojadas localmente, tamaño, color, alineación, estilos y opacidad.
- **Formas y capas:** rectángulos, elipses, triángulos, líneas y flechas; relleno, borde, opacidad, duplicación y orden de todos los elementos.
- **Sesión de varias imágenes:** hasta 50 fotografías abiertas, ediciones e historial independientes, miniaturas y exportación de las seleccionadas en un ZIP.

## Abrir y editar varias fotografías

1. Pulsa **Añadir fotos** o **Elegir fotografías** y selecciona varios archivos; también puedes arrastrarlos al área del editor. Se admiten hasta **50 fotos por sesión**, JPG/PNG/WebP de hasta **30 MB por archivo**. Las fotos se optimizan a un máximo de 4200 px por lado, igual que en el editor anterior.
2. Las miniaturas de la tira inferior permiten cambiar de fotografía. **Añadir fotos** incorpora más archivos sin reemplazar las ediciones existentes. Las flechas de la tira recorren las fotos y la papelera cierra la activa.
3. Cada fotografía conserva ajustes de color, desenfoques, recorte aplicado y selección de recorte en curso, dimensiones, textos, formas, emojis, stickers, zoom, herramienta e historial de Deshacer/Rehacer. Una edición de texto en curso se confirma al cambiar de foto. La biblioteca de stickers es compartida, pero los stickers colocados pertenecen a cada fotografía.
4. Las etiquetas **Original** y **Editada** comparan los píxeles/configuración de salida con el estado inicial; no indican si ya se descargó el archivo. Al cerrar una fotografía editada se solicita confirmación. Cerrar la última vuelve a la pantalla inicial.
5. Marca las casillas de las miniaturas que quieras incluir y pulsa **Exportar ZIP**. **Todas para ZIP** marca o desmarca todas. La foto activa para editar y la selección para exportar son independientes; **Exportar imagen** sigue descargando únicamente la activa.
6. Elige PNG, JPG o WebP. Cada archivo conserva su propio tamaño, recorte y elementos. El ZIP usa prefijos numéricos para que dos fotos con el mismo nombre no se sobrescriban. La exportación no cambia la foto activa ni su historial.

### Procesamiento y límites de la sesión

- Las fotos se validan secuencialmente y los archivos incorrectos se detallan en **Avisos de carga**. Alcanzar el límite de 50 no elimina fotos anteriores. Cancelar la carga conserva los archivos que ya se añadieron; cancelar un cambio de foto mantiene la activa con sus ediciones.
- Solo se conserva la fuente decodificada de la fotografía activa para editar. Al cambiar de foto o exportar se decodifica temporalmente la siguiente fuente, se aplica su estado y se liberan los lienzos temporales. El estado, los originales seleccionados y las miniaturas permanecen en la sesión del navegador.
- La exportación múltiple usa el mismo renderizador que la vista previa y la descarga individual. Procesa una foto a la vez y envía su PNG intermedio a `/api/export` para reencodificar sin metadatos; ese PNG debe caber en **42 MB**. El servidor no guarda las fotografías.
- El ZIP se construye en el navegador con un máximo de **512 MB** de resultados. Los errores de archivos individuales se muestran en el diálogo y el ZIP incluye los resultados correctos. Si se cancela o se supera el límite total, no se descarga un ZIP parcial; las ediciones se conservan para volver a intentarlo con una selección menor.
- La sesión no es un archivo de proyecto ni se guarda en el servidor o en almacenamiento local: **al recargar o salir se pierde la edición no descargada**. El navegador solicita confirmación al salir si existen fotos editadas o una operación en curso. Los presets del módulo de marcas por lote siguen guardándose aparte en el navegador.

## Textos, formas y capas

1. Abre una fotografía y elige **Texto** o **Formas** en la barra de herramientas (en móvil, deslízala horizontalmente).
2. Con **Texto** activo, pulsa directamente sobre la fotografía donde quieras escribir. Se abre un editor sobre la propia imagen, con el texto inicial seleccionado para reemplazarlo al escribir. **Añadir texto** sigue disponible como alternativa para insertar en el centro. Máximo 2000 caracteres por elemento.
3. Elige Inter, Roboto, Montserrat, Oswald, Bebas Neue, Playfair Display, Lora o Caveat. La vista previa muestra la fuente seleccionada. Las fuentes se incluyen con sus licencias en `static/fonts/`: no se consulta Google ni ningún CDN. Negrita/cursiva se habilitan cuando la familia dispone de esos estilos. La exportación espera la carga de las fuentes antes de dibujar los textos.
4. Para insertar una forma, elige rectángulo, rectángulo redondeado, elipse/círculo, triángulo, línea o flecha. Ajusta ancho y alto independientemente (valores iguales crean un círculo o un cuadrado).
5. Configura color de relleno, **opacidad del relleno**, color del borde y grosor (0 elimina el borde). La línea utiliza solo el borde; cambia su largo con Ancho y su dirección con Rotación. Relleno al 0% permite un contorno sin fondo.
6. La **opacidad del elemento** afecta a todo el elemento, incluido su borde; la opacidad del relleno solo afecta al interior. Por ejemplo: relleno negro al 40%, borde blanco de 3 px y elemento al 100% conserva el borde completamente visible.
7. Arrastra cualquier elemento o usa Centro X/Y y los botones de centrado. Con el foco fuera de los campos, las flechas mueven 1 px de salida; Mayús + flechas mueve 10 px. Los valores en píxeles corresponden a la imagen de salida y no cambian al hacer zoom.
8. **Capas** muestra de delante hacia atrás textos, formas, emojis y stickers. Seleccionar no cambia el orden. Usa Al fondo, Bajar, Subir o Al frente; Duplicar crea una copia desplazada. Todas estas ediciones participan en Deshacer/Rehacer.

### Edición de texto sobre la imagen

- **Un clic sobre un texto** abre su edición directa. El cursor se sitúa cerca del punto pulsado. Un arrastre lo mueve en lugar de abrir el editor.
- **Enter** añade un salto de línea. **Listo** o **Ctrl+Enter / Cmd+Enter** confirma. **Esc** o **Cancelar** restaura la edición anterior; si acababas de insertar el texto, elimina la nueva capa.
- Pulsar fuera del editor confirma la edición. Si Texto sigue activo y pulsas un lugar sin texto, se crea otro elemento en ese punto, incluso sobre una forma.
- El panel y el editor sobre la imagen permanecen sincronizados. Puedes cambiar fuente, tamaño, estilo, color o alineación desde el panel mientras escribes. El editor sigue el zoom y la rotación del elemento.
- La edición completa, incluidos sus ajustes, se registra al confirmar como una sola operación de Deshacer/Rehacer. Ctrl+Z dentro del campo conserva el comportamiento de edición de texto del navegador.
- Para utilizar los nodos de tamaño, termina primero con **Listo**. Exportar también confirma la edición antes de aplanar las capas, sin incluir el campo, el cursor ni sus controles.

### Redimensionar con nodos

Al seleccionar un elemento aparecen tiradores visibles sobre la imagen:

- **Formas:** arrastra las esquinas o los puntos centrales de los lados para modificar ancho y alto. Mantén **Mayús** para conservar la proporción. Las líneas tienen un nodo en cada extremo para cambiar su longitud; el grosor sigue controlándose desde el panel.
- **Texto, emojis y stickers:** arrastra una esquina para ampliar o reducir conservando las proporciones; en el texto se ajusta el tamaño de la fuente, sin deformar las letras.
- La esquina o lado opuesto permanece fijo. Los nodos siguen la rotación y mantienen un tamaño visible aunque cambies el zoom. También funcionan mediante arrastre táctil.
- **Esc** cancela el redimensionado en curso. Cada arrastre completado es una sola operación de Deshacer/Rehacer. Las guías y los nodos no aparecen en la exportación.

La paleta de formas, las acciones de orden, centrado, duplicación y las capas incluyen iconos SVG con etiquetas de texto.

Los elementos se conservan en coordenadas de la imagen base: al recortar o redimensionar, siguen la misma transformación que la fotografía. Los ajustes de color y el desenfoque se aplican a la fotografía antes de dibujar los elementos. La exportación PNG/JPG/WebP aplana las capas sin incluir las guías de selección y limpia sus metadatos con la API habitual.

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

### Pruebas de JavaScript

Además de `pytest -q`, ejecuta con Node.js 22 o posterior (sin instalar paquetes npm):

```bash
npm test
```

Requiere Python 3 disponible como `python3` (o la variable `PYTHON` apuntando a su ejecutable) para validar el ZIP con la biblioteca estándar `zipfile`. No requiere `npm install`.

Comprueba geometría proporcional, anclajes, presets, nombres únicos, cancelación y un ZIP de 50 entradas. También verifica orden de capas, texto multilínea, nodos de tamaño, conservación del anclaje con rotación, archivos/licencias de las fuentes y aislamiento de estados/historiales y selección de exportación entre documentos. La CI ejecuta estas pruebas junto con las del backend.

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
├── .github/workflows/ci.yml      # Pruebas Python/JavaScript y smoke test Docker
├── DEPLOY_DOKPLOY.md             # Instrucciones detalladas
├── app.py                        # UI, autenticación, cabeceras, API y salud
├── image_pipeline.py             # Reencodificación segura con Pillow
├── requirements.txt
├── package.json                  # Pruebas JavaScript sin dependencias npm
├── templates/
│   ├── index.html                # Editor de múltiples imágenes, textos y capas
│   └── batch.html                # Marcas de agua por lotes
├── static/
│   ├── css/                      # styles.css, elements.css, session.css y batch.css
│   ├── fonts/                    # Ocho familias locales, estilos y licencias OFL
│   └── js/
│       ├── editor.js             # Edición, selección, nodos e historial
│       ├── editor-renderer.js     # Renderizado compartido: vista previa, miniaturas y exportación
│       ├── session-core.js       # Documentos, estados independientes y selección para ZIP
│       ├── elements-core.js      # Dibujo, orden y geometría de elementos
│       ├── batch.js              # Interfaz y procesamiento secuencial del lote
│       ├── batch-core.js         # Colocación proporcional de la marca
│       └── batch-zip.js          # Generación local de archivos ZIP
├── tests/                        # Backend, geometría, capas, fuentes y ZIP
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
npm test
```

Node.js 22 o posterior se utiliza para las pruebas; el servidor de producción funciona con Python y no necesita Node.js ni un paso de compilación del frontend. Los módulos JavaScript y las fuentes se sirven directamente desde `static/`.

Los grafos de Graphify, dependencias locales, cobertura e informes de navegador se excluyen de Git y del contexto Docker. Las fuentes `.ttf`, sus licencias y los recursos de la aplicación sí se versionan.

### Comprobación manual de la interfaz

1. Cargar una foto y, con Texto activo, insertar texto mediante un clic fuera del centro. Escribir varias líneas, confirmar y volver a editar con un clic.
2. Comprobar Listo, Ctrl/Cmd+Enter, Esc, selección del cursor, arrastre para mover y sincronización con el panel. Confirmar una edición debe generar un solo paso de Deshacer/Rehacer.
3. Insertar las seis formas desde sus iconos. Probar relleno semitransparente con borde opaco, orden de capas y duplicación.
4. Arrastrar nodos laterales y esquinas con distintos niveles de zoom y rotación; probar Mayús, Esc, ratón y táctil.
5. Recortar, redimensionar y exportar a PNG/JPG/WebP. Verificar que los textos y formas aparecen sin nodos, cursor ni controles de edición.
6. Abrir `/lotes` y comprobar la carga del logo, los presets y la exportación de varias fotografías.
7. Abrir varias fotos en el editor, modificar cada una y alternar entre ellas. Comprobar historial independiente, cierre de fotos, cancelación de carga/cambio y exportación ZIP de una selección (incluidos nombres repetidos), manteniendo la activa.

### Grafo local del proyecto

Con Graphify instalado, actualiza el mapa de código después de integrar los cambios:

```bash
graphify update .
```

La actualización de código es local, sin llamadas a una API de IA. Genera `graphify-out/graph.json`, el visor `graphify-out/graph.html` y `graphify-out/GRAPH_REPORT.md`. La carpeta queda excluida de Git y del contexto Docker. Las conexiones del grafo son una ayuda de navegación; su cobertura depende de los formatos y símbolos admitidos por el extractor y no sustituye las pruebas.

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
