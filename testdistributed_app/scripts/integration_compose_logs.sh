#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
N=${1:-3}
TIMEOUT=${2:-60}
INTERVAL_SECONDS=${INTERVAL_SECONDS:-2}

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
OUT_DIR="$ROOT_DIR/logs/compose-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_DIR"

echo "Using compose file: $COMPOSE_FILE"
echo "Logs will be saved to: $OUT_DIR"

# Start scaled service
docker-compose -f "$COMPOSE_FILE" up -d --scale node=$N

containers=( $(docker-compose -f "$COMPOSE_FILE" ps -q node) )
if [ ${#containers[@]} -ne $N ]; then
  echo "Warning: expected $N containers but found ${#containers[@]}"
fi

echo "Starting background log capture for ${#containers[@]} containers..."
pids=()
names=()
for cid in "${containers[@]}"; do
  name=$(docker ps --format '{{.Names}}' --filter id=$cid | head -n1)
  if [ -z "$name" ]; then
    name=$cid
  fi
  names+=("$name")
  logfile="$OUT_DIR/${name}.log"
  echo "Writing logs for $name -> $logfile"
  # follow logs in background
  docker logs -f "$cid" > "$logfile" 2>&1 &
  pids+=("$!")
done

echo "Waiting up to ${TIMEOUT}s for convergence..."
end=$((SECONDS + TIMEOUT))
status=1
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
  echo "Timeout waiting for convergence. Check logs in: $OUT_DIR"
fi

echo "Stopping background log capture processes..."
for pid in "${pids[@]}"; do
  kill "$pid" >/dev/null 2>&1 || true
done

echo "Bringing down compose setup..."
docker-compose -f "$COMPOSE_FILE" down

echo "Logs saved in: $OUT_DIR"
exit $status
