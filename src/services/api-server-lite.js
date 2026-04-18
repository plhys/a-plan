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

let serverInstance = null;

async function gracefulShutdown() {
    logger.info('[Lite-Server] Initiating graceful shutdown...');
    try {
        await getTLSSidecar().stop();
    } catch { /* ignore */ }

    if (serverInstance) {
        serverInstance.close(() => {
            logger.info('[Lite-Server] HTTP server closed');
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
        logger.error('[Lite-Server] Uncaught exception:', error);
        gracefulShutdown();
    });
}

async function startServer() {
    await initializeConfig(process.argv.slice(2), 'configs/config.json');
    
    // Disable UI and Plugins in Lite mode
    CONFIG.UI_ENABLED = false;
    CONFIG.PLUGINS_ENABLED = false;

    if (CONFIG.TLS_SIDECAR_ENABLED) {
        await getTLSSidecar().start({
            port: CONFIG.TLS_SIDECAR_PORT,
            binaryPath: CONFIG.TLS_SIDECAR_BINARY_PATH || undefined,
        });
    }

    const services = await initApiService(CONFIG, true);
    const heartbeatAndRefreshToken = initializeAPIManagement(services);
    const requestHandlerInstance = createRequestHandler(CONFIG, getProviderPoolManager());

    serverInstance = http.createServer({
        requestTimeout: 0,
        headersTimeout: 60000,
        keepAliveTimeout: 65000
    }, requestHandlerInstance);

    serverInstance.listen(CONFIG.SERVER_PORT, CONFIG.HOST, () => {
        logger.info(`🚀 Lite API Server running on http://${CONFIG.HOST}:${CONFIG.SERVER_PORT}`);
        if (CONFIG.CRON_REFRESH_TOKEN) {
            setInterval(heartbeatAndRefreshToken, CONFIG.CRON_NEAR_MINUTES * 60 * 1000);
        }
        const poolManager = getProviderPoolManager();
        if (poolManager) {
            poolManager.performInitialHealthChecks();
            setInterval(() => poolManager.performHealthChecks(), CONFIG.CRON_NEAR_MINUTES * 60 * 1000);
        }
    });
}

setupSignalHandlers();
startServer().catch(err => {
    logger.error("[Lite-Server] Failed to start:", err.message);
    process.exit(1);
});
