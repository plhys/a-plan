
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
        if (this._config.enabled) {
            await this._startClash();
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
        setTimeout(() => this._refreshNodesImmediately(), 3000);
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
                    if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('-')) {
                        inProxies = false;
                        continue;
                    }
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

        // 极客分流：按地区关键词自动创建 Proxy Group
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
log-level: info

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

    _getProviderPort(provider) {
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
                    nodeList.push({ name, type: info.type });
                }
                if (nodeList.length > 0) this._nodes = nodeList;
            }
        } catch(e) {}
    }

    async updateConfig(newConfig) {
        const wasEnabled = this._config.enabled;
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
            const res = await fetch(this._config.subUrl, { headers: { 'User-Agent': 'ClashMeta' } });
            if (res.ok) {
                writeFileSync(path.join(process.cwd(), 'configs', 'clash-sub.yaml'), await res.text());
            }
        } catch (e) {
            logger.error('[Clash-Module] Failed to download subscription:', e.message);
        }
    }

    getMiddleware() {
        return async (config) => {
            if (!this._config.enabled) return;
            // 极客逻辑：实现“号池节点标签分流”
            // 如果节点带了 PROXY_TAG 属性（如 "US", "HK"）
            const tag = config.PROXY_TAG || null;
            if (tag) {
                const groupName = `${tag.toUpperCase()}-Region-Auto`;
                try {
                    // 通过 Clash 控制 API 动态切换该请求所在分组的选择（或通过特定逻辑实现）
                    // 极致轻量做法：Clash 核心目前暂用 GLOBAL-GEEK 统一出口，
                    // 待后续版本支持多监听端口后，可实现真正的物理端口分流。
                    config.PROXY_URL = `http://127.0.0.1:${this._config.port}`;
                } catch(e) {}
            } else {
                config.PROXY_URL = `http://127.0.0.1:${this._config.port}`;
            }
        };
    }

    getStatus() {
        return { config: this._config, nodes: this._nodes, status: this._nodes.length > 0 ? 'running' : 'initializing' };
    }
}

export const clashModule = new ClashModule();
