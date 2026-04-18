import 'dotenv/config';
import '../converters/register-converters.js';
import logger from '../utils/logger.js';
import * as http from 'http';
import { initializeConfig, CONFIG } from '../core/config-manager.js';
import { initApiService } from './service-manager.js';
import { initializeAPIManagement } from './api-manager.js';
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
    
    // Stop Git sync
    const gitSyncManager = getGitSyncManager();
    if (gitSyncManager) gitSyncManager.stop();

    try {
        await getTLSSidecar().stop();
    } catch { /* ignore */ }

    if (serverInstance) {
        serverInstance.close(() => {
            logger.info('[A-Plan] HTTP server closed');
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 5000);
    } else {
        process.exit(0);
    }
}

function setupSignalHandlers() {
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
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
    if (process.env.LITE_MODE === 'true') {
        CONFIG.UI_ENABLED = false;
        CONFIG.PLUGINS_ENABLED = false;
        logger.info('[A-Plan] Running in LITE mode (UI/Plugins disabled)');
    }

    if (CONFIG.TLS_SIDECAR_ENABLED) {
        await getTLSSidecar().start({
            port: CONFIG.TLS_SIDECAR_PORT,
            binaryPath: CONFIG.TLS_SIDECAR_BINARY_PATH || undefined,
        });
    }

    const services = await initApiService(CONFIG, true);
    
    // Initialize and start Git Sync Service
    const gitSyncManager = getGitSyncManager(CONFIG);
    if (gitSyncManager) {
        gitSyncManager.init().catch(err => {
            logger.error('[A-Plan] Git sync initialization failed:', err.message);
        });
    }

    const heartbeatAndRefreshToken = initializeAPIManagement(services);
    const requestHandlerInstance = createRequestHandler(CONFIG, getProviderPoolManager());

    serverInstance = http.createServer({
        requestTimeout: 0,
        headersTimeout: 60000,
        keepAliveTimeout: 65000
    }, requestHandlerInstance);

    serverInstance.listen(CONFIG.SERVER_PORT, CONFIG.HOST, () => {
        logger.info(`🚀 A-Plan (A计划) Gateway running on http://${CONFIG.HOST}:${CONFIG.SERVER_PORT}`);
        
        // Task Lock for Heartbeat
        if (CONFIG.CRON_REFRESH_TOKEN) {
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
