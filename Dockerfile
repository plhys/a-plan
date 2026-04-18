# ── Stage 1: 编译 Go TLS sidecar ──
FROM golang:1.22-alpine AS sidecar-builder

ARG HTTP_PROXY
ARG HTTPS_PROXY
ENV HTTP_PROXY=$HTTP_PROXY
ENV HTTPS_PROXY=$HTTPS_PROXY

RUN apk add --no-cache git

WORKDIR /build
COPY tls-sidecar/go.mod tls-sidecar/go.sum* ./
RUN go mod download || true

COPY tls-sidecar/ ./
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o tls-sidecar .

# ── Stage 2: Node.js 应用 ──
FROM node:20-alpine

LABEL maintainer="AIClient2API Team"
LABEL description="Optimized high-speed deployment image"

# 只安装运行必须的系统工具
RUN apk add --no-cache git procps

WORKDIR /app

# 1. 优先安装生产依赖（忽略开发包）
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# 2. 复制源代码
COPY . .

# 3. 注入 Go Sidecar 二进制（假设 Stage 1 已编译好）
COPY --from=sidecar-builder /build/tls-sidecar /app/tls-sidecar/tls-sidecar
RUN chmod +x /app/tls-sidecar/tls-sidecar

# 清理 npm 缓存进一步缩小体积
RUN npm cache clean --force

USER root
RUN mkdir -p /app/logs
EXPOSE 3000 8085 8086 19876-19880

# 优化健康检查响应速度
HEALTHCHECK --interval=10s --timeout=2s --start-period=3s --retries=2 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["sh", "-c", "node src/core/master.js $ARGS"]
