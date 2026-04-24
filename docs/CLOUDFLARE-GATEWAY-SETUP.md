# Cloudflare AI Gateway 配置指南

> **文档版本**: v1.0  
> **更新日期**: 2026-04-23  
> **适用版本**: A-Plan v2.0+

---

## 📋 目录

1. [概述](#概述)
2. [前提条件](#前提条件)
3. [创建 API Token](#创建-api-token)
4. [在 A-Plan 中创建网关](#在-a-plan-中创建网关)
5. [使用网关](#使用网关)
6. [故障排除](#故障排除)
7. [常见问题](#常见问题)

---

## 概述

Cloudflare AI Gateway 是 A-Plan 平台集成的免费 AI 服务，提供以下优势：

- ✅ **免费额度**: 每天 10,000 次免费调用
- ✅ **多种模型**: 支持 Llama、Qwen、Gemma 等主流模型
- ✅ **无需翻墙**: 国内可直接访问
- ✅ **自动管理**: A-Plan 自动创建和配置网关

### 支持的模型

| 提供商 | 模型 | 标识符 |
|--------|------|--------|
| Meta | Llama 3.1 8B | `@cf/meta/llama-3.1-8b-instruct` |
| Meta | Llama 3.1 70B | `@cf/meta/llama-3.1-70b-instruct` |
| Alibaba | Qwen2.5 7B | `@cf/qwen/qwen2.5-7b-instruct` |
| Google | Gemma 2B | `@cf/google/gemma-2b-it-lora` |
| Microsoft | Phi-3 Mini | `@cf/microsoft/phi-3-mini-4k-instruct` |

**完整模型列表**: https://developers.cloudflare.com/workers-ai/models/

---

## 前提条件

在开始之前，你需要：

1. **Cloudflare 账户** - 注册地址：https://dash.cloudflare.com/sign-up
2. **Workers AI 已激活** - 首次使用需在 Dashboard 激活 Workers AI
3. **有效的 API Token** - 具有正确的权限（详见下文）

---

## 创建 API Token

### 步骤 1：访问 Token 管理页面

1. 登录 Cloudflare Dashboard
2. 点击右上角头像 → **My Profile**
3. 选择 **API Tokens** 标签页
4. 点击 **Create Token**

### 步骤 2：选择权限配置

**推荐方式**：使用自定义 Token

选择 **Custom Token**，点击 **Get started**

### 步骤 3：配置权限

#### 方案 A：最小权限（仅 Workers AI）

适用于只使用 Cloudflare Workers AI 模型的用户。

**Zone Resources**:
```
✅ AI Gateway → Edit
✅ AI → Use
```

**说明**：
- `AI Gateway → Edit`: 创建和管理网关配置
- `AI → Use`: 调用 Workers AI 模型（关键！）

#### 方案 B：完整权限（支持 BYOK）

适用于需要存储第三方 API 密钥（OpenAI、Anthropic 等）的高级用户。

**Zone Resources**:
```
✅ AI Gateway → Edit
✅ AI → Use
✅ Secrets Store → Edit
```

**Account Resources**（可选）:
```
✅ Account → Read
```

### 步骤 4：保存 Token

1. 点击 **Continue to summary**
2. 查看权限摘要
3. 点击 **Create Token**
4. **立即复制 Token**（只显示一次！）

**Token 格式**: 可能是 `cfut_` 或其他格式开头

---

## 在 A-Plan 中创建网关

### 步骤 1：访问网关管理

1. 登录 A-Plan 平台
2. 进入 **AI 服务管理** → **Cloudflare AI Gateway**

### 步骤 2：填写配置信息

| 字段 | 说明 | 示例 |
|------|------|------|
| 账户 ID | Cloudflare 账户 ID | `d2ceafd0f3ea906340c2f0872575569b` |
| API Token | 上一步创建的 Token | `cfut_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| 网关名称 | 自定义网关标识 | `a-plan-gateway` |

**如何获取账户 ID**：
1. 登录 Cloudflare Dashboard
2. 右侧边栏底部显示 **Account ID**
3. 或访问 https://api.cloudflare.com/client/v4/accounts 查看

### 步骤 3：创建网关

1. 点击 **创建网关** 按钮
2. 等待系统自动完成以下操作：
   - ✅ 验证 API Token
   - ✅ 验证账户 ID
   - ✅ 创建 Gateway 实例
   - ✅ 配置 Workers AI 路由
   - ✅ 设置认证模式

### 步骤 4：验证结果

创建成功后，你会看到：

```
✅ 网关创建成功！

网关 ID: a-plan-gateway
端点 URL: https://gateway.ai.cloudflare.com/v1/{account_id}/a-plan-gateway/openai
状态：已激活
```

---

## 使用网关

### 方式 1：通过 A-Plan 界面

1. 进入 **模型管理** → **添加模型**
2. 选择服务商：`Cloudflare Gateway (免费)`
3. 填写配置：
   - **API 密钥**: 任意非空字符串（如 `sk-cloudflare-auth`）
   - **模型名称**: `@cf/meta/llama-3.1-8b-instruct`
4. 点击 **测试连接**
5. 点击 **保存**

### 方式 2：通过 API 调用

```bash
curl -X POST "https://gateway.ai.cloudflare.com/v1/{account_id}/a-plan-gateway/openai/v1/chat/completions" \
  -H "Authorization: Bearer sk-any-key-works" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "messages": [
      {"role": "user", "content": "你好，请介绍一下你自己"}
    ],
    "max_tokens": 100
  }'
```

### 方式 3：在 A-Plan 代码中使用

```javascript
// configs/provider_pools.json
{
  "cloudflare-gateway-free": [
    {
      "uuid": "815c7a9a-09d2-4b91-a288-e8a2c13ee587",
      "name": "Cloudflare Gateway - a-plan-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/d2ceafd0f3ea906340c2f0872575569b/a-plan-gateway/openai",
      "apiKey": "sk-cloudflare-auth",
      "cfApiToken": "cfut_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "accountId": "d2ceafd0f3ea906340c2f0872575569b",
      "gatewayId": "a-plan-gateway"
    }
  ]
}
```

---

## 故障排除

### 错误 1: `Authentication error`

**现象**:
```json
{
  "errors": [{"code": 10000, "message": "Authentication error"}]
}
```

**原因**: API Token 缺少 `AI → Use` 权限

**解决方案**:
1. 检查 Token 权限是否包含 `AI → Use`
2. 如不包含，重新创建 Token 并添加此权限
3. 更新 A-Plan 中的 Token 配置

### 错误 2: `2009 Unauthorized`

**现象**:
```json
{
  "error": [{"code": 2009, "message": "Unauthorized"}]
}
```

**原因**: 网关路由未配置或配置错误

**解决方案**:
1. 验证网关是否已配置 Workers AI 路由
2. 检查路由的 `provider` 是否为 `workers_ai`
3. 重新创建网关

### 错误 3: `invalid_api_key`

**现象**:
```json
{
  "error": {
    "message": "Incorrect API key provided: xxx",
    "code": "invalid_api_key"
  }
}
```

**原因**: 
- 使用了 `cfut_` Token 作为调用凭证
- 或 Authorization 头格式不正确

**解决方案**:
- 调用网关时使用任意 `sk-` 格式的字符串作为 API Key
- 例如：`Authorization: Bearer sk-cloudflare-auth`

### 错误 4: 网关创建失败

**现象**: 点击创建后提示失败

**可能原因**:
1. Token 权限不足
2. 账户 ID 错误
3. 网络问题

**排查步骤**:
```bash
# 1. 验证 Token
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. 验证账户 ID
curl -X GET "https://api.cloudflare.com/client/v4/accounts" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. 检查网关列表
curl -X GET "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai-gateway/gateways" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 常见问题

### Q1: 为什么需要 `AI → Use` 权限？

**A**: Cloudflare 的权限系统中：
- `AI Gateway → Edit`: 管理网关配置（创建、删除、修改）
- `AI → Use`: 实际调用 Workers AI 模型

这是两个独立的权限，缺一不可。

### Q2: Token 创建后能修改权限吗？

**A**: **不能**。Cloudflare API Token 创建后无法修改权限，只能：
1. 删除旧 Token
2. 创建新 Token 并配置正确权限

### Q3: 网关的 `authentication: false` 是什么意思？

**A**: 这表示网关**不验证客户端的认证凭证**：
- ✅ 可以使用任意 `sk-` 格式的字符串作为 API Key
- ⚠️ 但网关仍需要 Workers AI 的后端权限（通过 Token 的 `AI → Use` 提供）

### Q4: 每天 10,000 次免费额度是全局的还是每个模型的？

**A**: **全局额度**。所有 Workers AI 模型共享每天 10,000 次调用。

### Q5: 如何查看剩余额度？

**A**: 登录 Cloudflare Dashboard → Workers & Pages → AI → 查看用量统计

### Q6: 支持哪些地区的访问？

**A**: Cloudflare AI Gateway 在全球都有节点，中国大陆用户可以正常访问。

### Q7: 可以多个应用共享一个网关吗？

**A**: **可以**。网关是账户级别的资源，多个应用可以使用同一个网关。

### Q8: 网关创建失败后能重试吗？

**A**: **可以**。检查权限和账户 ID 后，重新点击创建即可。

---

## 附录

### A. Cloudflare Dashboard 快速链接

| 功能 | 链接 |
|------|------|
| API Tokens | https://dash.cloudflare.com/profile/api-tokens |
| Account ID | https://dash.cloudflare.com/ |
| Workers AI | https://dash.cloudflare.com/?to=/:account/workers/ai |
| AI Gateway | https://dash.cloudflare.com/?to=/:account/ai/ai-gateway |

### B. API 参考文档

- [AI Gateway 概述](https://developers.cloudflare.com/ai-gateway/)
- [创建网关 API](https://developers.cloudflare.com/api/resources/ai_gateway/methods/create)
- [配置路由 API](https://developers.cloudflare.com/api/resources/ai_gateway/subresources/routes/methods/create)
- [Workers AI 模型列表](https://developers.cloudflare.com/workers-ai/models/)

### C. A-Plan 相关文档

- [AI 服务管理](./AI-SERVICES.md)
- [模型配置指南](./MODEL-CONFIG.md)
- [故障排除手册](./TROUBLESHOOTING.md)

---

## 更新日志

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v1.0 | 2026-04-23 | 初始版本 |

---

**需要帮助？** 请在 A-Plan 社区或 GitHub Issues 中提问。