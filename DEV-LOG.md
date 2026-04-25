# A-Plan v5.0.2 项目架构分析日志
## 创建时间：2025-01-XX
## 项目定位：AI API 统一网关

---

## 🏆 稳定基线版本 (Gold Baseline)

> **版本号**: v5.0.2-2  
> **标记时间**: 2025-04-24 12:46  
> **状态**: ✅ 已通过验证，可作为回滚基准

### 基线特性
| 特性 | 状态 |
|------|------|
| 前端显示 | ✅ 显示3个提供商卡片（OpenAI Custom、CF Gateway免费、CF Gateway代理） |
| 添加功能 | ✅ 支持添加全部12种提供商类型 |
| 后端API | ✅ `/api/providers/supported` 返回全部11种 MODEL_PROVIDER |
| 服务健康 | ✅ `curl localhost:18781/health` 正常 |

### 一键回滚
```bash
# 方式1: 运行回滚脚本
bash /data/workspace/a-plan/rollback-to-stable-v5.0.2-2.sh

# 方式2: 手动复制
STABLE_DIR="/data/workspace/a-plan/stable-baseline-v5.0.2-2"
TARGET_DIR="/data/workspace/projects/a-plan"
cp "$STABLE_DIR/provider-manager.js" "$TARGET_DIR/static/app/"
cp "$STABLE_DIR/utils.js" "$TARGET_DIR/static/app/"
cp "$STABLE_DIR/provider-api.js" "$TARGET_DIR/src/ui-modules/"

# 刷新页面: Ctrl+F5
```

### 基线文件校验
备份目录: `/data/workspace/a-plan/stable-baseline-v5.0.2-2/`

| 文件 | 大小 | 路径 |
|------|------|------|
| provider-manager.js | 178,237 bytes | `static/app/` |
| utils.js | 10,131 bytes | `static/app/` |
| provider-api.js | 81,012 bytes | `src/ui-modules/` |

---

## 修改记录

### 5.0.2-2 (2025-04-24 12:33)

**修复内容**：修复前端仍然只显示 OpenAI Custom 的问题，后端API未返回所有支持的提供商类型

| 项目 | 内容 |
|------|------|
| **修改文件** | `src/ui-modules/provider-api.js` |
| **修改位置** | 第13行、第245行、第288行、第329行、第348行 |
| **原状态** | `handleGetProviders()` 和 `handleGetSupportedProviders()` 只返回 `getRegisteredProviders()`（仅3种已注册适配器） |
| **修改后** | 导入 `MODEL_PROVIDER` 常量，返回所有11种支持的提供商类型 |
| **修改原因** | 前端调用 `/api/providers` 和 `/api/providers/supported` 仅得到3种，导致只有 OpenAI Custom 显示 |
| **影响范围** | 后端API返回的 supportedProviders 列表，前端渲染时匹配 `getBaseProviderConfigs()` |
| **测试结果** | ✅ **已通过** - 前端成功显示全部12种提供商（OpenAI Custom、Gemini API、Claude Custom、Grok Custom、Cloudflare Gateway等） |
| **回滚方案** | `cp src/ui-modules/provider-api.js.backup-20260424-123304 src/ui-modules/provider-api.js` |
| **代码审查** | 服务健康检查正常，API响应包含全部提供商类型 |

**修改差异**：
```diff
+ import { MODEL_PROVIDER } from '../utils/common.js';

  export async function handleGetProviders(...) {
      const registeredProviders = getRegisteredProviders();
+     const allModelProviders = Object.values(MODEL_PROVIDER);
      ...
-     const supportedProviders = [...new Set([...registeredProviders, ...poolTypes])];
+     const supportedProviders = [...new Set([...registeredProviders, ...allModelProviders, ...poolTypes])];
  }

  export async function handleGetSupportedProviders(...) {
      ...
+     const allModelProviders = Object.values(MODEL_PROVIDER);
      ...
-     const supportedProviders = [...new Set([...registeredProviders, ...poolTypes])];
+     const supportedProviders = [...new Set([...registeredProviders, ...allModelProviders, ...poolTypes])];
  }
```

**同时修复**：
| 项目 | 内容 |
|------|------|
| **修改文件** | `static/app/utils.js` |
| **修改位置** | `getBaseProviderConfigs()` 函数 |
| **原状态** | 只返回 `openai-custom` 一个基础配置 |
| **修改后** | 返回全部12种（添加 gemini-api-key, claude-custom, grok-custom 等11种） |
| **备份文件** | `static/app/utils.js.backup-20260424-122708` |
| **测试结果** | ✅ 通过 - 前端渲染时正确匹配所有提供商基础配置 |

---

### 5.0.2-1 (2025-04-24 12:23)

**修复内容**：修复前端只允许添加3种提供商类型的问题，扩展到全部12种支持类型

| 项目 | 内容 |
|------|------|
| **修改文件** | `static/app/provider-manager.js` |
| **修改位置** | 第746行、第3696行 |
| **原状态** | `allowedTypes` 仅包含3种：`['openai-custom', 'cloudflare-gateway-free', 'cloudflare-gateway-proxy']` |
| **修改后** | 扩展为12种全部类型，添加：`gemini-api-key`, `openaiResponses-custom`, `claude-custom`, `forward-api`, `grok-custom`, `nvidia-nim`, `groq-api`, `sambanova-api`, `github-models` |
| **修改原因** | 前端UI白名单限制导致用户无法添加Claude、Gemini、Grok等提供商 |
| **影响范围** | `generateAddGroupButton()` 函数和 `showAddProviderGroupModal()` 函数中的下拉菜单筛选逻辑 |
| **测试结果** | ✅ 服务正常 (`curl localhost:18781/health` 返回 `{"status":"healthy"}`) |
| **回滚方案** | `cd /data/workspace/projects/a-plan && cp static/app/provider-manager.js.backup-20260424-122342 static/app/provider-manager.js` |

**修改差异**：
```diff
- const allowedTypes = ['openai-custom', 'cloudflare-gateway-free', 'cloudflare-gateway-proxy'];
+ const allowedTypes = [
+     'gemini-api-key',
+     'openai-custom',
+     'openaiResponses-custom',
+     'claude-custom',
+     'forward-api',
+     'grok-custom',
+     'nvidia-nim',
+     'groq-api',
+     'sambanova-api',
+     'github-models',
+     'cloudflare-gateway-free',
+     'cloudflare-gateway-proxy'
+ ];
```

---

## 一、项目整体架构

### 1.1 核心组成
```
A-Plan/
├── src/
│   ├── core/               # 主进程管理
│   │   └── master.js       # Master Process，管理子进程生命周期
│   ├── providers/          # 提供商适配系统
│   │   ├── adapter.js      # 适配器注册中心
│   │   ├── provider-pool-manager.js  # 提供商池管理（健康检查、轮询）
│   │   ├── provider-models.js        # 模型配置管理
│   │   ├── gemini/         # Gemini 适配器
│   │   ├── openai/         # OpenAI/兼容适配器
│   │   ├── claude/         # Claude 适配器
│   │   ├── grok/           # Grok 适配器
│   │   ├── workersai/      # Cloudflare Workers AI 适配器
│   │   └── ...
│   ├── services/           # API服务层
│   │   └── service-manager.js  # 服务路由、Fallback链
│   ├── ui-modules/         # UI接口模块
│   └── utils/              # 工具函数
├── static/app/             # 前端管理界面
│   └── provider-manager.js # 提供商管理页面（含限制逻辑）
└── configs/                # 配置文件
    ├── provider_pools.json # 提供商池配置
    ├── config.json         # 主配置
    └── ...
```

---

## 二、提供商系统详析

### 2.1 支持的11种提供商类型 (MODEL_PROVIDER)

| 标识符 | 适配器类 | 默认健康检查模型 | 说明 |
|--------|----------|-----------------|------|
| `gemini-api-key` | GeminiApiKeyService | gemini-2.5-flash | Google Gemini 官方API |
| `openai-custom` | OpenAIApiService | gpt-4o-mini | OpenAI 及兼容服务 |
| `openaiResponses-custom` | OpenAIResponsesApiService | gpt-4o-mini | OpenAI Responses API |
| `claude-custom` | ClaudeApiService | claude-3-7-sonnet-20250219 | Anthropic Claude |
| `forward-api` | ForwardApiService | gpt-4o-mini | 透传代理模式 |
| `grok-custom` | GrokApiService | (未定义) | xAI Grok |
| `nvidia-nim` | NvidiaNimApiServiceAdapter | meta/llama-3.1-70b-instruct | NVIDIA NIM |
| `groq-api` | OpenAIApiService | llama3-70b-8192 | Groq (OpenAI兼容) |
| `sambanova-api` | OpenAIApiService | Meta-Llama-3.1-70B-Instruct | SambaNova |
| `github-models` | OpenAIApiService | gpt-4o | GitHub Models |
| `cloudflare-gateway-free` | WorkersAIApiServiceAdapter | null | CF Workers AI 免费额度 |
| `cloudflare-gateway-proxy` | OpenAIApiServiceAdapter | null | CF Gateway OpenAI兼容代理 |

### 2.2 适配器注册机制 (adapter.js)

```javascript
// 适配器注册表 - Map结构
const adapterRegistry = new Map();

// 注册函数
registerAdapter(provider, adapterClass)

// 当前注册的适配器 (第349-352行):
registerAdapter(MODEL_PROVIDER.OPENAI_CUSTOM, OpenAIApiServiceAdapter);
registerAdapter(MODEL_PROVIDER.CLOUDFLARE_GATEWAY_FREE, WorkersAIApiServiceAdapter);
registerAdapter(MODEL_PROVIDER.CLOUDFLARE_GATEWAY_PROXY, OpenAIApiServiceAdapter);

// 注意：其他提供商适配器未在此注册！
```

**关键发现**：虽然定义了11种提供商，但 `adapter.js` 只注册了3种适配器。
其他提供商（claude-custom, gemini等）的使用机制需要进一步确认。

---

## 三、Cloudflare Gateway 实现分析

### 3.1 两种模式对比

#### 模式一：cloudflare-gateway-free (WorkersAIApiServiceAdapter)
```javascript
// workersai-core.js 第26行
this.baseUrl = `https://gateway.ai.cloudflare.com/v1/${cfAccountId}/${cfGatewayName}/workers-ai/run`;
```
- 直接调用 Cloudflare Workers AI API
- 模型格式：`@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- 使用 CF API Token 认证
- 支持免费额度

#### 模式二：cloudflare-gateway-proxy (OpenAIApiServiceAdapter)
```javascript
// openai-core.js 第30-32行 (近似)
// 构建 Gateway URL 指向 OpenAI 兼容端点
this.baseUrl = `https://gateway.ai.cloudflare.com/v1/${cfAccountId}/${cfGatewayName}/openai`;
```
- OpenAI API 兼容模式
- 通过 CF Gateway 代理到 OpenAI/其他服务
- 可使用 OpenAI 格式的请求

### 3.2 Gateway URL 构建逻辑

```
https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}/{service}
                                                      │
                                                      ├─ workers-ai/run (Workers AI)
                                                      └─ openai (OpenAI兼容)
```

---

## 四、前端限制问题

### 4.1 提供商添加限制

**问题位置1**：`provider-manager.js:746`
```javascript
const allowedTypes = ['openai-custom', 'cloudflare-gateway-free', 'cloudflare-gateway-proxy'];
if (!allowedTypes.includes(providerType)) {
    return '';  // 不显示添加组按钮
}
```

**问题位置2**：`provider-manager.js:3683`
```javascript
const allowedTypes = ['openai-custom', 'cloudflare-gateway-free', 'cloudflare-gateway-proxy'];
const isAllowed = allowedTypes.includes(config.id);
// 过滤下拉菜单选项
```

### 4.2 影响
- 前端界面只能添加3种提供商组
- 无法添加：claude-custom, gemini-api-key, grok-custom 等
- 需要修改 allowedTypes 数组才能支持更多提供商

---

## 五、提供商池管理机制

### 5.1 ProviderPoolManager 核心功能

#### 健康检查机制
```javascript
// 默认健康检查模型 (provider-pool-manager.js:50-62)
static DEFAULT_HEALTH_CHECK_MODELS = {
    'gemini-api-key': 'gemini-2.5-flash',
    'openai-custom': 'gpt-4o-mini',
    'claude-custom': 'claude-3-7-sonnet-20250219',
    'cloudflare-gateway-free': null,   // 需用户指定
    'cloudflare-gateway-proxy': null,   // 需用户指定
    // ...
};
```

#### 轮询策略
- `roundRobinIndex`: 记录当前轮询索引
- 支持加权轮询（根据 usageCount）
- 支持 Fallback 链配置

#### 并发控制
```javascript
refreshConcurrency: {
    global: 2,      // 全局最大并行刷新数
    perProvider: 1  // 每提供商内部并行数
}
```

### 5.2 健康检查流程

1. 定时检查（默认10分钟）
2. 使用对应提供商的健康检查模型
3. 失败计数达到 `maxErrorCount` (默认10次) 标记为不健康
4. 自动 Fallback 到备用提供商

---

## 六、关键配置项

### 6.1 Cloudflare Gateway 配置
```json
{
    "accountId": "CF_ACCOUNT_ID",
    "gatewayId": "CF_GATEWAY_NAME",
    "cfApiToken": "CF_API_TOKEN",
    "healthCheckModel": "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
}
```

### 6.2 多账号轮询配置
- 通过 `provider_pools.json` 配置多个提供商实例
- 每个实例有独立 UUID
- 支持分组管理（如 `openai-custom-prod`, `openai-custom-dev`）

---

## 七、待优化方向（本次目标）

### 7.1 多账号轮询聚合
- 配置多个 CF 账号
- 实现自动轮询选择
- 额度用尽自动切换

### 7.2 自动化 Gateway 创建
- 通过 CF API 自动创建 Gateway
- 集成到前端一键部署

### 7.3 CF Tunnel 内网穿透
- 配置 Tunnel 暴露本地服务
- 支持私有模型通过 Tunnel 访问

### 7.4 厂商密钥池轮询
- OpenAI/Anthropic/Gemini 密钥池
- 请求级轮询，避免单Key限流

---

## 八、风险点记录

| 位置 | 问题 | 影响 | 解决思路 |
|------|------|------|----------|
| provider-manager.js:746 | allowedTypes限制 | 只能添加3种提供商 | 扩展数组 |
| provider-manager.js:3683 | 添加模态框限制 | 同上的问题 | 同上 |
| adapter.js:350-352 | 适配器注册不全 | 部分提供商可能无法使用 | 确认注册逻辑 |
| workersai-core.js | 无健康检查模型 | CF Gateway健康检查需手动配 | 配置默认值 |

---

## 九、修改计划待定

根据用户要求，先完成深度理解后再制定具体修改方案。
下一步：分析 `openai-core.js` 的 Gateway URL 自动构建逻辑，以及密钥池轮询的具体实现。

---

**记录人**：妖妖酒  
**状态**：架构理解完成，待制定优化方案

---

## 十、轮询算法深度分析

### 10.1 加权轮询计分机制

```javascript
// 位置：provider-pool-manager.js:529-550
_calculateNodeScore(providerStatus, providerType, minSeqInPool, now)
```

| 计分项 | 计算方式 | 权重说明 |
|--------|----------|----------|
| **基础分** | 响应时间得分 + 错误率惩罚 | 默认5秒减响应时间 |
| **使用次数** | usageCount * 10000 | 每用1次加10000ms权重 |
| **序列号** | (lastSelectionSeq - minSeq) * 1000 | 最后使用越早，分越低 |
| **当前负载** | activeCount * 5000 | 每个活跃请求加5000ms |
| **新鲜节点奖励** | now - lastHealthCheckTime | 新健康节点有优势 |

### 10.2 并发控制策略

```javascript
// 全局并发
refreshConcurrency.global = 2       // 最多2个提供商同时刷新

// 单提供商并发
refreshConcurrency.perProvider = 1  // 每个提供商内部1个并发

// 缓冲队列
bufferDelay = 5000  // 5秒缓冲，合并相同提供商的刷新请求
```

### 10.3 刷新触发条件

| 情况 | 处理方式 |
|------|----------|
| 健康节点 < 5 | 绕过缓冲，立即刷新 |
| 正常情况 | 进入缓冲队列，5秒后批量处理 |
| 重复UUID | Map自动去重，保留force:true状态 |

### 10.4 selectProvider 选择流程

1. 获取指定类型的所有健康节点
2. 过滤掉禁用的节点
3. 计算每个节点的加权得分
4. 选择得分最低的节点（响应快、用得少、负载低）
5. 更新节点的 `_lastSelectionSeq` 和 `usageCount`
6. 返回选中的提供商配置

---

## 十一、待解决问题清单

### 高优先级
- [x] 前端 allowedTypes 限制扩展（support claude, gemini, grok） - **5.0.2-1 已完成**
- [ ] CF Gateway 一键创建功能集成
- [ ] 多账号CF轮询配置模板

### 中优先级
- [ ] 密钥池自动切换（单Key限流时切换）
- [ ] CF Tunnel 内网穿透集成
- [ ] 健康检查模型默认值配置

### 低优先级
- [ ] 前端UI优化（提供商分组显示）
- [ ] 日志聚合和监控对接
