#!/bin/bash
# NetworkSim - Script de verificación de pods desplegados
# Uso: ./scripts/check-pods.sh [topology_id]

set -e

NAMESPACE="networksim-sim"
TOPOLOGY_ID="${1:-}"

echo "=============================================="
echo "   NetworkSim - Verificación de Pods"
echo "=============================================="
echo ""

# Verificar conexión al cluster
if ! kubectl cluster-info &>/dev/null; then
    echo "❌ Error: No hay conexión al cluster Kubernetes"
    echo "   Ejecuta: k3d cluster start networksim"
    exit 1
fi
echo "✓ Cluster Kubernetes conectado"
echo ""

# Verificar namespace
if ! kubectl get namespace "$NAMESPACE" &>/dev/null; then
    echo "⚠️  Namespace '$NAMESPACE' no existe (no hay despliegues)"
    exit 0
fi

# Listar pods
echo "=== Pods en namespace '$NAMESPACE' ==="
echo ""

if [ -n "$TOPOLOGY_ID" ]; then
    # Filtrar por topología específica
    PODS=$(kubectl get pods -n "$NAMESPACE" -l "networksim.io/topology-id=$TOPOLOGY_ID" --no-headers 2>/dev/null)
    if [ -z "$PODS" ]; then
        echo "No hay pods para la topología: $TOPOLOGY_ID"
        exit 0
    fi
    echo "Filtrando por topología: $TOPOLOGY_ID"
    echo ""
    kubectl get pods -n "$NAMESPACE" -l "networksim.io/topology-id=$TOPOLOGY_ID" -o wide
else
    # Mostrar todos los pods
    kubectl get pods -n "$NAMESPACE" -o wide
fi

echo ""

# Contar estados
TOTAL=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l)
RUNNING=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | grep -c "Running" || true)
PENDING=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | grep -c "Pending" || true)
FAILED=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | grep -cE "Error|CrashLoopBackOff|Failed" || true)

# Asegurar valores numéricos
RUNNING=${RUNNING:-0}
PENDING=${PENDING:-0}
FAILED=${FAILED:-0}

echo "=== Resumen ==="
echo "Total:    $TOTAL pods"
echo "Running:  $RUNNING ✓"
echo "Pending:  $PENDING ◐"
echo "Failed:   $FAILED ✕"
echo ""

# Verificar NetworkChaos
echo "=== Condiciones de Chaos Activas ==="
CHAOS_COUNT=$(kubectl get networkchaos -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l)
if [ "$CHAOS_COUNT" -eq 0 ]; then
    echo "No hay condiciones de chaos activas"
else
    kubectl get networkchaos -n "$NAMESPACE"
fi
echo ""

# Verificar Services
echo "=== Services ==="
kubectl get svc -n "$NAMESPACE" --no-headers 2>/dev/null | head -10 || echo "No hay services"
echo ""

# Estado final
if [ "$FAILED" -gt 0 ]; then
    echo "⚠️  Hay pods con errores. Revisa con:"
    echo "   kubectl describe pods -n $NAMESPACE"
    exit 1
elif [ "$PENDING" -gt 0 ]; then
    echo "◐ Hay pods pendientes de iniciar..."
    exit 0
else
    echo "✓ Todos los pods están corriendo correctamente"
    exit 0
fi
