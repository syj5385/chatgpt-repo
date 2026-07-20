FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_INDEX_URL=https://pypi.org/simple \
    PIP_TRUSTED_HOST="pypi.org files.pythonhosted.org pypi.python.org"

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir \
    --trusted-host pypi.org \
    --trusted-host files.pythonhosted.org \
    --trusted-host pypi.python.org \
    -r requirements.txt

COPY app ./app

RUN mkdir -p /data /files \
    && python -m py_compile app/*.py \
    && python -c "from app.hotfix import app; paths={getattr(route, 'path', '') for route in app.routes}; required={'/health','/api/files/workspace','/api/files/uploads/init','/api/files/rename','/api/files/shares','/api/files/lock','/share/{token}','/share/{token}/download'}; missing=required-paths; assert not missing, f'Missing routes: {sorted(missing)}'"

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)" || exit 1

CMD ["uvicorn", "app.hotfix:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
