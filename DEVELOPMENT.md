# Guía de Desarrollo

## Arquitectura

### Backend (Rust)

```
backend/src/
├── api/               # Endpoints REST (Axum handlers)
│   ├── chaos.rs           # CRUD + start/stop chaos
│   ├── topologies.rs      # CRUD topologías
│   ├── applications.rs    # Despliegue de apps
│   ├── deploy.rs          # Despliegue K8s
│   ├── live_metrics.rs    # Métricas en tiempo real
│   └── openapi.rs         # Esquemas Swagger
├── chaos/             # Integración Chaos Mesh
│   ├── types.rs           # ChaosType, ChaosCondition
│   ├── conditions.rs      # Builders de CRDs
│   └── client.rs          # Cliente K8s para chaos
├── k8s/               # Operaciones Kubernetes
│   ├── resources.rs       # Specs de Pod/Deployment
│   ├── client.rs          # Cliente API K8s
│   └── deployment.rs      # Despliegue de topologías
├── db/                # Capa de base de datos
│   └── mod.rs             # Queries SQLite
└── models/            # Modelos de datos
```

### Frontend (React)

```
frontend/src/
├── pages/
│   ├── TopologyEditor.tsx    # Editor principal (Cytoscape)
│   └── TopologyList.tsx      # Lista de topologías
├── components/
│   ├── ChaosPanel.tsx        # Gestión de chaos
│   ├── ApplicationsPanel.tsx # Despliegue de apps
│   ├── LiveMetrics.tsx       # Visualización de métricas
│   └── ...
└── services/
    └── api.ts                # Cliente API + tipos
```

## Tipos de Chaos

| Tipo | CRD | Requiere Target |
|------|-----|-----------------|
| delay, loss, bandwidth, corrupt, duplicate, partition | NetworkChaos | Sí |
| stress-cpu | StressChaos | No |
| pod-kill | PodChaos | No |
| io-delay | IOChaos | No |
| http-abort | HTTPChaos | No |

## Base de Datos

Tablas principales en SQLite:

- `topologies` - Definiciones de topología (datos JSON)
- `chaos_conditions` - Configuraciones de chaos activas
- `applications` - Apps desplegadas (con envvalues JSON)
- `chaos_presets` - Escenarios predefinidos
- `network_metrics` - Métricas recolectadas
- `events` - Log de eventos

## Patrones de API

```
Topologías: /api/topologies/:id
Chaos:      /api/topologies/:id/chaos/:cid
Apps:       /api/topologies/:id/apps/:aid
Nodos:      /api/topologies/:id/nodes/:nid/apps
```

## Detalles de Implementación

### Countdown Timer de Chaos
- Campo `started_at` se establece cuando el estado cambia a "active"
- Componente `ChaosCountdown` calcula el tiempo restante
- Se limpia cuando se pausa/detiene

### Volúmenes
- Parseados desde `app.values.volumes`
- Función `parse_volumes_from_app()` en resources.rs
- Tipos: emptyDir, hostPath, configMap, secret

### Variables de Entorno
- Almacenadas en columna `envvalues` como JSON
- Formatos aceptados: array, objeto, anidado
- Sanitizadas a mayúsculas con underscores

## Desarrollo Local

### Compilar Backend

```bash
cd backend
cargo build --release
```

### Ejecutar Frontend

```bash
cd frontend
npm install
npm run dev
```

### Ejecutar Tests

```bash
# Backend
cd backend
cargo test

# Frontend
cd frontend
npm test
```

## Comandos de Depuración

```bash
# Ver pods
kubectl get pods -n networksim-sim

# Ver recursos chaos
kubectl get networkchaos,stresschaos,podchaos -n networksim-sim

# Logs del backend
tail -f /tmp/backend.log

# Ejecutar comando en pod
kubectl exec -it <pod> -n networksim-sim -- sh
```

## Proceso de Release

El proyecto utiliza GitHub Actions para automatizar la construcción y publicación de imágenes Docker.

1.  **Crear un Tag:**
    Para lanzar una nueva versión, crea un tag que empiece por `v` (ej: `v1.0.0`).

    ```bash
    git tag v1.0.0
    git push origin v1.0.0
    ```

2.  **CI/CD Pipeline:**
    - El workflow `Release` se activará automáticamente.
    - Construirá las imágenes de Backend y Frontend.
    - Las subirá al GitHub Container Registry (GHCR).
    - Etiquetas generadas: `latest` y `v1.0.0`.

3.  **Despliegue:**
    Las imágenes pueden ser utilizadas directamente desde `ghcr.io/tu-usuario/networksim/backend` y `frontend`.

