# 🛠️ A-Plan v3.0 开发与极客技术手册

## 1. 架构哲学：极致折叠与动态展开

A-Plan v3.0 遵循 **“核心极致轻量，功能按需挂载”** 的设计哲学。

### 1.1 核心层 (Core Engine)
- **转发引擎**: 基于 Node.js 原生 HTTP 库实现的零拷贝转发。
- **号池管理**: 负责多账号的健康检测、负载均衡与自动切号。
- **高可用守护**: Master 进程实时监控 Worker，提供毫秒级崩溃自愈。

### 1.2 插件层 (Modular System)
插件分为“内置插件”和“市场插件”：
- **内置插件**: 如 `api-potluck` (大锅饭), `model-usage-stats` (用量统计)。代码随主仓库下载。
- **市场插件**: 如 `clash-guardian` (代理守护), `easytier-link` (分布式组网)。代码在 Web UI 点击“安装”时才通过 Git/Curl 动态拉取。

---

## 2. 核心模式控制

### 2.1 `CORE_ONLY` 模式
通过设置环境变量 `export CORE_ONLY=true` 启动。
- **影响范围**: 
  - 物理跳过 `static/` 目录的挂载，不提供 Web UI 服务。
  - 仅加载认证插件，跳过所有审计和统计中间件。
  - 内存占用降低约 40%-60%，启动速度提升至毫秒级。

---

## 3. 插件开发指南

### 3.1 插件结构
每个插件必须位于 `src/plugins/<name>/` 目录下，且包含一个 `index.js`。

```javascript
export default {
    name: 'my-plugin',
    version: '1.0.0',
    _priority: 50, // 优先级 (1-100)，越小越先执行

    // 初始化钩子
    async init(config) { ... },

    // 核心中间件
    async middleware(req, res, requestUrl, config) { ... },

    // 扩展路由
    routes: [
        { method: 'GET', path: '/api/my-plugin', handler: (m, p, req, res) => { ... } }
    ]
};
```

### 3.2 插件配置
插件的个性化配置存储在 `configs/plugins.json` 中的 `config` 字段内。

---

## 4. 工业级版本更新规范 (A-Plan Update Standard)

为了确保在不稳定的 PUD/Pod 环境中更新始终成功，所有后续版本必须严格遵守此更新流程。禁止“想写啥写啥”，必须维持以下原子操作链：

### 4.1 版本对齐三要素 ( must-have )
发布新版本（打 Tag）前，必须确保以下三个文件的版本号完全一致：
1.  **`VERSION` (根目录)**: 纯文本文件，如 `4.0.3`。这是 UI 判定当前版本的唯一标准。
2.  **`package.json`**: `version` 字段必须同步更新。
3.  **Git Tag**: 必须打上带 `v` 前缀的标签，如 `v4.0.3`。

### 4.2 更新引擎逻辑 (Update Engine Logic)
更新引擎位于 `src/ui-modules/update-api.js`，其核心逻辑严禁随意改动：
- **归一化比较**: 必须使用 `normalize` 函数去除 `v` 前缀后再比对 `VERSION` 内容与 Git Tag 名称。
- **强制对齐策略**: 
  - 执行 `git fetch --all --tags --force --prune --prune-tags`。
  - 在切换版本前，必须执行 `git reset --hard` 和 `git clean -fd`，以清除 PUD 环境中可能产生的临时冲突或文件损坏。
- **热重启序列**: 脚本更新代码后，必须通过 `axios.post` 触发 Master 进程的 `/master/restart` 接口，实现 0 秒停机热切换。

### 4.3 极速模式下的更新
当 `CORE_ONLY=true` 时，Web UI 更新接口被禁用。此时应通过 `start.sh` 中的异步 Git 同步逻辑完成。`start.sh` 必须保持对 `origin main` 的静默拉取，确保 Pod 每次重启都能自动“复活”到最新提交。

---

## 5. 安全性规范
- **静态资源**: 严禁在 `ui-manager.js` 中使用不经校验的路径拼接，必须通过 `path.normalize` 和 `path.relative` 双重校验防止路径穿越。
- **敏感数据**: `provider-api.js` 自动对 Token 和 Key 进行脱敏处理，严禁将明文 Key 返回给前端。

---
*A-Plan Team: 让技术回归纯粹，让白嫖更有尊严。*
