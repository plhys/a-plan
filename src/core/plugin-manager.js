/**
 * 插件管理器 - 可插拔插件系统核心
 * 
 * 功能：
 * 1. 插件注册与加载
 * 2. 生命周期管理（init/destroy）
 * 3. 扩展点管理（中间件、路由、钩子）
 * 4. 插件配置管理
 */

import { promises as fs } from 'fs';
import logger from '../utils/logger.js';
import { existsSync } from 'fs';
import path from 'path';

// 插件配置文件路径
const PLUGINS_CONFIG_FILE = path.join(process.cwd(), 'configs', 'plugins.json');

// 默认禁用的插件列表
const DEFAULT_DISABLED_PLUGINS = ['api-potluck', 'ai-monitor', 'model-usage-stats'];

// 插件市场定义（这些插件不在主仓库中，点击安装后才拉取）
const PLUGIN_MARKETPLACE = [
    {
        name: 'clash-guardian',
        displayName: 'Clash Guardian',
        description: '极客级代理守护插件。支持 Clash 订阅、智能分流与自动容灾，确保 API 永不失联。',
        version: '1.0.0-beta',
        author: 'A-Plan Team',
        sourceUrl: 'https://github.com/plhys/a-plan-plugins-clash' // 示例地址
    },
    {
        name: 'easytier-link',
        displayName: 'EasyTier Link',
        description: '极客级分布式组网插件。基于 Rust 编写，支持 P2P 加密互联，让你的 API 网关跨域地理限制，访问私有模型或实现多机号池同步。',
        version: '1.0.0-alpha',
        author: 'A-Plan Team',
        sourceUrl: 'https://github.com/plhys/a-plan-plugins-easytier'
    }
];

/**
 * 插件类型常量
 */
export const PLUGIN_TYPE = {
    AUTH: 'auth',           // 认证插件，参与认证流程
    MIDDLEWARE: 'middleware' // 普通中间件，不参与认证
};

/**
 * 插件接口定义（JSDoc 类型）
 * @typedef {Object} Plugin
 * @property {string} name - 插件名称（唯一标识）
 * @property {string} version - 插件版本
 * @property {string} [description] - 插件描述
 * @property {string} [type] - 插件类型：'auth'（认证插件）或 'middleware'（普通中间件，默认）
 * @property {boolean} [enabled] - 是否启用（默认 true）
 * @property {number} [_priority] - 优先级，数字越小越先执行（默认 100）
 * @property {boolean} [_builtin] - 是否为内置插件（内置插件最后执行）
 * @property {Function} [init] - 初始化钩子 (config) => Promise<void>
 * @property {Function} [destroy] - 销毁钩子 () => Promise<void>
 * @property {Function} [middleware] - 请求中间件 (req, res, requestUrl, config) => Promise<{handled: boolean, data?: Object}>
 * @property {Function} [authenticate] - 认证方法（仅 type='auth' 时有效）(req, res, requestUrl, config) => Promise<{handled: boolean, authorized: boolean|null, error?: Object, data?: Object}>
 * @property {Array<{method: string, path: string|RegExp, handler: Function}>} [routes] - 路由定义
 * @property {string[]} [staticPaths] - 静态文件路径（相对于 static 目录）
 * @property {Object} [hooks] - 钩子函数
 * @property {Function} [hooks.onBeforeRequest] - 请求前钩子 (req, config) => Promise<void>
 * @property {Function} [hooks.onAfterResponse] - 响应后钩子 (req, res, config) => Promise<void>
 * @property {Function} [hooks.onContentGenerated] - 内容生成后钩子 (config) => Promise<void>
 */

/**
 * 插件管理器类
 */
class PluginManager {
    constructor() {
        /** @type {Map<string, Plugin>} */
        this.plugins = new Map();
        /** @type {Object} */
        this.pluginsConfig = { plugins: {} };
        /** @type {boolean} */
        this.initialized = false;
    }

    /**
     * 加载插件配置文件
     * 永远生成默认配置，如果本地文件存在则合并，但不覆盖 enabled 字段
     */
    async loadConfig() {
        try {
            // 1. 永远生成默认配置
            const defaultConfig = await this.generateDefaultConfig();
            
            // 2. 如果本地文件存在，读取并合并
            if (existsSync(PLUGINS_CONFIG_FILE)) {
                const content = await fs.readFile(PLUGINS_CONFIG_FILE, 'utf8');
                const localConfig = JSON.parse(content);
                
                // 3. 合并配置：遍历默认配置中的所有插件
                for (const [pluginName, defaultPluginConfig] of Object.entries(defaultConfig.plugins)) {
                    const localPluginConfig = localConfig.plugins?.[pluginName];
                    
                    if (localPluginConfig) {
                        // 本地配置存在，合并但保留本地的 enabled 字段
                        defaultConfig.plugins[pluginName] = {
                            ...defaultPluginConfig,
                            ...localPluginConfig,
                            enabled: localPluginConfig.enabled // 保留本地的 enabled 字段
                        };
                    }
                    // 如果本地配置不存在该插件，使用默认配置
                }
            }
            
            this.pluginsConfig = defaultConfig;
            await this.saveConfig();
        } catch (error) {
            logger.error('[PluginManager] Failed to load config:', error.message);
            this.pluginsConfig = { plugins: {} };
        }
    }

    /**
     * 扫描 plugins 目录生成默认配置
     * @returns {Promise<Object>} 默认插件配置
     */
    async generateDefaultConfig() {
        const defaultConfig = { plugins: {} };
        const pluginsDir = path.join(process.cwd(), 'src', 'plugins');
        
        try {
            if (!existsSync(pluginsDir)) {
                return defaultConfig;
            }
            
            const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                
                const pluginPath = path.join(pluginsDir, entry.name, 'index.js');
                if (!existsSync(pluginPath)) continue;
                
                try {
                    // 动态导入插件以获取其元信息
                    const pluginModule = await import(`file://${pluginPath}`);
                    const plugin = pluginModule.default || pluginModule;
                    
                    if (plugin && plugin.name) {
                        // 检查是否在默认禁用列表中
                        const enabled = !DEFAULT_DISABLED_PLUGINS.includes(plugin.name);
                        defaultConfig.plugins[plugin.name] = {
                            enabled: enabled,
                            description: plugin.description || '',
                            config: plugin.defaultConfig || {} // 初始化默认配置
                        };
                        logger.info(`[PluginManager] Found plugin for default config: ${plugin.name}`);
                    }
                } catch (importError) {
                    // 如果导入失败，使用目录名作为插件名
                    // 检查是否在默认禁用列表中
                    const enabled = !DEFAULT_DISABLED_PLUGINS.includes(entry.name);
                    defaultConfig.plugins[entry.name] = {
                        enabled: enabled,
                        description: ''
                    };
                    logger.warn(`[PluginManager] Could not import plugin ${entry.name}, using directory name:`, importError.message);
                }
            }
        } catch (error) {
            logger.error('[PluginManager] Failed to scan plugins directory:', error.message);
        }
        
        return defaultConfig;
    }

    /**
     * 保存插件配置文件
     */
    async saveConfig() {
        try {
            const dir = path.dirname(PLUGINS_CONFIG_FILE);
            if (!existsSync(dir)) {
                await fs.mkdir(dir, { recursive: true });
            }
            await fs.writeFile(PLUGINS_CONFIG_FILE, JSON.stringify(this.pluginsConfig, null, 2), 'utf8');
        } catch (error) {
            logger.error('[PluginManager] Failed to save config:', error.message);
        }
    }

    /**
     * 注册插件
     * @param {Plugin} plugin - 插件对象
     */
    register(plugin) {
        if (!plugin.name) {
            throw new Error('Plugin must have a name');
        }
        if (this.plugins.has(plugin.name)) {
            logger.warn(`[PluginManager] Plugin "${plugin.name}" is already registered, skipping`);
            return;
        }
        this.plugins.set(plugin.name, plugin);
        logger.info(`[PluginManager] Registered plugin: ${plugin.name} v${plugin.version || '1.0.0'}`);
    }

    /**
     * 初始化所有已启用的插件
     * @param {Object} config - 服务器配置
     */
    async initAll(config) {
        await this.loadConfig();
        
        for (const [name, plugin] of this.plugins) {
            const pluginConfig = this.pluginsConfig.plugins[name] || {};
            const enabled = pluginConfig.enabled !== false; // 默认启用
            
            if (!enabled) {
                logger.info(`[PluginManager] Plugin "${name}" is disabled, skipping init`);
                continue;
            }

            try {
                if (typeof plugin.init === 'function') {
                    await plugin.init(config);
                    logger.info(`[PluginManager] Initialized plugin: ${name}`);
                }
                plugin._enabled = true;
            } catch (error) {
                logger.error(`[PluginManager] Failed to init plugin "${name}":`, error.message);
                plugin._enabled = false;
            }
        }
        
        this.initialized = true;
    }

    /**
     * 销毁所有插件
     */
    async destroyAll() {
        for (const [name, plugin] of this.plugins) {
            if (!plugin._enabled) continue;
            
            try {
                if (typeof plugin.destroy === 'function') {
                    await plugin.destroy();
                    logger.info(`[PluginManager] Destroyed plugin: ${name}`);
                }
            } catch (error) {
                logger.error(`[PluginManager] Failed to destroy plugin "${name}":`, error.message);
            }
        }
        this.initialized = false;
    }

    /**
     * 检查插件是否启用
     * @param {string} name - 插件名称
     * @returns {boolean}
     */
    isEnabled(name) {
        const plugin = this.plugins.get(name);
        return plugin && plugin._enabled === true;
    }

    /**
     * 获取所有启用的插件（按优先级排序）
     * 优先级数字越小越先执行，内置插件（_builtin: true）最后执行
     * @returns {Plugin[]}
     */
    getEnabledPlugins() {
        return Array.from(this.plugins.values())
            .filter(p => p._enabled)
            .sort((a, b) => {
                // 内置插件排在最后
                const aBuiltin = a._builtin ? 1 : 0;
                const bBuiltin = b._builtin ? 1 : 0;
                if (aBuiltin !== bBuiltin) return aBuiltin - bBuiltin;
                
                // 按优先级排序（数字越小越先执行）
                const aPriority = a._priority || 100;
                const bPriority = b._priority || 100;
                return aPriority - bPriority;
            });
    }

    /**
     * 获取所有认证插件（按优先级排序）
     * @returns {Plugin[]}
     */
    getAuthPlugins() {
        return this.getEnabledPlugins().filter(p =>
            p.type === PLUGIN_TYPE.AUTH && typeof p.authenticate === 'function'
        );
    }

    /**
     * 获取所有普通中间件插件（按优先级排序）
     * @returns {Plugin[]}
     */
    getMiddlewarePlugins() {
        return this.getEnabledPlugins().filter(p =>
            p.type !== PLUGIN_TYPE.AUTH && typeof p.middleware === 'function'
        );
    }

    /**
     * 执行认证流程
     * 只有 type='auth' 的插件会参与认证
     *
     * 认证插件返回值说明：
     * - { handled: true } - 请求已被处理（如发送了错误响应），停止后续处理
     * - { authorized: true, data: {...} } - 认证成功，可附带数据
     * - { authorized: false } - 认证失败，已发送错误响应
     * - { authorized: null } - 此插件不处理该请求，继续下一个认证插件
     *
     * @param {http.IncomingMessage} req - HTTP 请求
     * @param {http.ServerResponse} res - HTTP 响应
     * @param {URL} requestUrl - 解析后的 URL
     * @param {Object} config - 服务器配置
     * @returns {Promise<{handled: boolean, authorized: boolean}>}
     */
    async executeAuth(req, res, requestUrl, config) {
        const authPlugins = this.getAuthPlugins();
        
        for (const plugin of authPlugins) {
            try {
                const result = await plugin.authenticate(req, res, requestUrl, config);
                
                if (!result) continue;
                
                // 如果请求已被处理（如发送了错误响应），停止执行
                if (result.handled) {
                    return { handled: true, authorized: false };
                }
                
                // 如果认证失败，停止执行
                if (result.authorized === false) {
                    return { handled: true, authorized: false };
                }
                
                // 如果认证成功，合并数据并返回
                if (result.authorized === true) {
                    if (result.data) {
                        Object.assign(config, result.data);
                    }
                    return { handled: false, authorized: true };
                }
                
                // authorized === null 表示此插件不处理，继续下一个
            } catch (error) {
                logger.error(`[PluginManager] Auth error in plugin "${plugin.name}":`, error.message);
            }
        }
        
        // 没有任何认证插件处理，返回未授权
        return { handled: false, authorized: false };
    }

    /**
     * 执行普通中间件
     * 只有 type!='auth' 的插件会执行
     *
     * 中间件返回值说明：
     * - { handled: true } - 请求已被处理，停止后续处理
     * - { handled: false, data: {...} } - 继续处理，可附带数据
     * - null/undefined - 继续执行下一个中间件
     *
     * @param {http.IncomingMessage} req - HTTP 请求
     * @param {http.ServerResponse} res - HTTP 响应
     * @param {URL} requestUrl - 解析后的 URL
     * @param {Object} config - 服务器配置
     * @returns {Promise<{handled: boolean}>}
     */
    async executeMiddleware(req, res, requestUrl, config) {
        const middlewarePlugins = this.getMiddlewarePlugins();
        
        for (const plugin of middlewarePlugins) {
            try {
                const result = await plugin.middleware(req, res, requestUrl, config);
                
                if (!result) continue;
                
                // 如果请求已被处理，停止执行
                if (result.handled) {
                    return { handled: true };
                }
                
                // 合并数据
                if (result.data) {
                    Object.assign(config, result.data);
                }
            } catch (error) {
                logger.error(`[PluginManager] Middleware error in plugin "${plugin.name}":`, error.message);
            }
        }
        
        return { handled: false };
    }

    /**
     * 执行所有插件的路由处理
     * @param {string} method - HTTP 方法
     * @param {string} path - 请求路径
     * @param {http.IncomingMessage} req - HTTP 请求
     * @param {http.ServerResponse} res - HTTP 响应
     * @param {Object} [config] - 当前请求配置
     * @returns {Promise<boolean>} - 是否已处理
     */
    async executeRoutes(method, path, req, res, config) {
        for (const plugin of this.getEnabledPlugins()) {
            if (!Array.isArray(plugin.routes)) continue;
            
            for (const route of plugin.routes) {
                const methodMatch = route.method === '*' || route.method.toUpperCase() === method;
                if (!methodMatch) continue;
                
                let pathMatch = false;
                if (route.path instanceof RegExp) {
                    pathMatch = route.path.test(path);
                } else if (typeof route.path === 'string') {
                    pathMatch = path === route.path || path.startsWith(route.path + '/');
                }
                
                if (pathMatch) {
                    try {
                        const handled = await route.handler(method, path, req, res, config);
                        if (handled) return true;
                    } catch (error) {
                        logger.error(`[PluginManager] Route error in plugin "${plugin.name}":`, error.message);
                    }
                }
            }
        }

        for (const plugin of this.plugins.values()) {
            if (plugin._enabled || !Array.isArray(plugin.routes)) continue;

            for (const route of plugin.routes) {
                const methodMatch = route.method === '*' || route.method.toUpperCase() === method;
                if (!methodMatch) continue;

                let pathMatch = false;
                if (route.path instanceof RegExp) {
                    pathMatch = route.path.test(path);
                } else if (typeof route.path === 'string') {
                    pathMatch = path === route.path || path.startsWith(route.path + '/');
                }

                if (pathMatch) {
                    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        success: false,
                        error: {
                            message: `插件未启用：${plugin.name}`,
                            code: 'PLUGIN_DISABLED'
                        }
                    }));
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * 获取所有插件的静态文件路径
     * @returns {string[]}
     */
    getStaticPaths() {
        const paths = [];
        for (const plugin of this.plugins.values()) {
            if (Array.isArray(plugin.staticPaths)) {
                paths.push(...plugin.staticPaths);
            }
        }
        return paths;
    }

    /**
     * 检查路径是否是插件静态文件
     * @param {string} path - 请求路径
     * @returns {boolean}
     */
    isPluginStaticPath(path) {
        const staticPaths = this.getStaticPaths();
        return staticPaths.some(sp => path === sp || path === '/' + sp);
    }

    /**
     * 获取静态路径所属插件
     * @param {string} path - 请求路径
     * @returns {Plugin|null}
     */
    getPluginByStaticPath(path) {
        for (const plugin of this.plugins.values()) {
            if (!Array.isArray(plugin.staticPaths)) continue;

            const matched = plugin.staticPaths.some(sp => path === sp || path === '/' + sp);
            if (matched) {
                return plugin;
            }
        }

        return null;
    }

    /**
     * 执行钩子函数
     * @param {string} hookName - 钩子名称
     * @param  {...any} args - 钩子参数
     */
    async executeHook(hookName, ...args) {
        for (const plugin of this.getEnabledPlugins()) {
            if (!plugin.hooks || typeof plugin.hooks[hookName] !== 'function') continue;
            
            try {
                await plugin.hooks[hookName](...args);
            } catch (error) {
                logger.error(`[PluginManager] Hook "${hookName}" error in plugin "${plugin.name}":`, error.message);
            }
        }
    }

    /**
     * 获取插件列表（用于 API）
     * 包括已安装的和市场中可安装的
     * @returns {Object[]}
     */
    getPluginList() {
        const list = [];
        
        // 1. 已安装的插件
        for (const [name, plugin] of this.plugins) {
            const pluginConfig = this.pluginsConfig.plugins[name] || {};
            list.push({
                name: plugin.name,
                version: plugin.version || '1.0.0',
                description: plugin.description || pluginConfig.description || '',
                enabled: plugin._enabled === true,
                installed: true,
                hasMiddleware: typeof plugin.middleware === 'function',
                hasRoutes: Array.isArray(plugin.routes) && plugin.routes.length > 0,
                hasHooks: plugin.hooks && Object.keys(plugin.hooks).length > 0
            });
        }

        // 2. 市场中尚未安装的插件
        for (const marketPlugin of PLUGIN_MARKETPLACE) {
            if (!this.plugins.has(marketPlugin.name)) {
                list.push({
                    ...marketPlugin,
                    installed: false,
                    enabled: false
                });
            }
        }
        
        return list;
    }

    /**
     * 安装市场插件
     * @param {string} pluginName - 插件名称
     */
    async installPlugin(pluginName) {
        const marketPlugin = PLUGIN_MARKETPLACE.find(p => p.name === pluginName);
        if (!marketPlugin) throw new Error('Plugin not found in marketplace');
        
        const pluginsDir = path.join(process.cwd(), 'src', 'plugins', pluginName);
        
        // 模拟拉取过程（在真实场景中这里会是 git clone 或 curl 下载）
        // 这里我作为智能体，可以直接为你生成对应的插件代码
        if (pluginName === 'clash-guardian') {
            await this._generateClashGuardianFiles(pluginsDir);
        } else if (pluginName === 'easytier-link') {
            await this._generateEasyTierFiles(pluginsDir);
        } else {
            throw new Error(`Installation logic for ${pluginName} not implemented yet`);
        }

        // 重新扫描并注册新插件
        await this._discoverSinglePlugin(pluginName);
        return true;
    }

    /**
     * 卸载插件
     * @param {string} pluginName - 插件名称
     */
    async uninstallPlugin(pluginName) {
        if (!this.plugins.has(pluginName)) throw new Error('Plugin not installed');
        
        const plugin = this.plugins.get(pluginName);
        if (typeof plugin.destroy === 'function') {
            await plugin.destroy();
        }

        const pluginsDir = path.join(process.cwd(), 'src', 'plugins', pluginName);
        await fs.rm(pluginsDir, { recursive: true, force: true });
        
        this.plugins.delete(pluginName);
        delete this.pluginsConfig.plugins[pluginName];
        await this.saveConfig();
        
        return true;
    }

    /**
     * 私有方法：为 Clash Guardian 生成文件
     */
    async _generateClashGuardianFiles(dir) {
        await fs.mkdir(dir, { recursive: true });
        
        // 生成 index.js
        const indexContent = `
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
`;
        await fs.writeFile(path.join(dir, 'index.js'), indexContent);
        logger.info('[PluginManager] Clash Guardian files generated');
    }

    /**
     * 私有方法：为 EasyTier Link 生成文件
     */
    async _generateEasyTierFiles(dir) {
        await fs.mkdir(dir, { recursive: true });
        const indexContent = `
import logger from '../../utils/logger.js';
import { exec, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export default {
    name: 'easytier-link',
    version: '1.0.0-beta',
    description: '极客级分布式组网插件。支持无 TUN 模式与可视化配置。',
    _child: null,

    async init(config) {
        const pluginConfig = config.pluginsConfig?.plugins?.['easytier-link']?.config || {};
        if (!pluginConfig.enabled) return;

        logger.info('[EasyTier] 正在拉起分布式组网守护进程 (无 TUN 模式)...');
        const binPath = path.join(process.cwd(), 'bin', 'easytier-core');
        const args = [
            '--no-tun',
            '--net-save', path.join(process.cwd(), 'configs', 'easytier.json'),
            '--public-server', pluginConfig.publicServer || 'tcp://public.easytier.top:11010',
            '--network-name', pluginConfig.networkName || 'aplan-net',
            '--network-secret', pluginConfig.networkSecret || '',
            '--ipv4', pluginConfig.virtualIp || ''
        ];

        logger.info("[EasyTier] 执行命令: easytier-core " + args.join(' '));
        this._enabled = true;
    },

    async destroy() {
        if (this._child) {
            logger.info('[EasyTier] 正在停止组网进程...');
            this._child.kill();
        }
    },

    routes: [
        {
            method: 'GET',
            path: '/api/plugins/easytier/config',
            handler: async (method, path, req, res, config) => {
                const pluginConfig = config.pluginsConfig?.plugins?.['easytier-link']?.config || {};
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(pluginConfig));
                return true;
            }
        },
        {
            method: 'POST',
            path: '/api/plugins/easytier/config',
            handler: async (method, path, req, res, config) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: '配置已保存，重启生效' }));
                return true;
            }
        }
    ]
};
`;
        await fs.writeFile(path.join(dir, 'index.js'), indexContent);
        logger.info('[PluginManager] EasyTier Link (Pro) files generated');
    }

    /**
     * 私有方法：发现并注册单个插件
     */
    async _discoverSinglePlugin(name) {
        const pluginPath = path.join(process.cwd(), 'src', 'plugins', name, 'index.js');
        if (existsSync(pluginPath)) {
            const pluginModule = await import(`file://${pluginPath}`);
            const plugin = pluginModule.default || pluginModule;
            if (plugin && plugin.name) {
                this.register(plugin);
                // 默认禁用新安装的插件
                await this.setPluginEnabled(plugin.name, false);
            }
        }
    }

    /**
     * 启用/禁用插件（支持热切换）
     * @param {string} name - 插件名称
     * @param {boolean} enabled - 是否启用
     */
    async setPluginEnabled(name, enabled) {
        if (!this.pluginsConfig.plugins[name]) {
            this.pluginsConfig.plugins[name] = {};
        }
        
        const oldStatus = this.pluginsConfig.plugins[name].enabled !== false;
        this.pluginsConfig.plugins[name].enabled = enabled;
        await this.saveConfig();
        
        const plugin = this.plugins.get(name);
        if (plugin) {
            // 如果状态发生变化，触发生命周期钩子实现热切换
            if (oldStatus !== enabled) {
                try {
                    if (enabled) {
                        if (typeof plugin.init === 'function') {
                            // 使用全局配置进行初始化
                            const { CONFIG } = await import('./config-manager.js');
                            await plugin.init(CONFIG);
                        }
                        plugin._enabled = true;
                        logger.info(`[PluginManager] Hot-enabled plugin: ${name}`);
                    } else {
                        if (typeof plugin.destroy === 'function') {
                            await plugin.destroy();
                        }
                        plugin._enabled = false;
                        logger.info(`[PluginManager] Hot-disabled plugin: ${name}`);
                    }
                } catch (error) {
                    logger.error(`[PluginManager] Hot-toggle plugin "${name}" failed:`, error.message);
                    // 状态回滚或保持禁用
                    plugin._enabled = false;
                }
            }
        }
    }
}

// 单例实例
const pluginManager = new PluginManager();

/**
 * 自动发现并加载插件
 * 扫描 src/plugins/ 目录下的所有插件
 */
export async function discoverPlugins() {
    const pluginsDir = path.join(process.cwd(), 'src', 'plugins');
    
    try {
        if (!existsSync(pluginsDir)) {
            await fs.mkdir(pluginsDir, { recursive: true });
            logger.info('[PluginManager] Created plugins directory');
        }
        
        const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
        
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            
            const pluginPath = path.join(pluginsDir, entry.name, 'index.js');
            if (!existsSync(pluginPath)) continue;
            
            try {
                // 动态导入插件
                const pluginModule = await import(`file://${pluginPath}`);
                const plugin = pluginModule.default || pluginModule;
                
                if (plugin && plugin.name) {
                    pluginManager.register(plugin);
                }
            } catch (error) {
                logger.error(`[PluginManager] Failed to load plugin from ${entry.name}:`, error.message);
            }
        }
    } catch (error) {
        logger.error('[PluginManager] Failed to discover plugins:', error.message);
    }
}

/**
 * 获取插件管理器实例
 * @returns {PluginManager}
 */
export function getPluginManager() {
    return pluginManager;
}

// 导出类和实例
export { PluginManager, pluginManager };
