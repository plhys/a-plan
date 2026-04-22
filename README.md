# 🚀 A计划 (A-Plan) - AI 接口网关

**A计划** 是一个为极客设计的 AI 接口中转网关，支持多种模型统一包装成 OpenAI 格式的 API。

[![Version](https://img.shields.io/badge/version-5.0.0-blue)](https://github.com/plhys/a-plan)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-orange)](LICENSE)

---

## 🎯 核心特性

- **多提供商支持**: OpenAI 兼容模式 (NLB/自定义)、Grok、NVIDIA NIM、Groq、SambaNova、Github Models、Claude、Gemini
- **用量查询**: 支持 Grok 和 OpenAI 兼容模式的本地用量统计
- **健康检查**: 自动从 supportedModels 获取检查模型
- **轻量高效**: 纯原生 HTTPS 实现，零 SDK 依赖
- **插件系统**: 支持插件扩展功能
- **Web UI**: 图形化管理界面

---

## 🛠️ 快速部署

### 一键安装 (Linux / macOS)

```bash
curl -sSL https://raw.githubusercontent.com/plhys/a-plan/master/install-and-run.sh | bash
```

### 手动部署

```bash
# 1. 克隆项目
git clone https://github.com/plhys/a-plan.git ~/a-plan
cd ~/a-plan

# 2. 安装依赖
pnpm install
# 或
npm install

# 3. 启动
npm start
```

---

## ⚙️ 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `A_PORT` | 18781 | 服务端口 |
| `A_ADMIN_PASSWORD` | 123456 | 管理后台密码 |

### 管理后台

访问：`http://你的IP:18781`

- 默认密码：`123456`
- 可配置模型 Key、查看用量统计、管理渠道

---

## 📡 API 调用

### 1. 登录获取 Token

```bash
TOKEN=$(curl -s -X POST http://localhost:18781/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

echo $TOKEN
```

### 2. 调用 API

```bash
curl -X POST http://localhost:18781/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "glm-5",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

### 支持的模型

| 模型 | 提供商 |
|------|--------|
| glm-5 | 智谱 GLM |
| glm-4 | 智谱 GLM |
| kimi | 月之暗面 |
| minimax | MiniMax |
| qwen | 阿里 Qwen |
| claude | Anthropic |
| gemini | Google |
| gpt-4 | OpenAI |
| grok | xAI |
| groq | Groq |
| nv-nim | NVIDIA |

---

## 📁 目录结构

```
a-plan/
├── src/
│   ├── core/               # 核心模块
│   │   ├── master.js       # 主入口
│   │   └── plugin-manager.js
│   ├── services/           # 服务层
│   │   ├── api-server.js   # API 服务器
│   │   ├── api-manager.js
│   │   └── service-manager.js
│   ├── providers/          # 提供商适配器
│   │   ├── adapter.js      # 适配器基类
│   │   ├── grok/           # Grok 提供商
│   │   ├── openai/         # OpenAI 兼容
│   │   └── ...
│   ├── handlers/           # 请求处理器
│   ├── modules/            # 功能模块
│   ├── utils/              # 工具函数
│   └── ui-modules/         # UI 模块
├── static/                 # 前端页面
│   ├── app/               # 前端应用
│   └── components/        # 组件
├── configs/               # 配置文件
├── tls-sidecar/           # TLS 代理
├── CHANGELOG.md          # 更新日志
├── package.json
└── README.md
```

---

## 📝 更新日志

### v5.0.0 (2026-04-23)
- OpenAI 兼容模式用量查询支持
- NLB 压缩问题修复
- 健康检查逻辑优化

### v4.2.x
- 历代版本优化

详见 [CHANGELOG.md](./CHANGELOG.md)

---

## ❓ 常见问题

**Q: 支持哪些模型？**
A: 支持所有 OpenAI 兼容格式的模型，包括：GLM5、Kimi、MiniMax、Qwen 等

**Q: 如何查看用量？**
A: 访问管理后台 -> 用量查询，或调用 `/api/usage` 接口

**Q: 如何更新？**
A: `git pull origin main` 然后 `npm start`

---

## 📄 许可证

MIT License

---

## ⭐ 支持

如果这个项目对你有帮助，请给一个 Star！

---

*Powered by A-Plan*