#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Open-Soulmate One-Command Startup Script
# "One Soul, Infinite Soma."
#
# Usage:
#   ./start.sh              # Start Soul + Mate (default)
#   ./start.sh all          # Start Soul + Mate + Soma
#   ./start.sh soul         # Start only OpenSoul
#   ./start.sh mate         # Start only OpenMate
#   ./start.sh soma         # Start only OpenSoma
#   ./start.sh status       # Check status of all services
#   ./start.sh stop         # Stop all services
#   ./start.sh restart      # Restart all services
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────
SOUL_PORT="${SOUL_PORT:-8090}"
MATE_PORT="${MATE_PORT:-3002}"
SOUL_DIR="${SOUL_DIR:-$HOME/opensoul}"
MATE_DIR="${MATE_DIR:-$HOME/openmate}"
SOMA_DIR="${SOMA_DIR:-$HOME/opensoma}"
PID_DIR="${PID_DIR:-$HOME/.openmate/pids}"
LOG_DIR="${LOG_DIR:-$HOME/.openmate/logs}"

# ── Colors ─────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ── Helpers ────────────────────────────────────────────────────
banner() {
  echo -e "${PURPLE}${BOLD}"
  echo "  ╔═══════════════════════════════════════════════╗"
  echo "  ║   🧠 Open-Soulmate  ·  One Soul, Infinite Soma  ║"
  echo "  ╚═══════════════════════════════════════════════╝"
  echo -e "${NC}"
}

log_info()  { echo -e "  ${BLUE}ℹ${NC}  $*"; }
log_ok()    { echo -e "  ${GREEN}✓${NC}  $*"; }
log_warn()  { echo -e "  ${YELLOW}⚠${NC}  $*"; }
log_error() { echo -e "  ${RED}✗${NC}  $*"; }
log_start() { echo -e "  ${CYAN}▶${NC}  $*"; }

ensure_dirs() {
  mkdir -p "$PID_DIR" "$LOG_DIR"
}

# Check if a port is in use
port_in_use() {
  local port=$1
  if command -v ss &>/dev/null; then
    ss -tlnp 2>/dev/null | grep -q ":${port} "
  elif command -v lsof &>/dev/null; then
    lsof -i :"$port" &>/dev/null
  else
    fuser "$port/tcp" &>/dev/null
  fi
}

# Get PID on a port
get_pid_on_port() {
  local port=$1
  if command -v ss &>/dev/null; then
    ss -tlnp 2>/dev/null | grep ":${port} " | grep -oP 'pid=\K[0-9]+' | head -1
  elif command -v lsof &>/dev/null; then
    lsof -ti :"$port" 2>/dev/null | head -1
  else
    fuser "$port/tcp" 2>/dev/null | tr -d ' '
  fi
}

# Wait for a service to become healthy
wait_for_health() {
  local name=$1
  local url=$2
  local max_wait=${3:-30}
  local elapsed=0

  while [ $elapsed -lt $max_wait ]; do
    if curl -sf "$url" -o /dev/null 2>/dev/null; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

# ── Service: OpenSoul ──────────────────────────────────────────
start_soul() {
  if port_in_use "$SOUL_PORT"; then
    local pid
    pid=$(get_pid_on_port "$SOUL_PORT")
    log_ok "OpenSoul already running on :${SOUL_PORT} (pid ${pid:-unknown})"
    return 0
  fi

  if [ ! -d "$SOUL_DIR" ]; then
    log_error "OpenSoul directory not found: $SOUL_DIR"
    return 1
  fi

  log_start "Starting OpenSoul on :${SOUL_PORT}..."

  cd "$SOUL_DIR"

  # Use venv if available
  local python_cmd
  if [ -f ".venv/bin/python" ]; then
    python_cmd=".venv/bin/python"
  elif [ -f "venv/bin/python" ]; then
    python_cmd="venv/bin/python"
  else
    python_cmd="python3"
  fi

  nohup $python_cmd -m uvicorn src.main:app \
    --host 0.0.0.0 \
    --port "$SOUL_PORT" \
    > "$LOG_DIR/opensoul.log" 2>&1 &

  local pid=$!
  echo "$pid" > "$PID_DIR/opensoul.pid"

  log_info "Waiting for OpenSoul to be ready..."
  if wait_for_health "OpenSoul" "http://127.0.0.1:${SOUL_PORT}/api/health" 30; then
    log_ok "OpenSoul started (pid $pid) → http://localhost:${SOUL_PORT}"
  else
    log_warn "OpenSoul started (pid $pid) but health check timed out"
    log_warn "Check logs: $LOG_DIR/opensoul.log"
  fi
}

stop_soul() {
  if [ -f "$PID_DIR/opensoul.pid" ]; then
    local pid
    pid=$(cat "$PID_DIR/opensoul.pid")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      log_ok "OpenSoul stopped (pid $pid)"
    fi
    rm -f "$PID_DIR/opensoul.pid"
  fi

  # Also kill by port
  if port_in_use "$SOUL_PORT"; then
    fuser -k "$SOUL_PORT/tcp" 2>/dev/null || true
  fi
}

# ── Service: OpenMate ──────────────────────────────────────────
start_mate() {
  if port_in_use "$MATE_PORT"; then
    local pid
    pid=$(get_pid_on_port "$MATE_PORT")
    log_ok "OpenMate already running on :${MATE_PORT} (pid ${pid:-unknown})"
    return 0
  fi

  if [ ! -d "$MATE_DIR" ]; then
    log_error "OpenMate directory not found: $MATE_DIR"
    return 1
  fi

  log_start "Starting OpenMate on :${MATE_PORT}..."

  cd "$MATE_DIR"

  # Check if we should use dev or production mode
  if [ -f ".next/BUILD_ID" ] || [ "${MATE_MODE:-dev}" = "production" ]; then
    # Production mode
    nohup npx next start --port "$MATE_PORT" \
      > "$LOG_DIR/openmate.log" 2>&1 &
  else
    # Dev mode
    nohup npm run dev -- --port "$MATE_PORT" \
      > "$LOG_DIR/openmate.log" 2>&1 &
  fi

  local pid=$!
  echo "$pid" > "$PID_DIR/openmate.pid"

  log_info "Waiting for OpenMate to be ready..."
  if wait_for_health "OpenMate" "http://127.0.0.1:${MATE_PORT}" 60; then
    log_ok "OpenMate started (pid $pid) → http://localhost:${MATE_PORT}"
  else
    log_warn "OpenMate started (pid $pid) but health check timed out"
    log_warn "Check logs: $LOG_DIR/openmate.log"
  fi
}

stop_mate() {
  if [ -f "$PID_DIR/openmate.pid" ]; then
    local pid
    pid=$(cat "$PID_DIR/openmate.pid")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      log_ok "OpenMate stopped (pid $pid)"
    fi
    rm -f "$PID_DIR/openmate.pid"
  fi

  # Also kill by port
  if port_in_use "$MATE_PORT"; then
    fuser -k "$MATE_PORT/tcp" 2>/dev/null || true
  fi
}

# ── Service: OpenSoma ──────────────────────────────────────────
start_soma() {
  if [ ! -d "$SOMA_DIR" ]; then
    log_warn "OpenSoma directory not found: $SOMA_DIR (skipping)"
    return 0
  fi

  if [ ! -f "$SOMA_DIR/target/release/opensoma" ] && [ ! -f "$SOMA_DIR/target/debug/opensoma" ]; then
    log_warn "OpenSoma binary not found. Build it first: cd $SOMA_DIR && cargo build --release"
    return 0
  fi

  local binary
  if [ -f "$SOMA_DIR/target/release/opensoma" ]; then
    binary="$SOMA_DIR/target/release/opensoma"
  else
    binary="$SOMA_DIR/target/debug/opensoma"
  fi

  log_start "Starting OpenSoma..."

  cd "$SOMA_DIR"
  nohup $binary \
    > "$LOG_DIR/opensoma.log" 2>&1 &

  local pid=$!
  echo "$pid" > "$PID_DIR/opensoma.pid"
  log_ok "OpenSoma started (pid $pid)"
}

stop_soma() {
  if [ -f "$PID_DIR/opensoma.pid" ]; then
    local pid
    pid=$(cat "$PID_DIR/opensoma.pid")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      log_ok "OpenSoma stopped (pid $pid)"
    fi
    rm -f "$PID_DIR/opensoma.pid"
  fi
}

# ── Status ─────────────────────────────────────────────────────
show_status() {
  echo -e "${BOLD}Service Status:${NC}"
  echo ""

  # OpenSoul
  if port_in_use "$SOUL_PORT"; then
    local pid
    pid=$(get_pid_on_port "$SOUL_PORT")
    local health
    health=$(curl -sf "http://127.0.0.1:${SOUL_PORT}/api/health" 2>/dev/null && echo "ok" || echo "degraded")
    echo -e "  ${GREEN}●${NC} OpenSoul    :${SOUL_PORT}  pid=${pid:-?}  health=${health}"
  else
    echo -e "  ${RED}○${NC} OpenSoul    :${SOUL_PORT}  stopped"
  fi

  # OpenMate
  if port_in_use "$MATE_PORT"; then
    local pid
    pid=$(get_pid_on_port "$MATE_PORT")
    echo -e "  ${GREEN}●${NC} OpenMate    :${MATE_PORT}  pid=${pid:-?}"
  else
    echo -e "  ${RED}○${NC} OpenMate    :${MATE_PORT}  stopped"
  fi

  # OpenSoma (check PID file)
  if [ -f "$PID_DIR/opensoma.pid" ]; then
    local pid
    pid=$(cat "$PID_DIR/opensoma.pid")
    if kill -0 "$pid" 2>/dev/null; then
      echo -e "  ${GREEN}●${NC} OpenSoma    (pid=$pid)"
    else
      echo -e "  ${RED}○${NC} OpenSoma    stopped (stale pid)"
    fi
  else
    echo -e "  ${YELLOW}○${NC} OpenSoma    not configured"
  fi

  # Organ health (aggregated)
  echo ""
  if port_in_use "$SOUL_PORT"; then
    local result
    result=$(curl -sf "http://127.0.0.1:${SOUL_PORT}/api/health/all" 2>/dev/null)
    if [ -n "$result" ]; then
      local healthy total
      healthy=$(echo "$result" | grep -oP '"healthy":\K[0-9]+' || echo "?")
      total=$(echo "$result" | grep -oP '"total":\K[0-9]+' || echo "?")
      echo -e "  ${BOLD}Organs:${NC} ${healthy}/${total} healthy"
    fi
  fi
}

# ── Stop All ───────────────────────────────────────────────────
stop_all() {
  log_start "Stopping all services..."
  stop_soma
  stop_mate
  stop_soul
  log_ok "All services stopped"
}

# ── Main ───────────────────────────────────────────────────────
main() {
  local command="${1:-default}"
  ensure_dirs

  case "$command" in
    default|"")
      banner
      start_soul
      start_mate
      echo ""
      show_status
      ;;
    all)
      banner
      start_soul
      start_mate
      start_soma
      echo ""
      show_status
      ;;
    soul)
      banner
      start_soul
      ;;
    mate)
      banner
      start_mate
      ;;
    soma)
      banner
      start_soma
      ;;
    status)
      banner
      show_status
      ;;
    stop)
      banner
      stop_all
      ;;
    restart)
      banner
      stop_all
      sleep 2
      start_soul
      start_mate
      echo ""
      show_status
      ;;
    *)
      echo "Usage: $0 {all|soul|mate|soma|status|stop|restart}"
      echo ""
      echo "Commands:"
      echo "  (default)  Start OpenSoul + OpenMate"
      echo "  all        Start all services including OpenSoma"
      echo "  soul       Start only OpenSoul"
      echo "  mate       Start only OpenMate"
      echo "  soma       Start only OpenSoma"
      echo "  status     Show service status"
      echo "  stop       Stop all services"
      echo "  restart    Restart all services"
      echo ""
      echo "Environment:"
      echo "  SOUL_PORT  OpenSoul port (default: 8090)"
      echo "  MATE_PORT  OpenMate port (default: 3002)"
      echo "  SOUL_DIR   OpenSoul directory (default: ~/opensoul)"
      echo "  MATE_DIR   OpenMate directory (default: ~/openmate)"
      echo "  SOMA_DIR   OpenSoma directory (default: ~/opensoma)"
      exit 1
      ;;
  esac
}

main "$@"
