import axios from 'axios';
import logger from '../../utils/logger.js';
import * as http from 'http';
import * as https from 'https';
import { configureAxiosProxy, configureTLSSidecar } from '../../utils/proxy-utils.js';
import { isRetryableNetworkError, MODEL_PROVIDER } from '../../utils/common.js';
import { getProviderModels } from '../provider-models.js';

// Google AI Studio (AI Studio) API Key 适配器
// 文档: https://ai.google.dev/docs

const GEMINI_API_KEY_MODELS = getProviderModels(MODEL_PROVIDER.GEMINI_API_KEY);
const BASE_URL = 'https://generativelanguage.googleapis.com';

/**
 * Google AI Studio API 服务适配器 (API Key 认证)
 */
export class GeminiApiKeyService {
    constructor(config) {
        this.apiKey = config.apiKey || config.GEMINI_API_KEY;
        
        if (!this.apiKey) {
            throw new Error('API Key is required for Gemini API service (gemini-api-key).');
        }
        
        this.config = config;
        this.baseUrl = config.baseUrl || BASE_URL;
        
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
            },
        };
        
        // 配置自定义代理
        configureAxiosProxy(axiosConfig, config, MODEL_PROVIDER.GEMINI_API_KEY);
        
        this.axiosInstance = axios.create(axiosConfig);
        
        logger.info(`[Gemini API Key] Service initialized with base URL: ${this.baseUrl}`);
    }

    _applySidecar(axiosConfig) {
        return configureTLSSidecar(axiosConfig, this.config, MODEL_PROVIDER.GEMINI_API_KEY, this.baseUrl);
    }

    /**
     * 将 OpenAI 格式转换为 Gemini 格式
     */
    _convertToGeminiRequest(requestBody) {
        const geminiRequest = { ...requestBody };
        
        // 删除 model 字段，Gemini 在 URL 中指定模型
        delete geminiRequest.model;
        
        // 处理 contents
        if (geminiRequest.messages) {
            geminiRequest.contents = this._convertMessagesToContents(geminiRequest.messages);
            delete geminiRequest.messages;
        }
        
        // 处理 systemInstruction
        if (geminiRequest.system_instruction) {
            geminiRequest.systemInstruction = geminiRequest.system_instruction;
            delete geminiRequest.system_instruction;
        }
        
        // 处理 tools
        if (geminiRequest.tools) {
            geminiRequest.tools = this._convertTools(geminiRequest.tools);
        }
        
        return geminiRequest;
    }

    /**
     * 转换消息格式
     */
    _convertMessagesToContents(messages) {
        const contents = [];
        
        for (const msg of messages) {
            const content = {
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: []
            };
            
            if (typeof msg.content === 'string') {
                content.parts.push({ text: msg.content });
            } else if (Array.isArray(msg.content)) {
                for (const part of msg.content) {
                    if (part.type === 'text') {
                        content.parts.push({ text: part.text });
                    } else if (part.type === 'image_url') {
                        // 处理图片
                        const imageUrl = part.image_url?.url || part.url;
                        if (imageUrl) {
                            content.parts.push({
                                inlineData: {
                                    mimeType: this._getMimeType(imageUrl),
                                    data: this._extractBase64(imageUrl)
                                }
                            });
                        }
                    }
                }
            }
            
            contents.push(content);
        }
        
        return contents;
    }

    /**
     * 转换工具定义
     */
    _convertTools(tools) {
        return tools.map(tool => {
            if (tool.function) {
                return {
                    functionDeclarations: [tool.function]
                };
            }
            return tool;
        });
    }

    /**
     * 从 URL 提取 MIME 类型
     */
    _getMimeType(url) {
        if (url.includes('png')) return 'image/png';
        if (url.includes('jpeg') || url.includes('jpg')) return 'image/jpeg';
        if (url.includes('webp')) return 'image/webp';
        if (url.includes('gif')) return 'image/gif';
        return 'image/jpeg';
    }

    /**
     * 从 Data URL 提取 Base64 数据
     */
    _extractBase64(dataUrl) {
        if (dataUrl.startsWith('data:')) {
            const base64 = dataUrl.split(',')[1];
            return base64;
        }
        // 如果是普通 URL，需要先下载
        return dataUrl;
    }

    /**
     * 调用 API
     */
    async callApi(model, endpoint, body, isRetry = false, retryCount = 0) {
        const maxRetries = this.config.REQUEST_MAX_RETRIES || 3;
        const baseDelay = this.config.REQUEST_BASE_DELAY || 1000;

        try {
            // 构建 URL: /v1beta/models/{model}:{method}?key={apiKey}
            const url = `/v1beta/models/${model}:${endpoint}?key=${this.apiKey}`;
            
            const axiosConfig = {
                method: 'post',
                url: url,
                data: body
            };
            
            this._applySidecar(axiosConfig);
            const response = await this.axiosInstance.request(axiosConfig);
            
            return response.data;
        } catch (error) {
            // 处理重试
            if (isRetryableNetworkError(error) && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                logger.warn(`[Gemini API Key] Retry ${retryCount + 1}/${maxRetries} after ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApi(model, endpoint, body, true, retryCount + 1);
            }
            
            throw error;
        }
    }

    /**
     * 生成内容 (非流式)
     */
    async generateContent(model, requestBody) {
        const geminiRequest = this._convertToGeminiRequest(requestBody);
        return await this.callApi(model, 'generateContent', geminiRequest);
    }

    /**
     * 流式生成内容
     */
    async *generateContentStream(model, requestBody) {
        const geminiRequest = this._convertToGeminiRequest(requestBody);
        
        // 构建流式 URL
        const url = `/v1beta/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;
        
        const axiosConfig = {
            method: 'post',
            url: url,
            data: geminiRequest,
            responseType: 'stream'
        };
        
        this._applySidecar(axiosConfig);
        
        const response = await this.axiosInstance.request(axiosConfig);
        
        for await (const chunk of response.data) {
            const lines = chunk.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') return;
                    
                    try {
                        yield JSON.parse(data);
                    } catch (e) {
                        logger.warn(`[Gemini API Key] Failed to parse stream chunk: ${data}`);
                    }
                }
            }
        }
    }

    /**
     * 列出可用模型
     */
    async listModels() {
        const url = `/v1beta/models?key=${this.apiKey}`;
        
        const axiosConfig = {
            method: 'get',
            url: url
        };
        
        this._applySidecar(axiosConfig);
        
        const response = await this.axiosInstance.request(axiosConfig);
        return response.data;
    }

    /**
     * 刷新 Token (API Key 模式不需要)
     */
    async refreshToken() {
        logger.info('[Gemini API Key] API Key mode does not require token refresh');
    }

    async forceRefreshToken() {
        await this.refreshToken();
    }

    isExpiryDateNear() {
        return false; // API Key 模式没有过期时间
    }
}

export default GeminiApiKeyService;