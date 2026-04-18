# 🚀 A计划 (A-Plan) - AI 接口网关

**A计划** 是一个 AI 接口中转服务，能把各种"白嫖"模型（Gemini CLI、Claude、Kiro、Grok、DeepSeek 等）统一包装成 OpenAI 格式的 API，让你像用 OpenAI 一样简单地调用它们。

---

## 🎯 这是什么？

简单说，它就是一个**API 转发器**：

```
你的应用 → A计划 → 各种免费模型 → 返回结果
```

**能做什么：**
- 把 Gemini CLI、Claude、Kiro、Grok、DeepSeek 等模型统一成 OpenAI API 格式
- 支持多 Key 轮询，防止单个 Key 被限流
- 内置代理支持，解决地区限制
- 带管理后台，可以在线配置和查看用量

---

## 🛠️ 快速部署

### 方式一：直接运行（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/plhys/a-plan.git ~/a-plan
cd ~/a-plan

# 2. 安装依赖
npm install

# 3. 启动服务
npm start
# 或者指定端口和密码
A_PORT=18788 A_ADMIN_PASSWORD=123456 npm start
```

### 方式二：Docker（待实现）

```bash
docker run -d -p 18788:18788 -e A_ADMIN_PASSWORD=123456 a-plan
```

---

## ⚙️ 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `A_PORT` | 18788 | 服务端口 |
| `A_ADMIN_PASSWORD` | abc123 | 管理后台密码 |
| `CORE_ONLY` | false | 开启极简模式（只启动 API，不加载 UI） |
| `WORKER_COUNT` | 1 | API 处理进程数，可设为 `auto` 自动匹配 CPU 核心 |

### 管理后台

启动后访问：`http://你的IP:18788`

- 默认密码：`abc123`
- 可以配置模型 Key、查看用量统计、管理渠道等

---

## 📡 API 调用示例

```bash
# 调用 ChatGPT 兼容接口
curl -X POST http://localhost:18788/v1/chat/completions \
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

*Powered by A-Plan Team & OpenClaw Agent*