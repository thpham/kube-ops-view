# Default image and version settings
image := env("IMAGE", "tpham/kube-ops-view")
version := `git describe --tags --always --dirty`
tag := env("TAG", version)
platforms := env("PLATFORMS", "linux/amd64,linux/arm64")

# Default recipe
default: docker

# Install Python dependencies
install:
    poetry install

# Clean build artifacts
clean:
    rm -fr kube_ops_view/static/build

# Run linting
lint: install
    poetry run pre-commit run --all-files

# Run tests with coverage
test: lint
    poetry run coverage run --source=kube_ops_view -m pytest -v
    poetry run coverage report

# Update version in deployment files
version:
    sed -i '' "s/kube-ops-view:.*/kube-ops-view:{{version}}/" deploy/*.yaml

# Build frontend JavaScript app
appjs:
    docker run -u $(id -u) -v $(pwd):/workdir -w /workdir/app -e NPM_CONFIG_CACHE=/tmp node:14.0-slim npm install
    docker run -u $(id -u) -v $(pwd):/workdir -w /workdir/app -e NPM_CONFIG_CACHE=/tmp node:14.0-slim npm run build

# Build docker image for current architecture
docker: appjs
    docker build --build-arg "VERSION={{version}}" -t "{{image}}:{{tag}}" .
    @echo "Docker image {{image}}:{{tag}} can now be used."

# Build multiarch docker image (amd64 + arm64 by default)
docker-multiarch: appjs
    docker buildx create --name multiarch-builder --use --bootstrap 2>/dev/null || docker buildx use multiarch-builder
    docker buildx build \
        --build-arg "VERSION={{version}}" \
        --platform "{{platforms}}" \
        -t "{{image}}:{{tag}}" \
        --push .
    @echo "Multiarch image {{image}}:{{tag}} pushed for platforms: {{platforms}}"

# Build and load multiarch image locally (single platform only)
docker-multiarch-local platform="linux/arm64": appjs
    docker buildx create --name multiarch-builder --use --bootstrap 2>/dev/null || docker buildx use multiarch-builder
    docker buildx build \
        --build-arg "VERSION={{version}}" \
        --platform "{{platform}}" \
        -t "{{image}}:{{tag}}" \
        --load .
    @echo "Docker image {{image}}:{{tag}} loaded for {{platform}}"

# Push docker image to registry
push: docker
    docker push "{{image}}:{{tag}}"
    docker tag "{{image}}:{{tag}}" "{{image}}:latest"
    docker push "{{image}}:latest"

# Run with mock data
mock:
    docker run -it --rm -p 8080:8080 "{{image}}:{{tag}}" --mock \
        --node-link-url-template "https://kube-web-view.example.org/clusters/{cluster}/nodes/{name}" \
        --pod-link-url-template "https://kube-web-view.example.org/clusters/{cluster}/namespaces/{namespace}/pods/{name}"

# Remove buildx builder
clean-builder:
    docker buildx rm multiarch-builder 2>/dev/null || true
