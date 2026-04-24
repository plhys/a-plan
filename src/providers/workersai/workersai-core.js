import axios from 'axios';
import logger from '../../utils/logger.js';
import * as http from 'http';
import * as https from 'https';
import { configureAxiosProxy, configureTLSSidecar } from '../../utils/proxy-utils.js';
import { isRetryableNetworkError } from '../../utils/common.js';

/**
 * Cloudflare Workers AI API Service
 * 支持通过 Cloudflare AI Gateway 调用 Workers AI 免费额度
 */
export class WorkersAIApiService {
    constructor(config) {
        this.config = config;
        
        // Cloudflare Gateway 配置
        const cfAccountId = config.accountId || config.CF_ACCOUNT_ID;
        const cfGatewayName = config.gatewayId || config.CF_GATEWAY_NAME;
        const cfApiToken = config.cfApiToken || config.CF_API_TOKEN || config.apiKey;
        
        if (!cfAccountId || !cfGatewayName) {
            throw new Error('Cloudflare Account ID 和 Gateway ID 是必需的');
        }
        
        // 构建 Workers AI Gateway URL
        this.baseUrl = `https://gateway.ai.cloudflare.com/v1/${cfAccountId}/${cfGatewayName}/workers-ai/run`;
        this.apiKey = cfApiToken;
        
        logger.info(`[WorkersAI] Using Gateway: ${this.baseUrl}`);
        
        this.useSystemProxy = config?.USE_SYSTEM_PROXY_OPENAI ?? false;
        logger.info(`[WorkersAI] System proxy ${this.useSystemProxy ? 'enabled' : 'disabled'}`);
        
        // 配置 HTTP/HTTPS agent
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
        
        // 禁用系统代理
        if (!this.useSystemProxy) {
            axiosConfig.proxy = false;
        }
        
        this.axiosInstance = axios.create(axiosConfig);
        
        // 配置 Axios 拦截器
        this.axiosInstance.interceptors.request.use(
            (config) => {
                logger.debug(`[WorkersAI] Request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                logger.error(`[WorkersAI] Request error:`, error);
                return Promise.reject(error);
            }
        );
        
        this.axiosInstance.interceptors.response.use(
            (response) => {
                logger.debug(`[WorkersAI] Response status: ${response.status}`);
                return response;
            },
            (error) => {
                logger.error(`[WorkersAI] Response error:`, error.response?.data || error.message);
                return Promise.reject(error);
            }
        );
    }
    
    /**
     * 调用 Workers AI API
     * @param {string} model - 模型 ID（如：@cf/meta/llama-3.1-8b-instruct）
     * @param {object} body - 请求体
     * @param {boolean} isRetry - 是否重试
     * @param {number} retryCount - 重试次数
     */
    async callApi(model, body, isRetry = false, retryCount = 0) {
        const maxRetries = this.config.REQUEST_MAX_RETRIES || 3;
        const baseDelay = this.config.REQUEST_BASE_DELAY || 1000;
        
        try {
            const endpoint = `/${model}`;
            const axiosConfig = {
                method: 'post',
                url: endpoint,
                data: body
            };
            
            const response = await this.axiosInstance.request(axiosConfig);
            
            // 转换 Workers AI 响应为 OpenAI 格式
            return this.transformResponse(response.data);
            
        } catch (error) {
            const status = error.response?.status;
            const data = error.response?.data;
            const errorCode = error.code;
            const errorMessage = error.message || '';
            
            const isNetworkError = isRetryableNetworkError(error);
            
            if (status === 401 || status === 403) {
                logger.error(`[WorkersAI] Received ${status}. API Token might be invalid.`);
                throw error;
            }
            
            // 处理 429 限流
            if (status === 429 && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                logger.info(`[WorkersAI] Received 429. Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApi(model, body, isRetry, retryCount + 1);
            }
            
            // 处理 5xx 服务器错误
            if (status >= 500 && status < 600 && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                logger.info(`[WorkersAI] Received ${status}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApi(model, body, isRetry, retryCount + 1);
            }
            
            // 处理网络错误
            if (isNetworkError && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                logger.info(`[WorkersAI] Network error. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApi(model, body, isRetry, retryCount + 1);
            }
            
            logger.error(`[WorkersAI] Error calling API (Status: ${status}):`, data || error.message);
            throw error;
        }
    }
    
    /**
     * 转换 Workers AI 响应为 OpenAI 格式
     * @param {object} workersAiResponse - Workers AI 响应
     * @returns {object} OpenAI 格式响应
     */
    transformResponse(workersAiResponse) {
        if (!workersAiResponse || !workersAiResponse.result) {
            return workersAiResponse;
        }
        
        const { result, usage } = workersAiResponse;
        const responseText = result.response || result.text || '';
        
        // 转换为 OpenAI 聊天完成格式
        return {
            id: `workersai-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: result.model || 'unknown',
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: responseText
                    },
                    finish_reason: 'stop'
                }
            ],
            usage: usage || {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            }
        };
    }
    
    /**
     * 生成内容
     * @param {string} model - 模型 ID
     * @param {object} requestBody - 请求体（OpenAI 格式）
     */
    async generateContent(model, requestBody) {
        // Workers AI 使用不同的请求格式
        const workersAiBody = this.transformRequest(requestBody);
        const response = await this.callApi(model, workersAiBody);
        return response;
    }
    
    /**
     * 转换 OpenAI 请求为 Workers AI 格式
     * @param {object} openAiBody - OpenAI 格式请求体
     * @returns {object} Workers AI 格式请求体
     */
    transformRequest(openAiBody) {
        const messages = openAiBody.messages || [];
        const maxTokens = openAiBody.max_tokens || openAiBody.max_completion_tokens || 1024;
        const temperature = openAiBody.temperature ?? 0.7;
        
        // Workers AI 格式
        return {
            messages,
            max_tokens: maxTokens,
            temperature
        };
    }
    
    /**
     * 流式调用（Workers AI 不支持流式，使用普通调用模拟）
     */
    async *generateContentStream(model, requestBody) {
        // Workers AI 不支持真正的流式输出
        // 使用普通调用然后模拟流式响应
        try {
            const result = await this.generateContent(model, requestBody);
            
            // 模拟 OpenAI 流式响应格式
            const chunk = {
                id: result.id,
                object: 'chat.completion.chunk',
                created: result.created,
                model: result.model,
                choices: [
                    {
                        index: 0,
                        delta: {
                            role: 'assistant',
                            content: result.choices[0].message.content
                        },
                        finish_reason: 'stop'
                    }
                ]
            };
            
            yield chunk;
            
        } catch (error) {
            logger.error(`[WorkersAI] Stream error:`, error);
            throw error;
        }
    }
    
    /**
     * 获取模型列表
     */
    async listModels() {
        // Workers AI 模型列表是预定义的
        const workersAiModels = [
            // Meta Llama 系列
            { id: '@cf/meta/llama-3.1-8b-instruct', object: 'model', owned_by: 'meta' },
            { id: '@cf/meta/llama-3.2-1b-instruct', object: 'model', owned_by: 'meta' },
            { id: '@cf/meta/llama-3.2-3b-instruct', object: 'model', owned_by: 'meta' },
            { id: '@cf/meta/llama-3.1-70b-instruct', object: 'model', owned_by: 'meta' },
            { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', object: 'model', owned_by: 'meta' },
            // Mistral
            { id: '@cf/mistral/mistral-7b-instruct-v0.1', object: 'model', owned_by: 'mistral' },
            // 向量嵌入模型
            { id: '@cf/baai/bge-base-en-v1.5', object: 'model', owned_by: 'baai' },
            { id: '@cf/baai/bge-large-en-v1.5', object: 'model', owned_by: 'baai' }
        ];
        
        logger.info(`[WorkersAI] Using predefined models (${workersAiModels.length} models)`);
        return { data: workersAiModels };
    }
}