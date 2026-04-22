#!/bin/bash

# 自动克隆项目并切换到目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "$SCRIPT_DIR" = "/tmp" ]; then
    # pipe方式运行，自动克隆
    if [ ! -d "/tmp/a-plan" ]; then
        echo "[提示] 正在自动克隆项目..."
        git clone https://github.com/plhys/a-plan.git /tmp/a-plan
        if [ $? -ne 0 ]; then
            echo "[错误] 克隆失败，请检查网络"
            exit 1
        fi
    fi
    cd /tmp/a-plan
else
    cd "$SCRIPT_DIR"
fi

# 设置环境
export LC_ALL=C LANG=C

echo "========================================"
echo "  A计划 快速安装启动脚本"
echo "========================================"
echo

# 检查Node.js
node --version > /dev/null 2>&1 || { echo "[错误] 未安装Node.js"; exit 1; }
echo "[成功] Node.js已安装"

# 检查npm
npm --version > /dev/null 2>&1 || { echo "[错误] npm不可用"; exit 1; }
echo "[成功] npm已就绪"

# 已安装过就跳过
if [ -d "node_modules" ]; then
    echo "[跳过] 依赖已安装"
else
    echo "[安装] 依赖..."
    pnpm install || npm install
fi

export PORT=${PORT:-18781}
echo "启动服务器 on http://localhost:$PORT"
node src/core/master.js