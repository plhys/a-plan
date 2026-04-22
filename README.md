# 🚀 A计划 (A-Plan) - AI 接口网关

**A计划** 是一个为极客设计的、专为不稳定的 POD 环境优化的 AI 接口中转网关。它能把各种模型（Gemini CLI/OAuth、Claude Kiro、Grok、Nvidia NIM、Groq、Github Models 等）统一包装成 OpenAI 格式的 API。

---

## 🎯 核心哲学

- **极致轻量**: 零 SDK 依赖，纯原生 HTTPS 实现，POD 启动耗时 < 1s。
- **寄生生存**: 针对 3-5 天频繁调度的服务器环境优化，支持冷启动 Token 懒加载 (JIT)。
- **幽灵模式**: 默认锁定 **18781** 端口，支持端口僵尸自动清理，确保 POD 重建后即刻可用。

## 🛠️ 快速部署

### 极客一键拉起 (Linux / macOS)

```bash
curl -sSL https://raw.githubusercontent.com/plhys/a-plan/master/install-and-run.sh | bash
```

### 手动部署

```bash
# 1. 克隆项目
git clone https://github.com/plhys/a-plan.git ~/a-plan
cd ~/a-plan

# 2. 快速安装依赖
pnpm install # 或 npm install

# 3. 启动（默认端口 18781）
npm start
```

### 方式二：Docker（待实现）

```bash
docker run -d -p 18781:18781 -e A_ADMIN_PASSWORD=123456 a-plan
```

---

## ⚙️ 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `A_PORT` | 18781 | 服务端口 |
| `A_ADMIN_PASSWORD` | 123456 | 管理后台密码 |
| `CORE_ONLY` | false | 开启极简模式（只启动 API，不加载 UI） |
| `WORKER_COUNT` | 1 | API 处理进程数，可设为 `auto` 自动匹配 CPU 核心 |

### 管理后台

启动后访问：`http://你的IP:18781`

- 默认密码：`123456`
- 可以配置模型 Key、查看用量统计、管理渠道等

---

## 📡 API 调用示例

```bash
# 调用 ChatGPT 兼容接口
curl -X POST http://localhost:18781/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 你的Key" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

支持的模型列表请参见管理后台。

---

## 🔧 目录结构

```
a-plan/
├── src/
│   ├── services/
│   │   └── api-server.js    # 主服务入口
│   ├── plugins/             # 插件目录
│   │   ├── clash-guardian   # 代理插件
│   │   ├── easytier-link    # 组网插件
│   │   └── api-potluck      # 多 Key 轮询
│   └── ...
├── static/                  # 前端页面
├── README-ZH.md            # 中文说明
└── package.json
```

---

## 📝 更新日志

- **v4.2.8** - 极速版：精简核心依赖，仅5个（dotenv, ws, axios, uuid, lodash），安装几秒完成
- **v4.2.6** - Geek Overhaul: Eradicated hardcoded '3000' zombie config and synchronized server startup logic for Port 18781. Evolution of providers: swapped DeepSeek with native Nvidia NIM support. Unified core logic and removed legacy reverse-proxy modules for extreme lightness. Integrated **Groq**, **SambaNova**, and **Github Models** for lightning-fast inference and robust failover.
- **v4.2.5** - Environment Compatibility: POSIX-compliant `start.sh` for multi-shell support, refined logging semantics, and full-stack version alignment.
- **v4.2.4** - Survivability Boost: JIT token refresh, 60s silent startup, 404/400 error filtering to prevent provider 'poisoning', 2-min node auto-recovery, and semantic error reporting.
- **v4.1.0** - Geek Refactor: Atomized plugins, hot-routing, Pod stability optimizations, and Clash management menu.
- **v4.0.2** - 添加项目说明，优化 UI
- **v4.0.1** - 稳定版发布，支持多渠道管理
- **v3.0** - 初始版本

---

## ❓ 常见问题

**Q: 如何获取免费 Key？**
A: 各模型的获取方式不同，请自行搜索。一般需要手机号注册或邀请码。

**Q: 支持哪些模型？**
A: 理论上支持所有 OpenAI 兼容格式的模型，具体看管理后台的渠道配置。

**Q: 会被封号吗？**
A: 使用免费模型有风险，A计划不保证稳定性，请合理使用。

---

## 📄 许可证

MIT License

---

*Powered by A-Plan Team & OpenClaw Agent*Random Number: 0
Random Number: 0
