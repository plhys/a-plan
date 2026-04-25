// 工具函数
import { t, getCurrentLanguage } from './i18n.js';
import { apiClient } from './auth.js';

/**
 * 获取所有支持的提供商配置列表
 * @param {string[]} supportedProviders - 已注册的提供商类型列表
 * @returns {Object[]} 提供商配置对象数组
 */
/**
 * 获取所有基础提供商配置（母版）
 * @returns {Object[]} 基础提供商配置数组
 */
function getBaseProviderConfigs() {
    return [
        { 
            id: 'openai-custom', 
            name: 'OpenAI Custom', 
            icon: 'fa-microchip'
        },
    ];
}

/**
 * 获取所有支持的提供商配置列表
 * @param {string[]} supportedProviders - 已注册的提供商类型列表
 * @returns {Object[]} 提供商配置对象数组
 */
function getProviderConfigs(supportedProviders = []) {
    const baseConfigs = getBaseProviderConfigs();

    const result = [];
    const usedIds = new Set();

    // 1. 处理 supportedProviders 中匹配基础配置的类型
    baseConfigs.forEach(config => {
        const isSupported = supportedProviders.includes(config.id);
        result.push({ ...config, visible: isSupported });
        usedIds.add(config.id);
    });

    // 2. 处理带有后缀的自定义类型 (例如 openai-custom-test)
    supportedProviders.forEach(providerId => {
        if (usedIds.has(providerId)) return;

        // 查找匹配的前缀
        const baseConfig = baseConfigs.find(bc => providerId.startsWith(bc.id + '-'));
        if (baseConfig) {
            const suffix = providerId.substring(baseConfig.id.length + 1);
            result.push({
                ...baseConfig,
                id: providerId,
                name: `${baseConfig.name} (${suffix})`,
                visible: true
            });
            usedIds.add(providerId);
        }
    });

    return result;
}

/**
 * 格式化运行时间
 * @param {number} seconds - 秒数
 * @returns {string} 格式化的时间字符串
 */
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (getCurrentLanguage() === 'en-US') {
        return `${days}d ${hours}h ${minutes}m ${secs}s`;
    }
    return `${days}天 ${hours}小时 ${minutes}分 ${secs}秒`;
}

/**
 * HTML转义
 * @param {string} text - 要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 显示提示消息
 * @param {string} title - 提示标题 (可选，旧接口为 message)
 * @param {string} message - 提示消息
 * @param {string} type - 消息类型 (info, success, error)
 */
function showToast(title, message, type = 'info') {
    // 兼容旧接口 (message, type)
    if (arguments.length === 2 && (message === 'success' || message === 'error' || message === 'info' || message === 'warning')) {
        type = message;
        message = title;
        title = t(`common.${type}`);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(title)}</div>
        <div>${escapeHtml(message)}</div>
    `;

    // 获取toast容器
    const toastContainer = document.getElementById('toastContainer') || document.querySelector('.toast-container');
    if (toastContainer) {
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

/**
 * 获取字段显示文案
 * @param {string} key - 字段键
 * @returns {string} 显示文案
 */
function getFieldLabel(key) {
    const labelMap = {
        'customName': t('modal.provider.customName') + ' ' + t('config.optional'),
        'checkModelName': t('modal.provider.checkModelName') + ' ' + t('config.optional'),
        'checkHealth': t('modal.provider.healthCheckLabel'),
        'concurrencyLimit': t('modal.provider.concurrencyLimit') + ' ' + t('config.optional'),
        'queueLimit': t('modal.provider.queueLimit') + ' ' + t('config.optional'),
        'OPENAI_API_KEY': 'OpenAI API Key',
        'OPENAI_BASE_URL': 'OpenAI Base URL',
        'CLAUDE_API_KEY': 'Claude API Key',
        'CLAUDE_BASE_URL': 'Claude Base URL',
        'PROJECT_ID': t('modal.provider.field.projectId'),
        'GROK_COOKIE_TOKEN': t('modal.provider.field.ssoToken'),
        'GROK_CF_CLEARANCE': t('modal.provider.field.cfClearance'),
        'GROK_USER_AGENT': t('modal.provider.field.userAgent'),
        'GEMINI_BASE_URL': 'Gemini Base URL',
        'GROK_BASE_URL': t('modal.provider.field.grokBaseUrl'),
        'FORWARD_API_KEY': 'Forward API Key',
        'FORWARD_BASE_URL': 'Forward Base URL',
        'FORWARD_HEADER_NAME': t('modal.provider.field.headerName'),
        'FORWARD_HEADER_VALUE_PREFIX': t('modal.provider.field.headerPrefix'),
        'USE_SYSTEM_PROXY_FORWARD': t('modal.provider.field.useSystemProxy')
    };
    
    return labelMap[key] || key;
}

/**
 * 获取提供商类型的字段配置
 * @param {string} providerType - 提供商类型
 * @returns {Array} 字段配置数组
 */
function getProviderTypeFields(providerType) {
    // 基础配置字段定义 - 仅保留 OpenAI Custom
    const fieldConfigs = {
        'openai-custom': [
            {
                id: 'OPENAI_API_KEY',
                label: t('modal.provider.field.apiKey'),
                type: 'password',
                placeholder: 'sk-...'
            },
            {
                id: 'OPENAI_BASE_URL',
                label: 'OpenAI Base URL',
                type: 'text',
                placeholder: 'https://api.openai.com/v1'
            }
        ]
    };

    // 1. 尝试精确匹配
    if (fieldConfigs[providerType]) {
        return fieldConfigs[providerType];
    }

    // 2. 尝试匹配前缀 (例如 openai-custom-test -> openai-custom)
    for (const baseType in fieldConfigs) {
        if (providerType.startsWith(baseType + '-')) {
            return fieldConfigs[baseType];
        }
    }

    return [];
}

/**
 * 调试函数：获取当前提供商统计信息
 * @param {Object} providerStats - 提供商统计对象
 * @returns {Object} 扩展的统计信息
 */
function getProviderStats(providerStats) {
    return {
        ...providerStats,
        // 添加计算得出的统计信息
        successRate: providerStats.totalRequests > 0 ? 
            ((providerStats.totalRequests - providerStats.totalErrors) / providerStats.totalRequests * 100).toFixed(2) + '%' : '0%',
        avgUsagePerProvider: providerStats.activeProviders > 0 ? 
            Math.round(providerStats.totalRequests / providerStats.activeProviders) : 0,
        healthRatio: providerStats.totalAccounts > 0 ? 
            (providerStats.healthyProviders / providerStats.totalAccounts * 100).toFixed(2) + '%' : '0%'
    };
}

/**
 * 通用 API 请求函数
 * @param {string} url - API 端点 URL
 * @param {Object} options - fetch 选项
 * @returns {Promise<any>} 响应数据
 */
async function apiRequest(url, options = {}) {
    // 如果 URL 以 /api 开头，去掉它（因为 apiClient.request 会自动添加）
    const endpoint = url.startsWith('/api') ? url.slice(4) : url;
    return apiClient.request(endpoint, options);
}

/**
 * 复制文本到剪贴板（带兼容性回退）
 * @param {string} text - 要复制的文本
 * @returns {Promise<boolean>} 是否成功
 */
async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.warn('navigator.clipboard failed, trying fallback:', err);
        }
    }

    // Fallback: 使用 textarea 模拟复制
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    } catch (err) {
        console.error('Fallback copy failed:', err);
        return false;
    }
}

// 导出所有工具函数
export {
    formatUptime,
    escapeHtml,
    showToast,
    getFieldLabel,
    getProviderTypeFields,
    getProviderConfigs,
    getBaseProviderConfigs,
    getProviderStats,
    apiRequest,
    copyToClipboard
};