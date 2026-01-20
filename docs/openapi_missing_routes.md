<!--
Auto-generated ticket file listing endpoints currently missing OpenAPI annotations.
Create a GitHub/GitLab issue from this content or copy into your issue tracker.
-->
# [ISSUE] OpenAPI: Rutas faltantes por documentar

- **Fecha**: 2026-01-20
- **Branch**: feature/doc-openapi-and-tests
- **Resumen**: La generación automática de OpenAPI detectó múltiples rutas registradas en el router que no están incluidas en el `openapi.json` porque sus handlers carecen de `#[utoipa::path]` (o de esquemas asociados). Este ticket agrupa las rutas faltantes y propone pasos para documentarlas.
- **Prioridad**: High (impide que el spec refleje la API real)
- **Labels sugeridas**: documentation, openapi, backend, needs-triage

## Descripción

Se generó `backend/openapi_route_coverage.csv` que marca qué rutas del router están documentadas. Las siguientes rutas aparecen en tiempo de ejecución pero no están presentes en el `openapi.json` actual.

## Rutas faltantes (resumen único)

- /health
- /api/cluster/status
- /api/topologies
- /api/topologies/:id
- /api/topologies/:id/duplicate
- /api/topologies/:id/deploy
- /api/topologies/:id/status
- /api/topologies/:id/chaos
- /api/topologies/:id/chaos/stop
- /api/chaos
- /api/topologies/:topology_id/apps
- /api/topologies/:topology_id/apps/draft
- /api/topologies/:topology_id/apps/:app_id
- /api/topologies/:topology_id/nodes/:node_id/apps
- /ws/events
- /metrics
- /api/events
- /api/events/stats
- /api/presets
- /api/presets/:id
- /api/registries
- /api/registries/default
- /api/registries/:id
- /api/registries/:id/test
- /api/topologies/:id/tests
- /api/v1/topologies
- /api/v1/topologies/:id
- /api/v1/topologies/:id/deploy
- /api/v1/topologies/:id/status
- /api/v1/topologies/:id/chaos
- /api/v1/presets
- /api/v1/presets/:id
- /api/v1/cluster/status
- /api/templates
- /api/templates/:template_id
- /api/templates/:template_id/generate
- /api/volumes/pvc
- /api/volumes/pvc/:name
- /api/volumes/config
- /api/volumes/config/:name
- /api/volumes/config/:name/files
- /api/topologies/:id/report
- /api/topologies/:id/report/html

> Nota: Algunas rutas aparecen duplicadas en `openapi_route_coverage.csv` (v1 y non-v1). Recomendado revisar la lista completa en `backend/openapi_route_coverage.csv` para contextos específicos de handler/module.

## Recomendación de pasos

1. Revisar `backend/openapi_route_coverage.csv` y filtrar por `documented=False` para confirmar handlers exactos.
2. Para cada handler/module listado, añadir un `#[utoipa::path]` mínimo que describa método, path, parámetros y respuestas (puede ser provisional con `responses((status = 200, description = "OK"),))`).
3. Añadir o mejorar `ToSchema/#[schema(...)]` en los modelos usados por los endpoints (especialmente Topology y solicitudes de creación/actualización).
4. Ejecutar `cd backend && cargo check` después de cada cambio para detectar errores del derive macro.
5. Ejecutar `cd backend && cargo run --bin gen_openapi` para regenerar `openapi.json` y validar en Swagger UI.
6. Abrir PR con cambios incrementales (por módulo) y enlazar este ticket.

## Asignación sugerida
- Asignar a: @backend-owner (o dejar en backlog para triage)

## Artefactos
- `backend/openapi_route_coverage.csv` (mapa ruta -> documentada)
- `backend/openapi.json` (spec generado)

## Comandos útiles

```bash
# revisar rutas no documentadas
cd backend
python3 tools/generate_route_doc_map.py --filter undocumented

# compilar y regenerar spec
cargo check
cargo run --bin gen_openapi
```

---
Archivo generado automáticamente por la tarea de documentación OpenAPI.
