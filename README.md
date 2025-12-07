# NetworkSim

Simulador de redes con capacidad de crear topologías personalizadas y aplicar condiciones adversas (latencia, pérdida de paquetes, cortes de conexión) sobre una infraestructura real basada en Kubernetes.

## 🎯 Características

- **Editor visual de topología** - Drag & drop para crear redes
- **Despliegue real** - Las topologías se despliegan como pods en K3s
- **Chaos Engineering** - Inyección de latencia, pérdida de paquetes, particiones
- **Helm integration** - Despliega aplicaciones en los nodos
- **Escenarios programables** - Scripts para automatizar pruebas de red
- **Tiempo real** - Visualización en vivo del estado de la red

## 📁 Estructura del Proyecto

```
networksim/
├── backend/           # API en Rust (Axum)
├── frontend/          # UI en React + TypeScript
├── infra/             # Manifiestos K8s, Helm charts
├── docs/              # Documentación
├── scripts/           # Scripts de desarrollo
└── docker-compose.yml # Entorno de desarrollo
```

## 🚀 Quick Start

### Prerrequisitos

- Docker y Docker Compose
- K3s (o k3d para desarrollo local)
- Rust 1.70+
- Node.js 18+
- Helm 3

### Desarrollo local

```bash
# Clonar repositorio
git clone <repo-url>
cd networksim

# Levantar entorno de desarrollo
docker-compose up -d

# Backend
cd backend
cargo run

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev
```

### Con K3d (K3s en Docker)

```bash
# Crear cluster
k3d cluster create networksim

# Instalar Chaos Mesh
kubectl apply -f infra/chaos-mesh/

# Aplicar configuración inicial
kubectl apply -f infra/k8s/
```

## 📖 Documentación

- [Arquitectura](./ARCHITECTURE.md)
- [Stack Tecnológico](./docs/STACK.md)
- [Requisitos](./docs/REQUIREMENTS.md)
- [Plan de Implementación](./docs/IMPLEMENTATION_PLAN.md)

## 🛠 Stack Tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | React + TypeScript + Cytoscape.js |
| Backend | Rust + Axum + SQLite |
| Orquestación | K3s + Calico |
| Chaos | Chaos Mesh |
| Apps | Helm 3 |

## 📝 Licencia

MIT
