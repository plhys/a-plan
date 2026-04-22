# 更新日志 CHANGELOG

## v5.0.0 (2026-04-23)

### 🚀 新功能

- **OpenAI 兼容模式用量查询支持**
  - 添加 `openai-custom` 到用量查询支持列表
  - 实现本地用量统计（请求次数、错误次数）
  - 新增 `formatOpenAICustomUsage` 格式化函数

- **NLB 压缩问题修复**
  - 修复 GLM5 等模型调用失败问题（500 错误）
  - 原因：NLB 不支持 Brotli 压缩
  - 解决：针对 NLB 禁用压缩，使用 `Accept-Encoding: identity`

- **健康检查逻辑优化**
  - 健康检查模型改为从 `supportedModels[0]` 自动获取
  - 不再硬编码默认模型，避免 NLB 健康检查失败

### 🔧 改进

- 优化 provider pool 管理器逻辑
- 统一用量查询接口

---

## v4.2.x (历史版本)

### v4.2.9
- 极速版：精简核心依赖

### v4.2.8
- 精简核心依赖，仅5个（dotenv, ws, axios, uuid, lodash）

### v4.2.6
- Geek Overhaul: 移除硬编码配置，统一端口 18781
- 新增原生 Nvidia NIM 支持
- 集成 Groq, SambaNova, Github Models

### v4.2.5
- 环境兼容性优化，POSIX 合规

### v4.2.4
- 生存能力提升：JIT token 刷新，60s 静默启动

### v4.1.0
- Geek Refactor: 插件化，热点路由