# NetworkSim - Chaos Engineering Platform

A network topology simulator with chaos engineering capabilities for Kubernetes.

## Features

### Chaos Engineering
| Category | Type | CRD | Description |
|----------|------|-----|-------------|
| Network | delay | NetworkChaos | Add latency to traffic |
| Network | loss | NetworkChaos | Simulate packet loss |
| Network | bandwidth | NetworkChaos | Limit bandwidth |
| Network | corrupt | NetworkChaos | Corrupt packets |
| Network | duplicate | NetworkChaos | Duplicate packets |
| Network | partition | NetworkChaos | Network partition |
| Stress | stress-cpu | StressChaos | CPU stress on pods |
| Pod | pod-kill | PodChaos | Kill and restart pods |
| I/O | io-delay | IOChaos | Disk I/O latency |
| HTTP | http-abort | HTTPChaos | Abort HTTP requests |

### Topology Editor
- Visual drag & drop with Cytoscape.js
- Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
- Node grouping with colors
- Connection labels
- Copy node, Snap to grid
- 6 topology templates (Microservices, 3-Tier, Star, Ring, Mesh, Pipeline)

### Application Deployment
- Deploy any Docker image
- Replicas (1-10)
- Volumes (emptyDir, hostPath, configMap, secret)
- Health checks (HTTP, TCP)
- Resource limits (CPU/Memory)
- Private registry support

### Monitoring
- Live metrics (latency, packet loss)
- Chaos countdown timer
- Impact dashboard
- Event timeline
- Export reports (JSON, HTML)

## Quick Start

```bash
# Install dependencies and cluster
./scripts/setup.sh

# Start services
./start.sh

# URLs
# Frontend: http://localhost:3000
# Backend:  http://localhost:8080
# Swagger:  http://localhost:8080/swagger-ui/
```

## Project Structure

```
networksim/
├── backend/           # Rust API (Axum, SQLx, kube-rs)
│   ├── src/api/       # REST endpoints
│   ├── src/chaos/     # Chaos Mesh integration
│   ├── src/k8s/       # Kubernetes client
│   └── migrations/    # SQLite migrations
├── frontend/          # React + TypeScript + Vite
│   ├── src/pages/     # Main views
│   ├── src/components/# UI components
│   └── src/services/  # API client
└── scripts/           # Setup utilities
```

## API Reference

### Topologies
```
GET    /api/topologies              List (paginated)
POST   /api/topologies              Create
GET    /api/topologies/:id          Get
PUT    /api/topologies/:id          Update
DELETE /api/topologies/:id          Delete
POST   /api/topologies/:id/deploy   Deploy to K8s
DELETE /api/topologies/:id/undeploy Remove from K8s
GET    /api/topologies/:id/status   Deployment status
```

### Chaos
```
GET    /api/topologies/:id/chaos              List conditions
POST   /api/topologies/:id/chaos              Create condition
POST   /api/topologies/:id/chaos/:cid/start   Start (activate)
POST   /api/topologies/:id/chaos/:cid/stop    Stop (pause)
PUT    /api/topologies/:id/chaos/:cid         Update
DELETE /api/topologies/:id/chaos/:cid         Delete
DELETE /api/topologies/:id/chaos              Delete all
```

### Applications
```
GET    /api/topologies/:id/apps           List apps
POST   /api/topologies/:id/nodes/:nid/apps Deploy to node
GET    /api/topologies/:id/apps/:aid      Get app
PUT    /api/topologies/:id/apps/:aid      Update app
DELETE /api/topologies/:id/apps/:aid      Uninstall
GET    /api/topologies/:id/apps/:aid/logs Logs
```

### Metrics & Tests
```
GET    /api/topologies/:id/metrics/live        Live metrics
POST   /api/topologies/:id/tests/app-to-app    Connectivity test
GET    /api/topologies/:id/diagnostic          Network diagnostic
```

### Other
```
GET    /api/templates              Topology templates
GET    /api/presets                Chaos presets
GET    /api/reports/:id/json       Export JSON report
GET    /api/reports/:id/html       Export HTML report
GET    /health                     Health check
GET    /api/cluster/status         Cluster status
```

## Requirements

- Docker
- K3s/K3d cluster
- Chaos Mesh
- Calico CNI
- Rust 1.70+
- Node.js 18+

## Useful Commands

```bash
# View pods
kubectl get pods -n networksim-sim

# View chaos resources
kubectl get networkchaos,stresschaos,podchaos -n networksim-sim

# View logs
tail -f /tmp/backend.log

# Restart services
./start.sh restart
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, Cytoscape.js |
| Backend | Rust, Axum, SQLx, kube-rs, utoipa |
| Database | SQLite |
| Runtime | K3s |
| Chaos | Chaos Mesh |
| CNI | Calico |

## License

MIT
