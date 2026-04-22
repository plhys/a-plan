#!/bin/bash
# ============================================
#  A-Plan 启动与守护脚本
#  支持：后台运行、健康检查、日志管理
# ============================================

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[信息]${NC} $1"; }
log_success() { echo -e "${GREEN}[成功]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[警告]${NC} $1"; }
log_error() { echo -e "${RED}[错误]${NC} $1"; }

# 配置
export CORE_ONLY=${CORE_ONLY:-false}
export AUTO_SYNC=${AUTO_SYNC:-true}
LOG_FILE="${DIR}/a-plan.log"
PID_FILE="${DIR}/a-plan.pid"
PORT=${PORT:-3000}
MAX_RETRIES=5
RETRY_INTERVAL=3

echo "=========================================="
echo "   🚀 A-Plan 启动中"
echo "   模式: $( [ "$CORE_ONLY" = "true" ] && echo "LITE (核心)" || echo "FULL (全功能)" )"
echo "=========================================="

# ============================================
# 1. 检查依赖
# ============================================
if [ ! -d "node_modules" ]; then
    log_warn "依赖未安装，正在尝试修复..."
    if [ -f "node_modules.tar.gz" ]; then
        log_info "解压离线依赖包..."
        tar -xzf node_modules.tar.gz -C . 2>/dev/null
    fi
    
    if [ ! -d "node_modules" ]; then
        if command -v pnpm > /dev/null 2>&1; then
            pnpm install
        else
            npm install
        fi
    fi
fi

# ============================================
# 2. 检查端口是否被占用
# ============================================
check_port() {
    if command -v lsof > /dev/null 2>&1; then
        lsof -i :$PORT > /dev/null 2>&1
    elif command -v ss > /dev/null 2>&1; then
        ss -tuln | grep -q ":$PORT "
    else
        # 备用方案：尝试连接
        timeout 1 bash -c "echo >/dev/tcp/localhost/$PORT" 2>/dev/null
    fi
}

# 检查进程是否在运行
check_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi
    # 也检查进程名
    pgrep -f "src/core/master.js" > /dev/null 2>&1
}

# ============================================
# 3. 启动服务
# ============================================
start_service() {
    # 检查是否已在运行
    if check_running; then
        log_warn "A-Plan 已在运行中"
        if [ -f "$PID_FILE" ]; then
            log_info "PID: $(cat $PID_FILE)"
        fi
        echo
        echo "访问 http://localhost:$PORT 查看管理界面"
        return 0
    fi
    
    # 检查端口
    if check_port; then
        log_error "端口 $PORT 已被占用"
        log_info "请先停止占用端口的进程，或设置 PORT 环境变量"
        echo "  示例: PORT=3001 $0"
        return 1
    fi
    
    log_info "启动服务..."
    
    # 后台启动
    nohup node src/core/master.js >> "$LOG_FILE" 2>&1 &
    local pid=$!
    echo $pid > "$PID_FILE"
    
    log_info "等待服务启动 (PID: $pid)..."
    
    # 健康检查
    local retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        sleep $RETRY_INTERVAL
        
        if check_running; then
            # 尝试访问健康检查端点
            if curl -s -f "http://localhost:$PORT/health" > /dev/null 2>&1; then
                log_success "服务启动成功!"
                echo
                echo "=========================================="
                echo -e "  ${GREEN}✅ A-Plan 运行中${NC}"
                echo "=========================================="
                echo "  管理界面: http://localhost:$PORT"
                echo "  日志文件: $LOG_FILE"
                echo "  停止服务: $0 stop"
                echo
                return 0
            fi
        fi
        
        ((retries++))
        log_info "等待启动... ($retries/$MAX_RETRIES)"
    done
    
    log_error "服务启动失败，请查看日志"
    echo "日志: tail -f $LOG_FILE"
    return 1
}

# ============================================
# 4. 停止服务
# ============================================
stop_service() {
    log_info "正在停止 A-Plan..."
    
    local stopped=0
    
    # 方法1: 使用 PID 文件
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
            sleep 1
            if ! kill -0 "$pid" 2>/dev/null; then
                stopped=1
            fi
        fi
        rm -f "$PID_FILE"
    fi
    
    # 方法2: 使用进程名
    if [ $stopped -eq 0 ]; then
        local pids=$(pgrep -f "src/core/master.js")
        if [ -n "$pids" ]; then
            for pid in $pids; do
                kill "$pid" 2>/dev/null
            done
            sleep 1
            stopped=1
        fi
    fi
    
    if [ $stopped -eq 1 ]; then
        log_success "服务已停止"
    else
        log_warn "服务未在运行"
    fi
}

# ============================================
# 5. 查看日志
# ============================================
show_logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        log_error "日志文件不存在: $LOG_FILE"
    fi
}

# ============================================
# 6. 主命令处理
# ============================================
case "${1:-start}" in
    start)
        start_service
        ;;
    stop)
        stop_service
        ;;
    restart)
        stop_service
        sleep 2
        start_service
        ;;
    logs|tail)
        show_logs
        ;;
    status)
        if check_running; then
            log_success "A-Plan 正在运行"
            [ -f "$PID_FILE" ] && echo "PID: $(cat $PID_FILE)"
        else
            log_info "A-Plan 未运行"
        fi
        ;;
    *)
        echo "用法: $0 {start|stop|restart|logs|status}"
        echo
        echo "命令:"
        echo "  start   启动服务 (默认)"
        echo "  stop    停止服务"
        echo "  restart 重启服务"
        echo "  logs    查看实时日志"
        echo "  status  查看运行状态"
        echo
        echo "环境变量:"
        echo "  PORT         服务端口 (默认: 3000)"
        echo "  CORE_ONLY    核心模式 (true/false)"
        echo "  AUTO_SYNC    自动同步 (true/false)"
        exit 1
        ;;
esac