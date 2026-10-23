"""Validación y conversión de fotos (independiente de Flask)."""
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_IMAGE_PIXELS = 35_000_000
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
OUTPUT_TYPES = {
    'png': ('PNG', 'image/png'),
    'jpg': ('JPEG', 'image/jpeg'),
    'webp': ('WEBP', 'image/webp'),
}


class ExportValidationError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def convert_canvas_image(data: bytes, fmt: str) -> tuple[BytesIO, str]:
    """Verify supplied pixels and convert to a safe, metadata-free image."""
    fmt = fmt.lower().strip()
    if fmt not in OUTPUT_TYPES:
        raise ExportValidationError('El formato solicitado no es válido.')
    if not data or len(data) > 42 * 1024 * 1024:
        raise ExportValidationError('La imagen está vacía o es demasiado grande.', 413)

    try:
        with Image.open(BytesIO(data)) as check:
            check.verify()
        with Image.open(BytesIO(data)) as incoming:
            if incoming.format not in ('PNG', 'JPEG', 'WEBP'):
                raise ExportValidationError('Tipo de imagen no admitido.')
            if incoming.width * incoming.height > MAX_IMAGE_PIXELS:
                raise ExportValidationError('Las dimensiones de la imagen son demasiado grandes.', 413)
            oriented = ImageOps.exif_transpose(incoming).convert('RGBA')
            # Crear un objeto de imagen NUEVO: convert() conserva a veces .info,
            # incluido ICC/XMP/EXIF y texto PNG. Copiar solamente los píxeles.
            img = Image.new('RGBA', oriented.size)
            img.paste(oriented)

        encoding, mime = OUTPUT_TYPES[fmt]
        output = BytesIO()
        if fmt == 'jpg':
            backdrop = Image.new('RGB', img.size, (255, 255, 255))
            backdrop.paste(img, mask=img.getchannel('A'))
            backdrop.save(output, encoding, quality=94, optimize=True, subsampling=0)
        elif fmt == 'webp':
            img.save(output, encoding, quality=93, method=4)
        else:
            img.save(output, encoding, optimize=True)
        output.seek(0)
        return output, mime
    except ExportValidationError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise ExportValidationError('El archivo recibido no es una imagen válida.') from exc
