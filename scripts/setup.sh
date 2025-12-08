#!/bin/bash
#
# NetworkSim - Complete Setup Script
# 
# This script installs all prerequisites and sets up the complete development
# environment from scratch, including:
#   - Docker
#   - k3d (Kubernetes in Docker)
#   - K3s cluster with Calico CNI
#   - Chaos Mesh for network simulation
#   - Rust and Node.js dependencies
#
# Usage: ./scripts/setup.sh [--skip-deps] [--skip-cluster] [--uninstall]
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
CLUSTER_NAME="networksim"
NAMESPACE="networksim-sim"
CALICO_VERSION="v3.27.0"
CHAOS_MESH_VERSION="2.6.2"

# Flags
SKIP_DEPS=false
SKIP_CLUSTER=false
UNINSTALL=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        --skip-cluster)
            SKIP_CLUSTER=true
            shift
            ;;
        --uninstall)
            UNINSTALL=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--skip-deps] [--skip-cluster] [--uninstall]"
            echo ""
            echo "Options:"
            echo "  --skip-deps     Skip installing system dependencies"
            echo "  --skip-cluster  Skip creating K3d cluster"
            echo "  --uninstall     Remove cluster and clean up"
            echo "  -h, --help      Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
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

print_step() {
    echo -e "${CYAN}▶${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f /etc/debian_version ]; then
            OS="debian"
            PKG_MANAGER="apt-get"
        elif [ -f /etc/redhat-release ]; then
            OS="redhat"
            PKG_MANAGER="dnf"
        elif [ -f /etc/arch-release ]; then
            OS="arch"
            PKG_MANAGER="pacman"
        else
            OS="linux"
            PKG_MANAGER=""
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        PKG_MANAGER="brew"
    else
        OS="unknown"
        PKG_MANAGER=""
    fi
}

# Uninstall function
uninstall() {
    print_header "Uninstalling NetworkSim"
    
    print_step "Deleting K3d cluster..."
    k3d cluster delete $CLUSTER_NAME 2>/dev/null || true
    
    print_step "Cleaning up Docker resources..."
    docker volume prune -f 2>/dev/null || true
    
    print_success "Uninstall complete"
    exit 0
}

# Check if command exists
check_command() {
    command -v "$1" >/dev/null 2>&1
}

# Install Docker
install_docker() {
    if check_command docker; then
        print_success "Docker already installed: $(docker --version | cut -d' ' -f3 | tr -d ',')"
        return 0
    fi
    
    print_step "Installing Docker..."
    
    case $OS in
        debian)
            sudo apt-get update
            sudo apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
            sudo apt-get update
            sudo apt-get install -y docker-ce docker-ce-cli containerd.io
            sudo usermod -aG docker $USER
            ;;
        redhat)
            sudo dnf install -y dnf-plugins-core
            sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
            sudo dnf install -y docker-ce docker-ce-cli containerd.io
            sudo systemctl start docker
            sudo systemctl enable docker
            sudo usermod -aG docker $USER
            ;;
        macos)
            print_warning "Please install Docker Desktop from https://docker.com/products/docker-desktop"
            exit 1
            ;;
        *)
            print_error "Cannot auto-install Docker on this OS. Please install manually."
            exit 1
            ;;
    esac
    
    print_success "Docker installed"
}

# Install kubectl
install_kubectl() {
    if check_command kubectl; then
        print_success "kubectl already installed: $(kubectl version --client -o json 2>/dev/null | grep -o '"gitVersion": "[^"]*"' | head -1 | cut -d'"' -f4)"
        return 0
    fi
    
    print_step "Installing kubectl..."
    
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
    sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
    rm kubectl
    
    print_success "kubectl installed"
}

# Install k3d
install_k3d() {
    if check_command k3d; then
        print_success "k3d already installed: $(k3d version | head -1)"
        return 0
    fi
    
    print_step "Installing k3d..."
    
    curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash
    
    print_success "k3d installed"
}

# Install Helm
install_helm() {
    if check_command helm; then
        print_success "Helm already installed: $(helm version --short 2>/dev/null)"
        return 0
    fi
    
    print_step "Installing Helm..."
    
    curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
    
    print_success "Helm installed"
}

# Install jq
install_jq() {
    if check_command jq; then
        print_success "jq already installed: $(jq --version)"
        return 0
    fi
    
    print_step "Installing jq..."
    
    case $OS in
        debian)
            sudo apt-get install -y jq
            ;;
        redhat)
            sudo dnf install -y jq
            ;;
        macos)
            brew install jq
            ;;
        *)
            print_warning "Please install jq manually"
            ;;
    esac
    
    print_success "jq installed"
}

# Install Rust
install_rust() {
    if check_command rustc; then
        print_success "Rust already installed: $(rustc --version)"
        return 0
    fi
    
    print_step "Installing Rust..."
    
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    
    print_success "Rust installed"
}

# Install Node.js
install_nodejs() {
    if check_command node; then
        print_success "Node.js already installed: $(node --version)"
        return 0
    fi
    
    print_step "Installing Node.js..."
    
    case $OS in
        debian)
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        redhat)
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo dnf install -y nodejs
            ;;
        macos)
            brew install node@20
            ;;
        *)
            print_warning "Please install Node.js manually"
            ;;
    esac
    
    print_success "Node.js installed"
}

# Create K3d cluster with Calico
create_cluster() {
    print_step "Checking for existing cluster..."
    
    if k3d cluster list 2>/dev/null | grep -q "^$CLUSTER_NAME"; then
        print_warning "Cluster '$CLUSTER_NAME' already exists"
        read -p "Delete and recreate? [y/N]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_step "Deleting existing cluster..."
            k3d cluster delete $CLUSTER_NAME
        else
            print_step "Using existing cluster"
            return 0
        fi
    fi
    
    print_step "Creating K3d cluster without default CNI (for Calico)..."
    
    k3d cluster create $CLUSTER_NAME \
        --k3s-arg "--flannel-backend=none@server:*" \
        --k3s-arg "--disable-network-policy@server:*" \
        --servers 1 \
        --agents 2 \
        --wait
    
    print_success "K3d cluster created"
}

# Install Calico CNI
install_calico() {
    print_step "Installing Calico CNI..."
    
    # Check if already installed
    if kubectl get namespace calico-system &>/dev/null; then
        print_success "Calico already installed"
        return 0
    fi
    
    # Install Tigera operator
    kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION}/manifests/tigera-operator.yaml
    
    print_step "Waiting for operator to be ready..."
    sleep 10
    
    # Apply Calico configuration
    cat <<EOF | kubectl apply -f -
apiVersion: operator.tigera.io/v1
kind: Installation
metadata:
  name: default
spec:
  calicoNetwork:
    ipPools:
    - blockSize: 26
      cidr: 10.42.0.0/16
      encapsulation: VXLAN
      natOutgoing: Enabled
      nodeSelector: all()
    nodeAddressAutodetectionV4:
      firstFound: true
---
apiVersion: operator.tigera.io/v1
kind: APIServer
metadata:
  name: default
spec: {}
EOF
    
    print_step "Waiting for Calico to be ready (this may take 2-3 minutes)..."
    
    # Wait for calico-system namespace to exist
    for i in {1..30}; do
        if kubectl get namespace calico-system &>/dev/null; then
            break
        fi
        sleep 5
    done
    
    # Wait for calico-node pods
    kubectl wait --for=condition=Ready pods -l k8s-app=calico-node -n calico-system --timeout=300s 2>/dev/null || true
    
    # Wait for nodes to be ready
    kubectl wait --for=condition=Ready nodes --all --timeout=120s
    
    print_success "Calico CNI installed"
}

# Install Chaos Mesh
install_chaos_mesh() {
    print_step "Installing Chaos Mesh..."
    
    # Check if already installed
    if kubectl get namespace chaos-mesh &>/dev/null; then
        print_success "Chaos Mesh already installed"
        return 0
    fi
    
    # Create namespace
    kubectl create namespace chaos-mesh
    
    # Add Helm repo
    helm repo add chaos-mesh https://charts.chaos-mesh.org 2>/dev/null || true
    helm repo update
    
    # Install Chaos Mesh
    helm install chaos-mesh chaos-mesh/chaos-mesh \
        -n chaos-mesh \
        --set chaosDaemon.runtime=containerd \
        --set chaosDaemon.socketPath=/run/k3s/containerd/containerd.sock \
        --version ${CHAOS_MESH_VERSION}
    
    print_step "Waiting for Chaos Mesh to be ready..."
    kubectl wait --for=condition=Ready pods -l app.kubernetes.io/instance=chaos-mesh -n chaos-mesh --timeout=300s 2>/dev/null || true
    
    print_success "Chaos Mesh installed"
}

# Create simulation namespace
create_namespace() {
    print_step "Creating simulation namespace..."
    
    kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
    kubectl label namespace $NAMESPACE networksim.io/type=simulation --overwrite
    
    print_success "Namespace '$NAMESPACE' ready"
}

# Install project dependencies
install_project_deps() {
    print_step "Installing Rust dependencies..."
    if [ -d "backend" ]; then
        cd backend
        cargo fetch
        cargo build --release 2>/dev/null || cargo build
        cd ..
        print_success "Backend dependencies installed"
    fi
    
    print_step "Installing Node.js dependencies..."
    if [ -d "frontend" ]; then
        cd frontend
        npm install
        cd ..
        print_success "Frontend dependencies installed"
    fi
}

# Main setup flow
main() {
    print_header "NetworkSim Complete Setup"
    
    # Handle uninstall
    if [ "$UNINSTALL" = true ]; then
        uninstall
    fi
    
    # Detect OS
    detect_os
    print_step "Detected OS: $OS"
    
    # Install system dependencies
    if [ "$SKIP_DEPS" = false ]; then
        print_header "Installing System Dependencies"
        install_docker
        install_kubectl
        install_k3d
        install_helm
        install_jq
        install_rust
        install_nodejs
    else
        print_warning "Skipping system dependencies (--skip-deps)"
    fi
    
    # Verify Docker is running
    print_header "Verifying Docker"
    if ! docker info &>/dev/null; then
        print_error "Docker is not running. Please start Docker and try again."
        print_warning "If you just installed Docker, you may need to log out and back in."
        exit 1
    fi
    print_success "Docker is running"
    
    # Create cluster
    if [ "$SKIP_CLUSTER" = false ]; then
        print_header "Setting up Kubernetes Cluster"
        create_cluster
        install_calico
        install_chaos_mesh
        create_namespace
    else
        print_warning "Skipping cluster setup (--skip-cluster)"
    fi
    
    # Install project dependencies
    print_header "Installing Project Dependencies"
    install_project_deps
    
    # Verify cluster
    print_header "Verifying Setup"
    
    echo ""
    echo "Cluster status:"
    kubectl get nodes
    echo ""
    echo "Calico pods:"
    kubectl get pods -n calico-system 2>/dev/null | head -5 || echo "  (not installed)"
    echo ""
    echo "Chaos Mesh pods:"
    kubectl get pods -n chaos-mesh 2>/dev/null | head -5 || echo "  (not installed)"
    echo ""
    
    print_header "Setup Complete! 🎉"
    
    echo -e "
${GREEN}NetworkSim is ready to use!${NC}

${CYAN}Quick Start:${NC}
  ./start.sh              # Start backend and frontend
  ./start.sh restart      # Restart services

${CYAN}URLs:${NC}
  Frontend: ${BLUE}http://localhost:3000${NC}
  Backend:  ${BLUE}http://localhost:8080${NC}

${CYAN}Useful Commands:${NC}
  kubectl get pods -n networksim-sim     # View deployed pods
  ./scripts/network-diagnostic.sh        # Test network connectivity
  ./scripts/check-pods.sh                # Check pod status

${CYAN}Cluster Info:${NC}
  Cluster: k3d-$CLUSTER_NAME
  CNI: Calico (NetworkPolicy + ICMP support)
  Chaos: Chaos Mesh ${CHAOS_MESH_VERSION}

${YELLOW}Note:${NC} If you just installed Docker, you may need to log out
and back in for group permissions to take effect.
"
}

# Run main
main
