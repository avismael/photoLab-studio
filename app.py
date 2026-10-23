"""FotoLab Studio — editor Canvas 2D con API Flask lista para producción."""
import hmac
import os
from urllib.parse import urlsplit

from flask import Flask, jsonify, render_template, request, send_file
from image_pipeline import ExportValidationError, convert_canvas_image

app = Flask(__name__, template_folder='templates', static_folder='static')
app.config.update(MAX_CONTENT_LENGTH=45 * 1024 * 1024)

# El contenedor Docker usa APP_ENV=production. Sin una contraseña segura,
# no inicia: evita publicar accidentalmente un procesador de imágenes abierto.
IS_PRODUCTION = os.environ.get('APP_ENV', 'development').lower() == 'production'
if IS_PRODUCTION:
    if not os.environ.get('APP_BASIC_USER') or len(os.environ.get('APP_BASIC_PASSWORD', '')) < 16:
        raise RuntimeError(
            'Producción requiere APP_BASIC_USER y APP_BASIC_PASSWORD (mínimo 16 caracteres). '
            'Configúralos como variables de entorno en Dokploy; no los guardes en Git.'
        )


@app.before_request
def require_private_access():
    # La ruta de estado debe ser pública para health checks de Docker/Dokploy.
    if request.path == '/api/health':
        return None
    if request.method == 'POST' and request.path in ('/api/export', '/api/clean'):
        # Evita que un sitio externo fuerce exportaciones desde el navegador.
        origin = request.headers.get('Origin')
        if origin and urlsplit(origin).netloc != request.host:
            return jsonify({'error': 'Origen de solicitud no permitido.'}), 403

    user = os.environ.get('APP_BASIC_USER', '')
    password = os.environ.get('APP_BASIC_PASSWORD', '')
    if not user or not password:
        return None
    credentials = request.authorization
    if credentials and credentials.type == 'basic' and credentials.username is not None and credentials.password is not None:
        if (hmac.compare_digest(credentials.username.encode('utf-8'), user.encode('utf-8'))
                and hmac.compare_digest(credentials.password.encode('utf-8'), password.encode('utf-8'))):
            return None
    return ('Se requiere autenticación para acceder a FotoLab Studio.', 401,
            {'WWW-Authenticate': 'Basic realm="FotoLab Studio", charset="UTF-8"'})



@app.after_request
def response_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; "
        "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    )
    return response


@app.get('/')
def index():
    return render_template('index.html')


@app.get('/api/health')
def health():
    return jsonify({'ok': True, 'app': 'FotoLab Studio', 'version': '2.1.0'})


@app.post('/api/export')
def export_image():
    file = request.files.get('image')
    if file is None:
        return jsonify({'error': 'No se recibió ninguna imagen.'}), 400
    fmt = (request.form.get('format') or 'png').strip().lower()
    try:
        output, mime = convert_canvas_image(file.read(), fmt)
    except ExportValidationError as exc:
        return jsonify({'error': str(exc)}), exc.status
    return send_file(output, mimetype=mime, as_attachment=True,
                     download_name=f'fotolab-edicion.{fmt}')


@app.post('/api/clean')
def clean_original_image():
    """Descarga una copia visual del original sin EXIF, GPS, XMP, ICC ni textos."""
    file = request.files.get('image')
    if file is None:
        return jsonify({'error': 'No se recibió ninguna fotografía.'}), 400
    fmt = (request.form.get('format') or 'png').strip().lower()
    try:
        output, mime = convert_canvas_image(file.read(), fmt)
    except ExportValidationError as exc:
        return jsonify({'error': str(exc)}), exc.status
    return send_file(output, mimetype=mime, as_attachment=True,
                     download_name=f'fotografia-sin-metadatos.{fmt}')

@app.errorhandler(413)
def handle_large_file(_):
    return jsonify({'error': 'El archivo supera el límite de 45 MB.'}), 413


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=False)
