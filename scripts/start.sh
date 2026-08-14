#!/usr/bin/env bash
set -euo pipefail

SOUL_PORT=8090
MATE_PORT=3002
SOUL_DIR="$HOME/opensoul"
MATE_DIR="$HOME/openmate"
SOUL_LOG="$SOUL_DIR/logs"
MATE_LOG="$MATE_DIR/logs"
PID_DIR="$HOME/.openmate-pids"

mkdir -p "$SOUL_LOG" "$MATE_LOG" "$PID_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

port_in_use() {
    fuser "$1/tcp" &>/dev/null
}

get_pid_on_port() {
    fuser "$1/tcp" 2>/dev/null | tr -d ' '
}

wait_for_port() {
    local port=$1
    local name=$2
    local timeout=${3:-30}
    local elapsed=0
    while ! port_in_use "$port"; do
        sleep 1
        elapsed=$((elapsed + 1))
        if [ "$elapsed" -ge "$timeout" ]; then
            log_error "$name 未能在 ${timeout}s 内启动 (端口 $port)"
            return 1
        fi
    done
    log_info "$name 已就绪 (端口 $port)"
}

start_opensoul() {
    if port_in_use "$SOUL_PORT"; then
        log_warn "OpenSoul 已在运行 (端口 $SOUL_PORT, PID $(get_pid_on_port $SOUL_PORT))"
        return 0
    fi
    log_info "启动 OpenSoul..."
    cd "$SOUL_DIR"
    nohup .venv/bin/python -m uvicorn src.main:app \
        --host 0.0.0.0 --port "$SOUL_PORT" \
        > "$SOUL_LOG/opensoul.log" 2>&1 &
    echo $! > "$PID_DIR/opensoul.pid"
    log_info "OpenSoul PID: $(cat "$PID_DIR/opensoul.pid")"
}

start_openmate() {
    if port_in_use "$MATE_PORT"; then
        log_warn "OpenMate 已在运行 (端口 $MATE_PORT, PID $(get_pid_on_port $MATE_PORT))"
        return 0
    fi
    log_info "启动 OpenMate..."
    cd "$MATE_DIR"
    nohup npm run dev -- -p "$MATE_PORT" \
        > "$MATE_LOG/openmate.log" 2>&1 &
    echo $! > "$PID_DIR/openmate.pid"
    log_info "OpenMate PID: $(cat "$PID_DIR/openmate.pid")"
}

stop_service() {
    local port=$1
    local name=$2
    local pid_file="$PID_DIR/${name,,}.pid"

    if port_in_use "$port"; then
        local pids
        pids=$(get_pid_on_port "$port")
        log_info "停止 $name (PID: $pids, 端口: $port)..."
        for pid in $pids; do
            kill "$pid" 2>/dev/null || true
        done
        local wait_count=0
        while port_in_use "$port" && [ "$wait_count" -lt 10 ]; do
            sleep 0.5
            wait_count=$((wait_count + 1))
        done
        if port_in_use "$port"; then
            log_warn "$name 未优雅退出，强制终止..."
            for pid in $pids; do
                kill -9 "$pid" 2>/dev/null || true
            done
        fi
        log_info "$name 已停止"
    else
        log_info "$name 未在运行"
    fi
    rm -f "$pid_file"
}

do_start() {
    log_info "========== 启动服务 =========="
    start_opensoul
    start_openmate
    echo ""
    log_info "等待服务就绪..."
    wait_for_port "$SOUL_PORT" "OpenSoul"
    wait_for_port "$MATE_PORT" "OpenMate"
    echo ""
    echo -e "${CYAN}================================${NC}"
    echo -e "${CYAN}  服务已启动!${NC}"
    echo -e "${CYAN}================================${NC}"
    echo -e "  OpenSoul:  http://localhost:$SOUL_PORT"
    echo -e "  OpenMate:  http://localhost:$MATE_PORT"
    echo -e "${CYAN}================================${NC}"
    echo ""
    echo -e "日志路径:"
    echo -e "  OpenSoul:  $SOUL_LOG/opensoul.log"
    echo -e "  OpenMate:  $MATE_LOG/openmate.log"
}

do_stop() {
    log_info "========== 停止服务 =========="
    stop_service "$MATE_PORT" "OpenMate"
    stop_service "$SOUL_PORT" "OpenSoul"
    echo ""
    log_info "所有服务已停止"
}

do_restart() {
    do_stop
    echo ""
    do_start
}

do_status() {
    echo -e "${CYAN}========== 服务状态 ==========${NC}"
    if port_in_use "$SOUL_PORT"; then
        echo -e "  OpenSoul:  ${GREEN}运行中${NC}  (端口 $SOUL_PORT, PID $(get_pid_on_port $SOUL_PORT))"
    else
        echo -e "  OpenSoul:  ${RED}未运行${NC}"
    fi
    if port_in_use "$MATE_PORT"; then
        echo -e "  OpenMate:  ${GREEN}运行中${NC}  (端口 $MATE_PORT, PID $(get_pid_on_port $MATE_PORT))"
    else
        echo -e "  OpenMate:  ${RED}未运行${NC}"
    fi
    echo -e "${CYAN}==============================${NC}"
}

usage() {
    echo "用法: $0 {start|stop|restart|status}"
    echo ""
    echo "  start    启动 OpenSoul 和 OpenMate (后台运行)"
    echo "  stop     停止所有服务"
    echo "  restart  重启所有服务"
    echo "  status   查看服务运行状态"
    exit 1
}

case "${1:-}" in
    start)   do_start ;;
    stop)    do_stop ;;
    restart) do_restart ;;
    status)  do_status ;;
    *)       usage ;;
esac
