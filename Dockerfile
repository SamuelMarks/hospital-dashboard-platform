# syntax=docker/dockerfile:1
# Multi-stage Dockerfile for Hospital Dashboard Platform

# Stage 1: Build Web Frontend Assets with Alpine Linux
FROM node:22-alpine AS frontend-builder
WORKDIR /app/pulse-query-ng-web
COPY pulse-query-ng-web/package*.json ./
RUN npm install
COPY pulse-query-ng-web/ ./
RUN npm run build

# Stage 2: Python Runtime and Backend
FROM python:3.12-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

WORKDIR /app/pulse-query-backend

COPY pulse-query-backend/requirements.txt pulse-query-backend/requirements-dev.txt pulse-query-backend/pyproject.toml ./
RUN uv pip install --system -r requirements.txt -r requirements-dev.txt

COPY pulse-query-backend/src/ ./src/
COPY pulse-query-backend/tests/ ./tests/
COPY pulse-query-backend/scripts/ ./scripts/
COPY pulse-query-backend/alembic/ ./alembic/
COPY pulse-query-backend/alembic.ini ./
COPY pulse-query-backend/data/ ./data/

RUN uv pip install --system -e .

# Copy compiled frontend assets from Stage 1 into the expected relative location
COPY --from=frontend-builder /app/pulse-query-ng-web/dist /app/pulse-query-ng-web/dist

EXPOSE 8000

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
