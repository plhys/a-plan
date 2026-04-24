/**
 * 用量查询服务
 * 用于处理各个提供商的授权文件用量查询
 */

import { getProviderPoolManager } from './service-manager.js';
import { serviceInstances } from '../providers/adapter.js';
import { MODEL_PROVIDER } from '../utils/common.js';

/**
 * 用量查询服务类
 * 提供统一的接口来查询各提供商的用量信息
 */
export class UsageService {
    constructor() {
        this.providerHandlers = {
            [MODEL_PROVIDER.GROK_CUSTOM]: this.getGrokUsage.bind(this),
            [MODEL_PROVIDER.OPENAI_CUSTOM]: this.getOpenAICustomUsage.bind(this),
        };
    }


    /**
     * 获取指定提供商的用量信息
     * @param {string} providerType - 提供商类型
     * @param {string} [uuid] - 可选的提供商实例 UUID
     * @returns {Promise<Object>} 用量信息
     */
    async getUsage(providerType, uuid = null) {
        const handler = this.providerHandlers[providerType];
        if (!handler) {
            throw new Error(`不支持的提供商类型: ${providerType}`);
        }
        return handler(uuid);
    }

    /**
     * 获取所有提供商的用量信息
     * @returns {Promise<Object>} 所有提供商的用量信息
     */
    async getAllUsage() {
        const results = {};
        const poolManager = getProviderPoolManager();
        
        for (const [providerType, handler] of Object.entries(this.providerHandlers)) {
            try {
                // 检查是否有号池配置
                if (poolManager) {
                    const pools = poolManager.getProviderPools(providerType);
                    if (pools && pools.length > 0) {
                        results[providerType] = [];
                        for (const pool of pools) {
                            try {
                                const usage = await handler(pool.uuid);
                                results[providerType].push({
                                    uuid: pool.uuid,
                                    usage
                                });
                            } catch (error) {
                                results[providerType].push({
                                    uuid: pool.uuid,
                                    error: error.message
                                });
                            }
                        }
                    }
                }
                
                // 如果没有号池配置，尝试获取单个实例的用量
                if (!results[providerType] || results[providerType].length === 0) {
                    const usage = await handler(null);
                    results[providerType] = [{ uuid: 'default', usage }];
                }
            } catch (error) {
                results[providerType] = [{ uuid: 'default', error: error.message }];
            }
        }
        
        return results;
    }

    /**
     * 获取 Grok 提供商的用量信息
     * @param {string} [uuid] - 可选的提供商实例 UUID
     * @returns {Promise<Object>} Grok 用量信息
     */
    async getGrokUsage(uuid = null) {
        const providerKey = uuid ? MODEL_PROVIDER.GROK_CUSTOM + uuid : MODEL_PROVIDER.GROK_CUSTOM;
        const adapter = serviceInstances[providerKey];
        
        if (!adapter) {
            throw new Error(`Grok 服务实例未找到: ${providerKey}`);
        }
        
        // 使用适配器的 getUsageLimits 方法
        if (typeof adapter.getUsageLimits === 'function') {
            const rawUsage = await adapter.getUsageLimits();
            return formatGrokUsage(rawUsage);
        }
        
        throw new Error(`Grok 服务实例不支持用量查询: ${providerKey}`);
    }

    /**
     * 获取 OpenAI 兼容模式的用量信息（本地记录）
     * @param {string} uuid - 提供商实例 UUID
     * @returns {Promise<Object>} 用量信息
     */
    async getOpenAICustomUsage(uuid = null) {
        const providerPoolManager = getProviderPoolManager();
        if (!providerPoolManager) {
            throw new Error('Provider pool manager not initialized');
        }

        // 从 provider pool 中获取用量数据
        const pools = providerPoolManager.providerPools?.[MODEL_PROVIDER.OPENAI_CUSTOM] || [];
        const provider = uuid ? pools.find(p => p.uuid === uuid) : pools[0];

        if (!provider) {
            throw new Error(`OpenAI Custom 服务实例未找到: ${uuid || 'default'}`);
        }

        const rawUsage = {
            usageCount: provider.usageCount || 0,
            errorCount: provider.errorCount || 0,
            lastUsed: provider.lastUsed,
            customName: provider.customName
        };

        return formatOpenAICustomUsage(rawUsage);
    }

    /**
     * 获取支持用量查询的提供商列表

     * @returns {Array<string>} 支持的提供商类型列表
     */
    getSupportedProviders() {
        return Object.keys(this.providerHandlers);
    }
}

// 导出单例实例
export const usageService = new UsageService();

/**
 * 格式化 Grok 用量信息为易读格式（映射到 Kiro 数据结构）
 * @param {Object} usageData - 原始用量数据
 * @returns {Object} 格式化后的用量信息
 */
export function formatGrokUsage(usageData) {
    if (!usageData) {
        return null;
    }

    const result = {
        // 基本信息 - 映射到 Kiro 结构
        daysUntilReset: null,
        nextDateReset: null,
        
        // 订阅信息
        subscription: {
            title: 'Grok Custom',
            type: 'grok-custom',
            upgradeCapability: null,
            overageCapability: null
        },
        
        // 用户信息
        user: {
            email: null,
            userId: null
        },
        
        // 用量明细
        usageBreakdown: []
    };

    // Grok 返回的数据结构已在 core 中预处理：{ remainingTokens, remainingQueries, totalQueries, totalLimit, usedQueries, unit, ... }
    if (usageData.totalLimit !== undefined && usageData.usedQueries !== undefined) {
        const isTokens = usageData.unit === 'tokens';
        const item = {
            resourceType: 'TOKEN_USAGE',
            displayName: isTokens ? 'Remaining Tokens' : 'Remaining Queries',
            displayNamePlural: isTokens ? 'Remaining Tokens' : 'Remaining Queries',
            unit: usageData.unit || 'queries',
            currency: null,
            
            // 使用从 core 传出的计算好的值
            currentUsage: usageData.usedQueries, 
            usageLimit: usageData.totalLimit, 
            
            nextDateReset: null,
            freeTrial: null,
            bonuses: []
        };
        
        result.usageBreakdown.push(item);
    } else if (usageData.remainingTokens !== undefined) {
        const item = {
            resourceType: 'TOKEN_USAGE',
            displayName: 'Remaining Tokens',
            displayNamePlural: 'Remaining Tokens',
            unit: 'tokens',
            currency: null,
            
            currentUsage: 0, 
            usageLimit: usageData.remainingTokens, 
            
            nextDateReset: null,
            freeTrial: null,
            bonuses: []
        };
        
        result.usageBreakdown.push(item);
    }

    return result;
}

/**
 * 格式化 OpenAI 兼容模式用量信息为易读格式
 * @param {Object} usageData - 原始用量数据（本地记录）
 * @returns {Object} 格式化后的用量信息
 */
export function formatOpenAICustomUsage(usageData) {
    if (!usageData) {
        return null;
    }

    const result = {
        daysUntilReset: null,
        nextDateReset: null,
        
        subscription: {
            title: usageData.customName || 'OpenAI Custom',
            type: 'openai-custom',
            upgradeCapability: null,
            overageCapability: null
        },
        
        user: {
            email: null,
            userId: null
        },
        
        usageBreakdown: []
    };

    const usageCount = usageData.usageCount || 0;
    const errorCount = usageData.errorCount || 0;
    
    // 添加请求次数统计
    const requestItem = {
        resourceType: 'REQUEST_COUNT',
        displayName: 'API Requests',
        displayNamePlural: 'API Requests',
        unit: 'requests',
        currency: null,
        currentUsage: usageCount,
        usageLimit: null,
        nextDateReset: null,
        freeTrial: null,
        bonuses: []
    };
    result.usageBreakdown.push(requestItem);

    // 添加错误次数统计
    if (errorCount > 0) {
        const errorItem = {
            resourceType: 'ERROR_COUNT',
            displayName: 'Error Count',
            displayNamePlural: 'Error Count',
            unit: 'errors',
            currency: null,
            currentUsage: errorCount,
            usageLimit: null,
            nextDateReset: null,
            freeTrial: null,
            bonuses: []
        };
        result.usageBreakdown.push(errorItem);
    }

    // 添加最后使用时间
    if (usageData.lastUsed) {
        result.lastUsed = usageData.lastUsed;
    }

    return result;
}

/*
 * @param {Object} usageData - 原始用量数据
 * @returns {Object} 格式化后的用量信息
 */
export function formatCodexUsage(usageData) {
    if (!usageData) {
        return null;
    }

    const result = {
        // 基本信息 - 映射到 Kiro 结构
        daysUntilReset: null,
        nextDateReset: null,
        
        // 订阅信息
        subscription: {
            title: usageData.raw?.planType ? `Codex (${usageData.raw.planType})` : 'Codex OAuth',
            type: 'openai-codex-oauth',
            upgradeCapability: null,
            overageCapability: null
        },
        
        // 用户信息
        user: {
            email: null,
            userId: null
        },
        
        // 用量明细
        usageBreakdown: []
    };

    // 从 raw.rateLimit 提取重置时间
    if (usageData.raw?.rateLimit?.primaryWindow?.resetAt) {
        const resetTimestamp = usageData.raw.rateLimit.primaryWindow.resetAt;
        result.nextDateReset = new Date(resetTimestamp * 1000).toISOString();
        // 计算距离重置的天数
        const resetDate = new Date(resetTimestamp * 1000);
        const now = new Date();
        const diffTime = resetDate.getTime() - now.getTime();
        result.daysUntilReset = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // 解析模型配额信息
    if (usageData.models && typeof usageData.models === 'object') {
        for (const [modelName, modelInfo] of Object.entries(usageData.models)) {
            // Codex 返回的数据结构：{ remaining, resetTime, resetTimeRaw }
            // remaining 是 0-1 之间的比例值，表示剩余配额百分比
            const remainingPercent = typeof modelInfo.remaining === 'number' ? modelInfo.remaining : 1;
            const usedPercent = 1 - remainingPercent;
            
            const item = {
                resourceType: 'MODEL_USAGE',
                displayName: modelInfo.displayName || modelName,
                displayNamePlural: modelInfo.displayName || modelName,
                unit: 'quota',
                currency: null,
                
                // 当前用量 - Codex 返回的是剩余比例，转换为已用比例（百分比形式）
                currentUsage: Math.round(usedPercent * 100),
                usageLimit: 100, // 以百分比表示，总量为 100%
                
                // 超额信息
                currentOverages: 0,
                overageCap: 0,
                overageRate: null,
                overageCharges: 0,
                
                // 下次重置时间
                nextDateReset: modelInfo.resetTimeRaw ? new Date(modelInfo.resetTimeRaw * 1000).toISOString() :
                               (modelInfo.resetTime ? new Date(modelInfo.resetTime).toISOString() : null),
                
                // 免费试用信息
                freeTrial: null,
                
                // 奖励信息
                bonuses: [],

                // 额外的 Codex 特有信息
                modelName: modelName,
                remaining: remainingPercent,
                remainingPercent: Math.round(remainingPercent * 100), // 剩余百分比
                resetTime: modelInfo.resetTime || '--',
                resetTimeRaw: modelInfo.resetTimeRaw || modelInfo.resetTime || null,
                
                // 注入 raw 窗口信息以便前端使用
                rateLimit: usageData.raw?.rateLimit
            };

            result.usageBreakdown.push(item);
        }
    }

    return result;
}
