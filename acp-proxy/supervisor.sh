#!/bin/bash
# DNA双螺旋进化 — 双实例+网关监督器
# 网关(8091) + 实例A(8092) + 实例B(8095)
# 互相改代码，监督器负责：启动、重启、崩溃回滚
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 端口配置
GATEWAY_PORT=8091
INSTANCE_A_PORT=8092
INSTANCE_B_PORT=8095

# 状态追踪
declare -A CRASH_COUNT
RESTART_CODE=42
MAX_CRASHES=3
COOLDOWN=3

log() {
    echo "[$(date '+%H:%M:%S')] [supervisor] $*" >&2
}

cleanup() {
    log "Shutting down all..."
    pkill -P $$ 2>/dev/null || true
    # 清理PID文件
    rm -f "$SCRIPT_DIR"/data/*.pid
    exit 0
}
trap cleanup SIGINT SIGTERM

git_rollback() {
    log "⚠️ Rolling back last git commit..."
    cd "$SCRIPT_DIR"
    git reset --hard HEAD~1 2>/dev/null || true
    cd - > /dev/null
}

run_instance() {
    local id="$1"
    local port="$2"
    local pid_file="$SCRIPT_DIR/data/instance_${id}.pid"

    log "🧬 Starting instance $id on port $port (strand=strand_$id)"

    while true; do
        INSTANCE_ID="$id" python main.py --port "$port" --instance "$id" &
        local pid=$!
        echo "$pid" > "$pid_file"

        wait "$pid" 2>/dev/null
        local exit_code=$?
        rm -f "$pid_file"

        if [[ $exit_code -eq $RESTART_CODE ]]; then
            log "🔄 Instance $id: code changed, restarting..."
            CRASH_COUNT[$id]=0
            sleep 1
            continue
        elif [[ $exit_code -eq 0 ]]; then
            log "Instance $id exited cleanly"
            return 0
        else
            CRASH_COUNT[$id]=$(( ${CRASH_COUNT[$id]:-0} + 1 ))
            log "💥 Instance $id crashed (exit=$exit_code, crashes=${CRASH_COUNT[$id]})"

            if [[ ${CRASH_COUNT[$id]} -ge $MAX_CRASHES ]]; then
                log "🚨 Too many crashes for $id! Rolling back..."
                git_rollback
                CRASH_COUNT[$id]=0
            fi
            sleep "$COOLDOWN"
        fi
    done
}

run_gateway() {
    log "🌐 Starting gateway on port $GATEWAY_PORT"
    python gateway_proxy.py &
    local pid=$!
    echo "$pid" > "$SCRIPT_DIR/data/gateway.pid"
    wait "$pid" 2>/dev/null
    log "🌐 Gateway exited"
}

# ── 主流程 ──
log "=== DNA Evolution Supervisor starting ==="
log "  Gateway:  port $GATEWAY_PORT"
log "  Instance A: port $INSTANCE_A_PORT (strand_a, conservative)"
log "  Instance B: port $INSTANCE_B_PORT (strand_b, aggressive)"

mkdir -p "$SCRIPT_DIR/data"

# 清理旧进程
pkill -f dna_strand_runner 2>/dev/null || true
pkill -f "python.*main.py.*--port" 2>/dev/null || true
sleep 1

# 初始化崩溃计数
CRASH_COUNT[a]=0
CRASH_COUNT[b]=0

# 启动三个进程
run_gateway &
GW_PID=$!

run_instance "a" "$INSTANCE_A_PORT" &
INST_A_PID=$!

run_instance "b" "$INSTANCE_B_PORT" &
INST_B_PID=$!

log "=== All processes launched (gw=$GW_PID, a=$INST_A_PID, b=$INST_B_PID) ==="

# 等待任意子进程退出
wait -n 2>/dev/null || wait
log "A child process exited, shutting down all..."
cleanup
