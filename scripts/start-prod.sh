#!/bin/bash
#
# Start NetworkSim in Production Mode (Docker Compose)
# Usage: ./start-prod.sh [start|stop|restart]
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Function to check if cluster is running
check_cluster() {
    if ! k3d cluster list | grep -q "networksim"; then
        echo -e "${YELLOW}Cluster 'networksim' not found. Creating it...${NC}"
        "$SCRIPT_DIR/setup.sh" --skip-deps
    else
        echo -e "${YELLOW}Ensuring cluster 'networksim' is started...${NC}"
        k3d cluster start networksim 2>/dev/null || true
        echo -e "${GREEN}Cluster 'networksim' is ready.${NC}"
    fi
}

# Function to stop everything
stop_all() {
    echo -e "${YELLOW}Stopping production containers...${NC}"
    if docker compose version &> /dev/null; then
        docker compose -f "$PROJECT_ROOT/docker-compose.prod.yml" down
    else
        docker-compose -f "$PROJECT_ROOT/docker-compose.prod.yml" down
    fi
    
    echo -e "${YELLOW}Stopping k3d cluster...${NC}"
    k3d cluster stop networksim || true
    
    echo -e "${GREEN}All services stopped.${NC}"
}

# Handle arguments
if [[ "$1" == "stop" ]]; then
    stop_all
    exit 0
fi

echo -e "${YELLOW}Starting NetworkSim in Production Mode...${NC}"

# 1. Ensure Cluster is running
check_cluster

# 2. Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "Error: docker-compose is not installed."
    exit 1
fi

# 3. Generate SSL certificates if needed
if [ ! -f "$PROJECT_ROOT/certs/nginx.crt" ] || [ ! -f "$PROJECT_ROOT/certs/nginx.key" ]; then
    echo "Generating SSL certificates..."

    # Fix: If certs dir exists but is not writable (e.g. created by Docker as root), remove it
    if [ -d "$PROJECT_ROOT/certs" ] && [ ! -w "$PROJECT_ROOT/certs" ]; then
        echo "Removing non-writable certs directory to avoid permission errors..."
        sudo rm -rf "$PROJECT_ROOT/certs"
    fi

    "$SCRIPT_DIR/generate-certs.sh"
fi

# 4. Generate Kubeconfig for Backend
echo "Generating kubeconfig for backend container..."
k3d kubeconfig get networksim > "$PROJECT_ROOT/kubeconfig.yaml"
# Replace localhost/0.0.0.0 with the k3d load balancer container name
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' 's/0.0.0.0/k3d-networksim-serverlb/g' "$PROJECT_ROOT/kubeconfig.yaml"
    sed -i '' 's/127.0.0.1/k3d-networksim-serverlb/g' "$PROJECT_ROOT/kubeconfig.yaml"
else
    sed -i 's/0.0.0.0/k3d-networksim-serverlb/g' "$PROJECT_ROOT/kubeconfig.yaml"
    sed -i 's/127.0.0.1/k3d-networksim-serverlb/g' "$PROJECT_ROOT/kubeconfig.yaml"
fi
# Replace the host mapped port with the internal k3d port (6443)
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' -E 's/k3d-networksim-serverlb:[0-9]+/k3d-networksim-serverlb:6443/g' "$PROJECT_ROOT/kubeconfig.yaml"
else
    sed -i -E 's/k3d-networksim-serverlb:[0-9]+/k3d-networksim-serverlb:6443/g' "$PROJECT_ROOT/kubeconfig.yaml"
fi
chmod 644 "$PROJECT_ROOT/kubeconfig.yaml"

# 5. Build and start containers
echo "Building and starting containers..."
cd "$PROJECT_ROOT"
if docker compose version &> /dev/null; then
    docker compose -f docker-compose.prod.yml up -d --build
else
    docker-compose -f docker-compose.prod.yml up -d --build
fi

echo ""
echo -e "${GREEN}NetworkSim is running!${NC}"
echo -e "Frontend: ${GREEN}https://localhost${NC} (HTTP redirects to HTTPS)"
echo -e "Backend:  ${GREEN}http://localhost:8080${NC}"
echo ""
echo "To stop everything:"
echo "  ./scripts/start-prod.sh stop"
