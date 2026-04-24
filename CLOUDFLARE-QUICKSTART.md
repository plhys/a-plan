# Cloudflare Workers AI 快速开始指南

## 🎯 目标

在 5 分钟内配置好 Cloudflare Workers AI，享受每天 10,000 次免费调用！

---

## 📋 前提条件

1. Cloudflare 账户（免费注册）
2. A-Plan v5.0.2+ 已安装运行

---

## 🚀 步骤 1：获取 Cloudflare API Token

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 点击右上角头像 → **My Profile**
3. 选择 **API Tokens** 标签
4. 点击 **Create Token**
5. 选择 **Edit Cloudflare Workers** 模板（或自定义权限）
6. 复制生成的 Token（格式：`cfat_xxxxxxxxxxxxx`）

**⚠️ 重要**: Token 只会显示一次，请立即保存！

---

## 🔧 步骤 2：创建 AI Gateway

### 方法 A：使用 A-Plan UI（推荐）

1. 访问 A-Plan 管理后台：`http://你的IP:18781`
2. 登录（默认密码：`123456`）
3. 进入 **Provider Pools** 页面
4. 点击 **Add Provider**
5. 选择 **Cloudflare Gateway** 类型
6. 填写信息：
   - **Name**: `cloudflare-gateway-free`
   - **Account ID**: 在 Dashboard → Workers & Pages → 查看右侧
   - **Gateway ID**: `a-plan-gateway`（自定义）
   - **API Token**: 步骤 1 获取的 Token
7. 点击 **Create Gateway**（自动调用 API 创建）
8. 等待创建成功提示

### 方法 B：手动创建（命令行）

```bash
# 设置变量
ACCOUNT_ID="你的账户 ID"
GATEWAY_ID="a-plan-gateway"
CF_API_TOKEN="cfat_你的 token"

# 创建 Gateway
curl -X POST "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai-gateway/gateways" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "'"${GATEWAY_ID}"'",
    "description": "A-Plan AI Gateway for Workers AI"
  }'

# 禁用认证（可选，用于公开访问）
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai-gateway/gateways/${GATEWAY_ID}" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"authentication": false}'
```

---

## ⚙️ 步骤 3：配置 A-Plan

### 3.1 添加 Provider Pool

编辑 `configs/provider-pools.json`，添加：

```json
{
  "id": "cloudflare-gateway-free",
  "name": "Cloudflare Gateway Free",
  "provider": "cloudflare-gateway-free",
  "baseUrl": "https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/{GATEWAY_ID}/workers-ai/run",
  "apiKey": "cfat_{YOUR_API_TOKEN}",
  "models": [
    {
      "id": "@cf/meta/llama-3.1-8b-instruct",
      "name": "Llama 3.1 8B",
      "active": true
    },
    {
      "id": "@cf/meta/llama-3.1-70b-instruct",
      "name": "Llama 3.1 70B",
      "active": true
    }
  ]
}
```

**替换占位符**:
- `{ACCOUNT_ID}` → 你的 Cloudflare 账户 ID
- `{GATEWAY_ID}` → 步骤 2 创建的 Gateway ID
- `{YOUR_API_TOKEN}` → 步骤 1 获取的 Token

### 3.2 设置默认 Provider（可选）

编辑 `configs/config.json`：

```json
{
  "MODEL_PROVIDER": "cloudflare-gateway-free"
}
```

### 3.3 配置自定义模型别名（可选）

编辑 `configs/custom_models.json`，添加：

```json
[
  {
    "id": "cf-llama-3.1-8b",
    "name": "Cloudflare Llama 3.1 8B",
    "alias": "llama-8b",
    "provider": "cloudflare-gateway-free",
    "actualModel": "@cf/meta/llama-3.1-8b-instruct"
  }
]
```

---

## 🧪 步骤 4：测试调用

### 测试 1：使用完整模型名

```bash
# 获取 Token
TOKEN=$(curl -s -X POST http://localhost:18781/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 调用 API
curl -X POST "http://localhost:18781/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "messages": [{"role": "user", "content": "你好，请自我介绍"}]
  }' | python3 -m json.tool
```

### 测试 2：使用自定义别名

```bash
curl -X POST "http://localhost:18781/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "llama-8b",
    "messages": [{"role": "user", "content": "1+1 等于几？"}]
  }' | python3 -m json.tool
```

**预期响应**:
```json
{
  "choices": [{
    "message": {
      "content": "1+1 等于 2。"
    }
  }]
}
```

---

## 📊 步骤 5：查看用量

### 方法 A：管理后台

1. 访问 `http://你的IP:18781`
2. 进入 **Usage Statistics** 页面
3. 查看 `cloudflare-gateway-free` 的调用次数

### 方法 B：API 查询

```bash
curl "http://localhost:18781/api/usage/cloudflare-gateway-free" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🎉 成功！

现在你可以：
- ✅ 使用 `llama-8b` 等短别名调用模型
- ✅ 每天 10,000 次免费调用
- ✅ 与其他提供商一起轮询负载均衡

---

## 🐛 常见问题

### Q1: `401 Unauthorized`

**原因**: API Token 无效或过期

**解决**:
1. 重新生成 Token
2. 检查 Token 权限（需要 Workers 编辑权限）
3. 确认 Token 格式正确（`cfat_` 开头）

---

### Q2: `Conversion error: No converter registered`

**原因**: 协议转换器未注册

**解决**:
1. 检查 `src/utils/constants.js` 是否有 `CLOUDFLARE: 'cloudflare'`
2. 检查 `src/converters/register-converters.js` 是否注册
3. 重启 A-Plan

---

### Q3: 模型路由错误

**原因**: 模型名前缀未识别

**解决**:
1. 设置默认 provider 为 `cloudflare-gateway-free`
2. 或使用显式前缀：`cloudflare-gateway-free:@cf/meta/llama-3.1-8b-instruct`
3. 或配置自定义模型别名

---

### Q4: Gateway 创建失败

**原因**: API 端点错误或权限不足

**解决**:
1. 确认端点是 `/ai-gateway/gateways`（不是 `/ai/gateways`）
2. 检查账户 ID 是否正确
3. 确认 Token 有足够权限

---

## 📚 参考资料

- [Cloudflare AI Gateway 文档](https://developers.cloudflare.com/ai-gateway/)
- [Workers AI 模型列表](https://developers.cloudflare.com/workers-ai/models/)
- [A-Plan 开发心得](DEVELOPMENT_NOTES.md)
- [完整集成教程](CLOUDFLARE-AI-GATEWAY-TUTORIAL.md)

---

**🎊 享受你的免费 AI 额度吧！**