#!/bin/bash

# ============================================
#  A计划 智能安装启动脚本
#  支持：离线安装、国内镜像、智能回退
# ============================================

# 判断是否通过 pipe 方式运行 (curl ... | bash)
# 如果当前目录没有 package.json，则需要克隆项目
CURRENT_DIR=$(pwd)
if [ ! -f "$CURRENT_DIR/package.json" ]; then
    # 当前目录不是项目目录，需要克隆
    TARGET_DIR="/tmp/a-plan"
    
    if [ ! -f "$TARGET_DIR/package.json" ]; then
        echo "[提示] 正在自动克隆项目到 $TARGET_DIR ..."
        rm -rf "$TARGET_DIR"
        git clone https://github.com/plhys/a-plan.git "$TARGET_DIR"
        if [ $? -ne 0 ]; then
            echo "[错误] 克隆失败，请检查网络"
            exit 1
        fi
    fi
    
    cd "$TARGET_DIR"
    echo "[信息] 已切换到项目目录: $(pwd)"
fi

export LC_ALL=zh_CN.UTF-8
export LANG=zh_CN.UTF-8

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[信息]${NC} $1"; }
log_success() { echo -e "${GREEN}[成功]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[警告]${NC} $1"; }
log_error() { echo -e "${RED}[错误]${NC} $1"; }

echo "========================================"
echo "  A计划 智能安装启动脚本"
echo "========================================"
echo

# ============================================
# 1. 解析参数
# ============================================
FORCE_PULL=0
USE_OFFLINE=0
USE_MIRROR=0

for arg in "$@"; do
    case $arg in
        --pull)
            FORCE_PULL=1
            ;;
        --offline)
            USE_OFFLINE=1
            ;;
        --mirror)
            USE_MIRROR=1
            ;;
        --help|-h)
            echo "用法: $0 [选项]"
            echo "选项:"
            echo "  --pull     从Git远程拉取最新代码"
            echo "  --offline  强制使用离线模式（需要 node_modules.tar.gz）"
            echo "  --mirror   使用国内镜像安装"
            echo "  --detach   后台运行（守护进程模式）"
            echo "  --help     显示此帮助信息"
            exit 0
            ;;
    esac
done

# ============================================
# 2. Git 拉取（可选）
# ============================================
if [ $FORCE_PULL -eq 1 ]; then
    log_info "正在从远程仓库拉取最新代码..."
    if command -v git > /dev/null 2>&1 && [ -d ".git" ]; then
        if git ls-remote origin HEAD > /dev/null 2>&1; then
            git pull origin main 2>&1 && log_success "代码已更新" || log_warn "Git pull 失败，请检查网络"
        else
            log_warn "远程仓库不可达，跳过拉取"
        fi
    else
        log_warn "未检测到 Git，跳过代码拉取"
    fi
fi

# ============================================
# 3. 检测 Node.js
# ============================================
log_info "检查 Node.js 环境..."
if ! command -v node > /dev/null 2>&1; then
    log_error "未检测到 Node.js，请先安装"
    echo "下载地址：https://nodejs.org/"
    echo "提示：推荐安装 LTS 版本 (20.x)"
    exit 1
fi

NODE_VERSION=$(node --version)
log_success "Node.js 版本: $NODE_VERSION"

if ! command -v npm > /dev/null 2>&1; then
    log_error "npm 不可用，请重新安装 Node.js"
    exit 1
fi

# ============================================
# 4. 智能依赖安装
# ============================================

# 检测是否有 pnpm
if command -v pnpm > /dev/null 2>&1; then
    PKG_MANAGER=pnpm
elif command -v yarn > /dev/null 2>&1; then
    PKG_MANAGER=yarn
else
    PKG_MANAGER=npm
fi
log_info "使用包管理器: $PKG_MANAGER"

# 检查离线包
OFFLINE_PACKAGE="node_modules.tar.gz"
install_from_offline() {
    if [ -f "$OFFLINE_PACKAGE" ]; then
        log_info "检测到离线依赖包，正在解压..."
        tar -xzf "$OFFLINE_PACKAGE" -C . 2>/dev/null
        if [ -d "node_modules" ]; then
            log_success "离线依赖安装完成"
            return 0
        else
            log_warn "离线包解压失败，尝试其他方式"
            return 1
        fi
    fi
    return 1
}

# 设置镜像（如果需要）
setup_mirror() {
    local mirror_url="https://registry.npmmirror.com"
    log_info "切换到国内镜像: $mirror_url"
    npm config set registry "$mirror_url"
}

# 安装依赖
install_dependencies() {
    log_info "正在安装依赖..."
    
    if [ "$PKG_MANAGER" = "pnpm" ]; then
        pnpm install --frozen-lockfile 2>/dev/null || pnpm install
    elif [ "$PKG_MANAGER" = "yarn" ]; then
        yarn install --frozen-lockfile 2>/dev/null || yarn install
    else
        # npm 优先使用 ci（更快更稳定）
        if [ -f "package-lock.json" ]; then
            npm ci --prefer-offline 2>/dev/null || npm install
        else
            npm install
        fi
    fi
}

# 主安装逻辑
install_deps() {
    # 优先检查离线包
    if [ $USE_OFFLINE -eq 1 ] || [ -f "$OFFLINE_PACKAGE" ]; then
        if install_from_offline; then
            return 0
        fi
    fi
    
    # 如果指定了镜像，或者 npm install 失败，则尝试镜像
    if [ $USE_MIRROR -eq 1 ]; then
        setup_mirror
    fi
    
    # 尝试安装
    if install_dependencies; then
        log_success "依赖安装完成"
        return 0
    fi
    
    # npm 失败后尝试镜像（如果还没用过）
    if [ $USE_MIRROR -eq 0 ]; then
        log_warn "npm 安装失败，尝试使用国内镜像..."
        setup_mirror
        if install_dependencies; then
            log_success "镜像安装成功"
            return 0
        fi
    fi
    
    return 1
}

# 执行安装
if [ -d "node_modules" ]; then
    log_info "依赖已存在，跳过安装"
else
    if ! install_deps; then
        log_error "依赖安装失败"
        echo "请检查网络连接，或使用 --offline 模式"
        exit 1
    fi
fi

# ============================================
# 5. 检查必要文件
# ============================================
if [ ! -f "src/core/master.js" ]; then
    log_error "未找到 src/core/master.js 文件"
    exit 1
fi

log_success "项目文件检查完成"

# ============================================
# 6. 启动服务
# ============================================
echo
echo "========================================"
echo "  启动 A-Plan 服务..."
echo "========================================"

# 解析更多参数
DETACH=0
for arg in "$@"; do
    case $arg in
        -d|--detach|--background)
            DETACH=1
            ;;
    esac
done

export PORT=${PORT:-18781}

if [ $DETACH -eq 1 ]; then
    # 后台运行
    echo "服务地址: http://localhost:$PORT"
    echo "管理界面: http://localhost:$PORT"
    echo "日志文件: a-plan.log"
    echo "后台启动中..."
    
    nohup node src/core/master.js > a-plan.log 2>&1 &
    sleep 2
    
    if pgrep -f "master.js" > /dev/null; then
        log_success "服务已启动 (PID: $(pgrep -f 'master.js'))"
    else
        log_error "服务启动失败，请查看 a-plan.log"
        exit 1
    fi
else
    # 前台运行
    echo "服务地址: http://localhost:$PORT"
    echo "管理界面: http://localhost:$PORT"
    echo "按 Ctrl+C 停止服务"
    echo
    
    # 捕获 Ctrl+C，优雅关闭
    trap 'log_info "正在停止服务..."; exit 0' INT TERM
    
    node src/core/master.js
fi