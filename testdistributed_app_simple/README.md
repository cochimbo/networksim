# Test Distributed App Simple

Esta es una aplicación distribuida extremadamente simple escrita en Python puro para probar conectividad de red y broadcast.

## Estructura

- `main.py`: Script único que envía y recibe paquetes UDP broadcast.
- `Dockerfile`: Construye una imagen mínima basada en Alpine.
- `docker-compose.yml`: Orquestación simple para levantar dos nodos que se hablen entre sí.

## Configuración

Variables de entorno configurables:

- `MESSAGE`: El identificador o contenido del mensaje (se usa en "hola desde {MESSAGE}").
- `PERIOD`: Segundos entre cada emisión de broadcast.
- `PORT`: Puerto UDP (default 37020).

## Como ejecutar

### Con Docker Compose (Recomendado)

Levanta dos instancias (`node-alpha` y `node-beta`) que se comunicarán automáticamente:

```bash
docker compose up --build
```

### Manualmente con Docker

1. Construir la imagen:
   ```bash
   docker build -t test-broadcast .
   ```

2. Ejecutar instancias (asegúrate de que estén en la misma red si quieres que se vean):
   ```bash
   docker run -d -e MESSAGE=Manual1 test-broadcast
   ```

## Despliegue en Kubernetes

Para que los nodos se descubran entre sí mediante Unicast (evitando problemas de broadcast en redes overlay), es **necesario** desplegar el servicio headless de descubrimiento.

1. **Aplicar el servicio de descubrimiento DNS:**
   ```bash
   kubectl apply -f headless-service.yaml
   ```
   *Esto crea el registro DNS interno que permite a los pods encontrar las IPs de sus compañeros.*

2. **Configuración del Deployment:**
   Asegúrate de establecer la variable de entorno `PEER_SERVICE_DNS` con el nombre del servicio (ej. `testdistributed-app-headless`).

