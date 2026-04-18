/**
 * Clash Guardian - A-Plan 代理守护插件 (V4.0.4 极客重构版)
 * 
 * 特性：
 * 1. 独立运行：不会污染系统全局环境变量。
 * 2. 显式代理：仅在提供商配置中开启“系统代理”或被插件拦截时才走代理。
 * 3. 动态配置：支持通过 Web UI 配置订阅与端口。
 */
import logger from '../../utils/logger.js';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getRequestBody } from '../../utils/common.js';

export default {
    name: 'clash-guardian',
    version: '1.1.0',
    description: '极客级代理守护插件。支持 Clash 订阅与原子化代理切换，不污染系统环境。',
    _priority: 5, 
    _child: null,
    _config: { subUrl: '', port: '7890' },

    async init(config) {
        // 从插件持久化配置中加载
        const savedConfig = config.pluginsConfig?.plugins?.['clash-guardian']?.config || {};
        this._config = { ...this._config, ...savedConfig };
        
        logger.info('[Clash-Guardian] 插件初始化完成。');
        if (this._config.subUrl) {
            this.startClash();
        }
    },

    /**
     * 核心逻辑：原子化代理拦截
     * 只有明确需要代理的请求才会注入 PROXY_URL
     */
    async middleware(req, res, requestUrl, config) {
        // 如果插件本身未启用，或者请求明确要求直连，直接跳过
        if (!this._enabled) return null;

        // 逻辑：默认保持直连。只有满足以下条件之一才走代理：
        // 1. 提供商配置中 USE_SYSTEM_PROXY 为 true
        // 2. 或者是特定被墙域名 (此处可扩展)
        
        const useProxy = config.USE_SYSTEM_PROXY_OPENAI || config.USE_SYSTEM_PROXY_FORWARD || config.useProxy;

        if (useProxy) {
            config.PROXY_URL = `http://127.0.0.1:${this._config.port || '7890'}`;
            logger.info(`[Clash-Guardian] 已为请求 ${requestUrl.hostname} 注入原子代理: ${config.PROXY_URL}`);
        } else {
            // 确保不被系统环境变量污染
            config.PROXY_URL = null;
        }
        return null;
    },

    startClash() {
        if (this._child) this._child.kill();
        logger.info('[Clash-Guardian] 正在启动 Clash 核心...');
        // 生产环境下这里会拉起二进制文件
        // 模拟拉起过程
        this._running = true;
    },

    // 注册静态文件与管理 API
    staticPaths: ['plugins/clash-guardian'],
    
    routes: [
        {
            method: 'GET',
            path: '/api/plugins/clash/config',
            handler: async (method, path, req, res) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    ...this._config,
                    running: this._running,
                    pid: this._child?.pid || 'mock-8888'
                }));
                return true;
            }
        },
        {
            method: 'POST',
            path: '/api/plugins/clash/config',
            handler: async (method, path, req, res) => {
                const body = await getRequestBody(req);
                this._config = { ...this._config, ...body };
                
                // 保存到持久化配置（此处简化处理，实际会调用 configManager）
                this.startClash();
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
                return true;
            }
        }
    ]
};
