# 🛠️ A-Plan v3.0 开发与极客技术手册

> 🚨 **【最高权重警告】后来者必读 - 连 AI 都会踩的坑** 🚨
> 
> 以下两个问题极易导致项目在 Pod 环境中产生“不可调试”的崩溃。**修改代码前请默诵三遍。**
>
> 1. **严禁在动态生成的模板字符串中滥用反斜杠 `\`**
>    - **后果**：前端页面直接白屏，控制台报错 `Uncaught SyntaxError`。
>    - **教训**：当你在 Node.js 中通过 `fs.writeFile` 写入带 `${}` 的 JS 代码时，不要试图手动转义。**哪怕是 AI，在这里也经常会因为过度保护而多写一个转义符，导致整个插件模块报废。**
>    - **准则**：`${val}` 就是 `${val}`，绝对不要写成 `\${val}`。
>
> 2. **动态路由“热注册”必须劫持全局 Router**
>    - **后果**：插件显示“激活成功”，但访问其 API 永远返回 404。
>    - **原因**：Express 路由表在 `server.listen` 后就不再接受新注册。
>    - **极客修复**：必须将核心 Router 挂载到 `global.API_ROUTER`，插件激活时强制补录。**不要幻想重启进程，在不稳定的 Pod 里重启意味着连接断开。**

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

## 6. 严禁事项与避坑指南 (Critical Warnings)

### 6.1 严禁在模板字符串中滥用非法转义 (No Syntax Errors)
**错误现象**：浏览器报错 `Uncaught SyntaxError: Invalid or unexpected token`。
**原因**：在静态 JS 文件（如 `plugin-manager.js`）的模板字符串（` ` ）中使用反斜杠 `\` 转义了非必要的字符（如反引号或美元符）。
- **极客规范**：
    - 在 JS 的模板字符串内部，如果需要嵌套其他模板字符串，请直接使用，不要手动添加 `\` 转义。
    - **严禁**出现 `\` 开头的非法转义字符。这会导致浏览器解析引擎直接崩溃，导致前端页面白屏。
    - **示例**：
        - ✅ 正确：`${condition ? `<div>${val}</div>` : ''}`
        - ❌ 错误：`${condition ? \`<div>\${val}</div>\` : ''}`（反斜杠会导致语法错误）

### 6.2 严禁污染系统环境
A-Plan 设计初衷是保持系统纯净。严禁插件通过 `process.env` 修改系统全局代理。所有代理行为必须局限在请求级的 `config.PROXY_URL` 注入上。

### 6.3 动态激活插件的“路由失效”陷阱 (Hot-Reloading Routing)
**背景**：在极致轻量化模式下，插件代码可能在运行时才被注入。
**教训**：Express 的路由表是静态生成的。如果在服务启动后通过 `PluginManager` 写入新插件并 `import`，其 `routes` 默认不会生效。
**极客修复方案**：
- 在 `PluginManager.setPluginEnabled` 中，必须捕获全局 Router 实例并手动调用 `.get()` 或 `.post()` 注册新路由。
- 严禁通过“重启整个 Master 进程”来加载插件，这会破坏 Pod 的稳定性并导致正在进行的 API 请求中断。

### 6.4 调度环境下的“伪持久化” (Ephemeral Storage Awareness)
**背景**：Pod 经常被调度，挂载卷不一定能覆盖所有目录。
**准则**：
- 严禁假设 `src/plugins/` 目录下的动态代码能永久存在。
- 插件激活逻辑必须是**幂等（Idempotent）**的：即检测到 `plugins.json` 中已启用但目录为空时，必须能自动触发重新拉取/生成流程。
- **唯一真理来源**：始终以 `configs/*.json` 为准，而不是以文件系统目录为准。


---
*A-Plan Team: 让技术回归纯粹，让白嫖更有尊严。*

---

## 7. v4.2.0 极客原子化重构日志 (Geek Atomic Update)

### 7.1 本次手术核心：
1.  **彻底核心解耦**: 将 `Clash` 从启动路径上硬拆除。现在它不再是“必选项”，而是一个静默的“可选项”。
2.  **号池标签化路由**: 引入了 `PROXY_TAG` 系统。现在每一个 Key 都带有一个“地区属性”，不再只有全局代理这一种粗鲁的方式。
3.  **环境感知持久化**: 移除了所有硬编码的绝对路径（如 `/home/skywork`）。现在的项目使用 `process.cwd()` 和 `os.homedir()`，能自适应任何寄生环境。

### 7.2 给后来者的技术嘱托 (Pits to Avoid):
1.  **分流标签匹配逻辑**:
    - **逻辑坑**: `clash-core.js` 中的地区分组是基于关键词模糊匹配的（如 `n.toUpperCase().includes('US')`）。
    - **警告**: 在给 Key 贴标签时，标签名必须与你订阅中的节点关键词对齐。如果标签填了 `Singapore` 但节点叫 `SG`，分流会失效并回退到直连。
    - **极客技巧**: 建议统一使用两个字母的标准 ISO 国家代码（US, HK, SG, JP）。

2.  **Git 同步的“分支陷阱”**:
    - **坑点**: `GitSyncManager` 现在支持 `GIT_SYNC_BRANCH`。如果你在一个新 Pod 里没设这个变量，它会默认跑在 `main` 分支上。
    - **严重后果**: 如果你误操作导致两个不同项目的配置全推到了 `main`，云端数据会发生不可逆的“塌陷式覆盖”。
    - **准则**: **不同的项目实例，必须强制分配不同的分支名。**

3.  **原子启动的“冷启动预感应”**:
    - **逻辑**: 我们追求 100ms 启动。这意味着 Git 的 `pull` 是在后台异步发生的。
    - **坑**: 在新 Pod 重建后的前 2 秒内发起的请求，可能会因为云端配置还没拉回来而导致“401 Unauthorized”或“空号池”错误。
    - **应对**: 前端已做优化，但后来者在开发 API 轮询逻辑时，务必加上“空号池重试”机制。

4.  **去特定化路径的维护**:
    - **警告**: 严禁在代码中写死任何 `/home/` 开头的路径。必须使用 `path.join(process.cwd(), 'configs')`。
    - **教训**: 我们曾因为一个硬编码的 `skywork` 路径导致在别人的 Pod 里启动报 `ENOENT` 错误。

---
*Powered by A-Plan Team & SkyClaw Agent (v4.2.0)*
