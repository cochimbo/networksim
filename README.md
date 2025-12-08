# NetworkSim

Simulador de redes con capacidad de crear topologías personalizadas y aplicar condiciones adversas (latencia, pérdida de paquetes, cortes de conexión) sobre una infraestructura real basada en Kubernetes.

## 🎯 Características

- **Editor visual de topología** - Drag & drop para crear redes
- **Despliegue real** - Las topologías se despliegan como pods en K3s
- **NetworkPolicies reales** - Conectividad basada en el grafo (ICMP + TCP/UDP)
- **Chaos Engineering** - Inyección de latencia, pérdida de paquetes, particiones
- **Diagnóstico de red** - Script para verificar conectividad entre nodos
- **Tiempo real** - Visualización en vivo del estado de la red

## 📁 Estructura del Proyecto

```
networksim/
├── backend/           # API en Rust (Axum)
├── frontend/          # UI en React + TypeScript
├── infra/             # Manifiestos K8s, Helm charts
├── docs/              # Documentación
├── scripts/           # Scripts de desarrollo y setup
└── start.sh           # Script de inicio rápido
```

## 🚀 Instalación Completa (desde cero)

El script de setup instala todas las dependencias y configura el entorno completo:

```bash
# Instalación completa (Docker, k3d, Calico, Chaos Mesh, etc.)
./scripts/setup.sh

# Solo si ya tienes las dependencias del sistema
./scripts/setup.sh --skip-deps

# Solo si ya tienes el cluster
./scripts/setup.sh --skip-cluster

# Desinstalar (elimina el cluster)
./scripts/setup.sh --uninstall
```

El setup instala automáticamente:
- Docker
- kubectl
- k3d (K3s en Docker)
- Helm
- jq
- Rust
- Node.js
- Cluster K3d con Calico CNI
- Chaos Mesh

## ⚡ Quick Start (después del setup)

```bash
# Iniciar backend y frontend
./start.sh

# Reiniciar servicios
./start.sh restart

# Ver estado
./start.sh status

# Detener
./start.sh stop
```

**URLs:**
- 🌐 **Frontend**: http://localhost:3000
- 🔧 **Backend API**: http://localhost:8080
- 📊 **Health Check**: http://localhost:8080/health

## 🔬 Diagnóstico de Red

Verificar que la conectividad entre nodos coincide con el grafo:

```bash
./scripts/network-diagnostic.sh
```

Esto muestra:
- Conectividad esperada vs real
- Matriz de conexiones
- Latencia entre nodos
- Estadísticas de tráfico

## 🛠 Desarrollo Manual

### Backend

```bash
cd backend
DATABASE_URL="sqlite://networksim.db?mode=rwc" cargo run
# → http://localhost:8080
```

### Frontend

```bash
cd frontend
npm run dev
# → http://localhost:3000
```

### Logs

```bash
tail -f /tmp/networksim-backend.log   # Backend
tail -f /tmp/networksim-frontend.log  # Frontend
```

## 🔧 Comandos Útiles

```bash
# Ver pods desplegados
kubectl get pods -n networksim-sim

# Ver NetworkPolicies
kubectl get networkpolicies -n networksim-sim

# Ver logs de un pod
kubectl logs -n networksim-sim <pod-name>

# Verificar Calico
kubectl get pods -n calico-system

# Verificar Chaos Mesh
kubectl get pods -n chaos-mesh
```

## 🐛 Troubleshooting

```bash
# Ver puertos ocupados
ss -tlnp | grep -E "3000|8080"

# Matar servicios
pkill -9 -f "networksim-backend"
pkill -9 -f "vite"

# Reiniciar cluster desde cero
./scripts/setup.sh --uninstall
./scripts/setup.sh --skip-deps
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
| Orquestación | K3s + k3d |
| CNI | Calico (NetworkPolicy + ICMP) |
| Chaos | Chaos Mesh |
| Apps | Helm 3 |

## 📝 Licencia

MIT
