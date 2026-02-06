# JavaScript build stage
FROM node:lts-slim AS js-builder

WORKDIR /build

COPY app/package*.json ./
RUN npm ci

COPY app/ ./
# Create output directory (webpack outputs to ../kube_ops_view/static/build)
RUN mkdir -p /kube_ops_view/static/build && npm run build

# Python build stage - install dependencies
# hadolint ignore=DL3007
FROM registry.access.redhat.com/ubi9/python-312:latest AS builder

WORKDIR /opt/app-root/src

# hadolint ignore=DL3002
USER 0

# Install build dependencies
# hadolint ignore=DL3041
RUN dnf install -y --nodocs gcc libffi-devel && \
    dnf clean all && \
    rm -rf /var/cache/dnf

# Upgrade pip to address CVE-2025-8869 and CVE-2026-1703
# hadolint ignore=DL3013
RUN pip3 install --no-cache-dir --upgrade pip>=26.0 && \
    pip3 install --no-cache-dir "poetry>=2.0" poetry-plugin-export

COPY poetry.lock pyproject.toml ./

# Export requirements and install with pip (poetry 2.x has issues with virtualenvs.create=false in UBI)
RUN poetry export -f requirements.txt --only main -o requirements.txt && \
    pip3 install --no-cache-dir -r requirements.txt && \
    # Remove build tools not needed at runtime (reduces CVEs including CVE-2025-8869, CVE-2026-1703)
    pip3 uninstall -y pip setuptools wheel poetry poetry-core poetry-plugin-export 2>/dev/null || true && \
    find /opt/app-root/lib -type d -name "pip*" -exec rm -rf {} + 2>/dev/null || true && \
    find /opt/app-root/lib64 -type d -name "pip*" -exec rm -rf {} + 2>/dev/null || true && \
    rm -rf /opt/app-root/lib*/python3.12/site-packages/setuptools* \
           /opt/app-root/lib*/python3.12/site-packages/wheel* \
           /opt/app-root/lib*/python3.12/site-packages/poetry* \
           /opt/app-root/lib*/python3.12/site-packages/_distutils_hack \
           /opt/app-root/bin/pip*

# Runtime stage - UBI10 minimal image (fewer CVEs)
# hadolint ignore=DL3007
FROM registry.access.redhat.com/ubi10/python-312-minimal:latest

WORKDIR /opt/app-root/src

# Copy pre-built packages from builder
COPY --from=builder /opt/app-root/lib64/python3.12/site-packages /opt/app-root/lib64/python3.12/site-packages
COPY --from=builder /opt/app-root/lib/python3.12/site-packages /opt/app-root/lib/python3.12/site-packages

# Copy application code
USER 0

# Remove pip from runtime image to address CVE-2025-8869 and CVE-2026-1703
# Application doesn't need pip at runtime since dependencies are pre-installed
RUN microdnf remove -y python3.12-pip python3.12-pip-wheel 2>/dev/null || true && \
    microdnf clean all && \
    find /opt/app-root/lib -type d -name "pip*" -exec rm -rf {} + 2>/dev/null || true && \
    find /opt/app-root/lib64 -type d -name "pip*" -exec rm -rf {} + 2>/dev/null || true && \
    rm -rf /opt/app-root/bin/pip* 2>/dev/null || true

COPY kube_ops_view ./kube_ops_view

# Copy JavaScript build output (webpack outputs to ../kube_ops_view/static/build relative to app/)
COPY --from=js-builder /kube_ops_view/static/build ./kube_ops_view/static/build

ARG VERSION=dev

RUN sed -i "s/__version__ = .*/__version__ = '${VERSION}'/" ./kube_ops_view/__init__.py && \
    chown -R 1001:0 ./kube_ops_view

USER 1001

ENTRYPOINT ["python3", "-m", "kube_ops_view"]
