# NetworkSim - Chaos Engineering Platform

Plataforma de ingeniería del caos con editor visual de topologías para Kubernetes.

## Servicios y Puertos

| Servicio | Puerto | URL |
|----------|--------|-----|
| Frontend (React) | 3000 | http://localhost:3000 |
| Backend API (Rust) | 8080 | http://localhost:8080 |
| Swagger UI | 8080 | http://localhost:8080/swagger-ui/ |
| Health Check | 8080 | http://localhost:8080/health |

## Requisitos

- Docker
- K3s o K3d (cluster Kubernetes)
- Chaos Mesh instalado en el cluster
- Calico CNI (para NetworkPolicy)
- Rust 1.70+
- Node.js 18+

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/cochimbo/networksim.git
cd networksim
```

### 2. Configurar el cluster (si no existe)

```bash
# Instalación automática (Docker, K3d, Calico, Chaos Mesh)
./scripts/setup.sh

# O solo cluster sin dependencias del sistema
./scripts/setup.sh --skip-deps
```

### 3. Compilar el backend

```bash
cd backend
cargo build --release
```

### 4. Instalar dependencias del frontend

```bash
cd frontend
npm install
```

## Ejecutar

### Opción 1: Script de inicio

```bash
./start.sh          # Iniciar todo
./start.sh restart  # Reiniciar
./start.sh stop     # Detener
./start.sh status   # Ver estado
```

### Opción 2: Manual

```bash
# Terminal 1 - Backend
cd backend
KUBECONFIG=/etc/rancher/k3s/k3s.yaml ./target/release/networksim-backend

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## Características

### Chaos Engineering

| Categoría | Tipo | CRD | Descripción |
|-----------|------|-----|-------------|
| Network | delay | NetworkChaos | Latencia en el tráfico |
| Network | loss | NetworkChaos | Pérdida de paquetes |
| Network | bandwidth | NetworkChaos | Limitar ancho de banda |
| Network | corrupt | NetworkChaos | Corrupción de paquetes |
| Network | duplicate | NetworkChaos | Duplicar paquetes |
| Network | partition | NetworkChaos | Partición de red |
| Stress | stress-cpu | StressChaos | Estrés de CPU en pods |
| Pod | pod-kill | PodChaos | Matar y reiniciar pods |
| I/O | io-delay | IOChaos | Latencia en disco |
| HTTP | http-abort | HTTPChaos | Abortar peticiones HTTP |

### Editor de Topologías

- Editor visual drag & drop (Cytoscape.js)
- Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
- Agrupación de nodos por colores
- Etiquetas en conexiones
- Copiar nodo, Snap to grid
- 6 plantillas predefinidas (Microservices, 3-Tier, Star, Ring, Mesh, Pipeline)

### Despliegue de Aplicaciones

- Desplegar cualquier imagen Docker
- Réplicas (1-10)
- Volúmenes (emptyDir, hostPath, configMap, secret)
- Health checks (HTTP, TCP)
- Límites de recursos (CPU/Memory)
- Variables de entorno personalizadas

### Monitorización

- Métricas en tiempo real (latencia, pérdida de paquetes)
- Temporizador de cuenta atrás para chaos
- Dashboard de impacto
- Timeline de eventos
- Exportar informes (JSON, HTML)

## Estructura del Proyecto

```
networksim/
├── backend/                 # API en Rust (Axum)
│   ├── src/
│   │   ├── api/             # Endpoints REST
│   │   ├── chaos/           # Integración Chaos Mesh
│   │   ├── k8s/             # Cliente Kubernetes
│   │   ├── db/              # Capa de base de datos
│   │   └── models/          # Modelos de datos
│   ├── migrations/          # Migraciones SQLite
│   └── Cargo.toml
├── frontend/                # UI en React + TypeScript
│   ├── src/
│   │   ├── pages/           # Vistas principales
│   │   ├── components/      # Componentes UI
│   │   └── services/        # Cliente API
│   ├── package.json
│   └── vite.config.ts
├── scripts/                 # Scripts de utilidad
│   ├── setup.sh             # Instalación del cluster
│   └── start.sh             # Iniciar servicios
└── docs/                    # Documentación adicional
```

## API Reference

### Topologías
```
GET    /api/topologies                    Lista paginada
POST   /api/topologies                    Crear topología
GET    /api/topologies/:id                Obtener topología
PUT    /api/topologies/:id                Actualizar
DELETE /api/topologies/:id                Eliminar
POST   /api/topologies/:id/deploy         Desplegar en K8s
DELETE /api/topologies/:id/undeploy       Eliminar de K8s
GET    /api/topologies/:id/status         Estado del despliegue
```

### Chaos
```
GET    /api/topologies/:id/chaos              Listar condiciones
POST   /api/topologies/:id/chaos              Crear condición
POST   /api/topologies/:id/chaos/:cid/start   Activar
POST   /api/topologies/:id/chaos/:cid/stop    Pausar
PUT    /api/topologies/:id/chaos/:cid         Actualizar
DELETE /api/topologies/:id/chaos/:cid         Eliminar
DELETE /api/topologies/:id/chaos              Eliminar todas
```

### Aplicaciones
```
GET    /api/topologies/:id/apps               Listar apps
POST   /api/topologies/:id/nodes/:nid/apps    Desplegar en nodo
GET    /api/topologies/:id/apps/:aid          Obtener app
PUT    /api/topologies/:id/apps/:aid          Actualizar
DELETE /api/topologies/:id/apps/:aid          Desinstalar
GET    /api/topologies/:id/apps/:aid/logs     Ver logs
```

### Métricas y Tests
```
GET    /api/topologies/:id/metrics/live       Métricas en vivo
POST   /api/topologies/:id/tests/app-to-app   Test de conectividad
GET    /api/topologies/:id/diagnostic         Diagnóstico de red
```

### Otros
```
GET    /api/templates                   Plantillas de topología
GET    /api/presets                     Presets de chaos
GET    /api/reports/:id/json            Exportar JSON
GET    /api/reports/:id/html            Exportar HTML
GET    /health                          Health check
GET    /api/cluster/status              Estado del cluster
```

## Comandos Útiles

```bash
# Ver pods desplegados
kubectl get pods -n networksim-sim

# Ver recursos de chaos
kubectl get networkchaos,stresschaos,podchaos,iochaos,httpchaos -n networksim-sim

# Ver network policies
kubectl get networkpolicies -n networksim-sim

# Ver logs del backend
tail -f /tmp/backend.log

# Limpiar recursos
kubectl delete namespace networksim-sim
```

## Stack Tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, Cytoscape.js |
| Backend | Rust, Axum, SQLx, kube-rs, utoipa (OpenAPI) |
| Base de datos | SQLite |
| Runtime | K3s / K3d |
| Chaos | Chaos Mesh |
| CNI | Calico |

## Solución de Problemas

```bash
# Ver puertos ocupados
ss -tlnp | grep -E "3000|8080"

# Matar procesos
pkill -f "networksim-backend"
pkill -f "vite"

# Reiniciar cluster
./scripts/setup.sh --uninstall
./scripts/setup.sh --skip-deps

# Verificar Chaos Mesh
kubectl get pods -n chaos-mesh
```

## Licencia

MIT
