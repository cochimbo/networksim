#!/bin/bash
#
# Smoke Test Script
#
# Quick validation that the application is working correctly.
# Runs basic health checks and verifies core functionality.
#
# Usage: ./scripts/smoke-test.sh [--backend-only|--frontend-only]
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
BACKEND_URL="${BACKEND_URL:-http://localhost:8080}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
TIMEOUT=10

# Parse arguments
TEST_BACKEND=true
TEST_FRONTEND=true

while [[ $# -gt 0 ]]; do
    case $1 in
        --backend-only)
            TEST_FRONTEND=false
            shift
            ;;
        --frontend-only)
            TEST_BACKEND=false
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--backend-only|--frontend-only]"
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

PASSED=0
FAILED=0

print_test() {
    echo -n "[TEST] $1... "
}

print_pass() {
    echo -e "${GREEN}PASS${NC}"
    ((PASSED++))
}

print_fail() {
    echo -e "${RED}FAIL${NC} - $1"
    ((FAILED++))
}

# Backend tests
test_backend() {
    echo ""
    echo "=== Backend Smoke Tests ==="
    echo ""

    # Health check
    print_test "Backend health check"
    RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/health.json "$BACKEND_URL/health" --max-time $TIMEOUT 2>/dev/null || echo "000")
    if [[ "$RESPONSE" == "200" ]]; then
        STATUS=$(cat /tmp/health.json | jq -r '.status' 2>/dev/null || echo "")
        if [[ "$STATUS" == "ok" ]]; then
            print_pass
        else
            print_fail "status is not 'ok'"
        fi
    else
        print_fail "HTTP $RESPONSE"
    fi

    # List topologies (should return empty array or topologies)
    print_test "GET /api/topologies"
    RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/topologies.json "$BACKEND_URL/api/topologies" --max-time $TIMEOUT 2>/dev/null || echo "000")
    if [[ "$RESPONSE" == "200" ]]; then
        if jq -e 'type == "array"' /tmp/topologies.json > /dev/null 2>&1; then
            print_pass
        else
            print_fail "response is not an array"
        fi
    else
        print_fail "HTTP $RESPONSE"
    fi

    # Create topology
    print_test "POST /api/topologies (create)"
    PAYLOAD='{"name":"Smoke Test Topology","nodes":[{"id":"n1","name":"Node 1","position":{"x":0,"y":0}}],"links":[]}'
    RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/created.json -X POST "$BACKEND_URL/api/topologies" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" --max-time $TIMEOUT 2>/dev/null || echo "000")
    if [[ "$RESPONSE" == "200" ]]; then
        TOPO_ID=$(cat /tmp/created.json | jq -r '.id' 2>/dev/null || echo "")
        if [[ -n "$TOPO_ID" && "$TOPO_ID" != "null" ]]; then
            print_pass
        else
            print_fail "no ID returned"
        fi
    else
        print_fail "HTTP $RESPONSE"
    fi

    # Get created topology
    if [[ -n "$TOPO_ID" && "$TOPO_ID" != "null" ]]; then
        print_test "GET /api/topologies/:id"
        RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/topo.json "$BACKEND_URL/api/topologies/$TOPO_ID" --max-time $TIMEOUT 2>/dev/null || echo "000")
        if [[ "$RESPONSE" == "200" ]]; then
            NAME=$(cat /tmp/topo.json | jq -r '.name' 2>/dev/null || echo "")
            if [[ "$NAME" == "Smoke Test Topology" ]]; then
                print_pass
            else
                print_fail "name mismatch"
            fi
        else
            print_fail "HTTP $RESPONSE"
        fi

        # Update topology
        print_test "PUT /api/topologies/:id (update)"
        UPDATE_PAYLOAD='{"name":"Updated Smoke Test"}'
        RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/updated.json -X PUT "$BACKEND_URL/api/topologies/$TOPO_ID" \
            -H "Content-Type: application/json" \
            -d "$UPDATE_PAYLOAD" --max-time $TIMEOUT 2>/dev/null || echo "000")
        if [[ "$RESPONSE" == "200" ]]; then
            NAME=$(cat /tmp/updated.json | jq -r '.name' 2>/dev/null || echo "")
            if [[ "$NAME" == "Updated Smoke Test" ]]; then
                print_pass
            else
                print_fail "name not updated"
            fi
        else
            print_fail "HTTP $RESPONSE"
        fi

        # Delete topology
        print_test "DELETE /api/topologies/:id"
        RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null -X DELETE "$BACKEND_URL/api/topologies/$TOPO_ID" --max-time $TIMEOUT 2>/dev/null || echo "000")
        if [[ "$RESPONSE" == "200" ]]; then
            print_pass
        else
            print_fail "HTTP $RESPONSE"
        fi

        # Verify deletion
        print_test "Verify deletion (should return 404)"
        RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null "$BACKEND_URL/api/topologies/$TOPO_ID" --max-time $TIMEOUT 2>/dev/null || echo "000")
        if [[ "$RESPONSE" == "404" ]]; then
            print_pass
        else
            print_fail "HTTP $RESPONSE (expected 404)"
        fi
    fi

    # Cluster status (may fail if k8s not connected)
    print_test "GET /api/cluster/status"
    RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/cluster.json "$BACKEND_URL/api/cluster/status" --max-time $TIMEOUT 2>/dev/null || echo "000")
    if [[ "$RESPONSE" == "200" ]]; then
        print_pass
    else
        echo -e "${YELLOW}SKIP${NC} (K8s may not be connected)"
    fi

    # Metrics endpoint
    print_test "GET /metrics"
    RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null "$BACKEND_URL/metrics" --max-time $TIMEOUT 2>/dev/null || echo "000")
    if [[ "$RESPONSE" == "200" ]]; then
        print_pass
    else
        print_fail "HTTP $RESPONSE"
    fi
}

# Frontend tests
test_frontend() {
    echo ""
    echo "=== Frontend Smoke Tests ==="
    echo ""

    # Check if frontend is responding
    print_test "Frontend responds"
    RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null "$FRONTEND_URL" --max-time $TIMEOUT 2>/dev/null || echo "000")
    if [[ "$RESPONSE" == "200" ]]; then
        print_pass
    else
        print_fail "HTTP $RESPONSE"
    fi

    # Check for HTML content
    print_test "Frontend serves HTML"
    CONTENT=$(curl -s "$FRONTEND_URL" --max-time $TIMEOUT 2>/dev/null || echo "")
    if echo "$CONTENT" | grep -q "<!DOCTYPE html\|<html"; then
        print_pass
    else
        print_fail "no HTML content"
    fi

    # Check for JS bundle
    print_test "Frontend serves JS assets"
    if echo "$CONTENT" | grep -qE 'src="[^"]*\.js"'; then
        print_pass
    else
        print_fail "no JS assets found"
    fi
}

# Main
main() {
    echo "========================================"
    echo "  NetworkSim Smoke Tests"
    echo "========================================"
    echo ""
    echo "Backend URL: $BACKEND_URL"
    echo "Frontend URL: $FRONTEND_URL"

    if [[ "$TEST_BACKEND" == "true" ]]; then
        test_backend
    fi

    if [[ "$TEST_FRONTEND" == "true" ]]; then
        test_frontend
    fi

    # Summary
    echo ""
    echo "========================================"
    echo "  Summary"
    echo "========================================"
    echo ""
    echo -e "Passed: ${GREEN}$PASSED${NC}"
    echo -e "Failed: ${RED}$FAILED${NC}"
    echo ""

    if [[ $FAILED -gt 0 ]]; then
        echo -e "${RED}Smoke tests FAILED${NC}"
        exit 1
    else
        echo -e "${GREEN}All smoke tests PASSED${NC}"
        exit 0
    fi
}

main
