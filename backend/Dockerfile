FROM python:3.12-slim

WORKDIR /workspace

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render and Cloud Run both set the PORT env variable
EXPOSE 10000

# Use $PORT for compatibility with Render, Cloud Run, etc.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}
