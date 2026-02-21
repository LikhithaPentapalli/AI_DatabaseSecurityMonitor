# MongoDB Log Monitor - AI Engine (Producer & Detector)
FROM python:3.11-slim

WORKDIR /app

# Install system deps for spaCy
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m spacy download en_core_web_sm || true

COPY producer.py detector.py ./

# Default: run detector (override in docker-compose with producer.py)
CMD ["python", "detector.py"]
