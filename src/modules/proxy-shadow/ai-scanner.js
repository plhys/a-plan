import https from 'https';
import { SocksProxyAgent } from 'socks-proxy-agent';
import logger from '../../utils/logger.js';

/**
 * 🛰️ AI 雷达扫描器 (v4.2.6 极客定制)
 * 专项探测 OpenAI / Anthropic / Google API 的真实可达性
 */
export class AIScanner {
    constructor(proxyPort) {
        this.proxyUrl = `socks5://127.0.0.1:${proxyPort}`;
        this.agent = new SocksProxyAgent(this.proxyUrl);
        this.targets = [
            { id: 'openai', name: 'OpenAI', host: 'api.openai.com' },
            { id: 'claude', name: 'Claude', host: 'api.anthropic.com' },
            { id: 'gemini', name: 'Gemini', host: 'generativelanguage.googleapis.com' }
        ];
    }

    async testNode(nodeTag) {
        // nodeTag 用于在 Sing-box 中临时切换出站，此处逻辑由影子内核配合
        const results = {};
        for (const target of this.targets) {
            const start = Date.now();
            try {
                results[target.id] = await this._probe(target.host);
            } catch (e) {
                results[target.id] = -1; // 超时或被封
            }
        }
        return results;
    }

    _probe(host) {
        return new Promise((resolve) => {
            const start = Date.now();
            const req = https.get({
                host: host,
                path: '/',
                agent: this.agent,
                timeout: 5000
            }, (res) => {
                // 只要有握手响应（哪怕是 404/403），说明链路是通的
                const latency = Date.now() - start;
                // 如果返回 403，权重降低，标记为疑似被封
                resolve(res.statusCode === 403 ? latency + 5000 : latency);
                res.destroy();
            });

            req.on('error', () => resolve(-1));
            req.on('timeout', () => {
                req.destroy();
                resolve(-1);
            });
        });
    }
}
