# NetworkSim - Plan de Implementación

> Plan detallado de implementación por fases, desde el esqueleto hasta la versión final.
> Cada fase es incremental y produce un entregable funcional.

---

## Resumen de Fases

| Fase | Nombre | Duración estimada | Entregable |
|------|--------|-------------------|------------|
| 0 | Setup del proyecto | 1-2 días | Estructura, CI/CD, entorno dev |
| 1 | Esqueleto y API básica | 1 semana | Backend funcionando, BD, API mínima |
| 2 | Frontend básico | 1 semana | UI con editor de topología |
| 3 | Integración K3s | 1-2 semanas | Despliegue real de topologías |
| 4 | Chaos Engineering | 1 semana | Inyección de condiciones adversas |
| 5 | Tiempo real y WebSocket | 1 semana | Actualizaciones live |
| 6 | Helm y aplicaciones | 1 semana | Despliegue de apps en nodos |
| 7 | Escenarios y scripting | 2 semanas | Editor y ejecución de escenarios |
| 8 | Métricas y observabilidad | 1 semana | Dashboards, logs, métricas |
| 9 | Pulido y estabilización | 1-2 semanas | Tests E2E, docs, bugs |

**Total estimado:** 10-14 semanas

---

## Fase 0: Setup del Proyecto

### Objetivo
Establecer la estructura del proyecto, herramientas de desarrollo y pipeline de CI/CD.

### Tareas

#### 0.1 Estructura de repositorio
- [x] Crear estructura de monorepo
  ```
  networksim/
  ├── backend/           # Rust/Axum
  ├── frontend/          # React/TypeScript
  ├── infra/             # Manifiestos K8s, scripts
  ├── docs/              # Documentación
  ├── scripts/           # Scripts de desarrollo
  ├── .github/           # CI/CD workflows
  └── docker-compose.yml # Entorno de desarrollo
  ```
- [x] Inicializar proyecto Rust (cargo new)
- [x] Inicializar proyecto React (vite + typescript)
- [x] Configurar .gitignore

#### 0.2 Entorno de desarrollo
- [x] Crear docker-compose.yml para desarrollo local
- [x] Script de instalación de dependencias
- [x] Configurar K3s local (k3d o similar)
- [x] Instalar Chaos Mesh en cluster de desarrollo
- [x] Documentar setup en README.md

#### 0.3 CI/CD
- [x] GitHub Actions: build backend
- [x] GitHub Actions: build frontend
- [x] GitHub Actions: tests unitarios
- [x] GitHub Actions: linting (clippy, eslint)
- [x] GitHub Actions: formato (rustfmt, prettier)

#### 0.4 Herramientas de calidad
- [x] Configurar clippy (Rust linter)
- [x] Configurar rustfmt
- [x] Configurar eslint + prettier (frontend)
- [x] Pre-commit hooks

### Criterios de aceptación
- [x] `cargo build` compila sin errores
- [x] `npm run build` compila sin errores
- [x] CI pasa en verde
- [x] K3s local funcionando con Chaos Mesh

### Tests
- [x] Smoke test: backend arranca
- [x] Smoke test: frontend arranca

---

## Fase 1: Esqueleto y API Básica

### Objetivo
Backend funcional con API REST básica, base de datos y estructura de código sólida.

### Tareas

#### 1.1 Estructura del backend
- [x] Configurar Axum con estructura modular
- [x] Configurar tracing para logging
- [x] Crear módulo de configuración (config.rs)
- [x] Crear módulo de errores (error.rs)
- [x] Health check endpoint: `GET /health`

#### 1.2 Base de datos
- [x] Configurar SQLite con sqlx
- [x] Crear migraciones iniciales
- [x] Módulo de conexión a BD
- [x] Pool de conexiones

#### 1.3 API de Topologías (CRUD)
- [x] `POST /api/topologies` - Crear topología
- [x] `GET /api/topologies` - Listar topologías
- [x] `GET /api/topologies/:id` - Obtener topología
- [x] `PUT /api/topologies/:id` - Actualizar topología
- [x] `DELETE /api/topologies/:id` - Eliminar topología

#### 1.4 Modelos de dominio
- [x] Struct Topology (con nodos y enlaces)
- [x] Struct Node
- [x] Struct Link
- [x] Validaciones básicas

#### 1.5 Tests
- [x] Tests unitarios de modelos
- [x] Tests de integración de API
- [x] Tests de BD (migraciones, CRUD)

### Criterios de aceptación
- [x] API responde correctamente a todas las operaciones CRUD
- [x] Datos persisten en SQLite
- [x] Logs estructurados funcionando
- [x] Tests pasan (12 tests: 6 unitarios + 6 integración)

### Tests
- [x] Unit: Validación de topología
- [x] Unit: Serialización/deserialización JSON
- [x] Integration: CRUD completo via HTTP
- [x] Integration: Persistencia en BD

---

## Fase 2: Frontend Básico

### Objetivo
Interfaz de usuario funcional con editor visual de topologías.

### Tareas

#### 2.1 Estructura del frontend
- [x] Configurar Vite + React + TypeScript
- [x] Configurar TanStack Query para API calls
- [x] Configurar Zustand para estado local
- [x] Estructura de carpetas

#### 2.2 Layout y navegación
- [x] Layout principal (header, sidebar, main)
- [x] Página de lista de topologías
- [x] Página de editor de topología
- [x] Navegación básica

#### 2.3 Editor de topología con Cytoscape.js
- [x] Integrar Cytoscape.js
- [x] Canvas de edición
- [x] Añadir nodos (click en canvas)
- [x] Eliminar nodos
- [x] Crear enlaces entre nodos
- [x] Eliminar enlaces
- [x] Mover nodos
- [x] Zoom y pan

#### 2.4 Panel de propiedades
- [x] Panel lateral para propiedades
- [x] Editar propiedades de nodo seleccionado
- [x] Editar propiedades de enlace seleccionado
- [x] Nombre y descripción de topología

#### 2.5 Conexión con API
- [x] Cliente HTTP (axios)
- [x] Hooks para CRUD de topologías
- [x] Guardar topología
- [x] Cargar topología
- [x] Lista de topologías

#### 2.6 Tests
- [x] Tests de componentes (React Testing Library)
- [x] Tests de hooks
- [ ] Mock de API con MSW

### Criterios de aceptación
- [x] Usuario puede crear topología visual
- [x] Usuario puede añadir/eliminar nodos y enlaces
- [x] Usuario puede guardar y cargar topologías
- [x] UI es responsive y fluida

### Tests
- [x] Component: TopologyEditor renderiza correctamente
- [x] Component: Panel de propiedades funciona
- [x] Integration: Guardar y cargar topología
- [ ] E2E: Flujo completo de creación de topología

---

## Fase 3: Integración K3s

### Objetivo
Desplegar topologías como pods reales en K3s.

### Tareas

#### 3.1 Cliente Kubernetes
- [x] Configurar kube-rs
- [x] Autenticación con cluster (kubeconfig)
- [x] Módulo k8s/ para operaciones

#### 3.2 Namespace y aislamiento
- [x] Crear namespace `networksim-system`
- [x] Crear namespace `networksim-sim`
- [x] NetworkPolicy de aislamiento
- [x] Labels para identificar recursos

#### 3.3 Despliegue de topología
- [x] `POST /api/topologies/:id/deploy`
  - [x] Crear pods para cada nodo
  - [x] Configurar networking entre pods
  - [x] Esperar a que pods estén ready
- [x] `DELETE /api/topologies/:id/deploy`
  - [x] Eliminar todos los recursos
  - [x] Limpiar estado
- [x] `GET /api/topologies/:id/status`
  - [x] Estado de cada pod
  - [x] Estado general del despliegue

#### 3.4 Modelo de despliegue
- [x] Tracking de recursos K8s creados
- [x] Estados: pending, running, stopped, error

#### 3.5 Imagen base de nodo
- [x] Usar alpine:3.18 como imagen por defecto
- [ ] Crear Dockerfile para nodo de simulación con herramientas de red (opcional)
- [ ] Publicar en registry (opcional)

#### 3.6 Tests
- [x] Tests unitarios de recursos K8s
- [x] Tests de creación/eliminación de pods (manual)
- [x] Tests de NetworkPolicy

### Criterios de aceptación
- [x] Desplegar topología crea pods en K3s
- [x] Nodos pueden comunicarse entre sí según enlaces (via services)
- [x] Destruir despliegue limpia todos los recursos
- [x] Estado del despliegue se refleja en API

### Tests
- [x] Unit: create_pod_spec, create_service, create_network_policy
- [x] Integration: Desplegar topología simple (2 nodos)
- [x] Integration: Destruir despliegue

---

## Fase 4: Chaos Engineering

### Objetivo
Inyectar condiciones adversas usando Chaos Mesh.

### Tareas

#### 4.1 Integración Chaos Mesh
- [x] Cliente para CRDs de Chaos Mesh
- [x] Módulo chaos/ para operaciones

#### 4.2 API de Chaos
- [x] `POST /api/chaos` - Crear condición adversa
- [x] `GET /api/topologies/:id/chaos` - Listar condiciones activas
- [x] `DELETE /api/topologies/:id/chaos/:condition_id` - Eliminar condición

#### 4.3 Tipos de condiciones
- [x] Latencia (NetworkChaos delay)
- [x] Pérdida de paquetes (NetworkChaos loss)
- [x] Limitación de ancho de banda (NetworkChaos bandwidth)
- [x] Corrupción de paquetes (NetworkChaos corrupt)
- [x] Partición de red (NetworkChaos partition) - Implementado como 100% loss

#### 4.4 Modelo de datos
- [x] Tipos en chaos/types.rs
- [x] Tracking de recursos NetworkChaos creados
- [x] Asociación con deployment activo (via labels)

#### 4.5 UI de Chaos
- [x] Panel de condiciones adversas (ChaosPanel.tsx)
- [x] Formulario para crear condición
- [x] Lista de condiciones activas
- [x] Botón para eliminar condición
- [x] Indicadores visuales (iconos, colores por tipo)

#### 4.6 Tests
- [x] Tests de creación de NetworkChaos
- [ ] Tests de aplicación real de latencia
- [ ] Tests de eliminación de condiciones

### Criterios de aceptación
- [x] Usuario puede aplicar latencia a un nodo
- [x] Usuario puede aplicar pérdida de paquetes
- [x] Condiciones se reflejan visualmente en UI
- [x] Eliminar condición restaura comportamiento normal

### Tests
- [ ] Integration: Aplicar latencia y verificar con ping
- [ ] Integration: Aplicar pérdida y verificar con iperf
- [ ] Integration: Partición bloquea comunicación
- [ ] E2E: Flujo completo de chaos desde UI

---

## Fase 5: Tiempo Real y WebSocket

### Objetivo
Actualizaciones en tiempo real de estado y eventos.

### Tareas

#### 5.1 WebSocket en backend
- [x] Endpoint WS `/ws/events`
- [x] Gestión de conexiones (tokio broadcast channel)
- [x] Broadcast de eventos

#### 5.2 Tipos de eventos
- [x] deployment:status - Cambio de estado de despliegue
- [x] node:status - Cambio de estado de nodo
- [x] chaos:applied - Condición aplicada
- [x] chaos:removed - Condición eliminada
- [x] topology:created/updated/deleted - Eventos de topología
- [ ] metrics:update - Actualización de métricas (Fase 8)

#### 5.3 Watch de Kubernetes
- [x] Watch de pods (estado, eventos) - k8s/watcher.rs
- [x] Watch de NetworkChaos
- [x] Transformar eventos K8s a eventos WS

#### 5.4 Frontend WebSocket
- [x] Cliente WebSocket (WebSocketContext singleton)
- [x] Reconexión automática (max 10 intentos)
- [x] Actualizar estado global con eventos
- [x] Actualizar visualización del grafo (colores de nodos por estado)
- [x] ConnectionStatus component (indicador Live/Offline)

#### 5.5 UI de despliegue
- [x] Indicador de estado del cluster K8s en header
- [x] Botón Deploy/Stop en toolbar del editor
- [x] Modal de progreso durante deploy/stop (DeploymentModal)
- [x] Bloqueo de edición cuando topología desplegada
- [x] Botón Chaos solo habilitado cuando hay despliegue activo

#### 5.6 Tests
- [ ] Tests de conexión WS
- [ ] Tests de broadcast
- [ ] Tests de reconexión

### Criterios de aceptación
- [x] Cambios de estado se reflejan instantáneamente en UI
- [x] No es necesario recargar para ver actualizaciones
- [x] Reconexión automática si se pierde conexión
- [x] UI muestra estado del cluster y del despliegue

### Tests
- [ ] Integration: Evento de pod ready llega a UI
- [ ] Integration: Evento de chaos llega a UI
- [ ] E2E: Desplegar y ver estado actualizado sin refresh

---

## Fase 6: Helm y Aplicaciones

### Objetivo
Desplegar aplicaciones (Helm charts) en nodos de la topología.

### Tareas

#### 6.1 Integración Helm
- [ ] Cliente Helm (helm-rs o CLI)
- [ ] Gestión de repositorios
- [ ] Instalación de charts

#### 6.2 API de Aplicaciones
- [ ] `POST /api/nodes/:id/app` - Desplegar app
- [ ] `GET /api/nodes/:id/apps` - Listar apps en nodo
- [ ] `DELETE /api/apps/:id` - Eliminar app
- [ ] `GET /api/apps/:id/logs` - Ver logs

#### 6.3 Modelo de datos
- [ ] Tabla applications en BD
- [ ] Tracking de releases Helm
- [ ] Estados: pending, deployed, failed

#### 6.4 UI de Aplicaciones
- [ ] Panel de apps en nodo seleccionado
- [ ] Formulario para desplegar chart
- [ ] Lista de apps desplegadas
- [ ] Visor de logs

#### 6.5 Tests
- [ ] Tests de instalación de chart
- [ ] Tests de eliminación de release

### Criterios de aceptación
- [ ] Usuario puede desplegar un chart Helm en un nodo
- [ ] Usuario puede ver apps desplegadas
- [ ] Usuario puede eliminar apps
- [ ] Usuario puede ver logs básicos

### Tests
- [ ] Integration: Desplegar nginx chart
- [ ] Integration: Ver logs del pod
- [ ] Integration: Eliminar release

---

## Fase 7: Escenarios y Scripting

### Objetivo
Editor y ejecución de escenarios programados.

### Tareas

#### 7.1 Modelo de Escenario
- [ ] Tabla scenarios en BD
- [ ] Estructura de eventos (JSON/YAML)
- [ ] Validación de escenarios

#### 7.2 API de Escenarios
- [ ] CRUD de escenarios
- [ ] `POST /api/scenarios/:id/execute` - Ejecutar
- [ ] `DELETE /api/scenarios/:id/execute` - Detener
- [ ] `GET /api/scenarios/:id/status` - Estado de ejecución

#### 7.3 Motor de ejecución
- [ ] Parser de eventos
- [ ] Scheduler de eventos (por tiempo)
- [ ] Ejecutor de acciones
- [ ] Log de ejecución
- [ ] Estado de ejecución en tiempo real

#### 7.4 Tipos de eventos
- [ ] chaos:apply / chaos:remove
- [ ] link:modify
- [ ] node:disconnect / node:reconnect
- [ ] node:add / node:remove (si topología desplegada)
- [ ] app:deploy / app:remove
- [ ] wait (pausa temporal)
- [ ] wait_condition (esperar estado)
- [ ] log (mensaje)

#### 7.5 UI Editor de Escenarios
- [ ] Vista de lista de escenarios
- [ ] Editor visual (timeline)
- [ ] Añadir/editar/eliminar eventos
- [ ] Editor de código (YAML)
- [ ] Sincronización visual ↔ código

#### 7.6 UI Ejecución
- [ ] Botón ejecutar/detener
- [ ] Indicador de progreso
- [ ] Evento actual destacado
- [ ] Log de eventos ejecutados

#### 7.7 Tests
- [ ] Tests de parser de escenarios
- [ ] Tests de ejecución de eventos individuales
- [ ] Tests de ejecución completa

### Criterios de aceptación
- [ ] Usuario puede crear escenario con eventos
- [ ] Usuario puede ejecutar escenario en tiempo real
- [ ] Eventos se ejecutan en el tiempo correcto
- [ ] Usuario puede detener ejecución
- [ ] Log muestra progreso

### Tests
- [ ] Unit: Parser de YAML
- [ ] Unit: Validación de escenario
- [ ] Integration: Ejecutar escenario simple
- [ ] E2E: Crear y ejecutar escenario desde UI

---

## Fase 8: Métricas y Observabilidad

### Objetivo
Sistema completo de métricas, logs y dashboards.

### Tareas

#### 8.1 Métricas del backend
- [ ] Integrar metrics-rs
- [ ] Endpoint `/metrics` (Prometheus format)
- [ ] Métricas de requests HTTP
- [ ] Métricas de WebSocket
- [ ] Métricas de operaciones K8s
- [ ] Métricas de BD

#### 8.2 Métricas de red (nodos)
- [ ] Recolectar métricas de pods
- [ ] Latencia real entre nodos
- [ ] Paquetes tx/rx
- [ ] Ancho de banda usado

#### 8.3 Stack de observabilidad
- [ ] Configurar Prometheus
- [ ] Configurar Loki para logs
- [ ] Configurar Grafana
- [ ] Dashboards predefinidos

#### 8.4 API de métricas
- [ ] `GET /api/metrics` - Métricas agregadas
- [ ] `GET /api/nodes/:id/metrics` - Métricas de nodo
- [ ] Métricas en eventos WebSocket

#### 8.5 UI de métricas
- [ ] Panel de métricas en UI
- [ ] Gráficos básicos (latencia, throughput)
- [ ] Link a Grafana para dashboards completos

#### 8.6 Tests
- [ ] Tests de exposición de métricas
- [ ] Tests de formato Prometheus

### Criterios de aceptación
- [ ] Métricas expuestas en formato Prometheus
- [ ] Grafana muestra dashboards
- [ ] Usuario puede ver métricas básicas en UI
- [ ] Logs centralizados en Loki

### Tests
- [ ] Integration: Prometheus scrape métricas
- [ ] Integration: Logs aparecen en Loki
- [ ] E2E: Dashboard de Grafana funciona

---

## Fase 9: Pulido y Estabilización

### Objetivo
Versión estable, documentada y lista para uso.

### Tareas

#### 9.1 Tests E2E completos
- [ ] Flujo: Crear topología → Desplegar → Chaos → Destruir
- [ ] Flujo: Crear escenario → Ejecutar → Ver resultados
- [ ] Flujo: Desplegar apps con Helm
- [ ] Tests de recuperación de errores

#### 9.2 Manejo de errores
- [ ] Revisión de todos los puntos de fallo
- [ ] Mensajes de error claros
- [ ] Recuperación graceful
- [ ] Timeouts apropiados

#### 9.3 Performance
- [ ] Optimizar queries de BD
- [ ] Optimizar rendering de grafo (100 nodos)
- [ ] Profiling de memoria
- [ ] Benchmarks

#### 9.4 UX
- [ ] Revisión de flujos de usuario
- [ ] Feedback visual en operaciones
- [ ] Loading states
- [ ] Empty states

#### 9.5 Documentación
- [ ] README completo
- [ ] Guía de instalación
- [ ] Guía de uso
- [ ] API documentation
- [ ] Ejemplos de escenarios

#### 9.6 Seguridad
- [ ] Revisión de inputs
- [ ] Validación de YAML/JSON
- [ ] Rate limiting (opcional)

#### 9.7 Despliegue
- [ ] Dockerfile de producción (backend)
- [ ] Build de producción (frontend)
- [ ] Manifiestos K8s para desplegar NetworkSim
- [ ] Helm chart de NetworkSim (opcional)

### Criterios de aceptación
- [ ] Tests E2E pasan consistentemente
- [ ] No hay errores críticos conocidos
- [ ] Documentación completa
- [ ] Performance aceptable con 100 nodos

### Tests
- [ ] E2E: Suite completa
- [ ] Load: 100 nodos simultáneos
- [ ] Chaos: Recuperación de errores

---

## Matriz de Requisitos vs Fases

| Requisito | F0 | F1 | F2 | F3 | F4 | F5 | F6 | F7 | F8 | F9 |
|-----------|----|----|----|----|----|----|----|----|----|----|
| RF-01 (Topologías) | | ✓ | ✓ | | | | | | | |
| RF-02 (Nodos) | | ✓ | ✓ | ✓ | | | | | | |
| RF-03 (Enlaces) | | ✓ | ✓ | ✓ | | | | | | |
| RF-04 (Despliegue) | | | | ✓ | | ✓ | | | | |
| RF-05 (Helm) | | | | | | | ✓ | | | |
| RF-06 (Chaos) | | | | | ✓ | ✓ | | | | |
| RF-07 (Tiempo real) | | | | | | ✓ | | | | |
| RF-08 (Métricas) | | | | | | | | | ✓ | |
| RF-09 (Persistencia) | | ✓ | | | | | | | | |
| RF-10 (Escenarios) | | | | | | | | ✓ | | |

---

## Dependencias entre Fases

```
Fase 0 (Setup)
    │
    ▼
Fase 1 (Backend) ─────────────────┐
    │                             │
    ▼                             ▼
Fase 2 (Frontend) ◄─────── Fase 3 (K3s)
    │                             │
    └──────────┬──────────────────┘
               ▼
         Fase 4 (Chaos)
               │
               ▼
         Fase 5 (WebSocket)
               │
               ▼
         Fase 6 (Helm)
               │
               ▼
         Fase 7 (Escenarios)
               │
               ▼
         Fase 8 (Observabilidad)
               │
               ▼
         Fase 9 (Pulido)
```

---

## Riesgos y Mitigaciones

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|--------------|------------|
| Complejidad de kube-rs | Alto | Media | Empezar con operaciones simples, documentar bien |
| Chaos Mesh no funciona como esperado | Alto | Baja | Tener fallback a tc/iptables directo |
| Performance con 100 nodos | Medio | Media | Probar temprano, optimizar Cytoscape |
| Sincronización estado K8s/BD | Medio | Media | Usar watches de K8s, reconciliación periódica |
| Complejidad del editor de escenarios | Medio | Alta | MVP simple primero, iterar |

---

## Próximos Pasos

1. **Revisar este plan** - ¿Falta algo? ¿Prioridades correctas?
2. **Crear issues/tareas** - Convertir tareas en issues de GitHub
3. **Empezar Fase 0** - Setup del proyecto
