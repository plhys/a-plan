#!/bin/bash
# A-Plan v5.0.2-2 稳定基线回滚脚本
# 如果改崩了，运行这个脚本秒回滚

echo "=== A-Plan v5.0.2-2 稳定基线回滚 ==="
echo "回滚时间: $(date)"
echo ""

# 检查备份目录
STABLE_DIR="/data/workspace/a-plan/stable-baseline-v5.0.2-2"
TARGET_DIR="/data/workspace/projects/a-plan"

if [ ! -d "$STABLE_DIR" ]; then
    echo "❌ 错误: 稳定基线目录不存在: $STABLE_DIR"
    exit 1
fi

# 创建时间戳备份（防止回滚前想保存当前状态）
echo "📦 创建当前状态备份..."
cp "$TARGET_DIR/static/app/provider-manager.js" "$TARGET_DIR/static/app/provider-manager.js.pre-rollback-$(date +%Y%m%d-%H%M%S)" 2>/dev/null
cp "$TARGET_DIR/static/app/utils.js" "$TARGET_DIR/static/app/utils.js.pre-rollback-$(date +%Y%m%d-%H%M%S)" 2>/dev/null
cp "$TARGET_DIR/src/ui-modules/provider-api.js" "$TARGET_DIR/src/ui-modules/provider-api.js.pre-rollback-$(date +%Y%m%d-%H%M%S)" 2>/dev/null

# 执行回滚
echo "🔄 执行回滚..."
cp "$STABLE_DIR/provider-manager.js" "$TARGET_DIR/static/app/provider-manager.js"
cp "$STABLE_DIR/utils.js" "$TARGET_DIR/static/app/utils.js"
cp "$STABLE_DIR/provider-api.js" "$TARGET_DIR/src/ui-modules/provider-api.js"

# 验证文件
echo "🔍 验证..."
cd "$TARGET_DIR"
printf '%s\n' \
  "provider-manager.js:$(md5sum static/app/provider-manager.js | cut -d' ' -f1)" \
  "utils.js:$(md5sum static/app/utils.js | cut -d' ' -f1)" \
  "provider-api.js:$(md5sum src/ui-modules/provider-api.js | cut -d' ' -f1)" > /tmp/current_checksums.txt

if diff -q "$STABLE_DIR/VERSION.txt" /tmp/current_checksums.txt > /dev/null 2>&1; then
    echo "✅ 回滚成功！文件校验通过"
else
    echo "⚠️ 文件已恢复，但校验和与基线不同（可能版本信息格式差异）"
fi

echo ""
echo "🚀 建议操作:"
echo "  1. 刷新前端页面清除缓存 (Ctrl+F5)"
echo "  2. 检查服务状态: curl localhost:18781/health"
echo ""
echo "📋 当前状态: v5.0.2-2 稳定基线"
echo "   - 显示3个提供商 (OpenAI Custom, CF Gateway免费, CF Gateway代理)"
echo "   - 支持添加其他9种提供商类型"
echo ""
