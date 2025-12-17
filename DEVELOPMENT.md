# NetworkSim - Chaos Engineering Platform

Network topology simulator with multi-CRD chaos engineering for K3s/Kubernetes.

## Quick Start
```bash
# Backend (port 8080)
cd /home/ubuntuser/chaosmesh/backend
KUBECONFIG=/etc/rancher/k3s/k3s.yaml ./target/release/networksim-backend

# Frontend (port 3000)
cd /home/ubuntuser/chaosmesh/frontend && npm run dev
```

## Architecture
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Cytoscape.js, TanStack Query
- **Backend**: Rust, Axum, SQLx, kube-rs, utoipa (Swagger at `/swagger-ui/`)
- **Infra**: K3s, Chaos Mesh, SQLite | Namespace: `networksim-sim`

## Project Structure
```
backend/src/
├── api/           # REST endpoints
│   ├── chaos.rs          # Chaos conditions CRUD
│   ├── topologies.rs     # Topology management
│   ├── templates.rs      # Topology templates
│   ├── reports.rs        # JSON/HTML reports
│   ├── applications.rs   # App deployment
│   ├── presets.rs        # Chaos presets
│   ├── registry.rs       # Container registries
│   └── live_metrics.rs   # Real-time metrics
├── chaos/         # Chaos Mesh integration
│   ├── types.rs          # ChaosType enum, params
│   ├── conditions.rs     # CRD manifest builders
│   └── client.rs         # K8s API client
├── k8s/           # Kubernetes client
├── models/        # Data models
└── lib.rs         # Router

frontend/src/
├── pages/         # TopologyEditor.tsx (main), Settings.tsx, Scenarios.tsx
├── components/
│   ├── ChaosPanel.tsx        # Chaos condition editor
│   ├── ChaosPresets.tsx      # Quick-apply presets
│   ├── TemplateSelector.tsx  # Topology templates modal
│   ├── ExportReport.tsx      # Report export modal
│   ├── ApplicationsPanel.tsx # App deployment
│   ├── LiveMetrics.tsx       # Real-time metrics
│   └── NetworkMatrix.tsx     # Connectivity matrix
└── services/      # api.ts
```

## Chaos Types

### Network Chaos (NetworkChaos CRD)
| Type | Description | Params |
|------|-------------|--------|
| delay | Add latency | latency (ms), jitter, correlation |
| loss | Packet loss | percent |
| bandwidth | Rate limit | rate, limit, buffer |
| corrupt | Corruption | percent, correlation |
| duplicate | Duplication | percent |
| partition | Isolation | - |

### Extended Chaos Types
| Type | CRD | Description | Params |
|------|-----|-------------|--------|
| stress-cpu | StressChaos | CPU stress | load (%), workers |
| pod-kill | PodChaos | Kill pods | gracePeriod |
| io-delay | IOChaos | Disk I/O latency | delay, path, percent |
| http-abort | HTTPChaos | HTTP errors | code, method, path |

## Key Features
- **Topologies**: Visual editor (Cytoscape.js), deploy to K8s, Network Policies
- **Templates**: 6 pre-built patterns (Microservices, 3-Tier, Star, Ring, Mesh, Pipeline)
- **Reports**: Export JSON data or standalone HTML reports
- **Chaos**: 10 chaos types across 5 categories with presets
- **Apps**: Deploy containers to nodes, env vars, private registries
- **Metrics**: Real-time latency/loss, chaos timeline markers
- **Tests**: App-to-app connectivity tests with visual results

## Database Tables
`topologies`, `chaos_conditions`, `chaos_presets`, `applications`, `network_metrics`, `events`, `registry_configs`

## API Endpoints
```
# Topologies
GET/POST /api/topologies              # CRUD + pagination
POST     /api/topologies/:id/deploy   # Deploy to K8s
DELETE   /api/topologies/:id/undeploy # Remove from K8s

# Templates
GET      /api/templates               # List templates
POST     /api/templates/:id/generate  # Generate topology

# Reports
GET      /api/reports/:id/json        # JSON report
GET      /api/reports/:id/html        # HTML download

# Chaos
POST     /api/chaos                   # Create condition
POST     /api/chaos/:id/activate      # Apply to cluster
POST     /api/chaos/:id/deactivate    # Remove from cluster
GET      /api/presets                 # List presets

# Metrics
GET      /api/topologies/:id/metrics/live|history|aggregated

# Apps
GET/POST /api/applications            # CRUD
GET      /api/registries              # Registry configs

# Tests
POST     /api/v1/topologies/:id/tests/app-to-app
```

## Chaos Mesh Notes
- NetworkChaos requires source and target nodes
- StressChaos, PodChaos, IOChaos, HTTPChaos apply to source node only
- Label required: `networksim.io/type=simulation`
- HTTPChaos requires Chaos Mesh sidecar injection

## Commands
```bash
# View all chaos resources
k3s kubectl get networkchaos,stresschaos,podchaos,iochaos,httpchaos -n networksim-sim

# Build
cargo build --release   # backend
npm run build           # frontend

# Test
cargo test              # backend
npm test                # frontend
```
