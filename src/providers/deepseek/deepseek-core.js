import { OpenAIApiService } from '../openai/openai-core.js';
import logger from '../../utils/logger.js';
import axios from 'axios';

/**
 * DeepSeek 独立服务核心逻辑
 * 继承自 OpenAI 核心，但支持 DeepSeek 特有的余额检查和凭证获取
 */
export class DeepSeekApiService extends OpenAIApiService {
    constructor(config) {
        // DeepSeek 官方 API 基础地址
        const dsConfig = {
            ...config,
            OPENAI_BASE_URL: config.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
            OPENAI_API_KEY: config.DEEPSEEK_API_KEY
        };
        super(dsConfig);
    }

    /**
     * 获取用量限制/余额 (DeepSeek 特有逻辑)
     */
    async getUsageLimits() {
        try {
            const response = await axios.get(`${this.config.OPENAI_BASE_URL}/user/balance`, {
                headers: { 'Authorization': `Bearer ${this.config.OPENAI_API_KEY}` }
            });
            
            if (response.data && response.data.is_available) {
                const balance = response.data.balance_infos[0];
                return {
                    total: balance.total_balance,
                    used: balance.used_balance,
                    remaining: balance.total_balance - balance.used_balance,
                    currency: balance.currency
                };
            }
        } catch (error) {
            logger.warn(`[DeepSeek] Failed to fetch balance: ${error.message}`);
        }
        return null;
    }

    /**
     * 独立的健康检查模型
     */
    static get defaultModel() {
        return 'deepseek-chat';
    }
}
