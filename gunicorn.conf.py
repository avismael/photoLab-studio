"""Configuración de Gunicorn para el procesamiento de imágenes en producción."""
import os

bind = "0.0.0.0:5000"
worker_class = "sync"
# Cada conversión puede usar cientos de MB; 1 worker por defecto limita la
# concurrencia y reduce riesgo de OOM en servidores pequeños.
workers = max(1, min(int(os.getenv("WEB_CONCURRENCY", "1")), 4))
threads = 1
timeout = max(30, min(int(os.getenv("GUNICORN_TIMEOUT", "120")), 300))
graceful_timeout = 30
max_requests = 200
max_requests_jitter = 25
accesslog = "-"
errorlog = "-"
capture_output = True
loglevel = "info"
forwarded_allow_ips = "127.0.0.1"
limit_request_line = 4094
limit_request_fields = 50
