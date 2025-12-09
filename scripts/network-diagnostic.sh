#!/bin/zsh
# Network Diagnostic Script for NetworkSim
# Verifies connectivity between deployed pods matches the topology graph

set -e

NAMESPACE="networksim-sim"
TOPOLOGY_ID="${1:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    print_error "kubectl not found. Please install kubectl."
    exit 1
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
    print_error "jq not found. Please install jq."
    exit 1
fi

print_header "NetworkSim Network Diagnostic"

# Get all pods in the namespace
echo "Fetching pods in namespace: $NAMESPACE"
if [ -n "$TOPOLOGY_ID" ]; then
    PODS=$(kubectl get pods -n "$NAMESPACE" -l "networksim.io/topology=$TOPOLOGY_ID" -o json 2>/dev/null || echo '{"items":[]}')
else
    PODS=$(kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/managed-by=networksim" -o json 2>/dev/null || echo '{"items":[]}')
fi

POD_COUNT=$(echo "$PODS" | jq '.items | length')

if [ "$POD_COUNT" -eq 0 ]; then
    print_error "No pods found. Is there an active deployment?"
    exit 1
fi

print_success "Found $POD_COUNT pods"
echo ""

# Build maps: node_id -> info, and display_name -> node_id
typeset -A POD_IPS          # node_id -> IP
typeset -A POD_NAMES        # node_id -> pod_name  
typeset -A NODE_DISPLAY     # node_id -> display_name (e.g., "Node 1")
typeset -A DISPLAY_TO_ID    # display_name -> node_id

for i in $(seq 0 $((POD_COUNT - 1))); do
    POD_NAME=$(echo "$PODS" | jq -r ".items[$i].metadata.name")
    POD_IP=$(echo "$PODS" | jq -r ".items[$i].status.podIP // \"pending\"")
    NODE_ID=$(echo "$PODS" | jq -r ".items[$i].metadata.labels[\"networksim.io/node\"] // \"unknown\"")
    DISPLAY_NAME=$(echo "$PODS" | jq -r ".items[$i].metadata.annotations[\"networksim.io/node-name\"] // \"$NODE_ID\"")
    
    POD_IPS[$NODE_ID]="$POD_IP"
    POD_NAMES[$NODE_ID]="$POD_NAME"
    NODE_DISPLAY[$NODE_ID]="$DISPLAY_NAME"
    DISPLAY_TO_ID[$DISPLAY_NAME]="$NODE_ID"
    
    echo -e "  ${CYAN}$DISPLAY_NAME${NC}"
    echo "    Pod: $POD_NAME"
    echo "    IP: $POD_IP"
    echo ""
done

# Get NetworkPolicies to understand expected connectivity
print_header "Network Policies Analysis"

NETPOLS=$(kubectl get networkpolicies -n "$NAMESPACE" -l "app.kubernetes.io/managed-by=networksim" -o json 2>/dev/null || echo '{"items":[]}')
NETPOL_COUNT=$(echo "$NETPOLS" | jq '.items | length')

print_info "Found $NETPOL_COUNT network policies"
echo ""

# Build expected connectivity map from network policies
typeset -A EXPECTED_CONNECTIONS  # node_id -> space-separated list of allowed source node_ids

for i in $(seq 0 $((NETPOL_COUNT - 1))); do
    TARGET_NODE=$(echo "$NETPOLS" | jq -r ".items[$i].spec.podSelector.matchLabels[\"networksim.io/node\"]")
    TARGET_DISPLAY="${NODE_DISPLAY[$TARGET_NODE]:-$TARGET_NODE}"
    
    # Get allowed source nodes from ingress rules
    ALLOWED_SOURCES=($(echo "$NETPOLS" | jq -r ".items[$i].spec.ingress[0].from // [] | map(.podSelector.matchLabels[\"networksim.io/node\"] // empty)[]"))
    
    if [ ${#ALLOWED_SOURCES[@]} -gt 0 ]; then
        EXPECTED_CONNECTIONS[$TARGET_NODE]="${ALLOWED_SOURCES[*]}"
        # Convert source IDs to display names
        SOURCE_NAMES=""
        for SRC_ID in "${ALLOWED_SOURCES[@]}"; do
            SRC_NAME="${NODE_DISPLAY[$SRC_ID]:-$SRC_ID}"
            SOURCE_NAMES="$SOURCE_NAMES $SRC_NAME"
        done
        echo -e "  ${CYAN}$TARGET_DISPLAY${NC} accepts traffic from:$SOURCE_NAMES"
    else
        echo -e "  ${CYAN}$TARGET_DISPLAY${NC}: No incoming connections (isolated)"
    fi
done

# Function to test connectivity between two pods
test_connectivity() {
    local FROM_POD=$1
    local TO_IP=$2
    
    # Use ping (ICMP) - with Calico this will be properly filtered
    RESULT=$(kubectl exec -n "$NAMESPACE" "$FROM_POD" -- sh -c "
        if command -v ping >/dev/null 2>&1; then
            ping -c 1 -W 2 $TO_IP >/dev/null 2>&1 && echo 'SUCCESS' || echo 'FAILED'
        elif command -v nc >/dev/null 2>&1; then
            timeout 2 nc -zv $TO_IP 8080 2>&1 && echo 'SUCCESS' || echo 'FAILED'
        else
            echo 'NO_TOOLS'
        fi
    " 2>/dev/null || echo "EXEC_FAILED")
    
    echo "$RESULT"
}

# Function to measure latency
measure_latency() {
    local FROM_POD=$1
    local TO_IP=$2
    
    RESULT=$(kubectl exec -n "$NAMESPACE" "$FROM_POD" -- sh -c "
        if command -v ping >/dev/null 2>&1; then
            ping -c 3 -W 2 $TO_IP 2>/dev/null | tail -1 | awk -F'/' '{print \$5}'
        else
            echo 'N/A'
        fi
    " 2>/dev/null || echo "N/A")
    
    echo "$RESULT"
}

# Run connectivity tests
print_header "Connectivity Matrix Test"

echo "Testing connectivity between all pod pairs..."
echo ""

# Create results table
RESULTS_FILE=$(mktemp)
echo "FROM_ID,TO_ID,FROM_NAME,TO_NAME,EXPECTED,ACTUAL,LATENCY_MS,STATUS" > "$RESULTS_FILE"

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
UNEXPECTED_PASS=0
UNEXPECTED_FAIL=0

for FROM_NODE in ${(k)POD_IPS}; do
    FROM_POD="${POD_NAMES[$FROM_NODE]}"
    FROM_IP="${POD_IPS[$FROM_NODE]}"
    FROM_DISPLAY="${NODE_DISPLAY[$FROM_NODE]}"
    
    if [ "$FROM_IP" = "pending" ]; then
        print_warning "Skipping $FROM_DISPLAY (pod not ready)"
        continue
    fi
    
    echo -e "Testing from: ${CYAN}$FROM_DISPLAY${NC}"
    
    for TO_NODE in ${(k)POD_IPS}; do
        if [ "$FROM_NODE" = "$TO_NODE" ]; then
            continue
        fi
        
        TO_IP="${POD_IPS[$TO_NODE]}"
        TO_POD="${POD_NAMES[$TO_NODE]}"
        TO_DISPLAY="${NODE_DISPLAY[$TO_NODE]}"
        
        if [ "$TO_IP" = "pending" ]; then
            continue
        fi
        
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
        
        # Check if connection is expected based on network policy
        ALLOWED_SOURCES="${EXPECTED_CONNECTIONS[$TO_NODE]}"
        if echo "$ALLOWED_SOURCES" | grep -qw "$FROM_NODE"; then
            EXPECTED="ALLOW"
        else
            EXPECTED="DENY"
        fi
        
        # Test actual connectivity
        CONN_RESULT=$(test_connectivity "$FROM_POD" "$TO_IP")
        
        if echo "$CONN_RESULT" | grep -q "SUCCESS"; then
            ACTUAL="CONNECTED"
        else
            ACTUAL="BLOCKED"
        fi
        
        # Measure latency if connected
        if [ "$ACTUAL" = "CONNECTED" ]; then
            LATENCY=$(measure_latency "$FROM_POD" "$TO_IP")
        else
            LATENCY="N/A"
        fi
        
        # Determine status
        if [ "$EXPECTED" = "ALLOW" ] && [ "$ACTUAL" = "CONNECTED" ]; then
            STATUS="PASS"
            PASSED_TESTS=$((PASSED_TESTS + 1))
            print_success "$FROM_DISPLAY → $TO_DISPLAY: Connected (expected) - Latency: ${LATENCY}ms"
        elif [ "$EXPECTED" = "DENY" ] && [ "$ACTUAL" = "BLOCKED" ]; then
            STATUS="PASS"
            PASSED_TESTS=$((PASSED_TESTS + 1))
            print_success "$FROM_DISPLAY → $TO_DISPLAY: Blocked (expected)"
        elif [ "$EXPECTED" = "ALLOW" ] && [ "$ACTUAL" = "BLOCKED" ]; then
            STATUS="FAIL"
            FAILED_TESTS=$((FAILED_TESTS + 1))
            UNEXPECTED_FAIL=$((UNEXPECTED_FAIL + 1))
            print_error "$FROM_DISPLAY → $TO_DISPLAY: Blocked (should be allowed!)"
        else
            STATUS="WARN"
            FAILED_TESTS=$((FAILED_TESTS + 1))
            UNEXPECTED_PASS=$((UNEXPECTED_PASS + 1))
            print_warning "$FROM_DISPLAY → $TO_DISPLAY: Connected (should be blocked!)"
        fi
        
        echo "$FROM_NODE,$TO_NODE,$FROM_DISPLAY,$TO_DISPLAY,$EXPECTED,$ACTUAL,$LATENCY,$STATUS" >> "$RESULTS_FILE"
    done
    echo ""
done

# Summary
print_header "Test Summary"

echo "Total connection tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

if [ $UNEXPECTED_FAIL -gt 0 ]; then
    echo -e "${RED}  - $UNEXPECTED_FAIL connections blocked that should be allowed${NC}"
fi
if [ $UNEXPECTED_PASS -gt 0 ]; then
    echo -e "${YELLOW}  - $UNEXPECTED_PASS connections allowed that should be blocked${NC}"
fi

# Calculate success rate
if [ $TOTAL_TESTS -gt 0 ]; then
    SUCCESS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    echo -e "\nSuccess rate: ${SUCCESS_RATE}%"
fi

# Detailed connectivity matrix with display names
print_header "Connectivity Matrix"

echo "Legend: ✓ = Connected, ✗ = Blocked"
echo ""

# Get node IDs in sorted order by display name
SORTED_NODE_IDS=(${(f)"$(for k in ${(k)NODE_DISPLAY}; do echo "${NODE_DISPLAY[$k]}|$k"; done | sort | cut -d'|' -f2)"})

# Determine column width
COL_WIDTH=12

# Print header row
printf "%${COL_WIDTH}s" ""
for TO_ID in "${SORTED_NODE_IDS[@]}"; do
    printf "%${COL_WIDTH}s" "${NODE_DISPLAY[$TO_ID]}"
done
echo ""

# Print separator
printf "%${COL_WIDTH}s" ""
for TO_ID in "${SORTED_NODE_IDS[@]}"; do
    printf "%${COL_WIDTH}s" "-----------"
done
echo ""

# Print matrix rows
for FROM_ID in "${SORTED_NODE_IDS[@]}"; do
    printf "%${COL_WIDTH}s" "${NODE_DISPLAY[$FROM_ID]}"
    
    for TO_ID in "${SORTED_NODE_IDS[@]}"; do
        if [ "$FROM_ID" = "$TO_ID" ]; then
            printf "%${COL_WIDTH}s" "-"
        else
            ROW=$(grep "^$FROM_ID,$TO_ID," "$RESULTS_FILE" 2>/dev/null || echo "")
            if [ -n "$ROW" ]; then
                ACTUAL=$(echo "$ROW" | cut -d',' -f6)
                if [ "$ACTUAL" = "CONNECTED" ]; then
                    printf "%${COL_WIDTH}s" "✓"
                else
                    printf "%${COL_WIDTH}s" "✗"
                fi
            else
                printf "%${COL_WIDTH}s" "?"
            fi
        fi
    done
    echo ""
done

echo ""

# Network statistics per node
print_header "Network Statistics per Node"

for NODE_ID in ${(k)POD_IPS}; do
    POD_NAME="${POD_NAMES[$NODE_ID]}"
    POD_IP="${POD_IPS[$NODE_ID]}"
    DISPLAY_NAME="${NODE_DISPLAY[$NODE_ID]}"
    
    if [ "$POD_IP" = "pending" ]; then
        continue
    fi
    
    echo -e "${CYAN}$DISPLAY_NAME${NC}"
    echo "  Pod: $POD_NAME"
    echo "  IP: $POD_IP"
    
    # Get network interface stats
    STATS=$(kubectl exec -n "$NAMESPACE" "$POD_NAME" -- sh -c "
        if [ -f /proc/net/dev ]; then
            cat /proc/net/dev | grep -E 'eth0|ens' | head -1 | awk '{print \"RX:\", \$2, \"bytes, TX:\", \$10, \"bytes\"}'
        else
            echo 'N/A'
        fi
    " 2>/dev/null || echo "N/A")
    echo "  Traffic: $STATS"
    
    # Count connections
    INCOMING=$(grep ",$NODE_ID,.*,CONNECTED," "$RESULTS_FILE" 2>/dev/null | wc -l || echo "0")
    OUTGOING=$(grep "^$NODE_ID,.*,CONNECTED," "$RESULTS_FILE" 2>/dev/null | wc -l || echo "0")
    echo "  Connections: $INCOMING incoming, $OUTGOING outgoing"
    echo ""
done

# Cleanup
rm -f "$RESULTS_FILE"

# Final status
if [ $FAILED_TESTS -eq 0 ]; then
    print_header "Result: ALL TESTS PASSED ✓"
    exit 0
else
    print_header "Result: SOME TESTS FAILED ✗"
    exit 1
fi
