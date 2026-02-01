# ============================================================================
# Kube-Ops-View Justfile
# ============================================================================

set dotenv-load := true

# Configuration
image := env("IMAGE", "ghcr.io/thpham/kube-ops-view")
version := `git describe --tags --always --dirty 2>/dev/null || echo "dev"`
tag := env("TAG", version)
platforms := env("PLATFORMS", "linux/amd64,linux/arm64")
node_image := "node:lts-slim"
container_prefix := "kube-ops-view"

# ============================================================================
# Help & Default
# ============================================================================

# Show available recipes
default:
    @just --list

# ============================================================================
# Development Workflow
# ============================================================================

# Install all dependencies (Python + Node)
install: install-python install-node

# Install Python dependencies
install-python:
    poetry install

# Install Node dependencies
install-node:
    @just _node "npm install"

# Run linting (Python + JS)
lint: install-python
    poetry run pre-commit run --all-files

# Run Python tests with coverage
test: lint
    poetry run coverage run --source=kube_ops_view -m pytest -v
    poetry run coverage report

# Watch frontend for development (rebuilds on changes)
watch:
    @just _node "npm run start"

# ============================================================================
# Build
# ============================================================================

# Build frontend JavaScript (for local development without Docker)
build-frontend:
    @just _node "npm run build"

# Build docker image for current architecture
# Note: Dockerfile includes JS build stage, no need for build-frontend dependency
build:
    docker build --build-arg "VERSION={{version}}" -t "{{image}}:{{tag}}" .
    @echo "Built {{image}}:{{tag}}"

# Build multiarch image and push to registry
build-multiarch: _ensure-buildx
    docker buildx build \
        --builder {{container_prefix}}-builder \
        --build-arg "VERSION={{version}}" \
        --platform "{{platforms}}" \
        -t "{{image}}:{{tag}}" \
        --push .
    @echo "Pushed {{image}}:{{tag}} for platforms: {{platforms}}"

# Build multiarch image and load locally (single platform)
build-local platform="linux/arm64": _ensure-buildx
    docker buildx build \
        --builder {{container_prefix}}-builder \
        --build-arg "VERSION={{version}}" \
        --platform "{{platform}}" \
        -t "{{image}}:{{tag}}" \
        --load .
    @echo "Loaded {{image}}:{{tag}} for {{platform}}"

# ============================================================================
# Run
# ============================================================================

# Run with mock data
run-mock: build
    docker run -it --rm \
        --name {{container_prefix}}-mock \
        -p 8080:8080 \
        "{{image}}:{{tag}}" --mock \
        --node-link-url-template "https://kube-web-view.example.org/clusters/{cluster}/nodes/{name}" \
        --pod-link-url-template "https://kube-web-view.example.org/clusters/{cluster}/namespaces/{namespace}/pods/{name}"

# Run with mock data (detached)
run-mock-detached: build
    docker run -d --rm \
        --name {{container_prefix}}-mock \
        -p 8080:8080 \
        "{{image}}:{{tag}}" --mock
    @echo "Running at http://localhost:8080 (container: {{container_prefix}}-mock)"

# Run with kubeconfig
run-kube config="~/.kube/config": build
    docker run -it --rm \
        --name {{container_prefix}}-kube \
        -p 8080:8080 \
        -v "{{config}}:/root/.kube/config:ro" \
        "{{image}}:{{tag}}" --kubeconfig-path /root/.kube/config

# View logs of running container
logs name="mock":
    docker logs -f {{container_prefix}}-{{name}}

# Stop running container
stop name="mock":
    docker stop {{container_prefix}}-{{name}} 2>/dev/null || true

# ============================================================================
# Security Scanning
# ============================================================================

# Scan built image for vulnerabilities
scan: build
    docker run --rm \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v {{justfile_directory()}}/.trivy-cache:/root/.cache/ \
        aquasec/trivy:latest image \
        --severity HIGH,CRITICAL \
        "{{image}}:{{tag}}"

# Scan with full vulnerability report (all severities)
scan-full: build
    docker run --rm \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v {{justfile_directory()}}/.trivy-cache:/root/.cache/ \
        aquasec/trivy:latest image \
        "{{image}}:{{tag}}"

# Scan and output JSON report
scan-json: build
    docker run --rm \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v {{justfile_directory()}}/.trivy-cache:/root/.cache/ \
        aquasec/trivy:latest image \
        --format json \
        --output /dev/stdout \
        "{{image}}:{{tag}}" > trivy-report.json
    @echo "Report saved to trivy-report.json"

# Scan and fail if HIGH/CRITICAL vulnerabilities found (for CI)
scan-ci: build
    docker run --rm \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v {{justfile_directory()}}/.trivy-cache:/root/.cache/ \
        aquasec/trivy:latest image \
        --exit-code 1 \
        --severity HIGH,CRITICAL \
        "{{image}}:{{tag}}"

# ============================================================================
# Push & Release
# ============================================================================

# Push image to registry
push: build
    docker push "{{image}}:{{tag}}"

# Push with latest tag
push-latest: push
    docker tag "{{image}}:{{tag}}" "{{image}}:latest"
    docker push "{{image}}:latest"

# Update version in deployment manifests
update-manifests:
    find deploy -name '*.yaml' -exec sed -i '' "s|kube-ops-view:.*|kube-ops-view:{{version}}|g" {} \;
    @echo "Updated deploy/*.yaml to version {{version}}"

# ============================================================================
# Cleanup
# ============================================================================

# Clean build artifacts
clean:
    rm -rf kube_ops_view/static/build
    rm -rf app/node_modules/.cache

# Clean all project containers (running and stopped)
clean-containers:
    @echo "Stopping and removing project containers..."
    -docker ps -aq --filter "name={{container_prefix}}" | xargs -r docker rm -f
    @echo "Done"

# Clean orphan/exited containers system-wide
clean-orphans:
    @echo "Removing exited containers..."
    -docker container prune -f
    @echo "Done"

# Clean dangling images
clean-images:
    @echo "Removing dangling images..."
    -docker image prune -f
    @echo "Done"

# Clean buildx builder
clean-builder:
    -docker buildx rm {{container_prefix}}-builder 2>/dev/null
    @echo "Removed buildx builder"

# Full cleanup (containers, images, builder, artifacts)
clean-all: clean clean-containers clean-images clean-builder
    @echo "Full cleanup complete"

# ============================================================================
# Internal Recipes
# ============================================================================

# Run command in node container (auto-cleanup)
[private]
_node *args:
    docker run --rm \
        --name {{container_prefix}}-node-$$ \
        -u "$(id -u):$(id -g)" \
        -v "$(pwd):/workdir" \
        -w /workdir/app \
        -e NPM_CONFIG_CACHE=/tmp/.npm \
        -e HOME=/tmp \
        {{node_image}} {{args}}

# Ensure buildx builder exists
[private]
_ensure-buildx:
    @docker buildx inspect {{container_prefix}}-builder >/dev/null 2>&1 || \
        docker buildx create --name {{container_prefix}}-builder --bootstrap
