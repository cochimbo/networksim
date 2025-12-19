# NetworkSim - Chaos Engineering Platform

A comprehensive network topology simulator with advanced chaos engineering capabilities for Kubernetes environments.

## Features

### Core Capabilities
- **Visual Topology Editor** - Cytoscape.js-based drag & drop interface
- **Real K8s Deployment** - Topologies deploy as actual pods with network policies
- **Topology Templates** - Pre-built topology patterns (Microservices, 3-Tier, Star, Ring, Mesh, Pipeline)
- **Report Export** - Generate JSON and HTML reports for analysis and sharing

### Chaos Engineering
Supports multiple Chaos Mesh CRD types:

| Category | Type | CRD | Description |
|----------|------|-----|-------------|
| **Network** | delay | NetworkChaos | Add latency to network traffic |
| **Network** | loss | NetworkChaos | Simulate packet loss |
| **Network** | bandwidth | NetworkChaos | Limit network bandwidth |
| **Network** | corrupt | NetworkChaos | Corrupt network packets |
| **Network** | duplicate | NetworkChaos | Duplicate packets |
| **Network** | partition | NetworkChaos | Network partition between nodes |
| **Stress** | stress-cpu | StressChaos | CPU stress on target pods |
| **Pod** | pod-kill | PodChaos | Kill and restart pods |
| **I/O** | io-delay | IOChaos | Add latency to disk I/O |
| **HTTP** | http-abort | HTTPChaos | Abort HTTP requests with error codes |

### Pre-configured Chaos Presets
Quick-apply common chaos scenarios:
- **High CPU Load** - 80% CPU stress
- **CPU Spike** - 100% CPU with 4 workers
- **Pod Restart** - Kill pod immediately
- **Slow Disk** - 100ms I/O latency
- **Disk Timeout** - 5s I/O latency
- **API Failure (500)** - HTTP 500 errors
- **Rate Limit (429)** - HTTP 429 responses
- And more...

### Additional Features
- **Application Deployment** - Deploy containers to topology nodes
- **Private Registry Support** - Harbor, GitLab Registry, ECR, GCR, ACR
- **Impact Dashboard** - Visualize chaos → nodes → apps relationships
- **App-to-App Tests** - Connectivity testing between applications
- **Live Metrics** - Real-time latency and packet loss monitoring
- **Event Timeline** - Track chaos events and deployments
- **Dark Mode** - Full dark theme support

## Project Structure

```
networksim/
├── backend/              # Rust API (Axum)
│   ├── src/
│   │   ├── api/          # REST endpoints
│   │   ├── chaos/        # Chaos Mesh integration
│   │   ├── k8s/          # Kubernetes client
│   │   └── models/       # Data models
│   └── migrations/       # SQLite migrations
├── frontend/             # React + TypeScript UI
│   ├── src/
│   │   ├── pages/        # Main views
│   │   ├── components/   # UI components
│   │   └── services/     # API client
├── infra/                # K8s manifests, Helm charts
├── scripts/              # Setup and utility scripts
└── docs/                 # Documentation
```

## Requirements

- Docker
- K3s or K3d cluster
- Chaos Mesh installed
- Calico CNI (for NetworkPolicy support)
- Rust 1.70+
- Node.js 18+

## Installation

### Automated Setup

```bash
# Full installation (Docker, k3d, Calico, Chaos Mesh)
./scripts/setup.sh

# Skip system dependencies
./scripts/setup.sh --skip-deps

# Skip cluster creation
./scripts/setup.sh --skip-cluster

# Uninstall
./scripts/setup.sh --uninstall
```

### Manual Setup

1. **Backend**
```bash
cd backend
cargo build --release

# Run with K3s
KUBECONFIG=/etc/rancher/k3s/k3s.yaml ./target/release/networksim-backend
```

2. **Frontend**
```bash
cd frontend
npm install
npm run dev
```

## Quick Start

```bash
# Start all services
./start.sh

# Restart
./start.sh restart

# Status
./start.sh status

# Stop
./start.sh stop
```

**URLs:**
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **Swagger UI**: http://localhost:8080/swagger-ui/
- **Health Check**: http://localhost:8080/health

## API Reference

### Topologies
```
GET    /api/topologies                    # List topologies (paginated)
POST   /api/topologies                    # Create topology
GET    /api/topologies/:id                # Get topology
PUT    /api/topologies/:id                # Update topology
DELETE /api/topologies/:id                # Delete topology
POST   /api/topologies/:id/deploy         # Deploy to Kubernetes
DELETE /api/topologies/:id/undeploy       # Remove from Kubernetes
```

### Templates
```
GET    /api/templates                     # List available templates
GET    /api/templates/:id                 # Get template details
POST   /api/templates/:id/generate        # Generate topology from template
```

### Chaos Conditions
```
GET    /api/chaos                         # List all conditions
GET    /api/chaos/topology/:id            # Get conditions for topology
POST   /api/chaos                         # Create chaos condition
PUT    /api/chaos/:id                     # Update condition
DELETE /api/chaos/:id                     # Delete condition
POST   /api/chaos/:id/activate            # Activate condition
POST   /api/chaos/:id/deactivate          # Deactivate condition
```

### Chaos Presets
```
GET    /api/presets                       # List presets
GET    /api/presets/categories            # List categories
POST   /api/presets/:id/apply             # Apply preset
```

### Reports
```
GET    /api/reports/:topology_id/json     # Get JSON report
GET    /api/reports/:topology_id/html     # Download HTML report
```

### Applications
```
GET    /api/applications                  # List applications
POST   /api/applications                  # Deploy application
DELETE /api/applications/:id              # Remove application
```

### Metrics
```
GET    /api/topologies/:id/metrics/live        # Live metrics
GET    /api/topologies/:id/metrics/history     # Historical metrics
GET    /api/topologies/:id/metrics/aggregated  # Aggregated stats
```

### Tests
```
POST   /api/v1/topologies/:id/tests/app-to-app  # Run connectivity test
```

## Topology Templates

## Environment variables (per-application)

- Where they live: environment variables edited in the UI are persisted per-application as JSON in the database column `envvalues` (historically `values`). The backend accepts the key `envvalues` in API requests and maps it to the application model.

- Accepted JSON shapes (frontend will normalize any of these):
	- { "env": [{ "name": "FOO", "value": "bar" }, ...] }
	- [ { "name": "FOO", "value": "bar" }, ... ]
	- { "FOO": "bar", "BLA": "x" }

- Flow:
	1. UI: open Applications panel → click the env icon to fetch the latest application (GET `/api/topologies/:topologyId/apps/:appId`) and open the `EnvVarsEditor` populated with the normalized env list.
	2. UI: edit/add/remove vars → click "Guardar y aplicar". The frontend sends a PUT to `/api/topologies/:topologyId/apps/:appId` with body `{ "envvalues": { ... } }`.
	3. Backend: `update_application` stores the JSON in the application row and on deployment the k8s spec builder (`create_application_container`) converts the JSON into container `env` entries.

- Sanitization and policy:
	- Env var names are sanitized (non-alphanumerics → `_`, converted to upper-case). If name starts with a digit a leading `_` is added.
	- The deployment logic will NOT overwrite built-in variables such as `APPLICATION_NAME` or `APPLICATION_CHART`; if a user variable collides it is skipped and a log message is emitted.

- How to verify (no DB needed):
	1. Open the app in the UI and save/envvars as usual.
	2. Check the pod environment from the host:
		 - List pods: `kubectl -n networksim-sim get pods`
		 - Choose an app pod and run: `kubectl -n networksim-sim exec <pod> -- sh -c 'printenv | grep -i LONCHA'`
	3. Inspect the Deployment spec to see which env keys were applied:
		 - `kubectl -n networksim-sim get deployment <deployment-name> -o yaml`
	4. Backend logs (tail `/tmp/networksim-backend.log`) include traces when an application is updated or when env variables are skipped due to conflicts.

- Example requests:
	- Save env via frontend (PUT body): `{ "envvalues": { "env": [{ "name": "LONCHA", "value": "QUESO" }] } }`
	- Create draft (POST): `POST /api/topologies/:id/apps/draft` with body `{ "chart": "busybox", "node_selector": ["node-1"], "envvalues": { "env": [...] } }`

Notes: the frontend normalizes several input shapes so small format differences (array vs map) do not affect the final container environment.

| Template | Nodes | Description |
|----------|-------|-------------|
| **Microservices** | 8 | API Gateway → Services → Databases |
| **3-Tier** | 7 | Load Balancer → Web → App → Database |
| **Star** | 7 | Central hub with spoke nodes |
| **Ring** | 6 | Circular topology |
| **Mesh** | 5 | Full mesh connectivity |
| **Pipeline** | 5 | Sequential processing stages |

## Database Schema

SQLite database with the following tables:
- `topologies` - Network topology definitions
- `chaos_conditions` - Active chaos configurations
- `chaos_presets` - Predefined chaos scenarios
- `applications` - Deployed container applications
- `network_metrics` - Collected network metrics
- `events` - System event log
- `registry_configs` - Container registry credentials

## Chaos Mesh Integration

The platform integrates with Chaos Mesh CRDs:

- **NetworkChaos** - Network fault injection (delay, loss, partition, etc.)
- **StressChaos** - Resource stress testing (CPU)
- **PodChaos** - Pod lifecycle disruption
- **IOChaos** - Disk I/O fault injection
- **HTTPChaos** - HTTP request manipulation

All chaos resources are created in the `networksim-sim` namespace with appropriate labels for management.

## Useful Commands

```bash
# View deployed pods
kubectl get pods -n networksim-sim

# View chaos resources
kubectl get networkchaos,stresschaos,podchaos,iochaos,httpchaos -n networksim-sim

# View network policies
kubectl get networkpolicies -n networksim-sim

# Check Chaos Mesh status
kubectl get pods -n chaos-mesh

# View pod logs
kubectl logs -n networksim-sim <pod-name>
```

## Network Diagnostic

```bash
./scripts/network-diagnostic.sh
```

Displays:
- Expected vs actual connectivity
- Connection matrix
- Latency between nodes
- Traffic statistics

## Troubleshooting

```bash
# Check occupied ports
ss -tlnp | grep -E "3000|8080"

# Kill services
pkill -9 -f "networksim-backend"
pkill -9 -f "vite"

# Restart cluster
./scripts/setup.sh --uninstall
./scripts/setup.sh --skip-deps

# View logs
tail -f /tmp/networksim-backend.log
tail -f /tmp/networksim-frontend.log
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, Cytoscape.js, TanStack Query |
| Backend | Rust, Axum, SQLx, kube-rs, utoipa (OpenAPI) |
| Database | SQLite |
| Container Runtime | K3s / K3d |
| Chaos Engine | Chaos Mesh |
| CNI | Calico |

## License

MIT
