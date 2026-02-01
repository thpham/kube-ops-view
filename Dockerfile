# Build stage - install dependencies
FROM registry.access.redhat.com/ubi9/python-312:latest AS builder

WORKDIR /opt/app-root/src

USER 0

# Install build dependencies
RUN dnf install -y --nodocs gcc libffi-devel && \
    dnf clean all && \
    rm -rf /var/cache/dnf

RUN pip3 install --no-cache-dir "poetry>=2.0" poetry-plugin-export

COPY poetry.lock pyproject.toml ./

# Export requirements and install with pip (poetry 2.x has issues with virtualenvs.create=false in UBI)
RUN poetry export -f requirements.txt --only main -o requirements.txt && \
    pip3 install --no-cache-dir -r requirements.txt && \
    # Remove build tools not needed at runtime (reduces CVEs)
    pip3 uninstall -y pip setuptools wheel poetry poetry-core poetry-plugin-export 2>/dev/null || true && \
    rm -rf /opt/app-root/lib*/python3.12/site-packages/pip* \
           /opt/app-root/lib*/python3.12/site-packages/setuptools* \
           /opt/app-root/lib*/python3.12/site-packages/wheel* \
           /opt/app-root/lib*/python3.12/site-packages/poetry* \
           /opt/app-root/lib*/python3.12/site-packages/_distutils_hack

# Runtime stage - UBI10 minimal image (fewer CVEs)
FROM registry.access.redhat.com/ubi10/python-312-minimal:latest

WORKDIR /opt/app-root/src

# Copy pre-built packages from builder
COPY --from=builder /opt/app-root/lib64/python3.12/site-packages /opt/app-root/lib64/python3.12/site-packages
COPY --from=builder /opt/app-root/lib/python3.12/site-packages /opt/app-root/lib/python3.12/site-packages

# Copy application code (as root to allow sed modification)
USER 0
COPY kube_ops_view ./kube_ops_view

ARG VERSION=dev

RUN sed -i "s/__version__ = .*/__version__ = '${VERSION}'/" ./kube_ops_view/__init__.py && \
    chown -R 1001:0 ./kube_ops_view

USER 1001

ENTRYPOINT ["python3", "-m", "kube_ops_view"]
