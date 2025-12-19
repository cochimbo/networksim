# Pending Improvements

## Completed
- [x] Extended Chaos Types (StressChaos, PodChaos, IOChaos, HTTPChaos)
- [x] Chaos Presets (12 pre-configured scenarios)
- [x] Topology Templates (6 patterns: Microservices, 3-Tier, Star, Ring, Mesh, Pipeline)
- [x] Export Reports (JSON data + standalone HTML)

## Code Quality
- [ ] Replace remaining `any` types with proper interfaces
- [ ] Add error boundary components for main panels
- [ ] Increase test coverage for new chaos types

## Future Features

### Chaos Scenarios (Workflows)
Multi-step chaos workflows: apply delay → wait → apply loss → run test → cleanup

### Multi-Cluster Support
Manage multiple K8s clusters from single instance

### RBAC / Authentication
Role-based access control for team environments

### Metrics Comparison
Compare before/during/after chaos metrics side-by-side

## Known Issues
- HTTPChaos requires Chaos Mesh sidecar injection in target pods
- Some TypeScript `any` types remain in legacy components
