# syntax=docker/dockerfile:1
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Install uv for fast, reliable wheel installations
RUN pip install --no-cache-dir uv

# Copy requirements
COPY requirements.txt requirements-dev.txt pyproject.toml ./

# Install python dependencies
RUN uv pip install --system -r requirements.txt -r requirements-dev.txt

# Copy backend source code, migrations, tests, scripts, and data
COPY src/ ./src/
COPY tests/ ./tests/
COPY scripts/ ./scripts/
COPY alembic/ ./alembic/
COPY alembic.ini ./
COPY data/ ./data/

# Install the app package in editable mode
RUN uv pip install --system -e .

EXPOSE 8000

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
