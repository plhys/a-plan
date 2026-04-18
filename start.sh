#!/bin/bash
# A计划 - 启动与复位脚本 (A-Plan Boot Script)

# 进入项目持久化目录
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=========================================="
echo "   A计划 (A-Plan) - AI Gateway 启动中"
echo "=========================================="

# 检查是否已在运行
if pgrep -f "src/services/api-server.js" > /dev/null
then
    echo "[!] A计划已经在运行中 (PID: $(pgrep -f "src/services/api-server.js"))."
    echo "若需重新启动，请先运行: pkill -f \"src/services/api-server.js\""
    exit 1
fi

# 检查依赖 (如果 node_modules 缺失则安装)
if [ ! -d "node_modules" ]; then
    echo "[*] 检测到依赖缺失，正在极速安装..."
    npm install --production
fi

# 启动服务
# 默认开启 UI。如需极简模式，可设置 LITE_MODE=true
echo "[+] 正在后台启动 A计划..."
nohup node src/services/api-server.js > a-plan_runtime.log 2>&1 &

# 获取启动后的 PID
PID=$!

if [ $? -eq 0 ]; then
    echo "------------------------------------------"
    echo "✅ A计划启动成功!"
    echo "🚀 PID: $PID"
    echo "🌐 管理后台: http://localhost:3000"
    echo "📜 运行日志: a-plan_runtime.log"
    echo "------------------------------------------"
else
    echo "❌ 启动失败，请查看 a-plan_runtime.log"
fi
