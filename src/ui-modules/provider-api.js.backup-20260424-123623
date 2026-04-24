import { existsSync, readFileSync, writeFileSync } from 'fs';
import logger from '../utils/logger.js';
import { getRequestBody } from '../utils/common.js';
import {
    extractModelIdsFromNativeList,
    getConfiguredSupportedModels,
    getProviderModels,
    normalizeModelIds,
    usesManagedModelList
} from '../providers/provider-models.js';
import { generateUUID, createProviderConfig, formatSystemPath, detectProviderFromPath, addToUsedPaths, isPathUsed, pathsEqual } from '../utils/provider-utils.js';
import { broadcastEvent } from './event-broadcast.js';
import { getRegisteredProviders, getServiceAdapter, invalidateServiceAdapter, serviceInstances } from '../providers/adapter.js';

// 文件级互斥锁：防止并发读写导致数据丢失
// 安全净化：移除用户输入字段中的危险内容（script、事件处理器、javascript:协议等），
// 存储原始文本。HTML 转义统一由前端 escHtml() 负责，避免双编码问题。
// 安全净化：移除用户输入字段中的危险内容，并可选地过滤敏感 API 密钥
function sanitizeProviderData(provider, maskSensitive = false) {
    if (!provider || typeof provider !== 'object') return provider;
    const sanitized = { ...provider };
    
    // 1. 过滤敏感字段（API Keys, Tokens 等）
    if (maskSensitive) {
        for (const key in sanitized) {
            // 排除已知非敏感字段
            if (key === 'uuid' || key === 'customName' || key === 'isHealthy' || key === 'isDisabled' || key === 'needsRefresh') continue;
            
            const val = sanitized[key];
            if (typeof val !== 'string' || !val) continue;

            // 识别敏感字段：包含 KEY, TOKEN, SECRET, PASSWORD, CLEARANCE 等关键词
            // 同时排除包含 PATH, URL, DIR, ENDPOINT 等关键词的路径/地址字段
            const isSensitive = /API_KEY|TOKEN|SECRET|PASSWORD|CLEARANCE|ACCESS_KEY|credentials/i.test(key);
            const isPath = /PATH|URL|DIR|ENDPOINT|REGION/i.test(key);

            if (isSensitive && !isPath) {
                // 对密钥进行脱敏显示（只保留前 4 位和后 4 位）
                if (val.length > 10) {
                    sanitized[key] = val.substring(0, 4) + '****' + val.substring(val.length - 4);
                } else {
                    sanitized[key] = '********';
                }
            }
        }
    }

    // 2. 净化 customName 中的 HTML/脚本
    if (typeof sanitized.customName === 'string') {
        let name = sanitized.customName;
        if (/(?:data|javascript|vbscript)\s*:/i.test(name)) {
            sanitized.customName = '';
            return sanitized;
        }
        name = name.replace(/<[^>]*>/g, '');
        name = name.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
        name = name.replace(/&[#\w]+;/g, '');
        sanitized.customName = name.trim();
    }
    return sanitized;
}

function sanitizeProviderPools(pools, maskSensitive = false) {
    if (!pools || typeof pools !== 'object') return pools;
    const sanitized = {};
    for (const [type, providers] of Object.entries(pools)) {
        sanitized[type] = Array.isArray(providers)
            ? providers.map(p => sanitizeProviderData(p, maskSensitive))
            : providers;
    }
    return sanitized;
}

/**
 * 过滤掉数据中的脱敏占位符，避免在保存时覆盖真实数据
 */
function filterMaskedData(data) {
    if (!data || typeof data !== 'object') return data;
    const result = { ...data };
    
    for (const key in result) {
        const val = result[key];
        if (typeof val === 'string') {
            // 匹配 ******** 或 XXXX****XXXX 格式
            // 如果值包含 **** 且长度符合脱敏特征，则认为它是脱敏后的回传值，应该忽略
            // 不再仅限于特定的 sensitiveKeys，而是检查所有字符串字段
            if (val === '********' || (val.includes('****') && val.length >= 10)) {
                delete result[key];
            }
        }
    }
    
    return result;
}

function getProviderPoolsFilePath(currentConfig) {
    return currentConfig.PROVIDER_POOLS_FILE_PATH || 'configs/provider_pools.json';
}

function loadProviderPools(currentConfig, providerPoolManager) {
    const filePath = getProviderPoolsFilePath(currentConfig);

    if (providerPoolManager?.providerPools) {
        return providerPoolManager.providerPools;
    }

    if (!existsSync(filePath)) {
        return {};
    }

    return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function getManagedSupportedModels(providerType, providers = []) {
    return normalizeModelIds(
        providers.flatMap(provider => getConfiguredSupportedModels(providerType, provider))
    );
}

function persistProviderStatusToFile(currentConfig, providerPoolManager) {
    const filePath = currentConfig.PROVIDER_POOLS_FILE_PATH || 'configs/provider_pools.json';
    const providerPools = {};

    for (const providerType in providerPoolManager.providerStatus) {
        providerPools[providerType] = providerPoolManager.providerStatus[providerType].map(providerStatus => providerStatus.config);
    }

    writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf-8');
    return filePath;
}

function isAuthHealthCheckError(errorMessage = '') {
    return /\b(401|403)\b/.test(errorMessage) ||
        /\b(Unauthorized|Forbidden|AccessDenied|InvalidToken|ExpiredToken)\b/i.test(errorMessage);
}

async function runProviderHealthCheck(providerPoolManager, providerType, providerStatus) {
    const providerConfig = providerStatus.config;

    try {
        // 对于管理模型列表的提供商，如果配置了支持的模型，从中挑选一个用于健康检查
        let checkModelName = providerConfig.checkModelName;
        if (!checkModelName && usesManagedModelList(providerType)) {
            const supportedModels = getConfiguredSupportedModels(providerType, providerConfig);
            if (supportedModels.length > 0) {
                // 优先挑选常见的/轻量级的模型，或者直接取第一个
                checkModelName = supportedModels.find(m =>
                    m.includes('flash') || m.includes('mini') || m.includes('3.5') || m.includes('small')
                ) || supportedModels[0];
                logger.info(`[UI API] Selected model ${checkModelName} for health check of managed provider ${providerConfig.uuid}`);
            }
        }

        const healthResult = await providerPoolManager._checkProviderHealth(providerType, {
            ...providerConfig,
            checkModelName
        });

        if (healthResult.success) {
            providerPoolManager.markProviderHealthy(providerType, providerConfig, false, healthResult.modelName);
            return {
                uuid: providerConfig.uuid,
                success: true,
                healthy: true,
                modelName: healthResult.modelName,
                message: 'Healthy'
            };
        }

        const errorMessage = healthResult.errorMessage || 'Check failed';
        const isAuthError = isAuthHealthCheckError(errorMessage);

        if (isAuthError) {
            providerPoolManager.markProviderUnhealthyImmediately(providerType, providerConfig, errorMessage);
            logger.info(`[UI API] Auth error detected for ${providerConfig.uuid}, immediately marked as unhealthy`);
        } else {
            providerPoolManager.markProviderUnhealthy(providerType, providerConfig, errorMessage);
        }

        providerStatus.config.lastHealthCheckTime = new Date().toISOString();
        if (healthResult.modelName) {
            providerStatus.config.lastHealthCheckModel = healthResult.modelName;
        }

        return {
            uuid: providerConfig.uuid,
            success: false,
            healthy: false,
            modelName: healthResult.modelName,
            message: errorMessage,
            isAuthError
        };
    } catch (error) {
        const errorMessage = error.message || 'Unknown error';
        const isAuthError = isAuthHealthCheckError(errorMessage);

        if (isAuthError) {
            providerPoolManager.markProviderUnhealthyImmediately(providerType, providerConfig, errorMessage);
            logger.info(`[UI API] Auth error detected for ${providerConfig.uuid}, immediately marked as unhealthy`);
        } else {
            providerPoolManager.markProviderUnhealthy(providerType, providerConfig, errorMessage);
        }

        providerStatus.config.lastHealthCheckTime = new Date().toISOString();

        return {
            uuid: providerConfig.uuid,
            success: false,
            healthy: false,
            message: errorMessage,
            isAuthError
        };
    }
}

// 使用 Promise 链式队列，确保文件操作顺序执行
let _fileLockChain = Promise.resolve();

// 超时包装函数：防止操作永久挂起导致锁链阻塞
function withTimeout(promise, ms = 30000) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Operation timeout after ${ms}ms`)), ms)
        )
    ]);
}

function withFileLock(fn) {
    const next = _fileLockChain
        .then(() => withTimeout(fn(), 30000))
        .catch(err => {
            // 记录错误并抛出，中断操作
            logger.error('[FileLock] Operation failed:', err?.message || err);
            throw err;
        });
    _fileLockChain = next.then(() => {}).catch(() => {});
    return next;
}
/**
 * 获取所有提供商的状态（包括支持的类型和号池组）
 */
export async function handleGetProviders(req, res, currentConfig, providerPoolManager) {
    // 1. 获取支持的基础提供商类型
    const registeredProviders = getRegisteredProviders();
    let poolTypes = [];

    // 2. 从管理器获取当前所有池的状态
    const providerStatus = {};
    if (providerPoolManager) {
        for (const [type, providers] of Object.entries(providerPoolManager.providerStatus)) {
            providerStatus[type] = providers.map(p => ({
                ...p.config,
                activeRequests: p.state?.activeCount || 0,
                waitingRequests: p.state?.waitingCount || 0
            }));
        }
    }
    
    // 3. 补全号池配置文件中的所有组
    const filePath = currentConfig.PROVIDER_POOLS_FILE_PATH || 'configs/provider_pools.json';
    try {
        if (existsSync(filePath)) {
            const poolsData = JSON.parse(readFileSync(filePath, 'utf-8'));
            poolTypes = Object.keys(poolsData);
            poolTypes.forEach(type => {
                // 如果管理器中没有该组，或者该组是空的，则从文件中补全
                if (!providerStatus[type] || providerStatus[type].length === 0) {
                    const fileProviders = poolsData[type] || [];
                    if (fileProviders.length > 0) {
                        providerStatus[type] = fileProviders.map(p => ({
                            ...p,
                            activeRequests: 0,
                            waitingRequests: 0
                        }));
                    } else if (!providerStatus[type]) {
                        providerStatus[type] = [];
                    }
                }
            });
        }
    } catch (error) {
        logger.warn('[UI API] Failed to supplement provider status:', error.message);
    }

    // 合并生成支持的类型列表
    const supportedProviders = [...new Set([...registeredProviders, ...poolTypes])];

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        providers: sanitizeProviderPools(providerStatus, true), // 列表显示进行打码
        supportedProviders: supportedProviders
    }));
    return true;
}

/**
 * 获取特定提供商类型的详细信息
 */
export async function handleGetProviderType(req, res, currentConfig, providerPoolManager, providerType) {
    let providerPools = {};
    const filePath = currentConfig.PROVIDER_POOLS_FILE_PATH || 'configs/provider_pools.json';
    try {
        if (providerPoolManager && providerPoolManager.providerPools) {
            providerPools = providerPoolManager.providerPools;
        } else if (filePath && existsSync(filePath)) {
            const poolsData = JSON.parse(readFileSync(filePath, 'utf-8'));
            providerPools = poolsData;
        }
    } catch (error) {
        logger.warn('[UI API] Failed to load provider pools:', error.message);
    }

    const providers = providerPools[providerType] || [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        providerType,
        providers: providers.map(p => sanitizeProviderData(p, true)), // 详情页也进行打码，确保即便点击显示也是脱敏数据
        totalCount: providers.length,
        healthyCount: providers.filter(p => p.isHealthy).length
    }));
    return true;
}

/**
 * 获取支持的提供商类型（已注册适配器的，以及号池中已存在的自定义类型）
 */
export async function handleGetSupportedProviders(req, res, currentConfig, providerPoolManager) {
    const registeredProviders = getRegisteredProviders();
    let poolTypes = [];

    const filePath = currentConfig.PROVIDER_POOLS_FILE_PATH || 'configs/provider_pools.json';
    try {
        if (providerPoolManager && providerPoolManager.providerPools) {
            poolTypes = Object.keys(providerPoolManager.providerPools);
        } else if (filePath && existsSync(filePath)) {
            const poolsData = JSON.parse(readFileSync(filePath, 'utf-8'));
            poolTypes = Object.keys(poolsData);
        }
    } catch (error) {
        logger.warn('[UI API] Failed to load provider pools for supported types:', error.message);
    }

    // 合并注册的提供商和号池中的类型
    const supportedProviders = [...new Set([...registeredProviders, ...poolTypes])];
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(supportedProviders));
    return true;
}

/**
 * 获取所有提供商的可用模型（支持动态配置组）
 */
export async function handleGetProviderModels(req, res, currentConfig, providerPoolManager) {
    const registeredProviders = getRegisteredProviders();
    let providerPools = {};

    // 获取所有存在的类型（基础 + 动态）
    try {
        providerPools = loadProviderPools(currentConfig, providerPoolManager);
    } catch (error) {
        logger.warn('[UI API] Failed to load provider pools for models:', error.message);
    }

    const poolTypes = Object.keys(providerPools);
    const allTypes = [...new Set([...registeredProviders, ...poolTypes])];
    const allModels = {};

    allTypes.forEach(type => {
        let models = getProviderModels(type);
        if (usesManagedModelList(type)) {
            const managedModels = getManagedSupportedModels(type, providerPools[type] || []);
            if (managedModels.length > 0) {
                models = managedModels;
            }
        }
        if (models && models.length > 0) {
            allModels[type] = models;
        }
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(allModels));
    return true;
}

/**
 * 获取特定提供商类型的可用模型
 */
export async function handleGetProviderTypeModels(req, res, currentConfig, providerPoolManager, providerType) {
    let models = getProviderModels(providerType);
    if (usesManagedModelList(providerType)) {
        try {
            const providerPools = loadProviderPools(currentConfig, providerPoolManager);
            const managedModels = getManagedSupportedModels(providerType, providerPools[providerType] || []);
            if (managedModels.length > 0) {
                models = managedModels;
            }
        } catch (error) {
            logger.warn('[UI API] Failed to load managed provider models:', error.message);
        }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        providerType,
        models
    }));
    return true;
}

/**
 * Detect available models for a specific provider node.
 */
export async function handleDetectProviderModels(req, res, currentConfig, providerPoolManager, providerType, providerUuid) {
    try {
        if (!usesManagedModelList(providerType)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: `Model detection is not supported for provider type: ${providerType}` } }));
            return true;
        }

        const body = await getRequestBody(req);
        const draftConfig = filterMaskedData(body?.providerConfig || {});

        const providerPools = loadProviderPools(currentConfig, providerPoolManager);
        const providers = providerPools[providerType] || [];
        const existingProvider = providers.find(provider => provider.uuid === providerUuid) || {};

        const detectionUuid = `${providerUuid}-detect-models`;
        const instanceKey = `${providerType}${detectionUuid}`;
        const tempConfig = {
            ...currentConfig,
            ...existingProvider,
            ...draftConfig,
            MODEL_PROVIDER: providerType,
            uuid: detectionUuid
        };

        let models = [];
        try {
            delete serviceInstances[instanceKey];
            const serviceAdapter = getServiceAdapter(tempConfig);
            if (typeof serviceAdapter.listModels !== 'function') {
                throw new Error(`Provider ${providerType} does not support model detection`);
            }

            const nativeModels = await serviceAdapter.listModels();
            models = extractModelIdsFromNativeList(nativeModels, providerType);
        } finally {
            delete serviceInstances[instanceKey];
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            providerType,
            uuid: providerUuid,
            count: models.length,
            models,
            selectedModels: getConfiguredSupportedModels(providerType, existingProvider)
        }));
        return true;
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}

/**
 * 添加新的提供商配置
 */
export async function handleAddProvider(req, res, currentConfig, providerPoolManager) {
    return withFileLock(() => _handleAddProvider(req, res, currentConfig, providerPoolManager)).catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'File operation failed: ' + err.message } }));
        return true;
    });
}
async function _handleAddProvider(req, res, currentConfig, providerPoolManager) {
    try {
        const body = await getRequestBody(req);
        const { providerType, providerConfig } = body;

        if (!providerType || !providerConfig) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'providerType and providerConfig are required' } }));
            return true;
        }

        // Generate UUID if not provided
        if (!providerConfig.uuid) {
            providerConfig.uuid = generateUUID();
        }

        // Set default values
        providerConfig.isHealthy = providerConfig.isHealthy !== undefined ? providerConfig.isHealthy : true;
        providerConfig.lastUsed = providerConfig.lastUsed || null;
        providerConfig.usageCount = providerConfig.usageCount || 0;
        providerConfig.errorCount = providerConfig.errorCount || 0;
        providerConfig.lastErrorTime = providerConfig.lastErrorTime || null;

        const filePath = currentConfig.PROVIDER_POOLS_FILE_PATH || 'configs/provider_pools.json';
        let providerPools = {};
        
        // Load existing pools
        if (existsSync(filePath)) {
            try {
                const fileContent = readFileSync(filePath, 'utf-8');
                providerPools = JSON.parse(fileContent);
            } catch (readError) {
                logger.warn('[UI API] Failed to read existing provider pools:', readError.message);
            }
        }

        // Add new provider to the appropriate type
        if (!providerPools[providerType]) {
            providerPools[providerType] = [];
        }
        
        // 过滤掉脱敏字段
        const filteredConfig = filterMaskedData(providerConfig);
        if (usesManagedModelList(providerType)) {
            filteredConfig.supportedModels = normalizeModelIds(filteredConfig.supportedModels);
            filteredConfig.notSupportedModels = [];
        }
        providerPools[providerType].push(filteredConfig);

        // Save to file
        writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf-8');
        logger.info(`[UI API] Added new provider to ${providerType}: ${providerConfig.uuid}`);

        // Update provider pool manager if available
        if (providerPoolManager) {
            providerPoolManager.providerPools = providerPools;
            providerPoolManager.initializeProviderStatus();
        }

        // 广播更新事件
        broadcastEvent('config_update', {
            action: 'add',
            filePath: filePath,
            providerType,
            providerConfig: sanitizeProviderData(providerConfig),
            timestamp: new Date().toISOString()
        });

        // 广播提供商更新事件
        broadcastEvent('provider_update', {
            action: 'add',
            providerType,
            providerConfig: sanitizeProviderData(providerConfig),
            timestamp: new Date().toISOString()
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: 'Provider added successfully',
            provider: sanitizeProviderData(providerConfig, true),
            providerType
        }));
        return true;
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}

/**
 * 更新特定提供商配置
 */
export async function handleUpdateProvider(req, res, currentConfig, providerPoolManager, providerType, providerUuid) {
    return withFileLock(() => _handleUpdateProvider(req, res, currentConfig, providerPoolManager, providerType, providerUuid)).catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'File operation failed: ' + err.message } }));
        return true;
    });
}
async function _handleUpdateProvider(req, res, currentConfig, providerPoolManager, providerType, providerUuid) {
    try {
        const body = await getRequestBody(req);
        const { providerConfig } = body;

        if (!providerConfig) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'providerConfig is required' } }));
            return true;
        }

        const filePath = currentConfig.PROVIDER_POOLS_FILE_PATH || 'configs/provider_pools.json';
        let providerPools = {};
        
        // Load existing pools
        if (existsSync(filePath)) {
            try {
                const fileContent = readFileSync(filePath, 'utf-8');
                providerPools = JSON.parse(fileContent);
            } catch (readError) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Provider pools file not found' } }));
                return true;
            }
        }

        // Find and update the provider
        const providers = providerPools[providerType] || [];
        const providerIndex = providers.findIndex(p => p.uuid === providerUuid);
        
        if (providerIndex === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Provider not found' } }));
            return true;
        }

        // Update provider while preserving certain fields
        const existingProvider = providers[providerIndex];
        
        // 过滤掉传入配置中的脱敏占位符，避免覆盖真实数据
        const filteredConfig = filterMaskedData(providerConfig);
        if (usesManagedModelList(providerType)) {
            filteredConfig.supportedModels = normalizeModelIds(filteredConfig.supportedModels);
            filteredConfig.notSupportedModels = [];
        }
        
        const updatedProvider = {
            ...existingProvider,
            ...filteredConfig,
            uuid: providerUuid, // Ensure UUID doesn't change
            lastUsed: existingProvider.lastUsed, // Preserve usage stats
            usageCount: existingProvider.usageCount,
            errorCount: existingProvider.errorCount,
            lastErrorTime: existingProvider.lastErrorTime
        };

        providerPools[providerType][providerIndex] = updatedProvider;

        // Save to file
        writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf-8');
        logger.info(`[UI API] Updated provider ${providerUuid} in ${providerType}`);
        invalidateServiceAdapter(providerType, providerUuid);

        // Update provider pool manager if available
        if (providerPoolManager) {
            providerPoolManager.providerPools = providerPools;
            providerPoolManager.initializeProviderStatus();
        }

        // 广播更新事件
        broadcastEvent('config_update', {
            action: 'update',
            filePath: filePath,
            providerType,
            providerConfig: sanitizeProviderData(updatedProvider),
            timestamp: new Date().toISOString()
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: 'Provider updated successfully',
            provider: sanitizeProviderData(updatedProvider, true)
        }));
        return true;
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}

/**
 * 删除特定提供商配置
 */
export async function handleDeleteProvider(req, res, currentConfig, providerPoolManager, providerType, providerUuid) {
    return withFileLock(() => _handleDeleteProvider(req, res, currentConfig, providerPoolManager, providerType, providerUuid)).catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'File operation failed: ' + err.message } }));
        return true;
    });
}
async function _handleDeleteProvider(req, res, currentConfig, providerPoolManager, providerType, providerUuid) {
    try {
        const filePath = currentConfig.PROVIDER_POOLS_FILE_PATH || 'configs/provider_pools.json';
        let providerPools = {};
        
        // Load existing pools
        if (existsSync(filePath)) {
            try {
                const fileContent = readFileSync(filePath, 'utf-8');
                providerPools = JSON.parse(fileContent);
            } catch (readError) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Provider pools file not found' } }));
                return true;
            }
        }

        // Find and remove the provider
        const providers = providerPools[providerType] || [];
        const providerIndex = providers.findIndex(p => p.uuid === providerUuid);
        
        if (providerIndex === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Provider not found' } }));
            return true;
        }

        const deletedProvider = providers[providerIndex];
        providers.splice(providerIndex, 1);

        // Remove the entire provider type if no providers left
        if (providers.length === 0) {
            delete providerPools[providerType];
        }

        // Save to file
        writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf-8');
        logger.info(`[UI API] Deleted provider ${providerUuid} from ${providerType}`);
        invalidateServiceAdapter(providerType, providerUuid);

        // Update provider pool manager if available
        if (providerPoolManager) {
            providerPoolManager.providerPools = providerPools;
            providerPoolManager.initializeProviderStatus();
        }

        // 广播更新事件
        broadcastEvent('config_update', {
            action: 'delete',
            filePath: filePath,
            providerType,
            providerConfig: sanitizeProviderData(deletedProvider),
            timestamp: new Date().toISOString()
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: 'Provider deleted successfully',
            deletedProvider: sanitizeProviderData(deletedProvider)
        }));
        return true;
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}

/**
 * 禁用/启用特定提供商配置
 */
export async function handleDisableEnableProvider(req, res, currentConfig, providerPoolManager, providerType, providerUuid, action) {
    return withFileLock(() => _handleDisableEnableProvider(req, res, currentConfig, providerPoolManager, providerType, providerUuid, action)).catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'File operation failed: ' + err.message } }));
        return true;
    });
}
async function _handleDisableEnableProvider(req, res, currentConfig, providerPoolManager, providerType, providerUuid, action) {
    try {
        const filePath = currentConfig.PROVIDER_POOLS_FILE_PATH || 'configs/provider_pools.json';
        let providerPools = {};
        
        // Load existing pools
        if (existsSync(filePath)) {
            try {
                const fileContent = readFileSync(filePath, 'utf-8');
                providerPools = JSON.parse(fileContent);
            } catch (readError) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Provider pools file not found' } }));
                return true;
            }
        }

        // Find and update the provider
        const providers = providerPools[providerType] || [];
        const providerIndex = providers.findIndex(p => p.uuid === providerUuid);
        
        if (providerIndex === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Provider not found' } }));
            return true;
        }

        // Update isDisabled field
        const provider = providers[providerIndex];
        provider.isDisabled = action === 'disable';
        
        // Save to file
        writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf-8');
        logger.info(`[UI API] ${action === 'disable' ? 'Disabled' : 'Enabled'} provider ${providerUuid} in ${providerType}`);

        // Update provider pool manager if available
        if (providerPoolManager) {
            providerPoolManager.providerPools = providerPools;
            
            // Call the appropriate method
            if (action === 'disable') {
                providerPoolManager.disableProvider(providerType, provider);
            } else {
                providerPoolManager.enableProvider(providerType, provider);
            }
        }

        // 广播更新事件
        broadcastEvent('config_update', {
            action: action,
            filePath: filePath,
            providerType,
            providerConfig: sanitizeProviderData(provider),
            timestamp: new Date().toISOString()
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: `Provider ${action}d successfully`,
            provider: sanitizeProviderData(provider)
        }));
        return true;
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}

/**
 * 重置特定提供商类型的所有提供商健康状态
 */
export async function handleResetProviderHealth(req, res, currentConfig, providerPoolManager, providerType) {
    try {
        const filePath = currentConfig.PROVIDER_POOLS_FILE_PATH || 'configs/provider_pools.json';
        let providerPools = {};
        
        // Load existing pools
        if (existsSync(filePath)) {
            try {
                const fileContent = readFileSync(filePath, 'utf-8');
                providerPools = JSON.parse(fileContent);
            } catch (readError) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Provider pools file not found' } }));
                return true;
            }
        }

        // Reset health status for all providers of this type
        const providers = providerPools[providerType] || [];
        
        if (providers.length === 0) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'No providers found for this type' } }));
            return true;
        }

        let resetCount = 0;
        providers.forEach(provider => {
            // 统计 isHealthy 从 false 变为 true 的节点数量
            if (!provider.isHealthy) {
                resetCount++;
            }
            // 重置所有节点的状态
            provider.isHealthy = true;
            provider.errorCount = 0;
            provider.refreshCount = 0;
            provider.needsRefresh = false;
            provider.lastErrorTime = null;
        });

        // Save to file
        writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf-8');
        logger.info(`[UI API] Reset health status for ${resetCount} providers in ${providerType}`);

        // Update provider pool manager if available
        if (providerPoolManager) {
            providerPoolManager.providerPools = providerPools;
            providerPoolManager.initializeProviderStatus();
        }

        // 广播更新事件
        broadcastEvent('config_update', {
            action: 'reset_health',
            filePath: filePath,
            providerType,
            resetCount,
            timestamp: new Date().toISOString()
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: `Successfully reset health status for ${resetCount} providers`,
            resetCount,
            totalCount: providers.length
        }));
        return true;
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}

/**
 * 删除特定提供商类型的所有不健康节点
 */
export async function handleDeleteUnhealthyProviders(req, res, currentConfig, providerPoolManager, providerType) {
    try {
        const filePath = currentConfig.PROVIDER_POOLS_FILE_PATH || 'configs/provider_pools.json';
        let providerPools = {};
        
        // Load existing pools
        if (existsSync(filePath)) {
            try {
                const fileContent = readFileSync(filePath, 'utf-8');
                providerPools = JSON.parse(fileContent);
            } catch (readError) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Provider pools file not found' } }));
                return true;
            }
        }

        // Find and remove unhealthy providers
        const providers = providerPools[providerType] || [];
        
        if (providers.length === 0) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'No providers found for this type' } }));
            return true;
        }

        // Filter out unhealthy providers (keep only healthy ones)
        const unhealthyProviders = providers.filter(p => !p.isHealthy);
        const healthyProviders = providers.filter(p => p.isHealthy);
        
        if (unhealthyProviders.length === 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'No unhealthy providers to delete',
                deletedCount: 0,
                remainingCount: providers.length
            }));
            return true;
        }

        // Update the provider pool with only healthy providers
        if (healthyProviders.length === 0) {
            delete providerPools[providerType];
        } else {
            providerPools[providerType] = healthyProviders;
        }

        // Save to file
        writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf-8');
        logger.info(`[UI API] Deleted ${unhealthyProviders.length} unhealthy providers from ${providerType}`);

        // Update provider pool manager if available
        if (providerPoolManager) {
            providerPoolManager.providerPools = providerPools;
            providerPoolManager.initializeProviderStatus();
        }

        // 广播更新事件
        broadcastEvent('config_update', {
            action: 'delete_unhealthy',
            filePath: filePath,
            providerType,
            deletedCount: unhealthyProviders.length,
            deletedProviders: unhealthyProviders.map(p => sanitizeProviderData({ uuid: p.uuid, customName: p.customName })),
            timestamp: new Date().toISOString()
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: `Successfully deleted ${unhealthyProviders.length} unhealthy providers`,
            deletedCount: unhealthyProviders.length,
            remainingCount: healthyProviders.length,
            deletedProviders: unhealthyProviders.map(p => ({ uuid: p.uuid, customName: p.customName }))
        }));
        return true;
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}

/**
 * 批量刷新特定提供商类型的所有不健康节点的 UUID
 */
export async function handleRefreshUnhealthyUuids(req, res, currentConfig, providerPoolManager, providerType) {
    try {
        const filePath = currentConfig.PROVIDER_POOLS_FILE_PATH || 'configs/provider_pools.json';
        let providerPools = {};
        
        // Load existing pools
        if (existsSync(filePath)) {
            try {
                const fileContent = readFileSync(filePath, 'utf-8');
                providerPools = JSON.parse(fileContent);
            } catch (readError) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Provider pools file not found' } }));
                return true;
            }
        }

        // Find unhealthy providers
        const providers = providerPools[providerType] || [];
        
        if (providers.length === 0) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'No providers found for this type' } }));
            return true;
        }

        // Filter unhealthy providers and refresh their UUIDs
        const refreshedProviders = [];
        for (const provider of providers) {
            if (!provider.isHealthy) {
                const oldUuid = provider.uuid;
                const newUuid = generateUUID();
                provider.uuid = newUuid;
                refreshedProviders.push({
                    oldUuid,
                    newUuid,
                    customName: provider.customName
                });
            }
        }

        if (refreshedProviders.length === 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'No unhealthy providers to refresh',
                refreshedCount: 0,
                totalCount: providers.length
            }));
            return true;
        }

        // Save to file
        writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf-8');
        logger.info(`[UI API] Refreshed UUIDs for ${refreshedProviders.length} unhealthy providers in ${providerType}`);

        // Update provider pool manager if available
        if (providerPoolManager) {
            providerPoolManager.providerPools = providerPools;
            providerPoolManager.initializeProviderStatus();
        }

        // 广播更新事件
        broadcastEvent('config_update', {
            action: 'refresh_unhealthy_uuids',
            filePath: filePath,
            providerType,
            refreshedCount: refreshedProviders.length,
            refreshedProviders: refreshedProviders.map(p => sanitizeProviderData(p)),
            timestamp: new Date().toISOString()
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: `Successfully refreshed UUIDs for ${refreshedProviders.length} unhealthy providers`,
            refreshedCount: refreshedProviders.length,
            totalCount: providers.length,
            refreshedProviders
        }));
        return true;
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}

/**
 * 对特定提供商类型的所有提供商执行健康检查
 */
export async function handleHealthCheck(req, res, currentConfig, providerPoolManager, providerType) {
    try {
        if (!providerPoolManager) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Provider pool manager not initialized' } }));
            return true;
        }

        const providers = providerPoolManager.providerStatus[providerType] || [];
        
        if (providers.length === 0) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'No providers found for this type' } }));
            return true;
        }

        // 只检测不健康的节点
        const unhealthyProviders = providers.filter(ps => !ps.config.isHealthy);
        
        if (unhealthyProviders.length === 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'No unhealthy providers to check',
                successCount: 0,
                failCount: 0,
                totalCount: providers.length,
                results: []
            }));
            return true;
        }

        logger.info(`[UI API] Starting health check for ${unhealthyProviders.length} unhealthy providers in ${providerType} (total: ${providers.length})`);

        // 执行健康检测（检查所有未禁用的 unhealthy providers）
        const results = [];
        for (const providerStatus of unhealthyProviders) {
            const providerConfig = providerStatus.config;
            
            // 跳过已禁用的节点
            if (providerConfig.isDisabled) {
                logger.info(`[UI API] Skipping health check for disabled provider: ${providerConfig.uuid}`);
                continue;
            }

             try {
                const healthResult = await providerPoolManager._checkProviderHealth(providerType, providerConfig);
                
                if (healthResult.success) {
                    providerPoolManager.markProviderHealthy(providerType, providerConfig, false, healthResult.modelName);
                    results.push({
                        uuid: providerConfig.uuid,
                        success: true,
                        modelName: healthResult.modelName,
                        message: 'Healthy'
                    });
                } else {
                    // 检查是否为认证错误（401/403），如果是则立即标记为不健康
                    const errorMessage = healthResult.errorMessage || 'Check failed';
                    const isAuthError = /\b(401|403)\b/.test(errorMessage) ||
                                       /\b(Unauthorized|Forbidden|AccessDenied|InvalidToken|ExpiredToken)\b/i.test(errorMessage);
                    
                    if (isAuthError) {
                        providerPoolManager.markProviderUnhealthyImmediately(providerType, providerConfig, errorMessage);
                        logger.info(`[UI API] Auth error detected for ${providerConfig.uuid}, immediately marked as unhealthy`);
                    } else {
                        providerPoolManager.markProviderUnhealthy(providerType, providerConfig, errorMessage);
                    }
                    
                    providerStatus.config.lastHealthCheckTime = new Date().toISOString();
                    if (healthResult.modelName) {
                        providerStatus.config.lastHealthCheckModel = healthResult.modelName;
                    }
                    results.push({
                        uuid: providerConfig.uuid,
                        success: false,
                        modelName: healthResult.modelName,
                        message: errorMessage,
                        isAuthError: isAuthError
                    });
                }
            } catch (error) {
                const errorMessage = error.message || 'Unknown error';
                // 检查是否为认证错误（401/403），如果是则立即标记为不健康
                const isAuthError = /\b(401|403)\b/.test(errorMessage) ||
                                   /\b(Unauthorized|Forbidden|AccessDenied|InvalidToken|ExpiredToken)\b/i.test(errorMessage);
                
                if (isAuthError) {
                    providerPoolManager.markProviderUnhealthyImmediately(providerType, providerConfig, errorMessage);
                    logger.info(`[UI API] Auth error detected for ${providerConfig.uuid}, immediately marked as unhealthy`);
                } else {
                    providerPoolManager.markProviderUnhealthy(providerType, providerConfig, errorMessage);
                }
                
                results.push({
                    uuid: providerConfig.uuid,
                    success: false,
                    message: errorMessage,
                    isAuthError: isAuthError
                });
            }
        }

        // 保存更新后的状态到文件
        const filePath = currentConfig.PROVIDER_POOLS_FILE_PATH || 'configs/provider_pools.json';
        
        // 从 providerStatus 构建 providerPools 对象并保存
        const providerPools = {};
        for (const pType in providerPoolManager.providerStatus) {
            providerPools[pType] = providerPoolManager.providerStatus[pType].map(ps => ps.config);
        }
        writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf-8');

        const successCount = results.filter(r => r.success === true).length;
        const failCount = results.filter(r => r.success === false).length;

        logger.info(`[UI API] Health check completed for ${providerType}: ${successCount} recovered, ${failCount} still unhealthy (checked ${unhealthyProviders.length} unhealthy nodes)`);

        // 广播更新事件
        broadcastEvent('config_update', {
            action: 'health_check',
            filePath: filePath,
            providerType,
            results: results.map(r => ({ ...r, message: sanitizeProviderData({ message: r.message }).message })),
            timestamp: new Date().toISOString()
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: `Health check completed: ${successCount} healthy, ${failCount} unhealthy`,
            successCount,
            failCount,
            totalCount: providers.length,
            results
        }));
        return true;
    } catch (error) {
        logger.error('[UI API] Health check error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}

/**
 * 快速链接配置文件到对应的提供商
 * 支持单个文件路径或文件路径数组
 */
export async function handleSingleProviderHealthCheck(req, res, currentConfig, providerPoolManager, providerType, providerUuid) {
    try {
        if (!providerPoolManager) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Provider pool manager not initialized' } }));
            return true;
        }

        const providers = providerPoolManager.providerStatus[providerType] || [];
        const providerStatus = providers.find(item => item.config?.uuid === providerUuid);

        if (!providerStatus) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Provider not found' } }));
            return true;
        }

        logger.info(`[UI API] Starting single health check for provider ${providerUuid} in ${providerType}`);

        const result = await runProviderHealthCheck(providerPoolManager, providerType, providerStatus);

        // 使用文件锁进行持久化，防止并发写入冲突
        const filePath = await withFileLock(async () => {
            return persistProviderStatusToFile(currentConfig, providerPoolManager);
        });

        broadcastEvent('config_update', {
            action: 'health_check_single',
            filePath,
            providerType,
            providerUuid,
            result: {
                ...result,
                message: sanitizeProviderData({ message: result.message }).message
            },
            timestamp: new Date().toISOString()
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            providerType,
            uuid: providerUuid,
            healthy: result.healthy,
            modelName: result.modelName || null,
            message: result.message,
            isAuthError: result.isAuthError || false
        }));
        return true;
    } catch (error) {
        logger.error('[UI API] Single health check error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}

export async function handleQuickLinkProvider(req, res, currentConfig, providerPoolManager) {
    try {
        const body = await getRequestBody(req);
        const { filePath, filePaths } = body;

        // 支持单个文件路径或文件路径数组
        const pathsToLink = filePaths || (filePath ? [filePath] : []);

        if (!pathsToLink || pathsToLink.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'filePath or filePaths is required' } }));
            return true;
        }

        const poolsFilePath = currentConfig.PROVIDER_POOLS_FILE_PATH || 'configs/provider_pools.json';
        
        // Load existing pools
        let providerPools = {};
        if (existsSync(poolsFilePath)) {
            try {
                const fileContent = readFileSync(poolsFilePath, 'utf-8');
                providerPools = JSON.parse(fileContent);
            } catch (readError) {
                logger.warn('[UI API] Failed to read existing provider pools:', readError.message);
            }
        }

        const results = [];
        const linkedProviders = [];

        // 处理每个文件路径
        for (const currentFilePath of pathsToLink) {
            const normalizedPath = currentFilePath.replace(/\\/g, '/').toLowerCase();
            
            // 根据文件路径自动识别提供商类型
            const providerMapping = detectProviderFromPath(normalizedPath);
            
            if (!providerMapping) {
                results.push({
                    filePath: currentFilePath,
                    success: false,
                    error: 'Unable to identify provider type for config file'
                });
                continue;
            }

            const { providerType, credPathKey, defaultCheckModel, displayName } = providerMapping;

            // Ensure provider type array exists
            if (!providerPools[providerType]) {
                providerPools[providerType] = [];
            }

            // Check if already linked - 使用标准化路径进行比较
            const normalizedForComparison = currentFilePath.replace(/\\/g, '/');
            const isAlreadyLinked = providerPools[providerType].some(p => {
                const existingPath = p[credPathKey];
                if (!existingPath) return false;
                const normalizedExistingPath = existingPath.replace(/\\/g, '/');
                return normalizedExistingPath === normalizedForComparison ||
                       normalizedExistingPath === './' + normalizedForComparison ||
                       './' + normalizedExistingPath === normalizedForComparison;
            });

            if (isAlreadyLinked) {
                results.push({
                    filePath: currentFilePath,
                    success: false,
                    error: 'This config file is already linked',
                    providerType: providerType
                });
                continue;
            }

            // Create new provider config based on provider type
            const newProvider = createProviderConfig({
                credPathKey,
                credPath: formatSystemPath(currentFilePath),
                defaultCheckModel,
                needsProjectId: providerMapping.needsProjectId
            });

            providerPools[providerType].push(newProvider);
            linkedProviders.push({ providerType, provider: newProvider });

            results.push({
                filePath: currentFilePath,
                success: true,
                providerType: providerType,
                displayName: displayName,
                provider: newProvider
            });

            logger.info(`[UI API] Quick linked config: ${currentFilePath} -> ${providerType}`);
        }

        // Save to file only if there were successful links
        const successCount = results.filter(r => r.success).length;
        if (successCount > 0) {
            await withFileLock(async () => {
                writeFileSync(poolsFilePath, JSON.stringify(providerPools, null, 2), 'utf-8');
                return poolsFilePath;
            });

            // Update provider pool manager if available
            if (providerPoolManager) {
                providerPoolManager.providerPools = providerPools;
                providerPoolManager.initializeProviderStatus();
            }

            // Broadcast update events
            broadcastEvent('config_update', {
                action: 'quick_link_batch',
                filePath: poolsFilePath,
                results: results,
                timestamp: new Date().toISOString()
            });

            for (const { providerType, provider } of linkedProviders) {
                broadcastEvent('provider_update', {
                    action: 'add',
                    providerType,
                    providerConfig: provider,
                    timestamp: new Date().toISOString()
                });
            }
        }

        const failCount = results.filter(r => !r.success).length;
        const message = successCount > 0
            ? `Successfully linked ${successCount} config file(s)${failCount > 0 ? `, ${failCount} failed` : ''}`
            : `Failed to link all ${failCount} config file(s)`;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: successCount > 0,
            message: message,
            successCount: successCount,
            failCount: failCount,
            results: results
        }));
        return true;
    } catch (error) {
        logger.error('[UI API] Quick link failed:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: {
                message: 'Link failed: ' + error.message
            }
        }));
        return true;
    }
}

/**
 * 刷新特定提供商的UUID
 */
export async function handleRefreshProviderUuid(req, res, currentConfig, providerPoolManager, providerType, providerUuid) {
    try {
        const filePath = currentConfig.PROVIDER_POOLS_FILE_PATH || 'configs/provider_pools.json';
        let providerPools = {};
        
        // Load existing pools
        if (existsSync(filePath)) {
            try {
                const fileContent = readFileSync(filePath, 'utf-8');
                providerPools = JSON.parse(fileContent);
            } catch (readError) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Provider pools file not found' } }));
                return true;
            }
        }

        // Find the provider
        const providers = providerPools[providerType] || [];
        const providerIndex = providers.findIndex(p => p.uuid === providerUuid);
        
        if (providerIndex === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Provider not found' } }));
            return true;
        }

        // Generate new UUID
        const oldUuid = providerUuid;
        const newUuid = generateUUID();
        
        // Update provider UUID
        providerPools[providerType][providerIndex].uuid = newUuid;

        // Save to file
        writeFileSync(filePath, JSON.stringify(providerPools, null, 2), 'utf-8');
        logger.info(`[UI API] Refreshed UUID for provider in ${providerType}: ${oldUuid} -> ${newUuid}`);
        invalidateServiceAdapter(providerType, oldUuid);
        invalidateServiceAdapter(providerType, newUuid);

        // Update provider pool manager if available
        if (providerPoolManager) {
            providerPoolManager.providerPools = providerPools;
            providerPoolManager.initializeProviderStatus();
        }

        // 广播更新事件
        broadcastEvent('config_update', {
            action: 'refresh_uuid',
            filePath: filePath,
            providerType,
            oldUuid,
            newUuid,
            timestamp: new Date().toISOString()
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: 'UUID refreshed successfully',
            oldUuid,
            newUuid,
            provider: sanitizeProviderData(providerPools[providerType][providerIndex])
        }));
        return true;
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}

/**
 * 创建 Cloudflare AI Gateway
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Object} currentConfig - 当前配置
 * @returns {boolean} 是否处理成功
 */
export async function handleCreateCloudflareGateway(req, res, currentConfig) {
    try {
        const body = await getRequestBody(req);
        const { accountId, gatewayName, apiToken } = body;

        if (!accountId || !gatewayName || !apiToken) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: '缺少必要参数: accountId, gatewayName, apiToken' } }));
            return true;
        }

        logger.info(`[Cloudflare Gateway] 正在创建 Gateway: ${gatewayName} for account: ${accountId}`);

        // 先验证 API Token 并获取账户信息
        logger.info('[Cloudflare Gateway] 验证 API Token 中...');
        const verifyResponse = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            }
        });

        const verifyResult = await verifyResponse.json();
        logger.info(`[Cloudflare Gateway] Token 验证结果：${JSON.stringify(verifyResult)}`);

        if (!verifyResponse.ok || !verifyResult.success) {
            logger.error(`[Cloudflare Gateway] API Token 验证失败：${JSON.stringify(verifyResult)}`);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: { 
                    message: verifyResult.errors?.[0]?.message || 'API Token 无效或已过期',
                    details: verifyResult,
                    hint: '请确认：1) 使用的是 API Token 而不是 API Key；2) Token 有 Account AI Gateway:Edit 权限；3) Account ID 与 Token 匹配'
                } 
            }));
            return true;
        }

        // 获取账户信息以验证账户 ID
        logger.info('[Cloudflare Gateway] 获取账户信息中...');
        const accountsResponse = await fetch('https://api.cloudflare.com/client/v4/accounts', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            }
        });

        const accountsResult = await accountsResponse.json();
        logger.info(`[Cloudflare Gateway] 账户列表响应：${JSON.stringify(accountsResult)}`);

        // 检查账户列表响应
        if (!accountsResponse.ok) {
            logger.error(`[Cloudflare Gateway] 获取账户列表失败：${JSON.stringify(accountsResult)}`);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: { 
                    message: accountsResult.errors?.[0]?.message || '无法获取账户列表',
                    details: accountsResult,
                    hint: '请确认 API Token 有足够的权限访问账户列表'
                } 
            }));
            return true;
        }

        // 检查提供的账户 ID 是否在账户列表中
        if (accountsResult.success && Array.isArray(accountsResult.result) && accountsResult.result.length > 0) {
            const accountExists = accountsResult.result.some(acc => acc.id === accountId);
            if (!accountExists) {
                logger.error(`[Cloudflare Gateway] 账户 ID 验证失败`);
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    error: { 
                        message: `API Token 无权访问指定的账户`,
                        details: {
                            availableAccountsCount: accountsResult.result.length,
                            availableAccounts: accountsResult.result.map(a => ({ id: a.id, name: a.name }))
                        },
                        hint: '请检查 Account ID 是否正确，或者使用的 API Token 是否属于该账户'
                    } 
                }));
                return true;
            }
            logger.info(`[Cloudflare Gateway] 账户 ID 验证通过`);
        } else if (accountsResult.success && Array.isArray(accountsResult.result) && accountsResult.result.length === 0) {
            logger.warn(`[Cloudflare Gateway] API Token 没有关联任何账户`);
        }

        // 调用 Cloudflare API 创建 Gateway
        const requestBody = {
            id: gatewayName,
            cache_ttl: 0,
            cache_invalidate_on_update: false,
            collect_logs: true,
            rate_limiting_limit: 0,
            rate_limiting_interval: 0
        };
        logger.info(`[Cloudflare Gateway] 正在调用 Cloudflare API 创建 Gateway...`);
        logger.info(`[Cloudflare Gateway] 请求体：${JSON.stringify(requestBody)}`);
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-gateway/gateways`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            },
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();

        if (!response.ok) {
            logger.error(`[Cloudflare Gateway] 创建失败: ${JSON.stringify(result)}`);
            res.writeHead(response.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: { 
                    message: result.errors?.[0]?.message || '创建 Gateway 失败',
                    details: result
                } 
            }));
            return true;
        }

        logger.info(`[Cloudflare Gateway] 创建成功：${gatewayName}`);
        
        // 构建 Gateway URL
        const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${accountId}/${result.result.id}/openai`;
        
        // 重要：自动配置 Gateway 为无认证模式，并添加 Workers AI 路由
        logger.info(`[Cloudflare Gateway] 正在配置 Gateway 为无认证模式...`);
        await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-gateway/gateways/${result.result.id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                cache_ttl: 0,
                cache_invalidate_on_update: false,
                collect_logs: true,
                rate_limiting_limit: 0,
                rate_limiting_interval: 0,
                authentication: false  // 禁用认证，允许任意 sk- 格式的 key 调用
            })
        });
        
        // 添加 Workers AI 路由，支持所有 @cf/ 开头的模型
        logger.info(`[Cloudflare Gateway] 正在添加 Workers AI 路由...`);
        const routeResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-gateway/gateways/${result.result.id}/routes`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'workers-ai-default',
                type: 'start',
                elements: [
                    {
                        id: 'workers-ai-element',
                        type: 'model',
                        model: '*',  // 匹配所有模型
                        outputs: {
                            success: {
                                elementId: 'workers-ai-element'
                            },
                            fallback: {
                                elementId: 'none'
                            }
                        },
                        properties: {
                            provider: 'workers_ai',
                            model: 'auto',  // 自动使用请求中的模型
                            timeout: 60,
                            retries: 0
                        }
                    }
                ]
            })
        });
        
        const routeResult = await routeResponse.json();
        if (routeResult.success) {
            logger.info(`[Cloudflare Gateway] Workers AI 路由配置成功`);
        } else {
            logger.warn(`[Cloudflare Gateway] 路由配置失败：${JSON.stringify(routeResult)}`);
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: 'Gateway 创建成功（已自动配置 Workers AI 路由和无认证模式）',
            gateway: {
                id: result.result.id,
                name: result.result.name,
                accountId: accountId,
                baseUrl: gatewayUrl,
                checkModelHint: 'Workers AI 模型，例如：@cf/meta/llama-3.1-8b-instruct'
            },
            features: {
                autoConfigured: true,
                authentication: 'disabled',
                backend: 'Workers AI (所有 @cf/ 模型)',
                freeQuota: '每天 10,000 次免费推理'
            },
            nextSteps: {
                step1: '配置已自动保存到 A-Plan 提供商列表',
                step2: '刷新页面后，在 "Cloudflare AI Gateway (免费)" 分组中查看',
                step3: '系统已自动配置 Workers AI 路由，可以直接调用',
                step4: '编辑配置，设置 "检查模型名称" 为 Workers AI 模型（如 @cf/meta/llama-3.1-8b-instruct）',
                step5: '保存后系统将自动执行健康检查验证配置',
                tip: '💡 Workers AI 免费额度：每天 10,000 次推理，模型格式：@cf/{provider}/{model-name}'
            }
        }));
        return true;
    } catch (error) {
        logger.error(`[Cloudflare Gateway] 创建异常: ${error.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}

/**
 * 验证 Cloudflare AI Gateway 配置
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Object} currentConfig - 当前配置
 * @returns {boolean} 是否处理成功
 */
export async function handleVerifyCloudflareGateway(req, res, currentConfig) {
    try {
        const body = await getRequestBody(req);
        const { accountId, apiToken } = body;

        if (!accountId || !apiToken) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: '缺少必要参数：accountId, apiToken' } }));
            return true;
        }

        logger.info('[Cloudflare Gateway] 验证配置中...');

        // 验证 API Token
        const verifyResponse = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            }
        });

        const verifyResult = await verifyResponse.json();

        if (!verifyResponse.ok || !verifyResult.success) {
            logger.error(`[Cloudflare Gateway] API Token 验证失败`);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: { 
                    message: verifyResult.errors?.[0]?.message || 'API Token 无效',
                    hint: '请确认使用的是 API Token 而不是 API Key'
                } 
            }));
            return true;
        }

        // 获取账户列表
        const accountsResponse = await fetch('https://api.cloudflare.com/client/v4/accounts', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            }
        });

        const accountsResult = await accountsResponse.json();

        if (!accountsResponse.ok || !accountsResult.success) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: { 
                    message: '无法获取账户列表',
                    details: accountsResult
                } 
            }));
            return true;
        }

        // 验证账户 ID 是否在列表中
        if (accountsResult.result && Array.isArray(accountsResult.result)) {
            const accountExists = accountsResult.result.some(acc => acc.id === accountId);
            if (!accountExists) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    error: { 
                        message: 'API Token 无权访问此账户',
                        hint: '请检查 Account ID 是否正确，或 API Token 是否属于此账户'
                    } 
                }));
                return true;
            }
        }

        logger.info('[Cloudflare Gateway] 验证成功');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: '验证成功',
            accountId: accountId
        }));
        return true;
    } catch (error) {
        logger.error(`[Cloudflare Gateway] 验证异常：${error.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}

/**
 * 删除 Cloudflare AI Gateway
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Object} currentConfig - 当前配置
 * @returns {boolean} 是否处理成功
 */
export async function handleDeleteCloudflareGateway(req, res, currentConfig) {
    try {
        const body = await getRequestBody(req);
        const { accountId, gatewayId, apiToken } = body;

        if (!accountId || !gatewayId || !apiToken) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: '缺少必要参数：accountId, gatewayId, apiToken' } }));
            return true;
        }

        logger.info(`[Cloudflare Gateway] 正在删除 Gateway: ${gatewayId} for account: ${accountId}`);

        // 先验证 API Token
        const verifyResponse = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            }
        });

        const verifyResult = await verifyResponse.json();

        if (!verifyResponse.ok || !verifyResult.success) {
            logger.error(`[Cloudflare Gateway] API Token 验证失败`);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: { 
                    message: verifyResult.errors?.[0]?.message || 'API Token 无效',
                    hint: '请确认使用的是 API Token 而不是 API Key'
                } 
            }));
            return true;
        }

        // 调用 Cloudflare API 删除 Gateway
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-gateway/gateways/${gatewayId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            }
        });

        const result = await response.json();

        if (!response.ok) {
            logger.error(`[Cloudflare Gateway] 删除失败：${JSON.stringify(result)}`);
            res.writeHead(response.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: { 
                    message: result.errors?.[0]?.message || '删除 Gateway 失败',
                    details: result
                } 
            }));
            return true;
        }

        logger.info(`[Cloudflare Gateway] 删除成功：${gatewayId}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: 'Gateway 已删除',
            gatewayId: gatewayId
        }));
        return true;
    } catch (error) {
        logger.error(`[Cloudflare Gateway] 删除异常：${error.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}

/**
 * 获取 Cloudflare AI Gateway 列表
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Object} currentConfig - 当前配置
 * @returns {boolean} 是否处理成功
 */
export async function handleListCloudflareGateways(req, res, currentConfig) {
    try {
        const { accountId, apiToken } = req.query || {};

        if (!accountId || !apiToken) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: '缺少必要参数：accountId, apiToken' } }));
            return true;
        }

        logger.info(`[Cloudflare Gateway] 正在获取 Gateway 列表 for account: ${accountId}`);

        // 先验证 API Token
        const verifyResponse = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            }
        });

        const verifyResult = await verifyResponse.json();

        if (!verifyResponse.ok || !verifyResult.success) {
            logger.error(`[Cloudflare Gateway] API Token 验证失败`);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: { 
                    message: verifyResult.errors?.[0]?.message || 'API Token 无效',
                    hint: '请确认使用的是 API Token 而不是 API Key'
                } 
            }));
            return true;
        }

        // 调用 Cloudflare API 获取 Gateway 列表
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-gateway/gateways`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            }
        });

        const result = await response.json();

        if (!response.ok) {
            logger.error(`[Cloudflare Gateway] 获取列表失败：${JSON.stringify(result)}`);
            res.writeHead(response.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: { 
                    message: result.errors?.[0]?.message || '获取 Gateway 列表失败',
                    details: result
                } 
            }));
            return true;
        }

        logger.info(`[Cloudflare Gateway] 获取列表成功，共 ${result.result?.length || 0} 个 Gateway`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            gateways: result.result || [],
            count: result.result?.length || 0
        }));
        return true;
    } catch (error) {
        logger.error(`[Cloudflare Gateway] 获取列表异常：${error.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}
