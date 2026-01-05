#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
OUT_DIR="$ROOT_DIR/benchmarks"
mkdir -p "$OUT_DIR"
OUT_CSV="$OUT_DIR/convergence_times.csv"

# Usage: compose_benchmark.sh "3 4 6" trials timeout
NODES_LIST=${1:-"3 4"}
TRIALS=${2:-1}
TIMEOUT=${3:-120}

echo "nodes,trial,elapsed_sec,success" > "$OUT_CSV"

for nodes in $NODES_LIST; do
  for trial in $(seq 1 $TRIALS); do
    echo "Running benchmark: nodes=$nodes trial=$trial"
    start=$(date +%s.%N)
    if "$ROOT_DIR/scripts/integration_compose.sh" "$nodes" 0 "$TIMEOUT"; then
      success=1
    else
      success=0
    fi
    end=$(date +%s.%N)
    elapsed=$(awk -v e1="$start" -v e2="$end" 'BEGIN{printf "%.3f", e2 - e1}')
    echo "$nodes,$trial,$elapsed,$success" >> "$OUT_CSV"
    echo "Result: nodes=$nodes trial=$trial elapsed=${elapsed}s success=$success"
    # small cooldown between runs
    sleep 1
  done
done

echo "Benchmark finished. Results: $OUT_CSV"
