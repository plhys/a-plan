# 🛠️ A-Plan v3.0 开发与技术文档

## 1. 架构概览

A-Plan v3.0 采用了 **“核心引擎 + 可插拔模块”** 的设计思路，旨在解决分布式、不稳定的容器环境（如 K8s Pod）下的高可用问题。

### 核心组件 (Core Engine)
- **src/core/master.js**: 主进程守护逻辑，负责 Worker 管理与资源监控。
- **src/core/config-manager.js**: 配置中心，支持环境变量注入与动态加载。
- **src/services/api-server.js**: 核心 API 服务，负责路由分发。
- **src/handlers/request-handler.js**: 零拷贝转发处理器。
- **src/providers/**: 各类 AI 模型适配器。

### 可插拔模块 (Extended Modules)
- **Web UI / Dashboard**: 提供图形化管理界面。
- **Usage Statistics**: 详细的用量审计与图表。
- **Deep Logs**: 完整的请求/响应审计日志。

---

## 2. 核心功能实现细节

### 2.1 极速启动 (LITE_MODE / CORE_ONLY)
当环境变量 `CORE_ONLY=true` 时，`api-server.js` 将跳过以下初始化过程：
- 静态资源目录挂载 (`static/`)。
- 复杂的中间件（如详细审计日志记录器）。
- 非核心的管理路由。

### 2.2 容灾自愈机制
- **进程重启策略**：Master 进程会捕获 Worker 的 `exit` 事件。除了常规重启，还会记录重启频率，防止因为配置错误导致的“死循环启动”。
- **内存防护**：引入 `SIGUSR2` 信号触发 Worker 的热切换，在不中断连接的情况下完成内存回收或配置更新。

### 2.3 异步 Git 同步 (Git Sync v2)
启动脚本 `start.sh` 的逻辑已更新：
1. **[T0]** 检查本地持久化目录是否存在配置。
2. **[T1]** 立即启动 Node.js 服务。
3. **[T2]** 在后台执行 `git pull`。
4. **[T3]** 若配置有更新，发送信号通知 Worker 重新加载。

---

## 3. 环境变量手册

| 变量 | 类型 | 描述 |
| :--- | :--- | :--- |
| `CORE_ONLY` | Boolean | 是否开启极速模式（关闭 UI）。 |
| `MASTER_PORT` | Number | Master 管理接口端口（默认 3100）。 |
| `SERVER_PORT` | Number | 业务 API 端口（默认 3000）。 |
| `AUTO_SYNC` | Boolean | 是否开启 Git 自动推送。 |
| `LOG_LEVEL` | String | 日志等级 (debug/info/warn/error)。 |

---

## 4. 如何贡献新 Provider

1. 在 `src/providers/` 目录下创建新的适配器类，继承自 `BaseProvider`。
2. 实现 `chatCompletions` 异步方法。
3. 在 `src/providers/provider-pool-manager.js` 中注册该类型。

---
*A-Plan v3.0: Built for reliability, optimized for speed.*
