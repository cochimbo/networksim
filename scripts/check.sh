#!/bin/bash

# Run all checks before committing

set -e

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
