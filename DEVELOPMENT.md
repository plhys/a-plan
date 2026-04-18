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

## 4. 自动化更新系统

### 4.1 工作原理
更新引擎位于 `src/ui-modules/update-api.js`，采用以下逻辑确保“一以贯之”：
1. **自动清理**: 执行 `git fetch --all --tags --prune` 清理本地陈旧标签。
2. **智能排序**: 使用 SemVer 算法对 Tag 进行排序，确保 beta 版和正式版顺序正确。
3. **原子更新**: `git checkout <tag> && git reset --hard <tag>` 确保代码绝对干净。
4. **无缝热更**: 联动 Master 进程，在不中断 Pod 的情况下完成进程热切换。

---

## 5. 安全性规范
- **静态资源**: 严禁在 `ui-manager.js` 中使用不经校验的路径拼接，必须通过 `path.normalize` 和 `path.relative` 双重校验防止路径穿越。
- **敏感数据**: `provider-api.js` 自动对 Token 和 Key 进行脱敏处理，严禁将明文 Key 返回给前端。

---
*A-Plan Team: 让技术回归纯粹，让白嫖更有尊严。*
