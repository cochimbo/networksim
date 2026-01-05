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
        echo -e "${GREEN}Cluster 'networksim' is running.${NC}"
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
    "$SCRIPT_DIR/generate-certs.sh"
fi

# 4. Build and start containers
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
