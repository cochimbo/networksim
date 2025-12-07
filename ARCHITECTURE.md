# NetworkSim - Arquitectura del Sistema

## Visión General

Simulador de redes con capacidad de crear topologías personalizadas y aplicar condiciones adversas (latencia, pérdida de paquetes, cortes de conexión) sobre una infraestructura real basada en contenedores orquestados.

---

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Web UI)                                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  - Editor visual de topología (drag & drop)                     │    │
│  │  - Vista en tiempo real del tráfico                             │    │
│  │  - Panel de control de condiciones adversas                     │    │
│  │  - Métricas y gráficos                                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ REST/WebSocket
┌─────────────────────────────────────────────────────────────────────────┐
│                      BACKEND (Control Plane)                             │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  API Server                                                     │    │
│  │  - Gestión de topologías (CRUD)                                 │    │
│  │  - Orquestación del cluster (crear/destruir nodos)              │    │
│  │  - Configuración de red                                         │    │
│  │  - Inyección de fallos                                          │    │
│  │  - Recolección de métricas                                      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Orquestador API
┌─────────────────────────────────────────────────────────────────────────┐
│                      CLUSTER DE CONTENEDORES                             │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ namespace: sistema (PROTEGIDO)                                  │    │
│  │  - Componentes de control                                       │    │
│  │  - Chaos Controller                                             │    │
│  │  - Aislado de las condiciones adversas                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ namespace: simulacion (ZONA DE CAOS)                            │    │
│  │                                                                 │    │
│  │   ┌─────────┐      ┌─────────┐      ┌─────────┐                │    │
│  │   │ Node A  │◄────►│ Node B  │◄────►│ Node C  │                │    │
│  │   │(Container)     │(Container)     │(Container)               │    │
│  │   └─────────┘      └─────────┘      └─────────┘                │    │
│  │        │                │                │                      │    │
│  │        └────────────────┴────────────────┘                      │    │
│  │              Red Virtual + Network Policies                     │    │
│  │                                                                 │    │
│  │   Aplicaciones desplegadas via Helm Charts                      │    │
│  │   Condiciones adversas aplicadas aquí                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Capas del Sistema

### 1. Frontend (Web UI)

**Responsabilidades:**
- Editor visual de topología con drag & drop
- Visualización en tiempo real del tráfico de red
- Panel de control para inyección de condiciones adversas
- Dashboard de métricas y gráficos
- Gestión de escenarios/topologías guardadas

**Comunicación:**
- REST API para operaciones CRUD
- WebSocket para actualizaciones en tiempo real

---

### 2. Backend (Control Plane)

**Responsabilidades:**
- API REST/WebSocket para el frontend
- Gestión de topologías (CRUD en base de datos)
- Orquestación del cluster (crear/destruir nodos)
- Configuración de red
- Inyección de condiciones adversas
- Recolección y agregación de métricas

**API (diseño inicial):**
```
# Topologías
POST   /api/topologies              # Crear topología
GET    /api/topologies              # Listar topologías
GET    /api/topologies/:id          # Obtener topología
PUT    /api/topologies/:id          # Actualizar topología
DELETE /api/topologies/:id          # Eliminar topología

# Despliegue
POST   /api/topologies/:id/deploy   # Desplegar topología
DELETE /api/topologies/:id/deploy   # Destruir despliegue
GET    /api/topologies/:id/status   # Estado del despliegue

# Nodos
GET    /api/nodes                   # Listar nodos desplegados
GET    /api/nodes/:id               # Detalle de nodo
POST   /api/nodes/:id/app           # Desplegar app (Helm) en nodo

# Chaos / Condiciones adversas
POST   /api/chaos                   # Crear condición adversa
GET    /api/chaos                   # Listar condiciones activas
DELETE /api/chaos/:id               # Eliminar condición

# Métricas
GET    /api/metrics                 # Obtener métricas

# Tiempo real
WS     /ws/events                   # Stream de eventos
```

---

### 3. Cluster de Contenedores (Data Plane)

**Componentes:**
- **Nodos simulados:** Cada nodo de la topología es un contenedor
- **Red virtual:** Control de conectividad entre nodos
- **Network Policies:** Definición de reglas de firewall/conectividad
- **Chaos Controller:** Orquestación de condiciones adversas

**Aislamiento:**
- El namespace de sistema está protegido de las condiciones adversas
- El namespace de simulación es donde se aplica el chaos
- Network policies impiden que el caos afecte al control plane

---

## Flujo de Datos

```
Usuario                Frontend              Backend               Cluster
   │                      │                     │                    │
   │──[Diseña topología]──►                     │                    │
   │                      │──[POST /topology]──►│                    │
   │                      │◄──[OK + ID]─────────│                    │
   │                      │                     │                    │
   │──[Despliega]─────────►                     │                    │
   │                      │──[POST /deploy]────►│                    │
   │                      │                     │──[Crea nodos]─────►│
   │                      │                     │◄──[Nodos ready]────│
   │                      │◄──[WebSocket]───────│                    │
   │◄──[Actualiza UI]─────│                     │                    │
   │                      │                     │                    │
   │──[Inyecta latencia]──►                     │                    │
   │                      │──[POST /chaos]─────►│                    │
   │                      │                     │──[Aplica chaos]───►│
   │                      │◄──[Confirmación]────│                    │
   │◄──[Muestra efecto]───│                     │                    │
```

---

## Modelo de Datos

### Topología
```json
{
  "id": "uuid",
  "name": "Mi Red",
  "description": "Topología de prueba",
  "nodes": [
    {
      "id": "node-1",
      "name": "Router A",
      "type": "router|server|client|custom",
      "position": { "x": 100, "y": 200 },
      "config": {
        "image": "opcional-imagen-docker",
        "resources": {}
      }
    }
  ],
  "links": [
    {
      "id": "link-1",
      "source": "node-1",
      "target": "node-2",
      "properties": {
        "bandwidth": "100Mbps",
        "latency": "10ms"
      }
    }
  ],
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Condición Adversa
```json
{
  "id": "uuid",
  "topology_id": "uuid",
  "target": {
    "type": "node|link",
    "id": "node-1 o link-1"
  },
  "condition": {
    "type": "latency|packet_loss|bandwidth_limit|disconnect|corruption",
    "params": {
      "delay": "100ms",
      "jitter": "10ms",
      "loss_percent": 5,
      "rate": "1Mbps"
    }
  },
  "active": true,
  "created_at": "timestamp"
}
```

### Aplicación (Helm Chart)
```json
{
  "id": "uuid",
  "node_id": "node-1",
  "chart": {
    "repository": "https://charts.example.com",
    "name": "nginx",
    "version": "1.0.0"
  },
  "values": {},
  "status": "deployed|pending|failed",
  "created_at": "timestamp"
}
```

---

## Principios de Diseño

1. **Monousuario:** La aplicación está diseñada para un solo usuario
2. **Aislamiento:** El control plane nunca es afectado por el chaos
3. **Escalabilidad:** Soporta hasta ~100 nodos por topología
4. **Tiempo real:** Visualización instantánea de cambios y métricas
5. **Declarativo:** Las topologías y condiciones se definen de forma declarativa
6. **Extensible:** Nuevos tipos de nodos y condiciones pueden añadirse fácilmente

---

## Documentos Relacionados

- [Stack Tecnológico](docs/STACK.md) - Decisiones de tecnología
- [Requisitos](docs/REQUIREMENTS.md) - Requisitos funcionales y no funcionales
4. Implementar editor visual del frontend
5. Integrar con K3s
6. Añadir inyección de fallos
7. Implementar métricas y monitoreo
