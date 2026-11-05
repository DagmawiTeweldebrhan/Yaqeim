FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends chromium chromium-driver \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 ingest
WORKDIR /app
COPY pyproject.toml ./
COPY requirements.lock ./
COPY yaqeim_ingest ./yaqeim_ingest
RUN pip install --no-cache-dir -c requirements.lock .
USER ingest
ENTRYPOINT ["python", "-m", "yaqeim_ingest"]
