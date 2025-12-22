#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
IMAGE=testdistributed_app:local
N=${1:-3}
BASE_PORT=${2:-9000}
TIMEOUT=${3:-60}
INTERVAL_SECONDS=${INTERVAL_SECONDS:-2}

echo "Building release binary and docker image ${IMAGE}..."
(cd "$ROOT_DIR" && cargo build --release)
TMPDIR=$(mktemp -d)
echo "Preparing docker build context in $TMPDIR"
cp "$ROOT_DIR/Dockerfile.runtime" "$TMPDIR/Dockerfile"
# adjust Dockerfile to reference the copied binary name in the temp context
sed -i 's|COPY target/release/testdistributed_app /usr/local/bin/testdistributed_app|COPY testdistributed_app /usr/local/bin/testdistributed_app|' "$TMPDIR/Dockerfile"
cp "$ROOT_DIR/target/release/testdistributed_app" "$TMPDIR/testdistributed_app"
(cd "$TMPDIR" && docker build -t "$IMAGE" .)
rm -rf "$TMPDIR"

pids=()
containers=()
ports=()

for i in $(seq 0 $((N-1))); do
  port=$((BASE_PORT + i + 1))
  ports+=("$port")
  name="test_node_$i"
  echo "Starting container $name (HTTP host port $port -> container 9090)"
  docker run -d --name "$name" -e HTTP_PORT=9090 -e INTERVAL_SECONDS="$INTERVAL_SECONDS" -p "${port}:9090" "$IMAGE" > /dev/null
  containers+=("$name")
  sleep 0.5
done

echo "Launched ${#containers[@]} containers. Waiting up to ${TIMEOUT}s for convergence..."

end=$((SECONDS + TIMEOUT))
status=1
while [ $SECONDS -lt $end ]; do
  all_ok=true
  for port in "${ports[@]}"; do
    out=$(curl -s "http://127.0.0.1:$port/peers" || true)
    if [ -z "$out" ] || [ "$out" = "{}" ]; then
      all_ok=false
      break
    fi
    count=$(echo "$out" | python3 -c 'import sys, json; print(len(json.load(sys.stdin)))')
    if [ "$count" -lt "$N" ]; then
      all_ok=false
      break
    fi
  done
  if [ "$all_ok" = true ]; then
    echo "Converged: each container sees at least $N peers."
    status=0
    break
  fi
  sleep 1
done

if [ $status -ne 0 ]; then
  echo "Timeout waiting for convergence. Showing container logs (first 200 lines):"
  for name in "${containers[@]}"; do
    echo "--- $name log ---"
    docker logs --tail 200 "$name" || true
  done
fi

# cleanup
for name in "${containers[@]}"; do
  docker rm -f "$name" >/dev/null 2>&1 || true
done

exit $status
