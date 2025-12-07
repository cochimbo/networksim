# NetworkSim - Stack Tecnológico

> Documento de decisiones tecnológicas para el proyecto NetworkSim.
> Fecha de decisión: 2025-12-07

---

## Resumen Ejecutivo

| Capa | Tecnología | Versión mínima |
|------|------------|----------------|
| Frontend | React + TypeScript | React 18+ |
| Visualización | Cytoscape.js | 3.x |
| Backend | Rust (Axum) | Rust 1.70+ |
| Base de datos | SQLite | 3.x |
| ORM/Query | sqlx | 0.7+ |
| Kubernetes Client | kube-rs | 0.87+ |
| Orquestador | K3s | 1.28+ |
| CNI | Calico | 3.26+ |
| Chaos Engineering | Chaos Mesh | 2.6+ |
| Despliegue apps | Helm | 3.x |
| Comunicación | REST + WebSocket | - |

---

## Testing

### Backend (Rust)

| Herramienta | Uso |
|-------------|-----|
| cargo test | Tests unitarios e integración |
| tokio-test | Testing async |
| mockall | Mocking de traits |
| testcontainers | Tests de integración con K3s/containers |
| criterion | Benchmarks |

**Estrategia de testing:**
- **Unit tests:** Lógica de negocio, transformaciones de datos
- **Integration tests:** API endpoints, base de datos
- **E2E tests:** Flujos completos con K3s real (en CI)

### Frontend (React)

| Herramienta | Uso |
|-------------|-----|
| Vitest | Tests unitarios |
| React Testing Library | Tests de componentes |
| Playwright / Cypress | Tests E2E |
| MSW (Mock Service Worker) | Mock de API |

### Cobertura objetivo
- Backend: > 80%
- Frontend: > 70%
- E2E: Flujos críticos cubiertos

---

## Observabilidad

### Logging

| Componente | Herramienta |
|------------|-------------|
| Backend | tracing + tracing-subscriber |
| Frontend | console + servicio de logging |
| K3s | logs nativos de Kubernetes |

**Niveles de log:**
- `ERROR`: Errores que requieren atención
- `WARN`: Situaciones anómalas pero recuperables
- `INFO`: Eventos importantes del flujo normal
- `DEBUG`: Información detallada para debugging
- `TRACE`: Información muy detallada (solo desarrollo)

### Métricas

| Herramienta | Uso |
|-------------|-----|
| Prometheus | Recolección de métricas |
| metrics-rs | Exposición de métricas desde Rust |
| kube-state-metrics | Métricas del cluster K3s |

**Métricas a exponer:**
- Requests HTTP (count, latency, status)
- WebSocket connections activas
- Operaciones de BD (count, latency)
- Estado de despliegues
- Condiciones de chaos activas
- Recursos K8s (pods, services)

### Trazas (opcional, para debugging avanzado)

| Herramienta | Uso |
|-------------|-----|
| OpenTelemetry | Trazas distribuidas |
| Jaeger | Visualización de trazas |

### Dashboard

| Herramienta | Uso |
|-------------|-----|
| Grafana | Visualización de métricas y logs |

**Stack de observabilidad recomendado:**
```
┌─────────────────────────────────────────────────────────────┐
│                      Grafana (Puerto 3001)                   │
│  - Dashboards de métricas                                   │
│  - Explorador de logs                                       │
│  - Alertas (opcional)                                       │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   Prometheus    │ │      Loki       │ │  Jaeger (opt)   │
│   (métricas)    │ │     (logs)      │ │    (trazas)     │
└─────────────────┘ └─────────────────┘ └─────────────────┘
              ▲               ▲               ▲
              └───────────────┼───────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│              Backend + K3s + Chaos Mesh                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Frontend

### Framework: React + TypeScript

**Justificación:**
- Ecosistema grande y maduro
- Amplio soporte de la comunidad
- TypeScript para type-safety

**Librerías principales:**
| Librería | Uso |
|----------|-----|
| Cytoscape.js | Visualización y edición de grafos de red |
| React Query / TanStack Query | Gestión de estado del servidor |
| Zustand o Jotai | Estado local ligero |
| Axios o fetch | Cliente HTTP |
| Socket.io-client o ws | WebSocket para tiempo real |

**Estructura propuesta:**
```
frontend/
├── src/
│   ├── components/       # Componentes React
│   ├── hooks/            # Custom hooks
│   ├── pages/            # Páginas/vistas
│   ├── services/         # API clients
│   ├── store/            # Estado global
│   ├── types/            # TypeScript types
│   └── utils/            # Utilidades
├── public/
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Backend

### Lenguaje: Rust

**Justificación:**
- Preferencia del desarrollador
- Alto rendimiento
- Seguridad de memoria
- Buen soporte para Kubernetes via kube-rs

### Framework HTTP: Axum

**Justificación:**
- Moderno, basado en Tower
- Buena ergonomía
- Soporte nativo para WebSocket
- Bien integrado con el ecosistema Tokio

**Librerías principales:**
| Crate | Uso |
|-------|-----|
| axum | Framework web |
| tokio | Runtime async |
| kube-rs | Cliente Kubernetes |
| sqlx | Acceso a SQLite (async, compile-time checked) |
| serde | Serialización JSON |
| tower | Middleware |
| tracing | Logging/observabilidad |
| tokio-tungstenite | WebSocket |

**Estructura propuesta:**
```
backend/
├── src/
│   ├── main.rs
│   ├── api/              # Handlers HTTP
│   │   ├── mod.rs
│   │   ├── topologies.rs
│   │   ├── nodes.rs
│   │   ├── chaos.rs
│   │   └── ws.rs
│   ├── models/           # Structs de dominio
│   ├── db/               # Acceso a datos (SQLite)
│   ├── k8s/              # Interacción con K3s
│   ├── chaos/            # Lógica de Chaos Mesh
│   └── error.rs          # Manejo de errores
├── migrations/           # Migraciones SQLite
├── Cargo.toml
└── config/
```

---

## Base de Datos

### SQLite

**Justificación:**
- Aplicación monousuario
- Sin necesidad de servidor de BD
- Fácil backup y portabilidad
- Suficiente para el volumen de datos esperado

**Esquema inicial:**
```sql
-- Topologías
CREATE TABLE topologies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    data JSON NOT NULL,  -- nodos, links, configuración
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Despliegues activos
CREATE TABLE deployments (
    id TEXT PRIMARY KEY,
    topology_id TEXT NOT NULL REFERENCES topologies(id),
    status TEXT NOT NULL,  -- pending, running, stopped, error
    k8s_resources JSON,    -- referencias a recursos K8s creados
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Condiciones adversas activas
CREATE TABLE chaos_conditions (
    id TEXT PRIMARY KEY,
    deployment_id TEXT NOT NULL REFERENCES deployments(id),
    target_type TEXT NOT NULL,  -- node, link
    target_id TEXT NOT NULL,
    condition_type TEXT NOT NULL,
    params JSON NOT NULL,
    active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Aplicaciones desplegadas
CREATE TABLE applications (
    id TEXT PRIMARY KEY,
    deployment_id TEXT NOT NULL REFERENCES deployments(id),
    node_id TEXT NOT NULL,
    chart_repo TEXT,
    chart_name TEXT NOT NULL,
    chart_version TEXT,
    values JSON,
    status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Infraestructura

### Orquestador: K3s

**Justificación:**
- Kubernetes ligero, ideal para single-node
- Fácil instalación
- Compatible con Helm y CNI estándar
- Menor consumo de recursos que K8s completo

**Configuración:**
- Single node (server + agent en la misma máquina)
- Puede correr en bare metal, VM (VMware, OpenStack), o contenedor

### CNI: Calico

**Justificación:**
- NetworkPolicy robusta
- Buen rendimiento
- Amplia documentación
- Permite aislamiento granular entre namespaces

### Chaos Engineering: Chaos Mesh

**Justificación:**
- Diseñado específicamente para Kubernetes
- Declarativo (CRDs)
- Soporta: latencia, pérdida de paquetes, corrupción, particiones
- Dashboard web incluido (opcional)
- Gestiona el ciclo de vida del chaos automáticamente

**Tipos de chaos soportados:**
| Tipo | CRD | Descripción |
|------|-----|-------------|
| Network delay | NetworkChaos | Añade latencia |
| Packet loss | NetworkChaos | Pérdida de paquetes |
| Bandwidth | NetworkChaos | Limita ancho de banda |
| Partition | NetworkChaos | Aísla nodos |
| DNS | DNSChaos | Fallos de DNS |
| Pod kill | PodChaos | Mata pods |

### Despliegue de aplicaciones: Helm 3

**Justificación:**
- Estándar de facto para desplegar apps en K8s
- Soporte para charts públicos y privados
- Gestión de releases y rollback

---

## Comunicación

### REST API
- Operaciones CRUD síncronas
- JSON como formato de intercambio

### WebSocket
- Eventos en tiempo real
- Actualizaciones de estado de nodos
- Métricas live
- Notificaciones de chaos aplicado

---

## Arquitectura de Aislamiento

```
K3s Cluster (Single Node)
│
├── namespace: networksim-system (PROTEGIDO)
│   ├── Chaos Mesh Controller
│   └── NetworkPolicy: bloquea tráfico desde networksim-sim
│
└── namespace: networksim-sim (ZONA DE CAOS)
    ├── Pods de simulación
    ├── Helm releases
    └── NetworkChaos resources aplicados aquí
```

**Network Policy para proteger el sistema:**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-from-simulation
  namespace: networksim-system
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchExpressions:
              - key: name
                operator: NotIn
                values:
                  - networksim-sim
```

---

## Requisitos del Sistema

### Mínimos
- CPU: 4 cores
- RAM: 8 GB
- Disco: 50 GB SSD
- OS: Linux (Ubuntu 22.04+, Rocky 9+, etc.)

### Recomendados (para 100 nodos)
- CPU: 8+ cores
- RAM: 16+ GB
- Disco: 100 GB SSD

### Software necesario
- Docker o containerd
- K3s
- Helm 3
- Rust toolchain (para desarrollo)
- Node.js 18+ (para desarrollo frontend)

---

## Diagrama de Dependencias

```
┌─────────────────────────────────────────────────────────────┐
│                        Usuario                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + Cytoscape.js)                            │
│  Puerto: 3000 (dev) / 80 (prod)                             │
└─────────────────────────────────────────────────────────────┘
                              │ HTTP/WS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend (Rust/Axum)                                        │
│  Puerto: 8080                                               │
│  ├── SQLite (archivo local)                                 │
│  └── kube-rs ──► K3s API Server (6443)                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  K3s Cluster                                                │
│  ├── Calico CNI                                             │
│  ├── Chaos Mesh                                             │
│  └── Helm releases                                          │
└─────────────────────────────────────────────────────────────┘
```
