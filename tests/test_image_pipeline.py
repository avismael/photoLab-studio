from io import BytesIO
from pathlib import Path
import sys

from PIL import Image
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from image_pipeline import convert_canvas_image, ExportValidationError


def input_photo():
    b = BytesIO()
    Image.new('RGBA', (154, 91), (255, 110, 20, 160)).save(b, 'PNG')
    return b.getvalue()


@pytest.mark.parametrize('fmt, image_type', [('png','PNG'),('jpg','JPEG'),('webp','WEBP')])
def test_encode(fmt, image_type):
    output,mime = convert_canvas_image(input_photo(),fmt)
    assert mime.startswith('image/')
    with Image.open(output) as pic:
        assert pic.size == (154,91)
        assert pic.format == image_type
        if fmt == 'jpg': assert pic.mode == 'RGB'


def test_reject_invalid_format():
    with pytest.raises(ExportValidationError): convert_canvas_image(input_photo(),'exe')


def test_reject_corrupt_image():
    with pytest.raises(ExportValidationError): convert_canvas_image(b'<html>bad</html>','png')


def test_strips_png_metadata_and_icc():
    from PIL.PngImagePlugin import PngInfo
    src = Image.new('RGBA', (17, 13), (100, 150, 200, 200))
    pnginfo = PngInfo()
    pnginfo.add_text('Comment', 'PRIVATE DATA')
    payload = BytesIO()
    src.save(payload, format='PNG', pnginfo=pnginfo, icc_profile=b'PRIVATE ICC DATA')
    cleaned, _ = convert_canvas_image(payload.getvalue(), 'png')
    with Image.open(cleaned) as dst:
        assert dst.size == (17, 13)
        assert dst.getpixel((3, 3)) == (100, 150, 200, 200)
        assert not dst.getexif()
        assert not dst.info.get('icc_profile')
        assert not dst.info.get('Comment')
        assert not dst.info.get('XML:com.adobe.xmp')

def test_strips_jpeg_exif_and_gps():
    src = Image.new('RGB', (19, 12), (100, 150, 200))
    exif = Image.Exif()
    exif[270] = 'Internal private description'
    exif[306] = '2026:10:23 12:23:01'
    payload = BytesIO()
    src.save(payload, format='JPEG', exif=exif, icc_profile=b'PRIVATE ICC DATA')
    cleaned, _ = convert_canvas_image(payload.getvalue(), 'jpg')
    with Image.open(cleaned) as dst:
        assert dst.size == (19, 12)
        assert not dst.getexif()
        assert not dst.info.get('icc_profile')
