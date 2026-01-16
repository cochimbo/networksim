#!/bin/bash

# Run all checks before committing

set -e

# Asegurar que estamos en la raíz del proyecto
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$SCRIPT_DIR/.."
cd "$PROJECT_DIR"

echo "🔍 Running pre-commit checks..."

# Backend checks
echo "📦 Backend..."
cd backend
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --quiet
cd ..

# Frontend checks
echo "📦 Frontend..."
cd frontend
npm run lint
npx tsc --noEmit
npm test -- --run
cd ..

echo "✅ All checks passed!"
