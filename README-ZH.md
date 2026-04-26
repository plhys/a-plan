# 🚀 A-Plan (A计划) - AI 接口网关 + VPN + WebSSH

**A-Plan** 是一个为极客设计的轻量级 AI 接口中转网关，集成 EasyTier VPN 和 WebSSH 功能，支持多种 AI 提供商统一包装成 OpenAI 格式的 API。

---

## 🎯 核心特性

### AI API 网关
- **多提供商支持**: OpenAI、Gemini、Claude、Grok、NVIDIA NIM、Groq、SambaNova、GitHub Models 等
- **统一 API 格式**: 所有模型统一包装成 OpenAI 格式，兼容各种客户端
- **智能路由**: 支持模型映射和提供商_failover，异常自动切换
- **用量统计**: 本地记录 API 调用次数和 token 消耗
- **插件系统**: 支持功能扩展（认证、用量统计、API 分享等）

### 网络功能
- **EasyTier VPN**: 内置轻量级 VPN 解决方案，支持点对点加密组网
- **WebSSH**: 浏览器直接访问服务器终端，无需 SSH 客户端

### 性能与架构
- **多进程架构**: Master-Worker 模式，支持多 worker 并发
- **幽灵模式**: 核心逻辑异步加载，秒开端口
- **TLS Sidecar**: 可选 TLS 代理支持

---

## 📦 部署方式

### 方式一：二进制部署（推荐 - 无需 Node.js）

适用于：生产环境、容器/POD 部署、追求极致简单部署

```bash
# 下载
wget https://gitee.com/JunFengLiangZi/a-plan/raw/main/dist/a-plan-latest

# 启动
chmod +x a-plan
./a-plan
```

> 注意：二进制版本约 83MB（包含 Node.js 运行时），需要目标机器架构匹配

---

### 方式二：源码部署（推荐 - 开发/定制）

适用于：需要定制功能、源码调试、开发者

```bash
# 1. 克隆项目
git clone https://gitee.com/JunFengLiangZi/a-plan.git
cd a-plan-* && ./start.sh

# 2. 安装依赖
pnpm install

# 3. 启动
npm start

# 或仅启动 API 服务（不含 WebSSH/VPN）
npm run start:standalone
```

**环境要求**:
- Node.js 18+
- pnpm (推荐) 或 npm

---

### 方式三：Docker 部署（适用于已有 Docker 环境）

适用于：熟悉 Docker、需要快速环境隔离

```bash
# 方式 A：使用预构建镜像
docker run -d \\
  -p 18781:18781 \\
  -p 2222:22 \\
  -v ./configs:/app/configs \\
  -e A_PORT=18781 \\
  --name a-plan \\
  your-registry/a-plan:latest

# 方式 B： docker-compose（推荐）
# 见下方 docker-compose.yml
```

**Docker Compose 方式**:
```yaml
version: '3.8'
services:
  a-plan:
    image: a-plan:latest
    ports:
      - "18781:18781"
      - "2222:22"
    volumes:
      - ./configs:/app/configs
    environment:
      - A_PORT=18781
      - A_ADMIN_PASSWORD=your-password
    restart: unless-stopped
```

---

## ⚙️ 配置说明

### 快速配置

```bash
# 复制配置模板
cp configs/config.json.example configs/config.json

# 编辑配置
vim configs/config.json
```

### 核心配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `REQUIRED_API_KEY` | 123456 | 访问密钥 |
| `SERVER_PORT` | 18781 | 服务端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `MODEL_PROVIDER` | - | 默认模型提供商 |
| `PROXY_URL` | - | 代理服务器 |
| `TLS_SIDECAR_ENABLED` | false | 启用 TLS 代理 |

### 环境变量

| 变量名 | 说明 |
|--------|------|
| `A_PORT` | 服务端口 |
| `A_ADMIN_PASSWORD` | 管理后台密码 |
| `CORE_ONLY` | 仅启动核心 API |
| `LITE_MODE` | 轻量模式（无 UI） |

---

## 📡 API 调用示例

### 1. 获取访问 Token

```bash
TOKEN=$(curl -s -X POST http://localhost:18781/api/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"123456"}' | \\
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
```

### 2. 调用 Chat API

```bash
curl -X POST http://localhost:18781/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $TOKEN" \\
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": false
  }'
```

### 3. 流式响应

```bash
curl -X POST http://localhost:18781/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $TOKEN" \\
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "讲个故事"}],
    "stream": true
  }'
```

---

## 🔧 管理后台

访问 `http://你的IP:18781`

- **默认密码**: `123456`
- **功能**:
  - 配置模型和 API Key
  - 查看用量统计
  - 管理插件
  - 配置 VPN 网络
  - 访问 WebSSH 终端

---

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────┐
│              Master Process                  │
│         (进程管理 / 故障恢复 / API)           │
└─────────────────┬───────────────────────────┘
                  │ fork
                  ▼
┌─────────────────────────────────────────────┐
│              Worker Process                   │
│  ┌─────────────────────────────────────┐    │
│  │       HTTP Server (幽灵模式)          │    │
│  │   端口秒开 → 异步加载核心逻辑          │    │
│  └─────────────────────────────────────┘    │
│  ┌────────┐ ┌─────────┐ ┌────────────┐   │
│  │API路由 │ │ Provider│ │  插件系统   │   │
│  │        │ │  适配器  │ │            │   │
│  └────────┘ └─────────┘ └────────────┘   │
│  ┌────────┐ ┌─────────┐                   │
│  │EasyTier│ │ WebSSH  │                   │
│  │  VPN   │ │ 终端    │                   │
│  └────────┘ └─────────┘                   │
└─────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 说明 |
|------|------|
| Master | 主进程，管理 Worker 生命周期，提供管理 API |
| Worker | 工作进程，运行核心业务逻辑 |
| Provider | 模型提供商适配器 |
| Plugin | 插件系统（认证、统计等） |
| EasyTier | VPN 网络管理 |
| WebSSH | 浏览器终端 |

---

## 📁 目录结构

```
a-plan/
├── src/
│   ├── core/           # 核心进程
│   │   ├── master.js   # 主进程
│   │   └── config-manager.js
│   ├── services/       # 服务
│   │   ├── api-server.js    # API 服务
│   │   └── api-server-lite.js
│   ├── providers/      # 模型提供商
│   ├── modules/
│   │   ├── network/    # EasyTier VPN
│   │   ├── ssh/        # WebSSH
│   │   └── proxy-shadow/ # 代理模块
│   ├── plugins/        # 插件
│   ├── ui-modules/     # UI API
│   └── utils/          # 工具
├── static/             # 前端页面
├── configs/            # 配置文件
├── bin/                # 内置二进制 (EasyTier/ttyd)
└── package.json
```

---

## 💡 适用场景

### 1. 个人 AI API 代理
- 统一管理多个 API Key
- 防止 Key 泄露
- 用量统计和监控

### 2. 团队/组织 AI 服务
- 共享 AI 能力
- 访问控制
- 用量分摊

### 3. 开发测试环境
- 本地 AI API 调试
- 模型对比测试

### 4. 跨境网络优化
- 配合代理使用
- 解决 API 访问问题

### 5. 轻量级 VPN + 远程办公
- EasyTier 内网穿透
- WebSSH 远程维护

---

## ⚠️ 注意事项

1. **安全**: 部署后务必修改默认密码
2. **网络**: 部分模型需要代理才能访问
3. **资源**: 建议至少 512MB 内存
4. **端口**: 确保防火墙放行对应端口

---

## 📝 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)

- **v5.2.1** - 轻量化版本，移除 Clash，优化二进制部署
- **v5.0.0** - OpenAI 兼容模式用量查询
- **v4.2.x** - 历代版本

---

## 🤝 贡献

欢迎提交 Issue 和 PR！

---

## 📄 许可证

MIT License
