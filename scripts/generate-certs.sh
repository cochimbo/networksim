#!/bin/bash
#
# Generate Self-Signed SSL Certificates for Local Development
#

set -e

CERT_DIR="../certs"
KEY_FILE="$CERT_DIR/nginx.key"
CERT_FILE="$CERT_DIR/nginx.crt"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Create certs directory if it doesn't exist
mkdir -p "$CERT_DIR"

if [ -f "$KEY_FILE" ] && [ -f "$CERT_FILE" ]; then
    echo -e "${GREEN}Certificates already exist in $CERT_DIR${NC}"
    exit 0
fi

echo -e "${YELLOW}Generating self-signed SSL certificates...${NC}"

# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/C=US/ST=State/L=City/O=NetworkSim/OU=Development/CN=localhost"

echo -e "${GREEN}Certificates generated successfully!${NC}"
echo -e "Key:  $KEY_FILE"
echo -e "Cert: $CERT_FILE"
