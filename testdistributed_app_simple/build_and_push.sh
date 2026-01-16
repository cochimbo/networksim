#!/bin/bash
set -e

# Configuration
REGISTRY="localhost:5000"
IMAGE_NAME="testdistributed_app_simple"
TAG="latest"

echo "Building Docker image ${REGISTRY}/${IMAGE_NAME}:${TAG}..."
docker build --no-cache -t ${REGISTRY}/${IMAGE_NAME}:${TAG} .

echo "Pushing image to local registry..."
docker push ${REGISTRY}/${IMAGE_NAME}:${TAG}

echo "Done! Image available at ${REGISTRY}/${IMAGE_NAME}:${TAG}"
