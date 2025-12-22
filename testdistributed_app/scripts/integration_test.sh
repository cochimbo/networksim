#!/usr/bin/env bash
set -euo pipefail

# Simple integration test: build the binary and launch N nodes (different HTTP ports)
# Wait until all nodes report at least N peers in /peers or timeout.

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
BIN=${ROOT_DIR}/target/release/testdistributed_app
N=${1:-3}
BASE_PORT=${2:-9000}
TIMEOUT=${3:-60}
INTERVAL_SECONDS=${INTERVAL_SECONDS:-2}

echo "Building release binary..."
(cd "$ROOT_DIR" && cargo build --release)

pids=()
ports=()

for i in $(seq 0 $((N-1))); do
  port=$((BASE_PORT + i + 1))
  ports+=("$port")
  echo "Starting node $i (HTTP port $port)"
  HTTP_PORT=$port INTERVAL_SECONDS=$INTERVAL_SECONDS "$BIN" > "$ROOT_DIR/node-$i.log" 2>&1 &
  pids+=("$!")
  sleep 0.5
done

echo "Launched ${#pids[@]} nodes. Waiting up to ${TIMEOUT}s for convergence..."

end=$((SECONDS + TIMEOUT))
while [ $SECONDS -lt $end ]; do
  all_ok=true
  for port in "${ports[@]}"; do
    out=$(curl -s "http://127.0.0.1:$port/peers" || true)
    if [ -z "$out" ] || [ "$out" = "{}" ]; then
      all_ok=false
      break
    fi
    # count keys
    count=$(echo "$out" | python3 -c 'import sys, json; print(len(json.load(sys.stdin)))')
    if [ "$count" -lt "$N" ]; then
      all_ok=false
      break
    fi
  done
  if [ "$all_ok" = true ]; then
    echo "Converged: each node sees at least $N peers."
    break
  fi
  sleep 1
done

if [ $SECONDS -ge $end ]; then
  echo "Timeout waiting for convergence. Logs:"
  for i in $(seq 0 $((N-1))); do
    echo "--- node $i log ---"
    tail -n +1 "$ROOT_DIR/node-$i.log" | sed -n '1,200p'
  done
  status=1
else
  status=0
fi

# cleanup
for pid in "${pids[@]}"; do
  kill "$pid" 2>/dev/null || true
done

exit $status
