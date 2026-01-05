
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$#" -eq 0 ]; then
  echo "No tags provided. Using default: localhost:5000/testdistributed_app:latest"
  TAGS=("localhost:5000/testdistributed_app:latest")
else
  TAGS=("$@")
fi

# Helper: check if any tag targets the local registry
function targets_local_registry() {
  for t in "${TAGS[@]}"; do
    if [[ "$t" == localhost:5000/* ]] || [[ "$t" == 127.0.0.1:5000/* ]]; then
      return 0
    fi
  done
  return 1
}

# Start a local registry if needed and wait for it to be responsive
function ensure_local_registry() {
  if ! targets_local_registry; then
    return 0
  fi

  # If a container named 'registry' exists but is stopped, start it. If missing, create it.
  if [ -z "$(docker ps -a --filter name=^/registry$ --format '{{.ID}}')" ]; then
    echo "Local registry not found — creating container 'registry'..."
    docker run -d -p 5000:5000 --restart=always --name registry registry:2 >/dev/null
  else
    if [ -z "$(docker ps --filter name=^/registry$ --format '{{.ID}}')" ]; then
      echo "Local registry container exists but not running — starting 'registry'..."
      docker start registry >/dev/null
    else
      echo "Local registry already running"
    fi
  fi

  echo "Waiting for registry to accept connections..."
  for i in $(seq 1 15); do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/v2/ || true)
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "404" ]; then
      echo "Registry responding with HTTP $HTTP_CODE"
      return 0
    fi
    sleep 1
  done

  echo "Registry did not respond in time"
  return 1
}

echo "Building Rust binary (release)..."
cargo build --release --manifest-path "$SCRIPT_DIR/Cargo.toml"

MAIN_TAG=${TAGS[0]}
echo "Building Docker image with tag: $MAIN_TAG"
docker build -t "$MAIN_TAG" "$SCRIPT_DIR"

if [ ${#TAGS[@]} -gt 1 ]; then
  for ((i=1;i<${#TAGS[@]};i++)); do
    TAG=${TAGS[i]}
    echo "Tagging image $MAIN_TAG -> $TAG"
    docker tag "$MAIN_TAG" "$TAG"
  done
fi

echo "Ensuring local registry (if any tag targets it)..."
ensure_local_registry || echo "Warning: local registry may not be available; pushes may fail"

echo "Pushing tags to registry..."
for TAG in "${TAGS[@]}"; do
  echo "Pushing $TAG"
  if docker push "$TAG"; then
    echo "Pushed $TAG"
  else
    echo "Failed to push $TAG"
  fi
done

echo "Done."
