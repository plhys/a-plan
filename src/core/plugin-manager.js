import { promises as fs } from 'fs';
import logger from '../utils/logger.js';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const PLUGINS_CONFIG_FILE = path.join(process.cwd(), 'configs', 'plugins.json');
const DEFAULT_DISABLED_PLUGINS = ['api-potluck', 'ai-monitor', 'model-usage-stats'];

const PLUGIN_MARKETPLACE = [];

// 插件中文名称映射
const PLUGIN_DISPLAY_NAME_ZH = {
    'default-auth': '默认认证',
    'api-potluck': 'API 套餐',
    'ai-monitor': 'AI 监控',
    'model-usage-stats': '用量统计'
};

export const PLUGIN_TYPE = {
    AUTH: 'auth',
    MIDDLEWARE: 'middleware'
};

class PluginManager {
    constructor() {
        this.plugins = new Map();
        this.pluginsConfig = { plugins: {} };
        this.initialized = false;
        this.globalConfig = null;
    }

    async loadConfig() {
        try {
            const defaultConfig = await this.generateDefaultConfig();
            if (existsSync(PLUGINS_CONFIG_FILE)) {
                const localConfig = JSON.parse(readFileSync(PLUGINS_CONFIG_FILE, 'utf8'));
                if (localConfig.plugins) {
                    for (const name of Object.keys(defaultConfig.plugins)) {
                        if (localConfig.plugins[name]) {
                            defaultConfig.plugins[name].enabled = localConfig.plugins[name].enabled;
                            defaultConfig.plugins[name].config = { ...defaultConfig.plugins[name].config, ...localConfig.plugins[name].config };
                        }
                    }
                }
            }
            this.pluginsConfig = defaultConfig;
        } catch (error) {
            logger.error('[PluginManager] loadConfig Error:', error.message);
        }
    }

    async generateDefaultConfig() {
        const defaultConfig = { plugins: {} };
        const pluginsDir = path.join(process.cwd(), 'src', 'plugins');
        if (existsSync(pluginsDir)) {
            const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    defaultConfig.plugins[entry.name] = { enabled: !DEFAULT_DISABLED_PLUGINS.includes(entry.name), config: {} };
                }
            }
        }
        PLUGIN_MARKETPLACE.forEach(m => {
            if (!defaultConfig.plugins[m.name]) defaultConfig.plugins[m.name] = { enabled: false, config: {} };
        });
        return defaultConfig;
    }

    async saveConfig() {
        try {
            const dir = path.dirname(PLUGINS_CONFIG_FILE);
            if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(PLUGINS_CONFIG_FILE, JSON.stringify(this.pluginsConfig, null, 2), 'utf8');
        } catch (error) {
            logger.error('[PluginManager] saveConfig Error:', error.message);
        }
    }

    async initAll(config) {
        this.globalConfig = config;
        
        // --- 幽灵模式优化：跳过非核心插件加载，但保留鉴权等核心插件 ---
        if (process.env.GHOST_MODE === 'true') {
            logger.info('[PluginManager] Ghost mode active, only loading core plugins (auth).');
            // 只加载鉴权相关的核心插件，确保 API 安全
            await this.loadConfig();
            for (const [name, pConfig] of Object.entries(this.pluginsConfig.plugins)) {
                if (pConfig.enabled === true && (name === 'default-auth' || name.includes('auth'))) {
                    const entryPath = path.join(pluginsDir, name, 'index.js');
                    if (existsSync(entryPath)) {
                        const pluginModule = await import(`file://${entryPath}?boot=${Date.now()}`);
                        const plugin = pluginModule.default || pluginModule;
                        this.plugins.set(name, plugin);
                        if (typeof plugin.init === 'function') await plugin.init(this.globalConfig);
                        plugin._enabled = true;
                    }
                }
            }
            this.initialized = true;
            return;
        }

        await this.loadConfig();
        const pluginsDir = path.join(process.cwd(), 'src', 'plugins');

        // 自愈：已开启但没代码
        for (const [name, pConfig] of Object.entries(this.pluginsConfig.plugins)) {
            if (pConfig.enabled === true) {
                if (!existsSync(path.join(pluginsDir, name, 'index.js'))) {
                    logger.info(`[PluginManager] Healing ${name}...`);
                    await this.installPlugin(name);
                }
            }
        }

        if (existsSync(pluginsDir)) {
            const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
            for (const entry of entries) {
                const entryPath = path.join(pluginsDir, entry.name, 'index.js');
                if (existsSync(entryPath)) {
                    try {
                        const pluginModule = await import(`file://${entryPath}?boot=${Date.now()}`);
                        const plugin = pluginModule.default || pluginModule;
                        if (plugin && plugin.name) {
                            this.plugins.set(plugin.name, plugin);
                            if (this.pluginsConfig.plugins[plugin.name]?.enabled === true) {
                                if (typeof plugin.init === 'function') await plugin.init(this.globalConfig);
                                plugin._enabled = true;
                                if (Array.isArray(plugin.routes) && global.API_ROUTER) {
                                    plugin.routes.forEach(r => global.API_ROUTER[r.method.toLowerCase()](`/api/plugins/${plugin.name}${r.path}`, r.handler));
                                }
                            }
                        }
                    } catch (err) {
                        logger.error(`[PluginManager] Init fail for ${entry.name}:`, err.message);
                    }
                }
            }
        }
        this.initialized = true;
    }

    getPluginList() {
        const list = [];
        const pluginsDir = path.join(process.cwd(), 'src', 'plugins');
        const allNames = new Set([...this.plugins.keys(), ...PLUGIN_MARKETPLACE.map(p => p.name), ...Object.keys(this.pluginsConfig.plugins)]);
        for (const name of allNames) {
            const pConfig = this.pluginsConfig.plugins[name] || {};
            list.push({
                name,
                displayName: PLUGIN_DISPLAY_NAME_ZH[name] || name,
                enabled: pConfig.enabled === true,
                installed: existsSync(path.join(pluginsDir, name, 'index.js')),
                hasRoutes: Array.isArray(this.plugins.get(name)?.routes)
            });
        }
        return list;
    }

    async setPluginEnabled(name, enabled) {
        if (!this.pluginsConfig.plugins[name]) this.pluginsConfig.plugins[name] = { config: {} };
        this.pluginsConfig.plugins[name].enabled = enabled;
        await this.saveConfig();

        let plugin = this.plugins.get(name);
        if (enabled && !plugin) {
            await this._discoverSinglePlugin(name);
            plugin = this.plugins.get(name);
        }

        if (plugin) {
            if (enabled) {
                if (typeof plugin.init === 'function') await plugin.init(this.globalConfig);
                plugin._enabled = true;
                if (Array.isArray(plugin.routes) && global.API_ROUTER) {
                    plugin.routes.forEach(r => global.API_ROUTER[r.method.toLowerCase()](`/api/plugins/${name}${r.path}`, r.handler));
                }
                logger.info(`[PluginManager] Enabled ${name}`);
            } else {
                if (typeof plugin.destroy === 'function') await plugin.destroy();
                plugin._enabled = false;
                logger.info(`[PluginManager] Disabled ${name}`);
            }
        }
    }

    async installPlugin(name) {
        await this._discoverSinglePlugin(name);
        return true;
    }

    async _discoverSinglePlugin(name) {
        const entryPath = path.join(process.cwd(), 'src', 'plugins', name, 'index.js');
        if (existsSync(entryPath)) {
            const module = await import(`file://${entryPath}?upd=${Date.now()}`);
            this.plugins.set(name, module.default || module);
        }
    }

    async executeRoutes(method, path, req, res, config) {
        for (const p of this.plugins.values()) {
            if (!p._enabled || !Array.isArray(p.routes)) continue;
            for (const r of p.routes) {
                const mMatch = r.method === '*' || r.method.toUpperCase() === method;
                // 直接匹配插件定义的路由路径
                if (mMatch && path === r.path) {
                    if (await r.handler(method, path, req, res, config)) return true;
                }
                // 也支持 /api/plugins/{pluginName}{path} 格式
                const pluginPath = `/api/plugins/${p.name}${r.path}`;
                if (mMatch && path === pluginPath) {
                    if (await r.handler(method, path, req, res, config)) return true;
                }
            }
        }
        return false;
    }
    async executeAuth(req, res, url, config) { return { authorized: true }; }
    async executeMiddleware(req, res, url, config) {
        for (const p of this.plugins.values()) { if (p._enabled && typeof p.middleware === 'function') await p.middleware(req, res, url, config); }
        return { handled: false };
    }
    isPluginStaticPath() { return false; }
    getPluginByStaticPath() { return null; }
    async uninstallPlugin(name) {
        const dir = path.join(process.cwd(), 'src', 'plugins', name);
        if (existsSync(dir)) {
            await fs.rm(dir, { recursive: true, force: true });
        }
        
        // 彻底清理配置条目，防止重启后“自愈”系统尝试重新下载或报错
        if (this.pluginsConfig.plugins[name]) {
            delete this.pluginsConfig.plugins[name];
            await this.saveConfig();
            logger.info(`[PluginManager] Cleaned config for ${name}`);
        }

        this.plugins.delete(name);
        return true;
    }
}
const pluginManager = new PluginManager();
export async function discoverPlugins() {}
export function getPluginManager() { return pluginManager; }
export { pluginManager };
