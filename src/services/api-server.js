import 'dotenv/config';
import '../converters/register-converters.js';
import logger from '../utils/logger.js';
import * as http from 'http';
import { initializeConfig, CONFIG } from '../core/config-manager.js';
import { initApiService } from './service-manager.js';
import { initializeAPIManagement } from './api-manager.js';
import { discoverPlugins, getPluginManager } from '../core/plugin-manager.js';
import { createRequestHandler } from '../handlers/request-handler.js';
import { getTLSSidecar } from '../utils/tls-sidecar.js';
import { HEALTH_CHECK } from '../utils/constants.js';
import { getProviderPoolManager } from './service-manager.js';
import { isRetryableNetworkError } from '../utils/common.js';
import { getGitSyncManager } from './git-sync-manager.js';

let serverInstance = null;
let isTaskRunning = {
    heartbeat: false,
    healthCheck: false
};

async function gracefulShutdown() {
    logger.info('[A-Plan] Initiating graceful shutdown...');
    
    // 1. 强制刷新提供商池缓存到磁盘
    try {
        const poolManager = getProviderPoolManager();
        if (poolManager && typeof poolManager.flush === 'function') {
            await poolManager.flush();
        }
    } catch (err) {
        logger.error('[A-Plan] Pool flush failed:', err.message);
    }

    // 2. Stop and perform final Git sync
    const gitSyncManager = getGitSyncManager();
    if (gitSyncManager) {
        gitSyncManager.stop();
        // 只有开启了同步且有远程仓库时才执行
        if (gitSyncManager.config?.GIT_SYNC?.enabled && gitSyncManager.config?.GIT_SYNC?.repoUrl) {
            logger.info('[A-Plan] Performing final configuration sync before exit...');
            try {
                // 强制执行一次推送到远程，防止 Pod 销毁时丢配置
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
        // 3秒强制超时退出
        setTimeout(() => process.exit(1), 3000);
    } else {
        process.exit(0);
    }
}

function setupSignalHandlers() {
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
    // 监听主进程发来的 IPC 信号
    process.on('message', (msg) => {
        if (msg && msg.type === 'shutdown') {
            logger.info('[A-Plan] Received shutdown signal from Master');
            gracefulShutdown();
        }
    });

    process.on('uncaughtException', (error) => {
        logger.error('[A-Plan] Uncaught exception:', error);
        // Keep running for retryable errors, else shutdown
        if (!isRetryableNetworkError(error)) {
            gracefulShutdown();
        }
    });
}

async function startServer() {
    await initializeConfig(process.argv.slice(2), 'configs/config.json');
    
    // Core optimization: Minimal Mode if specified, but default keeps UI
    if (process.env.CORE_ONLY === 'true' || process.env.LITE_MODE === 'true') {
        CONFIG.CORE_ONLY = true;
        CONFIG.UI_ENABLED = false;
        // In CORE_ONLY mode, we still enable the plugin SYSTEM for auth, 
        // but individual non-auth plugins can be disabled via configs/plugins.json
        CONFIG.PLUGINS_ENABLED = true; 
        logger.info('[A-Plan] 🚀 Running in CORE_ONLY mode (UI/Extended Stats disabled, Auth-Engine active)');
    }

    if (CONFIG.TLS_SIDECAR_ENABLED) {
        await getTLSSidecar().start({
            port: CONFIG.TLS_SIDECAR_PORT,
            binaryPath: CONFIG.TLS_SIDECAR_BINARY_PATH || undefined,
        });
    }

    // Initialize plugin system (Mandatory for Auth)
    logger.info('[Initialization] Discovering and initializing plugins...');
    await discoverPlugins();
    const pluginManager = getPluginManager();
    await pluginManager.initAll(CONFIG);
    
    // Log loaded plugins
    const pluginList = pluginManager.getPluginList();
    if (pluginList.length > 0) {
        console.log('\n🧩 [Module System] Active Plugins:');
        pluginList.forEach(p => {
            const status = p.enabled ? '✅' : '⚪';
            console.log(`  ${status} ${p.name.padEnd(20)} v${(p.version || '1.0.0').padEnd(10)} [${p.enabled ? 'LOADED' : 'DISABLED'}]`);
        });
        console.log('');
    }

    const services = await initApiService(CONFIG, true);
    
    const heartbeatAndRefreshToken = initializeAPIManagement(services);
    const requestHandlerInstance = createRequestHandler(CONFIG, getProviderPoolManager());

    serverInstance = http.createServer({
        requestTimeout: 0,
        headersTimeout: 60000,
        keepAliveTimeout: 65000
    }, requestHandlerInstance);

    // 极致速度优化：先让端口跑起来，再慢慢搞 Git 同步和定时任务
    serverInstance.listen(CONFIG.SERVER_PORT, CONFIG.HOST, () => {
        logger.info(`🚀 A-Plan (A计划) Gateway running on http://${CONFIG.HOST}:${CONFIG.SERVER_PORT}`);
        
        // 端口一旦 Ready，立即在后台异步启动 Git 同步
        const gitSyncManager = getGitSyncManager(CONFIG);
        if (gitSyncManager) {
            gitSyncManager.init().catch(err => {
                logger.error('[A-Plan] Git sync background initialization failed:', err.message);
            });
        }

        // 剩下的心跳、健康检查全都在后台跑，不影响 API 响应
        if (CONFIG.CRON_REFRESH_TOKEN) {
            // ... (省略后续逻辑)
            setInterval(async () => {
                if (isTaskRunning.heartbeat) return;
                isTaskRunning.heartbeat = true;
                try {
                    await heartbeatAndRefreshToken();
                } finally {
                    isTaskRunning.heartbeat = false;
                }
            }, CONFIG.CRON_NEAR_MINUTES * 60 * 1000);
        }

        // Task Lock for Health Checks
        const poolManager = getProviderPoolManager();
        if (poolManager) {
            poolManager.performInitialHealthChecks();
            setInterval(async () => {
                if (isTaskRunning.healthCheck) return;
                isTaskRunning.healthCheck = true;
                try {
                    await poolManager.performHealthChecks();
                } finally {
                    isTaskRunning.healthCheck = false;
                }
            }, (CONFIG.SCHEDULED_HEALTH_CHECK?.interval || 300000));
        }
    });
}

setupSignalHandlers();
startServer().catch(err => {
    logger.error("[A-Plan] Failed to start:", err.message);
    process.exit(1);
});
