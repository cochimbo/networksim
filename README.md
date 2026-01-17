# NetworkSim - Chaos Engineering Platform

Plataforma de ingeniería del caos con editor visual de topologías para Kubernetes.

## Servicios y Puertos

| Servicio | Puerto | URL |
|----------|--------|-----|
| Frontend (React) | 80/443 | https://localhost |
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
git clone https://github.com/tu-usuario/networksim.git
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

### Opción 3: Producción (Docker Compose)

Para ejecutar la versión optimizada para producción (contenedores Docker):

```bash
./scripts/start-prod.sh
```

Esto levantará:
- Backend (Rust) en contenedor optimizado
- Frontend (React) servido por Nginx
- Nginx como Reverse Proxy en puerto 3000

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
│   ├── start.sh             # Iniciar servicios
│   ├── check-pods.sh        # Verificar estado de pods
│   └── ... (ver sección Scripts)
└── docs/                    # Documentación adicional
```

## Scripts de Utilidad

La carpeta `scripts/` contiene varias herramientas para facilitar el desarrollo y operación:

- **Cluster & Entorno**:
  - `setup.sh`: Instala dependencias y levanta el cluster K3d con Chaos Mesh.
  - `start.sh`: Inicia el backend y frontend en modo desarrollo.
  - `start-prod.sh`: Inicia la versión de producción con Docker Compose.
  - `setup-registry.sh`: Configura el registry local de Docker.
  - `generate-certs.sh`: Genera certificados SSL autofirmados para desarrollo.

- **Verificación y Test**:
  - `check-pods.sh`: Comprueba que todos los pods del sistema estén running.
  - `smoke-test.sh`: Ejecuta un test básico de funcionalidad end-to-end.
  - `chaos-validation.sh`: Valida instalación y CRDs de Chaos Mesh.
  - `network-diagnostic.sh`: Herramienta para diagnosticar problemas de red en el cluster.

## API Reference

La documentación completa de la API está disponible en Swagger UI:
➡️ **http://localhost:8080/swagger-ui/**

Ahí encontrarás la especificación detallada de todos los endpoints, schemas de solicitud/respuesta y podrás probar las peticiones directamente.

### Endpoints Principales

- **/api/topologies**: Gestión del ciclo de vida de las topologías (CRUD, Despliegue, Estado)
- **/api/chaos**: Inyección de fallos (NetworkChaos, PodChaos, StressChaos, etc.)
- **/api/applications**: Gestión de aplicaciones desplegadas en los nodos
- **/api/scenarios**: Creación y ejecución de escenarios de pruebas automatizados
- **/api/diagnostic**: Pruebas de conectividad y diagnósticos de red
- **/api/metrics**: Métricas en tiempo real y estadísticas
- **/api/templates**: Plantillas predefinidas de topologías
- **/api/presets**: Configuraciones predefinidas de caos

Consulta el Swagger UI para ver la lista completa.

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

## Pruebas con `testdistributed_app_simple` (Python)

Este repositorio incluye una aplicación de prueba minimalista escrita en Python (`testdistributed_app_simple/`). Es ideal para validaciones rápidas de conectividad y descubrimiento en la simulación.

- **Ubicación**: `testdistributed_app_simple/`
- **Lenguaje**: Python 3 (sin dependencias externas complejas)
- **Protocolo**: UDP (Broadcast/Multicast simulation via Headless Service)
- **Funcionalidad**: Envía mensajes "Hola" periódicos y escucha respuestas de peers.

> **Nota sobre Headless Service**: Esta aplicación utiliza un [Headless Service](https://kubernetes.io/docs/concepts/services-networking/service/#headless-services) de Kubernetes para el descubrimiento de pares (peer discovery). El servicio `testdistributed-app-headless` permite que cada pod resuelva vía DNS las IPs de todos los demás pods asociados, simulando un mecanismo de broadcast en un entorno donde el broadcast real no siempre es fiable o posible (dependiendo del CNI).

### Uso Rápido
1. Construir e inyectar al cluster:
   ```bash
   cd testdistributed_app_simple
   ./build_and_push.sh
   # Si falla la resolución de nombres en k3d:
   # k3d image import -c networksim localhost:5000/testdistributed_app_simple:latest
   ```
2. Desplegar en la topología usando la UI de NetworkSim.
3. Observar los logs para ver el intercambio de mensajes entre nodos.

## Pruebas Avanzadas con `testdistributed_app` (Rust/libp2p)

Este repositorio también incluye una aplicación de prueba basada en libp2p llamada `testdistributed_app` (ubicada en `testdistributed_app/`). Está pensada para validar comportamiento de descubrimiento/gossip y hacer pruebas de convergencia en entornos aislados (docker-compose, simuladores de red, etc.).

Resumen rápido:
- Binario: `testdistributed_app/target/release/testdistributed_app` (o `cargo build` para modo debug).
- Imagen Docker de ejemplo: `testdistributed_app:local` (ver `testdistributed_app/Dockerfile.runtime`).
- Script de ayudas:
	- `testdistributed_app/scripts/integration_docker.sh` — construye la imagen y lanza N contenedores (puerto host por contenedor).
	- `testdistributed_app/scripts/integration_compose.sh` — escala el servicio `node` en `testdistributed_app/docker-compose.yml`.
	- `testdistributed_app/scripts/integration_compose_logs.sh` — similar a `integration_compose.sh` pero captura logs por contenedor en `testdistributed_app/logs/`.
	- `testdistributed_app/build_and_push.sh` — construye y (opcionalmente) empuja la imagen a un registry local (`localhost:5000`).

### Ejecución con Docker Compose (fuera del cluster)

```bash
# construir imagen local si hace falta
cd testdistributed_app
./scripts/integration_docker.sh 3 9000 60

# o usar docker-compose directo (imagen ya presente)
./scripts/integration_compose_logs.sh 3 60

# Los logs por contenedor se guardarán en testdistributed_app/logs/<timestamp>/
```

### Ejecución Local

```bash
# en una terminal (nodo A)
cd testdistributed_app
HTTP_PORT=9091 INTERVAL_SECONDS=2 ANTI_ENTROPY_SECONDS=6 RUST_LOG=info ./target/debug/testdistributed_app

# en otra terminal (nodo B)
HTTP_PORT=9092 INTERVAL_SECONDS=2 ANTI_ENTROPY_SECONDS=6 RUST_LOG=info ./target/debug/testdistributed_app
```

### Variables útiles
- `HTTP_PORT`: puerto interno del servidor HTTP de inspección.
- `INTERVAL_SECONDS`: frecuencia de publicación de heartbeat.
- `RUST_LOG`: nivel de logging (ej. `info`, `debug`).


