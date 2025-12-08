#!/bin/bash
# =============================================================================
# NetworkSim - Script de Inicio
# =============================================================================
# Uso: ./start.sh
# Para detener: ./start.sh stop
# =============================================================================

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PROJECT_DIR="/home/cochimbo/networksim"
BACKEND_LOG="/tmp/networksim-backend.log"
FRONTEND_LOG="/tmp/networksim-frontend.log"

# Función para detener servicios
stop_services() {
    echo -e "${YELLOW}Deteniendo servicios...${NC}"
    pkill -9 -f "networksim-backend" 2>/dev/null || true
    pkill -9 -f "vite" 2>/dev/null || true
    pkill -9 -f "node.*3000" 2>/dev/null || true
    sleep 1
    echo -e "${GREEN}Servicios detenidos${NC}"
}

# Función para iniciar backend
start_backend() {
    echo -e "${YELLOW}Iniciando Backend (puerto 8080)...${NC}"
    cd "$PROJECT_DIR/backend"
    DATABASE_URL="sqlite://networksim.db?mode=rwc" nohup cargo run > "$BACKEND_LOG" 2>&1 &
    
    # Esperar a que inicie
    for i in {1..30}; do
        if curl -s --max-time 1 http://localhost:8080/health > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Backend listo en http://localhost:8080${NC}"
            return 0
        fi
        sleep 1
    done
    echo -e "${RED}✗ Backend no respondió. Ver log: $BACKEND_LOG${NC}"
    return 1
}

# Función para iniciar frontend
start_frontend() {
    echo -e "${YELLOW}Iniciando Frontend (puerto 3000)...${NC}"
    cd "$PROJECT_DIR/frontend"
    nohup npm run dev > "$FRONTEND_LOG" 2>&1 &
    
    # Esperar a que inicie
    for i in {1..15}; do
        if curl -4 -s --max-time 1 http://127.0.0.1:3000/ > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Frontend listo en http://localhost:3000${NC}"
            return 0
        fi
        sleep 1
    done
    echo -e "${RED}✗ Frontend no respondió. Ver log: $FRONTEND_LOG${NC}"
    return 1
}

# Función para mostrar estado
show_status() {
    echo ""
    echo -e "${YELLOW}=== Estado de Servicios ===${NC}"
    
    if curl -s --max-time 1 http://localhost:8080/health > /dev/null 2>&1; then
        echo -e "Backend:  ${GREEN}● Corriendo${NC} en http://localhost:8080"
    else
        echo -e "Backend:  ${RED}○ Detenido${NC}"
    fi
    
    if curl -4 -s --max-time 1 http://127.0.0.1:3000/ > /dev/null 2>&1; then
        echo -e "Frontend: ${GREEN}● Corriendo${NC} en http://localhost:3000"
    else
        echo -e "Frontend: ${RED}○ Detenido${NC}"
    fi
    
    echo ""
    echo -e "${YELLOW}=== Puertos ===${NC}"
    ss -tlnp 2>/dev/null | grep -E "8080|3000" || echo "Ningún puerto activo"
    echo ""
}

# Main
case "${1:-start}" in
    stop)
        stop_services
        ;;
    status)
        show_status
        ;;
    restart)
        stop_services
        sleep 2
        start_backend
        start_frontend
        show_status
        ;;
    start|*)
        echo "=============================================="
        echo "       NetworkSim - Iniciando Servicios       "
        echo "=============================================="
        stop_services
        sleep 2
        start_backend
        start_frontend
        show_status
        echo "=============================================="
        echo -e "${GREEN}¡Listo! Abre http://localhost:3000 en tu navegador${NC}"
        echo "=============================================="
        echo ""
        echo "Comandos útiles:"
        echo "  ./start.sh stop    - Detener servicios"
        echo "  ./start.sh status  - Ver estado"
        echo "  ./start.sh restart - Reiniciar todo"
        echo ""
        echo "Logs:"
        echo "  Backend:  tail -f $BACKEND_LOG"
        echo "  Frontend: tail -f $FRONTEND_LOG"
        ;;
esac
