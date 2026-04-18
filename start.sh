#!/bin/bash
# A计划 v3.0 - 极速启动与高可用守护脚本 (A-Plan Boot & Guardian)

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# [极客设置] 默认开启极速模式 (可被环境变量覆盖)
export CORE_ONLY=${CORE_ONLY:-false}
export AUTO_SYNC=${AUTO_SYNC:-true}

echo "=========================================="
echo "   🚀 A计划 (A-Plan) v3.0 - Booting"
echo "   Mode: $( [ "$CORE_ONLY" = "true" ] && echo "LITE (Core Engine)" || echo "FULL (All Features)" )"
echo "=========================================="

# 1. 异步 Git 更新 (异步拉取，不阻塞启动)
if [ -d ".git" ]; then
    (
        echo "[Sync] 后台检查远程更新..."
        git pull origin main > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            echo "[Sync] 远程配置已就绪。"
        else
            echo "[!] 远程同步跳过 (网络或冲突)。"
        fi
    ) &
fi

# 2. 检查依赖自愈
if [ ! -d "node_modules" ]; then
    echo "[!] 检测到依赖缺失，正在静默修复..."
    npm install --production > /dev/null 2>&1
fi

# 3. 启动高可用 Master 进程
# 优先使用 Master-Worker 架构进行容灾守护
if pgrep -f "src/core/master.js" > /dev/null
then
    echo "[!] A计划已经在运行中 (Master 活跃)。"
else
    echo "[+] 正在启动高可用引擎..."
    # 使用 nohup 确保 Pod 终端断开后继续运行
    nohup npm start > a-plan_runtime.log 2>&1 &
    
    # 等待秒级自检
    sleep 2
    if pgrep -f "src/core/master.js" > /dev/null; then
        echo "✅ A计划启动成功! (API 端口: 3000)"
    else
        echo "❌ 启动失败，请检查 a-plan_runtime.log"
    fi
fi

# 4. 自动化云端备份守护 (每 10 分钟)
if [ "$AUTO_SYNC" = "true" ]; then
    (
        echo "[Sync] 配置自动备份已开启..."
        while true; do
            sleep 600
            # 仅在有变动时 Push
            if [[ -n $(git status --porcelain configs/) ]]; then
                echo "[Sync] $(date '+%H:%M:%S') 检测到配置变更，正在推送到云端..."
                git add configs/*.json pwd > /dev/null 2>&1
                git commit -m "Auto-sync: Remote config backup" > /dev/null 2>&1
                git push origin main > /dev/null 2>&1
                echo "[Sync] 云端备份完成。"
            fi
        done
    ) &
fi
