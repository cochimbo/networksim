#!/bin/bash

# Development setup script for NetworkSim

set -e

echo "🚀 Setting up NetworkSim development environment..."

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed."; exit 1; }
command -v docker-compose >/dev/null 2>&1 || command -v "docker compose" >/dev/null 2>&1 || { echo "❌ Docker Compose is required but not installed."; exit 1; }

# Check optional prerequisites
if command -v rustc >/dev/null 2>&1; then
    echo "✅ Rust $(rustc --version | cut -d' ' -f2)"
else
    echo "⚠️  Rust not installed locally (will use Docker)"
fi

if command -v node >/dev/null 2>&1; then
    echo "✅ Node.js $(node --version)"
else
    echo "⚠️  Node.js not installed locally (will use Docker)"
fi

if command -v k3d >/dev/null 2>&1; then
    echo "✅ k3d $(k3d version | head -1 | cut -d' ' -f3)"
else
    echo "⚠️  k3d not installed. Install with: curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash"
fi

echo ""
echo "📁 Project structure:"
echo "   backend/   - Rust API server"
echo "   frontend/  - React UI"
echo "   infra/     - Kubernetes manifests"
echo ""

# Ask user what to do
echo "What would you like to do?"
echo "  1) Start development environment (docker-compose)"
echo "  2) Install local dependencies"
echo "  3) Create k3d cluster"
echo "  4) All of the above"
echo "  q) Quit"
echo ""
read -p "Choice [1-4, q]: " choice

case $choice in
    1)
        echo "🐳 Starting docker-compose..."
        docker-compose up -d
        echo "✅ Services started!"
        echo "   Frontend: http://localhost:3000"
        echo "   Backend:  http://localhost:8080"
        echo "   Grafana:  http://localhost:3001 (admin/admin)"
        ;;
    2)
        echo "📦 Installing dependencies..."
        if [ -d "backend" ]; then
            cd backend && cargo fetch && cd ..
        fi
        if [ -d "frontend" ]; then
            cd frontend && npm install && cd ..
        fi
        echo "✅ Dependencies installed!"
        ;;
    3)
        echo "☸️  Creating k3d cluster..."
        k3d cluster create networksim --agents 1 --wait
        echo "📋 Applying K8s manifests..."
        kubectl apply -f infra/k8s/
        echo "✅ Cluster ready!"
        echo "   kubectl config use-context k3d-networksim"
        ;;
    4)
        echo "🔄 Running full setup..."
        
        # Dependencies
        if [ -d "frontend" ]; then
            cd frontend && npm install && cd ..
        fi
        
        # k3d cluster
        if command -v k3d >/dev/null 2>&1; then
            k3d cluster create networksim --agents 1 --wait 2>/dev/null || echo "Cluster already exists"
            kubectl apply -f infra/k8s/
        fi
        
        # Docker compose
        docker-compose up -d
        
        echo "✅ Full setup complete!"
        ;;
    q|Q)
        echo "👋 Bye!"
        exit 0
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "🎉 Done! Happy coding!"
