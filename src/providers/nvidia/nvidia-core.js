import axios from 'axios';
import logger from '../../utils/logger.js';
import * as http from 'http';
import * as https from 'https';
import { configureAxiosProxy, configureTLSSidecar } from '../../utils/proxy-utils.js';
import { isRetryableNetworkError, MODEL_PROVIDER } from '../../utils/common.js';

export class NvidiaApiService {
    constructor(config) {
        if (!config.NVIDIA_API_KEY) {
            throw new Error("NVIDIA API Key is required for NvidiaApiService.");
        }
        this.config = config;
        this.apiKey = config.NVIDIA_API_KEY;
        this.baseUrl = config.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
        this.useSystemProxy = config?.USE_SYSTEM_PROXY_NVIDIA ?? false;

        const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100, maxFreeSockets: 5, timeout: 120000 });
        const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100, maxFreeSockets: 5, timeout: 120000 });

        const axiosConfig = {
            baseURL: this.baseUrl,
            httpAgent,
            httpsAgent,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
        };
        
        if (!this.useSystemProxy) axiosConfig.proxy = false;
        configureAxiosProxy(axiosConfig, config, config.MODEL_PROVIDER || MODEL_PROVIDER.NVIDIA_NIM);
        this.axiosInstance = axios.create(axiosConfig);
    }

    _applySidecar(axiosConfig) {
        return configureTLSSidecar(axiosConfig, this.config, this.config.MODEL_PROVIDER || MODEL_PROVIDER.NVIDIA_NIM, this.baseUrl);
    }

    async callApi(endpoint, body, isRetry = false, retryCount = 0) {
        const maxRetries = this.config.REQUEST_MAX_RETRIES || 3;
        const baseDelay = this.config.REQUEST_BASE_DELAY || 1000;

        try {
            const axiosConfig = { method: 'post', url: endpoint, data: body };
            this._applySidecar(axiosConfig);
            const response = await this.axiosInstance.request(axiosConfig);
            return response.data;
        } catch (error) {
            const status = error.response?.status;
            if (status === 401 || status === 403) throw error;
            if ((status === 429 || (status >= 500 && status < 600) || isRetryableNetworkError(error)) && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApi(endpoint, body, isRetry, retryCount + 1);
            }
            throw error;
        }
    }

    async *streamApi(endpoint, body, isRetry = false, retryCount = 0) {
        const maxRetries = this.config.REQUEST_MAX_RETRIES || 3;
        const baseDelay = this.config.REQUEST_BASE_DELAY || 1000;
        const streamRequestBody = { ...body, stream: true };

        try {
            const axiosConfig = { method: 'post', url: endpoint, data: streamRequestBody, responseType: 'stream' };
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
                        if (jsonData === '[DONE]') return;
                        try { yield JSON.parse(jsonData); } catch (e) { logger.warn("[NvidiaApiService] Failed to parse stream chunk JSON:", e.message); }
                    }
                }
            }
        } catch (error) {
            const status = error.response?.status;
            if (status === 401 || status === 403) throw error;
            if ((status === 429 || (status >= 500 && status < 600) || isRetryableNetworkError(error)) && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                await new Promise(resolve => setTimeout(resolve, delay));
                yield* this.streamApi(endpoint, body, isRetry, retryCount + 1);
                return;
            }
            throw error;
        }
    }

    async generateContent(model, requestBody) {
        if (requestBody._monitorRequestId) delete requestBody._monitorRequestId;
        if (requestBody._requestBaseUrl) delete requestBody._requestBaseUrl;
        return this.callApi('/chat/completions', requestBody);
    }

    async *generateContentStream(model, requestBody) {
        if (requestBody._monitorRequestId) delete requestBody._monitorRequestId;
        if (requestBody._requestBaseUrl) delete requestBody._requestBaseUrl;
        yield* this.streamApi('/chat/completions', requestBody);
    }

    async listModels() {
        const response = await this.axiosInstance.get('/models');
        return response.data;
    }
}
