import 'dotenv/config';
import '../converters/register-converters.js';
import logger from '../utils/logger.js';
import * as http from 'http';
import { initializeConfig, CONFIG } from '../core/config-manager.js';
import { initApiService } from './service-manager.js';
import { initializeAPIManagement } from './api-manager.js';
import { discoverPlugins, getPluginManager } from '../core/plugin-manager.js';
import { getTLSSidecar } from '../utils/tls-sidecar.js';
import { getProviderPoolManager } from './service-manager.js';
import { isRetryableNetworkError } from '../utils/common.js';
import { getGitSyncManager } from './git-sync-manager.js';

let serverInstance = null;
let requestHandlerInstance = null;
let isTaskRunning = {
    heartbeat: false,
    healthCheck: false
};

// 4.0 核心状态：标记核心逻辑是否已加载完成
global.CORE_READY = false;
global.BOOTSTRAP_ERROR = null;

async function gracefulShutdown() {
    logger.info('[A-Plan] Initiating graceful shutdown...');
    
    try {
        const poolManager = getProviderPoolManager();
        if (poolManager && typeof poolManager.flush === 'function') {
            await poolManager.flush();
        }
    } catch (err) {
        logger.error('[A-Plan] Pool flush failed:', err.message);
    }

    const gitSyncManager = getGitSyncManager();
    if (gitSyncManager) {
        gitSyncManager.stop();
        if (gitSyncManager.config?.GIT_SYNC?.enabled && gitSyncManager.config?.GIT_SYNC?.repoUrl) {
            logger.info('[A-Plan] Performing final configuration sync before exit...');
            try {
                await gitSyncManager.sync();
            } catch (err) {
                logger.error('[A-Plan] Final Git sync failed:', err.message);
            }
        }
    }

    try {
        await getTLSSidecar().stop();
    } catch { /* ignore */ }

    if (serverInstance) {
        serverInstance.close(() => {
            logger.info('[A-Plan] HTTP server closed');
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 3000);
    } else {
        process.exit(0);
    }
}

function setupSignalHandlers() {
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
    process.on('message', (msg) => {
        if (msg && msg.type === 'shutdown') {
            logger.info('[A-Plan] Received shutdown signal from Master');
            gracefulShutdown();
        }
    });

    process.on('uncaughtException', (error) => {
        logger.error('[A-Plan] Uncaught exception:', error);
        if (!isRetryableNetworkError(error)) {
            gracefulShutdown();
        }
    });
}

/**
 * 4.0 幽灵架构：启动函数
 */
async function startServer() {
    // 4.2.6 极客适配：在抢占端口前，优先尝试预加载基础配置，确保 PORT 意图正确
    const configPath = 'configs/config.json';
    let PRE_PORT = parseInt(process.env.A_PORT || process.env.SERVER_PORT || process.env.PORT);

    if (isNaN(PRE_PORT)) {
        try {
            if (fs.existsSync(configPath)) {
                const preConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                PRE_PORT = preConfig.SERVER_PORT;
            }
        } catch (e) {
            // 忽略读取错误，回退到默认
        }
    }

    const PORT = PRE_PORT || 18781;
    const HOST = process.env.HOST || '0.0.0.0';

    // 2. 立即创建 HTTP 实例并监听端口 (V2 般的秒开感)
    serverInstance = http.createServer({
        requestTimeout: 0,
        headersTimeout: 60000,
        keepAliveTimeout: 65000
    }, async (req, res) => {
        // 如果核心逻辑还没加载完，返回 503 让客户端重试，但不挂断连接
        if (!global.CORE_READY || !requestHandlerInstance) {
            if (global.BOOTSTRAP_ERROR) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                return res.end(`A-Plan 4.0 Bootstrap Failed: ${global.BOOTSTRAP_ERROR.message}`);
            }
            res.writeHead(503, { 
                'Content-Type': 'text/plain; charset=utf-8',
                'Retry-After': '1' 
            });
            return res.end('A-Plan 4.0 Core is booting up... Please retry in a second.');
        }
        // 核心已就绪，交给正式处理器
        return requestHandlerInstance(req, res);
    });

    serverInstance.listen(PORT, HOST, () => {
        const VERSION = process.env.APP_VERSION || '4.2.7';
        logger.info(`🚀 [A-Plan v${VERSION}] Listening on port ${PORT}. Hydrating core...`);
        
        // 3. 在端口开启后的“背景音”里，异步执行重型初始化
        bootstrapCore().catch(err => {
            global.BOOTSTRAP_ERROR = err;
            const VERSION = process.env.APP_VERSION || '4.2.7';
            logger.error(`[A-Plan v${VERSION}] Critical Bootstrap Failure:`, err.message);
        });
    });
}

/**
 * 4.0 核心异步激活函数
 */
async function bootstrapCore() {
    const startTime = Date.now();
    
    // 1. 加载完整配置并初始化日志系统
    await initializeConfig(process.argv.slice(2), 'configs/config.json');
    
    // 2. 4.0 增强：立即开启 UI 日志遥测，让启动过程在 Web 上可见
    const { initializeUIManagement } = await import('../ui-modules/event-broadcast.js');
    initializeUIManagement();
    
    // 环境优化
    if (process.env.CORE_ONLY === 'true' || process.env.LITE_MODE === 'true' || process.env.GHOST_MODE === 'true') {
        CONFIG.CORE_ONLY = true;
        CONFIG.UI_ENABLED = false;
        CONFIG.PLUGINS_ENABLED = true; 
        logger.info(`🚀 [A-Plan v4.2.5] Running in ${process.env.GHOST_MODE === 'true' ? 'GHOST' : 'CORE_ONLY'} mode`);
    }

    // 异步启动 Sidecar
    if (CONFIG.TLS_SIDECAR_ENABLED) {
        getTLSSidecar().start({
            port: CONFIG.TLS_SIDECAR_PORT,
            binaryPath: CONFIG.TLS_SIDECAR_BINARY_PATH || undefined,
        }).catch(e => logger.error('[Sidecar] Failed:', e.message));
    }

    // 插件系统：仅在非精简模式下加载
    if (!CONFIG.CORE_ONLY) {
        // 【修正】统一使用 initAll 传入 CONFIG
        await getPluginManager().initAll(CONFIG);
    }

    // 核心业务初始化
    const services = await initApiService(CONFIG, true);
    
    // 【极客增强】将 Express Router 暴露给全局，支持插件动态挂载路由
    global.API_ROUTER = services.router;

    const heartbeatAndRefreshToken = initializeAPIManagement(services);
    
    // 动态导入请求处理器
    const { createRequestHandler } = await import('../handlers/request-handler.js');
    requestHandlerInstance = createRequestHandler(CONFIG, getProviderPoolManager());

    // 启动 Git 同步
    const gitSyncManager = getGitSyncManager(CONFIG);
    if (gitSyncManager) {
        gitSyncManager.init().then(async () => {
            // 4.0 增强：首拉完成后，自动重载内存配置以恢复云端设置
            logger.info('[A-Plan 4.0] Initial Git Pull finished, syncing memory state...');
            const { reloadConfig } = await import('../ui-modules/config-api.js');
            await reloadConfig(getProviderPoolManager());
        }).catch(e => logger.error('[GitSync] Error:', e.message));
    }

    // 启动定时任务
    setupBackgroundTasks(heartbeatAndRefreshToken);

    // 标记就绪
    global.CORE_READY = true;
    const duration = Date.now() - startTime;
    logger.info(`✅ [A-Plan 4.0] Core Hydrated in ${duration}ms. Full monster mode engaged.`);
}

function setupBackgroundTasks(heartbeatAndRefreshToken) {
    if (CONFIG.CRON_REFRESH_TOKEN) {
        setInterval(async () => {
            if (isTaskRunning.heartbeat) return;
            isTaskRunning.heartbeat = true;
            try { await heartbeatAndRefreshToken(); } finally { isTaskRunning.heartbeat = false; }
        }, CONFIG.CRON_NEAR_MINUTES * 60 * 1000);
    }

    const poolManager = getProviderPoolManager();
    if (poolManager) {
        // [极客模式] 启动时延迟执行健康检查，避免 POD 重建瞬间的网络风暴
        const initialCheckDelay = (CONFIG.SCHEDULED_HEALTH_CHECK?.initialDelay || 60000);
        setTimeout(() => {
            if (CONFIG.SCHEDULED_HEALTH_CHECK?.enabled) {
                poolManager.performInitialHealthChecks();
            }
        }, initialCheckDelay);

        setInterval(async () => {
            if (isTaskRunning.healthCheck) return;
            if (!CONFIG.SCHEDULED_HEALTH_CHECK?.enabled) return;
            isTaskRunning.healthCheck = true;
            try { await poolManager.performHealthChecks(); } finally { isTaskRunning.healthCheck = false; }
        }, (CONFIG.SCHEDULED_HEALTH_CHECK?.interval || 300000));
    }
}

setupSignalHandlers();
startServer().catch(err => {
    logger.error("[A-Plan 4.0] Fatal Start Error:", err.message);
    process.exit(1);
});
