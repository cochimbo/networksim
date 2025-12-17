#!/bin/bash
#
# Chaos Validation Script
#
# This script validates that chaos conditions are working correctly by:
# 1. Creating test pods
# 2. Applying chaos conditions
# 3. Measuring the actual network effects
# 4. Verifying they match expected behavior
#
# Usage: ./scripts/chaos-validation.sh [--quick|--full]
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
NAMESPACE="networksim-sim"
TEST_PREFIX="chaos-test"
TIMEOUT=60

# Parse arguments
MODE="quick"
while [[ $# -gt 0 ]]; do
    case $1 in
        --quick)
            MODE="quick"
            shift
            ;;
        --full)
            MODE="full"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--quick|--full]"
            echo ""
            echo "Options:"
            echo "  --quick    Run quick validation tests (default)"
            echo "  --full     Run comprehensive validation tests"
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_test() {
    echo -e "${CYAN}[TEST]${NC} $1"
}

print_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

print_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

# Cleanup function
cleanup() {
    print_info "Cleaning up test resources..."
    kubectl delete pod -n $NAMESPACE -l app=$TEST_PREFIX --ignore-not-found=true 2>/dev/null || true
    kubectl delete networkchaos -n $NAMESPACE -l test=chaos-validation --ignore-not-found=true 2>/dev/null || true
}

trap cleanup EXIT

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        print_fail "kubectl not found"
        exit 1
    fi
    print_pass "kubectl installed"

    # Check cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        print_fail "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    print_pass "Connected to cluster"

    # Check namespace exists
    if ! kubectl get namespace $NAMESPACE &> /dev/null; then
        print_fail "Namespace $NAMESPACE not found"
        exit 1
    fi
    print_pass "Namespace $NAMESPACE exists"

    # Check Chaos Mesh
    if ! kubectl get crd networkchaos.chaos-mesh.org &> /dev/null; then
        print_fail "Chaos Mesh not installed"
        exit 1
    fi
    print_pass "Chaos Mesh CRD found"

    # Check Chaos Mesh pods
    if ! kubectl get pods -n chaos-mesh -l app.kubernetes.io/instance=chaos-mesh --no-headers 2>/dev/null | grep -q Running; then
        print_fail "Chaos Mesh pods not running"
        exit 1
    fi
    print_pass "Chaos Mesh pods running"
}

# Create test pods
create_test_pods() {
    print_header "Creating Test Pods"

    # Source pod
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: ${TEST_PREFIX}-source
  namespace: $NAMESPACE
  labels:
    app: $TEST_PREFIX
    role: source
spec:
  containers:
  - name: alpine
    image: alpine:latest
    command: ["sleep", "infinity"]
EOF

    # Target pod
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: ${TEST_PREFIX}-target
  namespace: $NAMESPACE
  labels:
    app: $TEST_PREFIX
    role: target
spec:
  containers:
  - name: alpine
    image: alpine:latest
    command: ["sleep", "infinity"]
EOF

    print_info "Waiting for pods to be ready..."
    kubectl wait --for=condition=Ready pod/${TEST_PREFIX}-source -n $NAMESPACE --timeout=${TIMEOUT}s
    kubectl wait --for=condition=Ready pod/${TEST_PREFIX}-target -n $NAMESPACE --timeout=${TIMEOUT}s

    # Get pod IPs
    SOURCE_IP=$(kubectl get pod ${TEST_PREFIX}-source -n $NAMESPACE -o jsonpath='{.status.podIP}')
    TARGET_IP=$(kubectl get pod ${TEST_PREFIX}-target -n $NAMESPACE -o jsonpath='{.status.podIP}')

    print_pass "Source pod IP: $SOURCE_IP"
    print_pass "Target pod IP: $TARGET_IP"
}

# Test baseline connectivity
test_baseline() {
    print_header "Testing Baseline Connectivity"

    # Install ping in source pod
    kubectl exec -n $NAMESPACE ${TEST_PREFIX}-source -- apk add --no-cache iputils &>/dev/null || true

    # Test ping
    print_test "Testing ICMP connectivity..."
    if kubectl exec -n $NAMESPACE ${TEST_PREFIX}-source -- ping -c 3 -W 2 $TARGET_IP &>/dev/null; then
        print_pass "Baseline ICMP connectivity works"
    else
        print_fail "Baseline ICMP connectivity failed"
        return 1
    fi

    # Measure baseline latency
    BASELINE_LATENCY=$(kubectl exec -n $NAMESPACE ${TEST_PREFIX}-source -- ping -c 5 -q $TARGET_IP 2>/dev/null | grep "avg" | awk -F'/' '{print $5}')
    print_info "Baseline latency: ${BASELINE_LATENCY}ms"

    echo "$BASELINE_LATENCY"
}

# Test delay chaos
test_delay_chaos() {
    local expected_delay=$1
    print_header "Testing Delay Chaos (${expected_delay})"

    # Apply delay chaos
    cat <<EOF | kubectl apply -f -
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: ${TEST_PREFIX}-delay
  namespace: $NAMESPACE
  labels:
    test: chaos-validation
spec:
  action: delay
  mode: all
  selector:
    namespaces:
      - $NAMESPACE
    labelSelectors:
      app: $TEST_PREFIX
      role: source
  delay:
    latency: "${expected_delay}"
    jitter: "0ms"
  direction: to
  target:
    selector:
      namespaces:
        - $NAMESPACE
      labelSelectors:
        app: $TEST_PREFIX
        role: target
    mode: all
EOF

    print_info "Waiting for chaos to be applied..."
    sleep 5

    # Measure latency with chaos
    print_test "Measuring latency with delay chaos..."
    CHAOS_LATENCY=$(kubectl exec -n $NAMESPACE ${TEST_PREFIX}-source -- ping -c 5 -q $TARGET_IP 2>/dev/null | grep "avg" | awk -F'/' '{print $5}')

    print_info "Latency with chaos: ${CHAOS_LATENCY}ms"

    # Extract numeric value from expected delay
    EXPECTED_MS=$(echo $expected_delay | grep -oE '[0-9]+')

    # Check if latency increased by at least 80% of expected
    LATENCY_INCREASE=$(echo "$CHAOS_LATENCY - $BASELINE_LATENCY" | bc 2>/dev/null || echo "0")
    MIN_EXPECTED=$(echo "$EXPECTED_MS * 0.8" | bc 2>/dev/null || echo "0")

    if (( $(echo "$LATENCY_INCREASE >= $MIN_EXPECTED" | bc -l 2>/dev/null || echo "0") )); then
        print_pass "Delay chaos working: +${LATENCY_INCREASE}ms (expected ~${EXPECTED_MS}ms)"
    else
        print_fail "Delay chaos may not be working correctly: +${LATENCY_INCREASE}ms (expected ~${EXPECTED_MS}ms)"
    fi

    # Cleanup
    kubectl delete networkchaos ${TEST_PREFIX}-delay -n $NAMESPACE --ignore-not-found=true
    sleep 2
}

# Test packet loss chaos
test_loss_chaos() {
    local loss_percent=$1
    print_header "Testing Packet Loss Chaos (${loss_percent}%)"

    # Apply loss chaos
    cat <<EOF | kubectl apply -f -
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: ${TEST_PREFIX}-loss
  namespace: $NAMESPACE
  labels:
    test: chaos-validation
spec:
  action: loss
  mode: all
  selector:
    namespaces:
      - $NAMESPACE
    labelSelectors:
      app: $TEST_PREFIX
      role: source
  loss:
    loss: "${loss_percent}"
  direction: to
  target:
    selector:
      namespaces:
        - $NAMESPACE
      labelSelectors:
        app: $TEST_PREFIX
        role: target
    mode: all
EOF

    print_info "Waiting for chaos to be applied..."
    sleep 5

    # Send many pings and count losses
    print_test "Measuring packet loss..."
    PING_RESULT=$(kubectl exec -n $NAMESPACE ${TEST_PREFIX}-source -- ping -c 20 -q $TARGET_IP 2>/dev/null || true)

    LOSS_PERCENT_ACTUAL=$(echo "$PING_RESULT" | grep "packet loss" | grep -oE '[0-9]+%' | tr -d '%')

    print_info "Actual packet loss: ${LOSS_PERCENT_ACTUAL}%"

    # Allow for some variance in packet loss
    MIN_LOSS=$(echo "$loss_percent * 0.5" | bc 2>/dev/null || echo "0")
    MAX_LOSS=$(echo "$loss_percent * 1.5 + 10" | bc 2>/dev/null || echo "100")

    if (( $(echo "$LOSS_PERCENT_ACTUAL >= $MIN_LOSS && $LOSS_PERCENT_ACTUAL <= $MAX_LOSS" | bc -l 2>/dev/null || echo "0") )); then
        print_pass "Loss chaos working: ${LOSS_PERCENT_ACTUAL}% (expected ~${loss_percent}%)"
    else
        print_fail "Loss chaos may not be working correctly: ${LOSS_PERCENT_ACTUAL}% (expected ~${loss_percent}%)"
    fi

    # Cleanup
    kubectl delete networkchaos ${TEST_PREFIX}-loss -n $NAMESPACE --ignore-not-found=true
    sleep 2
}

# Test partition (complete disconnect)
test_partition_chaos() {
    print_header "Testing Network Partition"

    # Apply partition chaos
    cat <<EOF | kubectl apply -f -
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: ${TEST_PREFIX}-partition
  namespace: $NAMESPACE
  labels:
    test: chaos-validation
spec:
  action: partition
  mode: all
  selector:
    namespaces:
      - $NAMESPACE
    labelSelectors:
      app: $TEST_PREFIX
      role: source
  direction: both
  target:
    selector:
      namespaces:
        - $NAMESPACE
      labelSelectors:
        app: $TEST_PREFIX
        role: target
    mode: all
EOF

    print_info "Waiting for chaos to be applied..."
    sleep 5

    # Test that connectivity is broken
    print_test "Verifying network partition..."
    if kubectl exec -n $NAMESPACE ${TEST_PREFIX}-source -- ping -c 3 -W 2 $TARGET_IP &>/dev/null; then
        print_fail "Partition chaos NOT working - connectivity still exists"
    else
        print_pass "Partition chaos working - connectivity is blocked"
    fi

    # Cleanup
    kubectl delete networkchaos ${TEST_PREFIX}-partition -n $NAMESPACE --ignore-not-found=true
    sleep 2

    # Verify connectivity restored
    print_test "Verifying connectivity restored after removing chaos..."
    if kubectl exec -n $NAMESPACE ${TEST_PREFIX}-source -- ping -c 3 -W 5 $TARGET_IP &>/dev/null; then
        print_pass "Connectivity restored after removing chaos"
    else
        print_fail "Connectivity NOT restored after removing chaos"
    fi
}

# Main
main() {
    print_header "Chaos Mesh Validation Suite"
    echo "Mode: $MODE"

    check_prerequisites
    create_test_pods
    BASELINE_LATENCY=$(test_baseline)

    if [[ "$MODE" == "quick" ]]; then
        test_delay_chaos "100ms"
        test_partition_chaos
    else
        # Full mode - test all conditions
        test_delay_chaos "50ms"
        test_delay_chaos "100ms"
        test_delay_chaos "200ms"
        test_loss_chaos "10"
        test_loss_chaos "25"
        test_loss_chaos "50"
        test_partition_chaos
    fi

    print_header "Validation Complete"
    print_pass "All chaos validation tests completed"
}

main
