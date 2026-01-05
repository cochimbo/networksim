#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
N=${1:-3}
TIMEOUT=${2:-60}
INTERVAL_SECONDS=${INTERVAL_SECONDS:-2}

# This script runs docker-compose for the scalable `node` service.
# If the image `testdistributed_app:local` is missing, build it automatically.
IMAGE=testdistributed_app:local
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Docker image '$IMAGE' not found — building it now (this may take a while)..."
  (cd "$ROOT_DIR" && ./scripts/integration_docker.sh "$N" 0 "$TIMEOUT")
  if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    echo "Failed to build image '$IMAGE'. Aborting."
    exit 1
  fi
fi

COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
echo "Using compose file: $COMPOSE_FILE"

# Start scaled service
docker-compose -f "$COMPOSE_FILE" up -d --scale node=$N

echo "Launched $N services via docker-compose; waiting up to ${TIMEOUT}s for convergence..."

end=$((SECONDS + TIMEOUT))
status=1
containers=( $(docker-compose -f "$COMPOSE_FILE" ps -q node) )
if [ ${#containers[@]} -ne $N ]; then
  echo "Warning: expected $N containers but found ${#containers[@]}"
fi

while [ $SECONDS -lt $end ]; do
  all_ok=true
  for cid in "${containers[@]}"; do
    out=$(docker exec "$cid" sh -c "curl -s http://127.0.0.1:9090/peers" || true)
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
    echo "Converged: each node sees at least $N peers."
    status=0
    break
  fi
  sleep 1
done

if [ $status -ne 0 ]; then
  echo "Timeout waiting for convergence. Showing service logs (first 200 lines):"
  docker-compose -f "$COMPOSE_FILE" logs --tail=200 || true
fi

docker-compose -f "$COMPOSE_FILE" down

exit $status
