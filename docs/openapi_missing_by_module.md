# Rutas OpenAPI faltantes (por módulo)

Fecha: 2026-01-20

Este documento agrupa las rutas que la herramienta detectó como NO documentadas en el `openapi.json` actual. Útil para planificar anotaciones `#[utoipa::path]` por módulo.

## Resumen por módulo

### applications (src/api/applications.rs)
- POST /api/topologies/:topology_id/nodes/:node_id/apps

### deploy (src/api/deploy.rs)
- POST /api/topologies/:id/deploy
- DELETE /api/topologies/:id/deploy
- GET  /api/topologies/:id/status

### chaos (src/api/chaos.rs)
- GET  /api/topologies/:id/chaos
- DELETE /api/topologies/:id/chaos
- POST /api/topologies/:id/chaos/start
- POST /api/topologies/:id/chaos/stop
- POST /api/chaos

### topologies (src/api/topologies.rs)
- GET  /api/topologies
- POST /api/topologies
- GET  /api/topologies/:id
- PUT  /api/topologies/:id
- DELETE /api/topologies/:id
- POST /api/topologies/:id/duplicate

### events (src/api/events.rs)
- GET  /health
- GET  /api/cluster/status

### ws (src/api/ws.rs)
- /ws/events (WebSocket)

### metrics (src/api/metrics.rs)
- /metrics (Prometheus handler)

### presets (src/api/presets.rs)
- /api/presets
- /api/presets/:id

### registry (src/api/registry.rs)
- /api/registries
- /api/registries/default
- /api/registries/:id
- /api/registries/:id/test

### templates (src/api/templates.rs)
- /api/templates
- /api/templates/:template_id
- /api/templates/:template_id/generate

### volumes (src/api/volumes.rs)
- /api/volumes/pvc
- /api/volumes/pvc/:name
- /api/volumes/config
- /api/volumes/config/:name
- /api/volumes/config/:name/files

### reports (src/api/reports.rs)
- /api/topologies/:id/report
- /api/topologies/:id/report/html

### test_runner (src/api/test_runner.rs)
- /api/topologies/:id/tests
- /api/topologies/:topology_id/tests/:test_id
- /api/topologies/:topology_id/tests/:test_id/cancel

> Nota: Esta lista fue generada a partir de `backend/openapi_route_coverage.csv`. Algunas rutas aparecen duplicadas o como v1 aliases; priorizar por uso y complejidad.

## Siguiente pasos sugeridos

1. Revisar por módulo y añadir `#[utoipa::path]` mínimo para cada handler (método/path/params/respuestas básicas).
2. Añadir/ajustar `ToSchema` para request/response usados por cada endpoint.
3. Ejecutar `cargo check` y regenerar `openapi.json` con `gen_openapi`.
4. Abrir PR por módulos (por ejemplo: `api/topologies`, `api/applications`, `api/chaos`) para revisión incremental.
