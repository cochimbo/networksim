# Plan de pruebas de la API - NetworkSim

## Objetivo
Documentar pruebas manuales y automatizadas para asegurar que todas las rutas HTTP y comportamientos esenciales están cubiertos por tests, validación de esquemas y casos de error.

## Alcance
Todas las rutas expuestas en el backend (v0 y aliases v1), incluyendo endpoints de Topologies, Deploy, Chaos, Presets, Applications, Diagnostic, Metrics, Events, Presets, Registry, Templates, Volumes, Reports, Scenarios y Test Runner.

## Prioridades
- Nivel 1 (Smoke): rutas críticas (health, topologies CRUD, deploy, chaos create/stop, presets list/apply).
- Nivel 2 (Funcionales): endpoints de aplicaciones, registros, templates, scenarios, reports.
- Nivel 3 (Edge/NoReg): ws y Prometheus, upload file, test-runner flows.

## Tipos de prueba
- Smoke tests: p. ej. verificar que `GET /health` responde 200.
- Tests funcionales (integ.): CRUD, validación de payloads, rutas protegidas, side-effects (DB, K8s mocks).
- Contract/schema validation: validar respuestas contra el OpenAPI generado (openapi.json).
- Error cases: 404, 400, 500, permisos.
- Performance: endpoints de metrics y listados pesados.
- Concurrencia: aplicar chaos/start/stop en paralelo.

## Casos de prueba (ejemplos seleccionados)
- Health
  - GET /health -> 200
- Topologies
  - POST /api/topologies (payload válido) -> 201 y body con `id`
  - GET /api/topologies -> 200 y lista
  - GET /api/topologies/:id -> 200 / 404
  - PUT /api/topologies/:id -> 200 y cambios aplicados
  - DELETE /api/topologies/:id -> 204
  - POST /api/topologies/:id/duplicate -> 201 y nuevo id
- Deploy
  - POST /api/topologies/:id/deploy -> 202/200 (según impl)
  - GET /api/deployments/active -> 200
- Chaos
  - POST /api/chaos (create) -> 201
  - POST /api/topologies/:id/chaos/start -> 202
  - POST /api/topologies/:id/chaos/stop -> 200
  - PUT /api/topologies/:id/chaos/:condition_id -> 200
- Presets
  - GET /api/presets -> 200
  - POST /api/topologies/:topology_id/presets/:preset_id/apply -> 200
- Applications
  - POST /api/topologies/:topology_id/apps -> 201
  - POST /api/topologies/:topology_id/apps/draft -> 201
  - GET/PUT/DELETE flows para app
- Registry
  - CRUD + POST /api/registries/:id/test -> 200
- Scenarios
  - CRUD + POST /api/scenarios/:id/run -> 200
- Templates / Volumes / Reports / Test Runner: casos CRUD y flujos específicos (ver secciones anteriores)

## Validación del contrato OpenAPI
1. Generar `openapi.json` desde el servidor (Swagger UI ya expone `/api-docs/openapi.json`).
2. Usar un validador (p. ej. `dredd`, `schemathesis` o `openapi-cli`) para ejecutar tests basados en spec.

## Automatización propuesta
- Crear tests de integración en `tests/` (Rust) que arranquen la app en modo test con DB en memoria y mocks para K8s.
- Añadir un conjunto de tests Postman / HTTP collection para validación rápida.
- Ejecutar validación de contrato contra `openapi.json` en CI.

## Entregables de esta tarea
- Añadir referencias faltantes en `backend/src/api/openapi.rs` (ya aplicado en esta rama).
- Añadir este documento `docs/API_TEST_PLAN.md`.

## Siguientes pasos sugeridos
- ¿Quieres que implemente un test de ejemplo en `tests/` (Rust) que valide `POST /api/topologies` y `GET /api/topologies` utilizando DB en memoria? Si quieres, lo añado en esta rama.

---
