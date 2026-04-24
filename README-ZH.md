# 🚀 A计划 (A-Plan) - AI 接口网关

**A计划** 是一个为极客设计的 AI 接口中转网关，支持多种模型统一包装成 OpenAI 格式的 API。

---

## 🎯 核心特性

- **多提供商支持**: OpenAI 兼容模式 (NLB/自定义)、Grok、NVIDIA NIM、Groq、SambaNova、Github Models、Claude、Gemini
- **用量查询**: 支持 Grok 和 OpenAI 兼容模式的本地用量统计
- **健康检查**: 自动从 supportedModels 获取检查模型
- **轻量高效**: 纯原生 HTTPS 实现，零 SDK 依赖

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

```bash
# 登录获取 Token
TOKEN=$(curl -s -X POST http://localhost:18781/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 调用 API
curl -X POST http://localhost:18781/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "glm-5",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

---

## 📁 目录结构

```
a-plan/
├── src/
│   ├── services/           # 服务入口
│   ├── providers/          # 提供商适配器
│   ├── plugins/            # 插件 (api-potluck, model-usage-stats, etc.)
│   └── ui-modules/         # UI 模块
├── static/                 # 前端页面
├── configs/                # 配置文件
├── CHANGELOG.md           # 更新日志
└── package.json
```

---

## 📝 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)

- **v5.0.0** - OpenAI 兼容模式用量查询支持 + NLB 压缩问题修复 + 健康检查优化
- **v4.2.x** - 历代版本

---

## ❓ 常见问题

**Q: 支持哪些模型？**
A: 支持所有 OpenAI 兼容格式的模型，包括：GLM5、Kimi、MiniMax、Qwen 等

**Q: 如何查看用量？**
A: 访问管理后台 -> 用量查询，或调用 `/api/usage` 接口

---

## 📄 许可证

MIT License

---

*Powered by A-Plan*