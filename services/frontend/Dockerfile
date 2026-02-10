# syntax=docker/dockerfile:1.7
ARG BASE_IMAGE_REGISTRY=docker.io/library
FROM ${BASE_IMAGE_REGISTRY}/node:20-bullseye-slim

ARG DEBIAN_FRONTEND=noninteractive

# OS packages for React tooling and native module builds
RUN set -eu; \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        bash \
        python3 \
        make \
        g++ \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r app && useradd -r -g app app

WORKDIR /app

# Copy template entrypoint
COPY --chown=app:app entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Bring in the app skeleton (src, bin, etc.)
COPY --chown=app:app app/ /app/

# Ensure helper scripts are executable if present
RUN if [ -d /app/bin ]; then chmod +x /app/bin/* 2>/dev/null || true; fi

USER app

ENTRYPOINT ["/entrypoint.sh"]
# Default stays idle until you add code or override CMD in compose
CMD ["idle"]
