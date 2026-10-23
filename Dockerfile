# FotoLab Studio 2.1 — contenedor de producción para Dokploy (GitHub > Dockerfile).
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    APP_ENV=production \
    PORT=5000

WORKDIR /app

# Instalación de dependencias separada del código para aprovechar la caché.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --user-group --create-home --shell /usr/sbin/nologin --uid 10001 fotolab

# No copiamos .env, tests, capturas, Git ni archivos subidos.
COPY app.py image_pipeline.py gunicorn.conf.py ./
COPY templates ./templates
COPY static ./static

USER 10001:10001
EXPOSE 5000

# No requiere curl: la imagen solo contiene Python y dependencias indispensables.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/api/health', timeout=3).read()" || exit 1

CMD ["gunicorn", "--config", "gunicorn.conf.py", "app:app"]
