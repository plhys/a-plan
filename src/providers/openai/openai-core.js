import axios from 'axios';
import logger from '../../utils/logger.js';
import * as http from 'http';
import * as https from 'https';
import { configureAxiosProxy, configureTLSSidecar } from '../../utils/proxy-utils.js';
import { isRetryableNetworkError, MODEL_PROVIDER } from '../../utils/common.js';

// Assumed OpenAI API specification service for interacting with third-party models
export class OpenAIApiService {
    constructor(config) {
        // 4.2.6 极客增强：自动探测 API Key，优先尝试特定供应商前缀，其次尝试通用 Key
        this.apiKey = config.apiKey || config.OPENAI_API_KEY || config.GROQ_API_KEY || config.SAMBANOVA_API_KEY || config.GITHUB_TOKEN || config.CF_API_TOKEN;
        
        if (!this.apiKey) {
            throw new Error(`API Key is required for OpenAI-compatible service (${config.MODEL_PROVIDER}).`);
        }
        this.config = config;
        this.baseUrl = config.baseUrl || config.OPENAI_BASE_URL;
        
        // 自动补全常用供应商的 Base URL
        if (!this.baseUrl) {
            if (config.MODEL_PROVIDER === 'groq-api') this.baseUrl = 'https://api.groq.com/openai/v1';
            else if (config.MODEL_PROVIDER === 'sambanova-api') this.baseUrl = 'https://api.sambanova.ai/v1';
            else if (config.MODEL_PROVIDER === 'github-models') this.baseUrl = 'https://models.inference.ai.azure.com';
        }

        // Cloudflare Gateway 免费额度模式：自动生成 Gateway URL
        // 支持两种配置格式：1) 新格式 (accountId, gatewayId) 2) 旧格式 (CF_ACCOUNT_ID, CF_GATEWAY_NAME)
        const cfAccountId = config.accountId || config.CF_ACCOUNT_ID;
        const cfGatewayName = config.gatewayId || config.CF_GATEWAY_NAME;
        const targetApiUrl = config.TARGET_API_URL;
        const targetApiKey = config.TARGET_API_KEY;
        
        if (cfAccountId && cfGatewayName) {
            if (targetApiUrl) {
                // 代理模式：使用目标 API 地址
                this.baseUrl = targetApiUrl;
                this.apiKey = targetApiKey || this.apiKey;
                logger.info(`[OpenAI] Using Cloudflare Gateway proxy mode, target: ${this.baseUrl}`);
            } else {
                // 免费额度模式：使用 Cloudflare Gateway Workers AI 端点
                this.baseUrl = `https://gateway.ai.cloudflare.com/v1/${cfAccountId}/${cfGatewayName}/workers-ai/run`;
                this.apiKey = 'cfat_' + (cfGatewayName || 'workers-ai'); // 占位符
                logger.info(`[OpenAI] Using Workers AI free mode: ${this.baseUrl}`);
            }
        }

        this.useSystemProxy = config?.USE_SYSTEM_PROXY_OPENAI ?? false;
        logger.info(`[OpenAI] System proxy ${this.useSystemProxy ? 'enabled' : 'disabled'}`);

        // 配置 HTTP/HTTPS agent 限制连接池大小，避免资源泄漏
        const httpAgent = new http.Agent({
            keepAlive: true,
            maxSockets: 100,
            maxFreeSockets: 5,
            timeout: 120000,
        });
        const httpsAgent = new https.Agent({
            keepAlive: true,
            maxSockets: 100,
            maxFreeSockets: 5,
            timeout: 120000,
        });

        const axiosConfig = {
            baseURL: this.baseUrl,
            httpAgent,
            httpsAgent,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
        };
        
        // Cloudflare Gateway 特殊处理：添加 cf-aig-authorization 头
        // 支持两种模式：
        // 1) cfApiToken 模式：使用独立的 cfApiToken 配置
        // 2) 兼容模式：apiKey 以 cfut_ 开头
        const cfApiToken = config.cfApiToken || config.CF_API_TOKEN;
        if (cfAccountId && cfGatewayName && (cfApiToken || this.apiKey?.startsWith('cfut_'))) {
            const tokenToUse = cfApiToken || this.apiKey;
            axiosConfig.headers['cf-aig-authorization'] = `Bearer ${tokenToUse}`;
            // 使用任意 sk- 格式作为 Authorization，因为 Gateway 会验证 cf-aig-authorization 头
            axiosConfig.headers['Authorization'] = 'Bearer sk-cloudflare-gateway-auth';
            logger.info(`[OpenAI] Using Cloudflare Gateway auth mode with cf-aig-authorization header`);
        }
        
        // NLB 不支持 Brotli 压缩，需要禁用压缩
        if (this.baseUrl && this.baseUrl.includes('.nlb.aliyuncs')) {
            axiosConfig.headers['Accept-Encoding'] = 'identity';
        }
        
        // 禁用系统代理以避免HTTPS代理错误
        if (!this.useSystemProxy) {
            axiosConfig.proxy = false;
        }
        
        // 配置自定义代理
        configureAxiosProxy(axiosConfig, config, config.MODEL_PROVIDER || MODEL_PROVIDER.OPENAI_CUSTOM);
        
        this.axiosInstance = axios.create(axiosConfig);
    }

    _applySidecar(axiosConfig) {
        return configureTLSSidecar(axiosConfig, this.config, this.config.MODEL_PROVIDER || MODEL_PROVIDER.OPENAI_CUSTOM, this.baseUrl);
    }

    async callApi(endpoint, body, isRetry = false, retryCount = 0) {
        const maxRetries = this.config.REQUEST_MAX_RETRIES || 3;
        const baseDelay = this.config.REQUEST_BASE_DELAY || 1000;  // 1 second base delay

        try {
            const axiosConfig = {
                method: 'post',
                url: endpoint,
                data: body
            };
            this._applySidecar(axiosConfig);
            const response = await this.axiosInstance.request(axiosConfig);
            return response.data;
        } catch (error) {
            const status = error.response?.status;
            const data = error.response?.data;
            const errorCode = error.code;
            const errorMessage = error.message || '';
            
            // 检查是否为可重试的网络错误
            const isNetworkError = isRetryableNetworkError(error);
            
            if (status === 401 || status === 403) {
                logger.error(`[OpenAI API] Received ${status}. API Key might be invalid or expired.`);
                throw error;
            }

            // Handle 429 (Too Many Requests) with exponential backoff
            if (status === 429 && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                logger.info(`[OpenAI API] Received 429 (Too Many Requests). Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApi(endpoint, body, isRetry, retryCount + 1);
            }

            // Handle other retryable errors (5xx server errors)
            if (status >= 500 && status < 600 && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                logger.info(`[OpenAI API] Received ${status} server error. Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApi(endpoint, body, isRetry, retryCount + 1);
            }

            // Handle network errors (ECONNRESET, ETIMEDOUT, etc.) with exponential backoff
            if (isNetworkError && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                const errorIdentifier = errorCode || errorMessage.substring(0, 50);
                logger.info(`[OpenAI API] Network error (${errorIdentifier}). Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApi(endpoint, body, isRetry, retryCount + 1);
            }

            logger.error(`[OpenAI API] Error calling API (Status: ${status}, Code: ${errorCode}):`, errorMessage);
            throw error;
        }
    }

    async *streamApi(endpoint, body, isRetry = false, retryCount = 0) {
        const maxRetries = this.config.REQUEST_MAX_RETRIES || 3;
        const baseDelay = this.config.REQUEST_BASE_DELAY || 1000;  // 1 second base delay

        // OpenAI 的流式请求需要将 stream 设置为 true
        const streamRequestBody = { ...body, stream: true };

        try {
            const axiosConfig = {
                method: 'post',
                url: endpoint,
                data: streamRequestBody,
                responseType: 'stream'
            };
            this._applySidecar(axiosConfig);
            const response = await this.axiosInstance.request(axiosConfig);

            const stream = response.data;
            let buffer = '';

            for await (const chunk of stream) {
                buffer += chunk.toString();
                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, newlineIndex).trim();
                    buffer = buffer.substring(newlineIndex + 1);

                    if (line.startsWith('data: ')) {
                        const jsonData = line.substring(6).trim();
                        if (jsonData === '[DONE]') {
                            return; // Stream finished
                        }
                        try {
                            const parsedChunk = JSON.parse(jsonData);
                            yield parsedChunk;
                        } catch (e) {
                            logger.warn("[OpenAIApiService] Failed to parse stream chunk JSON:", e.message, "Data:", jsonData);
                        }
                    } else if (line === '') {
                        // Empty line, end of an event
                    }
                }
            }
        } catch (error) {
            const status = error.response?.status;
            const data = error.response?.data;
            const errorCode = error.code;
            const errorMessage = error.message || '';
            
            // 检查是否为可重试的网络错误
            const isNetworkError = isRetryableNetworkError(error);
            
            if (status === 401 || status === 403) {
                logger.error(`[OpenAI API] Received ${status} during stream. API Key might be invalid or expired.`);
                throw error;
            }

            // Handle 429 (Too Many Requests) with exponential backoff
            if (status === 429 && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                logger.info(`[OpenAI API] Received 429 (Too Many Requests) during stream. Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                yield* this.streamApi(endpoint, body, isRetry, retryCount + 1);
                return;
            }

            // Handle other retryable errors (5xx server errors)
            if (status >= 500 && status < 600 && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                logger.info(`[OpenAI API] Received ${status} server error during stream. Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                yield* this.streamApi(endpoint, body, isRetry, retryCount + 1);
                return;
            }

            // Handle network errors (ECONNRESET, ETIMEDOUT, etc.) with exponential backoff
            if (isNetworkError && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                const errorIdentifier = errorCode || errorMessage.substring(0, 50);
                logger.info(`[OpenAI API] Network error (${errorIdentifier}) during stream. Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                yield* this.streamApi(endpoint, body, isRetry, retryCount + 1);
                return;
            }

            logger.error(`[OpenAI API] Error calling streaming API (Status: ${status}, Code: ${errorCode}):`, errorMessage);
            throw error;
        }
    }

    async generateContent(model, requestBody) {
        // 临时存储 monitorRequestId
        if (requestBody._monitorRequestId) {
            this.config._monitorRequestId = requestBody._monitorRequestId;
            delete requestBody._monitorRequestId;
        }
        if (requestBody._requestBaseUrl) {
            delete requestBody._requestBaseUrl;
        }

        return this.callApi('/chat/completions', requestBody);
    }

    async *generateContentStream(model, requestBody) {
        // 临时存储 monitorRequestId
        if (requestBody._monitorRequestId) {
            this.config._monitorRequestId = requestBody._monitorRequestId;
            delete requestBody._monitorRequestId;
        }
        if (requestBody._requestBaseUrl) {
            delete requestBody._requestBaseUrl;
        }

        yield* this.streamApi('/chat/completions', requestBody);
    }

    async listModels() {
        try {
            // Cloudflare Gateway 特殊处理：直接返回 Workers AI 模型列表
            // 因为 Gateway 的 /models API 需要额外配置，而 Workers AI 模型是固定的
            const cfAccountId = this.config.accountId || this.config.CF_ACCOUNT_ID;
            const cfGatewayName = this.config.gatewayId || this.config.CF_GATEWAY_NAME;
            
            if (cfAccountId && cfGatewayName) {
                // 返回已验证的 Workers AI 模型列表（共 10+ 个可用模型，包括向量模型）
                const workersAiModels = [
                    // === 文本对话模型 ===
                    // Meta Llama 系列
                    { id: '@cf/meta/llama-3.1-8b-instruct', object: 'model', owned_by: 'meta' },
                    { id: '@cf/meta/llama-3.2-1b-instruct', object: 'model', owned_by: 'meta' },
                    { id: '@cf/meta/llama-3.2-3b-instruct', object: 'model', owned_by: 'meta' },
                    { id: '@cf/meta/llama-3.1-70b-instruct', object: 'model', owned_by: 'meta' },
                    { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', object: 'model', owned_by: 'meta' },
                    // Mistral
                    { id: '@cf/mistral/mistral-7b-instruct-v0.1', object: 'model', owned_by: 'mistral' },
                    // === 向量嵌入模型 ===
                    { id: '@cf/baai/bge-base-en-v1.5', object: 'model', owned_by: 'baai' },
                    { id: '@cf/baai/bge-large-en-v1.5', object: 'model', owned_by: 'baai' }
                ];
                logger.info(`[OpenAI] Using predefined Workers AI models for Cloudflare Gateway (${workersAiModels.length} models available)`);
                return { data: workersAiModels };
            }
            
            // 其他 OpenAI 兼容 API：调用标准 /models 端点
            const response = await this.axiosInstance.get('/models');
            return response.data;
        } catch (error) {
            const status = error.response?.status;
            const data = error.response?.data;
            logger.error(`Error listing OpenAI models (Status: ${status}):`, data || error.message);
            throw error;
        }
    }
}

