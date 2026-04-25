#!/bin/bash
# A-Plan 一键部署为系统服务（systemd）
# 用法: sudo bash deploy/install-service.sh

set -e

SERVICE_FILE="$(dirname "$0")/a-plan.service"
TARGET="/etc/systemd/system/a-plan.service"

if [ "$(id -u)" -ne 0 ]; then
    echo "请用 sudo 运行: sudo bash $0"
    exit 1
fi

echo "=== A-Plan 系统服务安装 ==="

# 自动替换工作目录
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
sed "s|/data/workspace/a-plan|$PROJECT_DIR|g" "$SERVICE_FILE" > "$TARGET"

echo "✅ 已写入: $TARGET"
echo "   工作目录: $PROJECT_DIR"

systemctl daemon-reload
systemctl enable a-plan
systemctl start a-plan
sleep 2
systemctl status a-plan --no-pager

echo ""
echo "=== 安装完成 ==="
echo "  systemctl start a-plan    # 启动"
echo "  systemctl stop a-plan     # 停止"
echo "  systemctl restart a-plan  # 重启"
echo "  systemctl status a-plan   # 状态"
echo "  journalctl -u a-plan -f   # 日志"
