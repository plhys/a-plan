/**
 * TLS Sidecar 工具模块
 * 提供 TLS 指纹混淆功能
 */

import logger from './logger.js';
import { getTLSSidecar } from './tls-sidecar.js';

/**
 * 检查指定的提供商是否启用了 TLS Sidecar（支持前缀匹配）
 * @param {Object} config - 配置对象
 * @param {string} providerType - 提供商类型
 * @returns {boolean} 是否启用 TLS Sidecar
 */
export function isTLSSidecarEnabledForProvider(config, providerType) {
    if (!config || !config.TLS_SIDECAR_ENABLED || !config.TLS_SIDECAR_ENABLED_PROVIDERS) {
        return false;
    }

    const enabledProviders = config.TLS_SIDECAR_ENABLED_PROVIDERS;
    if (!Array.isArray(enabledProviders)) {
        return false;
    }

    // 1. 尝试精确匹配
    if (enabledProviders.includes(providerType)) {
        return true;
    }

    // 2. 尝试前缀匹配
    return enabledProviders.some(p => providerType.startsWith(p + '-'));
}

/**
 * 为 axios 配置 TLS Sidecar
 * @param {Object} axiosConfig - axios 配置对象
 * @param {Object} config - 应用配置对象
 * @param {string} providerType - 提供商类型
 * @param {string} [defaultBaseUrl] - 默认基础 URL（用于处理相对路径）
 * @returns {Object} 更新后的 axios 配置
 */
export function configureTLSSidecar(axiosConfig, config, providerType, defaultBaseUrl = null) {
    const sidecar = getTLSSidecar();
    if (sidecar.isReady() && isTLSSidecarEnabledForProvider(config, providerType)) {
        const proxyUrl = config.TLS_SIDECAR_PROXY_URL || null;
        
        // 处理相对路径
        if (axiosConfig.url && !axiosConfig.url.startsWith('http')) {
            const baseUrl = (axiosConfig.baseURL || defaultBaseUrl || '').replace(/\/$/, '');
            if (baseUrl) {
                const path = axiosConfig.url.startsWith('/') ? axiosConfig.url : '/' + axiosConfig.url;
                axiosConfig.url = baseUrl + path;
            }
        }
        
        sidecar.wrapAxiosConfig(axiosConfig, proxyUrl);
    }
    return axiosConfig;
}

/**
 * 为 axios 配置 TLS Sidecar（兼容旧接口）
 * @param {Object} axiosConfig - axios 配置对象
 * @param {Object} config - 应用配置对象
 * @param {string} providerType - 提供商类型
 * @returns {Object} 更新后的 axios 配置
 */
export function configureAxiosProxy(axiosConfig, config, providerType) {
    return configureTLSSidecar(axiosConfig, config, providerType);
}