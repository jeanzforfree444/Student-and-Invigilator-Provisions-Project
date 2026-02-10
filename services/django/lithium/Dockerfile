ARG BASE_IMAGE_REGISTRY=docker.io/library
# First, build the application in the `/app` directory.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
WORKDIR /app
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev
ADD . /app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# Then, use a final image without uv
FROM ${BASE_IMAGE_REGISTRY}/python:3.12-slim-bookworm

# Copy the application from the builder
COPY --from=builder --chown=app:app /app /app

WORKDIR /app

# System packages required for building Python wheels at runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential \
       gcc \
       gosu \
       libffi-dev \
       libpq-dev \
       postgresql-15 \
       postgresql-client-15 \
       postgresql-contrib-15 \
       python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/app/.venv/bin:$PATH"

# Expose port 8000
EXPOSE 8000

# Use gunicorn on port 8000
CMD ["gunicorn", "--bind", ":8000", "--workers", "2", "django_project.wsgi"]
