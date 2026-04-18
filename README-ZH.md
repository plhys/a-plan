# 🚀 A计划 (A-Plan) v3.0 - 极致性能与高可用 AI 网关

**A计划 (A-Plan)** 是一款专为极客、深度用户和生产环境设计的 AI 接口中转网关。它能将各类“白嫖”模型（Gemini CLI, Claude Kiro, Grok SSO, DeepSeek Reverse）统一封装为 OpenAI 标准接口，并提供极致的稳定性。

---

## ✨ 核心特性

- **【极速 LITE 模式】**：通过 `CORE_ONLY=true` 环境变量开启。极致精简，毫秒级响应 Pod 调度。
- **【插件市场 (Marketplace)】**：首创“零重力”插件架构。Clash 代理、EasyTier 组网等重型插件按需“一键安装/卸载”，核心库永保轻量。
- **【工业级更新引擎】**：后台一键检查、排序、更新、热重启。支持强制版本对齐与自动清理无效标签。
- **【高可用守护架构】**：Master-Worker 多进程模型。内置崩溃自愈、自动切号、健康监测、异步 Git 云同步。
- **【纯净精神】**：物理移除所有广告、强制关注、赞助商链接，界面清爽，专注生产力。

---

## 🛠️ 极速部署 (K8s / Pod 调度环境首选)

针对 Pod 经常重置但拥有**持久化挂载目录**（如 `/home/skywork/workspace`）的环境：

1. **首次克隆与安装**：
   ```bash
   git clone https://github.com/plhys/a-plan.git ~/workspace/a-plan
   cd ~/workspace/a-plan && npm install --production
   ```
2. **一键复活 (start.sh)**：
   每次 Pod 启动时运行：
   ```bash
   sh start.sh
   ```
   **脚本会自动：** 异步检查云端配置、自动修复依赖碎片、拉起高可用 Master 守护进程。

---

## ⚙️ 极客配置手册

| 环境变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `CORE_ONLY` | `false` | **开启战斗核心模式**。关闭所有 UI、统计和非必要插件。 |
| `AUTO_SYNC` | `true` | 是否每 10 分钟自动将号池配置备份到您的私有 Git 仓库。 |
| `WORKER_COUNT` | `1` | API 处理进程数。建议设为 `auto` (匹配 CPU 核心) 以获取极致并发。 |

---

## 🧩 插件推荐

- **Clash Guardian**：内置代理守护，支持订阅地址，解决 403 地区限制。
- **EasyTier Link**：无 TUN 模式组网，跨越 Pod 隔离访问您的私有模型。
- **API Potluck**：多 Key 轮询大锅饭，支持最新的速率追踪 (RateTracker)。

---

## 💡 开发者与贡献
如果您想参与开发，请参考 [DEVELOPMENT.md](./DEVELOPMENT.md)。

*Powered by A-Plan Team & OpenClaw Agent*
