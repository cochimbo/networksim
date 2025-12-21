# Claude Context - NetworkSim

## Project Overview
Chaos engineering platform for Kubernetes with visual topology editor.

## Tech Stack
- **Backend**: Rust, Axum, SQLx (SQLite), kube-rs
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Cytoscape.js
- **Runtime**: K3s, Chaos Mesh, Calico CNI

## Key Directories
```
backend/src/
├── api/           # REST endpoints (Axum handlers)
│   ├── chaos.rs       # Chaos CRUD + start/stop
│   ├── topologies.rs  # Topology CRUD
│   ├── applications.rs# App deployment
│   ├── deploy.rs      # K8s deployment
│   ├── live_metrics.rs# Real-time metrics
│   └── openapi.rs     # Swagger schemas
├── chaos/         # Chaos Mesh integration
│   ├── types.rs       # ChaosType, ChaosCondition
│   ├── conditions.rs  # CRD builders
│   └── client.rs      # K8s chaos client
├── k8s/           # Kubernetes operations
│   ├── resources.rs   # Pod/Deployment specs
│   ├── client.rs      # K8s API client
│   └── deployment.rs  # Topology deployment
├── db/            # Database layer
│   └── mod.rs         # SQLite queries
└── models/        # Data models

frontend/src/
├── pages/
│   ├── TopologyEditor.tsx  # Main editor (Cytoscape)
│   └── TopologyList.tsx    # Topology list
├── components/
│   ├── ChaosPanel.tsx      # Chaos management
│   ├── ApplicationsPanel.tsx# App deployment
│   ├── LiveMetrics.tsx     # Metrics display
│   └── ...
└── services/
    └── api.ts              # API client + types
```

## Chaos Types
| Type | CRD | Requires Target |
|------|-----|-----------------|
| delay, loss, bandwidth, corrupt, duplicate, partition | NetworkChaos | Yes |
| stress-cpu | StressChaos | No |
| pod-kill | PodChaos | No |
| io-delay | IOChaos | No |
| http-abort | HTTPChaos | No |

## Database Tables
- `topologies` - Network topology definitions (JSON data)
- `chaos_conditions` - Active chaos configs (with started_at for countdown)
- `applications` - Deployed apps (with envvalues JSON)
- `chaos_presets` - Predefined chaos scenarios
- `network_metrics` - Collected metrics
- `events` - Event log

## API Patterns
- Topologies: `/api/topologies/:id`
- Chaos: `/api/topologies/:id/chaos/:cid`
- Apps: `/api/topologies/:id/apps/:aid`
- Nodes: `/api/topologies/:id/nodes/:nid/apps`

## Key Implementation Details

### Chaos Countdown Timer
- `started_at` field set when chaos status becomes "active"
- Frontend `ChaosCountdown` component calculates remaining time
- Cleared when paused/stopped

### Volume Mounts
- Parsed from `app.values.volumes` array
- `parse_volumes_from_app()` in resources.rs
- Types: emptyDir, hostPath, configMap, secret

### Environment Variables
- Stored in `envvalues` column as JSON
- Multiple formats accepted (array, object, nested)
- Sanitized to uppercase with underscores

## Running Services
```bash
# Backend (port 8080)
KUBECONFIG=/etc/rancher/k3s/k3s.yaml ./target/release/networksim-backend

# Frontend (port 3000)
cd frontend && npm run dev
```

## Common Operations
```bash
# Build backend
cargo build --release

# View pods
kubectl get pods -n networksim-sim

# View chaos
kubectl get networkchaos,stresschaos,podchaos -n networksim-sim

# Logs
tail -f /tmp/backend.log
```
