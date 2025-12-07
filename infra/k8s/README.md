# NetworkSim Kubernetes Manifests

This directory contains Kubernetes manifests for deploying NetworkSim components.

## Structure

```
k8s/
├── namespaces.yaml       # Namespace definitions
├── network-policies.yaml # Network isolation policies
└── rbac.yaml             # RBAC for backend to manage pods
```

## Namespaces

- `networksim-system`: Protected namespace for control plane components
- `networksim-sim`: Simulation namespace where topology pods run (chaos zone)

## Applying

```bash
kubectl apply -f infra/k8s/
```
