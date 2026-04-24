# Cloudflare AI Gateway 一键创建功能 - 完整实现教程

> 📅 **最后更新**: 2026-04-23  
> ✅ **状态**: 已验证可用  
> 💰 **费用**: 免费（每月 10 万次请求）

---

## 📋 目录

1. [功能概述](#功能概述)
2. [前置准备](#前置准备)
3. [API 参数详解](#api-参数详解)
4. [前端实现](#前端实现)
5. [后端实现](#后端实现)
6. [错误处理](#错误处理)
7. [常见问题](#常见问题)
8. [参考资料](#参考资料)

---

## 🎯 功能概述

### 核心功能
- **一键创建**: 用户只需输入 Account ID、API Token 和 Gateway 名称，即可自动创建 Cloudflare AI Gateway
- **自动保存**: 创建成功后自动保存配置到 A-Plan 提供商列表
- **友好提示**: 完整的错误提示和成功引导

### 免费额度说明
- **核心功能免费**: 仪表板分析、缓存、速率限制全部免费
- **日志存储限额**: 
  - Workers Free 计划：所有网关共享 10 万条日志/月
  - Workers Paid 计划：每个网关独立 1000 万条日志/月
- **请求限额**: 每月 10 万次请求（所有网关共享）

---

## 🔧 前置准备

### 1. 获取 Cloudflare Account ID

**步骤**:
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 点击右侧账户名称 → **Account Profile**
3. 在 **Account Details** 页面找到 **Account ID**
4. 复制保存（32 位十六进制字符串）

### 2. 创建 API Token

**步骤**:
1. 登录 Cloudflare Dashboard
2. 点击右上角头像 → **My Profile**
3. 进入 **API Tokens** 标签页
4. 点击 **Create Token**
5. 选择 **Create Custom Token**
6. 配置权限：
   - **Account** → **AI Gateway** → **Write**
7. 点击 **Continue to summary**
8. 设置 Token 名称（如：`a-plan-gateway-creator`）
9. 点击 **Create Token**
10. **立即复制 Token**（只显示一次！）

### 3. Gateway 名称命名规则

| 约束项 | 要求 |
|--------|------|
| **长度** | 1-64 字符 |
| **字符集** | 小写字母 (a-z)、数字 (0-9)、连字符 (-)、下划线 (_) |
| **不支持** | 中文、空格、特殊符号、大写字母 |
| **唯一性** | 在同一 Cloudflare 账户内必须唯一 |

**✅ 正确示例**:
- `my-gateway`
- `cloudflare-free-gw`
- `ai_gateway_001`
- `test123`
- `cf-ai-gateway`

**❌ 错误示例**:
- `我的网关`（包含中文）
- `my gateway`（包含空格）
- `gateway@cloudflare`（包含特殊符号 @）
- `PLHYS`（包含大写字母）

---

## 📦 API 参数详解

### Cloudflare AI Gateway 创建 API

**端点**: `POST https://api.cloudflare.com/client/v4/accounts/{accountId}/ai-gateway/gateways`

**认证方式**:
```http
Authorization: Bearer {apiToken}
```

**请求体**（必需字段）:
```json
{
  "id": "my-gateway",
  "cache_ttl": 0,
  "cache_invalidate_on_update": false,
  "collect_logs": true,
  "rate_limiting_limit": 0,
  "rate_limiting_interval": 0
}
```

**参数说明**:

| 字段名 | 类型 | 默认值 | 约束 | 说明 |
|--------|------|--------|------|------|
| `id` | string | - | 1-64 字符 | **必需** - 网关标识符 |
| `cache_ttl` | number | 0 | ≥ 0 | 缓存生存时间（秒） |
| `cache_invalidate_on_update` | boolean | false | - | 更新时是否使缓存失效 |
| `collect_logs` | boolean | true | - | 是否收集日志 |
| `rate_limiting_limit` | number | 0 | ≥ 0 | 速率限制请求数上限 |
| `rate_limiting_interval` | number | 0 | ≥ 0 | 速率限制时间窗口（秒） |

**可选参数**:
- `authentication`: boolean - 是否启用认证
- `log_management`: number - 日志管理配额（10000-10000000）
- `retry_delay`: number - 重试延迟（毫秒，0-5000）
- `retry_max_attempts`: number - 最大重试次数（1-5）
- `retry_backoff`: string - 重试退避策略（"constant" / "linear" / "exponential"）

**成功响应**:
```json
{
  "success": true,
  "result": {
    "id": "my-gateway",
    "created_at": "2026-04-23 04:55:11",
    "modified_at": "2026-04-23 04:55:11",
    "rate_limiting_interval": 0,
    "rate_limiting_limit": 0,
    "collect_logs": true,
    "cache_ttl": 0,
    "cache_invalidate_on_update": false,
    "authentication": false
  }
}
```

**错误响应**:
```json
{
  "success": false,
  "errors": [
    {
      "code": 7001,
      "message": "An object with this id already exists"
    }
  ]
}
```

---

## 💻 前端实现

### 1. 模态框 HTML 结构

**文件**: `static/app/provider-manager.js`

```javascript
window.showCreateCloudflareGatewayModal = function(providerType) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3><i class="fas fa-magic"></i> 一键创建 Cloudflare AI Gateway</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div style="margin-bottom: 16px; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #166534; font-size: 14px;">
                    <i class="fas fa-info-circle"></i>
                    本功能将自动调用 Cloudflare API 为您创建 AI Gateway，每月免费 10 万次请求。
                </div>
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">
                        <i class="fas fa-id-card"></i> Account ID
                    </label>
                    <input type="text" id="cfAccountId" placeholder="请输入 Cloudflare Account ID" 
                           style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
                </div>
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">
                        <i class="fas fa-key"></i> API Token
                    </label>
                    <input type="password" id="cfApiToken" placeholder="请输入 Cloudflare API Token" 
                           style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
                    <small style="color: #666; display: block; margin-top: 5px;">
                        需要 <code>Account AI Gateway:Write</code> 权限
                    </small>
                </div>
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">
                        <i class="fas fa-network-wired"></i> Gateway 名称
                    </label>
                    <input type="text" id="cfGatewayName" placeholder="例如：a-plan-gateway" value="a-plan-gateway"
                           style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
                    <small style="color: #666; display: block; margin-top: 5px;">
                        只能使用小写字母、数字、连字符 (-)、下划线 (_)，长度 1-64 字符
                    </small>
                </div>
                <div id="createResult" style="display: none; margin-top: 15px; padding: 12px; border-radius: 6px;"></div>
            </div>
            <div class="modal-footer" style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" id="createCfGatewayBtn" style="flex: 1;">
                    <i class="fas fa-magic"></i> 立即创建
                </button>
                <button class="modal-cancel">取消</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 绑定事件...
}
```

### 2. 输入验证

```javascript
// 验证 Gateway 名称格式
const gatewayPattern = /^[a-z0-9_-]+$/;
if (!gatewayPattern.test(gatewayName)) {
    resultDiv.style.display = 'block';
    resultDiv.style.background = '#fef2f2';
    resultDiv.style.border = '1px solid #fca5a5';
    resultDiv.style.color = '#dc2626';
    resultDiv.innerHTML = `
        <i class="fas fa-exclamation-triangle"></i> 
        Gateway 名称格式无效，只能使用小写字母、数字、连字符 (-) 和下划线 (_)
    `;
    return;
}

// 验证长度
if (gatewayName.length < 1 || gatewayName.length > 64) {
    resultDiv.style.display = 'block';
    resultDiv.style.background = '#fef2f2';
    resultDiv.style.border = '1px solid #fca5a5';
    resultDiv.style.color = '#dc2626';
    resultDiv.innerHTML = `
        <i class="fas fa-exclamation-circle"></i> 
        Gateway 名称长度必须在 1-64 个字符之间
    `;
    return;
}
```

### 3. UUID 生成函数

```javascript
// Generate UUID helper function
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
```

### 4. API 调用与自动保存

```javascript
createBtn.onclick = async () => {
    const accountId = modal.querySelector('#cfAccountId').value.trim();
    const apiToken = modal.querySelector('#cfApiToken').value.trim();
    const gatewayName = modal.querySelector('#cfGatewayName').value.trim().toLowerCase();
    
    // 验证输入...
    
    createBtn.disabled = true;
    createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 创建中...';
    resultDiv.style.display = 'none';
    
    try {
        // 1. 调用 API 创建 Cloudflare AI Gateway
        const result = await window.apiClient.post('/cloudflare-gateway/create', { 
            accountId, 
            apiToken, 
            gatewayName 
        });
        
        if (result.success) {
            // 2. 显示成功信息
            resultDiv.style.display = 'block';
            resultDiv.style.background = '#f0fdf4';
            resultDiv.style.border = '1px solid #86efac';
            resultDiv.style.color = '#166534';
            
            const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${accountId}/${result.gateway?.id || gatewayName}/openai`;
            
            resultDiv.innerHTML = `
                <i class="fas fa-check-circle"></i> 
                Gateway 创建成功！名称：<strong>${result.gateway?.id || gatewayName}</strong>
                <br><br>
                <div style="background: #fff; padding: 12px; border-radius: 6px; margin-top: 10px;">
                    <p style="margin: 0 0 8px 0; font-weight: 600;">
                        <i class="fas fa-link"></i> 网关地址：
                    </p>
                    <code style="display: block; background: #f3f4f6; padding: 8px; border-radius: 4px; word-break: break-all;">
                        ${gatewayUrl}
                    </code>
                </div>
                <div style="margin-top: 10px; padding: 10px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; color: #1e40af; font-size: 13px;">
                    <i class="fas fa-info-circle"></i> 
                    <strong>自动保存说明：</strong>系统已自动为您保存配置到提供商列表。
                    <br>请刷新页面，然后在 <strong>"Cloudflare AI Gateway (免费)"</strong> 分组中查看。
                </div>
            `;
            
            // 3. 自动保存配置到 A-Plan
            const providerConfig = {
                uuid: generateUUID(),
                name: `Cloudflare Gateway - ${result.gateway?.id || gatewayName}`,
                baseUrl: gatewayUrl,
                apiKey: apiToken,
                accountId: accountId,
                gatewayId: result.gateway?.id || gatewayName
            };
            
            // 注意格式：{ providerType, providerConfig }
            window.apiClient.post('/providers', {
                providerType: 'cloudflare-gateway-free',
                providerConfig: providerConfig
            })
                .then((saveResult) => {
                    console.log('✅ 配置已自动保存到 A-Plan:', providerConfig);
                    console.log('保存结果:', saveResult);
                })
                .catch(err => {
                    console.error('❌ 保存配置失败:', err);
                });
            
            // 4. 3 秒后关闭模态框并刷新页面
            setTimeout(() => {
                modal.remove();
                showToast('Gateway 创建成功', '配置已自动保存，请刷新页面查看', 'success');
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            }, 3000);
        } else {
            throw new Error(result.error?.message || '验证失败');
        }
    } catch (error) {
        // 5. 错误处理
        resultDiv.style.display = 'block';
        resultDiv.style.background = '#fef2f2';
        resultDiv.style.border = '1px solid #fca5a5';
        resultDiv.style.color = '#dc2626';
        
        // 特殊处理"对象已存在"错误
        if (error.message && error.message.includes('already exists')) {
            resultDiv.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i> 
                Gateway 名称 "<strong>${gatewayName}</strong>" 已存在，请使用其他名称重试。<br><br>
                <small>💡 提示：您可以在 Cloudflare Dashboard → AI Gateway 查看已有的网关</small>
            `;
        } else {
            resultDiv.innerHTML = `<i class="fas fa-times-circle"></i> ${error.message}`;
        }
        
        createBtn.disabled = false;
        createBtn.innerHTML = '<i class="fas fa-magic"></i> 立即创建';
    }
};
```

---

## 🔧 后端实现

### 1. 路由注册

**文件**: `src/services/ui-manager.js`

```javascript
// Create Cloudflare AI Gateway
if (method === 'POST' && pathParam === '/api/cloudflare-gateway/create') {
    return await providerApi.handleCreateCloudflareGateway(req, res, currentConfig);
}
```

### 2. 创建 Gateway 处理函数

**文件**: `src/ui-modules/provider-api.js`

```javascript
export async function handleCreateCloudflareGateway(req, res, currentConfig) {
    try {
        const body = await getRequestBody(req);
        const { accountId, apiToken, gatewayName } = body;

        if (!accountId || !apiToken || !gatewayName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: '缺少必要参数' } }));
            return true;
        }

        logger.info(`[Cloudflare Gateway] 正在创建 Gateway: ${gatewayName} for account: ${accountId}`);

        // 1. 验证 API Token
        logger.info('[Cloudflare Gateway] 验证 API Token 中...');
        const verifyResponse = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            }
        });

        const verifyResult = await verifyResponse.json();

        if (!verifyResult.success) {
            logger.error(`[Cloudflare Gateway] API Token 验证失败`);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: { 
                    message: 'API Token 无效',
                    details: verifyResult.errors 
                } 
            }));
            return true;
        }

        logger.info(`[Cloudflare Gateway] Token 验证结果：${JSON.stringify(verifyResult)}`);

        // 2. 验证账户 ID（可选但推荐）
        logger.info('[Cloudflare Gateway] 获取账户信息中...');
        const accountsResponse = await fetch('https://api.cloudflare.com/client/v4/accounts', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            }
        });

        const accountsResult = await accountsResponse.json();

        if (accountsResult.success && Array.isArray(accountsResult.result)) {
            const accountExists = accountsResult.result.some(acc => acc.id === accountId);
            if (!accountExists) {
                logger.error(`[Cloudflare Gateway] 账户 ID 验证失败`);
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    error: { 
                        message: `API Token 无权访问指定的账户`,
                        details: {
                            availableAccountsCount: accountsResult.result.length,
                            availableAccounts: accountsResult.result.map(a => ({ id: a.id, name: a.name }))
                        }
                    } 
                }));
                return true;
            }
            logger.info(`[Cloudflare Gateway] 账户 ID 验证通过`);
        }

        // 3. 调用 Cloudflare API 创建 Gateway
        const requestBody = {
            id: gatewayName,
            cache_ttl: 0,
            cache_invalidate_on_update: false,
            collect_logs: true,
            rate_limiting_limit: 0,
            rate_limiting_interval: 0
        };
        
        logger.info(`[Cloudflare Gateway] 正在调用 Cloudflare API 创建 Gateway...`);
        logger.info(`[Cloudflare Gateway] 请求体：${JSON.stringify(requestBody)}`);
        
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-gateway/gateways`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            },
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();

        if (!response.ok) {
            logger.error(`[Cloudflare Gateway] 创建失败：${JSON.stringify(result)}`);
            res.writeHead(response.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: { 
                    message: result.errors?.[0]?.message || '创建 Gateway 失败',
                    details: result
                } 
            }));
            return true;
        }

        logger.info(`[Cloudflare Gateway] 创建成功：${gatewayName}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: 'Gateway 创建成功',
            gateway: {
                id: result.result.id,
                name: result.result.name,
                accountId: accountId
            }
        }));
        return true;
    } catch (error) {
        logger.error(`[Cloudflare Gateway] 创建异常：${error.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}
```

---

## ⚠️ 错误处理

### 常见错误及解决方案

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `Unauthorized access, please login first` | API Token 无效或过期 | 重新创建 API Token，确保有 `AI Gateway Write` 权限 |
| `API Token 无权访问指定的账户` | Account ID 与 Token 不匹配 | 检查 Account ID 是否正确，或 Token 是否属于该账户 |
| `not valid ID format` | Gateway 名称格式错误 | 只能使用小写字母、数字、连字符、下划线 |
| `An object with this id already exists` | Gateway 名称已存在 | 使用其他名称，或在 Dashboard 删除已有网关 |
| `Expected number, received nan` | 数值参数缺失或不是数字 | 确保所有数值字段（`cache_ttl`, `rate_limiting_limit`, `rate_limiting_interval`）都提供且为数字 |
| `Required` | 必需字段缺失 | 确保提供 `collect_logs` 和 `cache_invalidate_on_update` 字段 |

### 前端错误处理示例

```javascript
try {
    const result = await window.apiClient.post('/cloudflare-gateway/create', { 
        accountId, 
        apiToken, 
        gatewayName 
    });
    // 处理成功...
} catch (error) {
    resultDiv.style.display = 'block';
    resultDiv.style.background = '#fef2f2';
    resultDiv.style.border = '1px solid #fca5a5';
    resultDiv.style.color = '#dc2626';
    
    // 特殊处理"对象已存在"错误
    if (error.message && error.message.includes('already exists')) {
        resultDiv.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i> 
            Gateway 名称 "<strong>${gatewayName}</strong>" 已存在，请使用其他名称重试。<br><br>
            <small>💡 提示：您可以在 Cloudflare Dashboard → AI Gateway 查看已有的网关</small>
        `;
    } else {
        resultDiv.innerHTML = `<i class="fas fa-times-circle"></i> ${error.message}`;
    }
    
    createBtn.disabled = false;
    createBtn.innerHTML = '<i class="fas fa-magic"></i> 立即创建';
}
```

---

## ❓ 常见问题

### Q1: 免费额度是如何计算的？
**A**: 
- **请求限额**: 每月 10 万次请求（所有网关共享）
- **日志存储**: Workers Free 计划下所有网关共享 10 万条日志
- **核心功能**: 仪表板分析、缓存、速率限制全部免费

### Q2: Gateway ID 可以修改吗？
**A**: 不可以。Gateway ID 在创建后无法修改，只能删除后重新创建。

### Q3: 如何删除已创建的 Gateway？
**A**: 
1. 登录 Cloudflare Dashboard
2. 进入 **AI Gateway** 页面
3. 点击要删除的网关
4. 点击 **Settings** → **Delete Gateway**

### Q4: API Token 安全吗？
**A**: 
- API Token 只存储在本地配置文件中
- 建议使用自定义 Token，只授予 `AI Gateway Write` 权限
- 不要共享 Token，泄露后可随时在 Dashboard 撤销

### Q5: 创建失败后会自动重试吗？
**A**: 不会。创建失败时需要手动检查错误原因并重新尝试。

### Q6: 网关地址的格式是什么？
**A**: 
```
https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayId}/openai
```
例如：
```
https://gateway.ai.cloudflare.com/v1/d2ceafd0f3ea906340c2f0872575569b/my-gateway/openai
```

---

## 📚 参考资料

### 官方文档
- [Create a new Gateway | Cloudflare API](https://developers.cloudflare.com/api/resources/ai_gateway/methods/create/)
- [Pricing · Cloudflare AI Gateway docs](https://developers.cloudflare.com/ai-gateway/reference/pricing/)
- [Troubleshooting · Cloudflare AI Gateway docs](https://developers.cloudflare.com/ai-gateway/reference/troubleshooting/)
- [AI Gateway Documentation](https://developers.cloudflare.com/ai-gateway/)

### API 端点
- **创建 Gateway**: `POST /accounts/{accountId}/ai-gateway/gateways`
- **验证 Token**: `GET /user/tokens/verify`
- **获取账户列表**: `GET /accounts`

### 代码文件位置
- **前端模态框**: `static/app/provider-manager.js`
- **后端 API 处理**: `src/ui-modules/provider-api.js`
- **路由注册**: `src/services/ui-manager.js`

---

## 🎉 总结

### 实现要点
1. ✅ **前端验证**: Gateway 名称格式、长度验证
2. ✅ **后端验证**: API Token 有效性、Account ID 权限
3. ✅ **完整请求体**: 包含所有必需字段（6 个）
4. ✅ **错误处理**: 友好的错误提示和解决方案
5. ✅ **自动保存**: 创建成功后自动保存到提供商列表
6. ✅ **用户引导**: 成功后显示网关地址和刷新提示

### 关键参数
```javascript
const requestBody = {
    id: gatewayName,                    // 必需：网关 ID
    cache_ttl: 0,                       // 必需：缓存 TTL
    cache_invalidate_on_update: false,  // 必需：更新时缓存失效
    collect_logs: true,                 // 必需：收集日志
    rate_limiting_limit: 0,             // 必需：速率限制
    rate_limiting_interval: 0           // 必需：速率限制间隔
};
```

### 保存配置格式
```javascript
{
    providerType: 'cloudflare-gateway-free',
    providerConfig: {
        uuid: 'xxx-xxx-xxx',
        name: 'Cloudflare Gateway - xxx',
        baseUrl: 'https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayId}/openai',
        apiKey: 'api-token',
        accountId: 'account-id',
        gatewayId: 'gateway-id'
    }
}
```

---

**🎊 教程完成！** 按照此文档实现即可完美集成 Cloudflare AI Gateway 一键创建功能。
---

## 🎨 配置页面优化（2026-04-23 更新）

### 优化内容

#### 1️⃣ **关键字段锁定**
创建 Gateway 后，以下字段将被**锁定**（不可修改）：
- **CF_ACCOUNT_ID** - Cloudflare Account ID
- **CF_GATEWAY_NAME** - Gateway 名称
- **CF_API_TOKEN** - API Token

**锁定标识**: 字段标签旁显示 🔒 图标，鼠标悬停显示"此字段创建后不可修改"

**原因**: 
- 这些字段是 Gateway 的核心标识，修改会导致 Gateway 无法使用
- 如需修改，请删除当前配置后重新创建

#### 2️⃣ **清理无用字段**
已隐藏的内部状态字段（不再显示在编辑界面）：
- `isHealthy` - 健康状态（系统自动管理）
- `lastUsed` - 最后使用时间
- `usageCount` - 使用次数
- `errorCount` - 错误次数
- `lastErrorTime` - 最后错误时间
- `uuid` - 唯一标识符
- `supportedModels` - 支持的模型列表
- `notSupportedModels` - 不支持的模型列表

**保留的有用字段**:
- `customName` - 自定义名称
- `checkModelName` - 检查模型名称
- `checkHealth` - 健康检查开关
- `concurrencyLimit` - 并发限制
- `queueLimit` - 队列限制
- `baseUrl` - 网关地址（只读）
- `apiKey` - API 密钥（密码形式显示）

#### 3️⃣ **字段显示顺序优化**
```javascript
// 基础字段优先显示
const baseFields = [
    'customName',        // 自定义名称
    'checkModelName',    // 检查模型
    'checkHealth',       // 健康检查
    'concurrencyLimit',  // 并发限制
    'queueLimit'         // 队列限制
];

// 其他字段按顺序显示
const otherFields = fieldOrder.filter(key => !baseFields.includes(key));
```

### 代码位置

**文件**: `/root/a-plan/static/app/modal.js`

**关键函数**:
```javascript
function renderProviderConfig(provider) {
    // 特殊处理：Cloudflare Gateway 类型需要锁定关键字段
    const isCloudflareGateway = (currentProviderType === 'cloudflare-gateway-free' || currentProviderType === 'cloudflare-gateway-proxy');
    const lockedFields = isCloudflareGateway ? ['CF_ACCOUNT_ID', 'CF_GATEWAY_NAME', 'CF_API_TOKEN'] : [];
    
    // 渲染时为锁定字段添加锁图标
    const isField1Locked = isCloudflareGateway && lockedFields.includes(field1Key);
    const field1Help = isField1Locked 
        ? '<i class="fas fa-lock" title="此字段创建后不可修改"></i>' 
        : '';
}
```

### 用户体验提升

**优化前**:
- ❌ 所有字段混杂显示，找不到重点
- ❌ 内部状态字段占用大量空间
- ❌ 不知道哪些字段可以修改

**优化后**:
- ✅ 关键字段锁定，防止误操作
- ✅ 隐藏无用字段，界面清爽
- ✅ 锁定字段显示 🔒 图标，一目了然

---


---

## ⚠️ 避坑指南（2026-04-23 实战总结）

### 🔥 血泪教训：Gateway 创建后的配置坑

#### 坑 1️⃣：Gateway 默认需要认证

**现象**：创建 Gateway 后调用 API 返回 401 Unauthorized

**原因**：Gateway 创建后默认 `authentication: true`，需要有效的 OpenAI API Key

**解决方案**：
```bash
# 禁用 Gateway 认证
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/{accountId}/ai-gateway/gateways/{gatewayId}" \
  -H "Authorization: Bearer {apiToken}" \
  -d '{
    "authentication": false
  }'
```

---

#### 坑 2️⃣：API 端点格式错误

**错误端点**：`/ai/gateways`、`/ai-gateway/gateways/{id}/routes`

**正确端点**：
- ✅ `POST /accounts/{id}/ai-gateway/gateways` - 创建 Gateway
- ✅ `GET /accounts/{id}/ai-gateway/gateways` - 获取 Gateway 列表
- ✅ `PUT /accounts/{id}/ai-gateway/gateways/{id}` - 更新 Gateway

**注意**：Gateway 管理 API **没有** `/routes` 端点，路由配置需要在 Dashboard 手动或使用 Workers AI 原生端点

---

#### 坑 3️⃣：两种端点混用

| 端点 | 用途 | 认证方式 | 响应格式 |
|------|------|----------|----------|
| `/openai` | OpenAI 兼容格式 | 需要 OpenAI API Key | OpenAI 格式 |
| `/workers-ai/run/` | Workers AI 原生格式 | Cloudflare API Token | Workers AI 格式 |

**正确配置**：
```javascript
// ✅ 使用 /workers-ai/run 端点
baseUrl: "https://gateway.ai.cloudflare.com/v1/{id}/gateway/workers-ai/run"
apiKey: "cfat_xxx" // Cloudflare API Token
```

---

#### 坑 4️⃣：Workers AI API 格式与 OpenAI 不同

**OpenAI 格式**：
```json
{
  "choices": [{"message": {"content": "Hello!"}}]
}
```

**Workers AI 格式**：
```json
{
  "result": {
    "response": "Hello!"
  },
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 5,
    "total_tokens": 15
  }
}
```

**关键区别**：Workers AI 响应在 `result.response` 而不是 `choices[0].message.content`

**A-Plan 的解决方案**：

创建了专用的 Workers AI 适配器（`/src/providers/workersai/workersai-adapter.js`）来自动转换响应格式：

```javascript
// WorkersAIApiService.transformResponse()
transformResponse(workersAiResponse) {
    const { result, usage } = workersAiResponse;
    const responseText = result.response || result.text || '';
    
    // 转换为 OpenAI 聊天完成格式
    return {
        id: `workersai-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: result.model || 'unknown',
        choices: [
            {
                index: 0,
                message: { role: 'assistant', content: responseText },
                finish_reason: 'stop'
            }
        ],
        usage: usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };
}
```

**适配器注册**：
```javascript
// src/providers/adapter.js
registerAdapter(MODEL_PROVIDER.CLOUDFLARE_GATEWAY_FREE, WorkersAIApiServiceAdapter);
```

这样 A-Plan 就可以透明地使用 Workers AI 免费额度，无需修改上层代码。

---

### 📋 完整配置检查清单

#### ✅ Gateway 创建后必须执行的步骤

**步骤 1：禁用认证**
```bash
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/{accountId}/ai-gateway/gateways/{gatewayId}" \
  -d '{"authentication": false}'
```

**步骤 2：验证 Gateway 配置**
```bash
curl -X GET "https://api.cloudflare.com/client/v4/accounts/{accountId}/ai-gateway/gateways/{gatewayId}"
# 确认 "authentication": false
```

**步骤 3：更新 A-Plan 配置**
```json
{
  "baseUrl": "https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayId}/workers-ai/run",
  "apiKey": "cfat_{your-api-token}",
  "cfApiToken": "cfat_{your-api-token}",
  "accountId": "{your-account-id}",
  "gatewayId": "{your-gateway-id}"
}
```

**步骤 4：测试调用**
```bash
curl -X POST "https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayId}/workers-ai/run/@cf/meta/llama-3.1-8b-instruct" \
  -H "Authorization: Bearer {apiToken}" \
  -d '{"messages": [{"role": "user", "content": "Hi"}], "max_tokens": 10}'
```

---

### 🎯 快速排错表

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `401 Unauthorized` | Gateway 需要认证 | 禁用认证或提供有效 API Key |
| `404 Not Found` | API 端点错误 | 使用 `/ai-gateway/gateways` 不是 `/ai/gateways` |
| `Incorrect API key provided` | API Key 格式错误 | `/openai` 端点需要 OpenAI Key，`/workers-ai/run` 需要 Cloudflare Token |
| `An object with this id already exists` | Gateway 名称已存在 | 使用其他名称或先删除已有 Gateway |
| `Expected number, received nan` | 更新 Gateway 时缺少必需字段 | 提供所有 6 个必需字段 |
| `No converter registered for protocol: cloudflare` | A-Plan 内部协议转换错误 | 使用 `/workers-ai/run` 端点而不是 `/openai` |

---

### 💡 最佳实践建议

1. **创建 Gateway 后立即禁用认证** - 避免复杂认证逻辑
2. **使用 `/workers-ai/run` 端点** - 直接使用 Workers AI 原生格式
3. **保存完整的配置信息** - 包含 accountId、gatewayId、apiToken、baseUrl
4. **测试时使用正确的模型格式** - `@cf/meta/llama-3.1-8b-instruct`（带 `@cf/` 前缀）
5. **定期检查免费额度使用情况** - Dashboard → AI Gateway → Analytics

---

### 🔧 Workers AI 适配器实现

为了让 Cloudflare Workers AI 与 A-Plan 完美集成，我们创建了专用的 Workers AI 适配器：

#### 文件结构
```
/root/a-plan/src/providers/workersai/
├── workersai-core.js      # Workers AI API 服务核心实现
└── workersai-adapter.js   # Workers AI 适配器（实现 A-Plan 适配器接口）
```

#### 核心功能

**1. 响应格式转换** (`workersai-core.js:148-173`)
```javascript
transformResponse(workersAiResponse) {
    const { result, usage } = workersAiResponse;
    const responseText = result.response || result.text || '';
    
    // 转换为 OpenAI 聊天完成格式
    return {
        id: `workersai-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: result.model || 'unknown',
        choices: [
            {
                index: 0,
                message: { role: 'assistant', content: responseText },
                finish_reason: 'stop'
            }
        ],
        usage: usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };
}
```

**2. 请求格式转换** (`workersai-core.js:203-218`)
```javascript
transformRequest(openAiBody) {
    const messages = openAiBody.messages || [];
    const maxTokens = openAiBody.max_tokens || openAiBody.max_completion_tokens || 1024;
    const temperature = openAiBody.temperature ?? 0.7;
    
    // Workers AI 格式
    return {
        messages,
        max_tokens: maxTokens,
        temperature
    };
}
```

**3. 适配器注册** (`adapter.js:348-350`)
```javascript
registerAdapter(MODEL_PROVIDER.CLOUDFLARE_GATEWAY_FREE, WorkersAIApiServiceAdapter);
```

#### 支持的 Workers AI 模型

适配器预定义了以下 Workers AI 模型：

| 模型 ID | 提供商 | 类型 |
|--------|--------|------|
| `@cf/meta/llama-3.1-8b-instruct` | Meta | 文本生成 |
| `@cf/meta/llama-3.1-70b-instruct` | Meta | 文本生成 |
| `@cf/meta/llama-3.2-1b-instruct` | Meta | 轻量文本 |
| `@cf/meta/llama-3.2-3b-instruct` | Meta | 轻量文本 |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Meta | 高性能 |
| `@cf/mistral/mistral-7b-instruct-v0.1` | Mistral | 文本生成 |
| `@cf/baai/bge-base-en-v1.5` | BAAI | 向量嵌入 |
| `@cf/baai/bge-large-en-v1.5` | BAAI | 向量嵌入 |

---

### 🧪 聊天功能测试

#### 方法 1：使用 A-Plan UI

1. **打开 A-Plan 管理界面**
   - 访问：`http://localhost:18781`

2. **进入提供商管理**
   - 点击左侧菜单 "提供商" → "提供商池管理"

3. **编辑 Cloudflare Gateway 配置**
   - 找到 "Cloudflare Gateway - a-plan-gateway"
   - 点击 "编辑" 按钮

4. **设置检查模型**
   - 在 "检查模型名称" 字段输入：`@cf/meta/llama-3.1-8b-instruct`
   - 点击 "保存"

5. **检测可用模型**
   - 点击 "检测模型" 按钮
   - 应该看到 8 个可用模型

6. **开始聊天**
   - 返回聊天界面
   - 选择 "Cloudflare Gateway (免费)" 提供商
   - 选择模型：`@cf/meta/llama-3.1-8b-instruct`
   - 发送消息测试

#### 方法 2：使用 curl 测试

```bash
# 直接调用 Workers AI
curl -X POST "https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT_ID/a-plan-gateway/workers-ai/run/@cf/meta/llama-3.1-8b-instruct" \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好，请用中文简短回答：1+1 等于几？"}
    ],
    "max_tokens": 50
  }'

# 预期响应：
# {"result": {"response": "1+1 等于 2。"}, "usage": {...}}
```

#### 预期结果

✅ **成功标志**：
- 模型检测显示 8 个可用模型
- 聊天响应快速（<3 秒）
- 响应格式正确（中文回答）
- 无错误日志

❌ **失败排查**：
- 如果看到 `401 Unauthorized`：检查 Gateway 认证设置
- 如果看到 `404 Not Found`：检查 baseUrl 配置
- 如果看到 `No converter registered`：确保使用最新代码
- 如果响应为空：检查模型名称格式（需要 `@cf/` 前缀）

---

**🎊 教程完成！按照此文档实现即可完美集成 Cloudflare AI Gateway，避开所有坑！**
