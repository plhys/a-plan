
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import logger from '../../utils/logger.js';

class ClashModule {
    constructor() {
        this.name = 'clash-module';
        this.version = '2.9.0-geek';
        this._config = { 
            enabled: false,
            subUrl: '', 
            port: 7890, 
            routing: {}, 
            secret: 'geek-clash-secret',
            controllerPort: 9090
        };
        this._nodes = [];
        this._process = null;
        this._binPath = path.join(process.cwd(), 'bin', 'mihomo');
        this._configPath = path.join(process.cwd(), 'configs', 'clash-config.yaml');
        this._moduleConfigPath = path.join(process.cwd(), 'configs', 'clash-module.json');
    }

    async init() {
        this._loadConfig();
        // --- 极客优化：禁止自动拉起进程 ---
        // 幽灵模式下或未显式触发时，仅加载配置，不启动 Mihomo 核心
        if (process.env.GHOST_MODE === 'true') {
            logger.info('[Clash-Module] Ghost mode: keeping core silent.');
            return;
        }

        if (this._config.enabled) {
            // await this._startClash(); // 改为手动或按需启动
            logger.info('[Clash-Module] Module initialized, core status: idle.');
        }
        this._startNodesRefresher();
    }

    _loadConfig() {
        try {
            if (existsSync(this._moduleConfigPath)) {
                this._config = { ...this._config, ...JSON.parse(readFileSync(this._moduleConfigPath, 'utf8')) };
            }
        } catch(e) {}
    }

    _saveConfig() {
        writeFileSync(this._moduleConfigPath, JSON.stringify(this._config, null, 2));
    }

    async _ensureBinary() {
        if (!existsSync(this._binPath)) {
            mkdirSync(path.dirname(this._binPath), { recursive: true });
            const url = 'https://github.com/MetaCubeX/mihomo/releases/download/v1.18.3/mihomo-linux-amd64-v1.18.3.gz';
            const cmd = `curl -L ${url} | gunzip > ${this._binPath} && chmod +x ${this._binPath}`;
            await new Promise(r => spawn('sh', ['-c', cmd]).on('close', r));
        }
    }

    async _startClash() {
        if (!this._config.enabled) return;
        await this._ensureBinary();
        this._stopClash();
        this._generateClashConfig();
        
        logger.info(`[Clash-Module] Launching Mihomo core...`);
        this._process = spawn(this._binPath, ['-f', this._configPath], { stdio: 'pipe' });

        this._process.stdout.on('data', (data) => {
            const msg = data.toString();
            if (msg.includes('fatal') || msg.includes('error')) logger.error('[Clash-Core]', msg.trim());
        });

        this._process.stderr.on('data', (data) => {
            const msg = data.toString();
            if (msg.includes('error')) logger.warn('[Clash-Core-Warn]', msg.trim());
        });

        this._process.on('exit', (code) => {
            logger.warn(`[Clash-Module] Mihomo process exited with code ${code}`);
            this._process = null;
        });

        this._process.unref();
        
        // --- 极客细化：极速探测机制 ---
        // 核心拉起后，立即进入高频探测模式，直到抓取到首批节点，不再死等 3 秒
        let attempts = 0;
        const quickRefresher = setInterval(async () => {
            attempts++;
            await this._refreshNodesImmediately();
            if (this._nodes.length > 0 || attempts > 10) {
                clearInterval(quickRefresher);
                logger.info(`[Clash-Module] Core active, fetched ${this._nodes.length} nodes after ${attempts} attempts.`);
            }
        }, 800);
    }

    _stopClash() {
        spawn('pkill', ['-9', '-f', 'bin/mihomo']);
        this._process = null;
    }

    _generateClashConfig() {
        const subPath = path.join(process.cwd(), 'configs', 'clash-sub.yaml');
        let proxiesYaml = '';
        const names = new Set();
        
        if (existsSync(subPath)) {
            const content = readFileSync(subPath, 'utf8');
            const lines = content.split('\n');
            let inProxies = false;
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed === 'proxies:') { inProxies = true; continue; }
                if (inProxies) {
                    // 遇到 proxy-groups 标记说明 proxies 区域结束
                    if (trimmed === 'proxy-groups:') {
                        inProxies = false;
                        continue;
                    }
                    if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('-')) {
                        inProxies = false;
                        continue;
                    }
                    // 忽略不含 type 字段的行（非有效proxy）
                    if (!trimmed.includes('type:')) continue;
                    if (trimmed.includes('name: DIRECT') || trimmed.includes('name: "DIRECT"')) continue;
                    const match = trimmed.match(/name:\s*"?([^",{}]+)"?/);
                    if (match) {
                        const n = match[1].trim();
                        if (n && !['DIRECT', 'REJECT', 'GLOBAL'].includes(n)) {
                            names.add(n);
                            const cleanLine = trimmed.replace(/^-\s*/, '').replace(/^/, '- ');
                            proxiesYaml += '  ' + cleanLine + '\n';
                        }
                    }
                }
            }
        }

        this._nodes = Array.from(names).map(n => ({ name: n, type: 'proxy' }));

        const regions = ['US', 'HK', 'SG', 'JP', 'TW', 'GB', 'DE', 'KR', 'FR', 'RU', 'IN'];
        const dynamicGroups = regions.map(r => {
            const matchedProxies = Array.from(names).filter(n => n.toUpperCase().includes(r));
            if (matchedProxies.length === 0) return null;
            return {
                name: `${r}-Region-Auto`,
                type: 'url-test',
                proxies: matchedProxies
            };
        }).filter(Boolean);

        const configYaml = `
mixed-port: ${this._config.port}
external-controller: 127.0.0.1:${this._config.controllerPort}
secret: "${this._config.secret}"
allow-lan: true
mode: rule
log-level: silent

listeners:
${dynamicGroups.map((g, i) => `  - name: listener-${g.name.toLowerCase()}
    type: mixed
    port: ${19000 + i}
    proxy: "${g.name}"`).join('\n')}

proxies:
${proxiesYaml}

proxy-groups:
  - name: "GLOBAL-GEEK"
    type: select
    proxies: ["AUTO-SELECT", "NODE-SELECT", "DIRECT", ${dynamicGroups.map(g => `"${g.name}"`).join(', ')}]
  - name: "AUTO-SELECT"
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    proxies: ${this._nodes.length > 0 ? JSON.stringify(this._nodes.map(n => n.name)) : '["DIRECT"]'}
  - name: "NODE-SELECT"
    type: select
    proxies: ${this._nodes.length > 0 ? JSON.stringify(this._nodes.map(n => n.name)) : '["DIRECT"]'}
${dynamicGroups.map(g => `
  - name: "${g.name}"
    type: ${g.type}
    url: http://www.gstatic.com/generate_204
    interval: 300
    proxies: ${JSON.stringify(g.proxies)}`).join('')}

rules:
  - MATCH, GLOBAL-GEEK
`;
        writeFileSync(this._configPath, configYaml);
    }

    _getProviderPort(tag) {
        const regions = ['US', 'HK', 'SG', 'JP', 'TW', 'GB', 'DE', 'KR', 'FR', 'RU', 'IN'];
        const idx = regions.indexOf(tag.toUpperCase());
        if (idx !== -1) {
            return 19000 + idx; 
        }
        return this._config.port;
    }

    _startNodesRefresher() {
        if (this._refresher) clearInterval(this._refresher);
        this._refresher = setInterval(() => this._refreshNodesImmediately(), 15000);
    }

    async _refreshNodesImmediately() {
        if (!this._config.enabled) return;
        try {
            const res = await fetch(`http://127.0.0.1:${this._config.controllerPort}/proxies`, { 
                headers: { 'Authorization': `Bearer ${this._config.secret}` } 
            });
            if (res.ok) {
                const data = await res.json();
                const nodeList = [];
                for (const [name, info] of Object.entries(data.proxies || {})) {
                    if (['Selector', 'URLTest', 'Direct', 'Reject', 'Compatible'].includes(info.type)) continue;
                    nodeList.push({ 
                        name, 
                        type: info.type, 
                        delay: info.history && info.history.length > 0 ? info.history[info.history.length-1].delay : 0 
                    });
                }
                if (nodeList.length > 0) this._nodes = nodeList;
            }
        } catch(e) {}
    }

    async testDelay(name) {
        if (!this._config.enabled) return 0;
        try {
            const url = `http://127.0.0.1:${this._config.controllerPort}/proxies/${encodeURIComponent(name)}/delay?timeout=5000&url=http://www.gstatic.com/generate_204`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${this._config.secret}` } });
            if (res.ok) {
                const data = await res.json();
                return data.delay || 0;
            }
        } catch (e) {
            return 0;
        }
    }

    async updateConfig(newConfig) {
        const wasEnabled = this._config.enabled;
        // 支持嵌套更新 routing 对象，而不是简单覆盖
        if (newConfig.routing && typeof newConfig.routing === 'object') {
            this._config.routing = { ...this._config.routing, ...newConfig.routing };
            delete newConfig.routing;
        }
        this._config = { ...this._config, ...newConfig };
        this._saveConfig();
        if (this._config.enabled) {
            if (newConfig.subUrl) await this._downloadSubscription();
            await this._startClash();
        } else if (wasEnabled) {
            this._stopClash();
        }
    }

    async _downloadSubscription() {
        if (!this._config.subUrl) return;
        try {
            const res = await fetch(this._config.subUrl, { headers: { 'User-Agent': 'ClashMeta' }, timeout: 10000 });
            if (res.ok) {
                let content = await res.text();
                if (!content || content.length < 10) throw new Error('Subscription content too short');
                
                // --- 极客增强：Base64 自动识别与 VLESS 转换 ---
                if (!content.includes('proxies:') && !content.includes('port:')) {
                    try {
                        const decoded = Buffer.from(content, 'base64').toString('utf8');
                        if (decoded.includes('://')) {
                            logger.info('[Clash-Module] Detected Base64 subscription, converting nodes...');
                            content = this._convertVlessToYaml(decoded);
                        }
                    } catch (e) {
                        logger.warn('[Clash-Module] Content not YAML, and Base64 decode failed.');
                    }
                }
                
                writeFileSync(path.join(process.cwd(), 'configs', 'clash-sub.yaml'), content);
                logger.info('[Clash-Module] Subscription synchronized.');
            }
        } catch (e) {
            logger.error('[Clash-Module] Failed to download subscription:', e.message);
        }
    }

    /**
     * 极客转换器：将原始链接列表转为 Clash YAML
     */
    _convertVlessToYaml(raw) {
        const lines = raw.split('\n').filter(l => l.trim());
        const proxies = [];
        lines.forEach((line, i) => {
            try {
                if (line.startsWith('vless://')) {
                    const url = new URL(line);
                    const query = new URLSearchParams(url.search);
                    const p = {
                        name: decodeURIComponent(url.hash.substring(1)) || `VLESS-Node-${i}`,
                        type: 'vless',
                        server: url.hostname,
                        port: parseInt(url.port),
                        uuid: url.username,
                        tls: query.get('security') === 'tls',
                        'skip-cert-verify': true,
                        servername: query.get('sni') || url.hostname,
                        network: query.get('type') || 'tcp',
                        'client-fingerprint': 'chrome' // 极客补强：增加浏览器指纹模拟，提高优选节点通过率
                    };
                    if (query.get('type') === 'ws') {
                        p['ws-opts'] = { 
                            path: query.get('path') || '/', 
                            headers: { Host: query.get('host') || url.hostname } 
                        };
                    }
                    proxies.push(p);
                }
            } catch (e) {}
        });
        return `proxies:\n${proxies.map(p => `  - ${JSON.stringify(p)}`).join('\n')}`;
    }

    getMiddleware() {
        return async (config) => {
            // 1. 如果 Clash 模块未启用或未启动核心进程，直接返回
            if (!this._config.enabled || !this._process) return;

            // 2. 获取当前请求的供应商类型 (例如: gemini-cli-oauth)
            const providerType = config.MODEL_PROVIDER;
            
            // 路由逻辑：使用 Clash 模块配置中的路由映射
            const targetTag = this._config.routing?.[providerType];
            
            if (targetTag === 'DIRECT') {
                config.PROXY_URL = null; 
                logger.info(`[Clash-Route] ${providerType} -> DIRECT (Force)`);
            } else if (targetTag && targetTag !== 'GLOBAL') {
                config.PROXY_URL = `http://127.0.0.1:${this._getProviderPort(targetTag)}`;
                logger.info(`[Clash-Route] ${providerType} -> Regional Node: ${targetTag} (port: ${this._getProviderPort(targetTag)})`);
            } else {
                config.PROXY_URL = `http://127.0.0.1:${this._config.port}`;
            }
        };
    }

    getStatus() {
        return { 
            config: this._config, 
            nodes: this._nodes, 
            status: this._nodes.length > 0 ? 'running' : (this._process ? 'initializing' : 'stopped'),
            pid: this._process ? this._process.pid : null,
            uptime: this._process ? Math.floor(process.uptime()) : 0
        };
    }
}

export const clashModule = new ClashModule();
