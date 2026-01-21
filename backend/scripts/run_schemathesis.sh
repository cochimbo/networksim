#!/usr/bin/env bash
set -euo pipefail

# Local helper to run a full Schemathesis contract test against the local backend.
# Usage:
#   OPENAPI_PATH=backend/openapi.json BASE_URL=http://localhost:8080 HYPO_MAX_EXAMPLES=200 ./backend/scripts/run_schemathesis.sh
# Defaults:
#   OPENAPI_PATH=backend/openapi.json
#   BASE_URL=http://localhost:8080
#   VENV_DIR=backend/.venv
#   HYPO_MAX_EXAMPLES=200
#   WORKERS=$(nproc || echo 1)
#   REPORT_DIR=backend/schemathesis_reports

OPENAPI_PATH="${OPENAPI_PATH:-backend/openapi.json}"
BASE_URL="${BASE_URL:-http://localhost:8080}"
VENV_DIR="${VENV_DIR:-backend/.venv}"
HYPO_MAX_EXAMPLES="${HYPO_MAX_EXAMPLES:-200}"
WORKERS="${WORKERS:-$(nproc 2>/dev/null || echo 1)}"
REPORT_DIR="${REPORT_DIR:-backend/schemathesis_reports}"
EXTRA_ARGS="${EXTRA_ARGS:-}"

mkdir -p "$REPORT_DIR"

if [ ! -x "$VENV_DIR/bin/schemathesis" ]; then
  echo "Creating venv at $VENV_DIR and installing schemathesis..."
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install --upgrade pip
  "$VENV_DIR/bin/pip" install "schemathesis"
fi

SCHEMA_BIN="$VENV_DIR/bin/schemathesis"
REPORT_TS=$(date +%Y%m%d-%H%M%S)
OUT_TXT="$REPORT_DIR/schemathesis-$REPORT_TS.txt"

echo "Running Schemathesis"
echo "  OpenAPI: $OPENAPI_PATH"
echo "  Base URL: $BASE_URL"
echo "  Examples per endpoint: $HYPO_MAX_EXAMPLES"
echo "  Workers: $WORKERS"
echo "  Output: $OUT_TXT"

echo "--- Schemathesis run started: $(date) ---" | tee "$OUT_TXT"

# Run schemathesis and tee output to file
"$SCHEMA_BIN" run "$OPENAPI_PATH" --base-url "$BASE_URL" --hypothesis-max-examples "$HYPO_MAX_EXAMPLES" --workers "$WORKERS" $EXTRA_ARGS 2>&1 | tee -a "$OUT_TXT"
EXIT_CODE=${PIPESTATUS[0]:-0}

echo "--- Schemathesis run finished: $(date) (exit=$EXIT_CODE) ---" | tee -a "$OUT_TXT"

if [ "$EXIT_CODE" -ne 0 ]; then
  echo "Schemathesis found failures. See report: $OUT_TXT"
  exit $EXIT_CODE
fi

echo "Schemathesis completed successfully. Report: $OUT_TXT"
exit 0
