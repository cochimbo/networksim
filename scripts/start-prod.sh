#!/bin/bash
#
# Start NetworkSim in Production Mode (Docker Compose)
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Starting NetworkSim in Production Mode...${NC}"

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "Error: docker-compose is not installed."
    exit 1
fi

# Generate SSL certificates if needed
if [ ! -f "../certs/nginx.crt" ] || [ ! -f "../certs/nginx.key" ]; then
    echo "Generating SSL certificates..."
    "$(dirname "$0")/generate-certs.sh"
fi

# Build and start containers
echo "Building and starting containers..."
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
echo "To stop:"
echo "  docker compose -f docker-compose.prod.yml down"
