import { OpenAIResponsesApiService } from './openai/openai-responses-core.js';
import { GeminiApiKeyService } from './gemini/gemini-api-key-core.js';
import { OpenAIApiService } from './openai/openai-core.js';
import { ClaudeApiService } from './claude/claude-core.js';
import { ForwardApiService } from './forward/forward-core.js';
import { GrokApiService } from './grok/grok-core.js';
import { NvidiaApiService } from './nvidia/nvidia-core.js';
import { WorkersAIApiServiceAdapter } from './workersai/workersai-adapter.js';
import { MODEL_PROVIDER } from '../utils/constants.js';
import logger from '../utils/logger.js';

// 适配器注册表
const adapterRegistry = new Map();

/**
 * 注册服务适配器
 * @param {string} provider - 提供商名称 (来自 MODEL_PROVIDER)
 * @param {typeof ApiServiceAdapter} adapterClass - 适配器类
 */
export function registerAdapter(provider, adapterClass) {
    logger.info(`[Adapter] Registering adapter for provider: ${provider}`);
    adapterRegistry.set(provider, adapterClass);
}

/**
 * 获取所有已注册的提供商
 * @returns {string[]} 已注册的提供商名称列表
 */
export function getRegisteredProviders() {
    return Array.from(adapterRegistry.keys());
}

// 定义AI服务适配器接口
// 所有的服务适配器都应该实现这些方法
export class ApiServiceAdapter {
    constructor() {
        if (new.target === ApiServiceAdapter) {
            throw new TypeError("Cannot construct ApiServiceAdapter instances directly");
        }
    }

    /**
     * 生成内容
     * @param {string} model - 模型名称
     * @param {object} requestBody - 请求体
     * @returns {Promise<object>} - API响应
     */
    async generateContent(model, requestBody) {
        throw new Error("Method 'generateContent()' must be implemented.");
    }

    /**
     * 流式生成内容
     * @param {string} model - 模型名称
     * @param {object} requestBody - 请求体
     * @returns {AsyncIterable<object>} - API响应流
     */
    async *generateContentStream(model, requestBody) {
        throw new Error("Method 'generateContentStream()' must be implemented.");
    }

    /**
     * 列出可用模型
     * @returns {Promise<object>} - 模型列表
     */
    async listModels() {
        throw new Error("Method 'listModels()' must be implemented.");
    }

    /**
     * 刷新认证令牌
     * @returns {Promise<void>}
     */
    async refreshToken() {
        throw new Error("Method 'refreshToken()' must be implemented.");
    }

    /**
     * 强制刷新认证令牌（不判断是否接近过期）
     * @returns {Promise<void>}
     */
    async forceRefreshToken() {
        throw new Error("Method 'forceRefreshToken()' must be implemented.");
    }

    /**
     * 判断日期是否接近过期
     * @returns {boolean}
     */
    isExpiryDateNear() {
        throw new Error("Method 'isExpiryDateNear()' must be implemented.");
    }
}

// NVIDIA NIM API 服务适配器
export class NvidiaNimApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.nvidiaApiService = new NvidiaApiService(config);
    }

    async generateContent(model, requestBody) {
        return this.nvidiaApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        yield* this.nvidiaApiService.generateContentStream(model, requestBody);
    }

    async listModels() {
        return this.nvidiaApiService.listModels();
    }

    async refreshToken() { return Promise.resolve(); }
    async forceRefreshToken() { return Promise.resolve(); }
    isExpiryDateNear() { return false; }
}

// Gemini API Key 服务适配器
export class GeminiApiKeyServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.geminiApiKeyService = new GeminiApiKeyService(config);
    }

    async generateContent(model, requestBody) {
        return this.geminiApiKeyService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        yield* this.geminiApiKeyService.generateContentStream(model, requestBody);
    }

    async listModels() {
        return this.geminiApiKeyService.listModels();
    }

    async refreshToken() {
        return this.geminiApiKeyService.refreshToken();
    }

    async forceRefreshToken() {
        return this.geminiApiKeyService.forceRefreshToken();
    }

    isExpiryDateNear() {
        return this.geminiApiKeyService.isExpiryDateNear();
    }
}

// OpenAI API 服务适配器
export class OpenAIApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.openAIApiService = new OpenAIApiService(config);
    }

    async generateContent(model, requestBody) {
        // The adapter now expects the requestBody to be in the native OpenAI format.
        // The conversion logic is handled upstream in the server.
        return this.openAIApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        // The adapter now expects the requestBody to be in the native OpenAI format.
        const stream = this.openAIApiService.generateContentStream(model, requestBody);
        // The stream is yielded directly without conversion.
        yield* stream;
    }

    async listModels() {
        // The adapter now returns the native model list from the underlying service.
        return this.openAIApiService.listModels();
    }

    async refreshToken() {
        // OpenAI API keys are typically static and do not require refreshing.
        return Promise.resolve();
    }

    async forceRefreshToken() {
        // OpenAI API keys are typically static and do not require refreshing.
        return Promise.resolve();
    }

    isExpiryDateNear() {
        return false;
    }
}

// OpenAI Responses API 服务适配器
export class OpenAIResponsesApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.openAIResponsesApiService = new OpenAIResponsesApiService(config);
    }

    async generateContent(model, requestBody) {
        // The adapter expects the requestBody to be in the OpenAI Responses format.
        return this.openAIResponsesApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        // The adapter expects the requestBody to be in the OpenAI Responses format.
        const stream = this.openAIResponsesApiService.generateContentStream(model, requestBody);
        yield* stream;
    }

    async listModels() {
        // The adapter returns the native model list from the underlying service.
        return this.openAIResponsesApiService.listModels();
    }

    async refreshToken() {
        // OpenAI API keys are typically static and do not require refreshing.
        return Promise.resolve();
    }

    async forceRefreshToken() {
        // OpenAI API keys are typically static and do not require refreshing.
        return Promise.resolve();
    }

    isExpiryDateNear() {
        return false;
    }
}

// Claude API 服务适配器
export class ClaudeApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.claudeApiService = new ClaudeApiService(config);
    }

    async generateContent(model, requestBody) {
        // The adapter now expects the requestBody to be in the native Claude format.
        return this.claudeApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        // The adapter now expects the requestBody to be in the native Claude format.
        const stream = this.claudeApiService.generateContentStream(model, requestBody);
        yield* stream;
    }

    async listModels() {
        // The adapter now returns the native model list from the underlying service.
        return this.claudeApiService.listModels();
    }

    async refreshToken() {
        return Promise.resolve();
    }

    async forceRefreshToken() {
        return Promise.resolve();
    }

    isExpiryDateNear() {
        return false;
    }
}

// Forward API 服务适配器
export class ForwardApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.forwardApiService = new ForwardApiService(config);
    }

    async generateContent(model, requestBody) {
        return this.forwardApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        yield* this.forwardApiService.generateContentStream(model, requestBody);
    }

    async listModels() {
        return this.forwardApiService.listModels();
    }

    async refreshToken() {
        return Promise.resolve();
    }

    async forceRefreshToken() {
        return Promise.resolve();
    }

    isExpiryDateNear() {
        return false;
    }
}

// Grok API 服务适配器
export class GrokApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.grokApiService = new GrokApiService(config);
    }

    async generateContent(model, requestBody) {
        if (!this.grokApiService.isInitialized) {
            await this.grokApiService.initialize();
        }
        return this.grokApiService.generateContent(model, requestBody);
    }

    async *generateContentStream(model, requestBody) {
        if (!this.grokApiService.isInitialized) {
            await this.grokApiService.initialize();
        }
        yield* this.grokApiService.generateContentStream(model, requestBody);
    }

    async listModels() {
        if (!this.grokApiService.isInitialized) {
            await this.grokApiService.initialize();
        }
        return this.grokApiService.listModels();
    }

    async refreshToken() {
        return this.grokApiService.refreshToken();
    }

    async forceRefreshToken() {
        return this.grokApiService.refreshToken();
    }

    isExpiryDateNear() {
        return this.grokApiService.isExpiryDateNear();
    }

    /**
     * 获取用量限制信息
     * @returns {Promise<Object>} 用量限制信息
     */
    async getUsageLimits() {
        if (!this.grokApiService.isInitialized) {
            await this.grokApiService.initialize();
        }
        return this.grokApiService.getUsageLimits();
    }
}

// 注册所有内置适配器
registerAdapter(MODEL_PROVIDER.OPENAI_CUSTOM, OpenAIApiServiceAdapter);
registerAdapter(MODEL_PROVIDER.CLOUDFLARE_GATEWAY_FREE, WorkersAIApiServiceAdapter);
registerAdapter(MODEL_PROVIDER.CLOUDFLARE_GATEWAY_PROXY, OpenAIApiServiceAdapter);

// 用于存储服务适配器单例的映射
export const serviceInstances = {};
// 存储最后访问时间，用于清理
const lastAccessTimes = new Map();

export function getServiceInstanceKey(provider, uuid = null) {
    return uuid ? provider + uuid : provider;
}

export function invalidateServiceAdapter(provider, uuid = null) {
    const providerKey = getServiceInstanceKey(provider, uuid);
    if (serviceInstances[providerKey]) {
        delete serviceInstances[providerKey];
        lastAccessTimes.delete(providerKey);
        logger.info(`[Adapter] Invalidated service adapter, provider: ${provider}, uuid: ${uuid || 'default'}`);
        return true;
    }
    return false;
}

/**
 * 自动清理闲置实例，防止内存泄漏
 */
function cleanupIdleInstances() {
    const now = Date.now();
    const IDLE_TIMEOUT = 30 * 60 * 1000; // 30分钟闲置则清理
    
    for (const [key, lastAccess] of lastAccessTimes.entries()) {
        if (now - lastAccess > IDLE_TIMEOUT) {
            delete serviceInstances[key];
            lastAccessTimes.delete(key);
            logger.info(`[Adapter] Auto-cleaned idle instance: ${key}`);
        }
    }
}
setInterval(cleanupIdleInstances, 5 * 60 * 1000); // 每5分钟检查一次

/**
 * 检查提供商是否已注册（支持前缀匹配）
 * @param {string} provider - 提供商名称
 * @returns {boolean} - 是否有效
 */
export function isRegisteredProvider(provider) {
    if (adapterRegistry.has(provider)) {
        return true;
    }
    
    // 检查前缀 (例如 openai-custom-1 -> openai-custom)
    for (const key of adapterRegistry.keys()) {
        if (provider.startsWith(key + '-')) {
            return true;
        }
    }
    
    return false;
}

// 服务适配器工厂
export function getServiceAdapter(config) {
    const provider = config.MODEL_PROVIDER;
    const providerKey = getServiceInstanceKey(provider, config.uuid);
    
    // 更新最后访问时间
    lastAccessTimes.set(providerKey, Date.now());

    if (!serviceInstances[providerKey]) {
        const customNameDisplay = config.customName ? ` (${config.customName})` : '';
        logger.info(`[Adapter] Creating NEW service adapter, provider: ${config.MODEL_PROVIDER}, uuid: ${config.uuid}${customNameDisplay}`);
        
        let AdapterClass = adapterRegistry.get(provider);
        
        // 如果没找到精确匹配，尝试通过前缀查找 (例如 openai-custom-1 -> openai-custom)
        if (!AdapterClass) {
            for (const [key, value] of adapterRegistry.entries()) {
                if (provider === key || provider.startsWith(key + '-')) {
                    AdapterClass = value;
                    break;
                }
            }
        }
        
        if (AdapterClass) {
            serviceInstances[providerKey] = new AdapterClass(config);
        } else {
            throw new Error(`Unsupported model provider: ${provider}`);
        }
    }
    return serviceInstances[providerKey];
}
