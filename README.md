# A计划 (A-Plan) - AI 接口网关

**A计划** 是一个轻量级的 AI API 中转服务，将上游 AI 提供商的接口统一包装为标准 OpenAI 格式。

[![Version](https://img.shields.io/badge/version-5.2.3-blue)](https://github.com/plhys/a-plan)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Support-blue)](https://docker.com/)
[![License](https://img.shields.io/badge/license-MIT-orange)](LICENSE)

---

## 核心特性

- **OpenAI 兼容**：上游 API 统一包装为标准 OpenAI 格式
- **负载均衡**：单个提供商支持多节点轮询
- **Key 管理**：多租户 API Key 认证（可选插件）
- **用量统计**：按 Key/模型/时间统计调用量
- **Web 管理**：可视化配置界面，热重载

---

## 架构

当前版本采用精简架构，仅保留核心功能：

- **Node.js + 原生 HTTPS**：无额外 SDK 依赖
- **Master-Worker 进程**：Worker 崩溃自动重启
- **模块化插件**：默认认证、用量统计等

---

## 快速开始

### 📦 方式一：完整包部署（推荐，最可靠）

适合：网络不稳定、追求一键部署、生产环境

从 GitHub Release 下载完整包（包含所有二进制）:

```bash
# 1. 下载完整包（从 Release 页面获取最新链接）
wget https://github.com/plhys/a-plan/releases/download/v5.2.3/a-plan-latest.tar.gz

# 2. 解压
tar -xzf a-plan-latest.tar.gz
cd a-plan-* && ./start.sh

# 3. 启动（无需额外安装，开箱即用）
./start.sh
```

### 🚀 方式二：源码安装（需要网络）

适合：开发测试、已有 Node.js 环境

```bash
# 1. 克隆
git clone https://gitee.com/JunFengLiangZi/a-plan.git && cd a-plan-* && ./start.sh

# 2. 一键安装（需要能访问 GitHub）
./install.sh

# 3. 启动
./start.sh
```

服务访问：`http://localhost:18781`

### 🐳 方式三：Docker 部署（推荐，稳定生产）

适合：生产环境、长期运行、集群部署

```bash
# 1. 克隆
git clone https://gitee.com/JunFengLiangZi/a-plan.git && cd a-plan-* && ./start.sh

# 2. 启动（自动构建并运行）
docker-compose up -d

# 3. 查看日志
docker-compose logs -f

# 4. 停止
docker-compose down
```

数据持久化：`./configs/` 和 `./logs/` 目录挂载到主机

### 手动配置（可选）

```bash
# 编辑 configs/config.json，设置访问密钥
cp configs/config.example.json configs/config.json
vim configs/config.json

# 编辑 configs/provider_pools.json，添加上游 API
cp configs/provider_pools.example.json configs/provider_pools.json
vim configs/provider_pools.json
```

---

## 配置说明

### 1. 系统配置（configs/config.json）

```json
{
  "REQUIRED_API_KEY": "your-secure-api-key",
  "SERVER_PORT": 18781,
  "HOST": "0.0.0.0"
}
```

### 2. 提供商配置（configs/provider_pools.json）

```json
{
  "my-provider": [
    {
      "OPENAI_BASE_URL": "https://api.example.com/v1",
      "OPENAI_API_KEY": "sk-xxx",
      "supportedModels": ["gpt-4", "gpt-3.5-turbo"]
    }
  ]
}
```

---

## API 使用

### 标准 OpenAI 格式

```bash
curl http://localhost:18781/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### 客户端配置

任何支持 OpenAI 的客户端：
- **Base URL**: `http://your-server:18781/v1`
- **API Key**: `config.json` 里设置的 `REQUIRED_API_KEY`

---

## 管理界面

访问 `http://your-server:18781`

- **仪表盘**：系统概览、路由示例
- **配置管理**：系统设置
- **提供商池**：上游 API 节点管理
- **自定义模型**：模型别名配置
- **用量查询**：调用统计
- **插件管理**：功能开关
- **实时日志**：服务日志

---

## 插件

| 插件 | 用途 |
|------|------|
| default-auth | API Key 认证 |
| api-potluck | 多 Key 管理、配额限制 |
| model-usage-stats | 用量统计 |
| ai-monitor | 请求监控 |

---

## 目录结构

```
a-plan/
├── configs/              # 配置文件
│   ├── config.json       # 主配置
│   ├── provider_pools.json   # 提供商池
│   └── plugins.json      # 插件配置
├── src/                  # 源代码
│   ├── core/             # 核心进程
│   ├── services/         # API 服务
│   ├── providers/        # 提供商适配
│   └── plugins/          # 插件
├── static/               # Web 前端
├── Dockerfile            # Docker 构建
└── package.json
```

---

## 更新日志

### v5.1.0 (2026-04-26)
- 精简架构，移除非核心 providers
- 清理过时功能和页面
- 项目结构优化

### v5.0.0 (2026-04-23)
- Master-Worker 多进程架构
- 插件系统重构

---

## 许可证

MIT License
