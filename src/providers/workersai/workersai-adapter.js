// 注意：不能从 '../adapter.js' 导入，会导致循环依赖
// 直接在本地定义基类

export class ApiServiceAdapter {
    constructor() {
        if (new.target === ApiServiceAdapter) {
            throw new TypeError("Cannot construct ApiServiceAdapter instances directly");
        }
    }

    async generateContent(model, requestBody) {
        throw new Error("Method 'generateContent()' must be implemented.");
    }

    async *generateContentStream(model, requestBody) {
        throw new Error("Method 'generateContentStream()' must be implemented.");
    }

    async listModels() {
        throw new Error("Method 'listModels()' must be implemented.");
    }

    async refreshToken() {
        throw new Error("Method 'refreshToken()' must be implemented.");
    }

    async forceRefreshToken() {
        throw new Error("Method 'forceRefreshToken()' must be implemented.");
    }

    isExpiryDateNear() {
        throw new Error("Method 'isExpiryDateNear()' must be implemented.");
    }
}

import { WorkersAIApiService } from './workersai-core.js';

/**
 * Workers AI API 服务适配器
 * 将 Workers AI 响应转换为 A-Plan 期望的格式
 */
export class WorkersAIApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.workersAIApiService = new WorkersAIApiService(config);
    }

    /**
     * 生成内容
     * @param {string} model - 模型名称
     * @param {object} requestBody - 请求体
     * @returns {Promise<object>} - API 响应
     */
    async generateContent(model, requestBody) {
        return this.workersAIApiService.generateContent(model, requestBody);
    }

    /**
     * 流式生成内容
     * @param {string} model - 模型名称
     * @param {object} requestBody - 请求体
     * @returns {AsyncGenerator} - 流式响应
     */
    async *generateContentStream(model, requestBody) {
        const stream = this.workersAIApiService.generateContentStream(model, requestBody);
        yield* stream;
    }

    /**
     * 获取模型列表
     * @returns {Promise<object>} - 模型列表
     */
    async listModels() {
        return this.workersAIApiService.listModels();
    }

    /**
     * 刷新 Token（Workers AI 不需要）
     */
    async refreshToken() {
        return Promise.resolve();
    }

    /**
     * 强制刷新 Token（Workers AI 不需要）
     */
    async forceRefreshToken() {
        return Promise.resolve();
    }

    /**
     * Token 是否即将过期（Workers AI 不需要）
     */
    isExpiryDateNear() {
        return false;
    }
}