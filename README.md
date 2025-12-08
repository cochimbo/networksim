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

### ⚡ Inicio Rápido (Recomendado)

```bash
# Iniciar todo con un comando
./start.sh

# Ver estado
./start.sh status

# Detener
./start.sh stop
```

**URLs:**
- 🌐 **Frontend**: http://localhost:3000
- 🔧 **Backend API**: http://localhost:8080
- 📊 **Health Check**: http://localhost:8080/health

### Prerrequisitos

- Docker y Docker Compose
- K3s (o k3d para desarrollo local)
- Rust 1.70+
- Node.js 18+
- Helm 3

### Desarrollo local (Manual)

```bash
# Backend (terminal 1)
cd backend
DATABASE_URL="sqlite://networksim.db?mode=rwc" cargo run
# → http://localhost:8080

# Frontend (terminal 2)
cd frontend
npm run dev
# → http://localhost:3000
```

**Nota:** El frontend tiene proxy configurado en `vite.config.ts`:
- `/api/*` → `http://localhost:8080`

### Logs

```bash
tail -f /tmp/networksim-backend.log   # Backend
tail -f /tmp/networksim-frontend.log  # Frontend
```

### 🐛 Troubleshooting

```bash
# Ver puertos ocupados
ss -tlnp | grep -E "3000|8080"

# Matar servicios
pkill -9 -f "networksim-backend"
pkill -9 -f "vite"

# Si frontend no carga, usar IPv4 explícito
curl -4 http://127.0.0.1:3000/
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
