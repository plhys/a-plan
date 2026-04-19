import { promises as fs } from 'fs';
import logger from '../utils/logger.js';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const PLUGINS_CONFIG_FILE = path.join(process.cwd(), 'configs', 'plugins.json');
const DEFAULT_DISABLED_PLUGINS = ['api-potluck', 'ai-monitor', 'model-usage-stats'];

const PLUGIN_MARKETPLACE = [];

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
                // 【极客强化】强制路径对齐
                const targetPath = `/api/plugins/${p.name}${r.path}`;
                if (mMatch && path === targetPath) {
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
        if (existsSync(dir)) await fs.rm(dir, { recursive: true, force: true });
        this.plugins.delete(name);
        return true;
    }
}
const pluginManager = new PluginManager();
export async function discoverPlugins() {}
export function getPluginManager() { return pluginManager; }
export { pluginManager };
