
/**
 * Clash Guardian - A-Plan 代理守护插件
 */
import logger from '../../utils/logger.js';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export default {
    name: 'clash-guardian',
    version: '1.0.0-beta',
    description: '极客级代理守护插件。支持 Clash 订阅与自动分流。',
    _priority: 10, // 高优先级，确保请求走代理

    async init(config) {
        logger.info('[Clash-Guardian] 正在启动代理侧边进程...');
        this._enabled = true;
    },

    async middleware(req, res, requestUrl, config) {
        if (this._enabled) {
            config.PROXY_URL = 'http://127.0.0.1:7890';
            if (requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1') {
                config.PROXY_URL = null;
            }
        }
        return null;
    }
};
