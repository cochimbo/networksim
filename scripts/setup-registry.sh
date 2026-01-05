#!/bin/bash
#
# Setup Local Docker Registry
#
# This script starts a local Docker registry on port 5000.
# It is used for local development and testing with custom images.
# Usage: ./setup-registry.sh [--list]
#

set -e

REGISTRY_NAME="registry"
REGISTRY_PORT="5000"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Function to list images
list_images() {
    echo -e "${YELLOW}Querying local registry at localhost:${REGISTRY_PORT}...${NC}"

    if ! curl -s --max-time 2 http://localhost:${REGISTRY_PORT}/v2/ > /dev/null; then
        echo "Error: Could not connect to registry at localhost:${REGISTRY_PORT}"
        echo "Make sure it is running."
        exit 1
    fi

    # Use python to parse JSON and fetch tags for each repo
    curl -s http://localhost:${REGISTRY_PORT}/v2/_catalog | python3 -c "
import sys, json, urllib.request

try:
    data = json.load(sys.stdin)
    repos = data.get('repositories', [])
    
    if not repos:
        print('Registry is empty.')
    else:
        print(f'Found {len(repos)} repositories:')
        for repo in repos:
            try:
                url = f'http://localhost:${REGISTRY_PORT}/v2/{repo}/tags/list'
                with urllib.request.urlopen(url) as response:
                    tags_data = json.loads(response.read())
                    tags = tags_data.get('tags', [])
                    if tags:
                        for tag in tags:
                            print(f'  • {repo}:{tag}')
                    else:
                        print(f'  • {repo} (no tags)')
            except Exception as e:
                print(f'  • {repo} (error fetching tags)')

except Exception as e:
    print(f'Error parsing registry response: {e}')
"
}

# Check arguments
if [[ "$1" == "--list" ]]; then
    list_images
    exit 0
fi

echo -e "${YELLOW}Setting up local Docker registry...${NC}"

# Check if registry container exists
if docker ps -a --format '{{.Names}}' | grep -q "^${REGISTRY_NAME}$"; then
    if docker ps --format '{{.Names}}' | grep -q "^${REGISTRY_NAME}$"; then
        echo -e "${GREEN}Registry is already running on port ${REGISTRY_PORT}${NC}"
    else
        echo -e "${YELLOW}Starting existing registry container...${NC}"
        docker start ${REGISTRY_NAME}
        echo -e "${GREEN}Registry started on port ${REGISTRY_PORT}${NC}"
    fi
else
    echo -e "${YELLOW}Creating new registry container...${NC}"
    docker run -d \
        -p ${REGISTRY_PORT}:5000 \
        --restart=always \
        --name ${REGISTRY_NAME} \
        registry:2
    echo -e "${GREEN}Registry created and started on port ${REGISTRY_PORT}${NC}"
fi

echo ""
echo -e "Registry URL: ${GREEN}localhost:${REGISTRY_PORT}${NC}"
echo -e "Inside k3d:   ${GREEN}host.k3d.internal:${REGISTRY_PORT}${NC}"
echo ""
echo "To push an image:"
echo "  docker tag my-image localhost:${REGISTRY_PORT}/my-image"
echo "  docker push localhost:${REGISTRY_PORT}/my-image"
echo ""
echo "To list images:"
echo "  ./scripts/setup-registry.sh --list"
