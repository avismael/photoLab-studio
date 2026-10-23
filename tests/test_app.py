from io import BytesIO
from pathlib import Path
import sys

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import app


def make_image():
    bio = BytesIO()
    Image.new('RGBA', (150, 90), (255, 0, 70, 160)).save(bio, 'PNG')
    bio.seek(0)
    return bio


def test_home():
    client = app.test_client()
    response = client.get('/')
    assert response.status_code == 200
    assert b'FotoLab' in response.data
    assert b'photoCanvas' in response.data


def test_health():
    response = app.test_client().get('/api/health')
    assert response.json['ok'] is True


def test_batch_page_and_local_modules():
    client = app.test_client()
    response = client.get('/lotes')
    assert response.status_code == 200
    assert b'batchCanvas' in response.data
    assert b'/static/js/batch.js' in response.data
    for asset in ('js/batch.js', 'js/batch-core.js', 'js/batch-zip.js', 'css/batch.css'):
        assert client.get('/static/' + asset).status_code == 200


def test_export_formats():
    client = app.test_client()
    for fmt, pil_type in [('png','PNG'), ('jpg','JPEG'), ('webp','WEBP')]:
        response = client.post('/api/export', data={'image': (make_image(),'foto.png'), 'format':fmt})
        assert response.status_code == 200
        assert response.headers['Content-Disposition'].endswith(f'fotolab-edicion.{fmt}')
        with Image.open(BytesIO(response.data)) as converted:
            assert converted.format == pil_type
            assert converted.size == (150,90)
            if fmt == 'jpg': assert converted.mode == 'RGB'


def test_invalid_format_and_file():
    client = app.test_client()
    invalid_type = client.post('/api/export',data={'image':(make_image(),'foto.png'),'format':'svg'})
    assert invalid_type.status_code == 400
    corrupt = client.post('/api/export',data={'image':(BytesIO(b'<script>x</script>'),'hack.png'),'format':'png'})
    assert corrupt.status_code == 400
    missing = client.post('/api/export',data={'format':'jpg'})
    assert missing.status_code == 400


def test_clean_original_endpoint():
    from io import BytesIO
    from PIL import Image
    from app import app
    src=Image.new('RGB',(36,27),'#ff5566')
    exif=Image.Exif();exif[270]='Private data'
    b=BytesIO();src.save(b,format='JPEG',exif=exif)
    with app.test_client() as client:
        resp=client.post('/api/clean',data={'format':'jpg','image':(BytesIO(b.getvalue()),'photo.jpg')},content_type='multipart/form-data')
    assert resp.status_code==200
    assert resp.mimetype=='image/jpeg'
    with Image.open(BytesIO(resp.data)) as out:
        assert out.size==(36,27)
        assert not out.getexif()

def test_clean_rejects_nonimage():
    from io import BytesIO
    from app import app
    with app.test_client() as client:
        resp=client.post('/api/clean',data={'format':'png','image':(BytesIO(b'not an image'),'file.png')},content_type='multipart/form-data')
    assert resp.status_code==400


def test_production_credentials_protect_editor_and_apis(monkeypatch):
    monkeypatch.setenv('APP_BASIC_USER', 'editor')
    monkeypatch.setenv('APP_BASIC_PASSWORD', 'test_password_of_20_chars')
    with app.test_client() as client:
        response = client.get('/')
        assert response.status_code == 401
        assert client.get('/lotes').status_code == 401
        assert response.headers['WWW-Authenticate'].startswith('Basic ')
        assert client.post('/api/export').status_code == 401
        assert client.post('/api/clean').status_code == 401
        assert client.get('/api/health').status_code == 200
        assert client.get('/', auth=('editor', 'incorrect')).status_code == 401
        authorized = client.get('/', auth=('editor', 'test_password_of_20_chars'))
        assert authorized.status_code == 200
        assert b'photoCanvas' in authorized.data
        assert "script-src 'self'" in authorized.headers['Content-Security-Policy']
        assert 'no-store' in authorized.headers['Cache-Control']


def test_export_is_available_with_valid_credentials(monkeypatch):
    monkeypatch.setenv('APP_BASIC_USER', 'editor')
    monkeypatch.setenv('APP_BASIC_PASSWORD', 'test_password_of_20_chars')
    with app.test_client() as client:
        response = client.post('/api/export',
            data={'image': (make_image(), 'photo.png'), 'format': 'png'},
            auth=('editor', 'test_password_of_20_chars'))
    assert response.status_code == 200
    assert response.mimetype == 'image/png'


def test_reject_cross_origin_export(monkeypatch):
    monkeypatch.delenv('APP_BASIC_USER', raising=False)
    monkeypatch.delenv('APP_BASIC_PASSWORD', raising=False)
    with app.test_client() as client:
        response = client.post('/api/export',
            data={'image': (make_image(), 'image.png'), 'format': 'png'},
            headers={'Origin': 'https://sitio-externo.example'})
        assert response.status_code == 403
        response = client.post('/api/export',
            data={'image': (make_image(), 'image.png'), 'format': 'png'},
            headers={'Origin': 'https://localhost'})
        assert response.status_code == 200
