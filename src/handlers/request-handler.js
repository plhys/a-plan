import { deepMerge } from '../utils/native-utils.js';
import logger from '../utils/logger.js';
import { handleError, getClientIp } from '../utils/common.js';
import { handleUIApiRequests, serveStaticFiles } from '../services/ui-manager.js';
import { handleAPIRequests } from '../services/api-manager.js';
import { getApiService, getProviderStatus, getProviderPoolManager } from '../services/service-manager.js';
import { MODEL_PROVIDER } from '../utils/constants.js';
import { getRegisteredProviders, isRegisteredProvider } from '../providers/adapter.js';
import { countTokensAnthropic } from '../utils/token-utils.js';
import { PROMPT_LOG_FILENAME } from '../core/config-manager.js';
import { getPluginManager } from '../core/plugin-manager.js';
import { randomUUID } from 'crypto';

let requestIdCounter = 0;
const processStartTime = Date.now().toString(36);
function generateRequestId() {
    requestIdCounter = (requestIdCounter + 1) % 1000000;
    return `${processStartTime}-${requestIdCounter.toString(36)}`;
}

function parseRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(new Error('Invalid JSON in request body')); }
        });
        req.on('error', reject);
    });
}

export function createRequestHandler(config, providerPoolManager) {
    return async function requestHandler(req, res) {
        const clientIp = getClientIp(req);
        const requestId = `${clientIp}:${generateRequestId()}`;

        return logger.runWithContext(requestId, async () => {
            const pm = getPluginManager();
            const currentConfig = { ...config };
            currentConfig._pluginRequestId = requestId;
            const protocol = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
            const host = req.headers.host;
            currentConfig.requestBaseUrl = `${protocol}://${host}`;
            const requestUrl = new URL(req.url, `http://${req.headers.host}`);
            let path = requestUrl.pathname;
            const method = req.method;

            try {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-goog-api-key, Model-Provider, X-Requested-With, Accept, Origin');
                res.setHeader('Access-Control-Max-Age', '86400');

                if (method === 'OPTIONS') {
                    res.writeHead(204);
                    res.end();
                    return;
                }

                // 极客改进：无论是否 CORE_ONLY，只要访问 /api/ 或管理页面，都尝试处理
                const isUIRequest = path.startsWith('/api/') || path === '/' || path.startsWith('/static/') || path.startsWith('/app/') || path.startsWith('/components/') || path.endsWith('.html');
                
                if (isUIRequest) {
                    const isPluginStatic = pm.isPluginStaticPath(path);
                    if (path.startsWith('/static/') || path === '/' || path === '/favicon.ico' || path === '/index.html' || path.startsWith('/app/') || path.startsWith('/components/') || path === '/login.html' || path.endsWith('.html') || isPluginStatic) {
                        const served = await serveStaticFiles(path, res);
                        if (served) return;
                    }

                    if (await pm.executeRoutes(method, path, req, res, currentConfig)) return;

                    const uiHandled = await handleUIApiRequests(method, path, req, res, currentConfig, providerPoolManager);
                    if (uiHandled) return;
                    
                    // 如果在 CORE_ONLY 下访问了非 API 的 UI 页面，且静态文件未处理，提示 CORE_ONLY
                    if (config.CORE_ONLY && !path.startsWith('/api/')) {
                        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end('A-Plan is running in CORE_ONLY mode. UI is partially disabled.');
                        return;
                    }
                }

                logger.info(`[Server] Received request: ${req.method} ${req.url}`);

                if (method === 'GET' && path === '/health') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString(), provider: currentConfig.MODEL_PROVIDER }));
                    return true;
                }

                const authResult = await pm.executeAuth(req, res, requestUrl, currentConfig);
                if (authResult.handled) return;
                if (!authResult.authorized) {
                    handleError(res, { status: 401, message: 'Unauthorized access' }, currentConfig.MODEL_PROVIDER, null, req);
                    return;
                }
                
                await pm.executeMiddleware(req, res, requestUrl, currentConfig);

                const apiHandled = await handleAPIRequests(method, path, req, res, currentConfig, null, providerPoolManager, PROMPT_LOG_FILENAME);
                if (apiHandled) return;

                handleError(res, { status: 404, message: 'Not Found' }, currentConfig.MODEL_PROVIDER, null, req);
            } catch (error) {
                logger.error(`[Server] Request handler error: ${error.message}`, error.stack);
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: 'Internal Server Error', details: error.message } }));
                }
            } finally {
                logger.clearRequestContext(requestId);
            }
        });
    };
}
