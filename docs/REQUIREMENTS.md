# NetworkSim - Documento de Requisitos

> Este documento define los requisitos funcionales y no funcionales del sistema.
> Servirá como base para elaborar las historias de usuario y tareas.

---

## 1. Introducción

### 1.1 Propósito
NetworkSim es un simulador de redes que permite crear topologías personalizadas, desplegarlas sobre infraestructura real (contenedores), y aplicar condiciones adversas para probar el comportamiento de aplicaciones en escenarios de red degradados.

### 1.2 Alcance
- Aplicación monousuario
- Hasta 100 nodos por topología
- Ejecución en máquina local o VM

### 1.3 Usuarios
- Único usuario: administrador/desarrollador que diseña y prueba topologías

---

## 2. Requisitos Funcionales

### RF-01: Gestión de Topologías

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF-01.1 | El usuario puede crear una nueva topología vacía | Alta |
| RF-01.2 | El usuario puede añadir nodos a la topología mediante drag & drop | Alta |
| RF-01.3 | El usuario puede eliminar nodos de la topología | Alta |
| RF-01.4 | El usuario puede conectar nodos mediante enlaces | Alta |
| RF-01.5 | El usuario puede eliminar enlaces entre nodos | Alta |
| RF-01.6 | El usuario puede mover nodos en el canvas | Alta |
| RF-01.7 | El usuario puede asignar un nombre y descripción a la topología | Media |
| RF-01.8 | El usuario puede guardar la topología | Alta |
| RF-01.9 | El usuario puede cargar una topología guardada | Alta |
| RF-01.10 | El usuario puede eliminar una topología guardada | Media |
| RF-01.11 | El usuario puede duplicar una topología existente | Baja |
| RF-01.12 | El usuario puede exportar una topología a JSON | Baja |
| RF-01.13 | El usuario puede importar una topología desde JSON | Baja |

---

### RF-02: Configuración de Nodos

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF-02.1 | El usuario puede definir el tipo de nodo (router, servidor, cliente, custom) | Alta |
| RF-02.2 | El usuario puede asignar un nombre al nodo | Alta |
| RF-02.3 | El usuario puede especificar una imagen de contenedor para el nodo | Alta |
| RF-02.4 | El usuario puede configurar recursos del nodo (CPU, memoria) | Media |
| RF-02.5 | El usuario puede definir variables de entorno para el nodo | Media |
| RF-02.6 | El usuario puede ver el estado del nodo (sin desplegar, desplegado, error) | Alta |

---

### RF-03: Configuración de Enlaces

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF-03.1 | El usuario puede definir el ancho de banda base del enlace | Media |
| RF-03.2 | El usuario puede definir la latencia base del enlace | Media |
| RF-03.3 | El enlace refleja visualmente si tiene condiciones adversas activas | Alta |

---

### RF-04: Despliegue de Topología

| ID | Requisito | Prioridad | Estado |
|----|-----------|-----------|--------|
| RF-04.1 | El usuario puede desplegar una topología en el cluster | Alta | ✅ |
| RF-04.2 | El sistema crea los nodos como contenedores/pods | Alta | ✅ |
| RF-04.3 | El sistema configura la conectividad de red entre nodos según los enlaces | Alta | ✅ |
| RF-04.4 | El usuario puede ver el progreso del despliegue | Media | ✅ |
| RF-04.5 | El usuario puede destruir un despliegue activo | Alta | ✅ |
| RF-04.6 | El usuario puede ver el estado de cada nodo desplegado | Alta | ✅ |
| RF-04.7 | Solo puede haber un despliegue activo a la vez | Alta | ✅ |

---

### RF-05: Despliegue de Aplicaciones (Helm)

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF-05.1 | El usuario puede desplegar un chart Helm en un nodo específico | Alta |
| RF-05.2 | El usuario puede especificar el repositorio, nombre y versión del chart | Alta |
| RF-05.3 | El usuario puede proporcionar valores custom para el chart | Media |
| RF-05.4 | El usuario puede ver las aplicaciones desplegadas en cada nodo | Alta |
| RF-05.5 | El usuario puede eliminar una aplicación desplegada | Alta |
| RF-05.6 | El usuario puede ver los logs de una aplicación | Media |

---

### RF-06: Condiciones Adversas (Chaos)

| ID | Requisito | Prioridad | Estado |
|----|-----------|-----------|--------|
| RF-06.1 | El usuario puede aplicar latencia a un nodo o enlace | Alta | ✅ |
| RF-06.2 | El usuario puede aplicar pérdida de paquetes a un nodo o enlace | Alta | ✅ |
| RF-06.3 | El usuario puede limitar el ancho de banda de un nodo o enlace | Alta | ✅ |
| RF-06.4 | El usuario puede desconectar completamente un nodo (partición) | Alta | ⏳ |
| RF-06.5 | El usuario puede aplicar corrupción de paquetes | Media | ✅ |
| RF-06.6 | El usuario puede aplicar jitter (variación de latencia) | Media | ✅ |
| RF-06.7 | El usuario puede ver las condiciones adversas activas | Alta | ✅ |
| RF-06.8 | El usuario puede eliminar una condición adversa | Alta | ✅ |
| RF-06.9 | El usuario puede aplicar múltiples condiciones simultáneamente | Media | ✅ |
| RF-06.10 | Las condiciones adversas se reflejan visualmente en el grafo | Alta | ✅ |

**Parámetros de condiciones:**
- **Latencia:** delay (ms), jitter (ms)
- **Pérdida:** porcentaje (0-100%)
- **Ancho de banda:** rate limit (Kbps, Mbps)
- **Corrupción:** porcentaje (0-100%)
- **Partición:** lista de nodos a aislar

---

### RF-07: Visualización en Tiempo Real

| ID | Requisito | Prioridad | Estado |
|----|-----------|-----------|--------|
| RF-07.1 | El grafo muestra el estado actual de los nodos (color por estado) | Alta | ✅ |
| RF-07.2 | El grafo muestra las condiciones adversas activas (iconos/colores) | Alta | ✅ |
| RF-07.3 | Los cambios de estado se reflejan sin recargar la página | Alta | ✅ |
| RF-07.4 | El usuario puede hacer zoom y pan en el canvas | Media | ✅ |
| RF-07.5 | El usuario puede centrar la vista en un nodo específico | Baja | ⏳ |

---

### RF-08: Métricas y Monitoreo

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF-08.1 | El usuario puede ver métricas básicas de un nodo (CPU, memoria) | Media |
| RF-08.2 | El usuario puede ver estadísticas de red de un nodo (paquetes tx/rx) | Media |
| RF-08.3 | El usuario puede ver latencia real entre dos nodos | Media |
| RF-08.4 | Las métricas se actualizan en tiempo real | Media |

---

### RF-09: Persistencia

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF-09.1 | Las topologías se persisten entre reinicios de la aplicación | Alta |
| RF-09.2 | Las condiciones adversas activas se pueden restaurar al re-desplegar | Baja |
| RF-09.3 | El historial de despliegues se mantiene | Baja |

---

### RF-10: Escenarios y Scripting

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF-10.1 | El usuario puede crear un escenario nuevo | Alta |
| RF-10.2 | El usuario puede guardar un escenario | Alta |
| RF-10.3 | El usuario puede cargar un escenario guardado | Alta |
| RF-10.4 | El usuario puede eliminar un escenario | Media |
| RF-10.5 | El usuario puede duplicar un escenario existente | Baja |
| RF-10.6 | El usuario puede exportar un escenario a archivo | Media |
| RF-10.7 | El usuario puede importar un escenario desde archivo | Media |

#### RF-10.A: Editor de Escenarios

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF-10.8 | El sistema proporciona un editor visual de escenarios (timeline) | Alta |
| RF-10.9 | El usuario puede añadir eventos al escenario en puntos temporales | Alta |
| RF-10.10 | El usuario puede editar eventos existentes | Alta |
| RF-10.11 | El usuario puede eliminar eventos del escenario | Alta |
| RF-10.12 | El usuario puede reordenar eventos en el timeline | Media |
| RF-10.13 | El editor muestra una vista previa del estado de la topología en cada punto | Media |
| RF-10.14 | El usuario puede definir eventos con tiempo absoluto (t=30s) o relativo (t+10s) | Media |

#### RF-10.B: Tipos de Eventos

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF-10.15 | Evento: Aplicar condición adversa (latencia, pérdida, etc.) | Alta |
| RF-10.16 | Evento: Eliminar condición adversa | Alta |
| RF-10.17 | Evento: Modificar parámetros de enlace (ancho de banda, latencia base) | Alta |
| RF-10.18 | Evento: Desconectar nodo (partición de red) | Alta |
| RF-10.19 | Evento: Reconectar nodo | Alta |
| RF-10.20 | Evento: Añadir nodo a la topología | Media |
| RF-10.21 | Evento: Eliminar nodo de la topología | Media |
| RF-10.22 | Evento: Añadir enlace entre nodos | Media |
| RF-10.23 | Evento: Eliminar enlace entre nodos | Media |
| RF-10.24 | Evento: Desplegar aplicación (Helm) en nodo | Media |
| RF-10.25 | Evento: Eliminar aplicación de nodo | Media |
| RF-10.26 | Evento: Ejecutar comando en nodo | Baja |
| RF-10.27 | Evento: Pausar ejecución (esperar N segundos) | Alta |
| RF-10.28 | Evento: Esperar condición (ej: nodo alcanzable, servicio up) | Media |
| RF-10.29 | Evento: Log/mensaje (para documentar el escenario) | Baja |

#### RF-10.C: Ejecución de Escenarios

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF-10.30 | El usuario puede ejecutar un escenario completo | Alta |
| RF-10.31 | El usuario puede detener/cancelar la ejecución de un escenario | Alta |
| RF-10.32 | La ejecución del escenario ocurre en tiempo real (sin aceleración ni pausa) | Alta |
| RF-10.33 | El sistema muestra el progreso de ejecución (evento actual, tiempo transcurrido) | Alta |
| RF-10.34 | El sistema muestra el log de eventos ejecutados | Alta |
| RF-10.35 | El usuario puede ejecutar el escenario paso a paso (evento por evento) | Media |

#### RF-10.D: Editor de Scripts (Modo Código)

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF-10.39 | El usuario puede editar el escenario en modo código (YAML/JSON) | Media |
| RF-10.40 | El editor de código tiene syntax highlighting | Media |
| RF-10.41 | El editor de código valida la sintaxis en tiempo real | Media |
| RF-10.42 | El usuario puede alternar entre vista visual (timeline) y código | Media |
| RF-10.43 | Los cambios en una vista se sincronizan con la otra | Media |

**Formato de escenario (ejemplo YAML):**
```yaml
name: "Escenario de prueba de resiliencia"
description: "Simula degradación progresiva de red"
topology_id: "uuid-de-topologia"
events:
  - time: "0s"
    type: log
    message: "Iniciando escenario de prueba"
  
  - time: "10s"
    type: chaos
    action: apply
    target: 
      type: link
      id: "link-1"
    condition:
      type: latency
      params:
        delay: "50ms"
  
  - time: "30s"
    type: chaos
    action: apply
    target:
      type: node
      id: "node-2"
    condition:
      type: packet_loss
      params:
        loss_percent: 10
  
  - time: "60s"
    type: link
    action: modify
    target: "link-1"
    params:
      bandwidth: "10Mbps"
  
  - time: "90s"
    type: node
    action: disconnect
    target: "node-3"
  
  - time: "120s"
    type: wait_condition
    condition:
      type: node_unreachable
      target: "node-3"
      from: "node-1"
    timeout: "30s"
  
  - time: "150s"
    type: node
    action: reconnect
    target: "node-3"
  
  - time: "180s"
    type: chaos
    action: clear_all
  
  - time: "180s"
    type: log
    message: "Escenario completado"
```

---

## 3. Requisitos No Funcionales

### RNF-01: Rendimiento

| ID | Requisito | Objetivo |
|----|-----------|----------|
| RNF-01.1 | El sistema soporta hasta 100 nodos simultáneos | 100 nodos |
| RNF-01.2 | El tiempo de respuesta de la API es menor a 500ms | < 500ms |
| RNF-01.3 | La latencia de actualización WebSocket es menor a 1 segundo | < 1s |
| RNF-01.4 | El despliegue de una topología de 20 nodos tarda menos de 2 minutos | < 2 min |

---

### RNF-02: Usabilidad

| ID | Requisito |
|----|-----------|
| RNF-02.1 | La interfaz es intuitiva, no requiere documentación para uso básico |
| RNF-02.2 | El drag & drop funciona de forma fluida |
| RNF-02.3 | Los errores se muestran de forma clara al usuario |
| RNF-02.4 | El estado de las operaciones largas (despliegue) es visible |

---

### RNF-03: Seguridad

| ID | Requisito |
|----|-----------|
| RNF-03.1 | La aplicación es monousuario, no requiere autenticación |
| RNF-03.2 | El control plane del cluster está aislado de las condiciones adversas |
| RNF-03.3 | Las condiciones adversas solo afectan al namespace de simulación |

---

### RNF-04: Disponibilidad

| ID | Requisito | Estado |
|----|-----------|--------|
| RNF-04.1 | El backend se recupera de errores sin perder datos | ✅ |
| RNF-04.2 | Si el backend reinicia, el despliegue activo en K3s persiste | ✅ |
| RNF-04.3 | El frontend puede reconectarse automáticamente al WebSocket | ✅ |

---

### RNF-05: Portabilidad

| ID | Requisito |
|----|-----------|
| RNF-05.1 | El sistema funciona en Linux (Ubuntu, Rocky, etc.) |
| RNF-05.2 | El sistema puede correr en máquina física o VM |
| RNF-05.3 | La configuración es mínima (un archivo de config o variables de entorno) |

---

### RNF-06: Mantenibilidad

| ID | Requisito |
|----|-----------|
| RNF-06.1 | El código sigue convenciones estándar del lenguaje |
| RNF-06.2 | Los componentes están desacoplados (frontend/backend/infra) |
| RNF-06.3 | Los errores se loggean adecuadamente |
| RNF-06.4 | Existe documentación de arquitectura y stack |

---

## 4. Restricciones

| ID | Restricción |
|----|-------------|
| C-01 | Solo un usuario puede usar el sistema a la vez |
| C-02 | Solo puede haber un despliegue activo a la vez |
| C-03 | El sistema requiere K3s instalado y accesible |
| C-04 | El sistema requiere Chaos Mesh instalado en el cluster |
| C-05 | El sistema requiere Helm 3 disponible |

---

## 5. Supuestos

| ID | Supuesto |
|----|----------|
| A-01 | El usuario tiene conocimientos básicos de redes |
| A-02 | El usuario tiene acceso a los charts Helm que quiere desplegar |
| A-03 | La máquina donde corre tiene conectividad al cluster K3s |
| A-04 | Los contenedores de los nodos tienen las herramientas de red necesarias |

---

## 6. Dependencias Externas

| Dependencia | Versión | Propósito |
|-------------|---------|-----------|
| K3s | 1.28+ | Orquestación de contenedores |
| Helm | 3.x | Despliegue de aplicaciones |
| Chaos Mesh | 2.6+ | Inyección de condiciones adversas |
| Calico | 3.26+ | CNI y Network Policies |
| Docker/containerd | - | Runtime de contenedores |

---

## 7. Glosario

| Término | Definición |
|---------|------------|
| Topología | Grafo de nodos y enlaces que representa una red |
| Nodo | Unidad de la red, representado como un contenedor/pod |
| Enlace | Conexión entre dos nodos |
| Condición adversa | Degradación de red aplicada (latencia, pérdida, etc.) |
| Despliegue | Materialización de una topología en el cluster |
| Chart | Paquete de Helm que define una aplicación |
| Chaos | Experimento de ingeniería del caos |
| Escenario | Secuencia de eventos programados sobre una topología |
| Evento | Acción individual dentro de un escenario (aplicar chaos, modificar enlace, etc.) |
| Timeline | Vista temporal del escenario mostrando los eventos en orden |

---

## 8. Próximos Pasos

1. Revisar y priorizar requisitos
2. Crear historias de usuario a partir de los requisitos
3. Desglosar historias en tareas técnicas
4. Planificar sprints/iteraciones
