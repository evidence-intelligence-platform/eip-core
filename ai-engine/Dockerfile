# EIF AI Engine — Dockerfile
# Version: 1.0.0
# Owner: EIF Architecture Team

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (build essentials, libpq for PostgreSQL)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy python dependencies
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Expose FastAPI port (Railway injects PORT; 8080 is the local default)
EXPOSE 8080

# Health check. /health, not /docs: the docs page is a static Swagger shell
# that renders even when the database is unreachable, so it reported a dead
# engine as healthy. It is also the path railway.json probes — one answer to
# "is this container serving?", not two.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f "http://localhost:${PORT:-8080}/health" || exit 1

# Apply migrations, then start Uvicorn. Shell form so ${PORT} expands —
# Railway (and most PaaS) inject the port at runtime.
CMD python -m src.db.migrate && uvicorn src.main:app --host 0.0.0.0 --port "${PORT:-8080}"
